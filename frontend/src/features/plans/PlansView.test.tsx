import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "../../lib/dates";
import { ProfileProvider } from "../../lib/profile";
import { server } from "../../test/server";
import type { PlanWeekSummary, TrainingPlan } from "../../types/domain";
import { PlansView } from "./PlansView";

const apiUrl = (path: string) => new URL(path, window.location.origin).toString();

const emptyPreviewResponse = {
  weeks: [],
  warnings: [],
  weekSummaries: []
};

beforeEach(() => {
  server.use(
    http.post(apiUrl("/api/plans/preview"), () => HttpResponse.json(emptyPreviewResponse)),
    http.post(apiUrl("/api/plans/:planId/preview"), () => HttpResponse.json(emptyPreviewResponse))
  );
});

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

function makeFourWeekPlan(): TrainingPlan {
  const plan = makePlan();
  return {
    ...plan,
    endDate: "2026-08-09",
    mesocycles: [
      {
        ...plan.mesocycles[0],
        endDate: "2026-08-09",
        targetMileageStart: 25,
        targetMileageEnd: 35,
        longRunStart: 8,
        longRunEnd: 12,
        downWeekCadence: 4,
        downWeekReductionPct: 25
      }
    ]
  };
}

function makeTwoPhasePlan(): TrainingPlan {
  const plan = makePlan();
  const base = {
    ...plan.mesocycles[0],
    endDate: "2026-07-19",
    targetMileageStart: 20,
    targetMileageEnd: 20,
    longRunStart: 6,
    longRunEnd: 6,
    downWeekCadence: null
  };
  return {
    ...plan,
    endDate: "2026-08-16",
    mesocycles: [
      base,
      {
        ...base,
        id: "mesocycle-2",
        orderIndex: 1,
        name: "Build",
        phase: "build",
        startDate: "2026-07-20",
        endDate: "2026-08-16",
        targetMileageStart: 25,
        targetMileageEnd: 35,
        longRunStart: 8,
        longRunEnd: 12,
        downWeekCadence: 4,
        downWeekReductionPct: 25
      }
    ]
  };
}

