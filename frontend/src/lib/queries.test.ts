import { describe, expect, it } from "vitest";
import type { TrainingPlanSummary } from "../types/domain";
import { selectPrimaryPlan } from "./queries";

function makePlan(overrides: Partial<TrainingPlanSummary> = {}): TrainingPlanSummary {
  return {
    id: "plan-1",
    athleteAccountId: "profile-1",
    name: "Training plan",
    description: "",
    goalRaceId: null,
    goalRaceName: null,
    startDate: "2026-10-26",
    endDate: "2026-11-22",
    status: "active",
    notes: "",
    isCurrent: true,
    isUpcoming: false,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

describe("selectPrimaryPlan", () => {
  it("skips archived plans even if cached current or upcoming flags are still set", () => {
    const archivedCurrent = makePlan({ status: "archived" });
    const archivedUpcoming = makePlan({ status: "archived", isCurrent: false, isUpcoming: true });
    const replacement = makePlan({ id: "replacement", isCurrent: false, isUpcoming: true, startDate: "2026-11-23" });

    expect(selectPrimaryPlan([archivedCurrent, archivedUpcoming, replacement])).toBe(replacement);
  });

  it("has no primary plan when all plans are archived", () => {
    expect(selectPrimaryPlan([makePlan({ status: "archived" })])).toBeNull();
  });
});
