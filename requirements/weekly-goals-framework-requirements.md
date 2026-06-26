# Running Planner: Weekly Goals and Achievement Framework Requirements

**Document version:** 1.0  
**Feature area:** Weekly planning intent, goal tracking, and week review  
**Target app:** Running Planner PWA  
**Intended implementer:** Codex  
**Primary goal:** Make each training week goal-driven, not just schedule-driven. The app should let the user define what a week is supposed to accomplish, plan workouts to achieve that intent, sync actual activities, and evaluate whether the week’s goals were achieved.

---

## 1. Product Summary

The Running Planner app currently has:

- A week board.
- Planned workouts.
- Actual Strava-synced activities.
- Collapsed week fingerprints.
- A long-range timeline rail.

The next major product layer is **Weekly Goals**.

A week should not merely be a set of daily workouts. It should have a clearly defined **weekly intent**:

```text
What is this week supposed to accomplish?
```

Examples:

```text
Build aerobic volume.
Run 49 miles.
Complete 1 threshold workout.
Keep the long run controlled at 10 miles.
Complete 1 strength session.
Preserve at least 1 rest day.
Avoid long run exceeding 30% of weekly volume.
```

The app should then evaluate actual training against that intent.

The core loop:

```text
Weekly Goals → Daily Plan → Actual Activities → Goal Evaluation → Week Review
```

This is the app’s main product distinction from Strava.

Strava can say:

```text
You ran 51.4 miles.
```

This app should say:

```text
You intended to run 49 miles with one quality session and a controlled 10-mile long run. You hit the mileage, missed the quality session, and kept the long run within range.
```

---

## 2. Key Product Principle

Separate:

```text
Weekly Intent
Workout Schedule
Actual Activities
Goal Evaluation
```

These are related, but they are not the same.

A workout is specific:

```text
Wednesday: LT Intervals, 10 miles
```

A weekly goal is more flexible:

```text
Complete 1 quality session
```

If the user moves the workout from Wednesday to Thursday, the goal remains intact.

If the user replaces LT intervals with a tempo run, the goal may still be achieved with modification.

If the user skips the hard workout entirely, the goal is missed.

This distinction is essential.

---

## 3. Definitions

### Weekly Goals

A structured set of achievement targets and guardrails for a training week.

Examples:

```text
Mileage: 49 mi, acceptable range 46–52.
Quality: 1 hard session.
Long run: 10 mi, acceptable range 9–11.
Strength: 1 session.
Recovery: at least 1 rest day.
Guardrail: long run no more than 30% of weekly volume.
```

### Achievement Goal

Something the user is trying to accomplish.

Examples:

```text
Run 49 miles.
Complete 1 hard workout.
Run a 10-mile long run.
Complete 1 strength session.
Run 6 days.
```

### Guardrail

A boundary intended to prevent a risky or undesirable week.

Examples:

```text
Do not exceed 55 miles.
Do not schedule back-to-back hard days.
Do not let the long run exceed 30% of weekly mileage.
Do not run hard after an injury flag.
```

Guardrails should produce warnings, not “failed week” judgments.

### Week State

The selected week should be interpreted as one of:

```text
past
current
future
```

The UI and goal display should change based on this state.

---

## 4. Product Behavior by Week State

## 4.1 Future Week: Planning Mode

A future week should emphasize intent and planning.

Do not emphasize actuals.

Bad future-week header:

```text
Planned: 49 mi
Actual: 0 mi
Hard days: 1
Long run: 10 mi
```

Better future-week header:

```text
Target week: 49 mi
Schedule: 7 planned sessions
Quality: 1 hard day
Long run: 10 mi
```

Primary user question:

```text
Is this week designed correctly?
```

Primary actions:

```text
Copy prior week
Set goals
Balance week
Scale mileage
Make down week
Add workout
Clear week
```

Future week UI should feel like a planning workspace.

## 4.2 Current Week: Execution Mode

