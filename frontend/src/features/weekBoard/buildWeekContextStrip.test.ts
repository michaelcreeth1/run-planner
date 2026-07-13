import { describe, expect, it } from "vitest";
import type { GoalRace, TrainingPlan, TrainingWeek } from "../../types/domain";
import { buildWeekContextStrip } from "./buildWeekContextStrip";

describe("buildWeekContextStrip", () => {
  it("returns null before any data has loaded", () => {
    expect(
      buildWeekContextStrip({ plan: null, currentWeek: null, currentWeekStart: "2026-07-06", today: "2026-07-09" })
    ).toBeNull();
  });

  it("prompts to create a plan when a week is loaded but no plan exists", () => {
    const result = buildWeekContextStrip({
      plan: null,
      currentWeek: makeWeek(),
      currentWeekStart: "2026-07-06",
      today: "2026-07-09"
    });
    expect(result).toMatchObject({ kind: "onboarding", actionLabel: "Create a plan" });
  });

  it("builds race, phase, and mileage segments for an active plan week", () => {
    const result = buildWeekContextStrip({
      plan: makePlan(),
      currentWeek: makeWeek({ plannedMileage: 17, actualMileage: 0 }),
      currentWeekStart: "2026-07-13",
      today: "2026-07-09"
    });

    expect(result?.kind).toBe("active");
    if (result?.kind !== "active") {
      throw new Error("expected active strip");
    }
    expect(result.segments.find((segment) => segment.id === "race")?.value).toBe("8 weeks out · Sep 6");
    expect(result.segments.find((segment) => segment.id === "race")?.compactValue).toBe("8 weeks out");
    expect(result.segments.find((segment) => segment.id === "phase")).toMatchObject({
      label: "Build",
      value: "Week 1 of 2"
    });
    expect(result.segments.find((segment) => segment.id === "mileage")?.value).toBe("17 mi planned");
    expect(result.segments.find((segment) => segment.id === "mileage")?.compactValue).toBe("17 mi");
  });

  it("shows a plan-start hint when the current week precedes the plan", () => {
    const result = buildWeekContextStrip({
      plan: makePlan(),
      currentWeek: makeWeek(),
      currentWeekStart: "2026-07-06",
      today: "2026-07-09"
    });
    if (result?.kind !== "active") {
      throw new Error("expected active strip");
    }
    expect(result.segments.find((segment) => segment.id === "phase")).toMatchObject({
      label: "Plan",
      value: "Starts Jul 13"
    });
  });

  it("hides a race segment once the race is in the past", () => {
    const plan = makePlan({ goalRace: makeRace({ raceDate: "2026-07-01" }) });
    const result = buildWeekContextStrip({
      plan,
      currentWeek: makeWeek(),
      currentWeekStart: "2026-07-13",
      today: "2026-07-09"
    });
    if (result?.kind !== "active") {
      throw new Error("expected active strip");
    }
    expect(result.segments.some((segment) => segment.id === "race")).toBe(false);
  });

  it("reports today's planned workout with completion status", () => {
    const week = makeWeek({
      workouts: [
        makeWorkout({ plannedDate: "2026-07-09", title: "Tempo 3x10min", workoutType: "threshold", plannedDistance: 7 })
      ]
    });
    const result = buildWeekContextStrip({
      plan: makePlan(),
      currentWeek: week,
      currentWeekStart: "2026-07-13",
      today: "2026-07-09"
    });
    if (result?.kind !== "active") {
      throw new Error("expected active strip");
    }
    expect(result.today).toMatchObject({ kind: "workout", title: "Tempo 3x10min", status: "upcoming" });
  });

  it("treats a rest-only day as a rest session", () => {
    const week = makeWeek({
      workouts: [makeWorkout({ plannedDate: "2026-07-09", title: "Rest", sport: "rest", intensityCategory: "rest" })]
    });
    const result = buildWeekContextStrip({
      plan: makePlan(),
      currentWeek: week,
      currentWeekStart: "2026-07-13",
      today: "2026-07-09"
    });
    if (result?.kind !== "active") {
      throw new Error("expected active strip");
    }
    expect(result.today).toEqual({ kind: "rest" });
  });

  it("marks today open when nothing is planned or logged", () => {
    const result = buildWeekContextStrip({
      plan: makePlan(),
      currentWeek: makeWeek(),
      currentWeekStart: "2026-07-13",
      today: "2026-07-09"
    });
    if (result?.kind !== "active") {
      throw new Error("expected active strip");
    }
    expect(result.today).toEqual({ kind: "open" });
  });
});

