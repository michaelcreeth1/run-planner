# Usability and simplicity review — September 9, 2026

The central problem is the amount of training-system knowledge required for ordinary tasks. The app should make reading a workout, adding a simple run, and changing a day feel straightforward. Detailed training control should remain available when the runner needs it.

This is a discussion backlog, not an approved implementation order. No application code or saved training records were changed for this review.

**Roadmap reconciliation:** [The canonical product roadmap](../../homelab/docs/Projects/Run%20Planner%20-%20Product%20Direction%20and%20Roadmap.md) already covered U1–U4 through its reconciliation, planned-workout, week-adjustment, and week-hierarchy phases. U5–U10 have now been incorporated into that roadmap as phase clarifications, cross-cutting interaction requirements, or supporting usability work. This file remains the evidence and detailed rationale rather than a competing implementation plan.

## Scope and confidence

Reviewed the signed-in deployed app at `https://run.creeth.net` on desktop and at a 390 × 844 browser viewport: current week, Today navigation, workout editor, workout action menu, rest-of-week adjustment, plan overview, new-plan draft, goals and a baseline-goal editor, settings, trends, activities, and a future week with targets but no workouts. Opened forms without saving training changes. Phone observations are browser emulation, not a physical-device test.

Also inspected the current local source, the September 5 review, and the September 9 product roadmap. The working tree already contains ongoing implementation. The workout-library destination was absent from deployed navigation during the initial pass and present during the follow-up density pass, so it is treated as in-flight work. Source-only observations below are labeled. The signed-in account has established training data; first-account onboarding and the wife's own experience were not directly tested. These are observed obstacles and usability hypotheses, not measured user-test results.

## Discussion list

| ID | Problem | Proposed simplification | Relative scope |
| --- | --- | --- | --- |
| U1 | Summaries disagree before a user makes changes | Share completion/projection calculations and clearly label target versus schedule | Correctness work; investigate first |
| U2 | Reading a workout opens an editing form | Add a readable workout view and make today's session prominent | Medium |
| U3 | A basic run exposes too many fields and formatting rules | Default to day, type, and distance or duration; reveal optional details | Medium |
| U4 | Moving or reusing a workout requires discovering indirect controls | Add Move to… and Copy to… from the workout, with undo | Medium; depends on identity preservation |
| U5 | An empty schedule is presented as seven rest days and reassuring checks | Distinguish unplanned from intentional rest; keep the target visible | Small–medium |
| U6 | Getting started assumes the user understands full training-plan construction | Offer planning just this week; make full-plan setup a guided optional path | Medium–large |
| U7 | Goals are spread across layers, while analysis dominates goal setup | Lead with goals in plain language and explain where each applies | Medium |
| U8 | Save behavior changes between editors | Make saved/draft states explicit and consistent | Small–medium |
| U9 | Strava controls require technical interpretation | Use one clear Sync now action and hide connection diagnostics | Small–medium |
| U10 | Activity history is difficult to search and its navigation is indirect | Search/group history and label View week explicitly | Small–medium |

Scope estimates are qualitative, not delivery commitments. Several items overlap work already proposed in the roadmap.

## Follow-up: screen density and default hierarchy

The first review underweighted the density of the screens themselves. The follow-up pass asked a different question: what appears simultaneously before the runner requests detail, and how much of it competes with the screen's primary purpose? It rechecked Week, Plan, Goals & races, Progress, Workouts, Settings, and Add session on desktop and at 390 × 844.

The repeated pattern is not simply small text. The app frequently presents context, summaries, history, controls, diagnostics, and editing affordances at the same visual level. Many sections have their own card, border, label, icon, and action. The runner has to infer which one matters now.

### Week

**Observed:** Desktop combines a race/phase/mileage context strip, Today, a long stack of past and future week fingerprints, a selected-week card, four summary columns, checks, seven schedule columns, and a separate month rail. Mobile is better anchored to the selected week, but still presents a phase heading, date, large adjustment button, four metric cells, checks, and the agenda before the runner gets through the week. The mileage and long-run facts repeat across the context strip, week summary, schedule, and timeline. After today's run is complete, the prominent Today card continues to feature the completed run instead of helping with the next session.

