import { describe, expect, it } from "vitest";
import type { TrainingWeek } from "../../types/domain";
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
});

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
