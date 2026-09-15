import { formatNumber } from "../../lib/formatters";
import { daysBetween } from "../../lib/dates";
import type {
  Mesocycle,
  MesocyclePhase,
  PlanWeekSummary,
  RecurringGoal,
  TrainingPlan,
  TrainingWeek,
  WeekGoal,
  WeekGoalCategory,
  WeekGoalMetric,
  WeekGoalType,
  Workout
} from "../../types/domain";

export type RuleStatus = "pass" | "warning" | "fail" | "pending" | "override" | "not_applicable";

export type RuleKind =
  | "rest_days"
  | "hard_days"
  | "long_run_percent"
  | "long_run_scheduled"
  | "down_week_rhythm";

export type PlanRule = {
  id: string;
  kind: RuleKind;
  label: string;
  goalType: WeekGoalType;
  category: WeekGoalCategory | null;
  metricKey: WeekGoalMetric | null;
  threshold: number | null;
  origin: "baseline" | "plan" | "phase";
  originLabel: string;
  phaseScope?: MesocyclePhase | null;
  excludedPhases?: MesocyclePhase[];
};

export type RuleWeekInput = {
  week: TrainingWeek;
  summary?: PlanWeekSummary | null;
  mesocycle?: Mesocycle | null;
};

export type RuleEvaluation = {
  ruleId: string;
  ruleLabel: string;
  weekId: string;
  weekStartDate: string;
  weekEndDate: string;
  status: RuleStatus;
  reason: string;
  metrics?: string;
  relatedWorkoutIds: string[];
  category?: WeekGoalCategory | null;
  metricKey?: WeekGoalMetric | null;
  origin?: PlanRule["origin"];
  originLabel?: string;
};

export const ruleStatusLabels: Record<RuleStatus, string> = {
  pass: "Pass",
  warning: "Warning",
  fail: "Fail",
  pending: "Pending",
  override: "Override",
  not_applicable: "Not applicable"
};

const QUALITY_TYPES = new Set([
  "tempo",
  "threshold",
  "interval",
  "hill",
  "race",
  "time_trial",
  "progression",
  "strides"
]);

// A limit can be slightly exceeded before it reads as a hard failure.
const LIMIT_WARNING_TOLERANCE = 1.1;

// Actual activities carry no workout labels, so a completed run only counts as
// a long run when it takes up a meaningful share of the week.
const ACTUAL_LONG_RUN_MIN_SHARE = 0.25;

// Ratio-based guidance is misleading while a week is still only a sketch.
// Wait until there are enough planned runs for a percentage to be useful.
const MIN_RUNS_FOR_LONG_RUN_SHARE = 3;

// Matches the quality-session heuristic used across the app for Strava names.
const QUALITY_NAME_PATTERN = /tempo|threshold|interval|hill|race|workout|reps|repeat|fartlek/i;

// Past weeks are judged by what actually happened; current and future weeks by
// what is planned. Null means there is nothing to evaluate yet.
export type EvaluationBasis = "planned" | "actual";