A current week should emphasize progress toward goals.

Primary user question:

```text
Am I on track?
```

Example current-week display:

```text
Mileage: 16.3 / 49 mi
Sessions: 2 / 7 completed
Quality: 0 / 1 hard days
Long run: planned Sunday
Remaining: 32.7 mi over 5 days
```

Current week UI should show:

- completed progress
- remaining planned work
- at-risk goals
- upcoming key sessions
- whether adjustment may be needed

Primary actions:

```text
Sync
Adjust rest of week
Mark workout moved
Edit goals
Add note/check-in
```

## 4.3 Past Week: Review Mode

A past week should emphasize outcomes.

Primary user question:

```text
Did I accomplish what I intended?
```

Example past-week display:

```text
Mileage: achieved, 51.4 / 49 mi
Quality: missed, 0 / 1 hard days
Long run: exceeded target, 14.7 vs 10
Strength: missed
Recovery: OK, 1 rest day
Guardrail: long run was 28.6% of week, acceptable
```

Past week UI should show:

- achieved goals
- missed goals
- partial goals
- exceeded goals
- guardrail warnings
- summary review text

Primary actions:

```text
Review week
Edit classification
Waive goal
Copy structure to future week
Use as template
```

---

## 5. Goal Categories

Implement the following goal categories.

## 5.1 Mileage Goal

Purpose:

```text
Control weekly volume.
```

Fields:

```text
target miles
minimum acceptable miles
maximum acceptable miles
```

Example:

```text
Target: 49 mi
Acceptable range: 46–52 mi
```

Evaluation:

- Future: planned mileage against target/range.
- Current: actual completed plus remaining planned mileage against target/range.
- Past: actual mileage against target/range.

Statuses:

```text
not_started
on_track
at_risk
achieved
partially_achieved
missed
exceeded
```

Do not require exact mileage. Use a range.

## 5.2 Frequency / Session Goal

Purpose:

```text
Track how many running or training sessions the week should include.
```

Examples:

```text
6 run days
7 planned sessions
1 strength session
```

Fields:

```text
target run days
target total sessions
minimum acceptable sessions
```

Evaluation:

- Count planned sessions for future weeks.
- Count completed actual sessions for past weeks.
- For current weeks, count completed plus remaining planned.

## 5.3 Long Run Goal

Purpose:

```text
Track the week’s key endurance session and prevent long-run imbalance.
```

Fields:

```text
target long run miles
minimum acceptable long run miles
maximum acceptable long run miles
preferred day optional
```

Example:

```text
Target: 10 mi
Acceptable range: 9–11 mi
Preferred day: Sunday
```

Evaluation:

- Future: is a long run planned in range?
- Current: completed if already done, otherwise planned/upcoming.
- Past: longest actual run compared against long-run target.

Long run should also feed guardrails.

## 5.4 Quality Goal

Purpose:

```text
Track hard training intent without overfitting to one exact workout.
```

Examples:

```text
1 quality session
1 threshold-oriented workout
1 interval workout
1 hill session
```

Fields:

```text
target hard days
quality type optional
minimum acceptable hard days
maximum hard days optional
```

Quality types:

```text
threshold
tempo
interval
hill
race
progression
strides
any_quality
```

Evaluation should be flexible.

Example:

```text
Goal: 1 threshold-oriented workout
Planned: LT Intervals
Actual: 3 mi tempo
Result: achieved_with_modification or partially_achieved
```

Do not automatically fail the goal just because the exact planned workout changed.

## 5.5 Recovery Goal

Purpose:

```text
Ensure the week includes enough recovery and avoids bad spacing.
```

Examples:

```text
At least 1 rest day
No back-to-back hard days
Easy days stay easy
No hard workout within 24 hours of flagged injury note
```

Fields:

```text
minimum rest days
maximum hard days
allow_back_to_back_hard_days boolean
easy_intensity_guard boolean
```

Evaluation:

