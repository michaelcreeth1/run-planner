import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { startOfWeek } from "./lib/dates";
import { server } from "./test/server";

const apiUrl = (path: string) => new URL(path, window.location.origin).toString();

function useLoggedOutHandlers() {
  server.use(
    http.get(apiUrl("/api/version"), () =>
      HttpResponse.json({
        frontendMinVersion: "0.1.0",
        backendVersion: "0.1.0",
        schemaVersion: "009",
        forceReload: false
      })
    ),
    http.get(apiUrl("/api/auth/session/status"), () =>
      HttpResponse.json({
        authenticated: false,
        configured: true,
        username: null,
        user: null,
        activeAthleteAccountId: null,
        profiles: []
      })
    )
  );
}

const authenticatedSession = {
  authenticated: true,
  configured: true,
  username: "michael",
  user: {
    id: "user-1",
    username: "michael",
    displayName: "Michael",
    isAdmin: true
  },
  activeAthleteAccountId: "profile-1",
  profiles: [
    {
      id: "profile-1",
      displayName: "Michael",
      timezone: "America/Denver",
      stravaAthleteId: null
    }
  ]
};

function emptyWeek(weekStartDate: string) {
  const end = new Date(`${weekStartDate}T12:00:00`);
  end.setDate(end.getDate() + 6);
  return {
    id: `virtual:profile-1:${weekStartDate}`,
    weekStartDate,
    weekEndDate: end.toISOString().slice(0, 10),
    plannedMileage: 0,
    actualMileage: 0,
    plannedTime: null,
    actualTime: null,
    mesocycleId: null,
    purpose: "",
    purposeSource: "manual",
    targetMileage: null,
    targetMileageSource: "manual",
    targetLongRunDistance: null,
    targetLongRunSource: "manual",
    isDownWeek: false,
    notes: "",
    workouts: [],
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

function useAuthenticatedAppHandlers(onCreateWorkout = vi.fn()) {
  useLoggedOutHandlers();
  server.use(
    http.post(apiUrl("/api/auth/session/login"), () => HttpResponse.json(authenticatedSession)),
    http.get(apiUrl("/api/weeks/:weekStartDate"), ({ params }) =>
      HttpResponse.json(emptyWeek(String(params.weekStartDate)))
    ),
    http.get(apiUrl("/api/training-timeline"), () =>
      HttpResponse.json({ oldestWeekStartDate: null, newestWeekStartDate: null, months: [] })
    ),
    http.get(apiUrl("/api/plans"), () => HttpResponse.json([])),
    http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([])),
    http.post(apiUrl("/api/plans/preview"), () =>
      HttpResponse.json({ weeks: [], weekSummaries: [], warnings: [] })
    ),
    http.get(apiUrl("/api/auth/strava/status"), () =>
      HttpResponse.json({
        connected: false,
        configured: false,
        athleteName: null,
        grantedScopes: [],
        expiresAt: null,
        message: "Strava is not configured."
      })
    ),
    http.get(apiUrl("/api/activities"), () => HttpResponse.json([])),
    http.get(apiUrl("/api/analytics/planning"), () => HttpResponse.json({})),
    http.get(apiUrl("/api/default-goals"), () => HttpResponse.json([])),
    http.get(apiUrl("/api/goal-metrics"), () => HttpResponse.json([])),
    http.post(apiUrl("/api/planned-workouts"), async ({ request }) => {
      onCreateWorkout(await request.json());
      return HttpResponse.json({ id: "workout-1" }, { status: 201 });
    })
  );
}

describe("App authentication states", () => {
  it("moves from loading to the configured login screen", async () => {
    useLoggedOutHandlers();
    render(<App />);

    expect(screen.getByText("Loading")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows a rejected login without losing entered credentials", async () => {
    const user = userEvent.setup();
    useLoggedOutHandlers();
    server.use(
      http.post(apiUrl("/api/auth/session/login"), () =>
        HttpResponse.json({ detail: "Invalid credentials." }, { status: 401 })
      )
    );
    render(<App />);

    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "michael");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid credentials.")).toBeVisible();
    expect(screen.getByLabelText("Username")).toHaveValue("michael");
    expect(screen.getByLabelText("Password")).toHaveValue("wrong-password");
  });

  it("logs in, loads the empty week, and creates a workout", async () => {
    const user = userEvent.setup();
    const onCreateWorkout = vi.fn();
    useAuthenticatedAppHandlers(onCreateWorkout);
    render(<App />);

    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "michael");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    const addSessionButtons = await screen.findAllByRole("button", { name: "Add session" });
    await user.click(addSessionButtons[0]);
    await user.type(screen.getByLabelText("Title"), "Easy recovery run");
    await user.type(screen.getByLabelText("Miles"), "4");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onCreateWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Easy recovery run",
        plannedDistance: 4,
        workoutType: "easy"
      })
    );
    expect(screen.queryByRole("heading", { name: "New workout" })).not.toBeInTheDocument();
  });

  it("returns to the current week when navigating to the Week tab", async () => {
    const user = userEvent.setup();
    const currentWeekStart = startOfWeek(new Date());
    vi.stubGlobal("IntersectionObserver", class {
      disconnect() {}
      observe() {}
      unobserve() {}
    });
    useAuthenticatedAppHandlers();
    window.history.replaceState(null, "", "/week/2026-06-01");
    render(<App />);

    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "michael");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
    await user.click(within(navigation).getByRole("button", { name: "Plan" }));
    const scrollTo = vi.mocked(HTMLElement.prototype.scrollTo);
    scrollTo.mockClear();
    await user.click(within(navigation).getByRole("button", { name: "Week" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe(`/week/${currentWeekStart}`);
      expect(document.querySelector(`[data-week-start="${currentWeekStart}"]`)).toHaveClass("week-row--expanded");
      expect(scrollTo).toHaveBeenCalled();
    });
  });

  it("opens a selected plan from a direct URL", async () => {
    const user = userEvent.setup();
    const planSummary = {
      id: "plan-1",
      athleteAccountId: "profile-1",
      name: "Autumn Half plan",
      description: "Build toward a fall race.",
      goalRaceId: null,
      goalRaceName: null,
      startDate: "2026-07-13",
      endDate: "2026-10-04",
      status: "active",
      notes: "",
      isCurrent: true,
      isUpcoming: false,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z"
    };
    window.history.replaceState(null, "", "/plan/plan-1");
    useAuthenticatedAppHandlers();
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([planSummary])),
      http.get(apiUrl("/api/plans/plan-1"), () =>
        HttpResponse.json({
          ...planSummary,
          goalRace: null,
          mesocycles: [],
          recurringGoals: [],
          weekSummaries: []
        })
      )
    );
    render(<App />);

    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "michael");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Plan overview" })).toBeVisible();
    expect(await screen.findByText("Autumn Half plan")).toBeVisible();
    expect(window.location.pathname).toBe("/plan/plan-1");

    await user.click(screen.getByRole("button", { name: "Goals & races" }));
    expect(await screen.findByRole("heading", { name: "Races and weekly defaults" })).toBeVisible();
    expect(window.location.pathname).toBe("/plan/plan-1/goals");
  });

  it("opens an activity deep link and returns to its training week", async () => {
    const user = userEvent.setup();
    const activity = {
      id: "activity-1",
      stravaActivityId: "123",
      name: "Morning Run",
      sportType: "Run",
      startDateLocal: "2026-07-15T06:30:00",
      distanceMiles: 5,
      movingTime: 2400,
      totalElevationGain: 80,
      averageHeartrate: 132,
      private: false
    };
    window.history.replaceState(null, "", "/progress/activities");
    useAuthenticatedAppHandlers();
    server.use(http.get(apiUrl("/api/activities"), () => HttpResponse.json([activity])));
    render(<App />);

    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "michael");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "1 activities" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Open the week containing Morning Run" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/week/2026-07-13");
    });
  });

  it("restores routes through browser back and forward", async () => {
    const user = userEvent.setup();
    const initialWeekStart = startOfWeek(new Date());
    useAuthenticatedAppHandlers();
    window.history.replaceState(null, "", `/week/${initialWeekStart}`);
    render(<App />);

    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "michael");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
    await user.click(within(navigation).getByRole("button", { name: "Plan" }));
    expect(window.location.pathname).toBe("/plan");

    window.history.back();
    await waitFor(() => {
      expect(window.location.pathname).toBe(`/week/${initialWeekStart}`);
      expect(document.querySelector(`[data-week-start="${initialWeekStart}"]`)).toBeInTheDocument();
    });

    window.history.forward();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/plan");
      expect(screen.getByRole("heading", { name: "Plan overview" })).toBeVisible();
    });
  });

  it("keeps an unsaved plan draft while visiting another app section", async () => {
    const user = userEvent.setup();
    useAuthenticatedAppHandlers();
    render(<App />);

    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "michael");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
    await user.click(within(navigation).getByRole("button", { name: "Plan" }));
    await user.click(await screen.findByRole("button", { name: "Create training plan" }));

    const planDetails = screen.getByText("Hide plan details").closest("details");
    expect(planDetails).not.toBeNull();
    const nameInput = within(planDetails!).getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Fall marathon draft");
    expect(screen.getByText("Unsaved changes")).toBeVisible();

    await user.click(within(navigation).getByRole("button", { name: "Week" }));
    await user.click(within(navigation).getByRole("button", { name: "Plan" }));

    expect(within(planDetails!).getByLabelText("Name")).toHaveValue("Fall marathon draft");
    expect(screen.getByText("Unsaved changes")).toBeVisible();
  });
});