export function buildPlanRules({
  defaultGoals,
  plan
}: {
  defaultGoals: RecurringGoal[];
  plan: TrainingPlan | null;
}): PlanRule[] {
  const planGoals = plan?.recurringGoals ?? [];
  const phaseGoals = planGoals.filter((goal) => goal.mesocyclePhase);
  const activeGoals = [...planGoals.filter((goal) => !goal.mesocyclePhase), ...defaultGoals];
  const restGoal = matchGoal(activeGoals, "rest_day_count", "recovery", "at_least");
  const hardGoal = matchGoal(activeGoals, "hard_training_day_count", "quality", "at_most");
  const longRunPercentGoal =
    activeGoals.find(
      (goal) =>
        (goal.metricKey === "long_run_share" ||
          (!goal.metricKey && goal.category === "long_run" && goal.unit === "percent")) &&
        goal.evaluationMode === "at_most" &&
        goal.unit === "percent"
    ) ?? null;

  const restMinimum = goalMinimum(restGoal) ?? 1;
  const hardLimit = goalLimit(hardGoal) ?? 2;
  const longRunLimit = goalLimit(longRunPercentGoal) ?? 30;
  const originFor = (goal: RecurringGoal | null, fallback = "Training preference") => {
    if (!goal) {
      return { origin: "baseline" as const, originLabel: fallback };
    }
    if (plan?.recurringGoals.some((candidate) => candidate.id === goal.id)) {
      return { origin: "plan" as const, originLabel: `${plan.name} plan` };
    }
    return { origin: "baseline" as const, originLabel: "Training preference" };
  };

  const rules: PlanRule[] = [
    {
      id: "rest-days",
      kind: "rest_days",
      label: restGoal?.label ?? `At least ${restMinimum} rest day${restMinimum === 1 ? "" : "s"}`,
      goalType: restGoal?.goalType ?? "guardrail",
      category: "recovery",
      metricKey: "rest_day_count",
      threshold: restMinimum,
      excludedPhases: overriddenPhases(phaseGoals, "rest_day_count"),
      ...originFor(restGoal)
    },
    {
      id: "hard-days",
      kind: "hard_days",
      label: hardGoal?.label ?? `No more than ${hardLimit} hard days`,
      goalType: hardGoal?.goalType ?? "guardrail",
      category: "quality",
      metricKey: "hard_training_day_count",
      threshold: hardLimit,
      excludedPhases: overriddenPhases(phaseGoals, "hard_training_day_count"),
      ...originFor(hardGoal)
    },
    {
      id: "long-run-percent",
      kind: "long_run_percent",
      label: longRunPercentGoal?.label ?? `Long run no more than ${formatNumber(longRunLimit)}% of week`,
      goalType: longRunPercentGoal?.goalType ?? "guardrail",
      category: "long_run",
      metricKey: "long_run_share",
      threshold: longRunLimit,
      excludedPhases: overriddenPhases(phaseGoals, "long_run_share"),
      ...originFor(longRunPercentGoal)
    },
    {
      id: "long-run-scheduled",
      kind: "long_run_scheduled",
      label: "Long run scheduled",
      goalType: "achievement",
      category: "long_run",
      metricKey: "longest_run_distance",
      threshold: null,
      origin: plan ? "plan" : "baseline",
      originLabel: plan ? `${plan.name} plan` : "Training preference"
    }
  ];

  phaseGoals.forEach((goal) => {
    const phaseRule = planRuleForPhaseGoal(goal);
    if (phaseRule) {
      rules.push(phaseRule);
    }
  });

  if (plan?.mesocycles.some((mesocycle) => mesocycle.downWeekCadence)) {
    rules.push({
      id: "down-week-rhythm",
      kind: "down_week_rhythm",
      label: "Down-week rhythm",
      goalType: "guardrail",
      category: null,
      metricKey: null,
      threshold: null,
      origin: "phase",
      originLabel: "Training phase"
    });
  }

  return rules;
}

export function evaluateRulesForWeek(rules: PlanRule[], input: RuleWeekInput, today: string): RuleEvaluation[] {
  return rules.map((rule) => evaluateRule(rule, input, today));
}

export function evaluateRule(rule: PlanRule, input: RuleWeekInput, today: string): RuleEvaluation {
  const { week } = input;
  const base = {
    ruleId: rule.id,
    ruleLabel: rule.label,
    weekId: week.id,
    weekStartDate: week.weekStartDate,
    weekEndDate: week.weekEndDate,
    relatedWorkoutIds: [] as string[],
    category: rule.category,
    metricKey: rule.metricKey,
    origin: rule.origin,
    originLabel: rule.originLabel
  };

  const weekPhase = input.mesocycle?.phase ?? input.summary?.mesocyclePhase ?? null;
  if (
    (rule.phaseScope && weekPhase !== rule.phaseScope) ||
    (weekPhase && rule.excludedPhases?.includes(weekPhase))
  ) {
    return {
      ...base,
      status: "not_applicable",
      reason: rule.phaseScope
        ? `This check applies only during the ${phaseName(rule.phaseScope)} phase.`
        : "A phase-specific check applies this week."
    };
  }

  const overrideGoal = findOverrideGoal(rule, week);
  if (overrideGoal) {
    return {
      ...base,
      status: "override",
      reason:
        overrideGoal.status === "waived"
          ? `"${overrideGoal.label}" is waived for this week.`
          : `"${overrideGoal.label}" is turned off for this week.`
    };
  }

  const basis = evaluationBasis(week, today);
  if (!basis) {
    return {
      ...base,
      status: "pending",
      reason:
        week.weekEndDate < today
          ? "Nothing was planned or logged for this week."
          : "Week not planned yet — plan it to check this goal."
    };
  }

  switch (rule.kind) {
    case "rest_days":
      return { ...base, ...evaluateRestDays(rule, week, basis) };
    case "hard_days":
      return { ...base, ...evaluateHardDays(rule, week, basis) };
    case "long_run_percent":
      return { ...base, ...evaluateLongRunPercent(rule, week, basis) };
    case "long_run_scheduled":
      return { ...base, ...evaluateLongRunScheduled(week, today, basis) };
    case "down_week_rhythm":
      return { ...base, ...evaluateDownWeekRhythm(input) };
  }
}

