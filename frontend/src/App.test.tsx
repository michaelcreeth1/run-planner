import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    }),
    http.put(apiUrl("/api/weeks/:weekId/plan"), async ({ request }) => {
      const payload = await request.json();
      onCreateWorkout(payload);
      return HttpResponse.json(emptyWeek(startOfWeek(new Date())));
    })
  );
}

function useDirectAuthenticatedAppHandlers(session = authenticatedSession) {
  useAuthenticatedAppHandlers();
  server.use(
    http.get(apiUrl("/api/auth/session/status"), () => HttpResponse.json(session))
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

  it("recovers when the initial session check fails", async () => {
    const user = userEvent.setup();
    let sessionRequests = 0;
    useLoggedOutHandlers();
    server.use(
      http.get(apiUrl("/api/auth/session/status"), () => {
        sessionRequests += 1;
        if (sessionRequests === 1) {
          return HttpResponse.json({ detail: "Session unavailable." }, { status: 503 });
        }
        return HttpResponse.json({
          authenticated: false,
          configured: true,
          username: null,
          user: null,
          activeAthleteAccountId: null,
          profiles: []
        });
      })
    );
    render(<App />);

    expect(await screen.findByText("Could not load your session.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(screen.queryByText("Could not load your session.")).not.toBeInTheDocument();
    expect(sessionRequests).toBe(2);
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

  it("logs in, loads the empty week, and plans a workout", async () => {
    const user = userEvent.setup();
    const onCreateWorkout = vi.fn();
    useAuthenticatedAppHandlers(onCreateWorkout);
    render(<App />);

    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "michael");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    const weekActions = await screen.findByLabelText("Week actions");
    await user.click(within(weekActions).getByRole("button", { name: "Plan week" }));
    await user.click(screen.getByRole("button", { name: "Add session to Mon" }));
    const name = screen.getByLabelText("Mon session 1 name");
    await user.clear(name);
    await user.type(name, "Easy recovery run");
    await user.type(screen.getByLabelText("Mon session 1 mileage"), "4");
    await user.click(screen.getByRole("button", { name: "Save plan" }));

    expect(onCreateWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        workouts: [
          expect.objectContaining({
            title: "Easy recovery run",
            plannedDistance: 4,
            workoutType: "easy"
          })
        ]
      })
    );
    expect(screen.queryByRole("heading", { name: "Plan week" })).not.toBeInTheDocument();
  });

  it("requires confirmation before deleting a workout", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const currentStart = startOfWeek(new Date());
    const workout = {
      id: "workout-delete",
      trainingWeekId: "week-current",
      athleteAccountId: "profile-1",
      plannedDate: currentStart,
      title: "Easy five",
      sport: "run",
      workoutType: "easy",
      intensityCategory: "easy",
      plannedDistance: 5,
      plannedDuration: null,
      plannedPace: null,
      plannedElevation: null,
      plannedTss: null,
      purpose: "Aerobic support",
      instructions: "",
      notes: "",
      status: "planned"
    };
    useAuthenticatedAppHandlers();
    server.use(
      http.get(apiUrl("/api/weeks/:weekStartDate"), ({ params }) => {
        const start = String(params.weekStartDate);
        return HttpResponse.json({
          ...emptyWeek(start),
          workouts: start === currentStart ? [workout] : [],
          plannedMileage: start === currentStart ? 5 : 0
        });
      }),
      http.delete(apiUrl("/api/planned-workouts/:workoutId"), ({ params }) => {
        onDelete(String(params.workoutId));
        return new HttpResponse(null, { status: 204 });
      })
    );
    render(<App />);

    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "michael");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const deleteButton = await screen.findByTitle("Delete workout");
    await user.click(deleteButton);
    expect(confirm).toHaveBeenCalledWith('Delete "Easy five"? This cannot be undone.');
    expect(onDelete).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(deleteButton);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("workout-delete"));
    confirm.mockRestore();
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
    expect(await screen.findByRole("heading", { name: "Goals & races" })).toBeVisible();
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

describe("App compatibility state", () => {
  it("blocks writes while the compatibility check is pending", async () => {
    const user = userEvent.setup();
    let resolveVersion!: (response: Response) => void;
    useDirectAuthenticatedAppHandlers();
    server.use(
      http.get(apiUrl("/api/version"), () =>
        new Promise<Response>((resolve) => {
          resolveVersion = resolve;
        })
      )
    );
    render(<App />);

    expect(await screen.findByText("Checking compatibility")).toBeVisible();
    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
    await user.click(within(navigation).getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("button", { name: "Add profile" })).toBeDisabled();

    resolveVersion(HttpResponse.json({
      frontendMinVersion: "0.1.0",
      backendVersion: "0.1.0",
      schemaVersion: "009",
      forceReload: false
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add profile" })).toBeEnabled());
  });

  it("keeps writes blocked after a failed check and retries successfully", async () => {
    const user = userEvent.setup();
    let versionRequests = 0;
    useDirectAuthenticatedAppHandlers();
    server.use(
      http.get(apiUrl("/api/version"), () => {
        versionRequests += 1;
        if (versionRequests === 1) {
          return HttpResponse.json({ detail: "Version endpoint unavailable." }, { status: 503 });
        }
        return HttpResponse.json({
          frontendMinVersion: "0.1.0",
          backendVersion: "0.1.0",
          schemaVersion: "009",
          forceReload: false
        });
      })
    );
    render(<App />);

    expect(await screen.findByText("Compatibility check failed")).toBeVisible();
    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
    await user.click(within(navigation).getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("button", { name: "Add profile" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add profile" })).toBeEnabled());
    expect(screen.queryByText("Compatibility check failed")).not.toBeInTheDocument();
    expect(versionRequests).toBe(2);
  });

  it("keeps writes blocked when the API requires a newer frontend", async () => {
    const user = userEvent.setup();
    useDirectAuthenticatedAppHandlers();
    server.use(
      http.get(apiUrl("/api/version"), () =>
        HttpResponse.json({
          frontendMinVersion: "9.0.0",
          backendVersion: "9.0.0",
          schemaVersion: "999",
          forceReload: false
        })
      )
    );
    render(<App />);

    expect(await screen.findByText("Reload required")).toBeVisible();
    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
    await user.click(within(navigation).getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("button", { name: "Add profile" })).toBeDisabled();
  });
});

describe("App profile request scope", () => {
  it("aborts every profile-scoped loader before loading a newly selected profile", async () => {
    const user = userEvent.setup();
    const started = new Set<string>();
    const aborted = new Set<string>();
    let activeProfileId = "profile-1";
    const profiles = [
      ...authenticatedSession.profiles,
      { id: "profile-2", displayName: "Trail runner", timezone: "America/Denver", stravaAthleteId: null }
    ];
    const initialSession = { ...authenticatedSession, profiles };
    const switchedSession = { ...initialSession, activeAthleteAccountId: "profile-2" };

    function holdProfileOneRequest(
      kind: string,
      request: Request,
      body: Record<string, unknown> | unknown[]
    ) {
      started.add(kind);
      return new Promise<Response>((resolve) => {
        request.signal.addEventListener("abort", () => {
          aborted.add(kind);
          resolve(HttpResponse.json(body));
        }, { once: true });
      });
    }

    useDirectAuthenticatedAppHandlers(initialSession);
    server.use(
      http.post(apiUrl("/api/auth/session/profile"), () => {
        activeProfileId = "profile-2";
        return HttpResponse.json(switchedSession);
      }),
      http.get(apiUrl("/api/weeks/:weekStartDate"), ({ params, request }) => {
        const body = emptyWeek(String(params.weekStartDate));
        return activeProfileId === "profile-1"
          ? holdProfileOneRequest("weeks", request, body)
          : HttpResponse.json(body);
      }),
      http.get(apiUrl("/api/analytics/planning"), ({ request }) =>
        activeProfileId === "profile-1"
          ? holdProfileOneRequest("analytics", request, {})
          : HttpResponse.json({})
      ),
      http.get(apiUrl("/api/training-timeline"), ({ request }) => {
        const body = { oldestWeekStartDate: null, newestWeekStartDate: null, months: [] };
        return activeProfileId === "profile-1"
          ? holdProfileOneRequest("timeline", request, body)
          : HttpResponse.json(body);
      }),
      http.get(apiUrl("/api/auth/strava/status"), ({ request }) => {
        const body = {
          connected: false,
          configured: false,
          athleteName: null,
          grantedScopes: [],
          expiresAt: null,
          message: "Strava is not configured."
        };
        return activeProfileId === "profile-1"
          ? holdProfileOneRequest("status", request, body)
          : HttpResponse.json(body);
      }),
      http.get(apiUrl("/api/activities"), ({ request }) =>
        activeProfileId === "profile-1"
          ? holdProfileOneRequest("activities", request, [])
          : HttpResponse.json([])
      )
    );
    render(<App />);

    await waitFor(() => {
      expect(started).toEqual(new Set(["weeks", "analytics", "timeline", "status", "activities"]));
    });
    await user.click(await screen.findByRole("button", { name: "Open account menu" }));
    await user.selectOptions(screen.getByLabelText("Profile"), "profile-2");

    await waitFor(() => {
      expect(aborted).toEqual(new Set(["weeks", "analytics", "timeline", "status", "activities"]));
      expect(screen.getByLabelText("Profile")).toHaveValue("profile-2");
    });
  });

  it("discards planning drafts when the selected profile changes", async () => {
    const user = userEvent.setup();
    const profiles = [
      ...authenticatedSession.profiles,
      { id: "profile-2", displayName: "Trail runner", timezone: "America/Denver", stravaAthleteId: null }
    ];
    const initialSession = { ...authenticatedSession, profiles };
    const switchedSession = { ...initialSession, activeAthleteAccountId: "profile-2" };

    useDirectAuthenticatedAppHandlers(initialSession);
    server.use(
      http.post(apiUrl("/api/auth/session/profile"), () => HttpResponse.json(switchedSession))
    );
    render(<App />);

    const primaryNavigation = await screen.findByRole("navigation", { name: "Primary navigation" });
    await user.click(within(primaryNavigation).getByRole("button", { name: "Plan" }));
    await user.click(await screen.findByRole("button", { name: "Create training plan" }));

    const planDetails = screen.getByText("Hide plan details").closest("details");
    expect(planDetails).not.toBeNull();
    const planNameInput = within(planDetails!).getByLabelText("Name");
    await user.clear(planNameInput);
    await user.type(planNameInput, "Profile one plan draft");

    const planningNavigation = screen.getByRole("navigation", { name: "Planning sections" });
    await user.click(within(planningNavigation).getByRole("button", { name: "Goals & races" }));
    await user.click(await screen.findByRole("button", { name: "Add race" }));
    const createRaceButton = screen.getByRole("button", { name: "Create race" });
    const raceForm = createRaceButton.closest("form");
    expect(raceForm).not.toBeNull();
    await user.type(within(raceForm!).getByLabelText("Name"), "Profile one race draft");

    await user.click(screen.getByRole("button", { name: "Open account menu" }));
    await user.selectOptions(screen.getByLabelText("Profile"), "profile-2");

    await waitFor(() => {
      expect(screen.getByLabelText("Profile")).toHaveValue("profile-2");
      expect(screen.queryByDisplayValue("Profile one plan draft")).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue("Profile one race draft")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Create race" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Add race" })).toBeVisible();

    const switchedPlanningNavigation = screen.getByRole("navigation", { name: "Planning sections" });
    await user.click(within(switchedPlanningNavigation).getByRole("button", { name: "Training plan" }));
    expect(await screen.findByRole("button", { name: "Create training plan" })).toBeVisible();
    expect(screen.queryByDisplayValue("Profile one plan draft")).not.toBeInTheDocument();
  });

  it("aborts pending profile data when logging out", async () => {
    const user = userEvent.setup();
    let activityStarted = false;
    let activityAborted = false;
    useDirectAuthenticatedAppHandlers();
    server.use(
      http.get(apiUrl("/api/activities"), ({ request }) => {
        activityStarted = true;
        return new Promise<Response>((resolve) => {
          request.signal.addEventListener("abort", () => {
            activityAborted = true;
            resolve(HttpResponse.json([]));
          }, { once: true });
        });
      }),
      http.post(apiUrl("/api/auth/session/logout"), () =>
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
    render(<App />);

    await waitFor(() => expect(activityStarted).toBe(true));
    await user.click(await screen.findByRole("button", { name: "Open account menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Log out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
    await waitFor(() => expect(activityAborted).toBe(true));
  });
});

describe("App mutation handling", () => {
  function currentWorkout() {
    const currentStart = startOfWeek(new Date());
    return {
      id: "workout-mutation",
      trainingWeekId: "week-current",
      athleteAccountId: "profile-1",
      plannedDate: currentStart,
      title: "Easy five",
      sport: "run",
      workoutType: "easy",
      intensityCategory: "easy",
      plannedDistance: 5,
      plannedDuration: null,
      plannedPace: null,
      plannedElevation: null,
      plannedTss: null,
      purpose: "Aerobic support",
      instructions: "",
      notes: "",
      status: "planned"
    };
  }

  function useWeekWithWorkout() {
    const workout = currentWorkout();
    useAuthenticatedAppHandlers();
    server.use(
      http.get(apiUrl("/api/weeks/:weekStartDate"), ({ params }) => {
        const start = String(params.weekStartDate);
        return HttpResponse.json({
          ...emptyWeek(start),
          workouts: start === workout.plannedDate ? [workout] : [],
          plannedMileage: start === workout.plannedDate ? 5 : 0
        });
      })
    );
    return workout;
  }

  async function signIn(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "michael");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("guards a pending week-plan save and keeps the drawer open on failure", async () => {
    const user = userEvent.setup();
    let saveRequests = 0;
    let resolveSave!: (response: Response) => void;
    useAuthenticatedAppHandlers();
    server.use(
      http.put(apiUrl("/api/weeks/:weekId/plan"), () => {
        saveRequests += 1;
        return new Promise<Response>((resolve) => {
          resolveSave = resolve;
        });
      })
    );
    render(<App />);
    await signIn(user);

    const weekActions = await screen.findByLabelText("Week actions");
    await user.click(within(weekActions).getByRole("button", { name: "Plan week" }));
    const saveButton = screen.getByRole("button", { name: "Save plan" });
    await user.dblClick(saveButton);

    await waitFor(() => expect(saveRequests).toBe(1));
    expect(screen.getByRole("button", { name: "Saving" })).toBeDisabled();
    resolveSave(HttpResponse.json({ detail: "Plan save failed." }, { status: 503 }));

    expect(await screen.findByText("Could not save the week plan.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Plan week" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save plan" })).toBeEnabled();
  });

  it("keeps a workout editor open, blocks duplicate submits, and presents save failures", async () => {
    const user = userEvent.setup();
    let saveRequests = 0;
    let resolveSave!: (response: Response) => void;
    const workout = useWeekWithWorkout();
    server.use(
      http.patch(apiUrl(`/api/planned-workouts/${workout.id}`), () => {
        saveRequests += 1;
        return new Promise<Response>((resolve) => {
          resolveSave = resolve;
        });
      })
    );
    render(<App />);
    await signIn(user);

    await user.click(await screen.findByTitle("Edit workout"));
    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Updated easy five");
    const form = screen.getByLabelText("Workout editor").querySelector("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    await waitFor(() => expect(saveRequests).toBe(1));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    resolveSave(HttpResponse.json({ detail: "Workout endpoint failed." }, { status: 503 }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Workout endpoint failed.");
    expect(screen.getByRole("heading", { name: "Edit workout" })).toBeVisible();
    expect(screen.getByLabelText("Title")).toHaveValue("Updated easy five");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("guards duplicate workout actions and reports a failed duplicate", async () => {
    const user = userEvent.setup();
    let duplicateRequests = 0;
    let resolveDuplicate!: (response: Response) => void;
    const workout = useWeekWithWorkout();
    server.use(
      http.post(apiUrl(`/api/planned-workouts/${workout.id}/duplicate`), () => {
        duplicateRequests += 1;
        if (duplicateRequests === 1) {
          return new Promise<Response>((resolve) => {
            resolveDuplicate = resolve;
          });
        }
        return HttpResponse.json({ id: "workout-copy" }, { status: 201 });
      })
    );
    render(<App />);
    await signIn(user);

    const duplicateButton = await screen.findByTitle("Duplicate workout");
    await user.dblClick(duplicateButton);
    await waitFor(() => expect(duplicateRequests).toBe(1));
    resolveDuplicate(HttpResponse.json({ detail: "Duplicate failed." }, { status: 503 }));

    expect(await screen.findByText("Could not duplicate workout.")).toBeVisible();
    await user.click(duplicateButton);
    await waitFor(() => expect(duplicateRequests).toBe(2));
  });

  it("disables Strava sync while pending and restores it with a visible error", async () => {
    const user = userEvent.setup();
    let syncRequests = 0;
    let resolveSync!: (response: Response) => void;
    useAuthenticatedAppHandlers();
    server.use(
      http.get(apiUrl("/api/auth/strava/status"), () =>
        HttpResponse.json({
          connected: true,
          configured: true,
          athleteName: "Michael",
          grantedScopes: ["activity:read_all"],
          expiresAt: null,
          message: "Connected."
        })
      ),
      http.post(apiUrl("/api/sync/strava/backfill"), () => {
        syncRequests += 1;
        return new Promise<Response>((resolve) => {
          resolveSync = resolve;
        });
      })
    );
    render(<App />);
    await signIn(user);

    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
    await user.click(within(navigation).getByRole("button", { name: "Settings" }));
    const syncButton = await screen.findByRole("button", { name: "Backfill 180 days" });
    await user.click(syncButton);

    expect(await screen.findByRole("button", { name: "Syncing" })).toBeDisabled();
    expect(syncRequests).toBe(1);
    resolveSync(HttpResponse.json({ detail: "Strava sync failed." }, { status: 503 }));

    expect(await screen.findByText("Could not sync Strava.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Backfill 180 days" })).toBeEnabled();
  });
});
