import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpResponse, http } from "msw";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProfileProvider } from "../../lib/profile";
import { server } from "../../test/server";
import type { TrainingWeek, Workout } from "../../types/domain";
import { WeekView } from "./WeekView";

describe("WeekView workout completion", () => {
  it("marks an unmatched workout complete and allows undoing it", async () => {
    const user = userEvent.setup();
    const onSetCompletion = vi.fn();
    const onOpenPlanWeek = vi.fn();
    const workout = makeWorkout();
    const week = makeWeek(workout);
    server.use(
      http.get(new URL("/api/plans", window.location.origin).toString(), () => HttpResponse.json([])),
      http.get(new URL("/api/default-goals", window.location.origin).toString(), () => HttpResponse.json([]))
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ProfileProvider profileId="athlete-1">
          <WeekView {...makeProps(week, onSetCompletion)} onOpenPlanWeek={onOpenPlanWeek} />
        </ProfileProvider>
      </QueryClientProvider>
    );

    const weekActions = screen.getByLabelText("Week actions");
    const adjustWeekButton = within(weekActions).getByRole("button", { name: "Adjust rest of week" });
    expect(adjustWeekButton).toBeVisible();
    await user.click(adjustWeekButton);
    expect(onOpenPlanWeek).toHaveBeenCalledWith(week);

    await user.click(screen.getByRole("button", { name: "Mark Untracked strength session complete" }));

    expect(onSetCompletion).toHaveBeenCalledWith(workout, true);

    const completedWorkout = { ...workout, status: "completed_as_planned" as const };
    const completedWeek = makeWeek(completedWorkout);
    rerender(
      <QueryClientProvider client={queryClient}>
        <ProfileProvider profileId="athlete-1">
          <WeekView {...makeProps(completedWeek, onSetCompletion)} onOpenPlanWeek={onOpenPlanWeek} />
        </ProfileProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText("completed")).toBeVisible();
    const undo = screen.getByRole("button", { name: "Mark Untracked strength session incomplete" });
    expect(undo).toHaveAttribute("aria-pressed", "true");
    await user.click(undo);

    expect(onSetCompletion).toHaveBeenLastCalledWith(completedWorkout, false);
  });

  it("opens week planning from an actually unplanned current week", async () => {
    const user = userEvent.setup();
    const onOpenPlanWeek = vi.fn();
    const week: TrainingWeek = {
      ...makeWeek(makeWorkout()),
      plannedTime: null,
      purpose: "",
      workouts: []
    };
    server.use(
      http.get(new URL("/api/plans", window.location.origin).toString(), () => HttpResponse.json([])),
      http.get(new URL("/api/default-goals", window.location.origin).toString(), () => HttpResponse.json([]))
    );

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProfileProvider profileId="athlete-1">
          <WeekView {...makeProps(week, vi.fn())} onOpenPlanWeek={onOpenPlanWeek} />
        </ProfileProvider>
      </QueryClientProvider>
    );

    const weekActions = screen.getByLabelText("Week actions");
    const planWeekButton = within(weekActions).getByRole("button", { name: "Plan week" });
    expect(planWeekButton).toBeVisible();
    await user.click(planWeekButton);

    expect(onOpenPlanWeek).toHaveBeenCalledWith(week);
  });

  it("closes an empty past week from the selected week header", async () => {
    const user = userEvent.setup();
    const onSkipReview = vi.fn();
    const week: TrainingWeek = {
      ...makeWeek(makeWorkout()),
      weekStartDate: "2026-07-06",
      weekEndDate: "2026-07-12",
      plannedTime: null,
      purpose: "",
      workouts: [],
      weekState: "past"
    };
    server.use(
      http.get(new URL("/api/plans", window.location.origin).toString(), () => HttpResponse.json([])),
      http.get(new URL("/api/default-goals", window.location.origin).toString(), () => HttpResponse.json([]))
    );

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProfileProvider profileId="athlete-1">
          <WeekView {...makeProps(week, vi.fn())} onSkipReview={onSkipReview} />
        </ProfileProvider>
      </QueryClientProvider>
    );

    expect(screen.queryByLabelText("Recommended next action")).not.toBeInTheDocument();
    await user.click(within(screen.getByLabelText("Week actions")).getByRole("button", { name: "Close empty week" }));

    expect(onSkipReview).toHaveBeenCalledWith(week.id);
  });

  it("renders an unplanned collapsed week as quiet empty days, not seven rest days", () => {
    const selectedWeek = makeWeek(makeWorkout());
    const emptyWeek: TrainingWeek = {
      ...selectedWeek,
      id: "week-empty",
      weekStartDate: "2026-07-06",
      weekEndDate: "2026-07-12",
      plannedTime: null,
      purpose: "",
      workouts: [],
      weekState: "past"
    };
    server.use(
      http.get(new URL("/api/plans", window.location.origin).toString(), () => HttpResponse.json([])),
      http.get(new URL("/api/default-goals", window.location.origin).toString(), () => HttpResponse.json([]))
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const props = makeProps(selectedWeek, vi.fn());
    render(
      <QueryClientProvider client={queryClient}>
        <ProfileProvider profileId="athlete-1">
          <WeekView
            {...props}
            weekStack={{
              [emptyWeek.weekStartDate]: emptyWeek,
              [selectedWeek.weekStartDate]: selectedWeek
            }}
            weekStarts={[emptyWeek.weekStartDate, selectedWeek.weekStartDate]}
          />
        </ProfileProvider>
      </QueryClientProvider>
    );

    const preview = document.querySelector<HTMLElement>('[data-week-start="2026-07-06"] .week-preview-card');
    expect(preview).not.toBeNull();
    expect(preview?.getAttribute("aria-label")).toContain("Mon —");
    expect(preview?.getAttribute("aria-label")).toContain("Not planned yet");
    expect(preview?.getAttribute("aria-label")).not.toContain("rest");
  });

  it("shows the plan target and phase on an unplanned future week row", () => {
    server.use(
      http.get(new URL("/api/plans", window.location.origin).toString(), () => HttpResponse.json([])),
      http.get(new URL("/api/default-goals", window.location.origin).toString(), () => HttpResponse.json([]))
    );
    const selectedWeek = makeWeek(makeWorkout());
    const futureWeek: TrainingWeek = {
      ...selectedWeek,
      id: "week-future",
      weekStartDate: "2026-07-20",
      weekEndDate: "2026-07-26",
      plannedTime: null,
      targetMileage: 28,
      targetMileageSource: "plan",
      workouts: [],
      weekState: "future"
    };
    const props = makeProps(selectedWeek, vi.fn());
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProfileProvider profileId="athlete-1">
          <WeekView
            {...props}
            activePlan={{
              weekSummaries: [{
                weekStartDate: futureWeek.weekStartDate,
                mesocycleName: "Base",
                weekIndexInMesocycle: 1,
                targetMileage: 28
              }]
            } as ComponentProps<typeof WeekView>["activePlan"]}
            weekStack={{
              [selectedWeek.weekStartDate]: selectedWeek,
              [futureWeek.weekStartDate]: futureWeek
            }}
            weekStarts={[selectedWeek.weekStartDate, futureWeek.weekStartDate]}
          />
        </ProfileProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText("Not planned yet · target 28 mi · Base W1")).toBeVisible();
  });

  it("positions the initial week immediately and smooth-scrolls later selections below the sticky UI", () => {
    server.use(
      http.get(new URL("/api/plans", window.location.origin).toString(), () => HttpResponse.json([])),
      http.get(new URL("/api/default-goals", window.location.origin).toString(), () => HttpResponse.json([]))
    );
    const currentWeek = makeWeek(makeWorkout());
    const nextWeek: TrainingWeek = {
      ...currentWeek,
      id: "week-2",
      weekStartDate: "2026-07-20",
      weekEndDate: "2026-07-26",
      weekState: "future"
    };
    const props = makeProps(currentWeek, vi.fn());
    const scrollTo = vi.mocked(HTMLElement.prototype.scrollTo);
    const offsetHeight = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("app-header")) {
        return 64;
      }
      if (this.classList.contains("week-context-strip")) {
        return 58;
      }
      return 0;
    });
    const boundingRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = this.dataset.weekStart === currentWeek.weekStartDate
        ? 420
        : this.dataset.weekStart === nextWeek.weekStartDate
          ? 700
          : 0;
      return { bottom: top, height: 0, left: 0, right: 0, top, width: 0, x: 0, y: top, toJSON: () => ({}) };
    });
    scrollTo.mockClear();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const renderView = (selectedWeek: TrainingWeek) => (
      <QueryClientProvider client={queryClient}>
        <ProfileProvider profileId="athlete-1">
          <main>
            <div className="app-header" />
            <WeekView
              {...props}
              selectedWeekStart={selectedWeek.weekStartDate}
              week={selectedWeek}
              weekStack={{
                [currentWeek.weekStartDate]: currentWeek,
                [nextWeek.weekStartDate]: nextWeek
              }}
              weekStarts={[currentWeek.weekStartDate, nextWeek.weekStartDate]}
            />
          </main>
        </ProfileProvider>
      </QueryClientProvider>
    );

    const { rerender } = render(renderView(currentWeek));

    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "auto", top: 284 });
    scrollTo.mockClear();
    rerender(renderView(nextWeek));
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "smooth" }));

    boundingRect.mockRestore();
    offsetHeight.mockRestore();
  });

  it("keeps historical day cards read-only", () => {
    server.use(
      http.get(new URL("/api/plans", window.location.origin).toString(), () => HttpResponse.json([])),
      http.get(new URL("/api/default-goals", window.location.origin).toString(), () => HttpResponse.json([]))
    );
    const pastWeek = {
      ...makeWeek(makeWorkout()),
      weekStartDate: "2026-07-06",
      weekEndDate: "2026-07-12",
      weekState: "past" as const
    };
    const props = makeProps(pastWeek, vi.fn());
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProfileProvider profileId="athlete-1">
          <WeekView {...props} />
        </ProfileProvider>
      </QueryClientProvider>
    );

    expect(screen.queryByRole("button", { name: "Edit Untracked strength session" })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Edit workout")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Duplicate workout")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Delete workout")).not.toBeInTheDocument();
    expect(screen.queryByText("Add session")).not.toBeInTheDocument();
  });
});

