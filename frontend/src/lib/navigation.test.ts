import { describe, expect, it } from "vitest";
import { appRoutePath, parseAppRoute } from "./navigation";

const fallbackWeek = "2026-07-06";

describe("app navigation", () => {
  it("parses and normalizes week routes", () => {
    expect(parseAppRoute("/week/2026-07-09", "", fallbackWeek)).toMatchObject({
      tab: "week",
      weekStart: "2026-07-06"
    });
  });

  it("keeps legacy week query links working", () => {
    expect(parseAppRoute("/", "?week=2026-07-09", fallbackWeek)).toMatchObject({
      tab: "week",
      weekStart: "2026-07-06"
    });
  });

  it("preserves planning and progress subsections", () => {
    expect(parseAppRoute("/plan/goals", "", fallbackWeek)).toMatchObject({
      tab: "plan",
      planningSection: "goals"
    });
    expect(parseAppRoute("/progress/activities", "", fallbackWeek)).toMatchObject({
      tab: "progress",
      progressSection: "activities"
    });
  });

  it("captures a selected plan", () => {
    const route = parseAppRoute("/plan/plan-123", "", fallbackWeek);
    expect(route).toMatchObject({ tab: "plan", planId: "plan-123" });
    expect(appRoutePath(route)).toBe("/plan/plan-123");
  });

  it("keeps the selected plan while moving through goals", () => {
    const route = parseAppRoute("/plan/plan-123/goals", "", fallbackWeek);
    expect(route).toMatchObject({ tab: "plan", planId: "plan-123", planningSection: "goals" });
    expect(appRoutePath(route)).toBe("/plan/plan-123/goals");
  });

  it("falls back to the current week for unknown routes", () => {
    const route = parseAppRoute("/unknown", "", fallbackWeek);
    expect(route).toMatchObject({ tab: "week", weekStart: fallbackWeek });
    expect(appRoutePath(route)).toBe("/week/2026-07-06");
  });
});
