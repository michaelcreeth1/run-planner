import type { TrainingWeek } from "../types/domain";

export function completedSessionCount(week: TrainingWeek) {
  const performedSessions = week.performedSessions ?? [];
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
