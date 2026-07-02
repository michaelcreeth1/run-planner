import type {
  AlignmentItem,
  AlignmentStatus,
  PlanStartingPoint,
  PlanWeekDraft,
  PlanWeekGoalDraft,
  PlanWeekWorkoutDraft,
  ProposedLoad,
  TrainingWeek,
  WeekGoal,
  WeekGoalCategory,
  WeekGoalEvaluationMode,
  WeekGoalPriority,
  WeekGoalType,
  WeekGoalUnit,
  WeekPurposeId,
  Workout
} from "../../types/domain";
import { addDays, daysBetween } from "../../lib/dates";
import { defaultForm, defaultGoalForm, formToPayload, goalFormToPayload, optionalNumber } from "../../lib/forms";
import { comparisonMileage, formatNumber, labelForWorkoutType } from "../../lib/formatters";
import { roundToTenth } from "../../lib/numbers";
import { weekPurposes } from "../../lib/options";

export function buildPlanWeekDraft(week: TrainingWeek, weekStack: Record<string, TrainingWeek>): PlanWeekDraft {
  const hasExistingPlan =
    week.workouts.length > 0 ||
    week.goals.length > 0 ||
    week.notes.trim().length > 0 ||
    week.purposeSource === "plan" ||
    week.targetMileage !== null ||
    week.targetLongRunDistance !== null;
  const priorWeek = findPriorUsableWeek(week.weekStartDate, weekStack);
  const startingPoint: PlanStartingPoint = hasExistingPlan ? "existing" : priorWeek ? "copy_prior" : "blank";
  const purpose =
    typeof week.purpose === "string" && week.purpose.length > 0
      ? normalizeWeekPurposeId(week.purpose)
      : purposeFromText(week.notes) ?? "maintain";
  const load =
    week.targetMileage !== null
      ? planTargetLoad(week.targetMileage, loadBaselineMileageOrNull(priorWeek))
      : suggestLoad(loadBaselineMileageOrNull(priorWeek), purpose, week.workouts);
  const baseDraft: PlanWeekDraft = {
    weekId: week.id,
    weekStartDate: week.weekStartDate,
    weekEndDate: week.weekEndDate,
    weekState: week.weekState,
    startingPoint,
    purpose,
    customPurpose: purpose === "custom" ? week.notes.trim() : "",
    priorWeekStartDate: priorWeek?.weekStartDate ?? null,
    noPriorUsableWeek: !hasExistingPlan && !priorWeek,
    load,
    workouts: [],
    goals: [],
    hasExistingPlan,
    mismatchAcknowledged: false
  };
  return rebuildPlanWeekDraftForStartingPoint(baseDraft, startingPoint, weekStack, week);
}

export function rebuildPlanWeekDraftForStartingPoint(
  draft: PlanWeekDraft,
  startingPoint: PlanStartingPoint,
  weekStack: Record<string, TrainingWeek>,
  currentWeek?: TrainingWeek
): PlanWeekDraft {
  const targetWeek = currentWeek ?? weekStack[draft.weekStartDate];
  const priorWeek = draft.priorWeekStartDate ? weekStack[draft.priorWeekStartDate] : findPriorUsableWeek(draft.weekStartDate, weekStack);
  const sourceWeek = startingPoint === "existing" ? currentWeek ?? weekStack[draft.weekStartDate] : priorWeek ?? null;
  const loadSourceWeek = priorWeek ?? null;
  const planTargetMileage = targetWeek?.targetMileage ?? null;
  const sourceWorkouts =
    startingPoint === "blank" || !sourceWeek
      ? []
      : draftWorkoutsFromWeek(sourceWeek, draft.weekStartDate);
  const loadSuggestion =
    planTargetMileage !== null
      ? planTargetLoad(planTargetMileage, loadBaselineMileageOrNull(loadSourceWeek))
      : suggestLoad(loadBaselineMileageOrNull(loadSourceWeek), draft.purpose, sourceWorkouts);
  const adjustedWorkouts =
    startingPoint === "smart_adjustment"
      ? scaleDraftWorkoutsToMileage(sourceWorkouts, loadSuggestion.suggestedMileage)
      : sourceWorkouts;
  const nextLoad =
    planTargetMileage !== null
      ? planTargetLoad(planTargetMileage, loadBaselineMileageOrNull(loadSourceWeek))
      : suggestLoad(loadBaselineMileageOrNull(loadSourceWeek), draft.purpose, adjustedWorkouts);
  const nextDraft = {
    ...draft,
    startingPoint,
    priorWeekStartDate: priorWeek?.weekStartDate ?? null,
    noPriorUsableWeek: !priorWeek && startingPoint !== "existing",
    load: nextLoad,
    workouts: adjustedWorkouts.sort(sortDraftWorkouts),
    mismatchAcknowledged: false
  };

  const existingWeek = startingPoint === "existing" ? currentWeek ?? weekStack[draft.weekStartDate] : null;
  if (existingWeek?.goals.length) {
    return {
      ...nextDraft,
      goals: existingWeek.goals.map((goal) => goalDraftFromWeekGoal(goal, "Existing"))
    };
  }

  return {
    ...nextDraft,
    goals: deriveGoalDraftsFromSchedule(nextDraft, startingPoint === "copy_prior" ? "Suggested" : "Schedule")
  };
}

