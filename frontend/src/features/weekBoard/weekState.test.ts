import { describe, expect, it } from "vitest";
import type { TrainingWeek } from "../../types/domain";
import { isCompletelyEmptyWeek } from "./weekState";

describe("isCompletelyEmptyWeek", () => {
  it("distinguishes a truly empty week from a target-only week", () => {
    const emptyWeek = makeWeek();

    expect(isCompletelyEmptyWeek(emptyWeek)).toBe(true);
    expect(isCompletelyEmptyWeek({ ...emptyWeek, targetMileage: 30 })).toBe(false);
  });
});

function makeWeek(): TrainingWeek {
  return {
    id: "week-empty",
    weekStartDate: "2026-06-29",
    weekEndDate: "2026-07-05",
    plannedMileage: 0,
    actualMileage: 0,
    plannedTime: null,
    actualTime: null,
    mesocycleId: null,
    purpose: "",
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
    weekState: "past",
    goalReviewSummary: "",
    hardDays: 0,
    longRunDistance: 0,
    longRunPercentage: 0
  };
}