- Future: validate planned rest days and hard-day spacing.
- Current: evaluate completed distribution and future risk.
- Past: report recovery success/warnings.

## 5.6 Strength / Prehab Goal

Purpose:

```text
Track strength, mobility, and prehab work.
```

Examples:

```text
1 lower-body strength session
2 strength sessions
3 PT/mobility sessions
```

Fields:

```text
target strength sessions
minimum acceptable strength sessions
target mobility sessions optional
```

Evaluation:

- Strength can be manually marked complete or matched from imported activities.
- Strength should not contribute to mileage.
- Strength can still count toward total sessions if desired.

## 5.7 Custom Goal

Purpose:

```text
Allow user-defined weekly intent.
```

Examples:

```text
Keep all easy runs truly easy
Run hills once
Do strides twice
Avoid treadmill this week
Practice fueling on long run
```

MVP can support custom goals as text with manual status.

Fields:

```text
label
description
manual status
notes
```

Later versions can support structured custom rules.

---

## 6. Guardrails

Guardrails are warnings, not achievement goals.

Initial guardrails:

```text
Maximum weekly mileage
Long run maximum percentage of weekly mileage
Maximum hard days
No back-to-back hard days
No hard day after injury flag
Maximum mileage increase over recent average
Down week expectation
```

Recommended default thresholds:

```text
long_run_max_percent: 30%
weekly_mileage_over_plan_warning: 10%
weekly_mileage_over_4_week_avg_warning: 15%
max_hard_days: 2
```

Guardrail statuses:

```text
ok
warning
danger
waived
not_applicable
```

Guardrail UI should be separate from goal success.

Do not make the whole week look failed because a guardrail warning exists.

---

## 7. Goal Status Framework

Each achievement goal should evaluate to one of:

```ts
type GoalStatus =
  | "not_started"
  | "on_track"
  | "at_risk"
  | "achieved"
  | "partially_achieved"
  | "missed"
  | "exceeded"
  | "waived";
```

### Status Meanings

#### not_started

No work has occurred yet, but that is expected.

Example:

```text
Future week mileage goal: 49 planned, week has not started.
```

#### on_track

Progress or plan appears sufficient.

Example:

```text
Current week: 16.3 completed, 32.7 planned remaining, target 49.
```

#### at_risk

Goal can still be achieved, but current progress or plan makes it uncertain.

Example:

```text
Only 10 miles completed by Friday with a 49-mile goal.
```

#### achieved

Goal was met within acceptable range.

Example:

```text
Actual 50.1 mi, target range 46–52.
```

#### partially_achieved

Goal was meaningfully attempted but not fully met.

Example:

```text
Planned 1 hard workout, completed a shorter steady run.
```

#### missed

Goal was not achieved.

Example:

```text
Past week ended with 0 hard sessions against goal of 1.
```

#### exceeded

Goal was surpassed beyond maximum acceptable range.

Example:

```text
Actual 58 mi against range 46–52.
```

#### waived

User intentionally waives the goal.

Example:

```text
Skipped strength due to travel.
```

Waived goals should not count as failures in the review summary.

---

## 8. Data Model Requirements

## 8.1 WeekGoal

Add a first-class `WeekGoal` model.

Suggested TypeScript shape:

```ts
type WeekGoal = {
  id: string;
  weekStartDate: string;

  category:
    | "mileage"
    | "sessions"
    | "long_run"
    | "quality"
    | "recovery"
    | "strength"
    | "custom";

  goalType: "achievement" | "guardrail";

  label: string;
  description?: string;

  targetValue?: number;
  minAcceptable?: number;
  maxAcceptable?: number;
  unit?: "mi" | "sessions" | "days" | "percent" | "boolean" | "custom";

  evaluationMode:
    | "at_least"
    | "at_most"
    | "range"
    | "exact-ish"
    | "boolean"
    | "manual";

  priority: "primary" | "secondary" | "guardrail";

  status:
    | "not_started"
    | "on_track"
    | "at_risk"
    | "achieved"
    | "partially_achieved"
    | "missed"
    | "exceeded"
    | "waived";

  source:
    | "manual"
    | "derived_from_plan"
    | "template"
    | "ai_suggested";

  isEditable: boolean;
  isEnabled: boolean;

  createdAt: string;
  updatedAt: string;
};
```

