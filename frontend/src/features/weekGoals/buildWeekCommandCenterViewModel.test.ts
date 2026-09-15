import { describe, expect, it } from "vitest";
import type { TrainingWeek, Workout } from "../../types/domain";
import { buildWeekCommandCenterViewModel } from "./buildWeekCommandCenterViewModel";

describe("buildWeekCommandCenterViewModel", () => {
  it("does not invent placeholder narrative for structured future weeks without load", () => {
    const viewModel = buildWeekCommandCenterViewModel({
      today: "2026-07-05",
      week: makeWeek({
        purpose: "maintain",
        purposeSource: "plan",
        targetLongRunDistance: 15,
        targetLongRunSource: "plan"
      })
    });

    expect(viewModel.mode).toBe("planning");
    expect(viewModel.narrative).toBe("");
    expect(viewModel.narrative).not.toContain("Maintain week. Set the weekly load. Long run near 15 miles.");
  });

  it("shows user notes instead of generated structured plan text", () => {
    const viewModel = buildWeekCommandCenterViewModel({
      today: "2026-07-05",
      week: makeWeek({
        notes: "Keep this easy after travel.",
        purpose: "maintain",
        purposeSource: "plan",
        targetMileage: 42,
        targetMileageSource: "plan",
        targetLongRunDistance: 15,
        targetLongRunSource: "plan"
      })
    });

    expect(viewModel.narrative).toBe("Keep this easy after travel.");
    expect(viewModel.compactStats?.find((stat) => stat.label === "Mileage")?.value).toBe("0 / 42 mi planned");
  });

  it("uses plain week-state language and never derives a conflicting purpose", () => {
    const viewModel = buildWeekCommandCenterViewModel({
      today: "2026-07-15",
      week: makeWeek({
        weekState: "current",
        purpose: "",
        plannedMileage: 5,
        workouts: [makeWorkout({ plannedDistance: 5 })]
      })
    });

    expect(viewModel.modeLabel).toBe("This week");
    expect(viewModel.purposeTag).toBe("Purpose not set");
    expect(viewModel.purposeTag).not.toBe("Recovery");
    expect(viewModel.actionButtons).toEqual([
      { id: "adjust_rest", label: "Adjust week", variant: "primary", icon: "calendar" }
    ]);
  });

  it("offers planning when the current week is actually unplanned", () => {
    const viewModel = buildWeekCommandCenterViewModel({
      today: "2026-07-15",
      week: makeWeek({ weekState: "current" })
    });

    expect(viewModel.isUnplanned).toBe(true);
    expect(viewModel.actionButtons).toEqual([
      { id: "plan_week", label: "Plan week", variant: "primary", icon: "calendar" }
    ]);
  });

  it("offers planning for a current week with targets but no scheduled sessions", () => {
    const viewModel = buildWeekCommandCenterViewModel({
      today: "2026-07-15",
      week: makeWeek({
        weekState: "current",
        purpose: "build",
        purposeSource: "plan",
        targetMileage: 42,
        targetMileageSource: "plan"
      })
    });

    expect(viewModel.isUnplanned).toBe(false);
    expect(viewModel.actionButtons).toEqual([
      { id: "plan_week", label: "Plan week", variant: "primary", icon: "calendar" }
    ]);
  });

  it("treats an empty historical week as unplanned rather than completed rest", () => {
    const viewModel = buildWeekCommandCenterViewModel({
      today: "2026-07-20",
      week: makeWeek({ weekState: "past" })
    });

    expect(viewModel.modeLabel).toBe("Empty week");
    expect(viewModel.isUnplanned).toBe(true);
    expect(viewModel.actionButtons).toEqual([
      { id: "skip_review", label: "Close empty week", variant: "primary", icon: "check" }
    ]);
    expect(viewModel.compactStats?.find((stat) => stat.label === "Recovery")?.value).toBe("Not planned");
    expect(viewModel.compactStats?.some((stat) => stat.outcome === "missed")).toBe(false);
  });

  it("does not treat a workout status as completed Strava mileage", () => {
    const workout = makeWorkout({
      workoutType: "long_run",
      title: "Long run",
      plannedDistance: 5,
      status: "completed_as_planned"
    });
    const current = buildWeekCommandCenterViewModel({
      today: "2026-07-15",
      week: makeWeek({
        weekState: "current",
        plannedMileage: 5,
        workouts: [workout]
      })
    });
    const reviewed = buildWeekCommandCenterViewModel({
      today: "2026-07-20",
      week: makeWeek({
        weekState: "past",
        plannedMileage: 5,
        workouts: [workout],
        reviewedAt: "2026-07-20T12:00:00Z"
      })
    });

    expect(current.compactStats?.find((stat) => stat.label === "Mileage")).toMatchObject({
      value: "0 / 5 mi",
      detail: "done / projected"
    });
    expect(current.compactStats?.find((stat) => stat.label === "Long run")?.detail).not.toContain("Completed:");
    expect(reviewed.modeLabel).toBe("Reviewed");
    expect(reviewed.actionButtons).toEqual([
      { id: "review_week", label: "Review week", variant: "primary", icon: "check" }
    ]);
  });

  it("keeps review available after an empty week has been closed", () => {
    const reviewed = buildWeekCommandCenterViewModel({
      today: "2026-07-20",
      week: makeWeek({
        weekState: "past",
        reviewedAt: "2026-07-20T12:00:00Z"
      })
    });

    expect(reviewed.actionButtons).toEqual([
      { id: "review_week", label: "Review week", variant: "primary", icon: "check" }
    ]);
  });

  it("counts imported sessions and ignores status-only completions", () => {
    const viewModel = buildWeekCommandCenterViewModel({
      today: "2026-07-15",
      week: makeWeek({
        actualMileage: 5,
        plannedMileage: 5,
        weekState: "current",
        actualActivities: [
          {
            id: "activity-1",
            stravaActivityId: "strava-1",
            name: "Morning Run",
            sportType: "Run",
            startDateLocal: "2026-07-15T06:00:00",
            activityDate: "2026-07-15",
            distance: 8046.72,
            distanceMiles: 5,
            movingTime: 2700,
            averageHeartrate: 142
          }
        ],
        workouts: [
          makeWorkout({ status: "completed_as_planned" }),
          makeWorkout({
            id: "workout-2",
            plannedDate: "2026-07-16",
            sport: "strength",
            workoutType: "strength",
            intensityCategory: "strength",
            plannedDistance: null,
            status: "completed_as_planned",
            title: "Strength session"
          })
        ]
      })
    });

    expect(viewModel.primarySummary).toContain("1 completed");
  });

  it("separates completed, scheduled, projected, and target mileage for the week header", () => {
    const viewModel = buildWeekCommandCenterViewModel({
      today: "2026-07-15",
      week: makeWeek({
        actualMileage: 44.5,
        plannedMileage: 57.5,
        targetMileage: 55,
        targetMileageSource: "plan",
        weekState: "current",
        workouts: [
          makeWorkout({
            id: "long-run",
            plannedDate: "2026-07-19",
            plannedDistance: 13,
            title: "Long run",
            workoutType: "long_run"
          })
        ]
      })
    });

    expect(viewModel.progress).toMatchObject({
      completedMiles: 44.5,
      scheduledMiles: 13,
      projectedMiles: 57.5,
      targetMiles: 55,
      deltaMiles: 2.5
    });
    expect(viewModel.progress.progressPercent).toBeCloseTo(80.91, 1);
  });

  it("offers planning for target-only upcoming weeks and editing once sessions exist", () => {
    const targetOnly = buildWeekCommandCenterViewModel({
      today: "2026-07-05",
      week: makeWeek({ targetMileage: 28, targetMileageSource: "plan" })
    });
    const scheduled = buildWeekCommandCenterViewModel({
      today: "2026-07-05",
      week: makeWeek({
        plannedMileage: 5,
        targetMileage: 28,
        targetMileageSource: "plan",
        workouts: [makeWorkout({ plannedDate: "2026-07-13", plannedDistance: 5 })]
      })
    });

    expect(targetOnly.actionButtons).toEqual([
      { id: "plan_week", label: "Plan week", variant: "primary", icon: "calendar" }
    ]);
    expect(scheduled.actionButtons).toEqual([
      { id: "edit_plan", label: "Edit plan", variant: "primary", icon: "calendar" }
    ]);
  });
});

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "workout-1",
    trainingWeekId: "week-2026-07-13",
    athleteAccountId: "athlete-1",
    plannedDate: "2026-07-15",
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

function makeWeek(overrides: Partial<TrainingWeek> = {}): TrainingWeek {
  return {
    id: "week-2026-07-13",
    weekStartDate: "2026-07-13",
    weekEndDate: "2026-07-19",
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
    weekState: "future",
    goalReviewSummary: "",
    hardDays: 0,
    longRunDistance: 0,
    longRunPercentage: 0,
    ...overrides
  };
}
