# Training Plans (Planning Section) — Design

**Requirements:** `requirements/training-plans-requirements.md`
**Status:** Approved design, not yet implemented

This document describes how the Planning section is built: domain model, migration, scaffolding engine, goal flow-down, API, and frontend design. Section references (FR-n) point at the requirements doc.

---

## 1. Overview

The feature adds a macrocycle layer above the existing week-by-week planner:

```text
goal_races ──┐
             ▼
      training_plans ──< mesocycles ──< training_weeks (existing)
             │                               │
             └──< plan_goals                 └──< planned_workouts / week_goals (existing)
```

Creating or editing a plan runs a single idempotent **scaffolding** pass that materializes weeks in the plan's range and writes plan-owned structural fields onto them. Everything below the week (workouts, goals) is untouched by the plan layer and continues to be managed by the existing week planner, which now reads plan context.

---

## 2. Domain Model

### 2.1 New tables

All follow the `week_goals` conventions: TEXT UUID primary keys, `athlete_account_id` scoping with `ON DELETE CASCADE`, `created_at`/`updated_at` with `CURRENT_TIMESTAMP` defaults, plain TEXT columns for enums validated in the schema layer.

```sql
CREATE TABLE goal_races (
  id                  TEXT PRIMARY KEY,
  athlete_account_id  TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  race_date           DATE NOT NULL,
  distance            TEXT NOT NULL DEFAULT 'half_marathon',  -- 5k|10k|half_marathon|marathon|other
  distance_miles      REAL,                                   -- required when distance='other'
  target_time         INTEGER,                                -- seconds; NULL = just finish
  priority            TEXT NOT NULL DEFAULT 'A',              -- A|B|C
  location            TEXT NOT NULL DEFAULT '',
  altitude_context    TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE training_plans (
  id                  TEXT PRIMARY KEY,
  athlete_account_id  TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  goal_race_id        TEXT REFERENCES goal_races(id) ON DELETE SET NULL,
  start_date          DATE NOT NULL,   -- normalized to Monday via week_start_for
  end_date            DATE NOT NULL,   -- normalized to Sunday
  status              TEXT NOT NULL DEFAULT 'active',  -- active|completed|archived
  notes               TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mesocycles (
  id                       TEXT PRIMARY KEY,
  training_plan_id         TEXT NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  athlete_account_id       TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  order_index              INTEGER NOT NULL,     -- unique per plan
  name                     TEXT NOT NULL DEFAULT '',
  phase                    TEXT NOT NULL,        -- base|build|specific|taper|race|recovery|maintenance
  start_date               DATE NOT NULL,        -- Monday
  end_date                 DATE NOT NULL,        -- Sunday
  target_mileage_start     REAL,
  target_mileage_end       REAL,
  long_run_start           REAL,
  long_run_end             REAL,
  down_week_cadence        INTEGER,              -- e.g. 4 = every 4th week; NULL = none
  down_week_reduction_pct  REAL NOT NULL DEFAULT 20,
  notes                    TEXT NOT NULL DEFAULT '',
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (training_plan_id, order_index)
);

CREATE TABLE plan_goals (
  id                  TEXT PRIMARY KEY,
  training_plan_id    TEXT NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  athlete_account_id  TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  category            TEXT NOT NULL,   -- race_time|peak_weekly_mileage|weekly_mileage_progression|long_run_progression|consistency|custom
  label               TEXT NOT NULL,
  target_value        REAL,
  unit                TEXT NOT NULL DEFAULT 'custom',  -- WeekGoalUnit values + 'time'
  flows_down          INTEGER NOT NULL DEFAULT 1,
  notes               TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Design decisions:

- **Target pace is derived**, not stored on `goal_races` — one source of truth (target_time / distance).
- **Mesocycles store explicit date ranges** rather than week counts, so week → mesocycle resolution is a plain date-range query. Week count is derived. The service validates that a plan's mesocycles are contiguous, non-overlapping, Monday-aligned, and exactly tile the plan range (FR-13).
- **Mileage progression is two endpoints with linear interpolation**, not a per-week array. The materialized per-week values live on `training_weeks.target_mileage`; a JSON array on the mesocycle would be a second source of truth.
- **`plan_goals` is a separate table**, not an extension of `week_goals`. `week_goals` has NOT NULL `training_week_id`/`week_start_date` and a week-evaluation engine (`evaluate_goal`) that is meaningless at plan scope; a nullable-FK overload would complicate every existing query.
- **No `draft` plan status.** Preview is stateless (§6), so a plan row only ever exists once applied.
- **No overlapping non-archived plans** per athlete, enforced in the service (409). `training_weeks.mesocycle_id` is a single FK; overlapping plans would fight over week ownership.
- `phase` drops the parent spec's `pre-block` and adds `build`.

### 2.2 Changes to `training_weeks`

```sql
ALTER TABLE training_weeks ADD COLUMN mesocycle_id           TEXT REFERENCES mesocycles(id) ON DELETE SET NULL;
ALTER TABLE training_weeks ADD COLUMN purpose                TEXT NOT NULL DEFAULT '';        -- WeekPurposeId
ALTER TABLE training_weeks ADD COLUMN purpose_source         TEXT NOT NULL DEFAULT 'manual';  -- manual|plan
ALTER TABLE training_weeks ADD COLUMN target_mileage         REAL;
ALTER TABLE training_weeks ADD COLUMN target_mileage_source  TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE training_weeks ADD COLUMN target_long_run_source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE training_weeks ADD COLUMN is_down_week           INTEGER NOT NULL DEFAULT 0;
```

- `purpose` uses the existing frontend `WeekPurposeId` values (`aerobic_build`, `maintain`, `down_week`, `workout_focus`, `long_run_focus`, `recovery`, `race_week`, `custom`), promoted to a backend enum in `schemas/planning.py`.
- `target_mileage` is the *intended* weekly volume (plan- or user-set). It is distinct from `planned_mileage`, which stays derived from scheduled workouts by `recalculate`.
- `target_long_run_source` governs the **existing** `target_long_run_distance` column.

### 2.3 Precedence model

Per-field `*_source` columns implement "manual edits always win" (FR-19):

- Scaffolding may write a field only when its source is `'plan'` **or** the field is empty/NULL (in which case it sets the source to `'plan'`).
- Any user write to the field via `PATCH /api/weeks/{id}` or `PUT /api/weeks/{id}/plan` flips its source to `'manual'`, permanently protecting it from re-scaffolds. (An explicit "re-sync this week from plan" action that flips fields back is a v2 could.)
- `purpose` and `is_down_week` are governed together by `purpose_source` — they describe one structural fact about the week.

Alternatives rejected: a JSON `plan_overrides` list (less queryable), and comparing `updated_at` vs a `scaffolded_at` timestamp (fragile — any unrelated week write would look like an override).

### 2.4 Deletion rules

| Deleted | Effect |
|---|---|
| `training_plan` | mesocycles CASCADE; `training_weeks.mesocycle_id` → NULL; weeks, workouts, goals never deleted |
| `training_plan` with `?clearScaffolding=true` | additionally resets `purpose`, `target_mileage`, `target_long_run_distance`, `is_down_week` on weeks where the field's source is still `'plan'` |
| mesocycle (via plan edit) | affected weeks unlinked, same field-reset rules |
| `goal_race` | `training_plans.goal_race_id` → NULL; plan survives as date-range plan |
| `athlete_account` | everything cascades (existing pattern) |

---

## 3. Migration Plan

One migration: `backend/migrations/20260702_007_training_plans.sql` (next number after `20260629_006`). No JSONB needed, so no `.postgresql.sql` variant.

Contents: the four `CREATE TABLE`s, the `training_weeks` `ALTER`s, indexes (`ix_training_plans_athlete`, `ix_mesocycles_plan`, `ix_mesocycles_dates`, `ix_plan_goals_plan`, `ix_training_weeks_mesocycle`), and the **notes → purpose backfill**.

Backfill: today `save_week_plan` writes the week purpose as free text into `training_weeks.notes` (`week.notes = payload.purpose`, `backend/app/services/planning.py:615`), and the frontend parses it back with `purposeFromText(week.notes)` (`frontend/src/features/weekPlanner/planWeekDrafts.ts:484`). The migration:

```sql
UPDATE training_weeks SET purpose = <id>, purpose_source = 'manual', notes = ''
 WHERE lower(trim(notes)) = <known purpose label>;   -- one statement per label
