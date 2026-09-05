import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsView } from "./AnalyticsView";
import type { AnalyticsPlanning } from "../../types/domain";

const analytics: AnalyticsPlanning = {
  anchorWeekStartDate: "2026-07-13",
  generatedAt: "2026-07-13T12:00:00Z",
  lookbackWeeks: 12,
  futureWeeks: 4,
  primaryRecommendation: { id: "recommendation", title: "Keep steady", detail: "", recommendation: "", riskLevel: "clear", weekStartDate: null, metric: "" },
  insights: [],
  loadBand: { baselineMileage: 20, floorMileage: 16, ceilingMileage: 24, watchCeilingMileage: 26, reviseCeilingMileage: 28, sourceWeeks: 4 },
  weeks: [
    { weekStartDate: "2026-07-06", weekEndDate: "2026-07-12", weekState: "past", plannedMileage: 20, targetMileage: 20, actualMileage: 18, comparisonMileage: 18, hardDays: 1, actualHardDays: 1, restDays: 2, actualRestDays: 2, hasBackToBackHardDays: false, longRunDistance: 8, longRunPercentage: 0.44, loadRisk: "clear", longRunRisk: "clear", intensityRisk: "clear", recoveryRisk: "clear", hasPlan: true, hasActuals: true },
    { weekStartDate: "2026-07-13", weekEndDate: "2026-07-19", weekState: "current", plannedMileage: 22, targetMileage: 28, actualMileage: 0, comparisonMileage: 22, hardDays: 1, actualHardDays: 0, restDays: 2, actualRestDays: 0, hasBackToBackHardDays: false, longRunDistance: 9, longRunPercentage: 0.41, loadRisk: "clear", longRunRisk: "clear", intensityRisk: "clear", recoveryRisk: "clear", hasPlan: true, hasActuals: false }
  ],
  goalReliability: []
};

describe("AnalyticsView chart controls", () => {
  it("uses native buttons for chart points while keeping the SVG decorative", async () => {
    const user = userEvent.setup();
    const onSelectWeek = vi.fn();
    const { container } = render(
      <AnalyticsView analytics={analytics} futureWeeks={4} isLoading={false} lookbackWeeks={12} onSelectWeek={onSelectWeek} setFutureWeeks={vi.fn()} setLookbackWeeks={vi.fn()} />
    );

    expect(container.querySelector(".mileage-chart-graphic svg")).toHaveAttribute("aria-hidden", "true");
    const actualPoint = screen.getByRole("button", { name: "Open actual mileage of 18 miles for week of Jul 6" });
    await user.click(actualPoint);

    expect(onSelectWeek).toHaveBeenCalledWith("2026-07-06");
    expect(screen.getByText("This week planned")).toBeVisible();
    expect(screen.getByText("This week target")).toBeVisible();
    expect(screen.getByRole("button", { name: "Open target mileage of 28 miles for week of Jul 13" })).toBeVisible();
  });
});
