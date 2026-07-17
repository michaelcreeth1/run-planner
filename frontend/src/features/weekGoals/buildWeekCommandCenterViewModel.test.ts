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
    expect(viewModel.actionButtons).toEqual([]);
  });

  it("treats an empty historical week as unplanned rather than completed rest", () => {
    const viewModel = buildWeekCommandCenterViewModel({
      today: "2026-07-20",
      week: makeWeek({ weekState: "past" })
    });

    expect(viewModel.modeLabel).toBe("Not planned yet");
    expect(viewModel.isUnplanned).toBe(true);
    expect(viewModel.compactStats?.find((stat) => stat.label === "Recovery")?.value).toBe("Not planned");
    expect(viewModel.compactStats?.some((stat) => stat.outcome === "missed")).toBe(false);
  });

  it("counts manually completed workout mileage and shows reviewed state", () => {
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

    expect(current.compactStats?.find((stat) => stat.label === "Mileage")?.detail).toBe("5 mi completed");
    expect(current.compactStats?.find((stat) => stat.label === "Long run")?.detail).toContain("Completed:");
    expect(reviewed.modeLabel).toBe("Reviewed");
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
