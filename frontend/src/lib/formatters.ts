import type { MileageTrend, TrainingWeek, Workout } from "../types/domain";
import { addDays, parseDate } from "./dates";
import { workoutTypes } from "./options";

export function formatWeekRange(week: TrainingWeek) {
  return `${formatShortDate(week.weekStartDate)}-${formatShortDate(week.weekEndDate)}`;
}

export function formatWeekRangeFromStart(start: string) {
  return `${formatShortDate(start)}-${formatShortDate(addDays(start, 6))}`;
}

export function formatCompactWeekRangeFromStart(start: string) {
  return formatCompactWeekRange(start, addDays(start, 6));
}

export function formatCompactWeekRange(start: string, end: string) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  const startLabel = formatShortDate(start);
  const endLabel = startDate.getMonth() === endDate.getMonth() ? String(endDate.getDate()) : formatShortDate(end);
  return `${startLabel}-${endLabel}`;
}

export function formatWeekday(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(parseDate(dateValue));
}

export function formatShortDate(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parseDate(dateValue));
}

export function formatDateTime(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(dateValue));
}

export function formatPace(seconds: number | null | undefined, miles: number | null | undefined) {
  if (!seconds || !miles) {
    return "-";
  }

  const paceSeconds = Math.round(seconds / miles);
  const minutes = Math.floor(paceSeconds / 60);
  const remainder = String(paceSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}/mi`;
}

export function formatWorkoutMeta(workout: Workout) {
  if (workout.sport === "rest" || workout.intensityCategory === "rest") {
    return "Rest";
  }

  const pieces = [];
  if (workout.plannedDistance !== null && workout.plannedDistance > 0) {
    pieces.push(`${formatNumber(workout.plannedDistance)} mi`);
  }
  const pace = formatPace(workout.plannedDuration, workout.plannedDistance);
  if (pace !== "-") {
    pieces.push(pace);
  }
  return pieces.join(" · ") || workout.status.replaceAll("_", " ");
}

export function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function getMileageTrend(current: number | null | undefined, previous: number | null | undefined): MileageTrend | null {
  if (current === null || current === undefined || previous === null || previous === undefined) {
    return null;
  }

  if (current <= 0 && previous <= 0) {
    return null;
  }

  const delta = current - previous;
  const roundedDelta = Math.abs(delta) < 0.05 ? 0 : delta;

  if (roundedDelta === 0) {
    return {
      direction: "same",
      delta: 0
    };
  }

  return {
    direction: roundedDelta > 0 ? "up" : "down",
    delta: roundedDelta
  };
}

export function getCollapsedMileageTrend(week: TrainingWeek | undefined, previousWeek: TrainingWeek | undefined) {
  if (!week || !previousWeek) {
    return null;
  }

  return getMileageTrend(comparisonMileage(week), comparisonMileage(previousWeek));
}

export function preferredMileage(week: TrainingWeek) {
  return week.actualMileage > 0 ? week.actualMileage : week.plannedMileage;
}

export function comparisonMileage(week: TrainingWeek) {
  if (week.weekState === "future") {
    return week.plannedMileage;
  }
  if (week.weekState === "current") {
    return projectedMileage(week);
  }
  return week.actualMileage > 0 ? week.actualMileage : week.plannedMileage;
}

export function projectedMileage(week: TrainingWeek) {
  const mileageEvaluation = week.goalEvaluations.find((evaluation) => {
    const goal = week.goals.find((candidate) => candidate.id === evaluation.goalId);
    return goal?.category === "mileage";
  });

  if (mileageEvaluation?.actualValue !== null && mileageEvaluation?.actualValue !== undefined) {
    return mileageEvaluation.actualValue + (mileageEvaluation.remainingPlannedValue ?? 0);
  }

  return week.plannedMileage > 0 ? week.plannedMileage : week.actualMileage;
}

export function formatMileageTrendDelta(trend: MileageTrend) {
  if (trend.direction === "same") {
    return "0";
  }

  return formatNumber(Math.abs(trend.delta));
}

export function formatMileageTrendAriaLabel(trend: MileageTrend) {
  if (trend.direction === "same") {
    return "Mileage unchanged from prior week";
  }

  return `Mileage ${trend.direction === "up" ? "increased" : "decreased"} ${formatNumber(Math.abs(trend.delta))} miles from prior week`;
}

export function formatWeekdayShort(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(parseDate(dateValue)).toUpperCase();
}

export function formatDayNumber(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(parseDate(dateValue));
}

export function formatHardDays(count: number) {
  return `${count} hard`;
}

export function formatLongRun(distance: number) {
  return distance > 0 ? `LR ${formatNumber(distance)}` : "LR --";
}

export function formatTime(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(dateValue));
}

export function labelForWorkoutType(value: Workout["workoutType"]) {
  return workoutTypes.find((type) => type.value === value)?.label ?? value;
}
