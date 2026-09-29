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
