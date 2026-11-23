# Usability pass — September 29, 2026

The next improvement should be a focused simplification of the daily workflow: consistent mileage language, one way to add or reuse a workout, and feedback that stays visible while editing. The underlying training detail should remain available.

## Scope and evidence

Reviewed the signed-in deployed app at `run.creeth.net` in a separate Chrome tab, at its desktop size and a 390 × 844 phone viewport. Walked through Week, workout details and editing, adding a session, Adjust week, library selection, Move, Workouts, Plan, Goals & races, Trends, Activities, and Settings. Corroborated findings against the `workouts` branch at `110a178` (`Code review fixes`). The deployed app identifies its frontend as 0.1.1; that version does not establish that its build exactly matches this commit.

No workouts, goals, plans, accounts, or settings were saved or changed. The user's existing tab and open drawer were left intact, and the temporary viewport override was reset. This is an expert walkthrough, not a participant study or a full accessibility audit. Autosave behavior was inspected in source rather than tested by changing live goals. Empty-account onboarding was not exercised.

Several earlier improvements work well and should be preserved: opening a scheduled workout shows details first; advanced fields are collapsed in the simple editor; moving a workout exposes destination days directly; the plan timeline is collapsed by default; all five mobile navigation items fit on one row.

## Priorities

| ID | Impact | Opportunity |
| --- | --- | --- |
| U1 | High | Use the same mileage vocabulary and denominator everywhere |
| U2 | High | Make adding and reusing a workout one discoverable flow |
| U3 | Medium | Reset screen position when switching primary sections |
| U4 | Medium | Bring daily actions and editing feedback forward on mobile |
| U5 | Medium | Lead Goals & races with goals and races, then their impact |
| U6 | Medium | Make goal saving and scope predictable |
| U7 | Medium | Accept duration in the form people naturally enter it |
| U8 | Medium | Remove filler and duplicate information from workout details |
| U9 | Medium | Make an activity easier to find and open |
| U10 | Lower | Make Strava settings describe user outcomes |

## Findings and suggested changes

### U1 — Mileage still asks the user to decode several meanings

**Observed:** On the desktop Sep 28–Oct 4 week, the context strip says **10 / 67 mi**, while the selected week says **10 / 70 mi completed / target**, followed by **57 mi scheduled**, **67 mi projected**, and **3 mi below target**. Trends calls 67 miles **This week planned**. Checks says **All checks pass**, while Adjust week describes this same schedule as **still incomplete**. These can be individually valid statements, but the interface makes them sound like competing answers to “am I on track?”

**Change:** Use one progress convention everywhere: **10 of 70 mi completed**. Describe the remaining schedule with a sentence such as **57 mi remaining · projected finish 67 mi, 3 below target**. Use “projected finish” consistently for completed plus remaining work. Label the check group **Training checks** and its healthy state **No training-rule issues**, so passing guardrails does not imply the target has been met. Preserve actual, remaining, projected, and target as separate values.

**Acceptance:** Week, its context strip, Trends, and Adjust week use matching terms for matching values. A user can explain the 3-mile gap without opening another screen.

Sources: [context strip](/Users/mike/Documents/Codex/run-planner/frontend/src/features/weekBoard/buildWeekContextStrip.ts:134), [week summary](/Users/mike/Documents/Codex/run-planner/frontend/src/components/week/WeekCommandCenter.tsx:123), [checks](/Users/mike/Documents/Codex/run-planner/frontend/src/components/week/WeekChecksCard.tsx:52).

### U2 — Reusable workouts are hard to use from where they are found

**Observed:** Workouts has New workout and card actions for Edit, Duplicate, and Delete, but no read-only preview or Schedule action. A day's **+ Plan** opens a blank editor immediately. Using a saved workout instead requires Adjust week, then a small library icon beside a day. On mobile, the separate blank-session plus button inside Adjust week is hidden; “Add a blank session instead” is inside the library picker.

**Change:** Give library cards a **Schedule** action and a read-only preview. Rename day-level **+ Plan** to **Add session** and offer **Quick session** and **Saved workout** in that flow, with the selected date already set. Reuse the same chooser in Adjust week. A labeled Add control should replace the unexplained library icon on phones.

**Acceptance:** A saved workout can be scheduled from either its library card or the selected day without entering the whole-week editor. Adding a simple run is immediately available alongside saved workouts. Scheduling still creates an independent copy and preserves the complete prescription.

Sources: [library](/Users/mike/Documents/Codex/run-planner/frontend/src/features/workouts/WorkoutLibraryView.tsx:111), [day action](/Users/mike/Documents/Codex/run-planner/frontend/src/features/weekBoard/WeekView.tsx:985), [drawer controls](/Users/mike/Documents/Codex/run-planner/frontend/src/features/weekPlanner/PlanWeekDrawer.tsx:596), [mobile hiding rule](/Users/mike/Documents/Codex/run-planner/frontend/src/styles.css:7135).

### U3 — Primary navigation can land halfway through the destination

**Observed:** On a phone, Week → Today scrolls to the schedule. Selecting Settings then opened it at `scrollY = 225`, with the Strava heading and connection information above the visible area. The user first sees reconnect/import controls without their context.