export function findPriorUsableWeek(weekStartDate: string, weekStack: Record<string, TrainingWeek>) {
  return Object.values(weekStack)
    .filter((week) => week.weekStartDate < weekStartDate && isUsablePriorWeek(week))
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))[0];
}

export function isUsablePriorWeek(week: TrainingWeek) {
  return week.workouts.length > 0 || week.actualActivities.length > 0;
}

export function loadBaselineMileageOrNull(week: TrainingWeek | null | undefined) {
  if (!week) {
    return null;
  }
  return comparisonMileage(week);
}

export function suggestLoad(priorMileage: number | null, purpose: WeekPurposeId, workouts: Array<Workout | PlanWeekWorkoutDraft>): ProposedLoad {
  const draftMileage = workouts.length ? sumDraftRunDistance(workouts) : 0;
  const base = priorMileage && priorMileage > 0 ? priorMileage : draftMileage;
  let suggested = base;
  let reason = "No prior usable mileage was found, so the draft starts from the current schedule.";

  if (purpose === "aerobic_build") {
    const increase = Math.min(Math.max(base * 0.04, base > 0 ? 1 : 0), 3);
    suggested = base + increase;
    reason = "Aerobic build, small conservative increase from prior week.";
  } else if (purpose === "maintain") {
    suggested = base;
    reason = "Maintain, keeping load close to the prior usable week.";
  } else if (purpose === "down_week") {
    suggested = base * 0.8;
    reason = "Down week, reducing volume to protect recovery.";
  } else if (purpose === "workout_focus") {
    suggested = base * 0.96;
    reason = "Workout focus, preserving quality without adding total stress.";
  } else if (purpose === "long_run_focus") {
    suggested = base;
    reason = "Long-run focus, holding weekly load while shifting emphasis.";
  } else if (purpose === "recovery") {
    suggested = base * 0.65;
    reason = "Recovery, lowering volume and avoiding hard training.";
  } else if (purpose === "race_week") {
    suggested = base * 0.7;
    reason = "Race week, tapering load around the key race effort.";
  } else {
    suggested = draftMileage || base;
    reason = "Custom purpose, keeping the current draft load until goals are edited.";
  }

  return {
    priorMileage,
    suggestedMileage: roundToTenth(suggested),
    reason
  };
}

export function draftWorkoutsFromWeek(sourceWeek: TrainingWeek, targetWeekStartDate: string): PlanWeekWorkoutDraft[] {
  if (sourceWeek.workouts.length) {
    return sourceWeek.workouts.map((workout) => {
      const dayOffset = daysBetween(sourceWeek.weekStartDate, workout.plannedDate);
      return workoutDraftFromWorkout(workout, addDays(targetWeekStartDate, dayOffset));
    });
  }

  return sourceWeek.actualActivities.map((activity) => {
    const dayOffset = daysBetween(sourceWeek.weekStartDate, activity.activityDate);
    return {
      ...defaultForm(addDays(targetWeekStartDate, dayOffset)),
      draftId: draftId("workout"),
      title: activity.name,
      sport: normalizedActivitySport(activity.sportType),
      workoutType: "easy",
      intensityCategory: "easy",
      plannedDistance: activity.distanceMiles ? String(roundToTenth(activity.distanceMiles)) : "",
      purpose: "Seeded from completed activity"
    };
  });
}

