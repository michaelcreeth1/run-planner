import type { TrainingWeek } from "../types/domain";

export function completedSessionCount(week: TrainingWeek) {
  const performedSessions = actualPerformedSessions(week);
  const groupedActivityIds = new Set(
    performedSessions.flatMap((session) =>
      session.recordings.map((recording) => recording.stravaActivityId)
    )
  );
  const completedPerformedSessions = performedSessions.filter(
    (session) =>
      !["skipped", "missed"].includes(session.outcome) &&
      session.recordings.length > 0
  ).length;
  const ungroupedActivities = week.actualActivities.filter(
    (activity) => !groupedActivityIds.has(activity.id)
  ).length;
  return completedPerformedSessions + ungroupedActivities;
}

// Cross-week associations resolve planned work but belong to their occurrence
// week when counting completed training.
export function actualPerformedSessions(week: TrainingWeek) {
  return (week.performedSessions ?? []).filter((session) => {
    const day = session.occurredAt.slice(0, 10);
    return day >= week.weekStartDate && day <= week.weekEndDate && session.recordings.length > 0;
  });
}

export function weekMileageTarget(week: TrainingWeek) {
  return week.targetMileage ?? week.goals.find(
    (goal) => goal.isEnabled && goal.goalType === "achievement" && goal.category === "mileage"
  )?.targetValue ?? null;
}

export function remainingPlannedMileage(week: TrainingWeek, today: string) {
  const resolvedWorkoutIds = new Set(
    (week.performedSessions ?? []).filter(
      (session) => session.association === "associated" && session.outcome !== "unresolved" &&
        session.recordings.length > 0 && session.plannedWorkoutId
    ).map((session) => session.plannedWorkoutId)
  );
  return week.workouts.reduce((total, workout) =>
    workout.sport === "run" && workout.plannedDate >= today && !resolvedWorkoutIds.has(workout.id)
      ? total + (workout.plannedDistance ?? 0) : total, 0);
}
