# Training Plans (Planning Section) Requirements

**Document version:** 1.0
**Date:** 2026-07-02
**Parent document:** `running-planner-requirements.md`
**Status:** Approved for design

This document defines the Planning section of the app: the place where the runner creates the high-level structure of a training plan — its dates, mesocycles, and goals — which then flows down into the existing week-level planning workflow.

It supersedes the following parts of the parent requirements document:

- §6.1 "Training Block" entity (replaced by Training Plan + Mesocycle).
- §7.4 "Training Block Builder" (replaced by the Plan creation wizard).
- §10.5 "Training Blocks" API (replaced by the Plans API).

The Goal Race entity from §6.1 is retained and implemented here.

---

## 1. Product Summary

Today the app plans one week at a time. There is no construct above the week, so the runner cannot express "16 weeks to the Portland Half, base then build then taper" anywhere — every week is planned in isolation.

The Planning section introduces the missing hierarchy:

```text
Goal Race → Training Plan (macrocycle) → Mesocycles (phases) → Training Weeks → Planned Workouts
```

The plan is the structural spine. It answers:

- What am I training for, and when is it?
- What phase am I in right now?
- What should this week's volume and emphasis be, given where it sits in the plan?
- Am I progressing toward the peak, and is the taper in the right place?

The plan does **not** generate individual workouts. Detailed workout planning remains a week-by-week activity in the existing Week tab, now informed by plan context.

---

## 2. Key Product Principles

1. **The plan scaffolds, the athlete decides.** Creating a plan writes structural targets onto weeks (purpose, target mileage, down-week flags). It never creates, moves, scales, or deletes workouts or week goals.
2. **Manual edits always win.** Once the runner edits a plan-sourced field on a week, re-scaffolding never overwrites it.
3. **Weeks remain the unit of detailed planning.** The plan sets targets; the existing week planner turns targets into workouts and goals.
4. **Preview before apply.** Any plan create or edit that would touch weeks shows the runner exactly which weeks change and how, before anything is written.
5. **No AI required.** All v1 behavior is deterministic. AI plan drafting can layer on later.

---

## 3. Definitions

```text
Training Plan   A macrocycle: a named, dated span of training, usually
                targeting one goal race. Contains ordered mesocycles.

Mesocycle       A contiguous block of weeks inside a plan with one phase
                (base, build, specific, taper, race, recovery, maintenance),
                its own mileage progression, and a down-week cadence.

Phase           The training emphasis of a mesocycle (enum above).

Goal Race       A target race: name, date, distance, target time, priority.
                Exists independently of plans; a plan may reference one.

Scaffolding     The act of materializing a plan onto training weeks:
                creating week rows in range and writing plan-sourced fields.

Plan-sourced    A week field whose value was written by scaffolding and is
field           still owned by the plan (source = 'plan'). Editing it in the
                week UI flips ownership to 'manual'.

Down week       A reduced-volume week inserted on a cadence (e.g. every 4th
                week) to absorb training stress.
```

---

## 4. Functional Requirements

Priorities: **(M)** must, **(S)** should, **(C)** could.

### 4.1 Goal Races

- **FR-1 (M)** The user can create, view, edit, and delete goal races: name, race date, distance (5k, 10k, half marathon, marathon, other + custom miles), optional target time, notes.
- **FR-2 (S)** A goal race carries a priority (A/B/C), location, and altitude context.
- **FR-3 (M)** Target pace is derived from target time and distance; it is displayed, never stored or edited independently.
- **FR-4 (M)** Deleting a goal race never deletes a plan that references it; the plan keeps its dates and becomes a date-range plan.

### 4.2 Plan Creation

- **FR-5 (M)** The user can create a training plan through a guided wizard in the Plan tab.
- **FR-6 (M)** The wizard supports two entry modes: **race-first** (pick or inline-create a goal race; plan end derives from race date) and **dates-first** (pick a start and end date; no race required).
- **FR-7 (M)** A plan has a name, description, start date (normalized to Monday), end date (normalized to Sunday; race plans end the Sunday of race week), optional goal race, status (`active`, `completed`, `archived`), and notes.
- **FR-8 (S)** For race plans, the wizard proposes a mesocycle split working backward from race date: race week (1), taper (1–2 weeks by distance), specific (~4 weeks), build (~4–6 weeks), base absorbs the remainder. Plans under 8 weeks compress phases and show a warning.
- **FR-9 (S)** The wizard prefills baseline weekly mileage from recent actual weeks and distributes per-mesocycle mileage targets from a baseline → peak → taper curve.
- **FR-10 (M)** Two non-archived plans may not overlap in dates for the same athlete. The API rejects overlaps; the wizard surfaces the conflict.
- **FR-11 (S)** A plan whose end date has passed presents as `completed` automatically (computed on read, like week state); the user can archive it.

### 4.3 Mesocycles