export function workoutDraftFromWorkout(workout: Workout, plannedDate: string): PlanWeekWorkoutDraft {
  return {
    draftId: draftId("workout"),
    plannedDate,
    title: workout.title,
    sport: workout.sport,
    workoutType: workout.workoutType,
    intensityCategory: workout.intensityCategory,
    plannedDistance: workout.plannedDistance?.toString() ?? "",
    plannedDuration: workout.plannedDuration ? String(Math.round(workout.plannedDuration / 60)) : "",
    purpose: workout.purpose,
    instructions: workout.instructions,
    notes: workout.notes,
    status: "planned"
  };
}

export function restWorkoutDraft(plannedDate: string): PlanWeekWorkoutDraft {
  return {
    ...defaultForm(plannedDate),
    draftId: draftId("workout"),
    title: "Rest",
    sport: "rest",
    workoutType: "rest",
    intensityCategory: "rest",
    plannedDistance: "0",
    purpose: "Recovery"
  };
}

export function scaleDraftWorkoutsToMileage(workouts: PlanWeekWorkoutDraft[], targetMileage: number) {
  const currentMileage = sumDraftRunDistance(workouts);
  if (!currentMileage || !targetMileage) {
    return workouts;
  }
  const scale = targetMileage / currentMileage;
  return workouts.map((workout) => {
    if (workout.sport !== "run") {
      return workout;
    }
    return {
      ...workout,
      plannedDistance: String(roundToTenth(Number(workout.plannedDistance || 0) * scale))
    };
  });
}

export function deriveGoalDraftsFromSchedule(draft: PlanWeekDraft, sourceLabel: string): PlanWeekGoalDraft[] {
  const scheduleMileage = sumDraftRunDistance(draft.workouts);
  const mileage =
    sourceLabel === "Schedule"
      ? scheduleMileage
      : draft.load.suggestedMileage || scheduleMileage;
  const hardSessions = countDraftHardSessions(draft.workouts);
  const longestRun = maxDraftRunDistance(draft.workouts);
  const sessions = draft.workouts.filter((workout) => workout.sport !== "rest").length;
  const strengthSessions = draft.workouts.filter((workout) => workout.sport === "strength" || workout.workoutType === "strength").length;
  const goals: PlanWeekGoalDraft[] = [];

  if (mileage > 0) {
    goals.push(newGoalDraft({
      category: "mileage",
      label: `Run ${formatNumber(mileage)} miles`,
      targetValue: mileage,
      minAcceptable: roundToTenth(mileage * 0.94),
      maxAcceptable: roundToTenth(mileage * 1.06),
      unit: "mi",
      evaluationMode: "range",
      priority: "primary",
      sourceLabel
    }));
  }

  if (hardSessions > 0 || ["workout_focus", "race_week"].includes(draft.purpose)) {
    const target = draft.purpose === "recovery" ? 0 : Math.max(hardSessions, draft.purpose === "workout_focus" ? 1 : 0);
    goals.push(newGoalDraft({
      category: "quality",
      label: `Complete ${target} hard session${target === 1 ? "" : "s"}`,
      targetValue: target,
      minAcceptable: target,
      maxAcceptable: 2,
      unit: "sessions",
      evaluationMode: "at_least",
      priority: "primary",
      sourceLabel
    }));
  }

  if (longestRun > 0) {
    goals.push(newGoalDraft({
      category: "long_run",
      label: `Long run near ${formatNumber(longestRun)} miles`,
      targetValue: longestRun,
      minAcceptable: Math.max(roundToTenth(longestRun - 1), 0),
      maxAcceptable: roundToTenth(longestRun + 1),
      unit: "mi",
      evaluationMode: "range",
      priority: "primary",
      sourceLabel
    }));
  }

  goals.push(newGoalDraft({
    category: "recovery",
    label: "Include at least 1 rest day",
    targetValue: 1,
    minAcceptable: 1,
    unit: "days",
    evaluationMode: "at_least",
    priority: "secondary",
    sourceLabel
  }));

  if (sessions > 0) {
    goals.push(newGoalDraft({
      category: "sessions",
      label: `Complete ${sessions} sessions`,
      targetValue: sessions,
      minAcceptable: sessions,
      unit: "sessions",
      evaluationMode: "at_least",
      priority: "secondary",
      sourceLabel
    }));
  }

  if (strengthSessions > 0) {
    goals.push(newGoalDraft({
      category: "strength",
      label: `Complete ${strengthSessions} strength session${strengthSessions === 1 ? "" : "s"}`,
      targetValue: strengthSessions,
      minAcceptable: strengthSessions,
      unit: "sessions",
      evaluationMode: "at_least",
      priority: "secondary",
      sourceLabel
    }));
  }

  if (scheduleMileage > 0) {
    goals.push(newGoalDraft({
      category: "long_run",
      goalType: "guardrail",
      label: "Long run no more than 30% of week",
      targetValue: 30,
      maxAcceptable: 30,
      unit: "percent",
      evaluationMode: "at_most",
      priority: "guardrail",
      sourceLabel
    }));
    goals.push(newGoalDraft({
      category: "quality",
      goalType: "guardrail",
      label: "No more than 2 hard days",
      targetValue: 2,
      maxAcceptable: 2,
      unit: "days",
      evaluationMode: "at_most",
      priority: "guardrail",
      sourceLabel
    }));
  }

  return goals;
}

