import { formatNumber } from "../../lib/formatters";
import { daysBetween } from "../../lib/dates";
import type {
  Mesocycle,
  PlanWeekSummary,
  RecurringGoal,
  TrainingPlan,
  TrainingWeek,
  WeekGoal,
  WeekGoalCategory,
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
  threshold: number | null;
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
  const activeGoals = [...defaultGoals, ...(plan?.recurringGoals ?? [])];
  const restGoal = matchGoal(activeGoals, "recovery", "at_least", /rest\s*day/i);
  const hardGoal = matchGoal(activeGoals, "quality", "at_most", /hard\s*day/i);
  const longRunPercentGoal =
    activeGoals.find(
      (goal) =>
        goal.unit === "percent" &&
        goal.evaluationMode === "at_most" &&
        (goal.category === "long_run" || /long\s*run/i.test(goal.label))
    ) ?? null;

  const restMinimum = goalMinimum(restGoal) ?? 1;
  const hardLimit = goalLimit(hardGoal) ?? 2;
  const longRunLimit = goalLimit(longRunPercentGoal) ?? 30;

  const rules: PlanRule[] = [
    {
      id: "rest-days",
      kind: "rest_days",
      label: restGoal?.label ?? `At least ${restMinimum} rest day${restMinimum === 1 ? "" : "s"}`,
      goalType: restGoal?.goalType ?? "guardrail",
      category: "recovery",
      threshold: restMinimum
    },
    {
      id: "hard-days",
      kind: "hard_days",
      label: hardGoal?.label ?? `No more than ${hardLimit} hard days`,
      goalType: hardGoal?.goalType ?? "guardrail",
      category: "quality",
      threshold: hardLimit
    },
    {
      id: "long-run-percent",
      kind: "long_run_percent",
      label: longRunPercentGoal?.label ?? `Long run no more than ${formatNumber(longRunLimit)}% of week`,
      goalType: longRunPercentGoal?.goalType ?? "guardrail",
      category: "long_run",
      threshold: longRunLimit
    },
    {
      id: "long-run-scheduled",
      kind: "long_run_scheduled",
      label: "Long run scheduled",
      goalType: "achievement",
      category: "long_run",
      threshold: null
    }
  ];

  if (plan?.mesocycles.some((mesocycle) => mesocycle.downWeekCadence)) {
    rules.push({
      id: "down-week-rhythm",
      kind: "down_week_rhythm",
      label: "Down-week rhythm",
      goalType: "guardrail",
      category: null,
      threshold: null
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
    relatedWorkoutIds: [] as string[]
  };

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
          : "Week not planned yet — plan it to check this rule."
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
    healthyWeeks: 0,
    warningWeeks: 0,
    failureWeeks: 0,
    pendingWeeks: 0
  };

  byWeek.forEach((weekEvaluations) => {
    if (weekEvaluations.some((evaluation) => evaluation.status === "fail")) {
      summary.failureWeeks += 1;
    } else if (weekEvaluations.some((evaluation) => evaluation.status === "warning")) {
      summary.warningWeeks += 1;
    } else if (weekEvaluations.some((evaluation) => evaluation.status === "pending")) {
      summary.pendingWeeks += 1;
    } else {
      summary.healthyWeeks += 1;
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
      ? new Set(week.actualActivities.map((activity) => activity.activityDate))
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
  const longRun = basis === "actual" ? longestActualRun(week) : plannedOrLongestRun(week);
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
  category: WeekGoalCategory,
  mode: RecurringGoal["evaluationMode"],
  labelPattern: RegExp
) {
  return (
    goals.find((goal) => goal.category === category && goal.evaluationMode === mode) ??
    goals.find((goal) => labelPattern.test(goal.label)) ??
    null
  );
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
    week.goals.find((goal) => goal.category === rule.category && (goal.status === "waived" || !goal.isEnabled)) ?? null
  );
}

// A per-week goal of the same shape overrides the standing threshold.
function effectiveThreshold(rule: PlanRule, week: TrainingWeek): { threshold: number; note: string | null } {
  const fallback = rule.threshold ?? 0;
  const weekGoal = week.goals.find(
    (goal) =>
      goal.isEnabled &&
      goal.category === rule.category &&
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

// The percent guardrail caps the biggest single day, so fall back to the
// longest planned run when no workout is labelled as the long run.
function plannedOrLongestRun(week: TrainingWeek): LongRunCandidate | null {
  const workout =
    plannedLongRunWorkout(week) ??
    week.workouts
      .filter((candidate) => candidate.sport === "run" && (candidate.plannedDistance ?? 0) > 0)
      .sort((left, right) => (right.plannedDistance ?? 0) - (left.plannedDistance ?? 0))[0] ??
    null;
  if (!workout || (workout.plannedDistance ?? 0) <= 0) {
    return null;
  }
  return { distance: workout.plannedDistance ?? 0, title: workout.title, workoutId: workout.id };
}

function longestActualRun(week: TrainingWeek): LongRunCandidate | null {
  const activity = week.actualActivities
    .filter((candidate) => /run/i.test(candidate.sportType) && candidate.distanceMiles > 0)
    .sort((left, right) => right.distanceMiles - left.distanceMiles)[0];
  return activity ? { distance: activity.distanceMiles, title: activity.name, workoutId: null } : null;
}

function actualHardDates(week: TrainingWeek) {
  return Array.from(
    new Set(
      week.actualActivities
        .filter((activity) => QUALITY_NAME_PATTERN.test(`${activity.sportType} ${activity.name}`))
        .map((activity) => activity.activityDate)
    )
  ).sort();
}

function hasActualWork(week: TrainingWeek) {
  return week.actualActivities.length > 0 || week.actualMileage > 0;
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