- **FR-12 (M)** A plan contains one or more ordered mesocycles, each with a phase from: `base`, `build`, `specific`, `taper`, `race`, `recovery`, `maintenance`.
- **FR-13 (M)** Mesocycles are contiguous, non-overlapping, Monday-aligned, and exactly tile the plan's date range. The API validates this atomically on save.
- **FR-14 (M)** Each mesocycle defines a weekly mileage progression as start and end targets, interpolated linearly across its non-down weeks.
- **FR-15 (M)** Each mesocycle may define a down-week cadence (e.g. every 4th week) and a reduction percentage (default 20%). Cadence is counted within the mesocycle. Taper and race mesocycles default to no cadence.
- **FR-16 (S)** Each mesocycle may define a long-run distance progression (start and end), interpolated the same way.

### 4.4 Scaffolding and Precedence

- **FR-17 (M)** Creating a plan scaffolds every week in its range: the week row is created if needed and linked to its mesocycle, and plan-sourced fields are written — week purpose, target mileage, target long-run distance (when configured), down-week flag.
- **FR-18 (M)** Scaffolding never creates, moves, rescales, or deletes planned workouts or week goals. Existing week content is always preserved.
- **FR-19 (M)** Precedence is tracked per field. Scaffolding may write a field only while it is still plan-owned (or empty). Any edit to that field through the week UI flips it to manual ownership, and subsequent re-scaffolds skip it.
- **FR-20 (M)** Every plan create or edit that would modify weeks offers a preview first: a per-week diff (create / annotate / update / preserved-manual / unlink) with field-level changes and warnings (e.g. a week whose planned workouts already exceed the new target).
- **FR-21 (M)** Editing a plan (dates, mesocycle boundaries, mileage) re-runs scaffolding idempotently under the same precedence rules. Weeks that fall out of the plan's range are unlinked and their still-plan-owned fields reset.
- **FR-22 (M)** Deleting a plan unlinks its weeks; weeks, workouts, and goals are never deleted.
- **FR-23 (S)** Plan deletion offers an option to also clear still-plan-owned scaffolded fields from its weeks.
- **FR-24 (C)** Auto-shifting planned workouts when a plan's dates move. Out of scope for v1; the preview flags affected weeks instead.

### 4.5 Plan Goals and Flow-Down

- **FR-25 (M)** A plan carries plan-level goals: race time, peak weekly mileage, weekly mileage progression, long-run progression, consistency, custom.
- **FR-26 (M)** Goals that flow down do so through week scalar targets: mileage progression and peak write per-week target mileage; long-run progression writes per-week target long-run distance.
- **FR-27 (M)** Week-level goal rows are produced by the existing week-goal derivation at week-planning time, seeded from the week's plan targets (source `derived_from_plan`). Scaffolding itself never creates week-goal rows.
- **FR-28 (M)** Race-time goals do not produce weekly rows; they surface as context (race chip, countdown, target pace).
- **FR-29 (S)** Plan goals display read-time progress computed from week aggregates (e.g. peak week so far, percentage of weeks on target).

### 4.6 Plan Tab UI

- **FR-30 (M)** With no plan, the Plan tab shows an empty state with a primary "Create training plan" action and a secondary "Add a goal race" action.
- **FR-31 (M)** With a current or upcoming plan, the Plan tab shows a plan overview: header (name, race, countdown, target time/pace) and a timeline of mesocycle bands over per-week bars comparing target, planned, and actual mileage, with down-week, today, and race markers.
- **FR-32 (M)** Clicking a week in the timeline navigates to the Week tab with that week selected.
- **FR-33 (M)** The overview lists mesocycle cards (phase, dates, progression, cadence) and the plan-goals card, each with edit affordances.
- **FR-34 (M)** Weeks whose plan-sourced fields have been manually overridden are visibly marked on the timeline.
- **FR-35 (S)** On mobile, the timeline becomes a vertical week list grouped under sticky mesocycle headers; the wizard drawer goes full screen.
- **FR-36 (S)** Past and archived plans are listed and viewable read-only.

### 4.7 Week Flow Integration

- **FR-37 (M)** Week purpose becomes a first-class structured field on the week (today it is persisted as free text in week notes). Notes revert to true free text.
- **FR-38 (M)** The week planning drawer pre-fills from plan context: purpose pre-selected from the scaffolded value, suggested load taken from the week's plan target with the prior-week heuristic as fallback, goals derived against the plan target.
- **FR-39 (S)** The week planning drawer and Week view show a plan-context strip: phase chip ("Build · wk 3/5"), race countdown, target vs planned vs actual mileage.
- **FR-40 (M)** Weeks outside any plan render and behave exactly as today.
- **FR-41 (S)** The training timeline (month strip) can shade weeks by mesocycle phase.

---

## 5. Data Requirements

New tables (all athlete-scoped, TEXT UUID primary keys, cascading foreign keys, in the style of `week_goals`):