export function newGoalDraft({
  category,
  evaluationMode,
  goalType = "achievement",
  label,
  maxAcceptable,
  minAcceptable,
  priority,
  sourceLabel,
  targetValue,
  unit
}: {
  category: WeekGoalCategory;
  evaluationMode: WeekGoalEvaluationMode;
  goalType?: WeekGoalType;
  label: string;
  maxAcceptable?: number;
  minAcceptable?: number;
  priority: WeekGoalPriority;
  sourceLabel: string;
  targetValue?: number;
  unit: WeekGoalUnit;
}): PlanWeekGoalDraft {
  return {
    ...defaultGoalForm(""),
    draftId: draftId("goal"),
    category,
    goalType,
    label,
    targetValue: targetValue === undefined ? "" : String(targetValue),
    minAcceptable: minAcceptable === undefined ? "" : String(minAcceptable),
    maxAcceptable: maxAcceptable === undefined ? "" : String(maxAcceptable),
    unit,
    evaluationMode,
    priority,
    source: sourceLabel === "Edited" ? "manual" : sourceLabel === "Existing" ? "manual" : "derived_from_plan",
    sourceLabel,
    noBackToBackHardDays: category === "recovery" ? true : undefined,
    strengthRequired: category === "strength" ? true : undefined
  };
}

export function goalDraftFromWeekGoal(goal: WeekGoal, sourceLabel: string): PlanWeekGoalDraft {
  return {
    ...defaultGoalForm(goal.trainingWeekId),
    draftId: draftId("goal"),
    id: goal.id,
    category: goal.category,
    goalType: goal.goalType,
    label: goal.label,
    description: goal.description,
    targetValue: goal.targetValue?.toString() ?? "",
    minAcceptable: goal.minAcceptable?.toString() ?? "",
    maxAcceptable: goal.maxAcceptable?.toString() ?? "",
    unit: goal.unit,
    evaluationMode: goal.evaluationMode,
    priority: goal.priority,
    status: goal.status,
    isEnabled: goal.isEnabled,
    source: goal.source,
    sourceLabel
  };
}