```

Notes that don't exactly match a known label are left alone — `notes` becomes true free text again. Weeks planned before this feature keep `purpose_source='manual'` so scaffolding respects them.

Code touch list for the migration's sibling changes:

- `backend/app/models/planning.py`: new models `GoalRace`, `TrainingPlan`, `Mesocycle`, `PlanGoal`; new columns + relationships on `TrainingWeek`.
- `backend/app/schemas/planning.py`: enums (`RaceDistance`, `PlanStatus`, `MesocyclePhase`, `PlanGoalCategory`, `WeekPurpose`, `FieldSource`), request/response models (§6).
- `backend/app/services/plans.py`: **new module** — plan CRUD, validation, scaffolding engine, plan serialization. Keeps `services/planning.py` (~1700 lines) from growing further.
- `backend/app/api/routes/planning.py` (or a new `plans.py` router): thin routes.

---

## 4. Scaffolding Engine

The heart of the feature is one idempotent service function used by both preview and apply:

```python
def scaffold_plan(db, plan_spec, athlete_account_id, *, dry_run: bool) -> ScaffoldDiff
```

Create and update call it with `dry_run=False` inside the same transaction as the plan/mesocycle writes; the preview endpoints call it with `dry_run=True`.

Algorithm:

1. **Normalize and validate.** Snap `start_date` to Monday / `end_date` to Sunday (reuse `week_start_for`/`week_end_for`). Validate mesocycle tiling (FR-13) → 422. Validate no overlap with other non-archived plans → 409.
2. **Compute the week schedule.** For each mesocycle, enumerate its weeks. Mark down weeks from `down_week_cadence`, counted within the mesocycle (cadence 4 → mesocycle weeks 4, 8, …). The race mesocycle's final week is the race week.
3. **Interpolate targets.** `target_mileage_start → target_mileage_end` linearly across the mesocycle's *non-down* weeks; a down week gets `previous non-down target × (1 − reduction_pct/100)`. Long-run targets interpolate identically when endpoints are set. Taper weeks descend by the same interpolation (start high, end low).
4. **Default purposes from phase** (stored per week, freely editable afterward):

   | phase | default week purpose |
   |---|---|
   | base, build | `aerobic_build` |
   | specific | `workout_focus` |
   | taper | `down_week` (race week itself: `race_week`) |
   | race | `race_week` |
   | recovery | `recovery` |
   | maintenance | `maintain` |

   Down weeks in any phase get `purpose='down_week'` plus `is_down_week=1`.
5. **Apply per week.** `get_or_create_week` materializes virtual weeks across the whole range (deliberate per the eager-scaffolding decision; a 16-week plan creates at most 16 rows). Then write `mesocycle_id` unconditionally, and each scaffolded field under the precedence rule (§2.3). **Never** create, move, rescale, or delete workouts or week goals (FR-18).
6. **Unlink out-of-range weeks.** Weeks previously linked to this plan but no longer in range (date shift, shrink): set `mesocycle_id=NULL` and reset scaffolded fields only where the source is still `'plan'`.
7. Nothing else is recalculated — `planned_mileage` stays workout-derived.

**Plan edit = re-run with the new spec.** Because writes are gated on `*_source='plan'`, re-scaffolding is naturally non-destructive. Date shifts do **not** move planned workouts (out of scope, FR-24); the diff flags weeks whose workouts now sit outside the plan or clash with new targets.

### 4.1 ScaffoldDiff

Returned by preview and apply (apply returns the diff it actually performed, guaranteeing preview/apply parity when state hasn't changed — acceptance §7.3):

```jsonc
{
  "weeks": [
    {
      "weekStartDate": "2026-03-02",
      "action": "create | annotate | update | skip_overridden | unlink",
      "changes": [{ "field": "targetMileage", "from": null, "to": 34 }],
      "warnings": ["Week has 5 planned workouts totaling 42 mi; plan target is 34 mi"]
    }
  ],
  "warnings": ["3 weeks have manual targets that will be preserved"]
}
```

---

## 5. Goal Flow-Down

Principle: **plan goals flow into week scalar targets; the existing week-goal derivation converts targets into `WeekGoal` rows at week-planning time.** No parallel goal pipeline, and no eager creation of `WeekGoal` rows for every future week (avoids goal spam and keeps `derive_week_goals` semantics intact).

| plan goal category | flow-down |
|---|---|
| `weekly_mileage_progression`, `peak_weekly_mileage` | materialized as `training_weeks.target_mileage` by scaffolding |
| `long_run_progression` | materialized as `training_weeks.target_long_run_distance` |
| `race_time` | no weekly rows; context only (race chip, countdown, derived target pace) |
| `consistency`, `custom` | display-only at plan level in v1 |

Backend change: `default_goals_for_week` (`backend/app/services/planning.py:909`) gains one branch — when the week has no workouts but has a `target_mileage`, seed the mileage goal from it (source `derived_from_plan`) instead of the prior-week heuristic. `derive_week_goals`'s existing replace-derived / keep-manual-by-category behavior is reused unchanged.

Plan-goal progress (FR-29) is computed read-time in the plan serializer from week aggregates (peak actual week so far, % of completed weeks within target) — no evaluation table in v1.

---

## 6. API Design

Routes are thin and follow the existing pattern (`require_current_profile` dependency, service functions, `ApiModel` camelCase schemas). This supersedes parent spec §10.5 `/api/training-blocks`.

```http
GET    /api/goal-races
POST   /api/goal-races
PATCH  /api/goal-races/{id}
DELETE /api/goal-races/{id}