export function evaluationBasis(week: TrainingWeek, today: string): EvaluationBasis | null {
  if (week.weekEndDate < today && hasActualWork(week)) {
    return "actual";
  }
  return isUnplannedWeek(week) ? null : "planned";
}

export type GoalImpactSummary = {
  totalWeeks: number;
  evaluatedWeeks: number;
  healthyWeeks: number;
  warningWeeks: number;
  failureWeeks: number;
  pendingWeeks: number;
};

export function summarizeRuleMatrix(evaluations: RuleEvaluation[]): GoalImpactSummary {
  const byWeek = new Map<string, RuleEvaluation[]>();
  evaluations.forEach((evaluation) => {
    const existing = byWeek.get(evaluation.weekStartDate) ?? [];
    existing.push(evaluation);
    byWeek.set(evaluation.weekStartDate, existing);
  });

  const summary: GoalImpactSummary = {
    totalWeeks: byWeek.size,
    evaluatedWeeks: 0,
    healthyWeeks: 0,
    warningWeeks: 0,
    failureWeeks: 0,
    pendingWeeks: 0
  };

  byWeek.forEach((weekEvaluations) => {
    if (weekEvaluations.some((evaluation) => evaluation.status === "fail")) {
      summary.failureWeeks += 1;
      summary.evaluatedWeeks += 1;
    } else if (weekEvaluations.some((evaluation) => evaluation.status === "warning")) {
      summary.warningWeeks += 1;
      summary.evaluatedWeeks += 1;
    } else if (weekEvaluations.some((evaluation) => evaluation.status === "pending")) {
      summary.pendingWeeks += 1;
    } else {
      summary.healthyWeeks += 1;
      summary.evaluatedWeeks += 1;
    }
  });

  return summary;
}

type PartialEvaluation = Pick<RuleEvaluation, "status" | "reason"> &
  Partial<Pick<RuleEvaluation, "metrics" | "relatedWorkoutIds">>;

function evaluateRestDays(rule: PlanRule, week: TrainingWeek, basis: EvaluationBasis): PartialEvaluation {
  const { threshold: minimum, note } = effectiveThreshold(rule, week);
  const word = basis === "actual" ? "taken" : "planned";
  const activeDates =
    basis === "actual"
      ? new Set(actualTrainingDates(week))
      : new Set(week.workouts.filter((workout) => workout.sport !== "rest").map((workout) => workout.plannedDate));
  const restDays = 7 - activeDates.size;
  const metrics = withNote(`${restDays} rest ${pluralDay(restDays)} ${word} · minimum ${formatNumber(minimum)}`, note);

  if (restDays >= minimum) {
    return { status: "pass", reason: `${restDays} rest ${pluralDay(restDays)} ${word}.`, metrics };
  }
  return {
    status: "fail",
    reason:
      restDays === 0
        ? `No rest day ${word} this week.`
        : `Only ${restDays} rest ${pluralDay(restDays)} ${word}; minimum is ${formatNumber(minimum)}.`,
    metrics
  };
}