export function evaluatePlanAlignment(draft: PlanWeekDraft): AlignmentItem[] {
  const goals = draft.goals.filter((goal) => goal.isEnabled && goal.goalType === "achievement");
  return goals.map((goal) => {
    if (goal.category === "mileage") {
      const planned = sumDraftRunDistance(draft.workouts);
      return numericAlignment("mileage", "Mileage", planned, goal, `${formatNumber(planned)} planned`);
    }
    if (goal.category === "quality") {
      const hard = countDraftHardSessions(draft.workouts);
      return numericAlignment("quality", "Quality", hard, goal, `${hard} hard session${hard === 1 ? "" : "s"} planned`);
    }
    if (goal.category === "long_run") {
      const longRun = maxDraftRunDistance(draft.workouts);
      return numericAlignment("long_run", "Long run", longRun, goal, `${formatNumber(longRun)} mi longest run`);
    }
    if (goal.category === "recovery") {
      const restDays = countDraftRestDays(draft.workouts, draft.weekStartDate);
      return numericAlignment("recovery", "Recovery", restDays, goal, `${restDays} rest day${restDays === 1 ? "" : "s"} planned`);
    }
    if (goal.category === "sessions") {
      const sessions = draft.workouts.filter((workout) => workout.sport !== "rest").length;
      return numericAlignment("sessions", "Sessions", sessions, goal, `${sessions} sessions planned`);
    }
    if (goal.category === "strength") {
      const strength = draft.workouts.filter((workout) => workout.sport === "strength" || workout.workoutType === "strength").length;
      return numericAlignment("strength", "Strength", strength, goal, `${strength} strength session${strength === 1 ? "" : "s"} planned`);
    }
    return {
      id: goal.draftId,
      label: draftGoalTitle(goal),
      detail: goal.description || "Manual goal will be evaluated after saving.",
      status: "aligned"
    };
  });
}

export function numericAlignment(id: string, label: string, value: number, goal: PlanWeekGoalDraft, prefix: string): AlignmentItem {
  const min = optionalNumber(goal.minAcceptable);
  const max = optionalNumber(goal.maxAcceptable);
  const target = optionalNumber(goal.targetValue);
  const below = min !== null && value < min;
  const above = max !== null && value > max;
  const exactMiss = goal.evaluationMode === "exact-ish" && target !== null && Math.abs(value - target) > 0.5;
  const statusValue: AlignmentStatus = below || above || exactMiss ? "mismatch" : "aligned";
  const range = min !== null && max !== null ? `target range ${formatNumber(min)}-${formatNumber(max)}` : target !== null ? `target ${formatNumber(target)}` : "manual target";
  return {
    id,
    label,
    detail: `${prefix}, ${range}`,
    status: statusValue
  };
}

export function planWeekDraftToPayload(draft: PlanWeekDraft) {
  return {
    purpose: draft.purpose,
    customPurpose: draft.customPurpose,
    targetLongRunDistance: optionalNumber(draft.goals.find((goal) => goal.category === "long_run" && goal.goalType === "achievement")?.targetValue ?? ""),
    workouts: draft.workouts.map((workout) => formToPayload(workout)),
    goals: draft.goals.map((goal) => ({
      ...goalFormToPayload({ ...goal, weekId: draft.weekId }),
      label: goalLabelFromDraft(goal),
      source: goal.source
    }))
  };
}

export function startingPointOptions(draft: PlanWeekDraft): Array<{ value: PlanStartingPoint; label: string }> {
  return [
    ...(draft.hasExistingPlan ? [{ value: "existing" as const, label: "Existing plan" }] : []),
    { value: "copy_prior" as const, label: "Copy prior week" },
    { value: "smart_adjustment" as const, label: "Smart adjustment" },
    { value: "blank" as const, label: "Start blank" }
  ];
}

export function purposeText(draft: PlanWeekDraft) {
  if (draft.purpose === "custom") {
    return draft.customPurpose.trim() || "Custom";
  }
  return weekPurposes.find((option) => option.value === draft.purpose)?.label ?? "Maintain";
}

export function purposeFromText(value: string): WeekPurposeId | null {
  const normalized = value.trim().toLowerCase();
  return weekPurposes.find((option) => option.label.toLowerCase() === normalized)?.value ?? (normalized ? "custom" : null);
}

export function normalizeWeekPurposeId(value: string): WeekPurposeId {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (weekPurposes.some((option) => option.value === normalized)) {
    return normalized as WeekPurposeId;
  }
  return purposeFromText(value) ?? "custom";
}

function planTargetLoad(targetMileage: number, priorMileage: number | null): ProposedLoad {
  return {
    priorMileage,
    suggestedMileage: roundToTenth(targetMileage),
    reason: "Using the week's plan target mileage."
  };
}