function makeProps(
  week: TrainingWeek,
  onSetCompletion: (workout: Workout, completed: boolean) => void
): ComponentProps<typeof WeekView> {
  return {
    activePlan: null,
    canLoadNewerWeeks: false,
    canLoadOlderWeeks: false,
    currentWeekStart: week.weekStartDate,
    isLoading: false,
    onJumpToThisWeek: vi.fn(),
    onLoadNewerWeeks: vi.fn(),
    onLoadOlderWeeks: vi.fn(),
    onDismissReviewHandoff: vi.fn(),
    onOpenPlan: vi.fn(),
    onPlanNextWeek: vi.fn(),
    onSelectTimeWeek: vi.fn(),
    onSelectWeek: vi.fn(),
    onSkipReview: vi.fn(),
    selectedWeekStart: week.weekStartDate,
    reviewHandoff: null,
    timelineIndex: {
      years: [],
      selectedWeekStartDate: week.weekStartDate,
      currentWeekStartDate: week.weekStartDate
    },
    today: "2026-07-13",
    week,
    weekStack: { [week.weekStartDate]: week },
    weekStarts: [week.weekStartDate],
    onCreate: vi.fn(),
    onEdit: vi.fn(),
    onSetCompletion,
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onCreateGoal: vi.fn(),
    onCopyPriorWeek: vi.fn(),
    onDeriveWeekGoals: vi.fn(),
    onEditGoal: vi.fn(),
    onOpenPlanWeek: vi.fn(),
    onSync: vi.fn(),
    copyingPriorWeekId: null
  };
}