function makeRace(overrides: Partial<GoalRace> = {}): GoalRace {
  return {
    id: "race-1",
    athleteAccountId: "athlete-1",
    name: "Denver Half",
    raceDate: "2026-09-06",
    distance: "half_marathon",
    distanceMiles: 13.1,
    targetTime: 5700,
    priority: "A",
    location: "Denver, CO",
    altitudeContext: "",
    notes: "",
    targetPaceSecondsPerMile: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides
  };
}

function makePlan(overrides: Partial<TrainingPlan> = {}): TrainingPlan {
  return {
    id: "plan-1",
    athleteAccountId: "athlete-1",
    name: "Denver Half plan",
    description: "",
    goalRaceId: "race-1",
    goalRaceName: "Denver Half",
    startDate: "2026-07-13",
    endDate: "2026-09-06",
    status: "active",
    notes: "",
    isCurrent: true,
    isUpcoming: false,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    goalRace: makeRace(),
    mesocycles: [],
    recurringGoals: [],
    weekSummaries: [
      {
        weekStartDate: "2026-07-13",
        weekEndDate: "2026-07-19",
        mesocycleId: "meso-1",
        mesocycleName: "Build",
        mesocyclePhase: "build",
        weekIndexInMesocycle: 1,
        mesocycleWeekCount: 2,
        plannedMileage: 30,
        actualMileage: 0,
        targetMileage: 30,
        targetLongRunDistance: 12,
        purpose: "aerobic_build",
        purposeSource: "plan",
        targetMileageSource: "plan",
        targetLongRunSource: "plan",
        isDownWeek: false,
        hasManualOverride: false,
        warning: null
      }
    ],
    ...overrides
  };
}

function makeWeek(overrides: Partial<TrainingWeek> = {}): TrainingWeek {
  return {
    id: "week-1",
    weekStartDate: "2026-07-06",
    weekEndDate: "2026-07-12",
    plannedMileage: 0,
    actualMileage: 0,
    plannedTime: null,
    actualTime: null,
    mesocycleId: null,
    purpose: "maintain",
    purposeSource: "manual",
    targetMileage: null,
    targetMileageSource: "manual",
    targetLongRunDistance: null,
    targetLongRunSource: "manual",
    isDownWeek: false,
    notes: "",
    reviewedAt: null,
    workouts: [],
    actualActivities: [],
    goals: [],
    goalEvaluations: [],
    weekState: "current",
    goalReviewSummary: "",
    hardDays: 0,
    longRunDistance: 0,
    longRunPercentage: 0,
    ...overrides
  };
}

function makeWorkout(overrides: Partial<TrainingWeek["workouts"][number]> = {}): TrainingWeek["workouts"][number] {
  return {
    id: "workout-1",
    trainingWeekId: "week-1",
    athleteAccountId: "athlete-1",
    plannedDate: "2026-07-09",
    title: "Easy run",
    sport: "run",
    workoutType: "easy",
    intensityCategory: "easy",
    plannedDistance: 5,
    plannedDuration: null,
    plannedElevation: null,
    plannedTss: null,
    purpose: "",
    instructions: "",
    notes: "",
    status: "planned",
    ...overrides
  };
}
