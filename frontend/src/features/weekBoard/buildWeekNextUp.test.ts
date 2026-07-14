import { describe, expect, it } from "vitest";
import type { TrainingWeek, Workout } from "../../types/domain";
import { buildWeekNextUp } from "./buildWeekNextUp";

describe("buildWeekNextUp", () => {
  it("sends a past week into review", () => {
    expect(
      buildWeekNextUp(
        makeWeek({ weekStartDate: "2026-06-29", weekEndDate: "2026-07-05", actualMileage: 42 }),
        "2026-07-09"
      )
    ).toMatchObject({ action: "plan_week", actionLabel: "Review week" });
  });

  it("sends a completed review to progress instead of reopening the planner", () => {
    expect(
      buildWeekNextUp(
        makeWeek({
          weekStartDate: "2026-06-29",
          weekEndDate: "2026-07-05",
          actualMileage: 42,
          reviewedAt: "2026-07-06T12:00:00+00:00"
        }),
        "2026-07-09"
      )
    ).toMatchObject({ action: "open_progress", actionLabel: "View review" });
  });

  it("prompts an empty future week to be planned", () => {
    expect(
      buildWeekNextUp(
        makeWeek({
          weekStartDate: "2026-07-13",
          weekEndDate: "2026-07-19",
          weekState: "future",
          plannedMileage: 0,
          targetMileage: null
        }),
        "2026-07-09"
      )
    ).toMatchObject({ action: "plan_week", actionLabel: "Plan week" });
  });

  it("opens today's next incomplete workout", () => {
    const workout = makeWorkout({ plannedDate: "2026-07-09", title: "Threshold intervals" });
    expect(buildWeekNextUp(makeWeek({ workouts: [workout] }), "2026-07-09")).toMatchObject({
      action: "edit_workout",
      actionLabel: "Open workout",
      title: "Threshold intervals",
      workoutId: workout.id
    });
  });

  it("prioritizes an at-risk weekly goal over the next workout", () => {
    expect(
      buildWeekNextUp(
        makeWeek({
          workouts: [makeWorkout()],
          goalEvaluations: [
            {
              goalId: "goal-1",
              weekStartDate: "2026-07-06",
              status: "at_risk",
              guardrailStatus: null,
              actualValue: 8,
              plannedValue: 20,
              remainingPlannedValue: 12,
              summary: "At risk",
              detail: null,
              severity: "warning",
              evaluatedAt: "2026-07-09T00:00:00Z",
              contributingWorkoutIds: [],
              contributingActivityIds: []
            }
          ]
        }),
        "2026-07-09"
      )
    ).toMatchObject({ action: "plan_week", actionLabel: "Adjust rest of week", eyebrow: "Needs attention" });
  });

  it("links to progress after the remaining schedule is complete", () => {
    expect(
      buildWeekNextUp(
        makeWeek({
          workouts: [makeWorkout({ status: "completed_as_planned" })],
          actualActivities: [
            {
              id: "activity-1",
              stravaActivityId: "123",
              name: "Morning Run",
              sportType: "Run",
              startDateLocal: "2026-07-09T06:30:00",
              activityDate: "2026-07-09",
              distance: 8046.72,
              distanceMiles: 5,
              movingTime: 2400,
              averageHeartrate: 132
            }
          ]
        }),
        "2026-07-09"
      )
    ).toMatchObject({ action: "open_progress", actionLabel: "View progress" });
  });
});

function makeWeek(overrides: Partial<TrainingWeek> = {}): TrainingWeek {
  return {
    id: "week-1",
    weekStartDate: "2026-07-06",
    weekEndDate: "2026-07-12",
    plannedMileage: 30,
    actualMileage: 10,
    plannedTime: null,
    actualTime: null,
    mesocycleId: null,
    purpose: "maintain",
    purposeSource: "manual",
    targetMileage: 30,
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

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "workout-1",
    trainingWeekId: "week-1",
    athleteAccountId: "athlete-1",
    plannedDate: "2026-07-10",
    title: "Easy run",
    sport: "run",
    workoutType: "easy",
    intensityCategory: "easy",
    plannedDistance: 5,
    plannedDuration: null,
    plannedPace: null,
    plannedElevation: null,
    plannedTss: null,
    purpose: "Aerobic support",
    instructions: "",
    notes: "",
    status: "planned",
    ...overrides
  };
}
