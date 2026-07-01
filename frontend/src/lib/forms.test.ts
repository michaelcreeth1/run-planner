import { describe, expect, it } from "vitest";
import { defaultForm, defaultGoalForm, formToPayload, goalFormToPayload } from "./forms";

describe("form payload helpers", () => {
  it("converts empty numeric workout fields to null and minutes to seconds", () => {
    const payload = formToPayload({
      ...defaultForm("2026-07-01"),
      title: "Easy run",
      plannedDistance: "",
      plannedDuration: "45"
    });

    expect(payload.plannedDistance).toBeNull();
    expect(payload.plannedDuration).toBe(2700);
  });

  it("preserves manual weekly goal metadata", () => {
    const payload = goalFormToPayload({
      ...defaultGoalForm("week-1"),
      category: "mileage",
      label: "Run steady mileage",
      targetValue: "35",
      minAcceptable: "",
      maxAcceptable: "38",
      unit: "mi",
      evaluationMode: "range",
      priority: "primary",
      isEnabled: true
    });

    expect(payload).toMatchObject({
      source: "manual",
      isEditable: true,
      isEnabled: true,
      targetValue: 35,
      minAcceptable: null,
      maxAcceptable: 38
    });
  });
});