**Simplify:** Make the default Week screen: today's workout or next workout, one connected progress sentence, then the schedule. Passing checks should be a quiet collapsed status; expand only exceptions. Move long-range browsing into an invoked timeline or compact nearby-week control, especially on a phone. When today's work is complete, acknowledge it briefly and show what is next. The detailed week metrics remain available from the progress statement.

### Plan

**Observed:** Plan displays metadata, a full 13-week phase chart, and a second phase-grouped set of 13 week cards. The chart and cards both communicate the shape of the same plan. On mobile, the first viewport is spent on switching plans, the active-plan metadata, Create training plan, and the top of the chart; the current phase and the next week needing work are not visible. Create training plan remains as prominent as working with the active plan.

**Simplify:** Lead with the active phase, this week's target, race context, and the next unplanned week. Choose one default plan representation; reveal the full phase/week breakdown from it. Keep full configuration and creating another plan secondary while a plan is active.

### Goals & races

**Observed:** The multi-week goal-impact matrix precedes the goals the runner can change. On a phone, rule labels are truncated, only part of the date range is visible, and the legend adds another interpretation task. Baseline goals and the upcoming race start below the first viewport.

**Simplify:** Show the upcoming race and effective goals first, including their scope and any item needing attention. Replace the default matrix with a short history summary and a **View goal history** action. Keep the complete matrix for analysis after the user asks for it.

### Progress

**Observed:** The phone view starts with seven timeframe buttons, four current/baseline values, a chart with actual/week-to-date/planned/target/baseline series, and a legend. Several values repeat the current Week screen before the trend becomes the focus.

**Simplify:** Use one default timeframe and one compact range control. Let the chart answer one question by default, such as actual mileage trend; make planned and target overlays optional. Express necessary current-week context as one sentence or a selected annotation rather than four tiles.

### Workouts and primary navigation

**Observed:** The in-flight Workouts destination makes five primary destinations. The mobile navigation still uses a four-column grid, so Settings wraps to a second row and the fixed bar consumes more content space. The Workouts screen repeats its destination through the app header, eyebrow, and **Reusable workouts** heading. A saved-workout card offers edit, duplicate, and delete, but no Schedule action. Add session still opens the full blank editor rather than first offering a saved workout or a quick simple run.

**Simplify:** Keep mobile navigation on one row. Prefer exposing saved workouts inside **Add session** and the week planner instead of making the library a fifth primary destination. If the standalone screen remains, place it behind a deliberate secondary destination and make **Schedule…** the card's main action. The Add session choice should be **Quick run** or **Choose saved workout**, followed by the compact form only when needed.

### Settings

**Observed:** A healthy Strava connection shows Granted scopes, Reconnect, Backfill, Refresh, and Disconnect before profile management. About and schema/component versions also appear before Profiles. On a phone these fill most of the first several viewports, while common settings are lower down.

**Simplify:** Put the active profile and ordinary connection status first. Show last sync and one **Sync now** action. Put reconnection, older imports, access scopes, versions, and account administration in secondary or technical sections, appearing prominently only when they require action.

### Cross-screen visual hierarchy

**Observed:** Several screens repeat the app-header destination with an eyebrow and another title. Most content groups use rounded cards or bordered subcards, causing secondary information to feel equally important. Uppercase labels, status pills, icon buttons, legends, and helper text accumulate even when each is individually reasonable.

**Simplify:** Use one strong title, fewer container boundaries, and more whitespace between conceptual levels. Give each screen one primary answer and one obvious action in the first viewport. Use strong color and containers for selection or actionable states; render routine success quietly. Do not repeat the same information in another chart, tile, or summary unless the second representation supports a different decision.

These screen-level requirements were added to the canonical roadmap as cross-screen hierarchy and acceptance criteria. They preserve the underlying training detail; the change is when that detail demands attention.

## U1 — Fix contradictory information before asking users to trust it

