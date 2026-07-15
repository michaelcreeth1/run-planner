import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { ProfileProvider } from "../../lib/profile";
import { server } from "../../test/server";
import type { TrainingPlan } from "../../types/domain";
import { PlansView } from "./PlansView";

const apiUrl = (path: string) => new URL(path, window.location.origin).toString();

function makePlan(): TrainingPlan {
  return {
    id: "plan-1",
    athleteAccountId: "profile-1",
    name: "Autumn Half plan",
    description: "",
    goalRaceId: null,
    goalRaceName: null,
    startDate: "2026-07-13",
    endDate: "2026-10-04",
    status: "active",
    notes: "",
    isCurrent: true,
    isUpcoming: false,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    goalRace: null,
    mesocycles: [
      {
        id: "mesocycle-1",
        trainingPlanId: "plan-1",
        athleteAccountId: "profile-1",
        orderIndex: 0,
        name: "Base",
        phase: "base",
        startDate: "2026-07-13",
        endDate: "2026-10-04",
        targetMileageStart: 20,
        targetMileageEnd: 30,
        longRunStart: 6,
        longRunEnd: 9,
        downWeekCadence: 4,
        downWeekReductionPct: 20,
        notes: "",
        createdAt: "2026-07-01T00:00:00Z",
        updatedAt: "2026-07-01T00:00:00Z"
      }
    ],
    recurringGoals: [],
    weekSummaries: []
  };
}

function renderPlansView(requestedPlanId: string | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileProvider profileId="profile-1">
        <PlansView
          onPlanApplied={vi.fn()}
          onSelectPlan={vi.fn()}
          onSelectWeek={vi.fn()}
          requestedPlanId={requestedPlanId}
          writesBlocked={false}
        />
      </ProfileProvider>
    </QueryClientProvider>
  );
}