function evaluateHardDays(rule: PlanRule, week: TrainingWeek, basis: EvaluationBasis): PartialEvaluation {
  const { threshold: limit, note } = effectiveThreshold(rule, week);
  const word = basis === "actual" ? "completed" : "planned";
  const qualityWorkouts = basis === "actual" ? [] : week.workouts.filter(isQualityWorkout);
  const hardDates =
    basis === "actual"
      ? actualHardDates(week)
      : Array.from(new Set(qualityWorkouts.map((workout) => workout.plannedDate))).sort();
  const count = hardDates.length;
  const metrics = withNote(`${count} hard ${pluralDay(count)} · limit ${formatNumber(limit)}`, note);
  const relatedWorkoutIds = qualityWorkouts.map((workout) => workout.id);

  if (count > limit) {
    return {
      status: "fail",
      reason: `${count} hard ${pluralDay(count)} ${word}; limit is ${formatNumber(limit)}.`,
      metrics,
      relatedWorkoutIds
    };
  }
  if (count >= 2 && hasBackToBackDates(hardDates)) {
    return {
      status: "warning",
      reason: `${count} hard days ${word} back-to-back; spread them out for recovery.`,
      metrics,
      relatedWorkoutIds
    };
  }
  return {
    status: "pass",
    reason: count === 0 ? `No hard days ${word}.` : `${count} hard ${pluralDay(count)} ${word}.`,
    metrics,
    relatedWorkoutIds
  };
}

function evaluateLongRunPercent(rule: PlanRule, week: TrainingWeek, basis: EvaluationBasis): PartialEvaluation {
  const plannedRuns = week.workouts.filter(
    (workout) => workout.sport === "run" && (workout.plannedDistance ?? 0) > 0
  );
  const longRun = basis === "actual" ? longestActualRun(week) : plannedLongRunCandidate(week);
  if (basis === "planned" && plannedRuns.length < MIN_RUNS_FOR_LONG_RUN_SHARE) {
    return {
      status: "pending",
      reason: `Add at least ${MIN_RUNS_FOR_LONG_RUN_SHARE} runs before checking the long-run share.`
    };
  }
  if (!longRun) {
    return {
      status: "not_applicable",
      reason: basis === "actual" ? "No run logged to measure." : "No long run planned to measure."
    };
  }
  const totalMileage = basis === "actual" ? week.actualMileage : week.plannedMileage;
  if (totalMileage <= 0) {
    return { status: "not_applicable", reason: "No weekly mileage to measure against." };
  }

  const { threshold: limit, note } = effectiveThreshold(rule, week);
  const percent = (longRun.distance / totalMileage) * 100;
  const metrics = withNote(
    `Long run ${formatNumber(longRun.distance)} mi / ${formatNumber(totalMileage)} mi = ${Math.round(percent)}% · limit ${formatNumber(limit)}%`,
    note
  );
  const relatedWorkoutIds = longRun.workoutId ? [longRun.workoutId] : [];

  if (percent <= limit) {
    return { status: "pass", reason: `Long run is ${Math.round(percent)}% of the weekly mileage.`, metrics, relatedWorkoutIds };
  }
  if (percent <= limit * LIMIT_WARNING_TOLERANCE) {
    return {
      status: "warning",
      reason: `Long run is ${Math.round(percent)}% of the week, just over the ${formatNumber(limit)}% limit.`,
      metrics,
      relatedWorkoutIds
    };
  }
  return {
    status: "fail",
    reason: `Long run is ${Math.round(percent)}% of the weekly mileage; limit is ${formatNumber(limit)}%.`,
    metrics,
    relatedWorkoutIds
  };
}

