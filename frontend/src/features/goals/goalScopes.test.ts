import { describe, expect, it } from "vitest";
import type { RecurringGoal, TrainingPlan } from "../../types/domain";
import { goalToDraft } from "./goalDrafts";
import { baselineOverrideDescription } from "./goalScopes";

function goal(id: string, metricKey: RecurringGoal["metricKey"], value: number, mesocyclePhase: RecurringGoal["mesocyclePhase"] = null): RecurringGoal {
  return { id, metricKey, mesocyclePhase, trainingPlanId: null, athleteAccountId: "profile-1", category: "recovery", goalType: "achievement", label: id, description: "", targetValue: value, minAcceptable: value, maxAcceptable: null, unit: "days", evaluationMode: "at_least", priority: "secondary", notes: "", createdAt: "", updatedAt: "" };
}

const baseline = [goal("baseline-rest", "rest_day_count", 1), goal("baseline-strength", "strength_session_count", 2)];
const plan = {
  name: "Autumn plan",
  recurringGoals: [goal("plan-rest", "rest_day_count", 2), goal("build-rest", "rest_day_count", 3, "build"), goal("plan-sessions", "training_session_count", 5)],
  weekSummaries: [{ weekStartDate: "2026-09-28", mesocyclePhase: "build", mesocycleName: "Build endurance" }, { weekStartDate: "2026-10-05", mesocyclePhase: "taper", mesocycleName: "Taper" }]
} as TrainingPlan;

describe("baseline goal scope", () => {
  it("explains the weeks where a baseline edit is overridden", () => {
    expect(baselineOverrideDescription(goalToDraft(baseline[0]), plan)).toBe("Affects every week except overrides in Autumn plan: whole plan, build phase.");
    expect(baselineOverrideDescription(goalToDraft(baseline[1]), plan)).toBeNull();
  });
});
