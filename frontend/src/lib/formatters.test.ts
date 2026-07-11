import { describe, expect, it } from "vitest";
import type { TrainingWeek } from "../types/domain";
import { getCollapsedMileageTrend } from "./formatters";

describe("getCollapsedMileageTrend", () => {
  it("hides a decrease when the current week is not planned", () => {
    expect(getCollapsedMileageTrend(makeWeek(0), makeWeek(29))).toBeNull();
  });

  it("hides an increase when the comparison week has no mileage", () => {
    expect(getCollapsedMileageTrend(makeWeek(22), makeWeek(0))).toBeNull();
  });

  it("compares weeks that both have meaningful mileage", () => {
    expect(getCollapsedMileageTrend(makeWeek(29), makeWeek(22))).toEqual({ direction: "up", delta: 7 });
  });
});

function makeWeek(plannedMileage: number): TrainingWeek {
  return {
    plannedMileage,
    actualMileage: 0,
    weekState: "future",
    goals: [],
    goalEvaluations: []
  } as unknown as TrainingWeek;
}
