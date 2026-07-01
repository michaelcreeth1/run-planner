import type {
  WeekGoalCategory,
  WeekGoalEvaluationMode,
  WeekGoalStatus,
  WeekGoalUnit,
  WeekPurposeId,
  Workout
} from "../types/domain";

export const workoutTypes: Array<{ value: Workout["workoutType"]; label: string }> = [
  { value: "easy", label: "Easy" },
  { value: "recovery", label: "Recovery" },
  { value: "long_run", label: "Long run" },
  { value: "medium_long", label: "Medium-long" },
  { value: "tempo", label: "Tempo" },
  { value: "threshold", label: "Threshold" },
  { value: "interval", label: "Interval" },
  { value: "hill", label: "Hill" },
  { value: "strength", label: "Strength" },
  { value: "rest", label: "Rest" },
  { value: "other", label: "Other" }
];

export const intensities: Array<{ value: Workout["intensityCategory"]; label: string }> = [
  { value: "rest", label: "Rest" },
  { value: "easy", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "workout", label: "Workout" },
  { value: "race", label: "Race" },
  { value: "strength", label: "Strength" }
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