function makeWeek(workout: Workout): TrainingWeek {
  return {
    id: "week-1",
    weekStartDate: "2026-07-13",
    weekEndDate: "2026-07-19",
    plannedMileage: 0,
    actualMileage: 0,
    plannedTime: 1800,
    actualTime: null,
    mesocycleId: null,
    purpose: "maintain",
    purposeSource: "manual",
    targetMileage: null,
    targetMileageSource: "manual",
    targetLongRunDistance: null,
    targetLongRunSource: "manual",
    isDownWeek: false,
    notes: "",
    reviewedAt: null,
    workouts: [workout],
    actualActivities: [],
    goals: [],
    goalEvaluations: [],
    weekState: "current",
    goalReviewSummary: "",
    hardDays: 0,
    longRunDistance: 0,
    longRunPercentage: 0
  };
}

function makeWorkout(): Workout {
  return {
    id: "workout-1",
    trainingWeekId: "week-1",
    athleteAccountId: "athlete-1",
    plannedDate: "2026-07-13",
    title: "Untracked strength session",
    sport: "strength",
    workoutType: "strength",
    intensityCategory: "strength",
    plannedDistance: null,
    plannedDuration: 1800,
    plannedPace: null,
    plannedElevation: null,
    plannedTss: null,
    purpose: "General strength",
    instructions: "",
    notes: "",
    status: "planned"
  };
}