export function draftGoalTitle(goal: PlanWeekGoalDraft) {
  if (goal.category === "mileage") {
    return "Mileage";
  }
  if (goal.category === "quality") {
    return "Quality";
  }
  if (goal.category === "long_run") {
    return goal.goalType === "guardrail" ? "Long-run guardrail" : "Long run";
  }
  if (goal.category === "recovery") {
    return "Recovery";
  }
  if (goal.category === "sessions") {
    return "Sessions";
  }
  if (goal.category === "strength") {
    return "Strength";
  }
  return "Custom goal";
}

export function goalLabelFromDraft(goal: PlanWeekGoalDraft) {
  const target = optionalNumber(goal.targetValue);
  if (goal.category === "mileage" && target !== null) {
    return `Run ${formatNumber(target)} miles`;
  }
  if (goal.category === "quality" && target !== null) {
    return `Complete ${formatNumber(target)} hard session${target === 1 ? "" : "s"}`;
  }
  if (goal.category === "long_run" && goal.goalType === "achievement" && target !== null) {
    return `Long run near ${formatNumber(target)} miles`;
  }
  if (goal.category === "recovery" && target !== null) {
    return `Include at least ${formatNumber(target)} rest day${target === 1 ? "" : "s"}`;
  }
  if (goal.category === "sessions" && target !== null) {
    return `Complete ${formatNumber(target)} sessions`;
  }
  if (goal.category === "strength" && target !== null) {
    return `Complete ${formatNumber(target)} strength session${target === 1 ? "" : "s"}`;
  }
  return goal.label;
}

export function formatDraftWorkoutLabel(workout: PlanWeekWorkoutDraft) {
  if (workout.sport === "rest") {
    return "Rest";
  }
  const miles = optionalNumber(workout.plannedDistance);
  return workout.title || (miles !== null && miles > 0 ? `${formatNumber(miles)} mi ${labelForWorkoutType(workout.workoutType)}` : labelForWorkoutType(workout.workoutType));
}

export function formatGuardrailDraft(goal: PlanWeekGoalDraft) {
  const max = optionalNumber(goal.maxAcceptable);
  const target = optionalNumber(goal.targetValue);
  if (goal.category === "long_run" && max !== null) {
    return `Long run <= ${formatNumber(max)}% of week`;
  }
  if (goal.category === "quality" && max !== null) {
    return `Hard days <= ${formatNumber(max)}`;
  }
  if (target !== null) {
    return `${goalLabelFromDraft(goal)} target ${formatNumber(target)}`;
  }
  return goal.description || "Guardrail";
}

export function sortDraftWorkouts(a: PlanWeekWorkoutDraft, b: PlanWeekWorkoutDraft) {
  return a.plannedDate.localeCompare(b.plannedDate) || a.title.localeCompare(b.title);
}

export function sumDraftRunDistance(workouts: Array<Pick<Workout, "sport" | "plannedDistance"> | PlanWeekWorkoutDraft>) {
  return roundToTenth(
    workouts.reduce((sum, workout) => {
      if (workout.sport !== "run") {
        return sum;
      }
      const distance = typeof workout.plannedDistance === "string" ? Number(workout.plannedDistance || 0) : workout.plannedDistance ?? 0;
      return sum + distance;
    }, 0)
  );
}

export function maxDraftRunDistance(workouts: PlanWeekWorkoutDraft[]) {
  return roundToTenth(
    Math.max(
      ...workouts
        .filter((workout) => workout.sport === "run")
        .map((workout) => Number(workout.plannedDistance || 0)),
      0
    )
  );
}

export function countDraftHardSessions(workouts: PlanWeekWorkoutDraft[]) {
  return new Set(
    workouts
      .filter((workout) => workout.intensityCategory === "workout" || workout.intensityCategory === "race")
      .map((workout) => workout.plannedDate)
  ).size;
}

export function countDraftRestDays(workouts: PlanWeekWorkoutDraft[], weekStartDate: string) {
  const trainingDays = new Set(workouts.filter((workout) => workout.sport !== "rest").map((workout) => workout.plannedDate));
  return Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)).filter((dateValue) => !trainingDays.has(dateValue)).length;
}

export function normalizedActivitySport(sportType: string): Workout["sport"] {
  return sportType.toLowerCase().includes("run") ? "run" : "other";
}

function draftId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
