import {
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Route,
  ShieldAlert,
  TrendingUp,
  WifiOff
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { LoginView } from "./components/LoginView";
import { Placeholder } from "./components/shared/Placeholder";
import { StatusBanner } from "./components/shared/StatusBanner";
import { PlanningWorkspace } from "./features/planning/PlanningWorkspace";
import { ProgressView } from "./features/progress/ProgressView";
import { SettingsView } from "./features/settings/SettingsView";
import { WeekGoalEditor } from "./features/weekGoals/WeekGoalEditor";
import { WeekView } from "./features/weekBoard/WeekView";
import { buildPlanWeekDraft, planWeekDraftToPayload } from "./features/weekPlanner/planWeekDrafts";
import { PlanWeekDrawer } from "./features/weekPlanner/PlanWeekDrawer";
import { WorkoutEditor } from "./features/workouts/WorkoutEditor";
import type { TrainingTimelineSummary } from "./hooks/useTrainingTimeline";
import { useTrainingTimeline } from "./hooks/useTrainingTimeline";
import { fetchJson } from "./lib/api";
import { addDays, parseDate, startOfWeek, todayDateString } from "./lib/dates";
import { defaultForm, defaultGoalForm, formToPayload, goalFormToPayload } from "./lib/forms";
import { appRoutePath, parseAppRoute } from "./lib/navigation";
import type { AppRoute, AppTab, PlanningSection, ProgressSection } from "./lib/navigation";
import type {
  AnalyticsPlanning,
  ApiVersion,
  LoginForm,
  PlanWeekDraft,
  SessionStatus,
  StravaActivity,
  StravaStatus,
  SyncJob,
  TrainingPlan,
  TrainingPlanSummary,
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
  { id: "progress", label: "Progress", icon: TrendingUp }
] as const;

type Theme = "light" | "dark";
type WeekReviewHandoff = { nextWeekStart: string; reviewedWeekStart: string };

function getInitialTheme(): Theme {
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function App() {
  const [initialRoute] = useState(getInitialAppRoute);
  const [activeTab, setActiveTab] = useState<AppTab>(initialRoute.tab);
  const [planningSection, setPlanningSection] = useState<PlanningSection>(initialRoute.planningSection);
  const [progressSection, setProgressSection] = useState<ProgressSection>(initialRoute.progressSection);
  const [selectedPlanRouteId, setSelectedPlanRouteId] = useState<string | null>(initialRoute.planId);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  const [apiVersion, setApiVersion] = useState<ApiVersion | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [loginForm, setLoginForm] = useState<LoginForm>({ username: "", password: "" });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSwitchingProfile, setIsSwitchingProfile] = useState(false);
  const [weekStart, setWeekStart] = useState(initialRoute.weekStart);
  const [visibleWeekStarts, setVisibleWeekStarts] = useState(() => weekRangeAround(initialRoute.weekStart));
  const [loadingWeekStarts, setLoadingWeekStarts] = useState<Set<string>>(new Set());
  const [weekStack, setWeekStack] = useState<Record<string, TrainingWeek>>({});
  const [timelineSummary, setTimelineSummary] = useState<TrainingTimelineSummary | null>(null);
  const [activePlan, setActivePlan] = useState<TrainingPlan | null>(null);
  const [analyticsPlanning, setAnalyticsPlanning] = useState<AnalyticsPlanning | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsLookbackWeeks, setAnalyticsLookbackWeeks] = useState(12);
  const [analyticsFutureWeeks, setAnalyticsFutureWeeks] = useState(4);
  const [editor, setEditor] = useState<WorkoutForm | null>(null);
  const [goalEditor, setGoalEditor] = useState<WeekGoalForm | null>(null);
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

  const staleFrontend = apiVersion
    ? apiVersion.forceReload || compareVersions(FRONTEND_VERSION, apiVersion.frontendMinVersion) < 0
    : false;
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

  useEffect(() => {
    weekStackRef.current = weekStack;
  }, [weekStack]);

  useEffect(() => {
    weekStartRef.current = weekStart;
  }, [weekStart]);

  const loadWeeks = useCallback((starts: string[], options: { force?: boolean } = {}) => {
    const uniqueStarts = Array.from(new Set(starts.map((start) => startOfWeek(parseDate(start)))));
    const startsToFetch = options.force
      ? uniqueStarts
      : uniqueStarts.filter((start) => !weekStackRef.current[start]);
    if (!startsToFetch.length) {
      return;
    }

    setLoadingWeekStarts((current) => mergeLoadingStarts(current, startsToFetch));
    Promise.all(startsToFetch.map((weekDate) => fetchJson<TrainingWeek>(`/api/weeks/${weekDate}`)))
      .then((weeks) => {
        setWeekStack((current) => ({
          ...current,
          ...Object.fromEntries(weeks.map((loadedWeek) => [loadedWeek.weekStartDate, loadedWeek]))
        }));
        setApiError(null);
      })
      .catch((error: Error) => setApiError(error.message))
      .finally(() => {
        setLoadingWeekStarts((current) => removeLoadingStarts(current, startsToFetch));
      });
  }, []);

  const loadAnalyticsPlanning = useCallback(() => {
    setAnalyticsLoading(true);
    const params = new URLSearchParams({
      lookbackWeeks: String(analyticsLookbackWeeks),
      futureWeeks: String(analyticsFutureWeeks)
    });
    fetchJson<AnalyticsPlanning>(`/api/analytics/planning?${params.toString()}`)
      .then((body) => {
        setAnalyticsPlanning(body);
        setApiError(null);
      })
      .catch((error: Error) => setApiError(error.message))
      .finally(() => setAnalyticsLoading(false));
  }, [analyticsFutureWeeks, analyticsLookbackWeeks]);

  const recenterVisibleWeeks = useCallback((start: string, summary: TrainingTimelineSummary | null) => {
    const starts = boundedWeekRangeAround(start, summary);
    setVisibleWeekStarts(starts);
    loadWeeks(starts);
  }, [loadWeeks]);

  useEffect(() => {
    fetchJson<ApiVersion>("/api/version")
      .then((body) => {
        setApiVersion(body);
        setApiError(null);
      })
      .catch((error: Error) => {
        setApiError(error.message);
      });
  }, []);

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
    if (!session?.authenticated || !session.activeAthleteAccountId) {
      return;
    }
    clearAppData();
    const starts = weekRangeAround(weekStartRef.current);
    setVisibleWeekStarts(starts);
    loadWeeks(starts, { force: true });
    loadTrainingTimeline();
    loadActivePlan();
    loadStravaStatus();
    loadActivities();
  }, [loadWeeks, session?.activeAthleteAccountId, session?.authenticated]);

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
    function handlePopState() {
      const route = getInitialAppRoute();
      setActiveTab(route.tab);
      if (route.tab === "plan") {
        setPlanningSection(route.planningSection);
        setSelectedPlanRouteId(route.planId);
      }
      if (route.tab === "progress") {
        setProgressSection(route.progressSection);
      }
      if (route.tab === "week") {
        const starts = boundedWeekRangeAround(route.weekStart, timelineSummary);
        setVisibleWeekStarts(starts);
        loadWeeks(starts);
        setWeekStart(route.weekStart);
      }
    }

    const route = getInitialAppRoute();
    const canonicalPath = appRoutePath(route);
    if (window.location.pathname !== canonicalPath || window.location.search) {
      window.history.replaceState(route, "", canonicalPath);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [loadWeeks, timelineSummary]);

  function clearAppData() {
    setWeekStack({});
    setTimelineSummary(null);
    setActivePlan(null);
    setAnalyticsPlanning(null);
    setActivities([]);
    setStravaStatus(null);
    setLastSyncJob(null);
    setEditor(null);
    setGoalEditor(null);
    setPlanWeekDraft(null);
    setPendingPlanWeekStart(null);
    setWeekReviewHandoff(null);
    setLoadingWeekStarts(new Set());
    didApplyInitialTimelineRange.current = false;
  }

  function loadSession() {
    setSessionLoading(true);
    fetchJson<SessionStatus>("/api/auth/session/status")
      .then((body) => {
        setSession(body);
        setLoginError(null);
      })
      .catch((error: Error) => {
        setApiError(error.message);
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
      setSession(body);
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
      setSession(body);
      clearAppData();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Logout failed.");
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
      setSession(body);
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Profile switch failed.");
    } finally {
      setIsSwitchingProfile(false);
    }
  }

  function refreshSession() {
    fetchJson<SessionStatus>("/api/auth/session/status")
      .then(setSession)
      .catch((error: Error) => setApiError(error.message));
  }

  function refreshVisibleWeeks() {
    loadWeeks(mergeWeekStarts([...visibleWeekStarts, ...weekRangeAround(weekStart)]), { force: true });
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
    const route = currentRoute({ tab: "week", weekStart: normalizedStart });
    window.history.pushState(route, "", appRoutePath(route));
    setActiveTab("week");
    setWeekStart(normalizedStart);
  }

  function navigateToTab(tab: AppTab) {
    if (tab === "week") {
      selectWeek(currentWeekStart, "time-rail");
      return;
    }

    const route = currentRoute({ tab });
    window.history.pushState(route, "", appRoutePath(route));
    setActiveTab(tab);
  }

  function navigatePlanningSection(section: PlanningSection) {
    const route = currentRoute({ tab: "plan", planningSection: section });
    window.history.pushState(route, "", appRoutePath(route));
    setPlanningSection(section);
    setActiveTab("plan");
  }

  function navigateProgressSection(section: ProgressSection) {
    const route = currentRoute({ tab: "progress", progressSection: section });
    window.history.pushState(route, "", appRoutePath(route));
    setProgressSection(section);
    setActiveTab("progress");
  }

  function navigatePlan(planId: string | null) {
    const route = currentRoute({ tab: "plan", planId, planningSection: "overview" });
    window.history.pushState(route, "", appRoutePath(route));
    setSelectedPlanRouteId(planId);
    setPlanningSection("overview");
    setActiveTab("plan");
  }

  function currentRoute(overrides: Partial<AppRoute> = {}): AppRoute {
    return {
      planId: selectedPlanRouteId,
      planningSection,
      progressSection,
      tab: activeTab,
      weekStart,
      ...overrides
    };
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
    setEditor(defaultForm(plannedDate));
  }

  function openEdit(workout: Workout) {
    setEditor({
      id: workout.id,
      plannedDate: workout.plannedDate,
      title: workout.title,
      sport: workout.sport,
      workoutType: workout.workoutType,
      intensityCategory: workout.intensityCategory,
      plannedDistance: workout.plannedDistance?.toString() ?? "",
      plannedDuration: workout.plannedDuration ? String(Math.round(workout.plannedDuration / 60)) : "",
      purpose: workout.purpose,
      instructions: workout.instructions,
      notes: workout.notes,
      status: workout.status
    });
  }

  function openCreateGoal(targetWeek: TrainingWeek) {
    setGoalEditor(defaultGoalForm(targetWeek.id));
  }

  function openEditGoal(goal: WeekGoal) {
    setGoalEditor({
      id: goal.id,
      weekId: goal.trainingWeekId,
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
    if (!staleFrontend) {
      return false;
    }
    setApiError(`Reload required before ${action}.`);
    return true;
  }

  async function savePlanWeek(draft: PlanWeekDraft) {
    if (blockStaleWrite("saving the week plan")) {
      return;
    }
    if (draft.weekState === "past") {
      setApiError("Past weeks can only be completed through the read-only review flow.");
      return;
    }
    setIsSavingPlanWeek(true);
    try {
      const savedWeek = await fetchJson<TrainingWeek>(`/api/weeks/${draft.weekId}/plan`, {
        method: "PUT",
        body: JSON.stringify(planWeekDraftToPayload(draft))
      });
      setWeekStack((current) => ({
        ...current,
        [savedWeek.weekStartDate]: savedWeek
      }));
      setPlanWeekDraft(null);
      loadTrainingTimeline();
      loadAnalyticsPlanning();
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not save the week plan.");
    } finally {
      setIsSavingPlanWeek(false);
    }
  }

  async function completeWeekReview(weekId: string) {
    if (blockStaleWrite("completing the week review")) {
      return;
    }
    setIsSavingPlanWeek(true);
    try {
      const savedWeek = await fetchJson<TrainingWeek>(`/api/weeks/${weekId}/review`, {
        method: "POST"
      });
      setWeekStack((current) => ({
        ...current,
        [savedWeek.weekStartDate]: savedWeek
      }));
      setPlanWeekDraft(null);
      setWeekReviewHandoff({
        reviewedWeekStart: savedWeek.weekStartDate,
        nextWeekStart: addDays(savedWeek.weekStartDate, 7)
      });
      loadTrainingTimeline();
      loadAnalyticsPlanning();
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not complete the week review.");
    } finally {
      setIsSavingPlanWeek(false);
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

    const payload = formToPayload(editor);
    if (editor.id) {
      await fetchJson(`/api/planned-workouts/${editor.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      await fetchJson("/api/planned-workouts", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
    setEditor(null);
    refreshVisibleWeeks();
    loadTrainingTimeline();
    loadAnalyticsPlanning();
  }

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goalEditor) {
      return;
    }
    if (blockStaleWrite("saving a goal")) {
      return;
    }

    const payload = goalFormToPayload(goalEditor);
    if (goalEditor.id) {
      await fetchJson(`/api/week-goals/${goalEditor.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      await fetchJson(`/api/weeks/${goalEditor.weekId}/goals`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
    setGoalEditor(null);
    refreshVisibleWeeks();
    loadTrainingTimeline();
    loadAnalyticsPlanning();
  }

  async function deleteWorkout(workout: Workout) {
    if (blockStaleWrite("deleting a workout")) {
      return;
    }
    await fetchJson(`/api/planned-workouts/${workout.id}`, { method: "DELETE" });
    refreshVisibleWeeks();
    loadTrainingTimeline();
  }

  async function duplicateWorkout(workout: Workout) {
    if (blockStaleWrite("duplicating a workout")) {
      return;
    }
    await fetchJson(`/api/planned-workouts/${workout.id}/duplicate`, { method: "POST" });
    refreshVisibleWeeks();
    loadTrainingTimeline();
  }

  async function copyPriorWeek(targetWeek: TrainingWeek) {
    if (blockStaleWrite("copying the prior week")) {
      return;
    }
    if (
      targetWeek.workouts.length > 0 &&
      !window.confirm("Copy prior week into this week? Existing planned workouts will stay in place.")
    ) {
      return;
    }

    setCopyingPriorWeekId(targetWeek.id);
    try {
      const copiedWeek = await fetchJson<TrainingWeek>(`/api/weeks/${targetWeek.id}/copy-prior`, { method: "POST" });
      setWeekStack((current) => ({
        ...current,
        [copiedWeek.weekStartDate]: copiedWeek
      }));
      loadTrainingTimeline();
      loadAnalyticsPlanning();
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not copy the prior week.");
    } finally {
      setCopyingPriorWeekId(null);
    }
  }

  async function deriveWeekGoals(targetWeek: TrainingWeek) {
    if (blockStaleWrite("refreshing weekly goals")) {
      return;
    }
    try {
      const derivedWeek = await fetchJson<TrainingWeek>(`/api/weeks/${targetWeek.id}/goals/derive`, {
        method: "POST"
      });
      setWeekStack((current) => ({
        ...current,
        [derivedWeek.weekStartDate]: derivedWeek
      }));
      loadTrainingTimeline();
      loadAnalyticsPlanning();
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not refresh weekly goals.");
    }
  }

  function loadTrainingTimeline() {
    fetchJson<TrainingTimelineSummary>("/api/training-timeline")
      .then((body) => {
        setTimelineSummary(body);
        setApiError(null);
      })
      .catch((error: Error) => setApiError(error.message));
  }

  function loadActivePlan() {
    fetchJson<TrainingPlanSummary[]>("/api/plans")
      .then((plans) => {
        const primary =
          plans.find((plan) => plan.isCurrent) ??
          plans.find((plan) => plan.isUpcoming) ??
          plans[0] ??
          null;
        if (!primary) {
          setActivePlan(null);
          return null;
        }
        return fetchJson<TrainingPlan>(`/api/plans/${primary.id}`).then((plan) => {
          setActivePlan(plan);
          return plan;
        });
      })
      .catch((error: Error) => setApiError(error.message));
  }

  function loadStravaStatus() {
    fetchJson<StravaStatus>("/api/auth/strava/status")
      .then(setStravaStatus)
      .catch((error: Error) => setApiError(error.message));
  }

  function loadActivities() {
    fetchJson<StravaActivity[]>("/api/activities")
      .then(setActivities)
      .catch((error: Error) => setApiError(error.message));
  }

  async function runBackfill() {
    if (blockStaleWrite("syncing Strava")) {
      return;
    }
    setIsSyncing(true);
    try {
      const job = await fetchJson<SyncJob>("/api/sync/strava/backfill", {
        method: "POST",
        body: JSON.stringify({ days: 180 })
      });
      setLastSyncJob(job);
      loadActivities();
      loadStravaStatus();
      loadTrainingTimeline();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Strava sync failed.");
    } finally {
      setIsSyncing(false);
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
        isConfigured={Boolean(session?.configured)}
        isLoggingIn={isLoggingIn}
        loginError={loginError}
        setForm={setLoginForm}
        onSubmit={login}
      />
    );
  }

  return (
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
          <StatusBanner tone="warning" icon={<WifiOff size={18} />} title="Backend unreachable" detail={apiError} />
        ) : null}
        {staleFrontend ? (
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
            selectedWeekStart={weekStart}
            timelineIndex={timelineIndex}
            today={todayDateString()}
            week={week}
            reviewHandoff={weekReviewHandoff}
            weekStack={weekStack}
            weekStarts={visibleWeekStarts}
            onCreate={openCreate}
            onEdit={openEdit}
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
        {activeTab === "plan" ? (
          <PlanningWorkspace
            onChangeSection={navigatePlanningSection}
            writesBlocked={staleFrontend}
            section={planningSection}
            selectedPlanId={selectedPlanRouteId}
            onSelectPlan={navigatePlan}
            onPlanApplied={() => {
              refreshVisibleWeeks();
              loadTrainingTimeline();
              loadActivePlan();
              loadAnalyticsPlanning();
            }}
            onSelectWeek={(start) => {
              selectWeek(start, "time-rail");
            }}
          />
        ) : null}
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
            writesBlocked={staleFrontend}
            frontendVersion={FRONTEND_VERSION}
          />
        ) : null}
      </main>

      {editor ? (
        <WorkoutEditor
          editor={editor}
          setEditor={setEditor}
          onSubmit={saveWorkout}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {goalEditor ? (
        <WeekGoalEditor
          editor={goalEditor}
          setEditor={setGoalEditor}
          onSubmit={saveGoal}
          onClose={() => setGoalEditor(null)}
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
        />
      ) : null}
    </div>
  );
}

function getInitialAppRoute() {
  const fallbackWeekStart = startOfWeek(new Date());
  return parseAppRoute(window.location.pathname, window.location.search, fallbackWeekStart);
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

export default App;