**Change:** Start a newly selected primary section at the top and move focus to its heading. Keep deliberate week/date scrolling, hash destinations, and browser Back restoration separate from that behavior.

**Acceptance:** Switching from a deeply scrolled Week or Activities screen to Settings, Plan, or Progress reveals the destination heading and first content. Back navigation still restores useful context.

Source: [primary navigation](/Users/mike/Documents/Codex/run-planner/frontend/src/App.tsx:595).

### U4 — Mobile gives summary information more space than the immediate task

**Observed:** On fresh navigation, today's session sits near the bottom of the first phone screen, after the week heading, Adjust week, mileage breakdown, quality/long-run/recovery summary, checks, and an empty Monday. The Today shortcut helps. In Adjust week, the projected total and target gap appear after all seven days, while Save changes remains visible in the footer. The user can edit mileage without seeing the consequence.

**Change:** Use a compact mobile week summary, with the mileage sentence prominent and secondary training signals behind a disclosure. Keep today's session readily visible while retaining the full seven-day schedule. Put a compact live total immediately beneath the Adjust week heading or above its sticky save controls: **67 / 70 mi projected · 3 mi short**. Keep the detailed breakdown below.

**Acceptance:** At 390 × 844, the current session and its main action are comfortably visible on entry. The target gap remains visible while editing any day, including Sunday.

Sources: [week summary](/Users/mike/Documents/Codex/run-planner/frontend/src/components/week/WeekCommandCenter.tsx:123), [drawer summary](/Users/mike/Documents/Codex/run-planner/frontend/src/features/weekPlanner/PlanWeekDrawer.tsx:706).

### U5 — Goals & races starts with an analysis matrix instead of the things to manage

**Observed:** The first card is Goal impact, with a history selector and a 21-week matrix. On the phone, its initially visible columns are June/July, although the current week is September 28. Goal names truncate and most weeks require horizontal scrolling. Baseline goals and upcoming races are below it.

**Change:** Put upcoming races and a compact list of effective goals first. Show each effective goal's source: Baseline, Plan, or Phase. Follow with this week's issues and an optional **See impact across weeks** disclosure. When expanded, center the matrix on the current week and provide labeled week navigation and a tap-accessible cell explanation.

**Acceptance:** Opening Goals & races immediately answers “what are my goals and next race?” Current-week status is reachable without scrolling across historical matrix columns.

Sources: [section order](/Users/mike/Documents/Codex/run-planner/frontend/src/features/goals/GoalsView.tsx:311), [matrix range](/Users/mike/Documents/Codex/run-planner/frontend/src/features/goals/GoalImpactSection.tsx:50).

### U6 — The same goal controls have different saving semantics

**Observed/source:** A baseline goal expands inline and ends in **Done**. Source confirms baseline changes save automatically after a delay, with saving feedback in the card footer. Plan and phase goal changes are drafts committed by the parent plan's Save changes. The baseline editor does explain that it affects every week unless overridden, which is useful, but save behavior is not equally explicit.

**Change:** Prefer explicit **Save / Cancel** for baseline goal editing, matching the other consequential edits. In plan/phase editors, label the local close action **Done editing** and state **Saved when you save this plan**. Keep the scope sentence near the controls and show where a goal is overridden. If autosave is retained, label it upfront and keep save status beside the edited row.

**Acceptance:** Before changing a goal, the user can tell which weeks it affects, when it becomes persistent, and how to abandon an edit. Do not claim an in-memory plan edit is saved when only the row has closed.

Sources: [baseline autosave](/Users/mike/Documents/Codex/run-planner/frontend/src/features/goals/DefaultGoalsCard.tsx:100), [shared goal editor](/Users/mike/Documents/Codex/run-planner/frontend/src/features/goals/GoalListEditor.tsx:289), [plan save](/Users/mike/Documents/Codex/run-planner/frontend/src/features/plans/PlansView.tsx:357).

### U7 — A simple duration requires punctuation-heavy entry

**Observed/source:** The basic editor labels duration **Time (H:MM:SS)** with placeholder `0:45:00`. Its HTML pattern requires all three components and requests a numeric keyboard. This makes entering a straightforward 45-minute session unnecessarily awkward on phones, where a numeric keyboard may omit the colon.

**Change:** Label the basic field **Duration (minutes)** and accept `45` or `45.5`, with an optional hours/minutes control for longer sessions. Alternatively, accept `45m`, `45:00`, and `0:45:00` with clear normalization. Use the same duration convention for race targets where practical. Change helper text to **Distance or duration is enough; add both to calculate pace**.

**Acceptance:** A 45-minute session can be entered with the phone's numeric keyboard and no colon. Duration-only plans remain valid; mixed distance/time prescription segments retain their independent units.

Source: [basic duration field](/Users/mike/Documents/Codex/run-planner/frontend/src/features/workouts/WorkoutEditor.tsx:590).

### U8 — Workout details sometimes add words without adding guidance

