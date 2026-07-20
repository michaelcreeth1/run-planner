import type { TrainingWeek } from "../../types/domain";

export function isCompletelyEmptyWeek(week: TrainingWeek) {
  return (
    week.workouts.length === 0 &&
    week.actualActivities.length === 0 &&
    week.actualMileage === 0 &&
    week.goals.length === 0 &&
    week.notes.trim().length === 0 &&
    week.targetMileage === null &&
    week.targetLongRunDistance === null
  );
}