function evaluateLongRunScheduled(week: TrainingWeek, today: string, basis: EvaluationBasis): PartialEvaluation {
  if (isRaceWeek(week)) {
    return { status: "not_applicable", reason: "Race week — the race replaces the long run." };
  }

  if (basis === "actual") {
    const longest = longestActualRun(week);
    if (!longest || week.actualMileage <= 0) {
      return { status: "fail", reason: "No long run completed this week." };
    }
    const share = longest.distance / week.actualMileage;
    if (share >= ACTUAL_LONG_RUN_MIN_SHARE) {
      return {
        status: "pass",
        reason: `${longest.title} · ${formatNumber(longest.distance)} mi.`,
        metrics: `Long run ${formatNumber(longest.distance)} mi`
      };
    }
    return {
      status: "fail",
      reason: `Longest run was ${formatNumber(longest.distance)} mi (${Math.round(share * 100)}% of the week) — no true long run completed.`
    };
  }

  const longRun = plannedLongRunWorkout(week);
  if (longRun) {
    const distance = longRun.plannedDistance ?? 0;
    return {
      status: "pass",
      reason: distance > 0 ? `${longRun.title} · ${formatNumber(distance)} mi.` : `${longRun.title} is on the schedule.`,
      metrics: distance > 0 ? `Long run ${formatNumber(distance)} mi` : undefined,
      relatedWorkoutIds: [longRun.id]
    };
  }
  const plannedRuns = week.workouts.filter((workout) => workout.sport === "run");
  if (plannedRuns.length < MIN_RUNS_FOR_LONG_RUN_SHARE) {
    return {
      status: "pending",
      reason: "The week is still taking shape — add the remaining runs before checking for a long run."
    };
  }
  if (week.weekStartDate > today) {
    return { status: "warning", reason: "No long run scheduled yet — there is still time to add one." };
  }
  return { status: "fail", reason: "No long run on the schedule this week." };
}

function evaluateDownWeekRhythm(input: RuleWeekInput): PartialEvaluation {
  const { week, summary, mesocycle } = input;
  if (!summary) {
    return { status: "not_applicable", reason: "Outside the active plan." };
  }
  const isDownWeek = summary.isDownWeek || week.isDownWeek;
  const cadence = mesocycle?.downWeekCadence ?? null;
  const phaseLabel = summary.mesocycleName || mesocycle?.name || "this phase";

  if (isDownWeek) {
    return {
      status: "pass",
      reason: "Down week — reduced load as scheduled.",
      metrics: rhythmMetrics(summary, cadence)
    };
  }
  if (!cadence) {
    return { status: "not_applicable", reason: `No down-week cadence set for ${phaseLabel}.` };
  }
  const weekIndex = summary.weekIndexInMesocycle;
  if (weekIndex === null) {
    return { status: "not_applicable", reason: "Not part of a phase with a down-week cadence." };
  }
  // weekIndexInMesocycle is 1-based; the backend marks every Nth week as down.
  if (weekIndex % cadence === 0) {
    return {
      status: "warning",
      reason: `Every ${ordinal(cadence)} week of ${phaseLabel} should be a down week; this one is not.`,
      metrics: rhythmMetrics(summary, cadence)
    };
  }
  return {
    status: "not_applicable",
    reason: `Regular week — a down week lands every ${ordinal(cadence)} week of ${phaseLabel}.`,
    metrics: rhythmMetrics(summary, cadence)
  };
}

function rhythmMetrics(summary: PlanWeekSummary | null | undefined, cadence: number | null) {
  if (!summary || summary.weekIndexInMesocycle === null) {
    return undefined;
  }
  const pieces = [`Week ${summary.weekIndexInMesocycle} of ${summary.mesocycleWeekCount ?? "?"}`];
  if (summary.mesocycleName) {
    pieces.push(summary.mesocycleName);
  }
  if (cadence) {
    pieces.push(`down every ${ordinal(cadence)} week`);
  }
  return pieces.join(" · ");
}

function matchGoal(
  goals: RecurringGoal[],
  metricKey: WeekGoalMetric,
  category: WeekGoalCategory,
  mode: RecurringGoal["evaluationMode"]
) {
  return (
    goals.find((goal) => goal.metricKey === metricKey && goal.evaluationMode === mode) ??
    goals.find(
      (goal) => !goal.metricKey && goal.category === category && goal.evaluationMode === mode
    ) ??
    null
  );
}

function overriddenPhases(goals: RecurringGoal[], metricKey: WeekGoalMetric): MesocyclePhase[] {
  return Array.from(
    new Set(
      goals
        .filter((goal) => goal.mesocyclePhase && planRuleForPhaseGoal(goal)?.metricKey === metricKey)
        .map((goal) => goal.mesocyclePhase!)
    )
  );
}

