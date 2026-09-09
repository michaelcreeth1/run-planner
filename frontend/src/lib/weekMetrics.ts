import type { TrainingWeek, Workout } from "../types/domain";

export function isCompletedWorkout(workout: Workout) {
  return workout.status.startsWith("completed") || workout.status === "partial";
}

export function completedSessionCount(week: TrainingWeek) {
  const importedSessions = week.actualActivities.length;
  const manualSessions = week.workouts.filter(
    (workout) => isCompletedWorkout(workout) && !hasMatchingImportedActivity(week, workout)
  ).length;
  return importedSessions + manualSessions;
}

function hasMatchingImportedActivity(week: TrainingWeek, workout: Workout) {
  if (workout.sport !== "run") {
    return false;
  }
  return week.actualActivities.some(
    (activity) => activity.activityDate === workout.plannedDate && activity.sportType.toLowerCase().includes("run")
  );
}