## 8.2 WeekGoalEvaluation

Goal definitions and evaluations should be separable if possible.

Suggested shape:

```ts
type WeekGoalEvaluation = {
  goalId: string;
  weekStartDate: string;

  status: GoalStatus;
  actualValue?: number;
  plannedValue?: number;
  remainingPlannedValue?: number;

  summary: string;
  detail?: string;

  severity?: "info" | "success" | "warning" | "danger";
  evaluatedAt: string;

  contributingWorkoutIds?: string[];
  contributingActivityIds?: string[];
};
```

Example:

```json
{
  "goalId": "goal-quality-1",
  "weekStartDate": "2026-06-22",
  "status": "on_track",
  "plannedValue": 1,
  "actualValue": 0,
  "summary": "1 hard workout planned for Wednesday",
  "severity": "info",
  "contributingWorkoutIds": ["planned-workout-123"]
}
```

## 8.3 WeekIntent / WeekGoals Container

Optionally create a `WeekIntent` container.

```ts
type WeekIntent = {
  weekStartDate: string;
  title?: string;
  purpose?: string;
  notes?: string;
  goals: WeekGoal[];
  createdAt: string;
  updatedAt: string;
};
```

Example:

```text
Purpose: Controlled aerobic volume with one LT session.
```

This can power a concise week summary.

---

## 9. Deriving Goals From the Plan

The app should auto-generate default weekly goals from planned workouts, but the user must be able to edit them.

Example planned week:

```text
Tue: 9 Easy
Wed: Strength + LT Intervals 10
Thu: 10 Easy
Fri: 5 Recovery
Sat: 10 Easy
Sun: 5 Easy
```

Derived goals:

```text
Mileage: 49 mi
Sessions: 7
Quality: 1 hard day
Long run: 10 mi
Strength: 1 session
Recovery: at least 1 rest day
```

Rules:

- Planned run mileage sums to mileage goal.
- Longest planned run becomes long run goal.
- Planned workout/intensity categories derive hard day goal.
- Strength planned sessions derive strength goal.
- Empty/rest days derive recovery goal.
- Guardrails derive from defaults and user settings.

User can edit:

```text
Target mileage range
Whether strength is required
Whether hard session type matters
Whether long run is exact or range
```

Do not overwrite manually edited goals without confirmation.

---

## 10. Goal Evaluation Logic

Implement a rule-based evaluator first. AI can come later.

## 10.1 Mileage Evaluation

Inputs:

```text
week state
planned mileage
actual mileage
remaining planned mileage
target/min/max
```

Future:

- Use planned mileage.
- If planned mileage is in range, status `on_track`.
- If planned mileage below min, status `at_risk`.
- If planned mileage above max, status `exceeded` or guardrail warning.

Current:

- Use actual plus remaining planned.
- If projected total is in range, status `on_track`.
- If projected below min or above max, status `at_risk`.
- If actual already above max, status `exceeded`.

Past:

- Use actual mileage.
- In range: `achieved`.
- Below min: `missed` or `partially_achieved`.
- Above max: `exceeded`.

## 10.2 Quality Evaluation

Inputs:

```text
planned hard workouts
actual hard activities
planned workout classifications
actual activity classifications
user edits/overrides
```

Future:

- If required number of hard workouts planned, `on_track`.
- If missing, `at_risk`.

Current:

- If actual hard sessions completed meet target, `achieved`.
- If hard sessions remain planned, `on_track`.
- If no hard session completed and none remaining, `at_risk`.

Past:

- If actual hard sessions meet target, `achieved`.
- If modified but meaningful quality exists, `partially_achieved`.
- If none, `missed`.

## 10.3 Long Run Evaluation

Inputs:

```text
longest planned run
longest actual run
target/min/max
week state
```

Future:

- Longest planned run in range: `on_track`.
- No planned long run: `at_risk`.
- Planned long run above max: `exceeded` or guardrail warning.

Current:

- If completed long run is in range: `achieved`.
- If future planned long run remains: `on_track`.
- If completed too short and no future long run: `at_risk`.

Past:

- Longest actual in range: `achieved`.
- Below min: `missed` or `partially_achieved`.
- Above max: `exceeded`.

## 10.4 Recovery Evaluation

Inputs:

```text
planned rest days
actual rest days
hard day spacing
easy day intensity classification
injury flags
```

Future:

- Check planned rest days and hard-day spacing.
- Warnings for back-to-back hard days.

Current:

- Check completed hard/easy distribution.
- Warn if future plan leaves no recovery.

Past:

- Evaluate actual rest days and hard-day spacing.
- Easy-day intensity drift can produce warning or partial miss.

## 10.5 Strength Evaluation

Inputs:

```text
planned strength sessions
completed strength sessions
manual completion
matched Strava strength activities
```

Future:

- Required strength planned: `on_track`.
- Missing: `at_risk`.

Current:

- Completed enough: `achieved`.
- Remaining planned: `on_track`.
- None completed or remaining: `at_risk`.

Past:

- Completed enough: `achieved`.
- Some completed: `partially_achieved`.
- None: `missed`.

---

## 11. UI Requirements

## 11.1 Replace Generic Metric Cards With Goal-Aware Cards

Current generic cards:

```text
Planned
Actual
Hard days
Long run
```

Replace or adapt them into goal-aware cards.

Future week example:

```text
Target week
49 mi planned

Schedule
7 sessions

Quality
1 hard day

Long run
10 mi
```

Current week example:

```text
Mileage
16.3 / 49 mi
On track

Sessions
2 / 7 complete
5 remaining

Quality
0 / 1 hard days
Planned Wed

Long run
Not yet
Planned Sun
```

Past week example:

```text
Mileage
51.4 / 49 mi
Achieved

Quality
0 / 1
Missed

Long run
14.7 / 10 mi
Exceeded

Recovery
1 rest day
OK
```

## 11.2 Add Week Goals Scorecard

Add a scorecard area near the top of the selected week.

The scorecard should show the primary goals and statuses.

Example:

```text
Mileage       16.3 / 49 mi      On track
Quality      0 / 1 hard         Planned Wed
Long run     0 / 10 mi          Planned Sun
Strength     0 / 1              Planned Wed
Recovery     1 rest day         OK
```

This can be displayed as cards, rows, or chips depending on screen width.

## 11.3 Use Semantic Status Colors

Recommended mapping:

```text
achieved: green
on_track: blue
not_started: slate
at_risk: amber
partially_achieved: amber
missed: red
exceeded: amber/red depending goal
waived: gray
```

Avoid making the whole UI red/green. Use small badges/chips.

## 11.4 Add Week Purpose Field

Allow the user to set a short purpose for the week.

Examples:

```text
Controlled aerobic volume
Down week after race
One LT workout, keep long run modest
Recovery and consistency
```

Display under the week title when present:

```text
Jun 22–Jun 28
Controlled aerobic volume · 49 mi target
```

## 11.5 Add Future-Week Planning Toolbar

For future weeks, show a planning toolbar.

Required actions:

```text
Set goals
Copy prior week
Scale mileage
Balance week
Add workout
Clear week
```

MVP can implement some as buttons with disabled/TODO states if functionality does not exist yet, but avoid dead controls if possible.

Recommended first implemented actions:

```text
Set goals
Copy prior week
Clear week
```

Later:

```text
Scale mileage
Balance week
Make down week
Generate week
```