function planRuleForPhaseGoal(goal: RecurringGoal): PlanRule | null {
  const phaseScope = goal.mesocyclePhase;
  if (!phaseScope) {
    return null;
  }
  const metricKey = recurringGoalMetric(goal);
  const kind: RuleKind | null =
    metricKey === "rest_day_count" && goal.evaluationMode === "at_least"
      ? "rest_days"
      : metricKey === "hard_training_day_count" && goal.evaluationMode === "at_most"
        ? "hard_days"
        : metricKey === "long_run_share" && goal.evaluationMode === "at_most"
          ? "long_run_percent"
          : null;
  if (!kind) {
    return null;
  }
  const threshold = kind === "rest_days" ? goalMinimum(goal) : goalLimit(goal);
  if (threshold === null) {
    return null;
  }
  return {
    id: `${kind}-${goal.id}`,
    kind,
    label: goal.label,
    goalType: goal.goalType,
    category: goal.category,
    metricKey,
    threshold,
    origin: "phase",
    originLabel: `${phaseName(phaseScope)} phase`,
    phaseScope
  };
}

function recurringGoalMetric(goal: RecurringGoal): WeekGoalMetric | null {
  if (goal.metricKey) {
    return goal.metricKey;
  }
  if (goal.category === "recovery" && goal.unit === "days") {
    return "rest_day_count";
  }
  if (goal.category === "quality" && ["days", "sessions"].includes(goal.unit)) {
    return "hard_training_day_count";
  }
  if (goal.category === "long_run" && goal.unit === "percent") {
    return "long_run_share";
  }
  return null;
}