**Observed:** On the current week, the board showed **57.6 mi projected**, with **19.6 mi completed**. Merely opening **Adjust rest of week** showed **67.6 mi**, described as **19.6 completed + 48 remaining**. Today's completed 10-mile run appeared as editable remaining work even though the drawer said completed sessions stay fixed. No fields had been changed. The drawer also said **Schedule matches targets**.

**Source corroboration:** `workoutDraftFromWorkout` in [planWeekDrafts.ts](../frontend/src/features/weekPlanner/planWeekDrafts.ts) does not carry the saved workout ID into its returned draft, while `isCompletedDraftWorkout` in [PlanWeekDrawer.tsx](../frontend/src/features/weekPlanner/PlanWeekDrawer.tsx) looks up the saved workout by that ID. This is a concrete explanation to investigate; saving the live draft was deliberately not tested.

Separately, the same week displays a **55-mile plan target**, **57 scheduled miles**, and **57.6 projected miles**. These can coexist, but the compact `19.6 / 57` header does not explain that its denominator is scheduled mileage. The long-run summary says **10 / 13 mi, On track: Morning Run on Wednesday**, although the designated 13-mile long run is Sunday. Plan overview also showed `53 planned · 0 actual` for a past week whose Week screen showed 53.9 miles completed.

**Change:** Use consistent completion and projection definitions across board, editor, plan, and progress. Label the relationship in one place: completed + remaining = projected, alongside the plan target. Show the designated long run separately from the longest activity so far. Preserve workout identity through editing and copying with the appropriate semantics.

**Success:** Opening an unchanged adjustment draft does not change totals. Imported completion agrees across screens. A runner can explain each number without opening another page.

## U2 — Make reading the workout the default

**Observed:** Today now correctly scrolls to the day's card. However, clicking a workout opens **Edit workout**. Instructions are below date, title, session type, three metric fields, workout structure, and purpose. On the phone, the instructions are below the initial viewport. The main current-week action is **Adjust rest of week**, even for someone who only wants to know what to run.

**Change:** Put today's session near the top, with distance or duration, effort/pace when specified, readable instructions, and completion state. Clicking any workout should open that same readable view with an explicit Edit action. Keep the full weekly board and phase timeline available. Show all of today's sessions when there are several.

**Success:** A runner can open the app and understand today's workout without entering edit mode or searching through earlier days. Desktop still supports whole-week planning.

Evidence: [WeekView.tsx](../frontend/src/features/weekBoard/WeekView.tsx), [WorkoutEditor.tsx](../frontend/src/features/workouts/WorkoutEditor.tsx), [WeekContextStrip.tsx](../frontend/src/components/week/WeekContextStrip.tsx).

## U3 — A simple run needs a small form

**Observed:** The workout form presents a long session-type list, Miles, Time in `H:MM:SS`, Pace, optional structure, Purpose, Instructions, and Notes. The helper says **Enter any two**, which can sound like a requirement even when someone only wants to schedule a distance. A basic aerobic run already shows a **1 step** structure panel. Purpose, Instructions, and Notes require the user to decide where their words belong.

**Change:** Default to date, type, and a choice of distance or duration. Keep the generated title unless the user chooses to rename it. Accept friendly duration entry such as minutes. Reveal pace, custom title, purpose, notes, and structured intervals when requested; retain their separate stored meanings. Make distance-only entry explicitly valid. For common runs, show a few familiar choices with the full type list available through More types.

**Success:** Adding a five-mile easy run to a selected day requires choosing the type, entering 5, and saving. No extra fields feel mandatory.

**Source-only caution for ongoing structured-workout work:** Repeat groups currently expose repetitions and the final-recovery option, but render only a count of their inner steps. The inner work/recovery distance, duration, and guidance are not editable in that branch of the local editor. Finish that interaction before treating interval construction as complete. Replace **Extent** with a plain label such as **Measure by**. This is an implementation-in-progress observation, not a claim about a tested deployed interval flow.

Evidence: [WorkoutEditor.tsx](../frontend/src/features/workouts/WorkoutEditor.tsx).

## U4 — Make small scheduling changes direct