## 11.6 Add Current-Week Adjustment Action

For current week, show:

```text
Adjust rest of week
```

This does not need full AI in MVP. It can open a modal or placeholder that eventually suggests modifications.

## 11.7 Add Past-Week Review Action

For past weeks, show:

```text
Review week
```

This should surface goal evaluation and allow user corrections.

## 11.8 Remove Irrelevant Actuals From Future Week Emphasis

Do not emphasize:

```text
Actual 0 mi
0 actual activities
```

for future weeks.

It can exist in secondary detail, but future weeks should be planning-first.

## 11.9 Improve Planned Workout Card Microcopy

Replace dangling placeholder dashes.

Bad:

```text
9 Easy
9 mi
-
```

Good:

```text
9 Easy
9 mi · easy
```

For hard workouts:

```text
LT Intervals
10 mi · workout
```

For moved workouts:

```text
10 Easy
10 mi · moved
```

For strength:

```text
Strength
planned
```

## 11.10 Treat Rest Days Intentionally

In future planned weeks, empty days may mean either:

```text
planned rest
unplanned day
```

Support explicit rest days.

Display planned rest day:

```text
Rest day
```

Display unplanned future day:

```text
+ Add session
```

In past weeks with no activity:

```text
No activity
```

## 11.11 Collapsed Week Row Badges Should Reflect Goal Context

Collapsed week rows already show daily distance fingerprints. Keep them.

Refine visual semantics:

```text
actual distance: filled subtle green/cyan
planned distance: outlined blue
rest/empty: ghost
long run: subtle ring
quality/hard day: small accent marker
```

Collapsed rows should remain compact and not become full week reviews.

---

## 12. Editing Requirements

## 12.1 Goal Editor

Add a goal editor modal or panel.

User should be able to edit:

```text
week purpose
mileage target
mileage acceptable range
hard day target
long run target/range
strength target
recovery/rest day target
guardrail settings
custom goal text
```

MVP goal editor can start with:

```text
Purpose
Target mileage
Min mileage
Max mileage
Hard days
Long run target
Strength sessions
Rest days
```

## 12.2 Manual Overrides

User must be able to:

```text
waive a goal
mark a goal achieved
mark a goal partially achieved
add review note
```

This is important because training context can be nuanced.

Example:

```text
Missed strength session because hamstring felt off.
```

## 12.3 Derived Goal Locking

If a goal was manually edited, do not overwrite it automatically when planned workouts change.

Possible field:

```text
source: manual
```

If plan changes and derived goal differs from manual goal, show a subtle warning:

```text
Plan changed. Goal target differs from current plan.
```

Example:

```text
Mileage goal is 49 mi, but current plan totals 52 mi.
```

---

## 13. API Requirements

Use existing app conventions. Suggested endpoints:

## 13.1 Get Week Goals

```http
GET /api/weeks/{weekStartDate}/goals
```

Returns:

```json
{
  "weekStartDate": "2026-06-22",
  "purpose": "Controlled aerobic volume",
  "goals": [],
  "evaluations": []
}
```

## 13.2 Update Week Goals

```http
PUT /api/weeks/{weekStartDate}/goals
```

or:

```http
PATCH /api/weeks/{weekStartDate}/goals
```

Updates the week purpose and goals.

## 13.3 Recalculate Derived Goals

```http
POST /api/weeks/{weekStartDate}/goals/recalculate
```

Behavior:

- Recompute derived goals from current plan.
- Do not overwrite manual goals unless explicitly requested.
- Return proposed changes if conflicts exist.

## 13.4 Evaluate Goals

```http
POST /api/weeks/{weekStartDate}/goals/evaluate
```

or evaluate automatically whenever week data changes.

Returns current goal evaluations.

## 13.5 Waive Goal

```http
POST /api/week-goals/{goalId}/waive
```

Payload:

```json
{
  "reason": "Skipped strength due to travel."
}
```