```text
goal_races
  id, athlete_account_id, name, race_date, distance, distance_miles,
  target_time (seconds, nullable), priority, location, altitude_context,
  notes, created_at, updated_at

training_plans
  id, athlete_account_id, name, description, goal_race_id (nullable),
  start_date (Monday), end_date (Sunday), status, notes,
  created_at, updated_at

mesocycles
  id, training_plan_id, athlete_account_id, order_index, name, phase,
  start_date, end_date, target_mileage_start, target_mileage_end,
  long_run_start, long_run_end, down_week_cadence,
  down_week_reduction_pct, notes, created_at, updated_at

plan_goals
  id, training_plan_id, athlete_account_id, category, label,
  target_value, unit, flows_down, notes, created_at, updated_at
```

Changes to `training_weeks`:

```text
mesocycle_id             nullable FK, ON DELETE SET NULL
purpose                  structured week purpose id
purpose_source           'manual' | 'plan'
target_mileage           weekly target (distinct from workout-derived
                         planned_mileage)
target_mileage_source    'manual' | 'plan'
target_long_run_source   'manual' | 'plan' (governs existing
                         target_long_run_distance)
is_down_week             boolean flag
```

Deletion rules:

```text
delete training_plan   → mesocycles cascade; weeks unlinked, never deleted
  + clearScaffolding   → also reset fields still owned by the plan
delete mesocycle       → affected weeks unlinked, same field rules
delete goal_race       → plan survives with goal_race_id = NULL
delete athlete_account → everything cascades (existing pattern)
```

---

## 6. API Requirements

```http
GET    /api/goal-races
POST   /api/goal-races
PATCH  /api/goal-races/{id}
DELETE /api/goal-races/{id}

GET    /api/plans
POST   /api/plans/preview            stateless: PlanSpec → ScaffoldPreview
POST   /api/plans                    create + scaffold, one transaction
GET    /api/plans/{id}               plan + mesocycles + goals + week summaries
POST   /api/plans/{id}/preview       preview an edit against current state
PUT    /api/plans/{id}               full spec replace + re-scaffold
PATCH  /api/plans/{id}               metadata only (name, notes, status)
DELETE /api/plans/{id}?clearScaffolding=true|false
```

Contract requirements:

- Mesocycles and plan goals are nested collections in the plan spec, bulk-saved atomically (mirrors `PUT /api/weeks/{id}/plan`).
- Previews are stateless and write nothing; apply recomputes the diff server-side so a stale preview cannot corrupt state.
- Overlapping plans return 409. Invalid mesocycle tiling returns 422.
- `TrainingWeekRead` gains `purpose`, `targetMileage`, `isDownWeek`, and nullable `planContext` (plan, mesocycle, phase, week index, race, weeks to race, target pace).
- `PlanWeekSave` gains structured `purpose` and separate free-text `notes`.
- `GET /api/training-timeline` gains a `plans[]` payload with mesocycle bands.

This section supersedes parent §10.5.

---

## 7. Acceptance Criteria

### 7.1 Plan creation

Given a goal race "Portland Half" 15 weeks out and the wizard defaults accepted, when the plan is created, then:

- Weeks Monday-through-race-Sunday exist and are linked to mesocycles.
- The split is base/build/specific/taper/race and exactly tiles the range.
- Down weeks appear on the configured cadence with reduced targets.
- The race week has purpose `race_week`.
- No planned workouts or week goals were created.

### 7.2 Precedence

Given a week with 4 manually planned workouts and a manually set target mileage, when the plan's mileage targets change and the user applies the edit, then:

- The workouts and week goals are unchanged.
- The manual target mileage is preserved; only fields still owned by the plan update.
- The preview listed the week as preserved-manual for the target field.

### 7.3 Preview parity

Given any plan create or edit, when the preview is shown and then applied without other changes, then the applied result matches the preview diff exactly.

### 7.4 Plan deletion

Given a plan with 10 scaffolded weeks of which 3 contain workouts, when the plan is deleted without clearing scaffolding, then all 10 week rows remain with their content, unlinked from mesocycles. When deleted with clearing, plan-owned purposes and targets reset, and the 3 weeks' workouts still remain.

### 7.5 Week flow

Given a scaffolded week in a build mesocycle with target 42 miles, when the user opens the week planning drawer, then the purpose is pre-selected, the suggested load reads 42 with a "From plan" explanation, and derived goals anchor on 42. Given a week outside any plan, the drawer behaves as before this feature.

### 7.6 Purpose migration

Given existing weeks whose notes contain exactly a known purpose label, when the migration runs, then the structured purpose is set and the note cleared; all other notes are untouched.

---

## 8. Out of Scope (v1)

- Auto-generating individual workouts from the plan.
- Any AI involvement (drafting, adjusting).
- Moving or rescaling planned workouts when plan dates shift.
- Multiple races per plan; B/C races rendered on the timeline.
- Overlapping plans.
- Plan templates ("Half marathon base block" etc.).
- Kilometre units (miles only, consistent with the app).
- Pace-zone computation from race target.

These are v2 candidates, not rejected ideas.

---

## 9. Decisions Log

- Hierarchy is Plan → Mesocycles → Weeks, superseding flat training blocks.
- Flow-down is eager scaffolding with per-field precedence, not lazy lookup.
- Plans auto-complete on read after their end date.
- Down-week cadence counts within each mesocycle, not across the plan.
- Miles only in v1.
