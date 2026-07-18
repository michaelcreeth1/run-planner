import {
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Route,
  Settings,
  ShieldAlert,
  TrendingUp,
  WifiOff
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { LoginView } from "./components/LoginView";
import { Placeholder } from "./components/shared/Placeholder";
import { StatusBanner } from "./components/shared/StatusBanner";
import { PlanningWorkspace } from "./features/planning/PlanningWorkspace";
import { ProgressView } from "./features/progress/ProgressView";
import { SettingsView } from "./features/settings/SettingsView";
import { WeekGoalEditor } from "./features/weekGoals/WeekGoalEditor";
import { WeekView } from "./features/weekBoard/WeekView";
import { isCompletelyEmptyWeek } from "./features/weekBoard/buildWeekNextUp";
import { buildPlanRules } from "./features/goals/ruleEvaluation";
import { buildPlanWeekDraft, planWeekDraftToPayload } from "./features/weekPlanner/planWeekDrafts";
import { PlanWeekDrawer } from "./features/weekPlanner/PlanWeekDrawer";
import { WorkoutEditor } from "./features/workouts/WorkoutEditor";
import type { TrainingTimelineSummary } from "./hooks/useTrainingTimeline";
import { useTrainingTimeline } from "./hooks/useTrainingTimeline";
import { fetchJson, toApiErrorPresentation } from "./lib/api";
import type { ApiErrorPresentation } from "./lib/api";
import { addDays, parseDate, startOfWeek, todayDateString } from "./lib/dates";
import { defaultForm, defaultGoalForm, formToPayload, goalFormToPayload } from "./lib/forms";
import { formatDurationSeconds, paceInputFromMetrics } from "./lib/workoutMetrics";
import { appRoutePath, parseAppRoute } from "./lib/navigation";
import type { AppRoute, AppTab, PlanningSection, ProgressSection } from "./lib/navigation";
import { selectPrimaryPlan, useDefaultGoalsQuery, useGoalMetricsQuery, usePlanQuery, usePlansQuery } from "./lib/queries";
import { ProfileProvider } from "./lib/profile";
import type {
  AnalyticsPlanning,
  ApiVersion,
  LoginForm,
  PlanWeekDraft,
  SessionStatus,
  StravaActivity,
  StravaStatus,
  SyncJob,
  TrainingWeek,
  WeekGoal,
  WeekGoalForm,
  WeekSelectSource,
  Workout,
  WorkoutForm
} from "./types/domain";

const FRONTEND_VERSION = "0.1.1";
const WEEK_STACK_RADIUS = 3;
const WEEK_STACK_LOAD_BATCH = 6;

const primaryTabs = [
  { id: "week", label: "Week", icon: CalendarDays },
  { id: "plan", label: "Plan", icon: Route },
  { id: "progress", label: "Progress", icon: TrendingUp },
  { id: "settings", label: "Settings", icon: Settings }
] as const;

type Theme = "light" | "dark";
type WeekReviewHandoff = { nextWeekStart: string; reviewedWeekStart: string; wasEmpty: boolean };
type CompatibilityState =
  | { status: "checking" }
  | { status: "compatible"; apiVersion: ApiVersion }
  | { status: "error"; error: ApiErrorPresentation }
  | { status: "incompatible"; apiVersion: ApiVersion };

function getInitialTheme(): Theme {
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const fallbackWeekStart = startOfWeek(new Date());
  const route = useMemo(
    () => parseAppRoute(location.pathname, location.search, fallbackWeekStart),
    [fallbackWeekStart, location.pathname, location.search]
  );
  const { planId: selectedPlanRouteId, planningSection, progressSection, tab: activeTab, weekStart } = route;
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  const [compatibility, setCompatibility] = useState<CompatibilityState>({ status: "checking" });
  const [apiError, setApiError] = useState<ApiErrorPresentation | null>(null);
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [loginForm, setLoginForm] = useState<LoginForm>({ username: "", password: "" });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSwitchingProfile, setIsSwitchingProfile] = useState(false);
  const [visibleWeekStarts, setVisibleWeekStarts] = useState(() => weekRangeAround(route.weekStart));
  const [loadingWeekStarts, setLoadingWeekStarts] = useState<Set<string>>(new Set());
  const [weekStack, setWeekStack] = useState<Record<string, TrainingWeek>>({});
  const [timelineSummary, setTimelineSummary] = useState<TrainingTimelineSummary | null>(null);
  const [analyticsPlanning, setAnalyticsPlanning] = useState<AnalyticsPlanning | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsLookbackWeeks, setAnalyticsLookbackWeeks] = useState(12);
  const [analyticsFutureWeeks, setAnalyticsFutureWeeks] = useState(4);
  const [editor, setEditor] = useState<WorkoutForm | null>(null);
  const [isSavingWorkout, setIsSavingWorkout] = useState(false);
  const [workoutSaveError, setWorkoutSaveError] = useState<string | null>(null);
  const [goalEditor, setGoalEditor] = useState<WeekGoalForm | null>(null);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [goalSaveError, setGoalSaveError] = useState<string | null>(null);
  const [planWeekDraft, setPlanWeekDraft] = useState<PlanWeekDraft | null>(null);
  const [stravaStatus, setStravaStatus] = useState<StravaStatus | null>(null);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [lastSyncJob, setLastSyncJob] = useState<SyncJob | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [copyingPriorWeekId, setCopyingPriorWeekId] = useState<string | null>(null);
  const [isSavingPlanWeek, setIsSavingPlanWeek] = useState(false);
  const [pendingPlanWeekStart, setPendingPlanWeekStart] = useState<string | null>(null);
  const [weekReviewHandoff, setWeekReviewHandoff] = useState<WeekReviewHandoff | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const pendingPrependScroll = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const isPrependingWeeks = useRef(false);
  const isAppendingWeeks = useRef(false);
  const didApplyInitialTimelineRange = useRef(false);
  const weekStackRef = useRef(weekStack);
  const weekStartRef = useRef(weekStart);
  const dataRequestEpochRef = useRef(0);
  const dataRequestControllersRef = useRef(new Set<AbortController>());
  const compatibilityControllerRef = useRef<AbortController | null>(null);
  const mutationKeysRef = useRef(new Set<string>());

  const apiVersion = compatibility.status === "compatible" || compatibility.status === "incompatible"
    ? compatibility.apiVersion
    : null;
  const writesBlocked = compatibility.status !== "compatible";
  const week = weekStack[weekStart] ?? null;
  const isLoadingWeek = loadingWeekStarts.has(weekStart);
  const currentWeekStart = startOfWeek(new Date());
  const timelineIndex = useTrainingTimeline({
    currentWeekStartDate: currentWeekStart,
    selectedWeekStartDate: weekStart,
    timelineSummary,
    weekStack
  });
  const canLoadOlderWeeks = getOlderWeekStarts(visibleWeekStarts, timelineSummary).length > 0;
  const canLoadNewerWeeks =
    getNewerWeekStarts(
      visibleWeekStarts,
      timelineSummary,
      currentWeekStart,
      weekStart
    ).length > 0;
  const activeProfile =
    session?.profiles.find((profile) => profile.id === session.activeAthleteAccountId) ?? null;
  const plansQuery = usePlansQuery(session?.authenticated ? session.activeAthleteAccountId : null);
  const activePlanSummary = selectPrimaryPlan(plansQuery.data ?? []);
  const activePlanQuery = usePlanQuery(
    session?.activeAthleteAccountId ?? "anonymous",
    activePlanSummary?.id ?? null
  );
  const activePlan = activePlanQuery.data ?? null;
  const defaultGoalsQuery = useDefaultGoalsQuery(session?.activeAthleteAccountId ?? null);
  const goalMetricsQuery = useGoalMetricsQuery(Boolean(session?.authenticated));
  const sharedPlanRules = useMemo(
    () => buildPlanRules({ defaultGoals: defaultGoalsQuery.data ?? [], plan: activePlan }),
    [activePlan, defaultGoalsQuery.data]
  );

  useEffect(() => {
    weekStackRef.current = weekStack;
  }, [weekStack]);

  useEffect(() => {
    weekStartRef.current = weekStart;
  }, [weekStart]);

  const beginDataRequest = useCallback(() => {
    const controller = new AbortController();
    const epoch = dataRequestEpochRef.current;
    dataRequestControllersRef.current.add(controller);
    return {
      signal: controller.signal,
      isCurrent: () => !controller.signal.aborted && dataRequestEpochRef.current === epoch,
      finish: () => dataRequestControllersRef.current.delete(controller)
    };
  }, []);

  const invalidateDataRequests = useCallback(() => {
    dataRequestEpochRef.current += 1;
    dataRequestControllersRef.current.forEach((controller) => controller.abort());
    dataRequestControllersRef.current.clear();
  }, []);

  const clearAppData = useCallback(() => {
    weekStackRef.current = {};
    setWeekStack({});
    setTimelineSummary(null);
    setAnalyticsPlanning(null);
    setAnalyticsLoading(false);
    setActivities([]);
    setStravaStatus(null);
    setLastSyncJob(null);
    setEditor(null);
    setIsSavingWorkout(false);
    setWorkoutSaveError(null);
    setGoalEditor(null);
    setIsSavingGoal(false);
    setGoalSaveError(null);
    setPlanWeekDraft(null);
    setIsSavingPlanWeek(false);
    setPendingPlanWeekStart(null);
    setWeekReviewHandoff(null);
    setCopyingPriorWeekId(null);
    setIsSyncing(false);
    setLoadingWeekStarts(new Set());
    pendingPrependScroll.current = null;
    isPrependingWeeks.current = false;
    isAppendingWeeks.current = false;
    didApplyInitialTimelineRange.current = false;
  }, []);

  const loadWeeks = useCallback((starts: string[], options: { force?: boolean } = {}) => {
    const uniqueStarts = Array.from(new Set(starts.map((start) => startOfWeek(parseDate(start)))));
    const startsToFetch = options.force
      ? uniqueStarts
      : uniqueStarts.filter((start) => !weekStackRef.current[start]);
    if (!startsToFetch.length) {
      return;
    }

    setLoadingWeekStarts((current) => mergeLoadingStarts(current, startsToFetch));
    const request = beginDataRequest();
    Promise.all(
      startsToFetch.map((weekDate) =>
        fetchJson<TrainingWeek>(`/api/weeks/${weekDate}`, { signal: request.signal })
      )
    )
      .then((weeks) => {
        if (!request.isCurrent()) {
          return;
        }
        setWeekStack((current) => ({
          ...current,
          ...Object.fromEntries(weeks.map((loadedWeek) => [loadedWeek.weekStartDate, loadedWeek]))
        }));
        setApiError(null);
      })
      .catch((error: unknown) => {
        if (request.isCurrent()) {
          setApiError(toApiErrorPresentation(error, "Could not load training weeks."));
        }
      })
      .finally(() => {
        if (request.isCurrent()) {
          setLoadingWeekStarts((current) => removeLoadingStarts(current, startsToFetch));
        }
        request.finish();
      });
  }, [beginDataRequest]);

  const loadAnalyticsPlanning = useCallback(() => {
    setAnalyticsLoading(true);
    const params = new URLSearchParams({
      lookbackWeeks: String(analyticsLookbackWeeks),
      futureWeeks: String(analyticsFutureWeeks)
    });
    const request = beginDataRequest();
    fetchJson<AnalyticsPlanning>(`/api/analytics/planning?${params.toString()}`, { signal: request.signal })
      .then((body) => {
        if (!request.isCurrent()) {
          return;
        }
        setAnalyticsPlanning(body);
        setApiError(null);
      })
      .catch((error: unknown) => {
        if (request.isCurrent()) {
          setApiError(toApiErrorPresentation(error, "Could not load progress."));
        }
      })
      .finally(() => {
        if (request.isCurrent()) {
          setAnalyticsLoading(false);
        }
        request.finish();
      });
  }, [analyticsFutureWeeks, analyticsLookbackWeeks, beginDataRequest]);

  const loadTrainingTimeline = useCallback(() => {
    const request = beginDataRequest();
    fetchJson<TrainingTimelineSummary>("/api/training-timeline", { signal: request.signal })
      .then((body) => {
        if (!request.isCurrent()) {
          return;
        }
        setTimelineSummary(body);
        setApiError(null);
      })
      .catch((error: unknown) => {
        if (request.isCurrent()) {
          setApiError(toApiErrorPresentation(error, "Could not load the training timeline."));
        }
      })
      .finally(request.finish);
  }, [beginDataRequest]);

  const loadStravaStatus = useCallback(() => {
    const request = beginDataRequest();
    fetchJson<StravaStatus>("/api/auth/strava/status", { signal: request.signal })
      .then((body) => {
        if (request.isCurrent()) {
          setStravaStatus(body);
        }
      })
      .catch((error: unknown) => {
        if (request.isCurrent()) {
          setApiError(toApiErrorPresentation(error, "Could not load Strava status."));
        }
      })
      .finally(request.finish);
  }, [beginDataRequest]);

  const loadActivities = useCallback(() => {
    const request = beginDataRequest();
    fetchJson<StravaActivity[]>("/api/activities", { signal: request.signal })
      .then((body) => {
        if (request.isCurrent()) {
          setActivities(body);
        }
      })
      .catch((error: unknown) => {
        if (request.isCurrent()) {
          setApiError(toApiErrorPresentation(error, "Could not load activities."));
        }
      })
      .finally(request.finish);
  }, [beginDataRequest]);

  const recenterVisibleWeeks = useCallback((start: string, summary: TrainingTimelineSummary | null) => {
    const starts = boundedWeekRangeAround(start, summary);
    setVisibleWeekStarts(starts);
    loadWeeks(starts);
  }, [loadWeeks]);

  const checkCompatibility = useCallback(() => {
    compatibilityControllerRef.current?.abort();
    const controller = new AbortController();
    compatibilityControllerRef.current = controller;
    setCompatibility({ status: "checking" });
    fetchJson<ApiVersion>("/api/version", { signal: controller.signal })
      .then((body) => {
        if (controller.signal.aborted) {
          return;
        }
        const incompatible = body.forceReload || compareVersions(FRONTEND_VERSION, body.frontendMinVersion) < 0;
        setCompatibility({ status: incompatible ? "incompatible" : "compatible", apiVersion: body });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setCompatibility({
            status: "error",
            error: toApiErrorPresentation(error, "Could not check app compatibility.")
          });
        }
      });
  }, []);

  useEffect(() => {
    checkCompatibility();
    return () => compatibilityControllerRef.current?.abort();
  }, [checkCompatibility]);

  useEffect(() => {
    loadSession();
  }, []);

  useLayoutEffect(() => {
    const pending = pendingPrependScroll.current;
    const main = mainRef.current;
    if (!pending || !main) {
      isAppendingWeeks.current = false;
      return;
    }

    main.scrollTop = pending.scrollTop + (main.scrollHeight - pending.scrollHeight);
    pendingPrependScroll.current = null;
    isPrependingWeeks.current = false;
    isAppendingWeeks.current = false;
  }, [visibleWeekStarts]);

  useEffect(() => {
    invalidateDataRequests();
    clearAppData();
    if (!session?.authenticated || !session.activeAthleteAccountId) {
      return;
    }
    const starts = weekRangeAround(weekStartRef.current);
    setVisibleWeekStarts(starts);
    loadWeeks(starts, { force: true });
    loadTrainingTimeline();
    loadStravaStatus();
    loadActivities();
    return invalidateDataRequests;
  }, [
    clearAppData,
    invalidateDataRequests,
    loadActivities,
    loadStravaStatus,
    loadTrainingTimeline,
    loadWeeks,
    session?.activeAthleteAccountId,
    session?.authenticated
  ]);

  useEffect(() => {
    if (!session?.authenticated || !session.activeAthleteAccountId) {
      return;
    }
    loadAnalyticsPlanning();
  }, [loadAnalyticsPlanning, session?.activeAthleteAccountId, session?.authenticated]);

  useEffect(() => {
    if (!timelineSummary || didApplyInitialTimelineRange.current) {
      return;
    }

    didApplyInitialTimelineRange.current = true;
    recenterVisibleWeeks(weekStart, timelineSummary);
  }, [recenterVisibleWeeks, timelineSummary, weekStart]);

  useEffect(() => {
    if (!pendingPlanWeekStart) {
      return;
    }
    const pendingWeek = weekStack[pendingPlanWeekStart];
    if (!pendingWeek) {
      return;
    }
    setPlanWeekDraft(buildPlanWeekDraft(pendingWeek, weekStack));
    setPendingPlanWeekStart(null);
  }, [pendingPlanWeekStart, weekStack]);

  useEffect(() => {
    const canonicalPath = appRoutePath(route);
    if (location.pathname !== canonicalPath || location.search) {
      navigate(canonicalPath, { replace: true });
    }
  }, [location.pathname, location.search, navigate, route]);

  useEffect(() => {
    if (activeTab !== "week" || !session?.authenticated || !session.activeAthleteAccountId) {
      return;
    }
    const starts = boundedWeekRangeAround(weekStart, timelineSummary);
    setVisibleWeekStarts(starts);
    loadWeeks(starts);
  }, [activeTab, loadWeeks, session?.activeAthleteAccountId, session?.authenticated, timelineSummary, weekStart]);

  function loadSession() {
    setSessionLoading(true);
    fetchJson<SessionStatus>("/api/auth/session/status")
      .then((body) => {
        setSession(body);
        setLoginError(null);
        setApiError(null);
      })
      .catch((error: unknown) => {
        setApiError(toApiErrorPresentation(error, "Could not load your session."));
      })
      .finally(() => setSessionLoading(false));
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const body = await fetchJson<SessionStatus>("/api/auth/session/login", {
        method: "POST",
        body: JSON.stringify(loginForm)
      });
      invalidateDataRequests();
      clearAppData();
      setSession(body);
      setApiError(null);
      setLoginForm({ username: "", password: "" });
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function logout() {
    try {
      const body = await fetchJson<SessionStatus>("/api/auth/session/logout", { method: "POST" });
      invalidateDataRequests();
      clearAppData();
      setSession(body);
      setApiError(null);
    } catch (error) {
      setApiError(toApiErrorPresentation(error, "Could not log out."));
    }
  }

  async function switchProfile(athleteAccountId: string) {
    if (!athleteAccountId || athleteAccountId === session?.activeAthleteAccountId) {
      return;
    }
    setIsSwitchingProfile(true);
    try {
      const body = await fetchJson<SessionStatus>("/api/auth/session/profile", {
        method: "POST",
        body: JSON.stringify({ athleteAccountId })
      });
      invalidateDataRequests();
      clearAppData();
      setSession(body);
      setApiError(null);
    } catch (error) {
      setApiError(toApiErrorPresentation(error, "Could not switch profiles."));
    } finally {
      setIsSwitchingProfile(false);
    }
  }

  function refreshSession() {
    fetchJson<SessionStatus>("/api/auth/session/status")
      .then(setSession)
      .catch((error: unknown) => setApiError(toApiErrorPresentation(error, "Could not refresh your session.")));
  }

  function refreshVisibleWeeks() {
    loadWeeks(mergeWeekStarts([...visibleWeekStarts, ...weekRangeAround(weekStart)]), { force: true });
  }

  function navigateRoute(overrides: Partial<AppRoute>, replace = false) {
    navigate(appRoutePath({ ...route, ...overrides }), { replace });
  }

  function selectWeek(start: string, _source: WeekSelectSource = "week-stack") {
    const normalizedStart = startOfWeek(parseDate(start));
    if (normalizedStart === weekStart && activeTab === "week") {
      return;
    }
    if (normalizedStart !== weekStart) {
      if (_source === "week-stack") {
        setVisibleWeekStarts((current) => mergeWeekStarts([...current, normalizedStart]));
        loadWeeks([normalizedStart]);
      } else {
        recenterVisibleWeeks(normalizedStart, timelineSummary);
      }
    }
    navigateRoute({ tab: "week", weekStart: normalizedStart });
  }

  function navigateToTab(tab: AppTab) {
    if (tab === "week") {
      selectWeek(currentWeekStart, "time-rail");
      return;
    }

    navigateRoute({ tab });
  }

  function navigatePlanningSection(section: PlanningSection) {
    navigateRoute({ tab: "plan", planningSection: section });
  }

  function navigateProgressSection(section: ProgressSection) {
    navigateRoute({ tab: "progress", progressSection: section });
  }

  function navigatePlan(planId: string | null) {
    navigateRoute({ tab: "plan", planId, planningSection: "overview" }, planId === null);
  }

  function jumpToThisWeek() {
    selectWeek(currentWeekStart, "time-rail");
  }

  function prependOlderWeeks() {
    if (isPrependingWeeks.current) {
      return;
    }

    const olderStarts = getOlderWeekStarts(visibleWeekStarts, timelineSummary);
    const main = mainRef.current;
    if (!olderStarts.length || !main) {
      return;
    }

    isPrependingWeeks.current = true;
    pendingPrependScroll.current = {
      scrollHeight: main.scrollHeight,
      scrollTop: main.scrollTop
    };
    setVisibleWeekStarts((current) => mergeWeekStarts([...olderStarts, ...current]));
    loadWeeks(olderStarts);
  }

  function appendNewerWeeks() {
    if (isAppendingWeeks.current) {
      return;
    }

    const newerStarts = getNewerWeekStarts(
      visibleWeekStarts,
      timelineSummary,
      currentWeekStart,
      weekStart
    );
    if (!newerStarts.length) {
      return;
    }

    isAppendingWeeks.current = true;
    setVisibleWeekStarts((current) => mergeWeekStarts([...current, ...newerStarts]));
    loadWeeks(newerStarts);
  }

  function openCreate(plannedDate: string) {
    setWorkoutSaveError(null);
    setEditor(defaultForm(plannedDate));
  }

  function openEdit(workout: Workout) {
    setWorkoutSaveError(null);
    setEditor({
      id: workout.id,
      plannedDate: workout.plannedDate,
      title: workout.title,
      sport: workout.sport,
      workoutType: workout.workoutType,
      intensityCategory: workout.intensityCategory,
      plannedDistance: workout.plannedDistance?.toString() ?? "",
      plannedDuration: workout.plannedDuration ? formatDurationSeconds(workout.plannedDuration) : "",
      plannedPace: paceInputFromMetrics(
        workout.plannedDuration,
        workout.plannedDistance,
        workout.plannedPace
      ),
      purpose: workout.purpose,
      instructions: workout.instructions,
      notes: workout.notes,
      status: workout.status
    });
  }

  function openCreateGoal(targetWeek: TrainingWeek) {
    setGoalSaveError(null);
    setGoalEditor(defaultGoalForm(targetWeek.id));
  }

  function openEditGoal(goal: WeekGoal) {
    setGoalSaveError(null);
    setGoalEditor({
      id: goal.id,
      weekId: goal.trainingWeekId,
      metricKey: goal.metricKey ?? null,
      category: goal.category,
      goalType: goal.goalType,
      label: goal.label,
      description: goal.description,
      targetValue: goal.targetValue?.toString() ?? "",
      minAcceptable: goal.minAcceptable?.toString() ?? "",
      maxAcceptable: goal.maxAcceptable?.toString() ?? "",
      unit: goal.unit,
      evaluationMode: goal.evaluationMode,
      priority: goal.priority,
      status: goal.status,
      isEnabled: goal.isEnabled
    });
  }

  function openPlanWeek(targetWeek: TrainingWeek) {
    setPlanWeekDraft(buildPlanWeekDraft(targetWeek, weekStack));
  }

  function blockStaleWrite(action: string) {
    if (!writesBlocked) {
      return false;
    }
    const detail = compatibility.status === "incompatible"
      ? `Reload required before ${action}.`
      : compatibility.status === "error"
        ? `Retry the compatibility check before ${action}.`
        : `Wait for the compatibility check before ${action}.`;
    setApiError({ kind: "response", title: "Action unavailable", detail });
    return true;
  }

  function startMutation(key: string) {
    if (mutationKeysRef.current.has(key)) {
      return false;
    }
    mutationKeysRef.current.add(key);
    return true;
  }

  function finishMutation(key: string) {
    mutationKeysRef.current.delete(key);
  }

  async function savePlanWeek(draft: PlanWeekDraft) {
    if (blockStaleWrite("saving the week plan")) {
      return;
    }
    if (draft.weekState === "past") {
      setApiError({
        kind: "response",
        title: "Past week is read-only",
        detail: "Past weeks can only be completed through the review flow."
      });
      return;
    }
    const mutationKey = "plan-week";
    if (!startMutation(mutationKey)) {
      return;
    }
    const request = beginDataRequest();
    setIsSavingPlanWeek(true);
    try {
      const savedWeek = await fetchJson<TrainingWeek>(`/api/weeks/${draft.weekId}/plan`, {
        method: "PUT",
        body: JSON.stringify(planWeekDraftToPayload(draft)),
        signal: request.signal
      });
      if (!request.isCurrent()) {
        return;
      }
      setWeekStack((current) => ({
        ...current,
        [savedWeek.weekStartDate]: savedWeek
      }));
      setPlanWeekDraft(null);
      loadTrainingTimeline();
      loadAnalyticsPlanning();
      setApiError(null);
    } catch (error) {
      if (request.isCurrent()) {
        setApiError(toApiErrorPresentation(error, "Could not save the week plan."));
      }
    } finally {
      const isCurrent = request.isCurrent();
      request.finish();
      finishMutation(mutationKey);
      if (isCurrent) {
        setIsSavingPlanWeek(false);
      }
    }
  }

  async function completeWeekReview(weekId: string) {
    if (blockStaleWrite("completing the week review")) {
      return;
    }
    const mutationKey = "plan-week";
    if (!startMutation(mutationKey)) {
      return;
    }
    const request = beginDataRequest();
    setIsSavingPlanWeek(true);
    try {
      const sourceWeek = Object.values(weekStack).find((candidate) => candidate.id === weekId);
      const savedWeek = await fetchJson<TrainingWeek>(`/api/weeks/${weekId}/review`, {
        method: "POST",
        signal: request.signal
      });
      if (!request.isCurrent()) {
        return;
      }
      setWeekStack((current) => ({
        ...current,
        [savedWeek.weekStartDate]: savedWeek
      }));
      setPlanWeekDraft(null);
      setWeekReviewHandoff({
        reviewedWeekStart: savedWeek.weekStartDate,
        nextWeekStart: addDays(savedWeek.weekStartDate, 7),
        wasEmpty: sourceWeek ? isCompletelyEmptyWeek(sourceWeek) : false
      });
      loadTrainingTimeline();
      loadAnalyticsPlanning();
      setApiError(null);
    } catch (error) {
      if (request.isCurrent()) {
        setApiError(toApiErrorPresentation(error, "Could not complete the week review."));
      }
    } finally {
      const isCurrent = request.isCurrent();
      request.finish();
      finishMutation(mutationKey);
      if (isCurrent) {
        setIsSavingPlanWeek(false);
      }
    }
  }

  function planNextWeek(nextWeekStart: string) {
    setWeekReviewHandoff(null);
    setPendingPlanWeekStart(nextWeekStart);
    selectWeek(nextWeekStart, "time-rail");
    if (weekStack[nextWeekStart]) {
      setPlanWeekDraft(buildPlanWeekDraft(weekStack[nextWeekStart], weekStack));
      setPendingPlanWeekStart(null);
    }
  }

  async function saveWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) {
      return;
    }
    if (blockStaleWrite("saving a workout")) {
      return;
    }
    const mutationKey = "save-workout";
    if (!startMutation(mutationKey)) {
      return;
    }

    const request = beginDataRequest();
    setIsSavingWorkout(true);
    setWorkoutSaveError(null);
    try {
      const payload = formToPayload(editor);
      if (editor.id) {
        await fetchJson(`/api/planned-workouts/${editor.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
          signal: request.signal
        });
      } else {
        await fetchJson("/api/planned-workouts", {
          method: "POST",
          body: JSON.stringify(payload),
          signal: request.signal
        });
      }
      if (!request.isCurrent()) {
        return;
      }
      setEditor(null);
      setWorkoutSaveError(null);
      refreshVisibleWeeks();
      loadTrainingTimeline();
      loadAnalyticsPlanning();
      setApiError(null);
    } catch (error) {
      if (request.isCurrent()) {
        const presentation = toApiErrorPresentation(error, "Could not save workout.");
        setWorkoutSaveError(presentation.detail);
        setApiError(presentation);
      }
    } finally {
      const isCurrent = request.isCurrent();
      request.finish();
      finishMutation(mutationKey);
      if (isCurrent) {
        setIsSavingWorkout(false);
      }
    }
  }

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goalEditor) {
      return;
    }
    if (blockStaleWrite("saving a goal")) {
      return;
    }
    const mutationKey = "save-goal";
    if (!startMutation(mutationKey)) {
      return;
    }

    const request = beginDataRequest();
    setIsSavingGoal(true);
    setGoalSaveError(null);
    try {
      const payload = goalFormToPayload(goalEditor);
      if (goalEditor.id) {
        await fetchJson(`/api/week-goals/${goalEditor.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
          signal: request.signal
        });
      } else {
        await fetchJson(`/api/weeks/${goalEditor.weekId}/goals`, {
          method: "POST",
          body: JSON.stringify(payload),
          signal: request.signal
        });
      }
      if (!request.isCurrent()) {
        return;
      }
      setGoalEditor(null);
      setGoalSaveError(null);
      refreshVisibleWeeks();
      loadTrainingTimeline();
      loadAnalyticsPlanning();
      setApiError(null);
    } catch (error) {
      if (request.isCurrent()) {
        const presentation = toApiErrorPresentation(error, "Could not save weekly goal.");
        setGoalSaveError(presentation.detail);
        setApiError(presentation);
      }
    } finally {
      const isCurrent = request.isCurrent();
      request.finish();
      finishMutation(mutationKey);
      if (isCurrent) {
        setIsSavingGoal(false);
      }
    }
  }

  async function deleteWorkout(workout: Workout) {
    if (blockStaleWrite("deleting a workout")) {
      return;
    }
    const mutationKey = `workout:${workout.id}`;
    if (mutationKeysRef.current.has(mutationKey)) {
      return;
    }
    if (!window.confirm(`Delete "${workout.title}"? This cannot be undone.`)) {
      return;
    }
    if (!startMutation(mutationKey)) {
      return;
    }
    const request = beginDataRequest();
    try {
      await fetchJson(`/api/planned-workouts/${workout.id}`, { method: "DELETE", signal: request.signal });
      if (!request.isCurrent()) {
        return;
      }
      refreshVisibleWeeks();
      loadTrainingTimeline();
      setApiError(null);
    } catch (error) {
      if (request.isCurrent()) {
        setApiError(toApiErrorPresentation(error, "Could not delete workout."));
      }
    } finally {
      request.finish();
      finishMutation(mutationKey);
    }
  }

  async function duplicateWorkout(workout: Workout) {
    if (blockStaleWrite("duplicating a workout")) {
      return;
    }
    const mutationKey = `workout:${workout.id}`;
    if (!startMutation(mutationKey)) {
      return;
    }
    const request = beginDataRequest();
    try {
      await fetchJson(`/api/planned-workouts/${workout.id}/duplicate`, {
        method: "POST",
        signal: request.signal
      });
      if (!request.isCurrent()) {
        return;
      }
      refreshVisibleWeeks();
      loadTrainingTimeline();
      setApiError(null);
    } catch (error) {
      if (request.isCurrent()) {
        setApiError(toApiErrorPresentation(error, "Could not duplicate workout."));
      }
    } finally {
      request.finish();
      finishMutation(mutationKey);
    }
  }

  async function setWorkoutCompletion(workout: Workout, completed: boolean) {
    if (blockStaleWrite(completed ? "completing a workout" : "reopening a workout")) {
      return;
    }
    const mutationKey = `workout:${workout.id}`;
    if (!startMutation(mutationKey)) {
      return;
    }
    const request = beginDataRequest();
    try {
      const updatedWorkout = await fetchJson<Workout>(`/api/planned-workouts/${workout.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: completed ? "completed_as_planned" : "planned" }),
        signal: request.signal
      });
      if (!request.isCurrent()) {
        return;
      }
      setWeekStack((current) =>
        Object.fromEntries(
          Object.entries(current).map(([start, loadedWeek]) => [
            start,
            loadedWeek.workouts.some((item) => item.id === updatedWorkout.id)
              ? {
                  ...loadedWeek,
                  workouts: loadedWeek.workouts.map((item) =>
                    item.id === updatedWorkout.id ? updatedWorkout : item
                  )
                }
              : loadedWeek
          ])
        )
      );
      refreshVisibleWeeks();
      loadAnalyticsPlanning();
      setApiError(null);
    } catch (error) {
      if (request.isCurrent()) {
        setApiError(toApiErrorPresentation(error, "Could not update workout completion."));
      }
    } finally {
      request.finish();
      finishMutation(mutationKey);
    }
  }

  async function copyPriorWeek(targetWeek: TrainingWeek) {
    if (blockStaleWrite("copying the prior week")) {
      return;
    }
    const mutationKey = "copy-prior-week";
    if (mutationKeysRef.current.has(mutationKey)) {
      return;
    }
    if (
      targetWeek.workouts.length > 0 &&
      !window.confirm("Copy prior week into this week? Existing planned workouts will stay in place.")
    ) {
      return;
    }

    if (!startMutation(mutationKey)) {
      return;
    }
    const request = beginDataRequest();
    setCopyingPriorWeekId(targetWeek.id);
    try {
      const copiedWeek = await fetchJson<TrainingWeek>(`/api/weeks/${targetWeek.id}/copy-prior`, {
        method: "POST",
        signal: request.signal
      });
      if (!request.isCurrent()) {
        return;
      }
      setWeekStack((current) => ({
        ...current,
        [copiedWeek.weekStartDate]: copiedWeek
      }));
      loadTrainingTimeline();
      loadAnalyticsPlanning();
      setApiError(null);
    } catch (error) {
      if (request.isCurrent()) {
        setApiError(toApiErrorPresentation(error, "Could not copy the prior week."));
      }
    } finally {
      const isCurrent = request.isCurrent();
      request.finish();
      finishMutation(mutationKey);
      if (isCurrent) {
        setCopyingPriorWeekId((current) => current === targetWeek.id ? null : current);
      }
    }
  }

  async function deriveWeekGoals(targetWeek: TrainingWeek) {
    if (blockStaleWrite("refreshing weekly goals")) {
      return;
    }
    const mutationKey = `derive-goals:${targetWeek.id}`;
    if (!startMutation(mutationKey)) {
      return;
    }
    const request = beginDataRequest();
    try {
      const derivedWeek = await fetchJson<TrainingWeek>(`/api/weeks/${targetWeek.id}/goals/derive`, {
        method: "POST",
        signal: request.signal
      });
      if (!request.isCurrent()) {
        return;
      }
      setWeekStack((current) => ({
        ...current,
        [derivedWeek.weekStartDate]: derivedWeek
      }));
      loadTrainingTimeline();
      loadAnalyticsPlanning();
      setApiError(null);
    } catch (error) {
      if (request.isCurrent()) {
        setApiError(toApiErrorPresentation(error, "Could not refresh weekly goals."));
      }
    } finally {
      request.finish();
      finishMutation(mutationKey);
    }
  }

  async function runBackfill() {
    if (blockStaleWrite("syncing Strava")) {
      return;
    }
    const mutationKey = "strava-sync";
    if (!startMutation(mutationKey)) {
      return;
    }
    const request = beginDataRequest();
    setIsSyncing(true);
    try {
      const job = await fetchJson<SyncJob>("/api/sync/strava/backfill", {
        method: "POST",
        body: JSON.stringify({ days: 180 }),
        signal: request.signal
      });
      if (!request.isCurrent()) {
        return;
      }
      setLastSyncJob(job);
      loadActivities();
      loadStravaStatus();
      loadTrainingTimeline();
      setApiError(null);
    } catch (error) {
      if (request.isCurrent()) {
        setApiError(toApiErrorPresentation(error, "Could not sync Strava."));
      }
    } finally {
      const isCurrent = request.isCurrent();
      request.finish();
      finishMutation(mutationKey);
      if (isCurrent) {
        setIsSyncing(false);
      }
    }
  }

  if (sessionLoading) {
    return <Placeholder title="Loading" icon={<RefreshCw size={22} />} />;
  }

  if (!session?.authenticated) {
    return (
      <LoginView
        apiError={apiError}
        form={loginForm}
        isConfigured={session?.configured ?? null}
        isLoggingIn={isLoggingIn}
        loginError={loginError}
        setForm={setLoginForm}
        onRetrySession={loadSession}
        onSubmit={login}
      />
    );
  }

  if (!session.activeAthleteAccountId) {
    return <Placeholder title="Profile unavailable" detail="Choose a profile and try again." icon={<RefreshCw size={22} />} />;
  }

  return (
    <ProfileProvider profileId={session.activeAthleteAccountId}>
      <div className={`app-shell ${isSidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}>
        <aside className={`sidebar ${isSidebarCollapsed ? "sidebar--collapsed" : ""}`}>
          <div className="sidebar-top">
            <div className="brand">
              <img src="/icons/icon.svg" alt="" />
              <div className="brand-copy">
                <strong>Running Planner</strong>
                <span>v{FRONTEND_VERSION}</span>
              </div>
            </div>
            <button
              className="sidebar-toggle"
              type="button"
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={isSidebarCollapsed}
              onClick={() => setIsSidebarCollapsed((current) => !current)}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </div>
          <nav className="nav-tabs" aria-label="Primary navigation">
            {primaryTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={activeTab === tab.id ? "active" : ""}
                  type="button"
                  onClick={() => navigateToTab(tab.id)}
                  title={tab.label}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main ref={mainRef}>
          <AppHeader
            activeProfile={activeProfile}
            isSwitchingProfile={isSwitchingProfile}
            profiles={session.profiles}
            theme={theme}
            title={activeTab === "settings" ? "Settings" : primaryTabs.find((tab) => tab.id === activeTab)?.label}
            user={session.user}
            onLogout={logout}
            onOpenSettings={() => navigateToTab("settings")}
            onSwitchProfile={switchProfile}
            onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          />
          {apiError ? (
            <StatusBanner
              tone="warning"
              icon={apiError.kind === "network" ? <WifiOff size={18} /> : <ShieldAlert size={18} />}
              title={apiError.title}
              detail={apiError.detail}
            />
          ) : null}
          {compatibility.status === "checking" ? (
            <StatusBanner
              tone="warning"
              icon={<RefreshCw size={18} />}
              title="Checking compatibility"
              detail="Changes are disabled until this frontend is confirmed compatible with the API."
            />
          ) : null}
          {compatibility.status === "error" ? (
            <StatusBanner
              tone="danger"
              icon={compatibility.error.kind === "network" ? <WifiOff size={18} /> : <ShieldAlert size={18} />}
              title="Compatibility check failed"
              detail={compatibility.error.detail}
              actionLabel="Retry"
              onAction={checkCompatibility}
            />
          ) : null}
          {compatibility.status === "incompatible" ? (
            <StatusBanner
              tone="danger"
              icon={<ShieldAlert size={18} />}
              title="Reload required"
              detail="The backend requires a newer frontend before writes are allowed."
            />
          ) : null}

          {activeTab === "week" ? (
            <WeekView
              activePlan={activePlan}
              canLoadNewerWeeks={canLoadNewerWeeks}
              canLoadOlderWeeks={canLoadOlderWeeks}
              currentWeekStart={currentWeekStart}
              isLoading={isLoadingWeek}
              onJumpToThisWeek={jumpToThisWeek}
              onLoadNewerWeeks={appendNewerWeeks}
              onLoadOlderWeeks={prependOlderWeeks}
              onDismissReviewHandoff={() => setWeekReviewHandoff(null)}
              onOpenPlan={() => navigateToTab("plan")}
              onOpenProgress={() => navigateToTab("progress")}
              onPlanNextWeek={planNextWeek}
              onSelectTimeWeek={(start) => selectWeek(start, "time-rail")}
              onSelectWeek={(start) => selectWeek(start, "week-stack")}
              onSkipReview={completeWeekReview}
              selectedWeekStart={weekStart}
              timelineIndex={timelineIndex}
              today={todayDateString()}
              week={week}
              reviewHandoff={weekReviewHandoff}
              weekStack={weekStack}
              weekStarts={visibleWeekStarts}
              onCreate={openCreate}
              onEdit={openEdit}
              onSetCompletion={setWorkoutCompletion}
              onDelete={deleteWorkout}
              onDuplicate={duplicateWorkout}
              onCreateGoal={openCreateGoal}
              onCopyPriorWeek={copyPriorWeek}
              onDeriveWeekGoals={deriveWeekGoals}
              onEditGoal={openEditGoal}
              onOpenPlanWeek={openPlanWeek}
              onSync={runBackfill}
              copyingPriorWeekId={copyingPriorWeekId}
            />
          ) : null}
          <div hidden={activeTab !== "plan"}>
            <PlanningWorkspace
              key={session.activeAthleteAccountId}
              onChangeSection={navigatePlanningSection}
              writesBlocked={writesBlocked}
              section={planningSection}
              selectedPlanId={selectedPlanRouteId}
              onSelectPlan={navigatePlan}
              onPlanApplied={() => {
                refreshVisibleWeeks();
                loadTrainingTimeline();
                loadAnalyticsPlanning();
              }}
              onSelectWeek={(start) => {
                selectWeek(start, "time-rail");
              }}
            />
          </div>
          {activeTab === "progress" ? (
            <ProgressView
              activities={activities}
              analytics={analyticsPlanning}
              futureWeeks={analyticsFutureWeeks}
              isLoading={analyticsLoading}
              lookbackWeeks={analyticsLookbackWeeks}
              setFutureWeeks={setAnalyticsFutureWeeks}
              setLookbackWeeks={setAnalyticsLookbackWeeks}
              onSelectWeek={(start) => {
                selectWeek(start, "time-rail");
              }}
              onOpenStravaSettings={() => navigate("/settings#strava-settings")}
              onChangeSection={navigateProgressSection}
              section={progressSection}
            />
          ) : null}
          {activeTab === "settings" ? (
            <SettingsView
              apiVersion={apiVersion}
              isSyncing={isSyncing}
              lastSyncJob={lastSyncJob}
              onBackfill={runBackfill}
              onRefreshActivities={loadActivities}
              onRefreshStatus={loadStravaStatus}
              onRefreshSession={refreshSession}
              stravaStatus={stravaStatus}
              session={session}
              writesBlocked={writesBlocked}
              frontendVersion={FRONTEND_VERSION}
            />
          ) : null}
        </main>

        {editor ? (
          <WorkoutEditor
            editor={editor}
            error={workoutSaveError}
            isSaving={isSavingWorkout}
            setEditor={setEditor}
            onSubmit={saveWorkout}
            onClose={() => {
              setEditor(null);
              setWorkoutSaveError(null);
            }}
          />
        ) : null}
        {goalEditor ? (
          <WeekGoalEditor
            editor={goalEditor}
            error={goalSaveError}
            isSaving={isSavingGoal}
            metrics={goalMetricsQuery.data ?? []}
            setEditor={setGoalEditor}
            onSubmit={saveGoal}
            onClose={() => {
              setGoalEditor(null);
              setGoalSaveError(null);
            }}
          />
        ) : null}
        {planWeekDraft ? (
          <PlanWeekDrawer
            draft={planWeekDraft}
            isSaving={isSavingPlanWeek}
            setDraft={setPlanWeekDraft}
            weekStack={weekStack}
            onClose={() => setPlanWeekDraft(null)}
            onCompleteReview={completeWeekReview}
            onSave={savePlanWeek}
            plan={activePlan}
            rules={sharedPlanRules}
          />
        ) : null}
      </div>
    </ProfileProvider>
  );
}

function weekRangeAround(weekStart: string) {
  return Array.from({ length: WEEK_STACK_RADIUS * 2 + 1 }, (_, index) =>
    addDays(weekStart, (index - WEEK_STACK_RADIUS) * 7)
  );
}

function boundedWeekRangeAround(weekStart: string, timelineSummary: TrainingTimelineSummary | null) {
  const starts = weekRangeAround(weekStart);
  const oldestWeekStart = timelineSummary?.oldestWeekStartDate;
  if (!oldestWeekStart || weekStart < oldestWeekStart) {
    return starts;
  }

  return starts.filter((start) => start >= oldestWeekStart);
}

function getOlderWeekStarts(visibleWeekStarts: string[], timelineSummary: TrainingTimelineSummary | null) {
  const oldestVisibleStart = visibleWeekStarts[0];
  const oldestDataStart = timelineSummary?.oldestWeekStartDate;
  if (!oldestVisibleStart || !oldestDataStart || oldestVisibleStart <= oldestDataStart) {
    return [];
  }

  const starts: string[] = [];
  for (let index = WEEK_STACK_LOAD_BATCH; index >= 1; index -= 1) {
    const start = addDays(oldestVisibleStart, index * -7);
    if (start >= oldestDataStart) {
      starts.push(start);
    }
  }
  return starts;
}

function getNewerWeekStarts(
  visibleWeekStarts: string[],
  timelineSummary: TrainingTimelineSummary | null,
  currentWeekStart: string,
  selectedWeekStart: string
) {
  const newestVisibleStart = visibleWeekStarts.at(-1);
  if (!newestVisibleStart) {
    return [];
  }

  const newestAllowedStart = latestDateValue([
    timelineSummary?.newestWeekStartDate,
    currentWeekStart,
    selectedWeekStart
  ]);

  return Array.from({ length: WEEK_STACK_LOAD_BATCH }, (_, index) =>
    addDays(newestVisibleStart, (index + 1) * 7)
  ).filter((start) => start <= newestAllowedStart);
}

function mergeWeekStarts(starts: string[]) {
  return Array.from(new Set(starts)).sort();
}

function latestDateValue(values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort().at(-1) ?? todayDateString();
}

function mergeLoadingStarts(current: Set<string>, starts: string[]) {
  const next = new Set(current);
  starts.forEach((start) => next.add(start));
  return next;
}

function removeLoadingStarts(current: Set<string>, starts: string[]) {
  const next = new Set(current);
  starts.forEach((start) => next.delete(start));
  return next;
}

function compareVersions(left: string, right: string) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function App() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