function makeWeekSummary(
  weekStartDate: string,
  overrides: Partial<Omit<PlanWeekSummary, "weekStartDate">> = {}
): PlanWeekSummary {
  return {
    weekStartDate,
    weekEndDate: addDays(weekStartDate, 6),
    mesocycleId: "mesocycle-1",
    mesocycleName: "Base",
    mesocyclePhase: "base",
    weekIndexInMesocycle: 1,
    mesocycleWeekCount: 1,
    plannedMileage: 0,
    actualMileage: 0,
    targetMileage: 20,
    targetLongRunDistance: 6,
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

function makeParityWeekSummaries(): PlanWeekSummary[] {
  const mileages = [25, 30, 35, 26.2];
  const longRuns = [8, 10, 12, 9];
  return ["2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03"].map(
    (weekStartDate, index) =>
      makeWeekSummary(weekStartDate, {
        weekIndexInMesocycle: index + 1,
        mesocycleWeekCount: 4,
        targetMileage: mileages[index],
        targetLongRunDistance: longRuns[index],
        purpose: index === 3 ? "down_week" : "aerobic_build",
        isDownWeek: index === 3
      })
  );
}

function previewResponse(weekSummaries: PlanWeekSummary[]) {
  return {
    weeks: [],
    warnings: [],
    weekSummaries
  };
}

function generatedWeekPreview() {
  return screen.getByRole("region", { name: "Generated week preview" });
}

function generatedWeekRow(label: string) {
  return within(generatedWeekPreview()).getByText(label).closest("li");
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
    const inspector = screen.getByRole("article", { name: "Selected phase settings" });
    expect(within(inspector).getByText("Base", { selector: "strong" })).toBeVisible();

    await user.click(buildPhase);

    expect(basePhase).toHaveAttribute("aria-pressed", "false");
    expect(buildPhase).toHaveAttribute("aria-pressed", "true");
    expect(within(inspector).getByText("Build", { selector: "strong" })).toBeVisible();
  });

  it("loads generated weeks from the create-plan preview endpoint", async () => {
    const user = userEvent.setup();
    let capturedPayload: {
      name: string;
      recurringGoals: unknown[];
      mesocycles: Array<{ startDate: string; targetMileageStart: number }>;
    } | null = null;
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([])),
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([])),
      http.post(apiUrl("/api/plans/preview"), async ({ request }) => {
        capturedPayload = await request.json() as typeof capturedPayload;
        const firstPhase = capturedPayload!.mesocycles[0];
        return HttpResponse.json(
          previewResponse([
            makeWeekSummary(firstPhase.startDate, {
              mesocycleId: null,
              targetMileage: 31,
              targetLongRunDistance: 9
            })
          ])
        );
      })
    );
    renderPlansView();

    await user.click(await screen.findByRole("button", { name: "Create training plan" }));

    const preview = await screen.findByRole("region", { name: "Generated week preview" });
    const row = await within(preview).findByRole("listitem");
    expect(row).toHaveTextContent("31 mi");
    expect(row).toHaveTextContent("9 mi");
    expect(capturedPayload).toMatchObject({
      name: "Training plan preview",
      recurringGoals: []
    });
    expect(capturedPayload!.mesocycles[0]).toMatchObject({ targetMileageStart: 28 });
  });

  it("shows generated weeks for only the selected phase with global week numbers", async () => {
    const user = userEvent.setup();
    const plan = makeTwoPhasePlan();
    const weekSummaries = [
      makeWeekSummary("2026-07-13"),
      ...["2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10"].map(
        (weekStartDate, index) =>
          makeWeekSummary(weekStartDate, {
            mesocycleId: "mesocycle-2",
            mesocycleName: "Build",
            mesocyclePhase: "build",
            weekIndexInMesocycle: index + 1,
            mesocycleWeekCount: 4,
            targetMileage: [25, 30, 35, 26.2][index],
            targetLongRunDistance: [8, 10, 12, 9][index],
            isDownWeek: index === 3
          })
      )
    ];
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([plan])),
      http.get(apiUrl("/api/plans/plan-1"), () => HttpResponse.json(plan)),
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([])),
      http.post(apiUrl("/api/plans/plan-1/preview"), () =>
        HttpResponse.json(previewResponse(weekSummaries))
      )
    );
    renderPlansView("plan-1");

    await user.click(await screen.findByRole("button", { name: "Edit plan" }));

    const preview = await screen.findByRole("region", { name: "Generated week preview" });
    expect(await within(preview).findByText("W1 · Jul 13")).toBeVisible();
    expect(within(preview).getAllByRole("listitem")).toHaveLength(1);
    expect(within(preview).queryByText("W2 · Jul 20")).not.toBeInTheDocument();
    expect(generatedWeekRow("W1 · Jul 13")).toHaveTextContent("20 mi");
    expect(generatedWeekRow("W1 · Jul 13")).toHaveTextContent("6 mi");

    await user.click(screen.getByRole("button", { name: "Build phase" }));

    expect(within(preview).getAllByRole("listitem")).toHaveLength(4);
    expect(within(preview).queryByText("W1 · Jul 13")).not.toBeInTheDocument();
    expect(within(preview).getByText("W2 · Jul 20")).toBeVisible();
    expect(within(preview).getByText("W5 · Aug 10")).toBeVisible();
    expect(within(preview).getByRole("list")).toHaveAttribute("start", "2");
    expect(generatedWeekRow("W5 · Aug 10")).toHaveTextContent("26.2 mi");
    expect(generatedWeekRow("W5 · Aug 10")).toHaveTextContent("9 mi");
    expect(generatedWeekRow("W5 · Aug 10")).toHaveTextContent("Down");
  });

  it("refreshes generated weeks as phase inputs and advanced targets change", async () => {
    const user = userEvent.setup();
    const basePlan = makeFourWeekPlan();
    const plan = {
      ...basePlan,
      mesocycles: [{ ...basePlan.mesocycles[0], downWeekReductionPct: 20 }]
    };
    let responseSummaries = makeParityWeekSummaries();
    const previewPayloads: Array<{ mesocycles: Array<Record<string, unknown>> }> = [];
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([plan])),
      http.get(apiUrl("/api/plans/plan-1"), () => HttpResponse.json(plan)),
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([])),
      http.post(apiUrl("/api/plans/plan-1/preview"), async ({ request }) => {
        const summaries = responseSummaries;
        previewPayloads.push(
          await request.json() as { mesocycles: Array<Record<string, unknown>> }
        );
        return HttpResponse.json(previewResponse(summaries));
      })
    );
    renderPlansView("plan-1");

    await user.click(await screen.findByRole("button", { name: "Edit plan" }));
    await screen.findByText("W1 · Jul 13");
    const inspector = screen.getByRole("article", { name: "Selected phase settings" });

    responseSummaries = responseSummaries.map((summary, index) =>
      index === 0 ? { ...summary, targetMileage: 24.7 } : summary
    );
    fireEvent.change(within(inspector).getByLabelText("Mileage at phase start"), {
      target: { value: "24.7" }
    });
    await waitFor(() =>
      expect(previewPayloads.at(-1)).toMatchObject({
        mesocycles: [{ targetMileageStart: 24.7 }]
      })
    );
    await waitFor(() => expect(generatedWeekRow("W1 · Jul 13")).toHaveTextContent("24.7 mi"));

    responseSummaries = responseSummaries.map((summary, index) =>
      index === 3 ? { ...summary, targetMileage: 33.3 } : summary
    );
    fireEvent.change(within(inspector).getByLabelText("Mileage at phase end"), {
      target: { value: "33.3" }
    });
    await waitFor(() =>
      expect(previewPayloads.at(-1)).toMatchObject({
        mesocycles: [{ targetMileageEnd: 33.3 }]
      })
    );
    await waitFor(() => expect(generatedWeekRow("W4 · Aug 3")).toHaveTextContent("33.3 mi"));

    responseSummaries = [
      ...responseSummaries.map((summary) => ({ ...summary, mesocycleWeekCount: 5 })),
      makeWeekSummary("2026-08-10", {
        weekIndexInMesocycle: 5,
        mesocycleWeekCount: 5,
        targetMileage: 44.4,
        targetLongRunDistance: 13.3
      })
    ];
    fireEvent.change(within(inspector).getByLabelText("Length (weeks)"), {
      target: { value: "5" }
    });
    await waitFor(() =>
      expect(previewPayloads.at(-1)).toMatchObject({
        endDate: "2026-08-16",
        mesocycles: [{ endDate: "2026-08-16" }]
      })
    );
    await waitFor(() => expect(within(generatedWeekPreview()).getAllByRole("listitem")).toHaveLength(5));
    expect(generatedWeekRow("W5 · Aug 10")).toHaveTextContent("44.4 mi");

    responseSummaries = responseSummaries.map((summary, index) => ({
      ...summary,
      isDownWeek: index === 2
    }));
    await user.selectOptions(within(inspector).getByLabelText("Down weeks"), "3");
    await waitFor(() =>
      expect(previewPayloads.at(-1)).toMatchObject({
        mesocycles: [{ downWeekCadence: 3 }]
      })
    );
    await waitFor(() => expect(generatedWeekRow("W3 · Jul 27")).toHaveTextContent("Down"));
    expect(generatedWeekRow("W4 · Aug 3")).not.toHaveTextContent("Down");

    await user.click(within(inspector).getByText("Advanced"));
    responseSummaries = responseSummaries.map((summary, index) =>
      index === 0 ? { ...summary, targetLongRunDistance: 8.5 } : summary
    );
    fireEvent.change(within(inspector).getByLabelText("Long run start (mi)"), {
      target: { value: "8.5" }
    });
    await waitFor(() =>
      expect(previewPayloads.at(-1)).toMatchObject({
        mesocycles: [{ longRunStart: 8.5 }]
      })
    );
    await waitFor(() => expect(generatedWeekRow("W1 · Jul 13")).toHaveTextContent("8.5 mi"));

    responseSummaries = responseSummaries.map((summary, index) =>
      index === 4 ? { ...summary, targetLongRunDistance: 12.5 } : summary
    );
    fireEvent.change(within(inspector).getByLabelText("Long run end (mi)"), {
      target: { value: "12.5" }
    });
    await waitFor(() =>
      expect(previewPayloads.at(-1)).toMatchObject({
        mesocycles: [{ longRunEnd: 12.5 }]
      })
    );
    await waitFor(() => expect(generatedWeekRow("W5 · Aug 10")).toHaveTextContent("12.5 mi"));

    responseSummaries = responseSummaries.map((summary, index) =>
      index === 2
        ? { ...summary, targetMileage: 23.2, targetLongRunDistance: 7.7 }
        : summary
    );
    fireEvent.change(within(inspector).getByLabelText("Down week reduction %"), {
      target: { value: "25" }
    });
    await waitFor(() =>
      expect(previewPayloads.at(-1)).toMatchObject({
        mesocycles: [{ downWeekReductionPct: 25 }]
      })
    );
    await waitFor(() => {
      expect(generatedWeekRow("W3 · Jul 27")).toHaveTextContent("23.2 mi");
      expect(generatedWeekRow("W3 · Jul 27")).toHaveTextContent("7.7 mi");
    });
  });

  it("ignores an older preview response that finishes after a newer edit", async () => {
    const user = userEvent.setup();
    const plan = makeFourWeekPlan();
    let releaseSlowResponse = () => {};
    let slowRequestStarted = false;
    let slowHandlerFinished = false;
    const slowResponseGate = new Promise<void>((resolve) => {
      releaseSlowResponse = resolve;
    });
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([plan])),
      http.get(apiUrl("/api/plans/plan-1"), () => HttpResponse.json(plan)),
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([])),
      http.post(apiUrl("/api/plans/plan-1/preview"), async ({ request }) => {
        const payload = await request.json() as {
          mesocycles: Array<{ targetMileageStart: number }>;
        };
        const targetMileage = payload.mesocycles[0].targetMileageStart;
        if (targetMileage === 30) {
          slowRequestStarted = true;
          await slowResponseGate;
          slowHandlerFinished = true;
        }
        const summaries = makeParityWeekSummaries().map((summary, index) =>
          index === 0 ? { ...summary, targetMileage } : summary
        );
        return HttpResponse.json(previewResponse(summaries));
      })
    );
    renderPlansView("plan-1");

    await user.click(await screen.findByRole("button", { name: "Edit plan" }));
    await screen.findByText("W1 · Jul 13");
    const mileageStart = screen.getByLabelText("Mileage at phase start");

    fireEvent.change(mileageStart, { target: { value: "30" } });
    await waitFor(() => expect(slowRequestStarted).toBe(true));
    fireEvent.change(mileageStart, { target: { value: "31" } });
    await waitFor(() => expect(generatedWeekRow("W1 · Jul 13")).toHaveTextContent("31 mi"));

    releaseSlowResponse();
    await waitFor(() => expect(slowHandlerFinished).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(generatedWeekRow("W1 · Jul 13")).toHaveTextContent("31 mi");
  });

  it("matches the generated preview to the saved plan overview", async () => {
    const user = userEvent.setup();
    let currentPlan = makeFourWeekPlan();
    const savedWeekSummaries = makeParityWeekSummaries();
    let submittedPayload: Record<string, unknown> | null = null;
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([currentPlan])),
      http.get(apiUrl("/api/plans/plan-1"), () => HttpResponse.json(currentPlan)),
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([])),
      http.post(apiUrl("/api/plans/plan-1/preview"), () =>
        HttpResponse.json(previewResponse(savedWeekSummaries))
      ),
      http.put(apiUrl("/api/plans/plan-1"), async ({ request }) => {
        submittedPayload = await request.json() as Record<string, unknown>;
        currentPlan = { ...currentPlan, weekSummaries: savedWeekSummaries };
        return HttpResponse.json(currentPlan);
      })
    );
    renderPlansView("plan-1");

    await user.click(await screen.findByRole("button", { name: "Edit plan" }));

    await screen.findByText("W1 · Jul 13");
    const previewLabels = ["W1 · Jul 13", "W2 · Jul 20", "W3 · Jul 27", "W4 · Aug 3"];
    previewLabels.forEach((label, index) => {
      const row = generatedWeekRow(label);
      expect(row).toHaveTextContent(`${savedWeekSummaries[index].targetMileage} mi`);
      expect(row).toHaveTextContent(`${savedWeekSummaries[index].targetLongRunDistance} mi`);
      if (savedWeekSummaries[index].isDownWeek) {
        expect(row).toHaveTextContent("Down");
      } else {
        expect(row).not.toHaveTextContent("Down");
      }
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Autumn Half plan was updated.")).toBeVisible();
    expect(submittedPayload).toMatchObject({
      mesocycles: [
        {
          targetMileageStart: 25,
          targetMileageEnd: 35,
          longRunStart: 8,
          longRunEnd: 12,
          downWeekCadence: 4,
          downWeekReductionPct: 25
        }
      ]
    });
    previewLabels.forEach((label, index) => {
      const week = screen.getByRole("button", { name: new RegExp(label) });
      expect(week).toHaveTextContent(`${savedWeekSummaries[index].targetMileage} mi`);
      if (savedWeekSummaries[index].isDownWeek) {
        expect(week).toHaveTextContent("Down");
      } else {
        expect(week).not.toHaveTextContent("Down");
      }
    });
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
