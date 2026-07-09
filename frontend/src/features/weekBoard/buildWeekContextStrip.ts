import { daysBetween } from "../../lib/dates";
import { formatNumber, formatShortDate, formatWorkoutMeta } from "../../lib/formatters";
import type { TrainingPlan, TrainingWeek } from "../../types/domain";

export type WeekContextSegment = {
  id: "race" | "phase" | "mileage";
  label: string;
  value: string;
};

export type WeekContextTodaySession =
  | { kind: "workout"; title: string; meta: string; status: "done" | "upcoming" }
  | { kind: "rest" }
  | { kind: "open" };

export type WeekContextStripViewModel =
  | { kind: "onboarding"; headline: string; detail: string; actionLabel: string }
  | { kind: "active"; segments: WeekContextSegment[]; today: WeekContextTodaySession | null };

type BuildWeekContextStripOptions = {
  plan: TrainingPlan | null;
  currentWeek: TrainingWeek | null;
  currentWeekStart: string;
  today: string;
};

export function buildWeekContextStrip({
  plan,
  currentWeek,
  currentWeekStart,
  today
}: BuildWeekContextStripOptions): WeekContextStripViewModel | null {
  if (!plan) {
    if (!currentWeek) {
      return null;
    }
    return {
      kind: "onboarding",
      headline: "No training plan yet",
      detail: "Create a plan to anchor your weeks to a race and a training phase.",
      actionLabel: "Create a plan"
    };
  }

  const segments: WeekContextSegment[] = [];

  const race = buildRaceSegment(plan, today);
  if (race) {
    segments.push(race);
  }

  const phase = buildPhaseSegment(plan, currentWeekStart);
  if (phase) {
    segments.push(phase);
  }

  segments.push(buildMileageSegment(currentWeek));

  return {
    kind: "active",
    segments,
    today: currentWeek ? buildTodaySession(currentWeek, today) : null
  };
}

function buildRaceSegment(plan: TrainingPlan, today: string): WeekContextSegment | null {
  const race = plan.goalRace;
  if (!race) {
    return null;
  }
  const countdown = buildCountdown(race.raceDate, today);
  if (!countdown) {
    return null;
  }
  return {
    id: "race",
    label: race.name,
    value: `${countdown} · ${formatShortDate(race.raceDate)}`
  };
}

function buildCountdown(raceDate: string, today: string): string | null {
  const days = daysBetween(today, raceDate);
  if (days < 0) {
    return null;
  }
  if (days === 0) {
    return "Race day";
  }
  if (days <= 6) {
    return days === 1 ? "1 day out" : `${days} days out`;
  }
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} out`;
}

function buildPhaseSegment(plan: TrainingPlan, currentWeekStart: string): WeekContextSegment | null {
  const summary = plan.weekSummaries.find((week) => week.weekStartDate === currentWeekStart);
  if (summary?.mesocyclePhase) {
    const label = capitalize(summary.mesocyclePhase);
    if (summary.weekIndexInMesocycle && summary.mesocycleWeekCount) {
      return { id: "phase", label, value: `Week ${summary.weekIndexInMesocycle} of ${summary.mesocycleWeekCount}` };
    }
    return { id: "phase", label: "Phase", value: label };
  }
  if (currentWeekStart < plan.startDate) {
    return { id: "phase", label: "Plan", value: `Starts ${formatShortDate(plan.startDate)}` };
  }
  if (currentWeekStart > plan.endDate) {
    return { id: "phase", label: "Plan", value: "Complete" };
  }
  return null;
}

function buildMileageSegment(currentWeek: TrainingWeek | null): WeekContextSegment {
  if (!currentWeek) {
    return { id: "mileage", label: "This week", value: "…" };
  }
  const planned = currentWeek.plannedMileage;
  const actual = currentWeek.actualMileage;
  if (planned <= 0 && actual <= 0) {
    return { id: "mileage", label: "This week", value: "No plan" };
  }
  if (actual > 0 && planned > 0) {
    return { id: "mileage", label: "This week", value: `${formatNumber(actual)} / ${formatNumber(planned)} mi` };
  }
  if (planned > 0) {
    return { id: "mileage", label: "This week", value: `${formatNumber(planned)} mi planned` };
  }
  return { id: "mileage", label: "This week", value: `${formatNumber(actual)} mi` };
}

function buildTodaySession(currentWeek: TrainingWeek, today: string): WeekContextTodaySession {
  const todaysWorkouts = currentWeek.workouts.filter((workout) => workout.plannedDate === today);
  const todaysActuals = currentWeek.actualActivities.filter((activity) => activity.activityDate === today);

  if (todaysWorkouts.length === 0) {
    const activity = todaysActuals[0];
    if (activity) {
      return { kind: "workout", title: activity.name, meta: `${formatNumber(activity.distanceMiles)} mi`, status: "done" };
    }
    return { kind: "open" };
  }

  const primary = todaysWorkouts.find((workout) => workout.sport !== "rest") ?? todaysWorkouts[0];
  if (primary.sport === "rest" || primary.intensityCategory === "rest") {
    return { kind: "rest" };
  }

  const done =
    todaysActuals.length > 0 || primary.status.startsWith("completed") || primary.status === "partial";
  return {
    kind: "workout",
    title: primary.title,
    meta: formatWorkoutMeta(primary),
    status: done ? "done" : "upcoming"
  };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
