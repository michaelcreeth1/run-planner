import { formatNumber, formatShortDate, formatWeekday } from "../../lib/formatters";
import type { TrainingWeek, Workout } from "../../types/domain";

export type WeekNextUpAction = "edit_workout" | "open_plan" | "open_progress" | "plan_week" | "skip_review";

export type WeekNextUpViewModel = {
  action: WeekNextUpAction;
  actionLabel: string;
  detail: string;
  eyebrow: string;
  title: string;
  workoutId?: string;
};

const attentionStatuses = new Set(["at_risk", "missed", "exceeded"]);

export function buildWeekNextUp(week: TrainingWeek, today: string): WeekNextUpViewModel {
  if (week.weekEndDate < today) {
    if (week.reviewedAt) {
      return {
        action: "open_progress",
        actionLabel: "View review",
        detail: `${formatNumber(week.actualMileage)} miles completed. The review is saved and your history is unchanged.`,
        eyebrow: "Reviewed",
        title: `Week of ${formatShortDate(week.weekStartDate)} complete`
      };
    }
    if (isCompletelyEmptyWeek(week)) {
      return {
        action: "skip_review",
        actionLabel: "Nothing to review — skip",
        detail: "No sessions were planned and no activities were logged. Close this week in one step.",
        eyebrow: "Nothing to review",
        title: `Close the week of ${formatShortDate(week.weekStartDate)}`
      };
    }
    return {
      action: "plan_week",
      actionLabel: "Review week",
      detail: `${formatNumber(week.actualMileage)} miles completed. Close the loop against the week’s intent.`,
      eyebrow: "Next up",
      title: `Review the week of ${formatShortDate(week.weekStartDate)}`
    };
  }

  if (week.weekStartDate > today) {
    const hasPlan = hasWeekPlan(week);
    return {
      action: "plan_week",
      actionLabel: hasPlan ? "Edit week plan" : "Plan week",
      detail: hasPlan
        ? `${formatNumber(week.plannedMileage)} miles are scheduled. Check the load and key sessions before the week begins.`
        : "Set the purpose, load, key sessions, and recovery pattern before the week begins.",
      eyebrow: "Next up",
      title: hasPlan ? "Review the upcoming week" : "Turn this week into a plan"
    };
  }

  if (!hasWeekPlan(week)) {
    return {
      action: "plan_week",
      actionLabel: "Plan week",
      detail: "Give the week a purpose, mileage target, and enough structure to guide the next run.",
      eyebrow: "Next up",
      title: "Set the direction for this week"
    };
  }

  if (hasEnoughStructureForGoalAlarm(week) && week.goalEvaluations.some((evaluation) => attentionStatuses.has(evaluation.status))) {
    return {
      action: "plan_week",
      actionLabel: "Edit week plan",
      detail: "At least one weekly goal is at risk. Rebalance the remaining work while there is still time.",
      eyebrow: "Needs attention",
      title: "Bring the week back into alignment"
    };
  }

  const nextWorkout = findNextWorkout(week.workouts, today);
  if (nextWorkout) {
    const isToday = nextWorkout.plannedDate === today;
    return {
      action: "edit_workout",
      actionLabel: "Open workout",
      detail: workoutDetail(nextWorkout),
      eyebrow: isToday ? "Today" : "Next up",
      title: isToday ? nextWorkout.title : `${nextWorkout.title} on ${formatWeekday(nextWorkout.plannedDate)}`,
      workoutId: nextWorkout.id
    };
  }

  const latestActivity = [...week.actualActivities]
    .filter((activity) => activity.activityDate <= today)
    .sort((left, right) => right.startDateLocal.localeCompare(left.startDateLocal))[0];
  if (latestActivity) {
    return {
      action: "open_progress",
      actionLabel: "View progress",
      detail: `${formatNumber(latestActivity.distanceMiles)} miles recorded. Review the result in the context of the week.`,
      eyebrow: "Next up",
      title: `Review ${latestActivity.name}`
    };
  }

  return {
    action: "plan_week",
    actionLabel: "Edit week plan",
    detail: "There is no remaining session on the schedule. Decide whether the week is complete or needs another adjustment.",
    eyebrow: "Next up",
    title: "Close the gap in the schedule"
  };
}

export function isCompletelyEmptyWeek(week: TrainingWeek) {
  return (
    !hasWeekPlan(week) &&
    week.actualActivities.length === 0 &&
    week.actualMileage === 0
  );
}

function hasEnoughStructureForGoalAlarm(week: TrainingWeek) {
  const plannedTrainingDays = new Set(
    week.workouts.filter((workout) => workout.sport !== "rest").map((workout) => workout.plannedDate)
  );
  return plannedTrainingDays.size >= 3 || week.actualActivities.length > 0;
}

function hasWeekPlan(week: TrainingWeek) {
  return (
    week.workouts.length > 0 ||
    week.goals.length > 0 ||
    week.notes.trim().length > 0 ||
    week.targetMileage !== null ||
    week.targetLongRunDistance !== null
  );
}

function findNextWorkout(workouts: Workout[], today: string) {
  return [...workouts]
    .filter(
      (workout) =>
        workout.plannedDate >= today &&
        workout.sport !== "rest" &&
        workout.intensityCategory !== "rest" &&
        !workout.status.startsWith("completed") &&
        !["missed", "skipped_intentionally", "replaced"].includes(workout.status)
    )
    .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate))[0];
}

function workoutDetail(workout: Workout) {
  const details = [];
  if (workout.plannedDistance !== null) {
    details.push(`${formatNumber(workout.plannedDistance)} miles`);
  }
  if (workout.purpose.trim()) {
    details.push(workout.purpose.trim());
  } else if (workout.instructions.trim()) {
    details.push(workout.instructions.trim());
  }
  return details.join(" · ") || "Open the workout for the session details.";
}