**Observed:** A workout's menu offers **Edit session**, **Duplicate**, and **Delete**. There is no Move action or destination choice in the menu. Moving requires discovering the date field in the full editor. Duplicate's destination is not apparent before invoking it.

**Change:** Add **Move to…** and **Copy to…**, each with a day picker; support a short undo opportunity. Keep delete secondary. When relevant, show how a move affects the weekly total or hard-day spacing. Swapping days can follow if actual use warrants it.

**Success:** Moving tomorrow's run to Saturday takes a few obvious taps without opening the full workout form, while preserving its original intent and history.

Evidence: [WeekView.tsx](../frontend/src/features/weekBoard/WeekView.tsx), `duplicateWorkout` in [App.tsx](../frontend/src/App.tsx).

## U5 — Unplanned and rest are different states

**Observed:** An October week with a **56-mile target** and no workouts offers **Plan week**. That opens **Edit week plan**, labels every empty day **Rest**, totals **7 rest days**, and shows **Schedule looks good so far**. The 56-mile target and long-run guidance visible on the board disappear from the drawer's summary.

**Change:** Show **No workout planned** until rest is intentional. Keep the weekly target visible while filling the schedule. Use **Add your first workout** or **Copy a previous week** as clear starting choices. Use a neutral incomplete state until enough schedule exists to evaluate it. Distinguish satisfying a specific limit from having a complete plan.

**Success:** A new user understands that an empty schedule still needs planning and can see how far their draft is from their chosen target.

Evidence: [PlanWeekDrawer.tsx](../frontend/src/features/weekPlanner/PlanWeekDrawer.tsx).

## U6 — Let people start without building a training system

**Observed:** New-plan setup immediately exposes phase names and lengths, starting/ending mileage, down-week cadence, automatic long-run targets, and recurring goals. Creating another plan remains a prominent action despite an active plan. The default new-plan dates overlapped the existing plan and immediately produced a preview error. This is a preventable starting state for an established user.

**Source-only onboarding observation:** With no plan, the context strip prompts **Create a plan to anchor your weeks to a race and a training phase**. A fresh-account walkthrough remains to be tested.

**Change:** Offer **Plan this week** as a useful entry point without requiring a full plan. For a longer plan, guide the user through goal/date and the training structure they want, with an editable preview; retain direct phase configuration. Do not silently prescribe new training to achieve UI simplicity. For existing users, emphasize the active phase and next week needing workouts. Create-another-plan should use valid dates or explain the conflict before showing an unusable preview.

**Success:** A first-time user can schedule their next run before learning what a phase or recurring goal means.

Evidence: [PlansView.tsx](../frontend/src/features/plans/PlansView.tsx), [buildWeekContextStrip.ts](../frontend/src/features/weekBoard/buildWeekContextStrip.ts).

## U7 — Make goals understandable where they take effect

**Observed:** Goals & races opens with a large history matrix ahead of editable **Baseline goals** and races. Plan editing has **Recurring goals**, and weeks have their own targets/checks. The matrix contains **Long run scheduled** and **Down-week rhythm** in addition to the visible baseline goals. A user must work out which screen controls a rule and whether a change applies to one week or many.

**Change:** Lead with readable current goals/preferences; put the history matrix under **See goal history**. Show scope and origin alongside each effective rule, for example **Every week**, **This plan**, or **This week only**, with a direct edit link. Explain overrides and the affected dates before applying broad changes. Favor **Needs review** over undifferentiated failure language for advisory checks, while retaining the factual reason.

**Success:** A user can change the intended week's target and predict which other weeks will be affected. The matrix remains available for detailed review.

Evidence: [GoalsView.tsx](../frontend/src/features/goals/GoalsView.tsx), [GoalImpactSection.tsx](../frontend/src/features/goals/GoalImpactSection.tsx), [PlansView.tsx](../frontend/src/features/plans/PlansView.tsx).

## U8 — Make saving predictable

**Observed/source-confirmed:** Workout and plan forms use explicit Save/Cancel. Baseline goals save after a 650 ms delay; **Done** closes the inline editor rather than serving as the save transaction. Before editing, there is no persistent **Changes save automatically** explanation. New-plan setup shows **Unsaved changes** immediately and prompts on cancellation even when no field was touched.

