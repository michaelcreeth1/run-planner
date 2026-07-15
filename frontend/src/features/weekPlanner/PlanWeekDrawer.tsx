import { AlertTriangle, CheckCircle2, ChevronDown, Ellipsis, Plus, Save, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type {
  PlanStartingPoint,
  PlanWeekDraft,
  PlanWeekGoalDraft,
  PlanWeekWorkoutDraft,
  TrainingWeek,
  WeekGoalCategory,
  WeekPurposeId
} from "../../types/domain";
import { addDays } from "../../lib/dates";
import { formatCompactWeekRange, formatNumber, formatWeekday } from "../../lib/formatters";
import { sessionTypeForWorkout, sessionTypeGroups, sessionTypes, weekPurposes } from "../../lib/options";
import {
  countDraftHardSessions,
  draftGoalTitle,
  effectiveWorkoutSport,
  evaluatePlanAlignment,
  formatGuardrailDraft,
  newWorkoutDraft,
  rebuildPlanWeekDraftForStartingPoint,
  scaleDraftWorkoutsToMileage,
  sortDraftWorkouts,
  startingPointOptions,
  suggestLoad,
  sumDraftRunDistance
} from "./planWeekDrafts";

export function PlanWeekDrawer({
  draft,
  isSaving,
  onClose,
  onCompleteReview,
  onSave,
  setDraft,
  weekStack
}: {
  draft: PlanWeekDraft;
  isSaving: boolean;
  onClose: () => void;
  onCompleteReview: (weekId: string) => void;
  onSave: (draft: PlanWeekDraft) => void;
  setDraft: Dispatch<SetStateAction<PlanWeekDraft | null>>;
  weekStack: Record<string, TrainingWeek>;
}) {
  const alignment = evaluatePlanAlignment(draft);
  const mismatches = alignment.filter((item) => item.status === "mismatch");
  const passedChecks = alignment.length - mismatches.length;
  const achievementGoals = draft.goals.filter((goal) => goal.goalType === "achievement");
  const guardrailGoals = draft.goals.filter((goal) => goal.goalType === "guardrail");
  const scheduledMileage = sumDraftRunDistance(draft.workouts);
  const scheduledQuality = countDraftHardSessions(draft.workouts);
  const scheduledSessions = draft.workouts.filter((workout) => effectiveWorkoutSport(workout) !== "rest").length;
  const purpose = weekPurposes.find((option) => option.value === draft.purpose) ?? weekPurposes[0];
  const drawerTitle =
    draft.weekState === "past"
      ? "Review week"
      : draft.weekState === "current"
      ? "Adjust rest of week"
      : draft.hasExistingPlan
      ? "Edit plan"
      : "Plan week";

  if (draft.weekState === "past") {
    return (
      <PastWeekReviewDrawer
        isSaving={isSaving}
        onClose={onClose}
        onComplete={() => onCompleteReview(draft.weekId)}
        week={weekStack[draft.weekStartDate]}
        weekEndDate={draft.weekEndDate}
        weekStartDate={draft.weekStartDate}
      />
    );
  }

  function updateDraft(updater: (current: PlanWeekDraft) => PlanWeekDraft) {
    setDraft((current) => (current ? updater(current) : current));
  }

  function replaceFromStartingPoint(startingPoint: PlanStartingPoint) {
    updateDraft((current) => rebuildPlanWeekDraftForStartingPoint(current, startingPoint, weekStack));
  }

  function updatePurpose(purposeValue: WeekPurposeId) {
    updateDraft((current) => {
      const nextLoad = suggestLoad(current.load.priorMileage, purposeValue, current.workouts);
      return {
        ...current,
        purpose: purposeValue,
        load: nextLoad
      };
    });
  }

  function updateGoal(goalDraftId: string, updates: Partial<PlanWeekGoalDraft>) {
    updateDraft((current) => ({
      ...current,
      goals: current.goals.map((goal) =>
        goal.draftId === goalDraftId
          ? { ...goal, ...updates, manuallyEdited: true, source: "manual", sourceLabel: "Edited" }
          : goal
      )
    }));
  }

  function updateWorkout(workoutDraftId: string, updates: Partial<PlanWeekWorkoutDraft>) {
    updateDraft((current) => ({
      ...current,
      workouts: current.workouts.map((workout) =>
        workout.draftId === workoutDraftId ? { ...workout, ...updates } : workout
      )
    }));
  }

  function updateWorkoutType(workoutDraftId: string, sessionTypeValue: string) {
    const sessionType = sessionTypes.find((option) => option.value === sessionTypeValue);
    if (!sessionType) {
      return;
    }
    updateDraft((current) => ({
      ...current,
      workouts: current.workouts.map((workout) => {
        if (workout.draftId !== workoutDraftId) {
          return workout;
        }
        const currentSessionType = sessionTypeForWorkout(workout);
        const keepRunMetrics = sessionType.sport === "run" && currentSessionType.sport === "run";
        return {
          ...workout,
          sport: sessionType.sport,
          workoutType: sessionType.workoutType,
          intensityCategory: sessionType.intensityCategory,
          plannedDistance: keepRunMetrics ? workout.plannedDistance : "",
          plannedPace: keepRunMetrics ? workout.plannedPace : ""
        };
      })
    }));
  }

  function removeWorkout(workoutDraftId: string) {
    updateDraft((current) => ({
      ...current,
      workouts: current.workouts.filter((workout) => workout.draftId !== workoutDraftId)
    }));
  }

  function addWorkout(dateValue: string) {
    updateDraft((current) => {
      const workouts = current.workouts.filter(
        (workout) => workout.plannedDate !== dateValue || effectiveWorkoutSport(workout) !== "rest"
      );
      const lastDayIndex = workouts.reduce(
        (lastIndex, workout, index) => (workout.plannedDate === dateValue ? index : lastIndex),
        -1
      );
      const nextDayIndex = workouts.findIndex((workout) => workout.plannedDate > dateValue);
      const insertionIndex = lastDayIndex >= 0 ? lastDayIndex + 1 : nextDayIndex >= 0 ? nextDayIndex : workouts.length;
      return {
        ...current,
        workouts: [
          ...workouts.slice(0, insertionIndex),
          newWorkoutDraft(dateValue),
          ...workouts.slice(insertionIndex)
        ]
      };
    });
  }

  function updateTargetToSchedule(category: WeekGoalCategory) {
    updateDraft((current) => {
      const scheduleValue = goalValueFromSchedule(current, category);
      return {
        ...current,
        goals: current.goals.map((goal) => {
          if (goal.goalType !== "achievement" || goal.category !== category) {
            return goal;
          }

          return {
            ...goal,
            targetValue: String(scheduleValue),
            minAcceptable: goal.evaluationMode === "at_most" ? "" : String(scheduleValue),
            maxAcceptable: goal.evaluationMode === "at_least" ? "" : String(scheduleValue),
            manuallyEdited: true,
            source: "workouts",
            sourceLabel: "Schedule"
          };
        })
      };
    });
  }

  function adjustScheduleToTarget(category: WeekGoalCategory) {
    updateDraft((current) => {
      const goal = current.goals.find(
        (candidate) => candidate.goalType === "achievement" && candidate.category === category
      );
      const target = goalTarget(goal);
      if (target === null || target <= 0) {
        return current;
      }

      if (category === "mileage") {
        return {
          ...current,
          workouts: scaleDraftWorkoutsToMileage(current.workouts, target).sort(sortDraftWorkouts)
        };
      }

      if (category === "long_run") {
        const longestRun = current.workouts
          .filter((workout) => effectiveWorkoutSport(workout) === "run")
          .sort((left, right) => Number(right.plannedDistance || 0) - Number(left.plannedDistance || 0))[0];
        if (!longestRun) {
          return current;
        }
        return {
          ...current,
          workouts: current.workouts.map((workout) =>
            workout.draftId === longestRun.draftId ? { ...workout, plannedDistance: String(target) } : workout
          )
        };
      }

      return current;
    });
  }

  return (
    <div className="editor-backdrop">
      <aside className="editor-panel plan-week-panel" aria-label={drawerTitle}>
        <header>
          <div>
            <h2>{drawerTitle}</h2>
            <span>{formatCompactWeekRange(draft.weekStartDate, draft.weekEndDate)}</span>
          </div>
          <button type="button" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="plan-week-body">
          <section className="plan-week-section plan-week-direction">
            <div className="section-heading">
              <h3>Week direction</h3>
            </div>
            <div className="week-direction-controls">
              <label>
                <span>Starting point</span>
                <select
                  value={draft.startingPoint}
                  onChange={(event) => replaceFromStartingPoint(event.target.value as PlanStartingPoint)}
                >
                  {startingPointOptions(draft).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Purpose</span>
                <select value={draft.purpose} onChange={(event) => updatePurpose(event.target.value as WeekPurposeId)}>
                  {weekPurposes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {draft.purpose === "custom" ? (
              <label>
                <span>Custom purpose</span>
                <input
                  value={draft.customPurpose}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      customPurpose: event.target.value
                    }))
                  }
                />
              </label>
            ) : null}
            {draft.noPriorUsableWeek ? (
              <p className="plan-week-note">No prior usable week was found, so this draft starts blank.</p>
            ) : null}
            <p className="plan-week-note">
              {purpose.meaning} Load direction: {purpose.loadDirection}.
            </p>
          </section>

          <section className="plan-week-section plan-summary-section">
            <div className="section-heading">
              <h3>Plan summary</h3>
            </div>
            <div className="plan-summary-grid">
              <div>
                <span>Scheduled mileage</span>
                <strong>{formatNumber(scheduledMileage)} mi</strong>
                <small>The total of the run sessions below</small>
              </div>
              <div>
                <span>Schedule</span>
                <strong>{scheduledSessions} session{scheduledSessions === 1 ? "" : "s"}</strong>
                <small>{scheduledQuality} hard session{scheduledQuality === 1 ? "" : "s"}</small>
              </div>
              <div>
                <span>Direction</span>
                <strong>{formatNumber(draft.load.suggestedMileage)} mi</strong>
                <small>
                  {draft.load.priorMileage === null
                    ? "No prior load"
                    : `${formatNumber(draft.load.priorMileage)} mi prior week`}
                </small>
              </div>
            </div>
            <p className="plan-week-note">{draft.load.reason}</p>
          </section>

          <section className="plan-week-section schedule-section">
            <div className="section-heading schedule-section-heading">
              <div>
                <h3>Schedule</h3>
                <small>Edit each session directly. Mileage only applies to running sessions.</small>
              </div>
            </div>
            <div className="schedule-draft-column-labels" aria-hidden="true">
              <span />
              <div>
                <span>Name</span>
                <span>Type</span>
                <span>Mileage</span>
                <span>Actions</span>
              </div>
            </div>
            <div className="schedule-draft">
              {Array.from({ length: 7 }, (_, index) => addDays(draft.weekStartDate, index)).map((dateValue) => {
                const dayWorkouts = draft.workouts.filter(
                  (workout) => workout.plannedDate === dateValue && effectiveWorkoutSport(workout) !== "rest"
                );
                return (
                  <div className="schedule-draft-day" key={dateValue}>
                    <div className="schedule-day-heading">
                      <strong>{formatWeekday(dateValue)}</strong>
                      <button
                        aria-label={`Add session to ${formatWeekday(dateValue)}`}
                        className="schedule-day-add"
                        title={`Add session to ${formatWeekday(dateValue)}`}
                        type="button"
                        onClick={() => addWorkout(dateValue)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="schedule-draft-sessions">
                      {dayWorkouts.length ? (
                        dayWorkouts.map((workout, workoutIndex) => {
                          const sessionType = sessionTypeForWorkout(workout);
                          const fieldPrefix = `${formatWeekday(dateValue)} session ${workoutIndex + 1}`;
                          return (
                            <div className="schedule-draft-workout" key={workout.draftId}>
                              <input
                                aria-label={`${fieldPrefix} name`}
                                className="session-name-input"
                                placeholder="Session name"
                                value={workout.title}
                                onChange={(event) => updateWorkout(workout.draftId, { title: event.target.value })}
                              />
                              <select
                                aria-label={`${fieldPrefix} type`}
                                className="session-type-select"
                                value={sessionType.value}
                                onChange={(event) => updateWorkoutType(workout.draftId, event.target.value)}
                              >
                                {sessionTypeGroups.map((group) => (
                                  <optgroup key={group.label} label={group.label}>
                                    {group.options
                                      .filter((option) => option.sport !== "rest")
                                      .map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                  </optgroup>
                                ))}
                              </select>
                              {sessionType.sport === "run" ? (
                                <label className="session-mileage-field" title="Session mileage">
                                  <input
                                    aria-label={`${fieldPrefix} mileage`}
                                    min="0"
                                    step="0.1"
                                    type="number"
                                    value={workout.plannedDistance}
                                    onChange={(event) =>
                                      updateWorkout(workout.draftId, { plannedDistance: event.target.value })
                                    }
                                  />
                                  <span>mi</span>
                                </label>
                              ) : (
                                <span className="session-mileage-not-applicable">—</span>
                              )}
                              <details className="overflow-menu session-overflow-menu">
                                <summary
                                  aria-label={`Actions for ${fieldPrefix}`}
                                  title={`${workout.title || fieldPrefix} actions`}
                                >
                                  <Ellipsis size={15} />
                                </summary>
                                <div>
                                  <button
                                    aria-label={`Remove ${fieldPrefix}`}
                                    type="button"
                                    onClick={() => removeWorkout(workout.draftId)}
                                  >
                                    Remove session
                                  </button>
                                </div>
                              </details>
                            </div>
                          );
                        })
                      ) : (
                        <div className="schedule-rest-row">
                          <span className="schedule-rest">Rest</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="plan-week-section exception-review-section">
            <div className="section-heading">
              <h3>Review</h3>
            </div>
            <div className={`alignment-summary${mismatches.length ? "" : " alignment-summary--passed"}`}>
              <strong>
                {mismatches.length
                  ? `${mismatches.length} exception${mismatches.length === 1 ? "" : "s"} to review`
                  : "Everything lines up"}
              </strong>
              <span>{passedChecks} check{passedChecks === 1 ? "" : "s"} passed</span>
            </div>
            <p className="plan-week-note">These checks are advisory and never prevent you from saving the plan.</p>
            <div className="review-disclosures">
              <details className="review-disclosure">
                <summary>
                  <div>
                    <strong>Targets</strong>
                    <small>{achievementGoals.length} configured</small>
                  </div>
                  <ChevronDown size={16} />
                </summary>
                <div className="review-disclosure-content draft-goal-list">
                  {achievementGoals.map((goal) => (
                    <DraftGoalEditor
                      goal={goal}
                      key={goal.draftId}
                      onChange={(updates) => updateGoal(goal.draftId, updates)}
                    />
                  ))}
                  {!achievementGoals.length ? <p className="plan-week-note">No targets are set for this week.</p> : null}
                </div>
              </details>
              <details className="review-disclosure">
                <summary>
                  <div>
                    <strong>Guardrails</strong>
                    <small>{guardrailGoals.length} configured</small>
                  </div>
                  <ChevronDown size={16} />
                </summary>
                <div className="review-disclosure-content guardrail-draft-list">
                  {guardrailGoals.map((goal) => (
                    <div className="guardrail-draft" key={goal.draftId}>
                      <strong>{goal.label}</strong>
                      <span>{formatGuardrailDraft(goal)}</span>
                    </div>
                  ))}
                  {!guardrailGoals.length ? <p className="plan-week-note">No guardrails are set for this week.</p> : null}
                </div>
              </details>
            </div>
            {mismatches.length ? (
              <div className="alignment-list alignment-list--exceptions">
                {mismatches.map((item) => {
                  const category = item.id as WeekGoalCategory;
                  const adjustmentTarget = goalTarget(
                    achievementGoals.find((goal) => goal.category === category)
                  );
                  const canAdjustSchedule =
                    ["mileage", "long_run"].includes(category) &&
                    adjustmentTarget !== null &&
                    adjustmentTarget > 0 &&
                    draft.workouts.some((workout) => effectiveWorkoutSport(workout) === "run");
                  return (
                    <div className="alignment-item alignment-item--mismatch" key={item.id}>
                      <AlertTriangle size={16} />
                      <div className="alignment-item-copy">
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </div>
                      <div className="mismatch-actions">
                        {canAdjustSchedule ? (
                          <button type="button" onClick={() => adjustScheduleToTarget(category)}>
                            Match schedule to target
                          </button>
                        ) : null}
                        <button type="button" onClick={() => updateTargetToSchedule(category)}>
                          Update target
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>

        <div className="editor-actions plan-week-actions">
          <button type="button" onClick={onClose}>
            <X size={17} />
            <span>Cancel</span>
          </button>
          <button className="primary" disabled={isSaving} type="button" onClick={() => onSave(draft)}>
            <Save size={17} />
            <span>{isSaving ? "Saving" : "Save changes"}</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

function goalValueFromSchedule(draft: PlanWeekDraft, category: WeekGoalCategory) {
  if (category === "mileage") {
    return sumDraftRunDistance(draft.workouts);
  }
  if (category === "quality") {
    return countDraftHardSessions(draft.workouts);
  }
  if (category === "long_run") {
    return Math.max(
      ...draft.workouts
        .filter((workout) => effectiveWorkoutSport(workout) === "run")
        .map((workout) => Number(workout.plannedDistance || 0)),
      0
    );
  }
  if (category === "recovery") {
    const trainingDays = new Set(
      draft.workouts
        .filter((workout) => effectiveWorkoutSport(workout) !== "rest")
        .map((workout) => workout.plannedDate)
    );
    return Array.from({ length: 7 }, (_, index) => addDays(draft.weekStartDate, index)).filter(
      (dateValue) => !trainingDays.has(dateValue)
    ).length;
  }
  if (category === "sessions") {
    return draft.workouts.filter((workout) => effectiveWorkoutSport(workout) !== "rest").length;
  }
  if (category === "strength") {
    return draft.workouts.filter((workout) => effectiveWorkoutSport(workout) === "strength").length;
  }
  return 0;
}

function goalTarget(goal: PlanWeekGoalDraft | undefined) {
  if (!goal) {
    return null;
  }
  const rawValue = goal.targetValue || goal.minAcceptable || goal.maxAcceptable;
  if (!rawValue) {
    return null;
  }
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function PastWeekReviewDrawer({
  isSaving,
  onClose,
  onComplete,
  week,
  weekEndDate,
  weekStartDate
}: {
  isSaving: boolean;
  onClose: () => void;
  onComplete: () => void;
  week: TrainingWeek | undefined;
  weekEndDate: string;
  weekStartDate: string;
}) {
  const completedWorkouts = week?.workouts.filter((workout) => workout.status.startsWith("completed")).length ?? 0;
  const goalOutcomes = week?.goalEvaluations ?? [];

  return (
    <div className="editor-backdrop">
      <aside className="editor-panel plan-week-panel" aria-label="Review week">
        <header>
          <div>
            <h2>Review week</h2>
            <span>{formatCompactWeekRange(weekStartDate, weekEndDate)}</span>
          </div>
          <button type="button" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="plan-week-body">
          <section className="plan-week-section">
            <div className="section-heading">
              <span>1</span>
              <h3>Week outcomes</h3>
            </div>
            <p className="plan-week-note">
              This review is read-only. Completing it records the review without changing historical sessions, goals, or workout details.
            </p>
            <div className="proposed-load">
              <div>
                <span>Planned mileage</span>
                <strong>{formatNumber(week?.plannedMileage ?? 0)} mi</strong>
              </div>
              <div>
                <span>Actual mileage</span>
                <strong>{formatNumber(week?.actualMileage ?? 0)} mi</strong>
              </div>
              <div>
                <span>Completed sessions</span>
                <strong>{completedWorkouts}</strong>
                <small>{week?.workouts.length ?? 0} scheduled</small>
              </div>
            </div>
          </section>

          <section className="plan-week-section">
            <div className="section-heading">
              <span>2</span>
              <h3>Goal outcomes</h3>
            </div>
            {goalOutcomes.length ? (
              <div className="alignment-list">
                {goalOutcomes.map((evaluation) => (
                  <div className={`alignment-item alignment-item--${evaluation.status === "achieved" ? "aligned" : "mismatch"}`} key={evaluation.goalId}>
                    {evaluation.status === "achieved" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <div>
                      <strong>{evaluation.summary}</strong>
                      {evaluation.detail ? <span>{evaluation.detail}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="plan-week-note">No weekly goals were set. Review the activity totals before planning the next week.</p>
            )}
          </section>
        </div>

        <div className="editor-actions plan-week-actions">
          <button type="button" onClick={onClose}>
            <X size={17} />
            <span>Close</span>
          </button>
          <button className="primary" disabled={isSaving} type="button" onClick={onComplete}>
            <CheckCircle2 size={17} />
            <span>{isSaving ? "Saving" : "Complete review"}</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

function DraftGoalEditor({
  goal,
  onChange
}: {
  goal: PlanWeekGoalDraft;
  onChange: (updates: Partial<PlanWeekGoalDraft>) => void;
}) {
  return (
    <article className="draft-goal">
      <header>
        <strong>{draftGoalTitle(goal)}</strong>
        <span>{goal.sourceLabel}</span>
      </header>
      {goal.category === "mileage" ? (
        <div className="form-grid form-grid--three">
          <label>
            <span>Minimum mileage</span>
            <input type="number" step="0.1" value={goal.minAcceptable} onChange={(event) => onChange({ minAcceptable: event.target.value })} />
          </label>
          <label>
            <span>Target mileage</span>
            <input type="number" step="0.1" value={goal.targetValue} onChange={(event) => onChange({ targetValue: event.target.value })} />
          </label>
          <label>
            <span>Maximum mileage</span>
            <input type="number" step="0.1" value={goal.maxAcceptable} onChange={(event) => onChange({ maxAcceptable: event.target.value })} />
          </label>
        </div>
      ) : null}
      {goal.category === "quality" ? (
        <div className="form-grid">
          <label>
            <span>Hard sessions</span>
            <input type="number" min="0" step="1" value={goal.targetValue} onChange={(event) => onChange({ targetValue: event.target.value, minAcceptable: event.target.value })} />
          </label>
          <label>
            <span>Quality type</span>
            <select value={goal.qualityType ?? "any"} onChange={(event) => onChange({ qualityType: event.target.value as PlanWeekGoalDraft["qualityType"] })}>
              <option value="any">Any quality</option>
              <option value="threshold">Threshold</option>
              <option value="tempo">Tempo</option>
              <option value="intervals">Intervals</option>
              <option value="hills">Hills</option>
              <option value="race">Race</option>
            </select>
          </label>
        </div>
      ) : null}
      {goal.category === "long_run" ? (
        <div className="form-grid form-grid--three">
          <label>
            <span>Minimum distance</span>
            <input type="number" step="0.1" value={goal.minAcceptable} onChange={(event) => onChange({ minAcceptable: event.target.value })} />
          </label>
          <label>
            <span>Target distance</span>
            <input type="number" step="0.1" value={goal.targetValue} onChange={(event) => onChange({ targetValue: event.target.value })} />
          </label>
          <label>
            <span>Maximum distance</span>
            <input type="number" step="0.1" value={goal.maxAcceptable} onChange={(event) => onChange({ maxAcceptable: event.target.value })} />
          </label>
        </div>
      ) : null}
      {goal.category === "recovery" ? (
        <div className="form-grid">
          <label>
            <span>Minimum rest days</span>
            <input type="number" min="0" step="1" value={goal.targetValue} onChange={(event) => onChange({ targetValue: event.target.value, minAcceptable: event.target.value })} />
          </label>
          <label className="checkbox-row">
            <input
              checked={goal.noBackToBackHardDays ?? true}
              type="checkbox"
              onChange={(event) => onChange({ noBackToBackHardDays: event.target.checked })}
            />
            <span>No back-to-back hard days</span>
          </label>
        </div>
      ) : null}
      {goal.category === "sessions" ? (
        <label>
          <span>Target total sessions</span>
          <input type="number" min="0" step="1" value={goal.targetValue} onChange={(event) => onChange({ targetValue: event.target.value, minAcceptable: event.target.value })} />
        </label>
      ) : null}
      {goal.category === "strength" ? (
        <div className="form-grid">
          <label>
            <span>Strength sessions</span>
            <input type="number" min="0" step="1" value={goal.targetValue} onChange={(event) => onChange({ targetValue: event.target.value, minAcceptable: event.target.value })} />
          </label>
          <label className="checkbox-row">
            <input
              checked={goal.strengthRequired ?? true}
              type="checkbox"
              onChange={(event) => onChange({ strengthRequired: event.target.checked })}
            />
            <span>Required</span>
          </label>
        </div>
      ) : null}
      {goal.category === "custom" ? (
        <>
          <label>
            <span>Goal label</span>
            <input value={goal.label} onChange={(event) => onChange({ label: event.target.value })} />
          </label>
          <label>
            <span>Goal description</span>
            <textarea rows={2} value={goal.description} onChange={(event) => onChange({ description: event.target.value })} />
          </label>
        </>
      ) : null}
    </article>
  );
}
