# Frontend and workflow review — September 5, 2026

The app has a coherent visual foundation: restrained colors, clear primary navigation, a useful training-phase chart, and a sensible distinction between planning, current-week adjustment, and historical review. The biggest opportunities are making daily use easier, improving readability, and ensuring that summaries tell a consistent story.

This review used the current local checkout in a browser at 1280 × 720 and 390 × 844. It covered current, past, and unplanned future weeks; workout and week editors; training plans; goals and races; trends; activities; and settings. Dark mode was the main review environment, with a light-mode spot check. A temporary local database contained a sample twelve-week plan, six weeks of workouts, and 24 sample activities. The deployed app was behind sign-in. Live Strava synchronization, production data, native phone behavior, and performance under a large history were not tested. No application source or live training data was changed.

1. **High priority: make completion summaries agree.**

   The past-week review displayed “Completed sessions: 1” and “6 scheduled,” while its goal outcomes displayed “Training sessions: 6 against 6 sessions.” The sample had five imported runs and one manually completed strength session. The review counter only checks saved workout statuses, while other summaries include imported activities. A user cannot confidently review a week when these numbers disagree.

   Use a shared definition of completed sessions, including activity matches and manual completions without double counting. Also audit hard-day and recovery counts: the timeline showed “1 hard” while the review showed “2 / 2 hard.” Different definitions may be intentional, but they need different labels or a shared calculation.

   Evidence: `frontend/src/features/weekPlanner/PlanWeekDrawer.tsx:760`; `frontend/src/features/weekGoals/buildWeekCommandCenterViewModel.ts:1000`.

2. **High priority: give mobile users a useful Today view.**

   At phone width, the current-week screen places the summary and checks above a Monday-first schedule. On Saturday, today's workout is several day cards down. The compact Today button hides the workout name and opens the workout editor when a workout exists. That behavior is hard to predict from the word “Today.”

   Put a compact card near the top with today's session, distance, pace, and instructions. Offer explicit “View workout,” “Edit,” and completion actions. Keep “Go to today” as a consistent navigation action. Preserve the full weekly schedule below, with an option to collapse elapsed days.

   Evidence: `frontend/src/components/week/WeekContextStrip.tsx:110`; `frontend/src/features/weekBoard/WeekView.tsx:610`.

3. **High priority: stop compressing the desktop schedule beyond readability.**

   At 1280 px wide with the sidebar expanded, seven day columns leave little room for workout content. Ordinary names such as Tempo intervals, Recovery run, and Long run were visibly truncated. Distance, pace, original-plan details, and heart rate compete in small text inside several nested borders. Completed workouts are visually subdued even though their details remain useful.

   Give cards a minimum readable width and switch to an agenda layout when seven columns no longer fit. Prioritize the workout name, one main metric line, and a clear status. Reveal secondary planned-versus-actual detail on selection. Reduce nested outlines and keep essential text legible in both themes.

   Evidence: `frontend/src/styles.css:2433`, `frontend/src/styles.css:3272`, and `frontend/src/styles.css:3320`.

4. **High priority: align “Adjust rest of week” with what the editor actually allows.**

   The adjustment drawer presents editable Monday–Sunday sessions, including the imported runs already completed earlier in the current week. It starts at Monday and does not visually separate completed work from remaining work.

   Default the editor to the remaining days, summarize completed sessions separately, and make any changes to earlier planned sessions an explicit secondary action. Show how a proposed change affects the week before saving: completed mileage + remaining scheduled mileage = projected total, compared with the plan target. Keep the existing sticky save/cancel footer.

   Evidence: `frontend/src/features/weekPlanner/PlanWeekDrawer.tsx:99` and `frontend/src/features/weekPlanner/PlanWeekDrawer.tsx:172`.

5. **High priority: standardize drawer behavior and protect unsaved work.**

   Opening the adjustment drawer left keyboard focus on the obscured background button. Escape did not dismiss the drawer. The overlay uses an aside without dialog semantics. Source inspection also shows that closing workout and week editors clears the draft directly. The workout editor's Save button falls below the initial phone viewport, unlike the week editor's persistent footer. Its title helper text overlaps the field border slightly.

   Use a shared dialog/drawer component with initial focus, contained keyboard navigation, focus restoration, Escape handling, and an inert background. Preserve a draft or confirm discarding it only when it has changed. Give all editors consistent sticky actions. Remove the negative helper-text spacing inside labels.

   Evidence: `frontend/src/features/workouts/WorkoutEditor.tsx:32`; `frontend/src/App.tsx:1384`; `frontend/src/App.tsx:1410`; `frontend/src/styles.css:3472`.