**Change:** Use explicit Save/Cancel for multi-field goal edits, or clearly identify autosave and show its status from the outset. Avoid destructive-sounding warnings for untouched generated drafts. Keep the existing protection for edits the user actually made.

**Success:** Before changing anything, users know whether leaving the screen saves or discards their work.

Evidence: [DefaultGoalsCard.tsx](../frontend/src/features/goals/DefaultGoalsCard.tsx), [GoalListEditor.tsx](../frontend/src/features/goals/GoalListEditor.tsx), [PlansView.tsx](../frontend/src/features/plans/PlansView.tsx).

## U9 — Strava should answer “where is my run?”

**Observed:** A connected account offers **Reconnect Strava**, **Backfill 180 days**, **Refresh**, and **Disconnect**, and shows **Granted scopes**. Refresh reloads status and stored activities; its name can suggest importing a missing run. Connection diagnostics and component/schema versions compete with ordinary settings.

**Change:** Show connection state and last successful import, with **Sync now** as the obvious action. Keep **Import older activities** secondary and put scopes/versions under technical details. Offer reconnection when it is needed. Use precise action labels and surface success or a useful next step when an import fails.

**Success:** A person with a missing activity can choose the right action without understanding backfills or API scopes.

Evidence: [SettingsView.tsx](../frontend/src/features/settings/SettingsView.tsx).

## U10 — Make history easier to find and open

**Observed:** Activities is a flat list of 100 entries, many named Morning Run, without search or date/sport filters. Mobile units are now present. The chevron opens the containing week, not activity details; the visible control does not explain that destination. Rides also display running-style pace per mile.

**Change:** Start with search and month/week grouping, then a simple sport filter. Show **View week** visibly, or let the row open activity details with a separate week action. Use sport-appropriate metrics. Avoid adding another dashboard just to solve retrieval.

**Success:** A runner can find a remembered workout without scanning the full list and can predict where tapping it will go.

Evidence: [ActivitiesView.tsx](../frontend/src/features/activities/ActivitiesView.tsx).

## Watch the new library workflow

**Observed during the follow-up pass:** The in-flight navigation adds **Workouts**, which actually contains reusable templates; scheduled workouts remain under Week and imported activities under Progress. Library cards expose edit, duplicate, and delete but no direct scheduling action. Labels such as **mi known** and **blocks** expose the storage model. On mobile, the fifth destination wraps Settings onto a second row because the navigation grid still has four columns.

Keep reuse close to **Add session** and provide **Save as reusable workout** from an existing session. Prefer **Workout library** or **Saved workouts** when a destination label is needed, and offer **Schedule…** from each template. Distinguish a template from a dated workout through clear wording. Unless user testing shows the library deserves daily prominence, keep it contextual instead of expanding primary navigation.

Evidence: [WorkoutLibraryView.tsx](../frontend/src/features/workouts/WorkoutLibraryView.tsx), [App.tsx](../frontend/src/App.tsx).

## Improvements already present

Do not re-file the September 5 findings as though nothing changed: Today jumps to the day; mobile keeps its workout name; workout Save is sticky; Escape dismissal and initial focus worked in the tested workout editor; current/future occupied days have Add session; checks start collapsed; mobile activities have units; trends label week-to-date; the goals summary separates pending weeks. The roadmap already supports direct adjustments and a clearer week hierarchy.

## Suggested prioritization conversation

Investigate **U1** as a correctness issue. For the biggest daily usability improvement, discuss **U2 + U3 + U4** together: read today's workout, add a simple run, and move a session. **U5 + U6** improve planning and onboarding; **U7 + U8** reduce configuration uncertainty; **U9 + U10** simplify occasional tasks. These are proposed groupings, not an implementation commitment or a rewrite of the canonical roadmap.

Before finalizing order, a short observed session with the wife would be especially useful: ask her to find today's instructions, add an easy run, move it to another day, and explain the weekly mileage. Avoid coaching during the tasks. Note hesitation, wrong turns, and whether the displayed result matches her expectation. Repeat those same tasks after the selected changes.