GET    /api/plans                     # list: PlanSummary[]
POST   /api/plans/preview             # body: PlanSpec → ScaffoldPreview (no writes)
POST   /api/plans                     # body: PlanSpec → PlanRead (create + scaffold, one tx)
GET    /api/plans/{id}                # PlanRead: plan, mesocycles, planGoals, weekSummaries
POST   /api/plans/{id}/preview        # body: PlanSpec → ScaffoldPreview for an edit
PUT    /api/plans/{id}                # body: PlanSpec → PlanRead (replace + re-scaffold)
PATCH  /api/plans/{id}                # metadata only: name, description, notes, status
DELETE /api/plans/{id}?clearScaffolding=false
```

Key schemas:

- **PlanSpec** (request): plan fields + nested ordered `mesocycles[]` + `planGoals[]`, bulk-saved atomically — mirrors the `PUT /api/weeks/{id}/plan` bulk pattern and lets the server validate tiling in one place.
- **PlanRead**: plan + mesocycles + plan goals (with read-time progress) + `weekSummaries[]` (`weekStartDate`, `mesocycleId`, `purpose`, `isDownWeek`, `targetMileage`, `plannedMileage`, `actualMileage`, `weekState`, `hasManualOverrides`) — everything the Plan tab timeline needs in one call.
- **ScaffoldPreview**: the ScaffoldDiff (§4.1).

Errors: plan overlap → 409; invalid tiling / non-Monday alignment → 422; unknown race FK → 404.

Rationale for stateless preview: previews write nothing and carry no server state, so they can't leak or go stale; apply recomputes the diff. The alternative (draft plan rows + `/apply`) adds cleanup burden for no benefit.

Changes to existing endpoints:

- `TrainingWeekRead` (`serialize_week`): add `purpose`, `targetMileage`, `isDownWeek`, and nullable `planContext`:

  ```jsonc
  "planContext": {
    "planId": "…", "planName": "Fall Half Plan",
    "mesocycleId": "…", "phase": "build", "mesocycleName": "Build",
    "weekIndexInMesocycle": 3, "mesocycleWeekCount": 5,
    "raceName": "Portland Half", "raceDate": "2026-10-18",
    "weeksToRace": 9, "targetPaceSecondsPerMile": 389
  }
  ```

- `PlanWeekSave` / `TrainingWeekPatch`: add structured `purpose` (+ `customPurpose`) and separate `notes`; `save_week_plan` stops writing the purpose into `notes` and flips the relevant `*_source` columns to `'manual'` on user writes.
- `GET /api/training-timeline`: response gains `plans: [{id, name, startDate, endDate, status, race: {name, date} | null, mesocycles: [{id, phase, name, startDate, endDate}]}]`. Per-week mileage for the Plan tab chart comes from `GET /api/plans/{id}`, keeping the timeline payload small.

---

## 7. Frontend Design

New feature folder `frontend/src/features/plan/`, replacing the placeholder branch in `App.tsx` (~line 755). Reuses the existing drawer/editor-panel shell (as in `PlanWeekDrawer`), card/chip/token styles from `styles.css`, and Lucide icons.

### 7.1 Information architecture

```text
Plan tab
├── Empty state (no plans)
├── Plan overview (current/upcoming plan)
│   ├── Header: name · race chip · countdown · target time/pace · [Edit] [⋯]
│   ├── Timeline: mesocycle bands over per-week bars
│   ├── Mesocycle cards
│   └── Plan goals card
├── Creation/edit wizard (drawer)
└── Past plans list (read-only)
```

### 7.2 Plan overview

```text
+--------------------------------------------------------------------------+
| Fall Half Plan            [🏁] Portland Half · Oct 18 · 15 wks to go     |
|                           Target 1:24:59 (6:29/mi)       [Edit] [...]    |
+--------------------------------------------------------------------------+
|  BASE (4w)     |  BUILD (5w)      | SPECIFIC (4w)  | TAPER (1w) | RACE   |
|  ▂ ▃ ▃ ▂*        ▄ ▄ ▅ ▅ ▂*        ▅ ▆ ▆ ▃*         ▄            ▂ 🏁    |
|  bars: target (outline) vs planned (fill) vs actual (accent)             |
|  * down week    ▼ today marker    • "edited" dot on overridden weeks     |
+--------------------------------------------------------------------------+
| Mesocycle cards                          | Plan goals                    |
|  Base · Mar 2–Mar 29 · 28→34 mi/wk       |  Race 1:24:59                 |
|  down week every 4 · [Edit structure]    |  Peak 48 mi/wk  · on track    |
+--------------------------------------------------------------------------+
```

- Each week column is clickable → switches to the Week tab with that week selected (reuses the existing week deep-link/selection state in `App.tsx`). Hover/tap shows a popover: purpose, target vs planned vs actual, down-week flag, "Plan this week" link.
- Weeks with manually overridden plan fields (`hasManualOverrides`) show a small "edited" dot (FR-34).
- Bars use theme tokens only (per the design system: token-based colors, no hardcoded tints); phase bands get muted background tints from tokens with the accent reserved for actuals.

### 7.3 Creation wizard (drawer, 5 steps)

Smart defaults throughout so "next–next–next" yields a sane plan.

1. **Goal** — segmented control: *Race plan* / *Date-range plan*. Race path: pick an existing goal race or inline-create one (name, date, distance, target time). Date path: start + end pickers.
2. **Structure** — suggested split computed backward from race date: race week 1; taper 2 weeks for marathon/half, 1 for ≤10k; specific ≈ 4; build ≈ 4–6; base absorbs the remainder (min 2; under 8 total weeks phases compress with a warning, FR-8). Editable ordered list with per-phase week steppers (must tile the range) and per-mesocycle down-week cadence (default every 4th; none in taper/race).
3. **Load** — baseline weekly mileage prefilled from recent actual weeks (reuse the comparison-mileage logic behind `suggestLoad`), peak weekly mileage, peak long run. The wizard distributes start/end targets per mesocycle: base ends ~80% of peak, build/specific reach peak, taper descends to ~50–60%.
4. **Goals** — checkbox list of plan goals derived from earlier steps (race time, peak mileage, mileage progression, long-run peak), all editable.
5. **Preview** — renders the ScaffoldPreview as a compact per-week table (week, phase, purpose, target, action) with warnings highlighted. Primary action "Create plan".

**Mesocycle editing** reopens the same drawer at step 2 pre-filled; the save path is preview → `PUT /api/plans/{id}`.

### 7.4 Empty state and past plans

Empty state: centered card — "No training plan yet", one-line pitch, primary "Create training plan", secondary "Add a goal race". If past plans exist but none is current: same card plus a "Previous plans" list (read-only overview on click).

### 7.5 Mobile (PWA)

The horizontal timeline becomes a vertical week list grouped under sticky mesocycle headers; overview cards stack; the wizard drawer goes full-screen (existing drawer responsive behavior).

### 7.6 Week-flow integration

- **PlanWeekDrawer / planWeekDrafts.ts**: `buildPlanWeekDraft` reads structured `week.purpose` (drop `purposeFromText(week.notes)`) and `week.planContext`. With plan context: purpose pre-selected from the scaffolded value; `suggestLoad` returns `{suggestedMileage: week.targetMileage, reason: "From plan: Build, week 3 of 5"}` with the prior-week heuristic as fallback; goal drafts anchor on the plan target; drawer header gains a phase chip ("Build · wk 3/5 · 9 wks to race").
- **WeekView / week-command-center**: plan-context strip — phase chip, race countdown, target vs planned vs actual mileage. Weeks outside any plan render exactly as today (FR-40).
- **types/domain.ts**: `TrainingWeek` gains `purpose`, `targetMileage`, `isDownWeek`, `planContext`; new `TrainingPlan`, `Mesocycle`, `GoalRace`, `PlanGoal`, `ScaffoldPreview` types.
- **Timeline picker** (`TrainingTimeRail`): can shade weeks by phase color from the new timeline `plans[]` payload (FR-41, should).

---

## 8. Backward Compatibility

- **Purpose/notes migration** (§3): unmatched notes stay as notes; matched ones become structured purposes with `manual` source, so pre-existing planned weeks are never overwritten by a later plan.
- **Virtual weeks**: the week API serves virtual (unmaterialized) weeks until first mutation. Scaffolding materializes weeks in a plan's range; everything outside plans keeps the virtual behavior.
- **No plan present**: every existing view and endpoint behaves exactly as today — new week fields are empty/defaults and `planContext` is null.

---

## 9. Testing Strategy

- **Scaffold idempotency**: applying the same PlanSpec twice yields zero changes the second time.
- **Precedence**: manual edits to purpose/targets survive arbitrary plan edits; `skip_overridden` appears in the diff.
- **Preview/apply parity**: for a fixed DB state, preview diff == apply diff (acceptance §7.3).
- **Tiling validation**: gaps, overlaps, non-Monday boundaries → 422; plan overlap → 409.
- **Interpolation math**: down-week reduction, taper descent, single-week mesocycles, cadence edge cases (cadence > mesocycle length).
- **Migration backfill**: notes matching each known purpose label convert; near-miss notes don't.
- **Unlink paths**: plan delete with and without `clearScaffolding`; date-shrink unlinking.
- Frontend: wizard split suggestion (race distances, short plans), drafts reading plan context, fallback when `planContext` is null.

---

## 10. Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Flat training blocks (parent spec §6.1) | No umbrella object to carry race, goals, and phase sequence; user chose Plan → Mesocycles → Weeks |
| Lazy flow-down (compute plan context at week-open time, write nothing) | User chose eager scaffolding; eager also makes the timeline and analytics trivially queryable |
| Draft plan rows + `/apply` endpoint | Server state to clean up; stateless preview is simpler and can't go stale destructively |
| Extending `week_goals` for plan goals | NOT NULL week FK + week evaluation engine don't fit plan scope |
| Per-week target arrays (JSON) on mesocycles | Second source of truth alongside `training_weeks.target_mileage` |
| Override tracking via timestamps | Any unrelated week write would masquerade as a manual override |
| Allowing overlapping plans with a priority rule | Single `mesocycle_id` FK; confusing ownership for a single-athlete tool |

---

## 11. Implementation Phases

1. **Migration + models + goal races** — `20260702_007_training_plans.sql`, ORM models, goal-race CRUD API. Independently shippable.
2. **Scaffolding engine + plan APIs** — `services/plans.py`, preview/create/update/delete, week serializer changes, purpose persistence fix in `save_week_plan`.
3. **Plan tab** — empty state, overview timeline, creation wizard, mesocycle editing.
4. **Week-flow integration** — PlanWeekDrawer plan context, WeekView strip, timeline shading.