## 13.6 Update Goal Status Manually

```http
PATCH /api/week-goals/{goalId}/status
```

Payload:

```json
{
  "status": "partially_achieved",
  "note": "Did a shorter steady run instead of LT intervals."
}
```

---

## 14. Database Requirements

Add tables or equivalent persistence.

## 14.1 week_intents

Suggested fields:

```sql
id
week_start_date
purpose
notes
created_at
updated_at
```

If multi-user support exists, include:

```sql
athlete_account_id
```

## 14.2 week_goals

Suggested fields:

```sql
id
week_start_date
category
goal_type
label
description
target_value
min_acceptable
max_acceptable
unit
evaluation_mode
priority
status
source
is_editable
is_enabled
created_at
updated_at
```

## 14.3 week_goal_evaluations

This may be stored or computed. For MVP, computed is acceptable. If stored:

```sql
id
goal_id
week_start_date
status
actual_value
planned_value
remaining_planned_value
summary
detail
severity
evaluated_at
```

## 14.4 week_goal_notes

Optional but useful for review:

```sql
id
goal_id
note
created_at
updated_at
```

---

## 15. Event / Recalculation Triggers

Goal evaluations should update when:

```text
planned workout created
planned workout edited
planned workout deleted
planned workout moved
Strava activity imported
Strava activity matched/unmatched
activity classification changes
daily check-in injury flag changes
goal edited
week state changes from future to current/past
```

MVP can recalculate on page load and after relevant mutations.

---

## 16. Week-Level Planning Tools

These do not all need to be implemented immediately, but design the goal framework to support them.

## 16.1 Set Goals

Open goal editor.

## 16.2 Copy Prior Week

When copying prior week:

- copy workouts
- optionally derive new goals from copied workouts
- ask whether to copy purpose/goals exactly or recalculate

## 16.3 Scale Mileage

Future enhancement.

Example:

```text
Scale this week to 55 mi.
```

Should proportionally adjust easy/long runs while preserving hard workout structure.

## 16.4 Balance Week

Future enhancement.

Should adjust distribution to better satisfy goals and guardrails.

Examples:

```text
long run too high as percentage
too many days clustered
no rest day
hard days too close
```

## 16.5 Make Down Week

Future enhancement.

Reduce mileage target and scheduled runs while preserving some structure.

## 16.6 Adjust Rest of Week

Current-week enhancement.

Inputs:

- goals
- completed activities
- remaining planned workouts
- fatigue/injury notes
- guardrails

Outputs:

- suggested plan modifications
- explanation
- user approval required

---

## 17. UI Wireframe Concepts

## 17.1 Future Week

```text
TRAINING WEEK
Jun 22–Jun 28
Controlled aerobic volume

[Target week]   49 mi planned
[Schedule]      7 sessions
[Quality]       1 hard day
[Long run]      10 mi

[Set goals] [Copy prior week] [Scale mileage] [Balance week] [Clear]

Goal Scorecard
Mileage      49 planned        On track
Quality      1 hard planned    On track
Long run     10 planned        On track
Strength     1 planned         On track
Recovery     1 rest day        On track

[Week board]
```

## 17.2 Current Week

```text
TRAINING WEEK
Jun 15–Jun 21
Execution week

[Mileage]      16.3 / 49 mi      On track
[Sessions]     2 / 7 complete     5 remaining
[Quality]      0 / 1              Planned Wed
[Long run]     Not yet            Planned Sun

[Sync] [Adjust rest of week] [Edit goals]

Goal Scorecard
Mileage      16.3 / 49       On track
Quality      0 / 1           Planned
Long run     0 / 10          Upcoming
Recovery     OK              1 rest day remains
```

## 17.3 Past Week