describe("PlansView", () => {
  it("shows which timeline phase is selected for editing", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([])),
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([]))
    );

    renderPlansView();

    await user.click(await screen.findByRole("button", { name: "Create training plan" }));

    const basePhase = screen.getByRole("button", { name: "Base phase" });
    const buildPhase = screen.getByRole("button", { name: "Build phase" });
    expect(basePhase).toHaveAttribute("aria-pressed", "true");
    expect(buildPhase).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Editing selected phase")).toBeVisible();

    await user.click(buildPhase);

    expect(basePhase).toHaveAttribute("aria-pressed", "false");
    expect(buildPhase).toHaveAttribute("aria-pressed", "true");
    const inspector = screen.getByText("Editing selected phase").closest("article");
    expect(inspector).not.toBeNull();
    expect(within(inspector!).getByText("Build", { selector: "strong" })).toBeVisible();
  });

  it("does not reserve a textarea for an empty description", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([])),
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([]))
    );
    renderPlansView();

    await user.click(await screen.findByRole("button", { name: "Create training plan" }));

    expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add description" }));

    const description = screen.getByLabelText("Description");
    expect(description).toBeVisible();
    await user.type(description, "Build toward a fall race.");
    expect(description).toHaveValue("Build toward a fall race.");
  });

  it("starts existing-plan editing with compact details and the phase timeline visible", async () => {
    const user = userEvent.setup();
    const plan = makePlan();
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([plan])),
      http.get(apiUrl("/api/plans/plan-1"), () => HttpResponse.json(plan)),
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([]))
    );
    renderPlansView("plan-1");

    await user.click(await screen.findByRole("button", { name: "Edit plan" }));

    const planDetails = screen.getByText("Edit plan details").closest("details");
    expect(planDetails).not.toBeNull();
    const summaryPlan = planDetails!.querySelector(".plan-details-summary-primary");
    expect(summaryPlan).toBeVisible();
    const name = within(planDetails!).getByLabelText("Name");
    expect(name).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Base phase" })).toBeVisible();
    expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();

    await user.click(screen.getByText("Edit plan details"));

    expect(planDetails!.querySelector(".plan-details-summary-primary")).toBeNull();
    expect(name).toBeVisible();
    expect(within(planDetails!).getByLabelText("Race")).toBeVisible();
    expect(within(planDetails!).getByLabelText("Start date")).toBeVisible();
    expect(within(planDetails!).getByLabelText("End date")).toBeVisible();
    expect(within(planDetails!).getByRole("button", { name: "Add description" })).toBeVisible();
  });

  it("makes edit state and cancel behavior explicit", async () => {
    const user = userEvent.setup();
    const plan = makePlan();
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([plan])),
      http.get(apiUrl("/api/plans/plan-1"), () => HttpResponse.json(plan)),
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([]))
    );
    renderPlansView("plan-1");

    await user.click(await screen.findByRole("button", { name: "Edit plan" }));

    expect(screen.getByRole("button", { name: "Save changes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete plan" })).toBeVisible();
    expect(screen.getByText("No unsaved changes")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Delete training plan" })).not.toBeInTheDocument();

    await user.click(screen.getByText("Edit plan details"));
    const planDetails = screen.getByText("Hide plan details").closest("details");
    expect(planDetails).not.toBeNull();
    const nameInput = within(planDetails!).getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Revised half plan");
    expect(screen.getByText("Unsaved changes")).toBeVisible();

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenLastCalledWith("Discard your unsaved plan changes? This cannot be undone.");
    expect(nameInput).toHaveValue("Revised half plan");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("warns before unloading an unsaved plan draft", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([])),
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([]))
    );
    renderPlansView();

    await user.click(await screen.findByRole("button", { name: "Create training plan" }));

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    expect(window.dispatchEvent(beforeUnload)).toBe(false);
    expect(beforeUnload.defaultPrevented).toBe(true);
  });

  it("shows confirmation after creating a plan", async () => {
    const user = userEvent.setup();
    const createdPlan = { ...makePlan(), id: "plan-created", name: "New training plan" };
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([])),
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([])),
      http.post(apiUrl("/api/plans"), () => HttpResponse.json(createdPlan))
    );
    renderPlansView();

    await user.click(await screen.findByRole("button", { name: "Create training plan" }));
    const actions = screen.getByRole("group", { name: "Plan editor actions" });
    await user.click(within(actions).getByRole("button", { name: "Create plan" }));

    expect(await screen.findByText("New training plan was created.")).toBeVisible();
  });

  it("derives a read-only plan end from the selected race and restores date-range editing", async () => {
    const user = userEvent.setup();
    let submittedPayload: Record<string, unknown> | null = null;
    const autumnHalf = {
      id: "race-1",
      athleteAccountId: "profile-1",
      name: "Autumn Half",
      raceDate: "2026-10-03",
      distance: "half_marathon",
      distanceMiles: null,
      targetTime: 6000,
      priority: "A",
      location: "",
      altitudeContext: "",
      notes: "",
      targetPaceSecondsPerMile: 457.7,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z"
    };
    const turkeyTrot = {
      ...autumnHalf,
      id: "race-2",
      name: "Turkey Trot",
      raceDate: "2026-11-11",
      distance: "10k"
    };
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([])),
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([autumnHalf, turkeyTrot])),
      http.post(apiUrl("/api/plans"), async ({ request }) => {
        submittedPayload = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ ...makePlan(), id: "plan-created" });
      })
    );
    renderPlansView();

    await user.click(await screen.findByRole("button", { name: "Create training plan" }));
    const raceSelect = screen.getByLabelText("Race");
    const endDate = screen.getByLabelText("End date");

    await user.selectOptions(raceSelect, autumnHalf.id);
    expect(endDate).toHaveValue(autumnHalf.raceDate);
    expect(endDate).toHaveAttribute("readonly");
    expect(screen.getByText("Derived from Autumn Half race day.")).toBeVisible();
    const phaseBars = () =>
      screen.getAllByRole("button").filter((button) => button.classList.contains("mesocycle-timeline-bar"));
    expect(phaseBars().at(-1)).toHaveTextContent("Oct 3");

    await user.selectOptions(raceSelect, turkeyTrot.id);
    expect(endDate).toHaveValue(turkeyTrot.raceDate);
    expect(phaseBars().at(-1)).toHaveTextContent("Nov 11");
    const startDate = screen.getByLabelText("Start date");
    expect(startDate).not.toHaveAttribute("readonly");
    fireEvent.change(startDate, { target: { value: "2026-11-09" } });
    expect(startDate).toHaveValue("2026-11-09");
    expect(phaseBars().at(-1)).toHaveTextContent("Nov 9-11");

    await user.selectOptions(raceSelect, "");
    expect(endDate).not.toHaveAttribute("readonly");
    expect(endDate).toHaveValue("2026-11-15");
    fireEvent.change(endDate, { target: { value: "2026-12-06" } });
    expect(endDate).toHaveValue("2026-12-06");

    await user.selectOptions(raceSelect, autumnHalf.id);
    const actions = screen.getByRole("group", { name: "Plan editor actions" });
    await user.click(within(actions).getByRole("button", { name: "Create plan" }));

    expect(submittedPayload).toMatchObject({
      goalRaceId: autumnHalf.id,
      endDate: autumnHalf.raceDate
    });
    const mesocycles = (submittedPayload as Record<string, unknown> | null)?.mesocycles as Array<{ endDate: string }>;
    expect(mesocycles.at(-1)?.endDate).toBe(autumnHalf.raceDate);
  });
});