function phaseName(phase: MesocyclePhase) {
  return phase
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function goalMinimum(goal: RecurringGoal | null) {
  return goal ? goal.minAcceptable ?? goal.targetValue : null;
}

function goalLimit(goal: RecurringGoal | null) {
  return goal ? goal.maxAcceptable ?? goal.targetValue : null;
}

function findOverrideGoal(rule: PlanRule, week: TrainingWeek): WeekGoal | null {
  if (!rule.category) {
    return null;
  }
  return (
    week.goals.find(
      (goal) =>
        (goal.metricKey === rule.metricKey || (!goal.metricKey && goal.category === rule.category)) &&
        (goal.status === "waived" || !goal.isEnabled)
    ) ?? null
  );
}

// A per-week goal of the same shape overrides the standing threshold.
function effectiveThreshold(rule: PlanRule, week: TrainingWeek): { threshold: number; note: string | null } {
  const fallback = rule.threshold ?? 0;
  const weekGoal = week.goals.find(
    (goal) =>
      goal.isEnabled &&
      goal.source === "manual" &&
      (goal.metricKey === rule.metricKey || (!goal.metricKey && goal.category === rule.category)) &&
      goal.evaluationMode === (rule.kind === "rest_days" ? "at_least" : "at_most") &&
      (rule.kind !== "long_run_percent" || goal.unit === "percent")
  );
  const weekValue = weekGoal
    ? rule.kind === "rest_days"
      ? weekGoal.minAcceptable ?? weekGoal.targetValue
      : weekGoal.maxAcceptable ?? weekGoal.targetValue
    : null;
  if (weekValue === null || weekValue === fallback) {
    return { threshold: fallback, note: null };
  }
  return { threshold: weekValue, note: `week override ${formatNumber(weekValue)}` };
}

function withNote(metrics: string, note: string | null) {
  return note ? `${metrics} (${note})` : metrics;
}

export function isUnplannedWeek(week: TrainingWeek) {
  return week.workouts.length === 0 && week.plannedMileage <= 0;
}

function isRaceWeek(week: TrainingWeek) {
  return (
    week.purpose === "race_week" ||
    week.workouts.some((workout) => workout.workoutType === "race" || workout.intensityCategory === "race")
  );
}

function isQualityWorkout(workout: Workout) {
  return (
    workout.intensityCategory === "workout" ||
    workout.intensityCategory === "race" ||
    QUALITY_TYPES.has(workout.workoutType)
  );
}

function plannedLongRunWorkout(week: TrainingWeek) {
  return (
    week.workouts
      .filter(
        (workout) =>
          workout.sport === "run" && (workout.workoutType === "long_run" || workout.workoutType === "medium_long")
      )
      .sort((left, right) => (right.plannedDistance ?? 0) - (left.plannedDistance ?? 0))[0] ?? null
  );
}

type LongRunCandidate = { distance: number; title: string; workoutId: string | null };

function plannedLongRunCandidate(week: TrainingWeek): LongRunCandidate | null {
  const workout = plannedLongRunWorkout(week);
  if (!workout || (workout.plannedDistance ?? 0) <= 0) {
    return null;
  }
  return { distance: workout.plannedDistance ?? 0, title: workout.title, workoutId: workout.id };
}

function longestActualRun(week: TrainingWeek): LongRunCandidate | null {
  const sessions = week.performedSessions ?? [];
  const groupedActivityIds = new Set(
    sessions.flatMap((session) => session.recordings.map((recording) => recording.stravaActivityId))
  );
  const sessionRuns: LongRunCandidate[] = sessions
    .filter(
      (session) =>
        session.sport === "run" &&
        session.recordings.length > 0 &&
        !["skipped", "missed"].includes(session.outcome) &&
        (session.totalDistanceMeters ?? 0) > 0
    )
    .map((session) => {
      const workout = week.workouts.find((item) => item.id === session.plannedWorkoutId);
      return {
        distance: (session.totalDistanceMeters ?? 0) / 1609.344,
        title: workout?.title ?? "Completed run",
        workoutId: workout?.id ?? null
      };
    });
  const ungroupedRuns: LongRunCandidate[] = week.actualActivities
    .filter(
      (activity) =>
        !groupedActivityIds.has(activity.id) &&
        /run/i.test(activity.sportType) &&
        activity.distanceMiles > 0
    )
    .map((activity) => ({ distance: activity.distanceMiles, title: activity.name, workoutId: null }));
  return [...sessionRuns, ...ungroupedRuns].sort((left, right) => right.distance - left.distance)[0] ?? null;
}

function actualHardDates(week: TrainingWeek) {
  const sessions = (week.performedSessions ?? []).filter((session) => session.recordings.length > 0);
  const groupedActivityIds = new Set(
    sessions.flatMap((session) => session.recordings.map((recording) => recording.stravaActivityId))
  );
  const workoutsById = new Map(week.workouts.map((workout) => [workout.id, workout]));
  const sessionDates = sessions
    .filter((session) => {
      if (["skipped", "missed"].includes(session.outcome)) return false;
      if (["workout", "race"].includes(session.intensityCategory ?? "")) return true;
      const workout = workoutsById.get(session.plannedWorkoutId ?? "");
      return Boolean(
        workout &&
        ["as_planned", "moved"].includes(session.outcome) &&
        isQualityWorkout(workout)
      );
    })
    .map((session) => session.occurredAt.slice(0, 10));
  const ungroupedActivityDates = week.actualActivities
    .filter(
      (activity) =>
        !groupedActivityIds.has(activity.id) &&
        QUALITY_NAME_PATTERN.test(`${activity.sportType} ${activity.name}`)
    )
    .map((activity) => activity.activityDate);
  return Array.from(
    new Set([...sessionDates, ...ungroupedActivityDates])
  ).sort();
}

function hasActualWork(week: TrainingWeek) {
  return (
    (week.performedSessions?.some((session) => session.recordings.length > 0) ?? false) ||
    week.actualActivities.length > 0 ||
    week.actualMileage > 0
  );
}

function actualTrainingDates(week: TrainingWeek) {
  const sessions = (week.performedSessions ?? []).filter((session) => session.recordings.length > 0);
  const groupedActivityIds = new Set(
    sessions.flatMap((session) => session.recordings.map((recording) => recording.stravaActivityId))
  );
  return [
    ...sessions
      .filter(
        (session) =>
          !["skipped", "missed"].includes(session.outcome)
      )
      .map((session) => session.occurredAt.slice(0, 10)),
    ...week.actualActivities
      .filter((activity) => !groupedActivityIds.has(activity.id))
      .map((activity) => activity.activityDate)
  ];
}

function hasBackToBackDates(sortedDates: string[]) {
  return sortedDates.some((date, index) => index > 0 && daysBetween(sortedDates[index - 1], date) === 1);
}

function pluralDay(count: number) {
  return count === 1 ? "day" : "days";
}

function ordinal(value: number) {
  if (value === 1) {
    return "1st";
  }
  if (value === 2) {
    return "2nd";
  }
  if (value === 3) {
    return "3rd";
  }
  return `${value}th`;
}
