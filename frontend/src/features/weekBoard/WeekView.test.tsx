import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpResponse, http } from "msw";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProfileProvider } from "../../lib/profile";
import { server } from "../../test/server";
import type { PerformedSession, TrainingWeek, Workout } from "../../types/domain";
import { WeekView } from "./WeekView";

describe("WeekView workout completion", () => {
  it("keeps today's sessions in the weekly schedule without a duplicate feature card", async () => {
    const user = userEvent.setup();
    const completed = { ...makeWorkout(), status: "completed_as_planned" as const };
    const remaining = { ...makeWorkout(), id: "remaining", title: "Evening mobility" };
    const week = { ...makeWeek(completed), workouts: [completed, remaining] };
    const props = makeProps(week);
    server.use(
      http.get(new URL("/api/plans", window.location.origin).toString(), () => HttpResponse.json([])),
      http.get(new URL("/api/default-goals", window.location.origin).toString(), () => HttpResponse.json([]))
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProfileProvider profileId="athlete-1">
          <WeekView {...props} />
        </ProfileProvider>
      </QueryClientProvider>
    );

    expect(screen.queryByRole("region", { name: "Today's training" })).not.toBeInTheDocument();
    const schedule = within(screen.getByRole("region", { name: "Weekly schedule" }));
    expect(schedule.getByRole("button", { name: `Edit ${remaining.title}` })).toBeVisible();
    expect(schedule.getAllByText("30 min")).toHaveLength(2);
    await user.click(schedule.getByRole("button", { name: `Edit ${remaining.title}` }));
    expect(props.onEdit).toHaveBeenCalledWith(remaining);
  });

  it("opens session actions on demand, restores focus on Escape, and closes after an action", async () => {
    const user = userEvent.setup();
    const workout = makeWorkout();
    const week = makeWeek(workout);
    const props = makeProps(week);
    server.use(
      http.get(new URL("/api/plans", window.location.origin).toString(), () => HttpResponse.json([])),
      http.get(new URL("/api/default-goals", window.location.origin).toString(), () => HttpResponse.json([]))
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProfileProvider profileId="athlete-1">
          <WeekView {...props} />
        </ProfileProvider>
      </QueryClientProvider>
    );

    const trigger = screen.getByRole("button", { name: `Actions for ${workout.title}` });
    expect(screen.queryByTitle("Delete workout")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByTitle("Duplicate workout")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    await user.click(screen.getByTitle("Duplicate workout"));
    expect(props.onDuplicate).toHaveBeenCalledWith(workout);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("shows a compatible unresolved import as awaiting review without a reconciliation action", async () => {
    const user = userEvent.setup();
    const workout: Workout = {
      ...makeWorkout(),
      id: "run-1",
      plannedDate: "2026-07-14",
      title: "Easy run",
      sport: "run",
      workoutType: "easy",
      intensityCategory: "easy",
      plannedDistance: 9
    };
    const session: PerformedSession = {
      id: "session-1",
      athleteAccountId: "athlete-1",
      occurredAt: "2026-07-14T07:00:00",
      sport: "run",
      recordings: [{ stravaActivityId: "activity-1", contributesToTotals: true }],
      manualDistanceMeters: null,
      manualDurationSeconds: null,
      plannedWorkoutId: null,
      prescriptionRevisionId: null,
      association: "unmatched",
      matchProvenance: null,
      outcome: "unresolved",
      intensityCategory: "easy",
      evidence: "activity_summary",
      assessmentNote: "",
      evidenceChanged: false,
      version: 1,
      totalDistanceMeters: 9 * 1609.344,
      totalDurationSeconds: 4800
    };
    const rideSession: PerformedSession = {
      ...session,
      id: "ride-session",
      occurredAt: "2026-07-13T07:00:00",
      sport: "cross_training",
      recordings: [{ stravaActivityId: "ride-activity", contributesToTotals: true }],
      totalDistanceMeters: 1.8 * 1609.344,
      totalDurationSeconds: 1037
    };
    const week: TrainingWeek = {
      ...makeWeek(workout),
      workouts: [workout],
      actualActivities: [
        {
          id: "activity-1",
          stravaActivityId: "strava-1",
          name: "Morning Run",
          sportType: "Run",
          startDateLocal: session.occurredAt,
          activityDate: "2026-07-14",
          distance: 9 * 1609.344,
          distanceMiles: 9,
          movingTime: 4800,
          averageHeartrate: null
        },
        {
          id: "ride-activity",
          stravaActivityId: "strava-ride",
          name: "Morning Ride",
          sportType: "Ride",
          startDateLocal: rideSession.occurredAt,
          activityDate: "2026-07-13",
          distance: 1.8 * 1609.344,
          distanceMiles: 1.8,
          movingTime: 1037,
          averageHeartrate: null
        }
      ],
      performedSessions: [session, rideSession]
    };
    server.use(
      http.get(new URL("/api/plans", window.location.origin).toString(), () => HttpResponse.json([])),
      http.get(new URL("/api/default-goals", window.location.origin).toString(), () => HttpResponse.json([]))
    );

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProfileProvider profileId="athlete-1">
          <WeekView {...makeProps(week)} today="2026-07-15" />
        </ProfileProvider>
      </QueryClientProvider>
    );

    const schedule = within(screen.getByRole("region", { name: "Weekly schedule" }));
    expect(schedule.getByText("Awaiting match")).toBeVisible();
    expect(schedule.getAllByText("Review match")).toHaveLength(2);
    expect(schedule.getByText("1.8 mi · 17.3 min")).toBeVisible();
    expect(schedule.queryByText("9:36/mi")).not.toBeInTheDocument();
    expect(schedule.queryByText("Missed")).not.toBeInTheDocument();
    expect(schedule.queryByText("Correct reconciliation")).not.toBeInTheDocument();
    await user.click(schedule.getByRole("button", { name: "Actions for Morning Run" }));
    expect(schedule.getByRole("button", { name: "Edit match" })).toBeVisible();
  });

  it("does not offer manual activity completion", async () => {
    const user = userEvent.setup();
    const onOpenPlanWeek = vi.fn();
    const workout = makeWorkout();
    const week = makeWeek(workout);
    server.use(
      http.get(new URL("/api/plans", window.location.origin).toString(), () => HttpResponse.json([])),
      http.get(new URL("/api/default-goals", window.location.origin).toString(), () => HttpResponse.json([]))
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProfileProvider profileId="athlete-1">
          <WeekView {...makeProps(week)} onOpenPlanWeek={onOpenPlanWeek} />
        </ProfileProvider>
      </QueryClientProvider>
    );

    const weekActions = screen.getByLabelText("Week actions");
    const adjustWeekButton = within(weekActions).getByRole("button", { name: "Adjust week" });
    expect(adjustWeekButton).toBeVisible();
    await user.click(adjustWeekButton);
    expect(onOpenPlanWeek).toHaveBeenCalledWith(week);
    expect(screen.queryByRole("button", { name: /Mark .* complete/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Log completed work/ })).not.toBeInTheDocument();
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
          <WeekView {...makeProps(week)} onOpenPlanWeek={onOpenPlanWeek} />
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
          <WeekView {...makeProps(week)} onSkipReview={onSkipReview} />
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
    const props = makeProps(selectedWeek);
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
    const props = makeProps(selectedWeek);
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

  it("positions initial and later week selections immediately below the sticky UI", () => {
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
    const props = makeProps(currentWeek);
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

    // The onboarding prompt scrolls away; only the 64px app header and 20px gap remain sticky.
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "auto", top: 336 });
    scrollTo.mockClear();
    rerender(renderView(nextWeek));
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "auto", top: 616 });

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
    const props = makeProps(pastWeek);
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

function makeProps(week: TrainingWeek): ComponentProps<typeof WeekView> {
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
    onEditPerformedSession: vi.fn(),
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