6. **High priority: restore units in mobile activities.**

   Mobile removes the table header but leaves rows such as “5.2  9:20/mi  145.” Distance and heart rate have lost their labels. The only navigation control is a 30 × 30 px diagonal arrow that opens the containing week; its appearance can suggest an external link.


   Render explicit values such as “5.2 mi · 9:20/mi · 145 bpm.” Use a larger tap area and label the destination as “View week,” or open activity details from the entire row and provide a separate week link.

   Evidence: `frontend/src/features/activities/ActivitiesView.tsx:57`; `frontend/src/styles.css:6621`. Arrow size was measured in the rendered DOM.

7. **Medium priority: explain mileage and long-run summaries consistently.**

   The current-week header displayed 20.5 / 30 mi, the week summary displayed 30.5 mi projected, and the plan target was 32 mi elsewhere. These values can all be valid, but the denominator and purpose are not apparent. The long-run summary displayed 5.9 / 10 mi with “On track: Tempo intervals on Tuesday,” even though the designated 10-mile long run was scheduled for Saturday.

   Use consistent labels for completed, scheduled, projected, and target mileage. Prefer a compact sentence such as “20.5 completed + 10 remaining = 30.5 projected · target 32.” Show the designated long run and its status; use “Longest run so far” when describing the largest completed activity.

   Evidence: `frontend/src/features/weekGoals/buildWeekCommandCenterViewModel.ts:388` and `frontend/src/features/weekGoals/buildWeekCommandCenterViewModel.ts:906`.

8. **Medium priority: distinguish partial weeks and pending weeks from poor results.**

   The mileage chart joins the current week's 20.5 miles to prior full weeks of 30.4 miles using the same actual line, producing an apparent decline before the week is finished. The goals matrix displays “Healthy 0 / 20 weeks” even though 14 of those weeks are pending. A user must mentally correct both displays.

   Mark the current chart point as “Week to date” and distinguish its segment visually. Keep full-week comparisons separate. Calculate the goals score over evaluated weeks and show pending weeks separately. “Weeks meeting all checks” also describes the metric more precisely than “Healthy.”

   Evidence: `frontend/src/features/analytics/AnalyticsView.tsx:143`; `frontend/src/features/goals/GoalImpactSection.tsx:172`.

9. **Medium priority: make small scheduling changes available directly from a day.**

   The weekly board only shows Add session on an empty day. Adding strength to a day that already has a run requires opening the week editor and finding that day's small plus control. Moving a workout is available through changing its date in the editor, but there is no obvious move action on the card.

   Show a consistent add action on every editable day. Add a “Move to…” action or a simple date picker to the workout menu, with a brief undo opportunity after a move. Let duplication offer a destination date. These changes would shorten common scheduling adjustments without requiring a more complex planner.

   Evidence: `frontend/src/features/weekBoard/WeekView.tsx:640`; `frontend/src/features/workouts/WorkoutEditor.tsx:45`.

10. **Medium priority: improve goals and activity exploration.**

    The goals matrix compresses many weeks into faint colored cells with sparse visible date labels; a long goal label is truncated. The activities screen is a flat list with no search, date filter, sport filter, or date grouping. These screens become harder to scan as history grows.

    Give matrix selection a clear detail panel with the full goal, week dates, result, and appropriate action. Add visible symbols alongside color, and use “Review” for past-week checks that cannot be edited. For activities, start with search and month/week grouping, then add date and sport filters as the data warrants.

    Evidence: `frontend/src/features/goals/GoalImpactSection.tsx`; `frontend/src/features/activities/ActivitiesView.tsx`.

11. **Medium priority: prioritize the active plan and simplify settings.**

    With an active plan, Create training plan remains the dominant page action. On mobile, plan metadata stacks into a long column before the phase chart. Edit plan initially selects the first phase even when the current phase is Build. Settings places component/schema versions before profile management and exposes terms such as Granted scopes and Backfill 180 days.

    Emphasize the active phase and the next unplanned week; make creating another plan secondary. Condense mobile plan metadata and open the editor on the relevant phase. Put profile and connection tasks ahead of diagnostics, rename backfill to “Import last 6 months,” and place technical connection details in an expandable section.

    Evidence: `frontend/src/features/plans/PlansView.tsx`; `frontend/src/features/settings/SettingsView.tsx:209`; `frontend/src/features/settings/SettingsView.tsx:270`.

12. **Later opportunity: make weekly review capture a decision.**

    The current review is a read-only outcome summary followed by Complete review. It is a useful checkpoint, but it does not capture a reflection or the reason for next week's adjustment.

    Add an optional short note and a next-week intention, such as keeping the plan or reviewing the remaining schedule. Preserve the existing review-to-next-week handoff and carry relevant context into it. Keep this lightweight so review does not become administrative work.

    Evidence: `frontend/src/features/weekPlanner/PlanWeekDrawer.tsx:745` and `frontend/src/components/week/WeekReviewHandoff.tsx`.

**Suggested implementation order:** first fix contradictory counts, mobile units, and drawer behavior; then improve the Today experience and card readability; then refine week adjustment, chart interpretation, and history exploration. Preserve the existing navigation and phase visualization while making these targeted changes.