**Observed:** Opening “40 min tempo” shows **10 mi**, **Tempo**, and **Planned**, then **Purpose: Aerobic training**, **No additional instructions for this session**, and **Workout structure: 10 mi Other**. The last three sections add little actionable information and can make an unfinished prescription look more specific than it is.

**Change:** Suppress empty instructions and hide the structure section when it is just the same simple distance/duration already summarized above. Render generic segment roles in natural language or omit them. Show authored purpose and instructions when present. If explicit workout guidance is absent, a compact **No workout instructions added** hint can accompany Edit; do not invent tempo instructions from the title.

**Acceptance:** A simple run reads as one concise summary. A structured interval session still displays every warm-up, repeat, recovery, and cool-down in order.

Sources: [read-only details](/Users/mike/Documents/Codex/run-planner/frontend/src/features/weekBoard/WeekView.tsx:715), [default purpose](/Users/mike/Documents/Codex/run-planner/frontend/src/features/weekPlanner/planWeekDrafts.ts:278).

### U9 — Activities is a long list with an unexpected destination

**Observed:** Activities lists 100 records without search, sport filtering, or date grouping. The trailing chevron opens the containing week, rather than the activity itself. A ride also displays minutes per mile, using the same metric as a run.

**Change:** Add search and a compact sport/date filter, group records by week, and make the main row open activity details or its recorded-session view. Give **View week** a separate labeled action. Show pace for running, speed for cycling, and duration for sessions where distance is secondary. Avoid adding a new top-level navigation section.

**Acceptance:** A named workout can be found without scrolling through the full history. Row navigation has a clear destination, and non-running activities use meaningful metrics.

Source: [activity list and navigation](/Users/mike/Documents/Codex/run-planner/frontend/src/features/activities/ActivitiesView.tsx:37).

### U10 — Strava controls expose implementation language

**Observed:** Connected settings gives prominence to raw permission scopes, **Backfill 180 days**, **Refresh**, Reconnect, and Disconnect. Source shows Refresh reloads app data/status; it does not import new Strava activity. Schema identifiers also occupy substantial mobile space above profile management.

**Change:** Lead with connection health, last import time, and **Import recent activities**. Put **Import older activities…**, Reconnect, Disconnect, raw scopes, and component versions behind clearly labeled secondary controls/disclosures. Label the existing refresh action **Reload status** if it remains separate. Move About below athlete/profile controls.

**Acceptance:** The normal connected state has one obvious import action and a clear result. Users can distinguish importing from reloading status without understanding “backfill” or permission scopes.

Source: [Strava settings](/Users/mike/Documents/Codex/run-planner/frontend/src/features/settings/SettingsView.tsx:188).

## Suggested implementation order

1. **Daily workflow:** U1, U2, U3, U4, and U7. These remove repeated interpretation, navigation, and entry effort.
2. **Goal clarity:** U5 and U6. Preserve the matrix as an optional analysis tool and make persistence/scope explicit.
3. **Reading and maintenance:** U8, U9, and U10.

Small follow-ups: consolidate Duplicate and Copy to date into one Copy flow with a default date; turn Plan's “Next action: Upcoming weeks are planned” into a real action such as “Open this week”; correct “1 completed session stay fixed.” These are polish items, not reasons to redesign the information architecture.

For verification, use representative existing records: a completed current-day run, two sessions on one day, a duration-only workout, a mixed distance/time interval template, a phase override, an unplanned target week, and a ride. Check the same workflows on desktop and at 390 × 844. Preserve prescription fidelity and completed-session protection while simplifying the controls.

## Implementation — September 30, 2026

Findings U5, U6, and U7 are implemented and verified in the local checkout; this is not a deployment claim.

- **U5 (revised to preserve the preferred design):** Goal impact remains a visible heatmap at the top of the page, with its original compact cells, colors, month labels, phase rail, row highlighting, and legend. The oversized effective-goal list and extra checks card have been removed. The heatmap opens centered on the current week, retains compact week navigation, and exposes a cell explanation with its source and a separate View week action on tap. Baseline goals and upcoming races sit below it; past races remain available on demand.
- **U6:** Baseline goal additions, edits, and removals remain drafts until Save goals. Cancel changes restores the last saved list; failed saves retain the draft for retry. Plan and phase rows close with Done editing and explicitly say they persist when the plan is saved. Baseline rows identify applicable plan/phase overrides, and scope information remains near the editing controls.
- **U7:** Basic workout duration and race target time use decimal minutes, including 45 and 45.5, with a decimal phone keyboard. Stored seconds, existing clock-form drafts, pace calculations, duration-only sessions, and independently timed/distance-based prescription segments remain supported.

Validation: backend lint and tests (153 passed, 1 skipped); frontend lint, TypeScript checks, all 225 tests, and production build passed. Browser checks used a temporary local preview with synthetic data at desktop size and 390 × 844, covering the restored compact heatmap, current-week centering, and tap explanations. The preceding baseline cancellation/saving and duration checks remain covered, including 45.5 minutes saving as 2,730 seconds. The preview was removed and the browser viewport restored. One existing saved-workout test was corrected to keep the library chooser open instead of selecting Quick session before checking its template.
