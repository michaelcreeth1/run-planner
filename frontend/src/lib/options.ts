import type {
  WeekGoalCategory,
  WeekGoalEvaluationMode,
  WeekGoalStatus,
  WeekGoalUnit,
  WeekPurposeId,
  Workout
} from "../types/domain";

export type SessionTypeOption = {
  value: string;
  label: string;
  sport: Workout["sport"];
  workoutType: Workout["workoutType"];
  intensityCategory: Workout["intensityCategory"];
};

export type SessionTypeGroup = {
  label: string;
  options: SessionTypeOption[];
};

export const sessionTypeGroups: SessionTypeGroup[] = [
  {
    label: "Running — easy & aerobic",
    options: [
      { value: "run:recovery", label: "Recovery run", sport: "run", workoutType: "recovery", intensityCategory: "easy" },
      { value: "run:easy", label: "Easy run", sport: "run", workoutType: "easy", intensityCategory: "easy" },
      { value: "run:long_run", label: "Long run", sport: "run", workoutType: "long_run", intensityCategory: "moderate" },
      { value: "run:medium_long", label: "Medium-long run", sport: "run", workoutType: "medium_long", intensityCategory: "moderate" }
    ]
  },
  {
    label: "Running — quality",
    options: [
      { value: "run:progression", label: "Progression run", sport: "run", workoutType: "progression", intensityCategory: "workout" },
      { value: "run:tempo", label: "Tempo run", sport: "run", workoutType: "tempo", intensityCategory: "workout" },
      { value: "run:threshold", label: "Threshold workout", sport: "run", workoutType: "threshold", intensityCategory: "workout" },
      { value: "run:interval", label: "Intervals", sport: "run", workoutType: "interval", intensityCategory: "workout" },
      { value: "run:hill", label: "Hill workout", sport: "run", workoutType: "hill", intensityCategory: "workout" },
      { value: "run:strides", label: "Strides", sport: "run", workoutType: "strides", intensityCategory: "workout" }
    ]
  },
  {
    label: "Running — event",
    options: [
      { value: "run:race", label: "Race", sport: "run", workoutType: "race", intensityCategory: "race" },
      { value: "run:time_trial", label: "Time trial", sport: "run", workoutType: "time_trial", intensityCategory: "race" },
      { value: "run:other", label: "Other run", sport: "run", workoutType: "other", intensityCategory: "moderate" }
    ]
  },
  {
    label: "Other sessions",
    options: [
      { value: "strength:strength", label: "Strength", sport: "strength", workoutType: "strength", intensityCategory: "strength" },
      { value: "mobility:mobility", label: "Mobility", sport: "mobility", workoutType: "mobility", intensityCategory: "easy" },
      { value: "cross_training:other", label: "Cross-training", sport: "cross_training", workoutType: "other", intensityCategory: "moderate" },
      { value: "rest:rest", label: "Rest", sport: "rest", workoutType: "rest", intensityCategory: "rest" },
      { value: "other:other", label: "Other", sport: "other", workoutType: "other", intensityCategory: "moderate" }
    ]
  }
];

export const sessionTypes = sessionTypeGroups.flatMap((group) => group.options);

export function sessionTypeForWorkout(
  workout: Pick<Workout, "sport" | "workoutType">
): SessionTypeOption {
  const exact = sessionTypes.find(
    (option) => option.sport === workout.sport && option.workoutType === workout.workoutType
  );
  if (exact) {
    return exact;
  }

  if (["strength", "mobility", "rest"].includes(workout.workoutType)) {
    return sessionTypes.find((option) => option.workoutType === workout.workoutType)!;
  }

  return (
    sessionTypes.find((option) => option.sport === workout.sport) ??
    sessionTypes.find((option) => option.workoutType === workout.workoutType) ??
    sessionTypes.find((option) => option.value === "other:other")!
  );
}

export const workoutTypes: Array<{ value: Workout["workoutType"]; label: string }> = [
  { value: "easy", label: "Easy" },
  { value: "recovery", label: "Recovery" },
  { value: "long_run", label: "Long run" },
  { value: "medium_long", label: "Medium-long" },
  { value: "tempo", label: "Tempo" },
  { value: "threshold", label: "Threshold" },
  { value: "interval", label: "Interval" },
  { value: "hill", label: "Hill" },
  { value: "race", label: "Race" },
  { value: "time_trial", label: "Time trial" },
  { value: "progression", label: "Progression" },
  { value: "strides", label: "Strides" },
  { value: "strength", label: "Strength" },
  { value: "mobility", label: "Mobility" },
  { value: "rest", label: "Rest" },
  { value: "other", label: "Other" }
];

export const goalCategories: Array<{ value: WeekGoalCategory; label: string }> = [
  { value: "mileage", label: "Mileage" },
  { value: "sessions", label: "Sessions" },
  { value: "long_run", label: "Long run" },
  { value: "quality", label: "Quality" },
  { value: "recovery", label: "Recovery" },
  { value: "strength", label: "Strength" },
  { value: "custom", label: "Custom" }
];

export const goalUnits: Array<{ value: WeekGoalUnit; label: string }> = [
  { value: "mi", label: "Miles" },
  { value: "sessions", label: "Sessions" },
  { value: "days", label: "Days" },
  { value: "percent", label: "Percent" },
  { value: "boolean", label: "Yes/no" },
  { value: "custom", label: "Custom" }
];

export const goalEvaluationModes: Array<{ value: WeekGoalEvaluationMode; label: string }> = [
  { value: "range", label: "Range" },
  { value: "at_least", label: "At least" },
  { value: "at_most", label: "At most" },
  { value: "exact-ish", label: "Exact-ish" },
  { value: "boolean", label: "Yes/no" },
  { value: "manual", label: "Manual" }
];

export const goalStatuses: Array<{ value: WeekGoalStatus; label: string }> = [
  { value: "not_started", label: "Not started" },
  { value: "on_track", label: "On track" },
  { value: "at_risk", label: "At risk" },
  { value: "achieved", label: "Achieved" },
  { value: "partially_achieved", label: "Partial" },
  { value: "missed", label: "Missed" },
  { value: "exceeded", label: "Exceeded" },
  { value: "waived", label: "Waived" }
];

export const weekPurposes: Array<{
  value: WeekPurposeId;
  label: string;
  meaning: string;
  loadDirection: string;
}> = [
  {
    value: "aerobic_build",
    label: "Aerobic build",
    meaning: "Increase load slightly while keeping the week controlled.",
    loadDirection: "Increase slightly"
  },
  {
    value: "maintain",
    label: "Maintain",
    meaning: "Keep load similar to the previous week.",
    loadDirection: "Hold steady"
  },
  {
    value: "down_week",
    label: "Down week",
    meaning: "Reduce volume and protect recovery.",
    loadDirection: "Decrease"
  },
  {
    value: "workout_focus",
    label: "Workout focus",
    meaning: "Preserve quality without increasing total stress.",
    loadDirection: "Hold steady or slight decrease"
  },
  {
    value: "long_run_focus",
    label: "Long-run focus",
    meaning: "Prioritize the long run while keeping total weekly load reasonable.",
    loadDirection: "Hold steady, shift emphasis"
  },
  {
    value: "recovery",
    label: "Recovery",
    meaning: "Lower load and avoid hard training.",
    loadDirection: "Decrease significantly"
  },
  {
    value: "race_week",
    label: "Race week",
    meaning: "Reduce training load and treat the race as the key session.",
    loadDirection: "Taper/decrease"
  },
  {
    value: "custom",
    label: "Custom",
    meaning: "Define the purpose manually.",
    loadDirection: "User chooses"
  }
];
