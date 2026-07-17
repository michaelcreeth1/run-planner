import { describe, expect, it } from "vitest";
import { defaultForm, defaultGoalForm, formToPayload, goalFormToPayload } from "./forms";

describe("form payload helpers", () => {
  it("converts empty numeric workout fields to null and clock duration to seconds", () => {
    const payload = formToPayload({
      ...defaultForm("2026-07-01"),
      title: "Easy run",
      plannedDistance: "",
      plannedDuration: "0:45:00"
    });

    expect(payload.plannedDistance).toBeNull();
    expect(payload.plannedDuration).toBe(2700);
  });

  it("canonicalizes session metadata instead of accepting an invalid pairing", () => {
    const payload = formToPayload({
      ...defaultForm("2026-07-01"),
      sport: "run",
      workoutType: "race",
      intensityCategory: "easy"
    });

    expect(payload).toMatchObject({ sport: "run", workoutType: "race", intensityCategory: "race" });
  });

  it("defaults an empty title from the selected session type", () => {
    const payload = formToPayload({
      ...defaultForm("2026-07-01"),
      title: "  ",
      workoutType: "tempo",
      intensityCategory: "workout"
    });

    expect(payload.title).toBe("Tempo run");
  });

  it("keeps non-running activities non-running when normalizing legacy metadata", () => {
    const payload = formToPayload({
      ...defaultForm("2026-07-01"),
      sport: "cross_training",
      workoutType: "easy"
    });

    expect(payload).toMatchObject({
      sport: "cross_training",
      workoutType: "other",
      intensityCategory: "moderate"
    });
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