```text
TRAINING WEEK
Jun 8–Jun 14
Week review

[Mileage]      51.4 / 49 mi       Achieved
[Quality]      0 / 1              Missed
[Long run]     14.7 / 10          Exceeded
[Recovery]     Long run 28.6%     OK

[Review week] [Use as template] [Edit classifications]

Goal Scorecard
Mileage      Achieved
Quality      Missed
Long run     Exceeded target
Strength     Missed
Recovery     OK
```

---

## 18. Acceptance Criteria

## 18.1 Future Week Planning

Given a future week with planned workouts totaling 49 miles, 1 hard workout, and a 10-mile long run:

- Header does not emphasize “Actual 0 mi.”
- Goal cards show 49 planned, 1 hard day, 10-mile long run.
- Goal scorecard marks goals as on track.
- Planning toolbar is visible.
- User can open goal editor.

## 18.2 Current Week Progress

Given the current week has 16.3 actual miles and 49 planned miles:

- Mileage card shows 16.3 / 49 mi.
- Remaining planned mileage is visible somewhere.
- Goals with future planned workouts show on track, not missed.
- If projected total is outside goal range, mileage goal shows at risk.

## 18.3 Past Week Review

Given a past week had target 49 mi and actual 51.4 mi:

- Mileage goal shows achieved if within acceptable range.
- Quality goal shows missed if no hard session occurred.
- Long run goal evaluates against actual longest run.
- Guardrail warnings show separately from achievement goals.

## 18.4 Goal Editing

Given user edits mileage target from 49 to 52:

- Goal persists.
- Evaluation updates.
- UI reflects new target.
- Derived recalculation does not overwrite the manual target without confirmation.

## 18.5 Plan Changes

Given user adds a 5-mile planned run to a future week:

- Planned mileage updates.
- Derived goal suggestion updates.
- If goal differs from plan, UI indicates mismatch.

## 18.6 Strava Sync

Given a new Strava run imports and matches to a planned workout:

- Actual progress updates.
- Relevant goals re-evaluate.
- Current/past week status updates.

## 18.7 Waiving a Goal

Given user waives a missed strength goal:

- Goal status becomes waived.
- Week review no longer treats it as a failure.
- Waive note is preserved.

---

## 19. Implementation Plan

## Phase 1: Data and Evaluator

- Add WeekGoal/WeekIntent data structures.
- Implement default goal derivation from planned workouts.
- Implement rule-based goal evaluator.
- Add API or local service layer.
- Add tests for mileage, quality, long run, recovery, strength.

## Phase 2: UI Scorecard

- Add week state detection: past/current/future.
- Replace/adapt metric cards with goal-aware cards.
- Add goal scorecard.
- Add semantic statuses.
- Hide irrelevant future actuals.

## Phase 3: Goal Editing

- Add goal editor modal/panel.
- Allow editing purpose and basic numeric targets.
- Persist manual goals.
- Add waive/manual status support.

## Phase 4: Planning Toolbar

- Add future-week toolbar.
- Wire Set Goals, Copy Prior Week, Clear Week.
- Add placeholder or basic implementation for Scale Mileage / Balance Week if desired.

## Phase 5: Review and Adjustment

- Add past-week review action.
- Add current-week “Adjust rest of week” action.
- Later connect to AI or rule-based suggestion engine.

---

## 20. Testing Requirements

Unit tests:

- Mileage goal evaluation.
- Long run goal evaluation.
- Quality goal evaluation.
- Strength goal evaluation.
- Recovery guardrails.
- Week state detection.
- Derived goal generation.
- Manual goal preservation.

UI tests:

- Future week shows planning mode.
- Current week shows progress mode.
- Past week shows review mode.
- Goal editor saves values.
- Plan mutation updates evaluations.
- Strava activity import updates evaluations.
- Waived goal changes review outcome.

---

## 21. Design Principle

The goal framework should make the app feel like a training intent tracker, not just a calendar.

The user should be able to answer:

```text
What was this week supposed to accomplish?
Am I on track?
Did I achieve it?
What should change next week?
```

The daily plan is the means. The weekly goals are the purpose.
