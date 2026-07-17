import type {
  GoalMetricDefinition,
  RecurringGoal,
  WeekGoalEvaluationMode,
  WeekGoalMetric,
  WeekGoalType
} from "../../types/domain";

// One draft shape backs every place a standing goal is edited: the baseline
// goals on Goals & races and the recurring goals inside the plan editor.
export type GoalDraft = {
  key: string;
  id?: string;
  metricKey: WeekGoalMetric | "";
  // Kept only so legacy goals without a supported metric stay identifiable.
  legacyLabel: string;
  evaluationMode: WeekGoalEvaluationMode;
  value: string;
  minValue: string;
  maxValue: string;
  notes: string;
};

export const goalOperatorLabels: Partial<Record<WeekGoalEvaluationMode, string>> = {
  at_least: "At least",
  at_most: "At most",
  range: "Between",
  "exact-ish": "Exactly"
};

function numberToField(value: number | null): string {
  return value === null ? "" : String(value);
}

function fieldToNumber(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferLegacyMetric(goal: RecurringGoal): WeekGoalMetric | "" {
  const key = `${goal.category}:${goal.unit}`;
  const mapping: Record<string, WeekGoalMetric> = {
    "mileage:mi": "weekly_run_distance",
    "sessions:sessions": "training_session_count",
    "long_run:mi": "longest_run_distance",
    "long_run:percent": "long_run_share",
    "quality:days": "hard_training_day_count",
    "quality:sessions": "hard_training_day_count",
    "recovery:days": "rest_day_count",
    "strength:sessions": "strength_session_count"
  };
  return mapping[key] ?? "";
}

export function goalToDraft(goal: RecurringGoal): GoalDraft {
  const singleValue =
    goal.evaluationMode === "at_least"
      ? goal.minAcceptable ?? goal.targetValue
      : goal.evaluationMode === "at_most"
        ? goal.maxAcceptable ?? goal.targetValue
        : goal.targetValue;
  return {
    key: goal.id,
    id: goal.id,
    metricKey: goal.metricKey ?? inferLegacyMetric(goal),
    legacyLabel: goal.label,
    evaluationMode: goal.evaluationMode,
    value: numberToField(singleValue),
    minValue: numberToField(goal.minAcceptable),
    maxValue: numberToField(goal.maxAcceptable),
    notes: goal.notes
  };
}

export function newGoalDraft(metrics: GoalMetricDefinition[]): GoalDraft | null {
  const firstMetric = metrics[0];
  if (!firstMetric) {
    return null;
  }
  return {
    key: crypto.randomUUID(),
    metricKey: firstMetric.key,
    legacyLabel: "",
    evaluationMode: firstMetric.operators.includes("at_least") ? "at_least" : firstMetric.operators[0],
    value: "",
    minValue: "",
    maxValue: "",
    notes: ""
  };
}

export function metricMap(metrics: GoalMetricDefinition[]) {
  return new Map(metrics.map((metric) => [metric.key, metric]));
}

// Limits ("at most") behave as guardrails in week evaluation; everything else
// is a goal the athlete works toward. Deriving this keeps the editor to a
// single condition control.
export function derivedGoalType(draft: GoalDraft): WeekGoalType {
  return draft.evaluationMode === "at_most" ? "guardrail" : "achievement";
}

export function goalValueUnit(metric: GoalMetricDefinition, value: string): string {
  const singular = Number(value) === 1;
  switch (metric.unit) {
    case "mi":
      return singular ? "mile" : "miles";
    case "sessions":
      return singular ? "session" : "sessions";
    case "days":
      return singular ? "day" : "days";
    case "percent":
      return "%";
    default:
      return metric.unit;
  }
}

function thresholdPhrase(draft: GoalDraft, metric: GoalMetricDefinition): string {
  if (draft.evaluationMode === "range") {
    if (!draft.minValue || !draft.maxValue) {
      return "needs a range";
    }
    const suffix = goalValueUnit(metric, draft.maxValue);
    return metric.unit === "percent"
      ? `between ${draft.minValue}% and ${draft.maxValue}%`
      : `between ${draft.minValue} and ${draft.maxValue} ${suffix}`;
  }
  if (!draft.value) {
    return "needs a value";
  }
  const condition =
    draft.evaluationMode === "at_least"
      ? "at least"
      : draft.evaluationMode === "at_most"
        ? "at most"
        : "exactly";
  const suffix = goalValueUnit(metric, draft.value);
  return metric.unit === "percent"
    ? `${condition} ${draft.value}%`
    : `${condition} ${draft.value} ${suffix}`;
}

export function goalSentence(draft: GoalDraft, metric: GoalMetricDefinition): string {
  const isIncomplete =
    draft.evaluationMode === "range"
      ? !draft.minValue || !draft.maxValue
      : !draft.value;
  if (isIncomplete) {
    return `Set ${metric.label.toLowerCase()}`;
  }
  if (
    metric.key === "back_to_back_hard_pairs" &&
    draft.evaluationMode === "at_most" &&
    Number(draft.value) === 0
  ) {
    return "Avoid back-to-back hard days";
  }
  const phrase = thresholdPhrase(draft, metric);
  switch (metric.key) {
    case "weekly_run_distance":
      return `Run ${phrase}`;
    case "training_session_count":
      return `Complete ${phrase}`;
    case "longest_run_distance":
      return `Keep the longest run ${phrase}`;
    case "hard_training_day_count":
      return `Schedule ${phrase} of hard training`;
    case "rest_day_count":
      return `Keep ${phrase} of rest`;
    case "strength_session_count":
      return `Complete ${phrase} of strength or mobility`;
    case "long_run_share":
      return `Keep the long run ${phrase} of weekly distance`;
    default:
      return `${metric.label}: ${phrase}`;
  }
}

export function goalDraftError(
  draft: GoalDraft,
  metricsByKey: Map<WeekGoalMetric, GoalMetricDefinition>
): string | null {
  if (!draft.metricKey) {
    return "Choose a metric.";
  }
  const metric = metricsByKey.get(draft.metricKey);
  if (!metric) {
    return "This goal uses an unsupported metric.";
  }
  if (!metric.operators.includes(draft.evaluationMode)) {
    return `${metric.label} does not support that condition.`;
  }
  const values =
    draft.evaluationMode === "range" ? [draft.minValue, draft.maxValue] : [draft.value];
  if (values.some((value) => fieldToNumber(value) === null)) {
    return draft.evaluationMode === "range" ? "Enter both ends of the range." : "Enter a value.";
  }
  const numbers = values.map((value) => Number(value));
  if (draft.evaluationMode === "range" && numbers[0] > numbers[1]) {
    return "The minimum cannot be greater than the maximum.";
  }
  if (numbers.some((value) => value < metric.minimum)) {
    return `${metric.label} cannot be less than ${metric.minimum}.`;
  }
  if (metric.maximum !== null && numbers.some((value) => value > metric.maximum!)) {
    return `${metric.label} cannot be greater than ${metric.maximum}.`;
  }
  if (metric.valueType === "integer" && numbers.some((value) => !Number.isInteger(value))) {
    return `${metric.label} must be a whole number.`;
  }
  return null;
}

export function goalDraftPayload(
  draft: GoalDraft,
  metricsByKey: Map<WeekGoalMetric, GoalMetricDefinition>
) {
  if (!draft.metricKey) {
    throw new Error("A metric is required.");
  }
  const metric = metricsByKey.get(draft.metricKey);
  if (!metric) {
    throw new Error("Unsupported metric.");
  }
  const goalType = derivedGoalType(draft);
  const value = fieldToNumber(draft.value);
  const bounds =
    draft.evaluationMode === "at_least"
      ? { targetValue: value, minAcceptable: value, maxAcceptable: null }
      : draft.evaluationMode === "at_most"
        ? { targetValue: value, minAcceptable: null, maxAcceptable: value }
        : draft.evaluationMode === "range"
          ? {
              targetValue: null,
              minAcceptable: fieldToNumber(draft.minValue),
              maxAcceptable: fieldToNumber(draft.maxValue)
            }
          : { targetValue: value, minAcceptable: null, maxAcceptable: null };
  return {
    id: draft.id,
    metricKey: draft.metricKey,
    category: metric.category,
    goalType,
    label: goalSentence(draft, metric),
    description: "",
    ...bounds,
    unit: metric.unit,
    evaluationMode: draft.evaluationMode,
    priority: goalType === "guardrail" ? "guardrail" : "secondary",
    notes: draft.notes
  };
}

export function serializeGoalDrafts(drafts: GoalDraft[]) {
  return JSON.stringify(drafts);
}
