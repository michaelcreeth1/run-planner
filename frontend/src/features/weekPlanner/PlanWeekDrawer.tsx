import { AlertTriangle, CheckCircle2, ChevronDown, Copy, Library, Plus, Save, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type {
  PlanWeekDraft,
  PlanWeekGoalDraft,
  PlanWeekWorkoutDraft,
  TrainingPaceEstimate,
  TrainingPlan,
  TrainingWeek,
  WeekGoalCategory,
  Workout,
  WorkoutTemplate
} from "../../types/domain";
import { addDays, todayDateString } from "../../lib/dates";
import { comparisonMileage, formatCompactWeekRange, formatNumber, formatWeekday } from "../../lib/formatters";
import { defaultGoalForm } from "../../lib/forms";
import { sessionTypeForWorkout, sessionTypeGroups, sessionTypes } from "../../lib/options";
import { prescriptionTotals, scalePrescriptionDistance } from "../../lib/prescriptions";
import { completedSessionCount } from "../../lib/weekMetrics";
import { useModalDialog } from "../../hooks/useModalDialog";
import { fetchJson } from "../../lib/api";
import type { AlignmentItem } from "../../types/domain";
import type { PlanRule, RuleEvaluation } from "../goals/ruleEvaluation";
import { buildPlanRules, evaluateRulesForWeek } from "../goals/ruleEvaluation";
import {
  countDraftRestDays,
  countDraftHardSessions,
  effectiveWorkoutSport,
  evaluateGoalDraft,
  goalLabelFromDraft,
  maxDraftRunDistance,
  newWorkoutDraft,
  rebuildPlanWeekDraftForStartingPoint,
  scaleDraftWorkoutsToMileage,
  sortDraftWorkouts,
  sumDraftRunDistance,
  workoutDraftFromTemplate
} from "./planWeekDrafts";

const DEFAULT_SHARED_RULES = buildPlanRules({ defaultGoals: [], plan: null });

export function PlanWeekDrawer({
  draft,
  isSaving,
  onClose,
  onCompleteReview,
  onEditRule,
  onSave,
  plan = null,
  rules = DEFAULT_SHARED_RULES,
  setDraft,
  weekStack
}: {
  draft: PlanWeekDraft;
  isSaving: boolean;
  onClose: () => void;
  onCompleteReview: (weekId: string) => void;
  onEditRule?: (evaluation: RuleEvaluation) => void;
  onSave: (draft: PlanWeekDraft) => void;
  plan?: TrainingPlan | null;
  rules?: PlanRule[];
  setDraft: Dispatch<SetStateAction<PlanWeekDraft | null>>;
  weekStack: Record<string, TrainingWeek>;
}) {
  const [isCopyWeekMenuOpen, setIsCopyWeekMenuOpen] = useState(false);
  const [libraryDate, setLibraryDate] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [trainingPaceEstimate, setTrainingPaceEstimate] = useState<TrainingPaceEstimate | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const copyWeekMenuRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const startingPointBaselineRef = useRef(startingPointSnapshot(draft));
  const initialDraftSnapshotRef = useRef(draftSnapshot(draft));
  const ruleRows = draft.goals
    .filter((goal) => goal.isEnabled && goal.source !== "workouts")
    .map((goal) => ({ goal, evaluation: evaluateGoalDraft(draft, goal) }));
  const scheduledMileage = sumDraftRunDistance(draft.workouts);
  const scheduledQuality = countDraftHardSessions(draft.workouts);
  const scheduledLongRun = maxDraftRunDistance(draft.workouts);
  const hardDates = new Set(
    draft.workouts
      .filter((workout) => workout.intensityCategory === "workout" || workout.intensityCategory === "race")
      .map((workout) => workout.plannedDate)
  );
  const hardDaysAreAdjacent = Array.from(hardDates).some((dateValue) => hardDates.has(addDays(dateValue, 1)));
  const designatedLongRun = [...draft.workouts]
    .filter((workout) => effectiveWorkoutSport(workout) === "run")
    .sort((left, right) => Number(right.plannedDistance || 0) - Number(left.plannedDistance || 0))[0] ?? null;
  const scheduledRestDays = countDraftRestDays(draft.workouts, draft.weekStartDate);
  const sourceWeek = weekStack[draft.weekStartDate];
  const isAdjustingRemainingWeek = draft.weekState === "current" && draft.hasExistingPlan;
  const completedSessions = sourceWeek ? completedSessionCount(sourceWeek) : 0;
  const remainingMileage = sumDraftRunDistance(
    draft.workouts.filter(
      (workout) => workout.plannedDate >= todayDateString() && !isCompletedDraftWorkout(workout, sourceWeek)
    )
  );
  const projectedMileage = isAdjustingRemainingWeek && sourceWeek
    ? sourceWeek.actualMileage + remainingMileage
    : scheduledMileage;
  const mileageTarget = sourceWeek?.targetMileage ?? goalTarget(
    draft.goals.find((goal) => goal.category === "mileage" && goal.goalType === "achievement")
  );
  const remainingGap = mileageTarget === null ? null : Math.max(mileageTarget - projectedMileage, 0);
  const copyWeekOptions = Array.from({ length: 12 }, (_, index) => {
    const weekStartDate = addDays(draft.weekStartDate, (index + 1) * -7);
    return { weekStartDate, week: weekStack[weekStartDate] ?? null };
  });
  const sharedEvaluations = useMemo(
    () => {
      const summary = plan?.weekSummaries.find((candidate) => candidate.weekStartDate === draft.weekStartDate) ?? null;
      const mesocycle = summary?.mesocycleId
        ? plan?.mesocycles.find((candidate) => candidate.id === summary.mesocycleId) ?? null
        : null;
      return evaluateRulesForWeek(
        rules,
        { week: trainingWeekFromDraft(draft, weekStack[draft.weekStartDate]), summary, mesocycle },
        todayDateString()
      ).filter((evaluation) => evaluation.status !== "not_applicable");
    },
    [draft, plan, rules, weekStack]
  );
  const sharedPendingCount = sharedEvaluations.filter((evaluation) => evaluation.status === "pending").length;
  const sharedRuleIds = new Set(sharedEvaluations.map((evaluation) => evaluation.ruleId));
  const targetIssues = ruleRows.filter(
    ({ goal, evaluation }) =>
      evaluation.status === "mismatch" && !isCoveredBySharedCheck(goal, sharedRuleIds)
  );
  const hasLongRunTargetIssue = targetIssues.some(
    ({ goal }) => goal.goalType === "achievement" && goal.category === "long_run"
  );
  const sharedIssues = sharedEvaluations.filter(
    (evaluation) =>
      (evaluation.status === "warning" || evaluation.status === "fail") &&
      !(evaluation.ruleId === "long-run-scheduled" && hasLongRunTargetIssue)
  );
  const issueCount = sharedIssues.length + targetIssues.length;
  const drawerTitle =
    draft.weekState === "past"
      ? "Review week"
      : draft.weekState === "current" && draft.hasExistingPlan
        ? "Adjust week"
        : draft.hasExistingPlan
          ? "Edit week plan"
          : "Plan week";

  function handleClose() {
    if (isSaving) {
      return;
    }
    if (isCopyWeekMenuOpen) {
      setIsCopyWeekMenuOpen(false);
      return;
    }
    if (
      draft.weekState !== "past" &&
      draftSnapshot(draft) !== initialDraftSnapshotRef.current &&
      !window.confirm("Discard unsaved week changes?")
    ) {
      return;
    }
    onClose();
  }

  useModalDialog({ dialogRef: drawerRef, onDismiss: handleClose });

  useEffect(() => {
    if (!isCopyWeekMenuOpen) {
      return;
    }

    function closeOnOutsideClick(event: MouseEvent) {
      if (!copyWeekMenuRef.current?.contains(event.target as Node)) {
        setIsCopyWeekMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsCopyWeekMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isCopyWeekMenuOpen]);

  if (draft.weekState === "past") {
    return (
      <PastWeekReviewDrawer
        drawerRef={drawerRef}
        isSaving={isSaving}
        onClose={handleClose}
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

  function copyWeek(sourceWeekStartDate: string) {
    if (!weekStack[sourceWeekStartDate]) {
      return;
    }
    if (
      startingPointSnapshot(draft) !== startingPointBaselineRef.current &&
      !window.confirm("Copy this week? Your unsaved schedule and target edits will be discarded.")
    ) {
      return;
    }
    updateDraft((current) => {
      const next = rebuildPlanWeekDraftForStartingPoint(
        { ...current, priorWeekStartDate: sourceWeekStartDate },
        "copy_prior",
        weekStack
      );
      startingPointBaselineRef.current = startingPointSnapshot(next);
      return next;
    });
    setIsCopyWeekMenuOpen(false);
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
        const titleFollowsType = !workout.title.trim() || workout.title === currentSessionType.label;
        return {
          ...workout,
          title: titleFollowsType ? sessionType.label : workout.title,
          sport: sessionType.sport,
          workoutType: sessionType.workoutType,
          intensityCategory: sessionType.intensityCategory,
          plannedDistance: keepRunMetrics ? workout.plannedDistance : "",
          plannedPace: keepRunMetrics ? workout.plannedPace : "",
          prescription: keepRunMetrics ? workout.prescription : null
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

  async function openWorkoutLibrary(dateValue: string) {
    setLibraryDate(dateValue);
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const [loadedTemplates, paceEstimate] = await Promise.all([
        fetchJson<WorkoutTemplate[]>("/api/workout-templates"),
        fetchJson<TrainingPaceEstimate>("/api/training-pace-estimate")
      ]);
      setTemplates(loadedTemplates);
      setTrainingPaceEstimate(paceEstimate);
    } catch {
      setTemplatesError("Could not load your workout library.");
    } finally {
      setTemplatesLoading(false);
    }
  }

  function addTemplate(dateValue: string, template: WorkoutTemplate) {
    updateDraft((current) => {
      const workouts = current.workouts.filter(
        (workout) => workout.plannedDate !== dateValue || effectiveWorkoutSport(workout) !== "rest"
      );
      const insertionIndex = workouts.reduce(
        (lastIndex, workout, index) => (workout.plannedDate === dateValue ? index + 1 : lastIndex),
        0
      );
      const index = insertionIndex > 0
        ? insertionIndex
        : workouts.findIndex((workout) => workout.plannedDate > dateValue);
      const target = index >= 0 ? index : workouts.length;
      return {
        ...current,
        workouts: [
          ...workouts.slice(0, target),
          workoutDraftFromTemplate(
            template,
            dateValue,
            trainingPaceEstimate?.easyPaceSecondsPerMile
          ),
          ...workouts.slice(target)
        ]
      };
    });
    setLibraryDate(null);
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

  function acknowledgeException(evaluation: RuleEvaluation) {
    const rule = rules.find((candidate) => candidate.id === evaluation.ruleId);
    const category = rule?.category;
    if (!rule || !category) {
      return;
    }
    updateDraft((current) => {
      const existing = current.goals.find(
        (goal) =>
          goal.metricKey === rule.metricKey ||
          (!goal.metricKey && goal.category === category)
      );
      if (existing) {
        return {
          ...current,
          goals: current.goals.map((goal) =>
            goal.draftId === existing.draftId
              ? { ...goal, status: "waived", source: "manual", sourceLabel: "This week" }
              : goal
          )
        };
      }
      const unit = rule.kind === "long_run_percent" ? "percent" : rule.kind === "long_run_scheduled" ? "mi" : "days";
      const evaluationMode = ["rest_days", "long_run_scheduled"].includes(rule.kind) ? "at_least" : "at_most";
      const threshold = rule.threshold === null ? "" : String(rule.threshold);
      return {
        ...current,
        goals: [
          ...current.goals,
          {
            ...defaultGoalForm(current.weekId),
            draftId: `exception-${rule.id}`,
            metricKey: rule.metricKey,
            category,
            goalType: rule.goalType,
            label: rule.label,
            targetValue: threshold,
            minAcceptable: evaluationMode === "at_least" ? threshold : "",
            maxAcceptable: evaluationMode === "at_most" ? threshold : "",
            unit,
            evaluationMode,
            priority: rule.goalType === "guardrail" ? "guardrail" : "secondary",
            status: "waived",
            source: "manual",
            sourceLabel: "This week"
          }
        ]
      };
    });
  }

  return (
    <div className="editor-backdrop">
      <aside aria-label={drawerTitle} aria-modal="true" className="editor-panel plan-week-panel" ref={drawerRef} role="dialog" tabIndex={-1}>
        <header>
          <div>
            <h2>{drawerTitle}</h2>
            <span>{formatCompactWeekRange(draft.weekStartDate, draft.weekEndDate)}</span>
          </div>
          <button type="button" title="Close" onClick={handleClose}>
            <X size={18} />
          </button>
        </header>

        <div className="plan-week-body">
          <section className="plan-week-section schedule-section">
            <div className="section-heading section-heading--split schedule-section-heading">
              <div>
                <h3>Schedule</h3>
              </div>
              <div className="copy-week-control" ref={copyWeekMenuRef}>
                <button
                  aria-expanded={isCopyWeekMenuOpen}
                  aria-haspopup="menu"
                  className="copy-week-button"
                  title="Copy sessions from one of the last 12 weeks"
                  type="button"
                  onClick={() => setIsCopyWeekMenuOpen((current) => !current)}
                >
                  <Copy size={15} />
                  <span>Copy week</span>
                  <ChevronDown aria-hidden="true" size={14} />
                </button>
                {isCopyWeekMenuOpen ? (
                  <div aria-label="Choose a week to copy" className="copy-week-menu" role="menu">
                    {copyWeekOptions.map(({ weekStartDate, week }) => {
                      const rangeLabel = formatCompactWeekRange(weekStartDate, addDays(weekStartDate, 6));
                      const mileage = week ? comparisonMileage(week) : null;
                      return (
                        <button
                          aria-label={
                            week
                              ? `Copy ${rangeLabel}, ${formatNumber(mileage ?? 0)} miles`
                              : `${rangeLabel}, loading mileage`
                          }
                          className="copy-week-option"
                          disabled={!week}
                          key={weekStartDate}
                          role="menuitem"
                          type="button"
                          onClick={() => copyWeek(weekStartDate)}
                        >
                          <span>{rangeLabel}</span>
                          <strong>{week ? `${formatNumber(mileage ?? 0)} mi` : "Loading..."}</strong>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            {isAdjustingRemainingWeek ? (
              <p className="schedule-adjustment-note">
                <CheckCircle2 aria-hidden="true" size={15} />
                {completedSessions} completed session{completedSessions === 1 ? "" : "s"} stay fixed. Adjust only today and the remaining days.
              </p>
            ) : null}
            {libraryDate ? (
              <div className="workout-library-picker">
                <div className="workout-library-picker__header">
                  <div>
                    <strong>Choose a workout for {formatWeekday(libraryDate)}</strong>
                    <span>Scheduling creates an independent copy.</span>
                  </div>
                  <button aria-label="Close workout library" type="button" onClick={() => setLibraryDate(null)}><X size={16} /></button>
                </div>
                {templates.length ? (
                  <div className="workout-library-picker__list">
                    {templates.map((template) => {
                      const totals = prescriptionTotals(template.prescription, {
                        easyPaceSecondsPerMile: trainingPaceEstimate?.easyPaceSecondsPerMile,
                        workoutType: template.workoutType
                      });
                      return (
                        <button key={template.id} type="button" onClick={() => addTemplate(libraryDate, template)}>
                          <span>
                            <strong>{template.name}</strong>
                            <small>{template.workoutType.replaceAll("_", " ")} · ~{formatNumber(totals.estimatedDistance / 1609.344)} mi</small>
                          </span>
                          <Plus size={16} />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p>{templatesLoading ? "Loading workout library…" : templatesError ?? "Your workout library is empty. Add workouts from the Workouts page."}</p>
                )}
                <button className="workout-library-picker__blank" type="button" onClick={() => {
                  addWorkout(libraryDate);
                  setLibraryDate(null);
                }}>Add a blank session instead</button>
              </div>
            ) : null}
            <div className="schedule-draft-column-labels" aria-hidden="true">
              <span />
              <div>
                <span>Type</span>
                <span>Name</span>
                <span>Mileage</span>
                <span />
              </div>
            </div>
            <div className="schedule-draft">
              {Array.from({ length: 7 }, (_, index) => addDays(draft.weekStartDate, index)).map((dateValue) => {
                const dayWorkouts = draft.workouts.filter(
                  (workout) => workout.plannedDate === dateValue && effectiveWorkoutSport(workout) !== "rest"
                );
                const visibleDayWorkouts = isAdjustingRemainingWeek
                  ? dayWorkouts.filter(
                      (workout) => workout.plannedDate >= todayDateString() && !isCompletedDraftWorkout(workout, sourceWeek)
                    )
                  : dayWorkouts;
                const isEarlierDay = isAdjustingRemainingWeek && dateValue < todayDateString();
                const hasFixedSession = isAdjustingRemainingWeek && dayWorkouts.length > visibleDayWorkouts.length;
                return (
                  <div className="schedule-draft-day" key={dateValue}>
                    <div className="schedule-day-heading">
                      <strong>{formatWeekday(dateValue)}</strong>
                      <div className="schedule-day-actions">
                        <button
                          aria-label={`Choose workout for ${formatWeekday(dateValue)}`}
                          className="schedule-day-add"
                          title={`Choose from workout library for ${formatWeekday(dateValue)}`}
                          type="button"
                          onClick={() => void openWorkoutLibrary(dateValue)}
                        >
                          <Library size={14} />
                        </button>
                        <button
                          aria-label={`Add session to ${formatWeekday(dateValue)}`}
                          className="schedule-day-add schedule-day-add--blank"
                          title={`Add a blank session to ${formatWeekday(dateValue)}`}
                          type="button"
                          onClick={() => addWorkout(dateValue)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="schedule-draft-sessions">
                      {visibleDayWorkouts.length ? (
                        visibleDayWorkouts.map((workout, workoutIndex) => {
                          const sessionType = sessionTypeForWorkout(workout);
                          const distanceIsEditable =
                            !workout.prescription || prescriptionTotals(workout.prescription).distanceComplete;
                          const fieldPrefix = `${formatWeekday(dateValue)} session ${workoutIndex + 1}`;
                          return (
                            <div className="schedule-draft-workout" key={workout.draftId}>
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
                              <input
                                aria-label={`${fieldPrefix} name`}
                                className="session-name-input"
                                placeholder="Session name"
                                value={workout.title}
                                onChange={(event) => updateWorkout(workout.draftId, { title: event.target.value })}
                              />
                              {sessionType.sport === "run" ? (
                                <label className="session-mileage-field" title="Session mileage">
                                  <input
                                    aria-label={`${fieldPrefix} mileage`}
                                    disabled={!distanceIsEditable}
                                    min="0.1"
                                    step="0.1"
                                    title={distanceIsEditable ? "Session mileage" : "Edit the workout to change a duration-based prescription"}
                                    type="number"
                                    value={workout.plannedDistance}
                                    onChange={(event) => {
                                      const plannedDistance = event.target.value;
                                      updateWorkout(workout.draftId, {
                                        plannedDistance,
                                        prescription: scalePrescriptionDistance(
                                          workout.prescription,
                                          Number(plannedDistance)
                                        ) ?? null
                                      });
                                    }}
                                  />
                                  <span>mi</span>
                                </label>
                              ) : (
                                <span className="session-mileage-not-applicable">—</span>
                              )}
                              <button
                                aria-label={`Remove ${fieldPrefix}`}
                                className="session-remove"
                                title={`Remove ${workout.title || fieldPrefix}`}
                                type="button"
                                onClick={() => removeWorkout(workout.draftId)}
                              >
                                <X size={15} />
                              </button>
                            </div>
                          );
                        })
                      ) : isEarlierDay || hasFixedSession ? (
                        <div className="schedule-fixed-row">
                          <CheckCircle2 aria-hidden="true" size={15} />
                          <span>{isEarlierDay ? "Earlier in week" : "Completed today"}</span>
                        </div>
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

          <section className="plan-week-section week-plan-section">
            <div className="section-heading">
              <h3>Week plan</h3>
            </div>
            <div className="week-plan-summary" aria-label="Week plan summary">
              <WeekPlanMetric
                detail={
                  isAdjustingRemainingWeek && sourceWeek
                    ? `${formatNumber(sourceWeek.actualMileage)} mi completed + ${formatNumber(remainingMileage)} mi remaining${mileageTarget !== null ? ` · ${formatNumber(mileageTarget)} mi target${remainingGap ? ` · ${formatNumber(remainingGap)} mi gap` : ""}` : ""}`
                    : mileageTarget !== null
                      ? `${formatNumber(mileageTarget)} mi target`
                      : undefined
                }
                label={isAdjustingRemainingWeek ? "Projected mileage" : "Mileage"}
                value={`${formatNumber(projectedMileage)} mi`}
              />
              <WeekPlanMetric
                detail={scheduledQuality > 1 ? (hardDaysAreAdjacent ? "Back-to-back" : "Spaced apart") : undefined}
                label="Hard days"
                value={`${scheduledQuality} hard day${scheduledQuality === 1 ? "" : "s"}`}
              />
              <WeekPlanMetric
                detail={designatedLongRun?.title}
                label="Long run"
                value={`${formatNumber(scheduledLongRun)} mi`}
              />
              <WeekPlanMetric
                label="Recovery"
                value={`${scheduledRestDays} rest day${scheduledRestDays === 1 ? "" : "s"}`}
              />
            </div>
          </section>

          <section className="plan-week-section plan-check-section">
            <div className="section-heading section-heading--split">
              <h3>Plan check</h3>
              {issueCount ? (
                <span className="rules-status rules-status--attention">
                  {issueCount} {issueCount === 1 ? "adjustment" : "adjustments"}
                </span>
              ) : null}
            </div>
            {issueCount ? (
              <div className="rule-list">
                {targetIssues.map(({ goal, evaluation }) => {
                  const canAdjustSchedule =
                    ["mileage", "long_run"].includes(goal.category) &&
                    (goalTarget(goal) ?? 0) > 0 &&
                    draft.workouts.some((workout) => effectiveWorkoutSport(workout) === "run");
                  return (
                    <TargetIssueRow
                      evaluation={evaluation}
                      goal={goal}
                      key={goal.draftId}
                      onMatchTarget={canAdjustSchedule ? () => adjustScheduleToTarget(goal.category) : null}
                      onUseSchedule={
                        goal.category !== "custom" ? () => updateTargetToSchedule(goal.category) : null
                      }
                    />
                  );
                })}
                {sharedIssues.map((evaluation) => (
                  <SharedPlanIssueRow
                    evaluation={evaluation}
                    key={evaluation.ruleId}
                    onAcknowledge={() => acknowledgeException(evaluation)}
                    onEditRule={onEditRule ? () => onEditRule(evaluation) : undefined}
                  />
                ))}
              </div>
            ) : (
              <div className="plan-check-clear">
                <CheckCircle2 className="rule-status-icon" size={17} />
                <div>
                  <strong>
                    {remainingGap
                      ? "Schedule is still incomplete"
                      : sharedPendingCount
                        ? "Schedule looks good so far"
                        : "Schedule matches targets"}
                  </strong>
                  {remainingGap ? (
                    <small>Add {formatNumber(remainingGap)} mi to reach this week's target.</small>
                  ) : sharedPendingCount ? (
                    <small>Some checks will complete as you add sessions.</small>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="plan-week-footer">
          <div className="editor-actions plan-week-actions">
            <button type="button" onClick={handleClose}>
              <X size={17} />
              <span>Cancel</span>
            </button>
            <button className="primary" disabled={isSaving} type="button" onClick={() => onSave(draft)}>
              <Save size={17} />
              <span>{isSaving ? "Saving" : draft.hasExistingPlan ? "Save changes" : "Save plan"}</span>
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function WeekPlanMetric({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div className="week-plan-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function TargetIssueRow({
  evaluation,
  goal,
  onMatchTarget,
  onUseSchedule
}: {
  evaluation: AlignmentItem;
  goal: PlanWeekGoalDraft;
  onMatchTarget: (() => void) | null;
  onUseSchedule: (() => void) | null;
}) {
  return (
    <div className="rule-row rule-row--readonly rule-row--mismatch">
      <AlertTriangle className="rule-status-icon" size={15} />
      <div className="rule-copy">
        <strong>{goalLabelFromDraft(goal)}</strong>
        <small>{evaluation.detail}</small>
      </div>
      <div className="rule-actions">
        {onMatchTarget ? <button type="button" onClick={onMatchTarget}>Match target</button> : null}
        {onUseSchedule ? <button type="button" onClick={onUseSchedule}>Use schedule</button> : null}
      </div>
    </div>
  );
}

function SharedPlanIssueRow({
  evaluation,
  onAcknowledge,
  onEditRule
}: {
  evaluation: RuleEvaluation;
  onAcknowledge: () => void;
  onEditRule?: () => void;
}) {
  return (
    <div className="rule-row rule-row--readonly rule-row--mismatch">
      <AlertTriangle className="rule-status-icon" size={15} />
      <div className="rule-copy">
        <strong>{evaluation.ruleLabel}</strong>
        <small>{evaluation.reason}</small>
        {evaluation.originLabel ? <small>{evaluation.originLabel}</small> : null}
      </div>
      <div className="rule-actions">
        {onEditRule ? <button type="button" onClick={onEditRule}>Edit rule</button> : null}
        <button type="button" onClick={onAcknowledge}>Allow this week</button>
      </div>
    </div>
  );
}

function isCoveredBySharedCheck(goal: PlanWeekGoalDraft, sharedRuleIds: Set<string>) {
  const hasRule = (baseId: string, scopedPrefix: string) =>
    sharedRuleIds.has(baseId) || Array.from(sharedRuleIds).some((ruleId) => ruleId.startsWith(scopedPrefix));
  if (goal.category === "recovery" && hasRule("rest-days", "rest_days-")) {
    return true;
  }
  if (
    goal.goalType === "guardrail" &&
    goal.category === "quality" &&
    hasRule("hard-days", "hard_days-")
  ) {
    return true;
  }
  return (
    goal.goalType === "guardrail" &&
    goal.category === "long_run" &&
    goal.unit === "percent" &&
    hasRule("long-run-percent", "long_run_percent-")
  );
}

function startingPointSnapshot(draft: PlanWeekDraft) {
  return JSON.stringify({
    workouts: draft.workouts.map(({ draftId: _draftId, ...workout }) => workout),
    goals: draft.goals.map(({ draftId: _draftId, ...goal }) => goal)
  });
}

function draftSnapshot(draft: PlanWeekDraft) {
  return JSON.stringify(draft);
}

function isCompletedDraftWorkout(workout: PlanWeekWorkoutDraft, sourceWeek: TrainingWeek | undefined) {
  const sourceWorkout = sourceWeek?.workouts.find((candidate) => candidate.id === workout.id);
  if (!sourceWorkout) {
    return false;
  }
  const sessions = sourceWeek?.performedSessions ?? [];
  return sessions.some(
    (session) =>
      session.recordings.length > 0 &&
      session.association === "associated" &&
      session.plannedWorkoutId === sourceWorkout.id &&
      session.outcome !== "unresolved"
  );
}

function trainingWeekFromDraft(draft: PlanWeekDraft, sourceWeek?: TrainingWeek): TrainingWeek {
  const workouts: Workout[] = draft.workouts.map((workout) => ({
    id: workout.id ?? workout.draftId,
    trainingWeekId: draft.weekId,
    athleteAccountId: sourceWeek?.workouts[0]?.athleteAccountId ?? "draft",
    plannedDate: workout.plannedDate,
    title: workout.title,
    sport: workout.sport,
    workoutType: workout.workoutType,
    intensityCategory: workout.intensityCategory,
    plannedDistance: optionalDraftNumber(workout.plannedDistance),
    plannedDuration: null,
    plannedPace: null,
    plannedElevation: null,
    plannedTss: null,
    purpose: workout.purpose,
    instructions: workout.instructions,
    notes: workout.notes,
    status: workout.status
  }));
  const plannedMileage = workouts.reduce(
    (total, workout) => total + (workout.sport === "run" ? workout.plannedDistance ?? 0 : 0),
    0
  );
  return {
    id: draft.weekId,
    weekStartDate: draft.weekStartDate,
    weekEndDate: draft.weekEndDate,
    plannedMileage,
    actualMileage: sourceWeek?.actualMileage ?? 0,
    plannedTime: null,
    actualTime: sourceWeek?.actualTime ?? null,
    mesocycleId: sourceWeek?.mesocycleId ?? null,
    purpose: draft.purposeIsSuggested ? sourceWeek?.purpose ?? "" : draft.purpose,
    purposeSource: sourceWeek?.purposeSource ?? "manual",
    targetMileage: sourceWeek?.targetMileage ?? null,
    targetMileageSource: sourceWeek?.targetMileageSource ?? "manual",
    targetLongRunDistance: sourceWeek?.targetLongRunDistance ?? null,
    targetLongRunSource: sourceWeek?.targetLongRunSource ?? "manual",
    isDownWeek: sourceWeek?.isDownWeek ?? false,
    notes: sourceWeek?.notes ?? "",
    reviewedAt: sourceWeek?.reviewedAt ?? null,
    workouts,
    actualActivities: sourceWeek?.actualActivities ?? [],
    performedSessions: sourceWeek?.performedSessions ?? [],
    goals: draft.goals.map((goal) => ({
      id: goal.id ?? goal.draftId,
      trainingWeekId: draft.weekId,
      athleteAccountId: sourceWeek?.goals[0]?.athleteAccountId ?? "draft",
      weekStartDate: draft.weekStartDate,
      metricKey: goal.metricKey,
      category: goal.category,
      goalType: goal.goalType,
      label: goal.label,
      description: goal.description,
      targetValue: optionalDraftNumber(goal.targetValue),
      minAcceptable: optionalDraftNumber(goal.minAcceptable),
      maxAcceptable: optionalDraftNumber(goal.maxAcceptable),
      unit: goal.unit,
      evaluationMode: goal.evaluationMode,
      priority: goal.priority,
      status: goal.status,
      source: goal.source,
      isEditable: true,
      isEnabled: goal.isEnabled,
      createdAt: "",
      updatedAt: ""
    })),
    goalEvaluations: [],
    weekState: draft.weekState,
    goalReviewSummary: "",
    hardDays: countDraftHardSessions(draft.workouts),
    longRunDistance: Math.max(
      ...workouts
        .filter((workout) => workout.workoutType === "long_run" || workout.workoutType === "medium_long")
        .map((workout) => workout.plannedDistance ?? 0),
      0
    ),
    longRunPercentage: 0
  };
}

function optionalDraftNumber(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  drawerRef,
  isSaving,
  onClose,
  onComplete,
  week,
  weekEndDate,
  weekStartDate
}: {
  drawerRef: RefObject<HTMLElement | null>;
  isSaving: boolean;
  onClose: () => void;
  onComplete: () => void;
  week: TrainingWeek | undefined;
  weekEndDate: string;
  weekStartDate: string;
}) {
  const completedWorkouts = week ? completedSessionCount(week) : 0;
  const goalOutcomes = week?.goalEvaluations ?? [];

  return (
    <div className="editor-backdrop">
      <aside aria-label="Review week" aria-modal="true" className="editor-panel plan-week-panel" ref={drawerRef} role="dialog" tabIndex={-1}>
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
              <span className="section-step">1</span>
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
              <span className="section-step">2</span>
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
