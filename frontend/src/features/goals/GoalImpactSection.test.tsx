import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { TrainingWeek, PlanWeekSummary, TrainingPlan } from "../../types/domain";
import { ProfileProvider } from "../../lib/profile";
import { addDays, startOfWeek } from "../../lib/dates";
import { server } from "../../test/server";
import { GoalImpactSection } from "./GoalImpactSection";
import { useRuleContext } from "./useRuleContext";

vi.mock("./useRuleContext", () => ({ useRuleContext: vi.fn() }));
const apiUrl = (path: string) => new URL(path, window.location.origin).toString();
const currentStart = startOfWeek(new Date());

function renderView(view: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProfileProvider profileId="profile-1">{view}</ProfileProvider></QueryClientProvider>);
}

function makeWeek(overrides: Partial<TrainingWeek>): TrainingWeek {
  return {
    id: "week-1",
    weekStartDate: "2026-07-06",
    weekEndDate: "2026-07-12",
    plannedMileage: 0,
    actualMileage: 0,
    plannedTime: null,
    actualTime: null,
    mesocycleId: null,
    purpose: "aerobic_build",
    purposeSource: "plan",
    targetMileage: null,
    targetMileageSource: "plan",
    targetLongRunDistance: null,
    targetLongRunSource: "plan",
    isDownWeek: false,
    notes: "",
    reviewedAt: null,
    workouts: [],
    actualActivities: [],
    goals: [],
    goalEvaluations: [],
    weekState: "current",
    goalReviewSummary: "",
    hardDays: 0,
    longRunDistance: 0,
    longRunPercentage: 0,
    ...overrides
  };
}


function makeSummary(overrides: Partial<PlanWeekSummary>): PlanWeekSummary {
  return {
    weekStartDate: "2026-07-06",
    weekEndDate: "2026-07-12",
    mesocycleId: "meso-1",
    mesocycleName: "Build",
    mesocyclePhase: "build",
    weekIndexInMesocycle: 1,
    mesocycleWeekCount: 4,
    plannedMileage: 0,
    actualMileage: 0,
    targetMileage: 40,
    targetLongRunDistance: 12,
    purpose: "aerobic_build",
    purposeSource: "plan",
    targetMileageSource: "plan",
    targetLongRunSource: "plan",
    isDownWeek: false,
    hasManualOverride: false,
    warning: null,
    ...overrides
  };
}


describe("compact goal heatmap", () => {
  it("shows the heatmap immediately, centers this week, and explains a tapped cell before navigation", async () => {
    const user = userEvent.setup();
    const onSelectWeek = vi.fn();
    const starts: string[] = [];
    // The plan started months ago; the initial matrix must still center on today.
    const plan = { name: "Autumn", recurringGoals: [], mesocycles: [], weekSummaries: Array.from({ length: 16 }, (_, index) => makeSummary({ weekStartDate: addDays(currentStart, (index - 12) * 7), weekEndDate: addDays(currentStart, (index - 12) * 7 + 6) })) } as unknown as TrainingPlan;
    vi.mocked(useRuleContext).mockReturnValue({ plan, defaultGoals: [], isLoading: false, error: null });
    server.use(http.get(apiUrl("/api/weeks/:start"), ({ params }) => {
      const start = String(params.start);
      starts.push(start);
      return HttpResponse.json(makeWeek({ weekStartDate: start, weekEndDate: addDays(start, 6) }));
    }));
    renderView(<GoalImpactSection onSelectWeek={onSelectWeek} />);
    const grid = await screen.findByRole("grid", { name: "Goal status per week" });
    expect(screen.queryByText("See impact across weeks")).not.toBeInTheDocument();
    expect(screen.queryByText("Effective goals this week")).not.toBeInTheDocument();
    expect(starts).toContain(currentStart);
    expect(grid).toHaveStyle({ gridTemplateColumns: "minmax(172px, 208px) repeat(24, minmax(20px, 1fr))" });
    await waitFor(() => expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "instant" })));
    const cells = within(grid).getAllByRole("gridcell");
    const currentCell = cells.find((cell) => cell.getAttribute("aria-label")?.includes("Pending") && cell.getAttribute("aria-label")?.includes("Plan week 13"))!;
    await user.click(currentCell);
    expect(onSelectWeek).not.toHaveBeenCalled();
    const explanation = screen.getByRole("region", { name: "Selected goal explanation" });
    expect(explanation).toHaveTextContent("Plan week 13");
    await user.click(within(explanation).getByRole("button", { name: "View week" }));
    expect(onSelectWeek).toHaveBeenCalledWith(currentStart);
    await user.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.queryByRole("region", { name: "Selected goal explanation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Current week" })).toBeVisible();
  });

});
