import { AlertTriangle, CheckCircle2, ChevronDown, Save, Trash2, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type {
  PlanStartingPoint,
  PlanWeekDraft,
  PlanWeekGoalDraft,
  PlanWeekWorkoutDraft,
  TrainingWeek,
  WeekPurposeId
} from "../../types/domain";
import { addDays } from "../../lib/dates";
import { formatCompactWeekRange, formatNumber, formatWeekday } from "../../lib/formatters";
import { weekPurposes } from "../../lib/options";
import {
  countDraftHardSessions,
  deriveGoalDraftsFromSchedule,
  draftGoalTitle,
  evaluatePlanAlignment,
  formatDraftWorkoutLabel,
  formatGuardrailDraft,
  rebuildPlanWeekDraftForStartingPoint,
  restWorkoutDraft,
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
  onSave,
  setDraft,
  weekStack
}: {
  draft: PlanWeekDraft;
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: PlanWeekDraft) => void;
  setDraft: Dispatch<SetStateAction<PlanWeekDraft | null>>;
  weekStack: Record<string, TrainingWeek>;
}) {
  const alignment = evaluatePlanAlignment(draft);
  const mismatches = alignment.filter((item) => item.status === "mismatch");
  const achievementGoals = draft.goals.filter((goal) => goal.goalType === "achievement");
  const detailedAchievementGoals = achievementGoals.filter((goal) => !["mileage", "quality"].includes(goal.category));
  const guardrailGoals = draft.goals.filter((goal) => goal.goalType === "guardrail");
  const scheduledMileage = sumDraftRunDistance(draft.workouts);
  const scheduledQuality = countDraftHardSessions(draft.workouts);
  const purpose = weekPurposes.find((option) => option.value === draft.purpose) ?? weekPurposes[0];
  const drawerTitle =
    draft.weekState === "past"
      ? "Review week"
      : draft.weekState === "current"
      ? "Adjust rest of week"
      : draft.hasExistingPlan
      ? "Edit plan"
      : "Plan week";
  const canSave = !mismatches.length || draft.mismatchAcknowledged;

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
        load: nextLoad,
        mismatchAcknowledged: false
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
      ),
      mismatchAcknowledged: false
    }));
  }

  function updateWorkout(workoutDraftId: string, updates: Partial<PlanWeekWorkoutDraft>) {
    updateDraft((current) => ({
      ...current,
      workouts: current.workouts.map((workout) =>
        workout.draftId === workoutDraftId ? { ...workout, ...updates } : workout
      ),
      mismatchAcknowledged: false
    }));
  }

  function removeWorkout(workoutDraftId: string) {
    updateDraft((current) => ({
      ...current,
      workouts: current.workouts.filter((workout) => workout.draftId !== workoutDraftId),
      mismatchAcknowledged: false
    }));
  }

  function markDayRest(dateValue: string) {
    updateDraft((current) => ({
      ...current,
      workouts: [
        ...current.workouts.filter((workout) => workout.plannedDate !== dateValue),
        restWorkoutDraft(dateValue)
      ].sort(sortDraftWorkouts),
      mismatchAcknowledged: false
    }));
  }

  function regenerateGoalsFromSchedule() {
    updateDraft((current) => ({
      ...current,
      goals: deriveGoalDraftsFromSchedule(current, "Schedule"),
      mismatchAcknowledged: false
    }));
  }

  function applySuggestedGoals() {
    updateDraft((current) => {
      const adjustedWorkouts = scaleDraftWorkoutsToMileage(current.workouts, current.load.suggestedMileage);
      const nextLoad = suggestLoad(current.load.priorMileage, current.purpose, adjustedWorkouts);
      const nextDraft = {
        ...current,
        load: nextLoad,
        workouts: adjustedWorkouts.sort(sortDraftWorkouts),
        mismatchAcknowledged: false
      };
      return {
        ...nextDraft,
        goals: deriveGoalDraftsFromSchedule(nextDraft, "Suggested")
      };
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
          <section className="plan-week-section">
            <div className="section-heading">
              <span>1</span>
              <h3>Starting point</h3>
            </div>
            {draft.noPriorUsableWeek ? (
              <p className="plan-week-note">No prior usable week was found, so this draft starts blank.</p>
            ) : null}
            <div className="segmented-control">
              {startingPointOptions(draft).map((option) => (
                <button
                  className={draft.startingPoint === option.value ? "active" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => replaceFromStartingPoint(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="plan-week-section">
            <div className="section-heading">
              <span>2</span>
              <h3>Week purpose</h3>
            </div>
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
            {draft.purpose === "custom" ? (
              <label>
                <span>Custom purpose</span>
                <input
                  value={draft.customPurpose}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      customPurpose: event.target.value,
                      mismatchAcknowledged: false
                    }))
                  }
                />
              </label>
            ) : null}
            <p className="plan-week-note">
              {purpose.meaning} Load direction: {purpose.loadDirection}.
            </p>
          </section>

          <section className="plan-week-section">
            <div className="section-heading">
              <span>3</span>
              <h3>Proposed load</h3>
            </div>
            <div className="proposed-load">
              <div>
                <span>Prior week</span>
                <strong>{draft.load.priorMileage === null ? "No prior load" : `${formatNumber(draft.load.priorMileage)} mi`}</strong>
              </div>
              <div>
                <span>Mileage</span>
                <strong>{formatNumber(draft.load.suggestedMileage)} mi</strong>
                <small>{scheduledMileage ? `${formatNumber(scheduledMileage)} scheduled` : "No schedule yet"}</small>
              </div>
              <div>
                <span>Quality</span>
                <strong>{scheduledQuality} hard</strong>
                <small>{scheduledQuality === 1 ? "session" : "sessions"}</small>
              </div>
            </div>
            <p className="plan-week-note">{draft.load.reason}</p>
            <button className="text-action" type="button" onClick={applySuggestedGoals}>
              Update goals to suggested load
            </button>
          </section>

          <details className="plan-week-section plan-goals-disclosure">
            <summary>
              <div className="section-heading">
                <span>4</span>
                <h3>Proposed goals</h3>
              </div>
              <small>{detailedAchievementGoals.length} supporting goal{detailedAchievementGoals.length === 1 ? "" : "s"}</small>
              <ChevronDown size={16} />
            </summary>
            <div className="draft-goal-list">
              {detailedAchievementGoals.map((goal) => (
                <DraftGoalEditor goal={goal} key={goal.draftId} onChange={(updates) => updateGoal(goal.draftId, updates)} />
              ))}
              {!detailedAchievementGoals.length ? (
                <p className="plan-week-note">Mileage and quality are handled in proposed load.</p>
              ) : null}
            </div>
          </details>

          {guardrailGoals.length ? (
            <section className="plan-week-section">
              <div className="section-heading">
                <span>5</span>
                <h3>Guardrails</h3>
              </div>
              <div className="guardrail-draft-list">
                {guardrailGoals.map((goal) => (
                  <div className="guardrail-draft" key={goal.draftId}>
                    <strong>{goal.label}</strong>
                    <span>{formatGuardrailDraft(goal)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="plan-week-section">
            <div className="section-heading">
              <span>{guardrailGoals.length ? "6" : "5"}</span>
              <h3>Schedule draft</h3>
            </div>
            <div className="schedule-draft">
              {Array.from({ length: 7 }, (_, index) => addDays(draft.weekStartDate, index)).map((dateValue) => {
                const dayWorkouts = draft.workouts.filter((workout) => workout.plannedDate === dateValue);
                return (
                  <div className="schedule-draft-day" key={dateValue}>
                    <strong>{formatWeekday(dateValue)}</strong>
                    <div>
                      {dayWorkouts.length ? (
                        dayWorkouts.map((workout) => (
                          <div className="schedule-draft-workout" key={workout.draftId}>
                            <span>{formatDraftWorkoutLabel(workout)}</span>
                            <input
                              aria-label={`${workout.title} distance`}
                              min="0"
                              step="0.1"
                              type="number"
                              value={workout.plannedDistance}
                              onChange={(event) =>
                                updateWorkout(workout.draftId, { plannedDistance: event.target.value })
                              }
                            />
                            <button type="button" title="Remove workout" onClick={() => removeWorkout(workout.draftId)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <span className="schedule-rest">Rest</span>
                      )}
                    </div>
                    {dayWorkouts.length ? (
                      <button className="compact-rest-button" type="button" onClick={() => markDayRest(dateValue)}>
                        Rest
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="plan-week-section">
            <div className="section-heading">
              <span>{guardrailGoals.length ? "7" : "6"}</span>
              <h3>Plan alignment</h3>
            </div>
            <div className="alignment-summary">
              <strong>{mismatches.length ? `${mismatches.length} mismatch${mismatches.length === 1 ? "" : "es"}` : "Plan aligned"}</strong>
              <span>{alignment.length} checks</span>
            </div>
            <div className="alignment-list">
              {alignment.map((item) => (
                <div className={`alignment-item alignment-item--${item.status}`} key={item.id}>
                  {item.status === "aligned" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
            {mismatches.length ? (
              <div className="mismatch-actions">
                <button type="button" onClick={regenerateGoalsFromSchedule}>
                  Update goals to match plan
                </button>
                <button disabled type="button" title="Automatic plan adjustment is not ready yet.">
                  Adjust plan to match goals
                </button>
                <button type="button" onClick={() => updateDraft((current) => ({ ...current, mismatchAcknowledged: true }))}>
                  Save with mismatch
                </button>
              </div>
            ) : null}
          </section>
        </div>

        <div className="editor-actions plan-week-actions">
          <button type="button" onClick={onClose}>
            <X size={17} />
            <span>Cancel</span>
          </button>
          <button className="primary" disabled={isSaving || !canSave} type="button" onClick={() => onSave(draft)}>
            <Save size={17} />
            <span>{isSaving ? "Saving" : "Save plan"}</span>
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
