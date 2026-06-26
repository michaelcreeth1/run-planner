import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  ExternalLink,
  Link,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Route,
  Save,
  Settings,
  ShieldAlert,
  Sparkles,
  Trash2,
  WifiOff,
  X
} from "lucide-react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TrainingTimeRail } from "./components/time-rail/TrainingTimeRail";
import { WeekCommandCenter } from "./components/week/WeekCommandCenter";
import { buildWeekCommandCenterViewModel } from "./features/weekGoals/buildWeekCommandCenterViewModel";
import type { TrainingTimelineIndex, TrainingTimelineSummary } from "./hooks/useTrainingTimeline";
import { useTrainingTimeline } from "./hooks/useTrainingTimeline";

const FRONTEND_VERSION = "0.1.0";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const WEEK_STACK_RADIUS = 3;
const WEEK_STACK_LOAD_BATCH = 6;

type ApiVersion = {
  frontendMinVersion: string;
  backendVersion: string;
  schemaVersion: string;
  forceReload: boolean;
};

type Workout = {
  id: string;
  trainingWeekId: string;
  athleteAccountId: string;
  plannedDate: string;
  title: string;
  sport: "run" | "strength" | "cross_training" | "rest" | "mobility" | "other";
  workoutType:
    | "easy"
    | "recovery"
    | "long_run"
    | "medium_long"
    | "tempo"
    | "threshold"
    | "interval"
    | "hill"
    | "race"
    | "time_trial"
    | "progression"
    | "strides"
    | "strength"
    | "mobility"
    | "rest"
    | "other";
  intensityCategory: "rest" | "easy" | "moderate" | "workout" | "race" | "strength";
  plannedDistance: number | null;
  plannedDuration: number | null;
  plannedElevation: number | null;
  plannedTss: number | null;
  purpose: string;
  instructions: string;
  notes: string;
  status:
    | "planned"
    | "completed_as_planned"
    | "completed_modified"
    | "missed"
    | "moved"
    | "replaced"
    | "skipped_intentionally"
    | "partial";
};

type WeekGoalCategory = "mileage" | "sessions" | "long_run" | "quality" | "recovery" | "strength" | "custom";
type WeekGoalType = "achievement" | "guardrail";
type WeekGoalUnit = "mi" | "sessions" | "days" | "percent" | "boolean" | "custom";
type WeekGoalEvaluationMode = "at_least" | "at_most" | "range" | "exact-ish" | "boolean" | "manual";
type WeekGoalPriority = "primary" | "secondary" | "guardrail";
type WeekGoalStatus =
  | "not_started"
  | "on_track"
  | "at_risk"
  | "achieved"
  | "partially_achieved"
  | "missed"
  | "exceeded"
  | "waived";
type WeekGoalSource = "manual" | "derived_from_plan" | "template" | "ai_suggested";
type GoalSeverity = "info" | "success" | "warning" | "danger";
type WeekState = "past" | "current" | "future";

type WeekGoal = {
  id: string;
  trainingWeekId: string;
  athleteAccountId: string;
  weekStartDate: string;
  category: WeekGoalCategory;
  goalType: WeekGoalType;
  label: string;
  description: string;
  targetValue: number | null;
  minAcceptable: number | null;
  maxAcceptable: number | null;
  unit: WeekGoalUnit;
  evaluationMode: WeekGoalEvaluationMode;
  priority: WeekGoalPriority;
  status: WeekGoalStatus;
  source: WeekGoalSource;
  isEditable: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type WeekGoalEvaluation = {
  goalId: string;
  weekStartDate: string;
  status: WeekGoalStatus;
  guardrailStatus: "ok" | "warning" | "danger" | "waived" | "not_applicable" | null;
  actualValue: number | null;
  plannedValue: number | null;
  remainingPlannedValue: number | null;
  summary: string;
  detail: string | null;
  severity: GoalSeverity;
  evaluatedAt: string;
  contributingWorkoutIds: string[];
  contributingActivityIds: string[];
};

type TrainingWeek = {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  plannedMileage: number;
  actualMileage: number;
  plannedTime: number | null;
  actualTime: number | null;
  targetLongRunDistance: number | null;
  notes: string;
  workouts: Workout[];
  actualActivities: ActualActivity[];
  goals: WeekGoal[];
  goalEvaluations: WeekGoalEvaluation[];
  weekState: WeekState;
  goalReviewSummary: string;
  hardDays: number;
  longRunDistance: number;
  longRunPercentage: number;
};

type ActualActivity = {
  id: string;
  stravaActivityId: string;
  name: string;
  sportType: string;
  startDateLocal: string;
  activityDate: string;
  distance: number;
  distanceMiles: number;
  movingTime: number | null;
  averageHeartrate: number | null;
};

type StravaStatus = {
  connected: boolean;
  configured: boolean;
  athleteName: string | null;
  grantedScopes: string[];
  expiresAt: string | null;
  message: string;
};

type StravaActivity = {
  id: string;
  stravaActivityId: string;
  name: string;
  sportType: string;
  startDateLocal: string;
  distanceMiles: number;
  movingTime: number | null;
  totalElevationGain: number | null;
  averageHeartrate: number | null;
  private: boolean;
};

type SyncJob = {
  id: string;
  jobType: string;
  status: string;
  activitiesFetched: number;
  activitiesCreated: number;
  activitiesUpdated: number;
  errorMessage: string | null;
};

type WorkoutForm = {
  id?: string;
  plannedDate: string;
  title: string;
  sport: Workout["sport"];
  workoutType: Workout["workoutType"];
  intensityCategory: Workout["intensityCategory"];
  plannedDistance: string;
  plannedDuration: string;
  purpose: string;
  instructions: string;
  notes: string;
  status: Workout["status"];
};

type WeekGoalForm = {
  id?: string;
  weekId: string;
  category: WeekGoalCategory;
  goalType: WeekGoalType;
  label: string;
  description: string;
  targetValue: string;
  minAcceptable: string;
  maxAcceptable: string;
  unit: WeekGoalUnit;
  evaluationMode: WeekGoalEvaluationMode;
  priority: WeekGoalPriority;
  status: WeekGoalStatus;
  isEnabled: boolean;
};

type PlanStartingPoint = "existing" | "copy_prior" | "smart_adjustment" | "blank";
type WeekPurposeId =
  | "aerobic_build"
  | "maintain"
  | "down_week"
  | "workout_focus"
  | "long_run_focus"
  | "recovery"
  | "race_week"
  | "custom";
type AlignmentStatus = "aligned" | "mismatch";

type PlanWeekWorkoutDraft = WorkoutForm & {
  draftId: string;
};

type PlanWeekGoalDraft = WeekGoalForm & {
  draftId: string;
  source: WeekGoalSource;
  sourceLabel: string;
  qualityType?: "any" | "threshold" | "tempo" | "intervals" | "hills" | "race";
  preferredDay?: string;
  noBackToBackHardDays?: boolean;
  strengthRequired?: boolean;
  manuallyEdited?: boolean;
};

type PlanWeekDraft = {
  weekId: string;
  weekStartDate: string;
  weekEndDate: string;
  weekState: WeekState;
  startingPoint: PlanStartingPoint;
  purpose: WeekPurposeId;
  customPurpose: string;
  priorWeekStartDate: string | null;
  noPriorUsableWeek: boolean;
  load: ProposedLoad;
  workouts: PlanWeekWorkoutDraft[];
  goals: PlanWeekGoalDraft[];
  hasExistingPlan: boolean;
  mismatchAcknowledged: boolean;
};

type ProposedLoad = {
  priorMileage: number | null;
  suggestedMileage: number;
  reason: string;
};

type AlignmentItem = {
  id: string;
  label: string;
  detail: string;
  status: AlignmentStatus;
};

const tabs = [
  { id: "week", label: "Week", icon: CalendarDays },
  { id: "plan", label: "Plan", icon: Route },
  { id: "activities", label: "Activities", icon: Activity },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings }
] as const;

const workoutTypes: Array<{ value: Workout["workoutType"]; label: string }> = [
  { value: "easy", label: "Easy" },
  { value: "recovery", label: "Recovery" },
  { value: "long_run", label: "Long run" },
  { value: "medium_long", label: "Medium-long" },
  { value: "tempo", label: "Tempo" },
  { value: "threshold", label: "Threshold" },
  { value: "interval", label: "Interval" },
  { value: "hill", label: "Hill" },
  { value: "strength", label: "Strength" },
  { value: "rest", label: "Rest" },
  { value: "other", label: "Other" }
];

const intensities: Array<{ value: Workout["intensityCategory"]; label: string }> = [
  { value: "rest", label: "Rest" },
  { value: "easy", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "workout", label: "Workout" },
  { value: "race", label: "Race" },
  { value: "strength", label: "Strength" }
];

const goalCategories: Array<{ value: WeekGoalCategory; label: string }> = [
  { value: "mileage", label: "Mileage" },
  { value: "sessions", label: "Sessions" },
  { value: "long_run", label: "Long run" },
  { value: "quality", label: "Quality" },
  { value: "recovery", label: "Recovery" },
  { value: "strength", label: "Strength" },
  { value: "custom", label: "Custom" }
];

const goalUnits: Array<{ value: WeekGoalUnit; label: string }> = [
  { value: "mi", label: "Miles" },
  { value: "sessions", label: "Sessions" },
  { value: "days", label: "Days" },
  { value: "percent", label: "Percent" },
  { value: "boolean", label: "Yes/no" },
  { value: "custom", label: "Custom" }
];

const goalEvaluationModes: Array<{ value: WeekGoalEvaluationMode; label: string }> = [
  { value: "range", label: "Range" },
  { value: "at_least", label: "At least" },
  { value: "at_most", label: "At most" },
  { value: "exact-ish", label: "Exact-ish" },
  { value: "boolean", label: "Yes/no" },
  { value: "manual", label: "Manual" }
];

const goalStatuses: Array<{ value: WeekGoalStatus; label: string }> = [
  { value: "not_started", label: "Not started" },
  { value: "on_track", label: "On track" },
  { value: "at_risk", label: "At risk" },
  { value: "achieved", label: "Achieved" },
  { value: "partially_achieved", label: "Partial" },
  { value: "missed", label: "Missed" },
  { value: "exceeded", label: "Exceeded" },
  { value: "waived", label: "Waived" }
];

const weekPurposes: Array<{
  value: WeekPurposeId;
  label: string;
  meaning: string;
  loadDirection: string;
}> = [
  {
    value: "aerobic_build",
    label: "Aerobic build",
    meaning: "Increase load slightly while keeping the week controlled.",
    loadDirection: "Increase slightly"
  },
  {
    value: "maintain",
    label: "Maintain",
    meaning: "Keep load similar to the previous week.",
    loadDirection: "Hold steady"
  },
  {
    value: "down_week",
    label: "Down week",
    meaning: "Reduce volume and protect recovery.",
    loadDirection: "Decrease"
  },
  {
    value: "workout_focus",
    label: "Workout focus",
    meaning: "Preserve quality without increasing total stress.",
    loadDirection: "Hold steady or slight decrease"
  },
  {
    value: "long_run_focus",
    label: "Long-run focus",
    meaning: "Prioritize the long run while keeping total weekly load reasonable.",
    loadDirection: "Hold steady, shift emphasis"
  },
  {
    value: "recovery",
    label: "Recovery",
    meaning: "Lower load and avoid hard training.",
    loadDirection: "Decrease significantly"
  },
  {
    value: "race_week",
    label: "Race week",
    meaning: "Reduce training load and treat the race as the key session.",
    loadDirection: "Taper/decrease"
  },
  {
    value: "custom",
    label: "Custom",
    meaning: "Define the purpose manually.",
    loadDirection: "User chooses"
  }
];

type TabId = (typeof tabs)[number]["id"];
type WeekSelectSource = "header" | "time-rail" | "week-stack";
type MileageTrendDirection = "up" | "down" | "same";
type MileageTrend = {
  direction: MileageTrendDirection;
  delta: number;
};

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("week");
  const [apiVersion, setApiVersion] = useState<ApiVersion | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(getInitialWeekStart);
  const [visibleWeekStarts, setVisibleWeekStarts] = useState(() => weekRangeAround(getInitialWeekStart()));
  const [loadingWeekStarts, setLoadingWeekStarts] = useState<Set<string>>(new Set());
  const [weekStack, setWeekStack] = useState<Record<string, TrainingWeek>>({});
  const [timelineSummary, setTimelineSummary] = useState<TrainingTimelineSummary | null>(null);
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
  const mainRef = useRef<HTMLElement | null>(null);
  const pendingPrependScroll = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const isPrependingWeeks = useRef(false);
  const isAppendingWeeks = useRef(false);
  const didApplyInitialTimelineRange = useRef(false);

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
    loadWeeks(visibleWeekStarts);
    loadTrainingTimeline();
    loadStravaStatus();
    loadActivities();
  }, []);

  useEffect(() => {
    if (!timelineSummary || didApplyInitialTimelineRange.current) {
      return;
    }

    didApplyInitialTimelineRange.current = true;
    recenterVisibleWeeks(weekStart, timelineSummary);
  }, [timelineSummary]);

  useEffect(() => {
    function handlePopState() {
      const nextWeekStart = getWeekStartFromLocation();
      setVisibleWeekStarts(boundedWeekRangeAround(nextWeekStart, timelineSummary));
      loadWeeks(boundedWeekRangeAround(nextWeekStart, timelineSummary));
      setWeekStart(nextWeekStart);
    }

    ensureWeekRoute(weekStart);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [timelineSummary]);

  function loadWeeks(starts: string[], options: { force?: boolean } = {}) {
    const uniqueStarts = Array.from(new Set(starts.map((start) => startOfWeek(parseDate(start)))));
    const startsToFetch = options.force ? uniqueStarts : uniqueStarts.filter((start) => !weekStack[start]);
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
  }

  function refreshVisibleWeeks() {
    loadWeeks(mergeWeekStarts([...visibleWeekStarts, ...weekRangeAround(weekStart)]), { force: true });
  }

  function selectWeek(start: string, _source: WeekSelectSource = "week-stack") {
    const normalizedStart = startOfWeek(parseDate(start));
    if (normalizedStart === weekStart) {
      return;
    }
    if (_source === "week-stack") {
      setVisibleWeekStarts((current) => mergeWeekStarts([...current, normalizedStart]));
      loadWeeks([normalizedStart]);
    } else {
      recenterVisibleWeeks(normalizedStart, timelineSummary);
    }
    window.history.pushState({ weekStart: normalizedStart }, "", weekPath(normalizedStart));
    setWeekStart(normalizedStart);
  }

  function jumpToThisWeek() {
    selectWeek(currentWeekStart, "time-rail");
  }

  function recenterVisibleWeeks(start: string, summary: TrainingTimelineSummary | null) {
    const starts = boundedWeekRangeAround(start, summary);
    setVisibleWeekStarts(starts);
    loadWeeks(starts);
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

  async function savePlanWeek(draft: PlanWeekDraft) {
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
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not save the week plan.");
    } finally {
      setIsSavingPlanWeek(false);
    }
  }

  async function saveWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) {
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
  }

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goalEditor) {
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
  }

  async function deleteWorkout(workout: Workout) {
    await fetchJson(`/api/planned-workouts/${workout.id}`, { method: "DELETE" });
    refreshVisibleWeeks();
    loadTrainingTimeline();
  }

  async function duplicateWorkout(workout: Workout) {
    await fetchJson(`/api/planned-workouts/${workout.id}/duplicate`, { method: "POST" });
    refreshVisibleWeeks();
    loadTrainingTimeline();
  }

  async function copyPriorWeek(targetWeek: TrainingWeek) {
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
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not copy the prior week.");
    } finally {
      setCopyingPriorWeekId(null);
    }
  }

  async function deriveWeekGoals(targetWeek: TrainingWeek) {
    try {
      const derivedWeek = await fetchJson<TrainingWeek>(`/api/weeks/${targetWeek.id}/goals/derive`, {
        method: "POST"
      });
      setWeekStack((current) => ({
        ...current,
        [derivedWeek.weekStartDate]: derivedWeek
      }));
      loadTrainingTimeline();
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
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={activeTab === tab.id ? "active" : ""}
                type="button"
                onClick={() => setActiveTab(tab.id)}
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
            canLoadNewerWeeks={canLoadNewerWeeks}
            canLoadOlderWeeks={canLoadOlderWeeks}
            isLoading={isLoadingWeek}
            onJumpToThisWeek={jumpToThisWeek}
            onLoadNewerWeeks={appendNewerWeeks}
            onLoadOlderWeeks={prependOlderWeeks}
            onSelectTimeWeek={(start) => selectWeek(start, "time-rail")}
            onSelectWeek={(start) => selectWeek(start, "week-stack")}
            selectedWeekStart={weekStart}
            timelineIndex={timelineIndex}
            week={week}
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
        {activeTab === "plan" ? <Placeholder title="Plan" icon={<Sparkles size={22} />} /> : null}
        {activeTab === "activities" ? <ActivitiesView activities={activities} /> : null}
        {activeTab === "analytics" ? <Placeholder title="Analytics" icon={<BarChart3 size={22} />} /> : null}
        {activeTab === "settings" ? (
          <SettingsView
            apiVersion={apiVersion}
            isSyncing={isSyncing}
            lastSyncJob={lastSyncJob}
            onBackfill={runBackfill}
            onRefreshActivities={loadActivities}
            onRefreshStatus={loadStravaStatus}
            stravaStatus={stravaStatus}
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
          onSave={savePlanWeek}
        />
      ) : null}
    </div>
  );
}

function WeekView({
  canLoadNewerWeeks,
  canLoadOlderWeeks,
  isLoading,
  onJumpToThisWeek,
  onLoadNewerWeeks,
  onLoadOlderWeeks,
  onSelectTimeWeek,
  onSelectWeek,
  selectedWeekStart,
  timelineIndex,
  week,
  weekStack,
  weekStarts,
  onCreate,
  onEdit,
  onDelete,
  onDuplicate,
  onCreateGoal,
  onCopyPriorWeek,
  onDeriveWeekGoals,
  onEditGoal,
  onOpenPlanWeek,
  onSync,
  copyingPriorWeekId
}: {
  canLoadNewerWeeks: boolean;
  canLoadOlderWeeks: boolean;
  isLoading: boolean;
  onJumpToThisWeek: () => void;
  onLoadNewerWeeks: () => void;
  onLoadOlderWeeks: () => void;
  onSelectTimeWeek: (weekStart: string) => void;
  onSelectWeek: (weekStart: string) => void;
  selectedWeekStart: string;
  timelineIndex: TrainingTimelineIndex;
  week: TrainingWeek | null;
  weekStack: Record<string, TrainingWeek>;
  weekStarts: string[];
  onCreate: (plannedDate: string) => void;
  onEdit: (workout: Workout) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
  onCreateGoal: (week: TrainingWeek) => void;
  onCopyPriorWeek: (week: TrainingWeek) => void;
  onDeriveWeekGoals: (week: TrainingWeek) => void;
  onEditGoal: (goal: WeekGoal) => void;
  onOpenPlanWeek: (week: TrainingWeek) => void;
  onSync: () => void;
  copyingPriorWeekId: string | null;
}) {
  const newerWeeksSentinelRef = useRef<HTMLDivElement | null>(null);
  const olderWeeksSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = olderWeeksSentinelRef.current;
    const root = sentinel?.closest("main");
    if (!sentinel || !(root instanceof HTMLElement) || !canLoadOlderWeeks) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadOlderWeeks();
        }
      },
      {
        root,
        rootMargin: "520px 0px 0px",
        threshold: 0
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadOlderWeeks, onLoadOlderWeeks]);

  useEffect(() => {
    const sentinel = newerWeeksSentinelRef.current;
    const root = sentinel?.closest("main");
    if (!sentinel || !(root instanceof HTMLElement) || !canLoadNewerWeeks) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadNewerWeeks();
        }
      },
      {
        root,
        rootMargin: "0px 0px 520px",
        threshold: 0
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadNewerWeeks, onLoadNewerWeeks]);

  return (
    <section className="week-stack-layout" aria-busy={isLoading}>
      <section className="week-timeline" aria-label="Training week timeline">
        <div className="week-stack-sentinel" aria-hidden="true" ref={olderWeeksSentinelRef} />
        {weekStarts.map((start) => (
          <WeekRow
            key={start}
            isExpanded={start === selectedWeekStart}
            isLoading={isLoading && start === selectedWeekStart}
            onCreate={onCreate}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onCreateGoal={onCreateGoal}
            onCopyPriorWeek={onCopyPriorWeek}
            onDeriveWeekGoals={onDeriveWeekGoals}
            onEditGoal={onEditGoal}
            onOpenPlanWeek={onOpenPlanWeek}
            onSync={onSync}
            isCopyingPriorWeek={(start === selectedWeekStart ? week : weekStack[start])?.id === copyingPriorWeekId}
            onSelectWeek={onSelectWeek}
            selectedWeekStart={selectedWeekStart}
            previousWeek={weekStack[addDays(start, -7)]}
            week={start === selectedWeekStart ? week : weekStack[start]}
            weekStart={start}
          />
        ))}
        <div className="week-stack-sentinel" aria-hidden="true" ref={newerWeeksSentinelRef} />
      </section>

      <TrainingTimeRail
        index={timelineIndex}
        onJumpToThisWeek={onJumpToThisWeek}
        onSelectWeek={onSelectTimeWeek}
      />
    </section>
  );
}

function WeekRow({
  isExpanded,
  isLoading,
  onCreate,
  onDelete,
  onDuplicate,
  onEdit,
  onCreateGoal,
  onCopyPriorWeek,
  onDeriveWeekGoals,
  onEditGoal,
  onOpenPlanWeek,
  onSync,
  isCopyingPriorWeek,
  onSelectWeek,
  selectedWeekStart,
  previousWeek,
  week,
  weekStart
}: {
  isExpanded: boolean;
  isLoading: boolean;
  onCreate: (plannedDate: string) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
  onEdit: (workout: Workout) => void;
  onCreateGoal: (week: TrainingWeek) => void;
  onCopyPriorWeek: (week: TrainingWeek) => void;
  onDeriveWeekGoals: (week: TrainingWeek) => void;
  onEditGoal: (goal: WeekGoal) => void;
  onOpenPlanWeek: (week: TrainingWeek) => void;
  onSync: () => void;
  isCopyingPriorWeek: boolean;
  onSelectWeek: (weekStart: string) => void;
  selectedWeekStart: string;
  previousWeek?: TrainingWeek;
  week?: TrainingWeek | null;
  weekStart: string;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previousHeight = useRef<number | null>(null);
  const isPast = weekStart < selectedWeekStart;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) {
      return;
    }

    const nextHeight = content.getBoundingClientRect().height;
    const startHeight = previousHeight.current;
    const reduceMotion = prefersReducedMotion();

    if (startHeight !== null && Math.abs(startHeight - nextHeight) > 1 && !reduceMotion) {
      frame.style.height = `${startHeight}px`;
      frame.style.overflow = "hidden";
      window.requestAnimationFrame(() => {
        frame.style.height = `${nextHeight}px`;
      });

      const finish = window.setTimeout(() => {
        frame.style.height = "auto";
        frame.style.overflow = "visible";
      }, 240);

      previousHeight.current = nextHeight;
      return () => window.clearTimeout(finish);
    }

    frame.style.height = "auto";
    frame.style.overflow = "visible";
    previousHeight.current = nextHeight;
  }, [isExpanded, isLoading, week]);

  useEffect(() => {
    if (!isExpanded || !frameRef.current) {
      return;
    }

    const frame = frameRef.current;
    const scrollFrame = window.requestAnimationFrame(() => {
      scrollExpandedWeekIntoView(frame);
    });

    return () => window.cancelAnimationFrame(scrollFrame);
  }, [isExpanded, weekStart]);

  return (
    <div
      className={`week-row ${isExpanded ? "week-row--expanded" : ""}`}
      data-week-start={weekStart}
      data-testid="week-row"
      ref={frameRef}
    >
      <div className="week-row-content" ref={contentRef}>
        {isExpanded ? (
          <ExpandedWeekBoard
            days={Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))}
            isLoading={!week}
            onCreate={onCreate}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onCreateGoal={onCreateGoal}
            onCopyPriorWeek={onCopyPriorWeek}
            onDeriveWeekGoals={onDeriveWeekGoals}
            onEditGoal={onEditGoal}
            onOpenPlanWeek={onOpenPlanWeek}
            onSync={onSync}
            isCopyingPriorWeek={isCopyingPriorWeek}
            week={week ?? null}
            weekStart={weekStart}
          />
        ) : (
          <CollapsedWeekCard
            onSelectWeek={onSelectWeek}
            previousWeek={previousWeek}
            tone={isPast ? "past" : "future"}
            week={week ?? undefined}
            weekStart={weekStart}
          />
        )}
      </div>
    </div>
  );
}

function CollapsedWeekCard({
  onSelectWeek,
  previousWeek,
  tone,
  week,
  weekStart
}: {
  onSelectWeek: (weekStart: string) => void;
  previousWeek?: TrainingWeek;
  tone: "past" | "future";
  week?: TrainingWeek;
  weekStart: string;
}) {
  const range = week ? formatCompactWeekRange(week.weekStartDate, week.weekEndDate) : formatCompactWeekRangeFromStart(weekStart);
  const mileageSummary = formatCollapsedMileageSummary(week, weekStart, tone);
  const mileageTrend = getCollapsedMileageTrend(week, previousWeek);
  const detail = formatCollapsedWeekDetail(week, tone);
  const dayBadges = collapsedWeekDayBadges(week, weekStart);
  const dailySummary = dayBadges.map((badge) => `${formatWeekday(badge.date)} ${badge.label}`).join(", ");
  const trendSummary = mileageTrend ? `, ${formatMileageTrendAriaLabel(mileageTrend)}` : "";

  return (
    <button
      className={`week-preview-card ${tone}`}
      data-testid="week-preview-card"
      data-week-start={weekStart}
      type="button"
      aria-label={`Go to week ${range}, ${dailySummary}, ${mileageSummary}${trendSummary}, ${detail}`}
      onClick={() => onSelectWeek(weekStart)}
    >
      <span className="week-peek-range">{range}</span>
      <span className="week-peek-days" aria-hidden="true">
        {dayBadges.map((badge) => (
          <span className={`week-peek-day-badge ${badge.kind}`} key={badge.date} title={badge.title}>
            {badge.label}
          </span>
        ))}
      </span>
      <small className="week-peek-summary">
        <span>{mileageSummary}</span>
        <MileageTrendBadge compact trend={mileageTrend} />
      </small>
      <ChevronRight className="week-peek-icon" size={16} aria-hidden="true" />
    </button>
  );
}

function ExpandedWeekBoard({
  days,
  isLoading,
  week,
  weekStart,
  onCreate,
  onEdit,
  onDelete,
  onDuplicate,
  onCreateGoal,
  onCopyPriorWeek,
  onDeriveWeekGoals,
  onEditGoal,
  onOpenPlanWeek,
  onSync,
  isCopyingPriorWeek,
}: {
  days: string[];
  isLoading?: boolean;
  week: TrainingWeek | null;
  weekStart: string;
  onCreate: (plannedDate: string) => void;
  onEdit: (workout: Workout) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
  onCreateGoal: (week: TrainingWeek) => void;
  onCopyPriorWeek: (week: TrainingWeek) => void;
  onDeriveWeekGoals: (week: TrainingWeek) => void;
  onEditGoal: (goal: WeekGoal) => void;
  onOpenPlanWeek: (week: TrainingWeek) => void;
  onSync: () => void;
  isCopyingPriorWeek: boolean;
}) {
  const workouts = week?.workouts ?? [];
  const actualActivities = week?.actualActivities ?? [];
  const today = todayDateString();

  if (isLoading) {
    return (
      <div
        className="expanded-week-board expanded-week-board--loading"
        aria-label={`Loading ${formatWeekRangeFromStart(weekStart)}`}
      >
        <section className="week-command-center" aria-label="Loading week command center">
          <header className="week-command-header">
            <div className="week-command-title">
              <p className="eyebrow">Training week</p>
              <h1>{formatWeekRangeFromStart(weekStart)}</h1>
              <span>Loading week</span>
            </div>
          </header>
          <ExpandedWeekSkeletonOverview />
        </section>
        <ExpandedWeekSkeleton days={days} />
      </div>
    );
  }

  return (
    <WeekSlate
      actualActivities={actualActivities}
      days={days}
      onCopyPriorWeek={onCopyPriorWeek}
      onCreate={onCreate}
      onCreateGoal={onCreateGoal}
      onDelete={onDelete}
      onDeriveWeekGoals={onDeriveWeekGoals}
      onDuplicate={onDuplicate}
      onEdit={onEdit}
      onEditGoal={onEditGoal}
      onOpenPlanWeek={onOpenPlanWeek}
      onSync={onSync}
      today={today}
      week={week}
      workouts={workouts}
    />
  );
}

function WeekSlate({
  actualActivities,
  days,
  onCopyPriorWeek,
  onCreate,
  onCreateGoal,
  onDelete,
  onDeriveWeekGoals,
  onDuplicate,
  onEdit,
  onEditGoal,
  onOpenPlanWeek,
  onSync,
  today,
  week,
  workouts
}: {
  actualActivities: ActualActivity[];
  days: string[];
  onCopyPriorWeek: (week: TrainingWeek) => void;
  onCreate: (plannedDate: string) => void;
  onCreateGoal: (week: TrainingWeek) => void;
  onDelete: (workout: Workout) => void;
  onDeriveWeekGoals: (week: TrainingWeek) => void;
  onDuplicate: (workout: Workout) => void;
  onEdit: (workout: Workout) => void;
  onEditGoal: (goal: WeekGoal) => void;
  onOpenPlanWeek: (week: TrainingWeek) => void;
  onSync: () => void;
  today: string;
  week: TrainingWeek | null | undefined;
  workouts: Workout[];
}) {
  if (!week) {
    return <div className="expanded-week-board" />;
  }

  const viewModel = buildWeekCommandCenterViewModel({ week, today });

  return (
    <section className={`expanded-week-board week-slate week-slate--${viewModel.mode}`} aria-label="Selected training week">
      <WeekCommandCenter
        viewModel={viewModel}
        onAction={(actionId) =>
          handleWeekCommandAction(actionId, {
            onCopyPriorWeek,
            onCreateGoal,
            onDeriveWeekGoals,
            onEditGoal,
            onOpenPlanWeek,
            onSync,
            week
          })
        }
        onEditGoal={(goalId) => {
          const goal = week.goals.find((candidate) => candidate.id === goalId);
          if (goal) {
            onOpenPlanWeek(week);
          }
        }}
      />

      {!viewModel.isUnplanned ? (
        <WeekSchedule
          actualActivities={actualActivities}
          days={days}
          onCreate={onCreate}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onEdit={onEdit}
          today={today}
          workouts={workouts}
        />
      ) : null}
    </section>
  );
}

function WeekSchedule({
  actualActivities,
  days,
  onCreate,
  onDelete,
  onDuplicate,
  onEdit,
  today,
  workouts
}: {
  actualActivities: ActualActivity[];
  days: string[];
  onCreate: (plannedDate: string) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
  onEdit: (workout: Workout) => void;
  today: string;
  workouts: Workout[];
}) {
  return (
    <section className="week-schedule-panel" aria-label="Weekly schedule">
      <header>
        <div>
          <span>Schedule</span>
        </div>
      </header>
      <div className="week-board">
        {days.map((dateValue) => {
          const dayWorkouts = workouts.filter((workout) => workout.plannedDate === dateValue);
          const dayActuals = actualActivities.filter((activity) => activity.activityDate === dateValue);
          const isEmpty = dayWorkouts.length === 0 && dayActuals.length === 0;
          return (
            <article className={`day-column ${dayColumnClass(dayWorkouts, dayActuals, isEmpty)}`} key={dateValue}>
              <header>
                <div>
                  <span>{formatWeekdayShort(dateValue)}</span>
                  <strong>{formatDayNumber(dateValue)}</strong>
                </div>
                <button type="button" title="Add workout" onClick={() => onCreate(dateValue)}>
                  <Plus size={15} />
                </button>
              </header>
              <div className="workout-stack">
                {dayActuals.map((activity) => (
                  <ActualActivityItem activity={activity} key={activity.id} />
                ))}
                {dayWorkouts.map((workout) => (
                  <WorkoutItem
                    key={workout.id}
                    workout={workout}
                    onDelete={onDelete}
                    onDuplicate={onDuplicate}
                    onEdit={onEdit}
                  />
                ))}
                {isEmpty && dateValue < today ? (
                  <span className="empty-day-action empty-day-action--static">Rest</span>
                ) : null}
                {isEmpty && dateValue >= today ? (
                  <button className="empty-day-action" type="button" onClick={() => onCreate(dateValue)}>
                    Add session
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function handleWeekCommandAction(
  actionId: string,
  {
    onCopyPriorWeek,
    onCreateGoal,
    onDeriveWeekGoals,
    onEditGoal,
    onOpenPlanWeek,
    onSync,
    week
  }: {
    onCopyPriorWeek: (week: TrainingWeek) => void;
    onCreateGoal: (week: TrainingWeek) => void;
    onDeriveWeekGoals: (week: TrainingWeek) => void;
    onEditGoal: (goal: WeekGoal) => void;
    onOpenPlanWeek: (week: TrainingWeek) => void;
    onSync: () => void;
    week: TrainingWeek;
  }
) {
  if (["plan_week", "edit_plan", "adjust_rest", "review_week", "edit_goals"].includes(actionId)) {
    onOpenPlanWeek(week);
    return;
  }
  if (actionId === "copy_prior") {
    onCopyPriorWeek(week);
    return;
  }
  if (actionId === "set_goals") {
    if (week.goals.length) {
      onCreateGoal(week);
    } else {
      onDeriveWeekGoals(week);
    }
    return;
  }
  if (actionId === "sync") {
    onSync();
  }
}

function ExpandedWeekSkeletonOverview() {
  return (
    <>
      <div className="week-command-intent" aria-hidden="true">
        <div className="command-skeleton-block" />
        <div className="command-skeleton-block" />
      </div>
      <div className="week-command-stats" aria-hidden="true">
        {["Target", "Schedule", "Quality", "Long run"].map((label) => (
          <div className="week-command-stat command-skeleton-block" key={label} />
        ))}
      </div>
    </>
  );
}

function ExpandedWeekSkeleton({ days }: { days: string[] }) {
  return (
    <>
      <section className="week-board" aria-label="Loading weekly planning board">
        {days.map((dateValue) => (
          <article className="day-column day-column--skeleton" key={dateValue}>
            <header>
              <div>
                <strong>{formatWeekday(dateValue)}</strong>
                <span>{formatShortDate(dateValue)}</span>
              </div>
            </header>
            <div className="workout-stack">
              <div className="skeleton-card" />
            </div>
            <footer>&nbsp;</footer>
          </article>
        ))}
      </section>
    </>
  );
}

function ActualActivityItem({ activity }: { activity: ActualActivity }) {
  return (
    <div className="actual-item">
      <span className="workout-kind">Actual</span>
      <strong>{activity.name}</strong>
      <p className="workout-meta">
        {formatNumber(activity.distanceMiles)} mi · {formatPace(activity.movingTime, activity.distanceMiles)}
      </p>
      <small>{activity.averageHeartrate ? `${Math.round(activity.averageHeartrate)} bpm` : formatTime(activity.startDateLocal)}</small>
      <div className="activity-controls">
        <button type="button" title="View activity on Strava" onClick={() => openStravaActivity(activity)}>
          <ExternalLink size={15} />
        </button>
      </div>
    </div>
  );
}

function WorkoutItem({
  workout,
  onEdit,
  onDelete,
  onDuplicate
}: {
  workout: Workout;
  onEdit: (workout: Workout) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
}) {
  return (
    <div
      className={`workout-item ${workout.intensityCategory} ${workout.workoutType.replaceAll("_", "-")}`}
      onClick={() => onEdit(workout)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit(workout);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="workout-title-row">
        <span className="workout-kind">{labelForWorkoutType(workout.workoutType)}</span>
        <strong>{workout.title}</strong>
      </div>
      <p className="workout-meta">{formatWorkoutMeta(workout)}</p>
      <small>{workout.status.replaceAll("_", " ")}</small>
      <div
        className="workout-controls"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button type="button" title="Edit workout" onClick={() => onEdit(workout)}>
          <Edit3 size={15} />
        </button>
        <button type="button" title="Duplicate workout" onClick={() => onDuplicate(workout)}>
          <Copy size={15} />
        </button>
        <button type="button" title="Delete workout" onClick={() => onDelete(workout)}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

function WorkoutEditor({
  editor,
  setEditor,
  onSubmit,
  onClose
}: {
  editor: WorkoutForm;
  setEditor: (editor: WorkoutForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="editor-backdrop">
      <aside className="editor-panel" aria-label="Workout editor">
        <header>
          <h2>{editor.id ? "Edit workout" : "New workout"}</h2>
          <button type="button" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <form onSubmit={onSubmit}>
          <label>
            <span>Date</span>
            <input
              type="date"
              value={editor.plannedDate}
              onChange={(event) => setEditor({ ...editor, plannedDate: event.target.value })}
            />
          </label>
          <label>
            <span>Title</span>
            <input
              required
              value={editor.title}
              onChange={(event) => setEditor({ ...editor, title: event.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              <span>Type</span>
              <select
                value={editor.workoutType}
                onChange={(event) =>
                  setEditor({ ...editor, workoutType: event.target.value as Workout["workoutType"] })
                }
              >
                {workoutTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Intensity</span>
              <select
                value={editor.intensityCategory}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    intensityCategory: event.target.value as Workout["intensityCategory"]
                  })
                }
              >
                {intensities.map((intensity) => (
                  <option key={intensity.value} value={intensity.value}>
                    {intensity.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              <span>Miles</span>
              <input
                min="0"
                step="0.1"
                type="number"
                value={editor.plannedDistance}
                onChange={(event) => setEditor({ ...editor, plannedDistance: event.target.value })}
              />
            </label>
            <label>
              <span>Minutes</span>
              <input
                min="0"
                step="1"
                type="number"
                value={editor.plannedDuration}
                onChange={(event) => setEditor({ ...editor, plannedDuration: event.target.value })}
              />
            </label>
          </div>
          <label>
            <span>Purpose</span>
            <input
              value={editor.purpose}
              onChange={(event) => setEditor({ ...editor, purpose: event.target.value })}
            />
          </label>
          <label>
            <span>Instructions</span>
            <textarea
              rows={4}
              value={editor.instructions}
              onChange={(event) => setEditor({ ...editor, instructions: event.target.value })}
            />
          </label>
          <label>
            <span>Notes</span>
            <textarea
              rows={3}
              value={editor.notes}
              onChange={(event) => setEditor({ ...editor, notes: event.target.value })}
            />
          </label>
          <div className="editor-actions">
            <button className="primary" type="submit">
              <Save size={17} />
              <span>Save</span>
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function WeekGoalEditor({
  editor,
  setEditor,
  onSubmit,
  onClose
}: {
  editor: WeekGoalForm;
  setEditor: (editor: WeekGoalForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="editor-backdrop">
      <aside className="editor-panel" aria-label="Weekly goal editor">
        <header>
          <h2>{editor.id ? "Edit goal" : "New goal"}</h2>
          <button type="button" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="form-grid">
            <label>
              <span>Category</span>
              <select
                value={editor.category}
                onChange={(event) => setEditor({ ...editor, category: event.target.value as WeekGoalCategory })}
              >
                {goalCategories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Type</span>
              <select
                value={editor.goalType}
                onChange={(event) => setEditor({ ...editor, goalType: event.target.value as WeekGoalType })}
              >
                <option value="achievement">Achievement</option>
                <option value="guardrail">Guardrail</option>
              </select>
            </label>
          </div>
          <label>
            <span>Label</span>
            <input
              required
              value={editor.label}
              onChange={(event) => setEditor({ ...editor, label: event.target.value })}
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              rows={3}
              value={editor.description}
              onChange={(event) => setEditor({ ...editor, description: event.target.value })}
            />
          </label>
          <div className="form-grid form-grid--three">
            <label>
              <span>Min</span>
              <input
                step="0.1"
                type="number"
                value={editor.minAcceptable}
                onChange={(event) => setEditor({ ...editor, minAcceptable: event.target.value })}
              />
            </label>
            <label>
              <span>Target</span>
              <input
                step="0.1"
                type="number"
                value={editor.targetValue}
                onChange={(event) => setEditor({ ...editor, targetValue: event.target.value })}
              />
            </label>
            <label>
              <span>Max</span>
              <input
                step="0.1"
                type="number"
                value={editor.maxAcceptable}
                onChange={(event) => setEditor({ ...editor, maxAcceptable: event.target.value })}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              <span>Unit</span>
              <select
                value={editor.unit}
                onChange={(event) => setEditor({ ...editor, unit: event.target.value as WeekGoalUnit })}
              >
                {goalUnits.map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Evaluation</span>
              <select
                value={editor.evaluationMode}
                onChange={(event) =>
                  setEditor({ ...editor, evaluationMode: event.target.value as WeekGoalEvaluationMode })
                }
              >
                {goalEvaluationModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              <span>Priority</span>
              <select
                value={editor.priority}
                onChange={(event) => setEditor({ ...editor, priority: event.target.value as WeekGoalPriority })}
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
                <option value="guardrail">Guardrail</option>
              </select>
            </label>
            <label>
              <span>Status</span>
              <select
                value={editor.status}
                onChange={(event) => setEditor({ ...editor, status: event.target.value as WeekGoalStatus })}
              >
                {goalStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="checkbox-row">
            <input
              checked={editor.isEnabled}
              type="checkbox"
              onChange={(event) => setEditor({ ...editor, isEnabled: event.target.checked })}
            />
            <span>Enabled</span>
          </label>
          <div className="editor-actions">
            <button className="primary" type="submit">
              <Save size={17} />
              <span>Save</span>
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function PlanWeekDrawer({
  draft,
  isSaving,
  onClose,
  onSave,
  setDraft,
  weekStack
}: {
  draft: PlanWeekDraft;
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: PlanWeekDraft) => void;
  setDraft: Dispatch<SetStateAction<PlanWeekDraft | null>>;
  weekStack: Record<string, TrainingWeek>;
}) {
  const alignment = evaluatePlanAlignment(draft);
  const mismatches = alignment.filter((item) => item.status === "mismatch");
  const achievementGoals = draft.goals.filter((goal) => goal.goalType === "achievement");
  const detailedAchievementGoals = achievementGoals.filter((goal) => !["mileage", "quality"].includes(goal.category));
  const guardrailGoals = draft.goals.filter((goal) => goal.goalType === "guardrail");
  const scheduledMileage = sumDraftRunDistance(draft.workouts);
  const scheduledQuality = countDraftHardSessions(draft.workouts);
  const purpose = weekPurposes.find((option) => option.value === draft.purpose) ?? weekPurposes[0];
  const drawerTitle =
    draft.weekState === "past"
      ? "Review week"
      : draft.weekState === "current"
      ? "Adjust rest of week"
      : draft.hasExistingPlan
      ? "Edit plan"
      : "Plan week";
  const canSave = !mismatches.length || draft.mismatchAcknowledged;

  function updateDraft(updater: (current: PlanWeekDraft) => PlanWeekDraft) {
    setDraft((current) => (current ? updater(current) : current));
  }

  function replaceFromStartingPoint(startingPoint: PlanStartingPoint) {
    updateDraft((current) => rebuildPlanWeekDraftForStartingPoint(current, startingPoint, weekStack));
  }

  function updatePurpose(purposeValue: WeekPurposeId) {
    updateDraft((current) => {
      const nextLoad = suggestLoad(current.load.priorMileage, purposeValue, current.workouts);
      return {
        ...current,
        purpose: purposeValue,
        load: nextLoad,
        mismatchAcknowledged: false
      };
    });
  }

  function updateGoal(goalDraftId: string, updates: Partial<PlanWeekGoalDraft>) {
    updateDraft((current) => ({
      ...current,
      goals: current.goals.map((goal) =>
        goal.draftId === goalDraftId
          ? { ...goal, ...updates, manuallyEdited: true, source: "manual", sourceLabel: "Edited" }
          : goal
      ),
      mismatchAcknowledged: false
    }));
  }

  function updateWorkout(workoutDraftId: string, updates: Partial<PlanWeekWorkoutDraft>) {
    updateDraft((current) => ({
      ...current,
      workouts: current.workouts.map((workout) =>
        workout.draftId === workoutDraftId ? { ...workout, ...updates } : workout
      ),
      mismatchAcknowledged: false
    }));
  }

  function removeWorkout(workoutDraftId: string) {
    updateDraft((current) => ({
      ...current,
      workouts: current.workouts.filter((workout) => workout.draftId !== workoutDraftId),
      mismatchAcknowledged: false
    }));
  }

  function markDayRest(dateValue: string) {
    updateDraft((current) => ({
      ...current,
      workouts: [
        ...current.workouts.filter((workout) => workout.plannedDate !== dateValue),
        restWorkoutDraft(dateValue)
      ].sort(sortDraftWorkouts),
      mismatchAcknowledged: false
    }));
  }

  function regenerateGoalsFromSchedule() {
    updateDraft((current) => ({
      ...current,
      goals: deriveGoalDraftsFromSchedule(current, "Schedule"),
      mismatchAcknowledged: false
    }));
  }

  function applySuggestedGoals() {
    updateDraft((current) => {
      const adjustedWorkouts = scaleDraftWorkoutsToMileage(current.workouts, current.load.suggestedMileage);
      const nextLoad = suggestLoad(current.load.priorMileage, current.purpose, adjustedWorkouts);
      const nextDraft = {
        ...current,
        load: nextLoad,
        workouts: adjustedWorkouts.sort(sortDraftWorkouts),
        mismatchAcknowledged: false
      };
      return {
        ...nextDraft,
        goals: deriveGoalDraftsFromSchedule(nextDraft, "Suggested")
      };
    });
  }

  return (
    <div className="editor-backdrop">
      <aside className="editor-panel plan-week-panel" aria-label={drawerTitle}>
        <header>
          <div>
            <h2>{drawerTitle}</h2>
            <span>{formatCompactWeekRange(draft.weekStartDate, draft.weekEndDate)}</span>
          </div>
          <button type="button" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="plan-week-body">
          <section className="plan-week-section">
            <div className="section-heading">
              <span>1</span>
              <h3>Starting point</h3>
            </div>
            {draft.noPriorUsableWeek ? (
              <p className="plan-week-note">No prior usable week was found, so this draft starts blank.</p>
            ) : null}
            <div className="segmented-control">
              {startingPointOptions(draft).map((option) => (
                <button
                  className={draft.startingPoint === option.value ? "active" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => replaceFromStartingPoint(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="plan-week-section">
            <div className="section-heading">
              <span>2</span>
              <h3>Week purpose</h3>
            </div>
            <label>
              <span>Purpose</span>
              <select value={draft.purpose} onChange={(event) => updatePurpose(event.target.value as WeekPurposeId)}>
                {weekPurposes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {draft.purpose === "custom" ? (
              <label>
                <span>Custom purpose</span>
                <input
                  value={draft.customPurpose}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      customPurpose: event.target.value,
                      mismatchAcknowledged: false
                    }))
                  }
                />
              </label>
            ) : null}
            <p className="plan-week-note">
              {purpose.meaning} Load direction: {purpose.loadDirection}.
            </p>
          </section>

          <section className="plan-week-section">
            <div className="section-heading">
              <span>3</span>
              <h3>Proposed load</h3>
            </div>
            <div className="proposed-load">
              <div>
                <span>Prior week</span>
                <strong>{draft.load.priorMileage === null ? "No prior load" : `${formatNumber(draft.load.priorMileage)} mi`}</strong>
              </div>
              <div>
                <span>Mileage</span>
                <strong>{formatNumber(draft.load.suggestedMileage)} mi</strong>
                <small>{scheduledMileage ? `${formatNumber(scheduledMileage)} scheduled` : "No schedule yet"}</small>
              </div>
              <div>
                <span>Quality</span>
                <strong>{scheduledQuality} hard</strong>
                <small>{scheduledQuality === 1 ? "session" : "sessions"}</small>
              </div>
            </div>
            <p className="plan-week-note">{draft.load.reason}</p>
            <button className="text-action" type="button" onClick={applySuggestedGoals}>
              Update goals to suggested load
            </button>
          </section>

          <details className="plan-week-section plan-goals-disclosure">
            <summary>
              <div className="section-heading">
                <span>4</span>
                <h3>Proposed goals</h3>
              </div>
              <small>{detailedAchievementGoals.length} supporting goal{detailedAchievementGoals.length === 1 ? "" : "s"}</small>
              <ChevronDown size={16} />
            </summary>
            <div className="draft-goal-list">
              {detailedAchievementGoals.map((goal) => (
                <DraftGoalEditor goal={goal} key={goal.draftId} onChange={(updates) => updateGoal(goal.draftId, updates)} />
              ))}
              {!detailedAchievementGoals.length ? (
                <p className="plan-week-note">Mileage and quality are handled in proposed load.</p>
              ) : null}
            </div>
          </details>

          {guardrailGoals.length ? (
            <section className="plan-week-section">
              <div className="section-heading">
                <span>5</span>
                <h3>Guardrails</h3>
              </div>
              <div className="guardrail-draft-list">
                {guardrailGoals.map((goal) => (
                  <div className="guardrail-draft" key={goal.draftId}>
                    <strong>{goal.label}</strong>
                    <span>{formatGuardrailDraft(goal)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="plan-week-section">
            <div className="section-heading">
              <span>{guardrailGoals.length ? "6" : "5"}</span>
              <h3>Schedule draft</h3>
            </div>
            <div className="schedule-draft">
              {Array.from({ length: 7 }, (_, index) => addDays(draft.weekStartDate, index)).map((dateValue) => {
                const dayWorkouts = draft.workouts.filter((workout) => workout.plannedDate === dateValue);
                return (
                  <div className="schedule-draft-day" key={dateValue}>
                    <strong>{formatWeekday(dateValue)}</strong>
                    <div>
                      {dayWorkouts.length ? (
                        dayWorkouts.map((workout) => (
                          <div className="schedule-draft-workout" key={workout.draftId}>
                            <span>{formatDraftWorkoutLabel(workout)}</span>
                            <input
                              aria-label={`${workout.title} distance`}
                              min="0"
                              step="0.1"
                              type="number"
                              value={workout.plannedDistance}
                              onChange={(event) =>
                                updateWorkout(workout.draftId, { plannedDistance: event.target.value })
                              }
                            />
                            <button type="button" title="Remove workout" onClick={() => removeWorkout(workout.draftId)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <span className="schedule-rest">Rest</span>
                      )}
                    </div>
                    {dayWorkouts.length ? (
                      <button className="compact-rest-button" type="button" onClick={() => markDayRest(dateValue)}>
                        Rest
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="plan-week-section">
            <div className="section-heading">
              <span>{guardrailGoals.length ? "7" : "6"}</span>
              <h3>Plan alignment</h3>
            </div>
            <div className="alignment-summary">
              <strong>{mismatches.length ? `${mismatches.length} mismatch${mismatches.length === 1 ? "" : "es"}` : "Plan aligned"}</strong>
              <span>{alignment.length} checks</span>
            </div>
            <div className="alignment-list">
              {alignment.map((item) => (
                <div className={`alignment-item alignment-item--${item.status}`} key={item.id}>
                  {item.status === "aligned" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
            {mismatches.length ? (
              <div className="mismatch-actions">
                <button type="button" onClick={regenerateGoalsFromSchedule}>
                  Update goals to match plan
                </button>
                <button disabled type="button" title="Automatic plan adjustment is not ready yet.">
                  Adjust plan to match goals
                </button>
                <button type="button" onClick={() => updateDraft((current) => ({ ...current, mismatchAcknowledged: true }))}>
                  Save with mismatch
                </button>
              </div>
            ) : null}
          </section>
        </div>

        <div className="editor-actions plan-week-actions">
          <button type="button" onClick={onClose}>
            <X size={17} />
            <span>Cancel</span>
          </button>
          <button className="primary" disabled={isSaving || !canSave} type="button" onClick={() => onSave(draft)}>
            <Save size={17} />
            <span>{isSaving ? "Saving" : "Save plan"}</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

function DraftGoalEditor({
  goal,
  onChange
}: {
  goal: PlanWeekGoalDraft;
  onChange: (updates: Partial<PlanWeekGoalDraft>) => void;
}) {
  return (
    <article className="draft-goal">
      <header>
        <strong>{draftGoalTitle(goal)}</strong>
        <span>{goal.sourceLabel}</span>
      </header>
      {goal.category === "mileage" ? (
        <div className="form-grid form-grid--three">
          <label>
            <span>Minimum mileage</span>
            <input type="number" step="0.1" value={goal.minAcceptable} onChange={(event) => onChange({ minAcceptable: event.target.value })} />
          </label>
          <label>
            <span>Target mileage</span>
            <input type="number" step="0.1" value={goal.targetValue} onChange={(event) => onChange({ targetValue: event.target.value })} />
          </label>
          <label>
            <span>Maximum mileage</span>
            <input type="number" step="0.1" value={goal.maxAcceptable} onChange={(event) => onChange({ maxAcceptable: event.target.value })} />
          </label>
        </div>
      ) : null}
      {goal.category === "quality" ? (
        <div className="form-grid">
          <label>
            <span>Hard sessions</span>
            <input type="number" min="0" step="1" value={goal.targetValue} onChange={(event) => onChange({ targetValue: event.target.value, minAcceptable: event.target.value })} />
          </label>
          <label>
            <span>Quality type</span>
            <select value={goal.qualityType ?? "any"} onChange={(event) => onChange({ qualityType: event.target.value as PlanWeekGoalDraft["qualityType"] })}>
              <option value="any">Any quality</option>
              <option value="threshold">Threshold</option>
              <option value="tempo">Tempo</option>
              <option value="intervals">Intervals</option>
              <option value="hills">Hills</option>
              <option value="race">Race</option>
            </select>
          </label>
        </div>
      ) : null}
      {goal.category === "long_run" ? (
        <div className="form-grid form-grid--three">
          <label>
            <span>Minimum distance</span>
            <input type="number" step="0.1" value={goal.minAcceptable} onChange={(event) => onChange({ minAcceptable: event.target.value })} />
          </label>
          <label>
            <span>Target distance</span>
            <input type="number" step="0.1" value={goal.targetValue} onChange={(event) => onChange({ targetValue: event.target.value })} />
          </label>
          <label>
            <span>Maximum distance</span>
            <input type="number" step="0.1" value={goal.maxAcceptable} onChange={(event) => onChange({ maxAcceptable: event.target.value })} />
          </label>
        </div>
      ) : null}
      {goal.category === "recovery" ? (
        <div className="form-grid">
          <label>
            <span>Minimum rest days</span>
            <input type="number" min="0" step="1" value={goal.targetValue} onChange={(event) => onChange({ targetValue: event.target.value, minAcceptable: event.target.value })} />
          </label>
          <label className="checkbox-row">
            <input
              checked={goal.noBackToBackHardDays ?? true}
              type="checkbox"
              onChange={(event) => onChange({ noBackToBackHardDays: event.target.checked })}
            />
            <span>No back-to-back hard days</span>
          </label>
        </div>
      ) : null}
      {goal.category === "sessions" ? (
        <label>
          <span>Target total sessions</span>
          <input type="number" min="0" step="1" value={goal.targetValue} onChange={(event) => onChange({ targetValue: event.target.value, minAcceptable: event.target.value })} />
        </label>
      ) : null}
      {goal.category === "strength" ? (
        <div className="form-grid">
          <label>
            <span>Strength sessions</span>
            <input type="number" min="0" step="1" value={goal.targetValue} onChange={(event) => onChange({ targetValue: event.target.value, minAcceptable: event.target.value })} />
          </label>
          <label className="checkbox-row">
            <input
              checked={goal.strengthRequired ?? true}
              type="checkbox"
              onChange={(event) => onChange({ strengthRequired: event.target.checked })}
            />
            <span>Required</span>
          </label>
        </div>
      ) : null}
      {goal.category === "custom" ? (
        <>
          <label>
            <span>Goal label</span>
            <input value={goal.label} onChange={(event) => onChange({ label: event.target.value })} />
          </label>
          <label>
            <span>Goal description</span>
            <textarea rows={2} value={goal.description} onChange={(event) => onChange({ description: event.target.value })} />
          </label>
        </>
      ) : null}
    </article>
  );
}

function Metric({ label, value, trend }: { label: string; value: string; trend?: MileageTrend | null }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <MileageTrendBadge trend={trend} />
    </div>
  );
}

function MileageTrendBadge({ compact = false, trend }: { compact?: boolean; trend?: MileageTrend | null }) {
  if (!trend) {
    return null;
  }

  const Icon = trend.direction === "up" ? ArrowUp : trend.direction === "down" ? ArrowDown : Minus;

  return (
    <span
      aria-label={formatMileageTrendAriaLabel(trend)}
      className={`mileage-trend mileage-trend--${trend.direction} ${compact ? "mileage-trend--compact" : ""}`}
      title={formatMileageTrendAriaLabel(trend)}
    >
      <Icon size={compact ? 10 : 12} aria-hidden="true" />
      <span>{formatMileageTrendDelta(trend)}</span>
    </span>
  );
}

function StatusBanner({
  tone,
  icon,
  title,
  detail
}: {
  tone: "warning" | "danger";
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <section className={`status-banner ${tone}`} role="status">
      {icon}
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </section>
  );
}

function Placeholder({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <section className="placeholder-view">
      {icon}
      <h2>{title}</h2>
    </section>
  );
}

function ActivitiesView({ activities }: { activities: StravaActivity[] }) {
  return (
    <section className="activities-view">
      <header>
        <div>
          <p className="eyebrow">Imported activities</p>
          <h2>{activities.length} activities</h2>
        </div>
      </header>
      <div className="activity-list">
        {activities.map((activity) => (
          <article className="activity-row" key={activity.id}>
            <div>
              <strong>{activity.name}</strong>
              <span>
                {activity.sportType} · {formatDateTime(activity.startDateLocal)}
              </span>
            </div>
            <dl>
              <div>
                <dt>Miles</dt>
                <dd>{formatNumber(activity.distanceMiles)}</dd>
              </div>
              <div>
                <dt>Pace</dt>
                <dd>{formatPace(activity.movingTime, activity.distanceMiles)}</dd>
              </div>
              <div>
                <dt>HR</dt>
                <dd>{activity.averageHeartrate ? Math.round(activity.averageHeartrate) : "-"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function SettingsView({
  apiVersion,
  stravaStatus,
  isSyncing,
  lastSyncJob,
  onBackfill,
  onRefreshActivities,
  onRefreshStatus
}: {
  apiVersion: ApiVersion | null;
  stravaStatus: StravaStatus | null;
  isSyncing: boolean;
  lastSyncJob: SyncJob | null;
  onBackfill: () => void;
  onRefreshActivities: () => void;
  onRefreshStatus: () => void;
}) {
  return (
    <section className="settings-view">
      <div className="settings-row">
        <span>Strava</span>
        <strong>{stravaStatus?.connected ? stravaStatus.athleteName ?? "Connected" : "Not connected"}</strong>
      </div>
      <div className="settings-actions">
        <button type="button" onClick={() => (window.location.href = `${API_BASE_URL}/api/auth/strava/start`)}>
          <Link size={17} />
          <span>{stravaStatus?.connected ? "Reconnect Strava" : "Connect Strava"}</span>
        </button>
        <button
          className="primary"
          disabled={!stravaStatus?.connected || isSyncing}
          type="button"
          onClick={onBackfill}
        >
          <RefreshCw size={17} />
          <span>{isSyncing ? "Syncing" : "Backfill 180 days"}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onRefreshStatus();
            onRefreshActivities();
          }}
        >
          <RefreshCw size={17} />
          <span>Refresh</span>
        </button>
      </div>
      {lastSyncJob ? (
        <div className="settings-note">
          Last sync {lastSyncJob.status}: {lastSyncJob.activitiesFetched} fetched,{" "}
          {lastSyncJob.activitiesCreated} created, {lastSyncJob.activitiesUpdated} updated
        </div>
      ) : null}
      <div className="settings-row">
        <span>Strava scopes</span>
        <strong>{stravaStatus?.grantedScopes.length ? stravaStatus.grantedScopes.join(", ") : "none"}</strong>
      </div>
      <div className="settings-row">
        <span>Frontend</span>
        <strong>{FRONTEND_VERSION}</strong>
      </div>
      <div className="settings-row">
        <span>Backend</span>
        <strong>{apiVersion?.backendVersion ?? "unknown"}</strong>
      </div>
      <div className="settings-row">
        <span>Schema</span>
        <strong>{apiVersion?.schemaVersion ?? "unknown"}</strong>
      </div>
      <div className="settings-row">
        <span>AI</span>
        <strong>Stub</strong>
      </div>
    </section>
  );
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init.headers
    },
    ...init
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : { detail: await response.text() };
  if (!response.ok) {
    throw new Error(body.detail ?? `Request failed with ${response.status}`);
  }
  return body as T;
}

function defaultForm(plannedDate: string): WorkoutForm {
  return {
    plannedDate,
    title: "",
    sport: "run",
    workoutType: "easy",
    intensityCategory: "easy",
    plannedDistance: "",
    plannedDuration: "",
    purpose: "",
    instructions: "",
    notes: "",
    status: "planned"
  };
}

function formToPayload(form: WorkoutForm) {
  return {
    plannedDate: form.plannedDate,
    title: form.title,
    sport: form.sport,
    workoutType: form.workoutType,
    intensityCategory: form.intensityCategory,
    plannedDistance: form.plannedDistance === "" ? null : Number(form.plannedDistance),
    plannedDuration: form.plannedDuration === "" ? null : Number(form.plannedDuration) * 60,
    purpose: form.purpose,
    instructions: form.instructions,
    notes: form.notes,
    status: form.status
  };
}

function defaultGoalForm(weekId: string): WeekGoalForm {
  return {
    weekId,
    category: "custom",
    goalType: "achievement",
    label: "",
    description: "",
    targetValue: "",
    minAcceptable: "",
    maxAcceptable: "",
    unit: "custom",
    evaluationMode: "manual",
    priority: "secondary",
    status: "not_started",
    isEnabled: true
  };
}

function goalFormToPayload(form: WeekGoalForm) {
  return {
    category: form.category,
    goalType: form.goalType,
    label: form.label,
    description: form.description,
    targetValue: optionalNumber(form.targetValue),
    minAcceptable: optionalNumber(form.minAcceptable),
    maxAcceptable: optionalNumber(form.maxAcceptable),
    unit: form.unit,
    evaluationMode: form.evaluationMode,
    priority: form.priority,
    status: form.status,
    source: "manual",
    isEditable: true,
    isEnabled: form.isEnabled
  };
}

function buildPlanWeekDraft(week: TrainingWeek, weekStack: Record<string, TrainingWeek>): PlanWeekDraft {
  const hasExistingPlan = week.workouts.length > 0 || week.goals.length > 0 || week.notes.trim().length > 0;
  const priorWeek = findPriorUsableWeek(week.weekStartDate, weekStack);
  const startingPoint: PlanStartingPoint = hasExistingPlan ? "existing" : priorWeek ? "copy_prior" : "blank";
  const purpose = purposeFromText(week.notes) ?? "maintain";
  const baseDraft: PlanWeekDraft = {
    weekId: week.id,
    weekStartDate: week.weekStartDate,
    weekEndDate: week.weekEndDate,
    weekState: week.weekState,
    startingPoint,
    purpose,
    customPurpose: purpose === "custom" ? week.notes : "",
    priorWeekStartDate: priorWeek?.weekStartDate ?? null,
    noPriorUsableWeek: !hasExistingPlan && !priorWeek,
    load: suggestLoad(loadBaselineMileageOrNull(priorWeek), purpose, week.workouts),
    workouts: [],
    goals: [],
    hasExistingPlan,
    mismatchAcknowledged: false
  };
  return rebuildPlanWeekDraftForStartingPoint(baseDraft, startingPoint, weekStack, week);
}

function rebuildPlanWeekDraftForStartingPoint(
  draft: PlanWeekDraft,
  startingPoint: PlanStartingPoint,
  weekStack: Record<string, TrainingWeek>,
  currentWeek?: TrainingWeek
): PlanWeekDraft {
  const priorWeek = draft.priorWeekStartDate ? weekStack[draft.priorWeekStartDate] : findPriorUsableWeek(draft.weekStartDate, weekStack);
  const sourceWeek = startingPoint === "existing" ? currentWeek ?? weekStack[draft.weekStartDate] : priorWeek ?? null;
  const loadSourceWeek = priorWeek ?? null;
  const sourceWorkouts =
    startingPoint === "blank" || !sourceWeek
      ? []
      : draftWorkoutsFromWeek(sourceWeek, draft.weekStartDate);
  const adjustedWorkouts =
    startingPoint === "smart_adjustment"
      ? scaleDraftWorkoutsToMileage(sourceWorkouts, suggestLoad(loadBaselineMileageOrNull(loadSourceWeek), draft.purpose, sourceWorkouts).suggestedMileage)
      : sourceWorkouts;
  const nextLoad = suggestLoad(loadBaselineMileageOrNull(loadSourceWeek), draft.purpose, adjustedWorkouts);
  const nextDraft = {
    ...draft,
    startingPoint,
    priorWeekStartDate: priorWeek?.weekStartDate ?? null,
    noPriorUsableWeek: !priorWeek && startingPoint !== "existing",
    load: nextLoad,
    workouts: adjustedWorkouts.sort(sortDraftWorkouts),
    mismatchAcknowledged: false
  };

  const existingWeek = startingPoint === "existing" ? currentWeek ?? weekStack[draft.weekStartDate] : null;
  if (existingWeek?.goals.length) {
    return {
      ...nextDraft,
      goals: existingWeek.goals.map((goal) => goalDraftFromWeekGoal(goal, "Existing"))
    };
  }

  return {
    ...nextDraft,
    goals: deriveGoalDraftsFromSchedule(nextDraft, startingPoint === "copy_prior" ? "Suggested" : "Schedule")
  };
}

function findPriorUsableWeek(weekStartDate: string, weekStack: Record<string, TrainingWeek>) {
  return Object.values(weekStack)
    .filter((week) => week.weekStartDate < weekStartDate && isUsablePriorWeek(week))
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))[0];
}

function isUsablePriorWeek(week: TrainingWeek) {
  return week.workouts.length > 0 || week.actualActivities.length > 0;
}

function loadBaselineMileageOrNull(week: TrainingWeek | null | undefined) {
  if (!week) {
    return null;
  }
  return comparisonMileage(week);
}

function suggestLoad(priorMileage: number | null, purpose: WeekPurposeId, workouts: Array<Workout | PlanWeekWorkoutDraft>): ProposedLoad {
  const draftMileage = workouts.length ? sumDraftRunDistance(workouts) : 0;
  const base = priorMileage && priorMileage > 0 ? priorMileage : draftMileage;
  let suggested = base;
  let reason = "No prior usable mileage was found, so the draft starts from the current schedule.";

  if (purpose === "aerobic_build") {
    const increase = Math.min(Math.max(base * 0.04, base > 0 ? 1 : 0), 3);
    suggested = base + increase;
    reason = "Aerobic build, small conservative increase from prior week.";
  } else if (purpose === "maintain") {
    suggested = base;
    reason = "Maintain, keeping load close to the prior usable week.";
  } else if (purpose === "down_week") {
    suggested = base * 0.8;
    reason = "Down week, reducing volume to protect recovery.";
  } else if (purpose === "workout_focus") {
    suggested = base * 0.96;
    reason = "Workout focus, preserving quality without adding total stress.";
  } else if (purpose === "long_run_focus") {
    suggested = base;
    reason = "Long-run focus, holding weekly load while shifting emphasis.";
  } else if (purpose === "recovery") {
    suggested = base * 0.65;
    reason = "Recovery, lowering volume and avoiding hard training.";
  } else if (purpose === "race_week") {
    suggested = base * 0.7;
    reason = "Race week, tapering load around the key race effort.";
  } else {
    suggested = draftMileage || base;
    reason = "Custom purpose, keeping the current draft load until goals are edited.";
  }

  return {
    priorMileage,
    suggestedMileage: roundToTenth(suggested),
    reason
  };
}

function draftWorkoutsFromWeek(sourceWeek: TrainingWeek, targetWeekStartDate: string): PlanWeekWorkoutDraft[] {
  if (sourceWeek.workouts.length) {
    return sourceWeek.workouts.map((workout) => {
      const dayOffset = daysBetween(sourceWeek.weekStartDate, workout.plannedDate);
      return workoutDraftFromWorkout(workout, addDays(targetWeekStartDate, dayOffset));
    });
  }

  return sourceWeek.actualActivities.map((activity) => {
    const dayOffset = daysBetween(sourceWeek.weekStartDate, activity.activityDate);
    return {
      ...defaultForm(addDays(targetWeekStartDate, dayOffset)),
      draftId: draftId("workout"),
      title: activity.name,
      sport: normalizedActivitySport(activity.sportType),
      workoutType: "easy",
      intensityCategory: "easy",
      plannedDistance: activity.distanceMiles ? String(roundToTenth(activity.distanceMiles)) : "",
      purpose: "Seeded from completed activity"
    };
  });
}

function workoutDraftFromWorkout(workout: Workout, plannedDate: string): PlanWeekWorkoutDraft {
  return {
    draftId: draftId("workout"),
    plannedDate,
    title: workout.title,
    sport: workout.sport,
    workoutType: workout.workoutType,
    intensityCategory: workout.intensityCategory,
    plannedDistance: workout.plannedDistance?.toString() ?? "",
    plannedDuration: workout.plannedDuration ? String(Math.round(workout.plannedDuration / 60)) : "",
    purpose: workout.purpose,
    instructions: workout.instructions,
    notes: workout.notes,
    status: "planned"
  };
}

function restWorkoutDraft(plannedDate: string): PlanWeekWorkoutDraft {
  return {
    ...defaultForm(plannedDate),
    draftId: draftId("workout"),
    title: "Rest",
    sport: "rest",
    workoutType: "rest",
    intensityCategory: "rest",
    plannedDistance: "0",
    purpose: "Recovery"
  };
}

function scaleDraftWorkoutsToMileage(workouts: PlanWeekWorkoutDraft[], targetMileage: number) {
  const currentMileage = sumDraftRunDistance(workouts);
  if (!currentMileage || !targetMileage) {
    return workouts;
  }
  const scale = targetMileage / currentMileage;
  return workouts.map((workout) => {
    if (workout.sport !== "run") {
      return workout;
    }
    return {
      ...workout,
      plannedDistance: String(roundToTenth(Number(workout.plannedDistance || 0) * scale))
    };
  });
}

function deriveGoalDraftsFromSchedule(draft: PlanWeekDraft, sourceLabel: string): PlanWeekGoalDraft[] {
  const scheduleMileage = sumDraftRunDistance(draft.workouts);
  const mileage =
    sourceLabel === "Schedule"
      ? scheduleMileage
      : draft.load.suggestedMileage || scheduleMileage;
  const hardSessions = countDraftHardSessions(draft.workouts);
  const longestRun = maxDraftRunDistance(draft.workouts);
  const sessions = draft.workouts.filter((workout) => workout.sport !== "rest").length;
  const strengthSessions = draft.workouts.filter((workout) => workout.sport === "strength" || workout.workoutType === "strength").length;
  const goals: PlanWeekGoalDraft[] = [];

  if (mileage > 0) {
    goals.push(newGoalDraft({
      category: "mileage",
      label: `Run ${formatNumber(mileage)} miles`,
      targetValue: mileage,
      minAcceptable: roundToTenth(mileage * 0.94),
      maxAcceptable: roundToTenth(mileage * 1.06),
      unit: "mi",
      evaluationMode: "range",
      priority: "primary",
      sourceLabel
    }));
  }

  if (hardSessions > 0 || ["workout_focus", "race_week"].includes(draft.purpose)) {
    const target = draft.purpose === "recovery" ? 0 : Math.max(hardSessions, draft.purpose === "workout_focus" ? 1 : 0);
    goals.push(newGoalDraft({
      category: "quality",
      label: `Complete ${target} hard session${target === 1 ? "" : "s"}`,
      targetValue: target,
      minAcceptable: target,
      maxAcceptable: 2,
      unit: "sessions",
      evaluationMode: "at_least",
      priority: "primary",
      sourceLabel
    }));
  }

  if (longestRun > 0) {
    goals.push(newGoalDraft({
      category: "long_run",
      label: `Long run near ${formatNumber(longestRun)} miles`,
      targetValue: longestRun,
      minAcceptable: Math.max(roundToTenth(longestRun - 1), 0),
      maxAcceptable: roundToTenth(longestRun + 1),
      unit: "mi",
      evaluationMode: "range",
      priority: "primary",
      sourceLabel
    }));
  }

  goals.push(newGoalDraft({
    category: "recovery",
    label: "Include at least 1 rest day",
    targetValue: 1,
    minAcceptable: 1,
    unit: "days",
    evaluationMode: "at_least",
    priority: "secondary",
    sourceLabel
  }));

  if (sessions > 0) {
    goals.push(newGoalDraft({
      category: "sessions",
      label: `Complete ${sessions} sessions`,
      targetValue: sessions,
      minAcceptable: sessions,
      unit: "sessions",
      evaluationMode: "at_least",
      priority: "secondary",
      sourceLabel
    }));
  }

  if (strengthSessions > 0) {
    goals.push(newGoalDraft({
      category: "strength",
      label: `Complete ${strengthSessions} strength session${strengthSessions === 1 ? "" : "s"}`,
      targetValue: strengthSessions,
      minAcceptable: strengthSessions,
      unit: "sessions",
      evaluationMode: "at_least",
      priority: "secondary",
      sourceLabel
    }));
  }

  if (scheduleMileage > 0) {
    goals.push(newGoalDraft({
      category: "long_run",
      goalType: "guardrail",
      label: "Long run no more than 30% of week",
      targetValue: 30,
      maxAcceptable: 30,
      unit: "percent",
      evaluationMode: "at_most",
      priority: "guardrail",
      sourceLabel
    }));
    goals.push(newGoalDraft({
      category: "quality",
      goalType: "guardrail",
      label: "No more than 2 hard days",
      targetValue: 2,
      maxAcceptable: 2,
      unit: "days",
      evaluationMode: "at_most",
      priority: "guardrail",
      sourceLabel
    }));
  }

  return goals;
}

function newGoalDraft({
  category,
  evaluationMode,
  goalType = "achievement",
  label,
  maxAcceptable,
  minAcceptable,
  priority,
  sourceLabel,
  targetValue,
  unit
}: {
  category: WeekGoalCategory;
  evaluationMode: WeekGoalEvaluationMode;
  goalType?: WeekGoalType;
  label: string;
  maxAcceptable?: number;
  minAcceptable?: number;
  priority: WeekGoalPriority;
  sourceLabel: string;
  targetValue?: number;
  unit: WeekGoalUnit;
}): PlanWeekGoalDraft {
  return {
    ...defaultGoalForm(""),
    draftId: draftId("goal"),
    category,
    goalType,
    label,
    targetValue: targetValue === undefined ? "" : String(targetValue),
    minAcceptable: minAcceptable === undefined ? "" : String(minAcceptable),
    maxAcceptable: maxAcceptable === undefined ? "" : String(maxAcceptable),
    unit,
    evaluationMode,
    priority,
    source: sourceLabel === "Edited" ? "manual" : sourceLabel === "Existing" ? "manual" : "derived_from_plan",
    sourceLabel,
    noBackToBackHardDays: category === "recovery" ? true : undefined,
    strengthRequired: category === "strength" ? true : undefined
  };
}

function goalDraftFromWeekGoal(goal: WeekGoal, sourceLabel: string): PlanWeekGoalDraft {
  return {
    ...defaultGoalForm(goal.trainingWeekId),
    draftId: draftId("goal"),
    id: goal.id,
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
    isEnabled: goal.isEnabled,
    source: goal.source,
    sourceLabel
  };
}

function evaluatePlanAlignment(draft: PlanWeekDraft): AlignmentItem[] {
  const goals = draft.goals.filter((goal) => goal.isEnabled && goal.goalType === "achievement");
  return goals.map((goal) => {
    if (goal.category === "mileage") {
      const planned = sumDraftRunDistance(draft.workouts);
      return numericAlignment("mileage", "Mileage", planned, goal, `${formatNumber(planned)} planned`);
    }
    if (goal.category === "quality") {
      const hard = countDraftHardSessions(draft.workouts);
      return numericAlignment("quality", "Quality", hard, goal, `${hard} hard session${hard === 1 ? "" : "s"} planned`);
    }
    if (goal.category === "long_run") {
      const longRun = maxDraftRunDistance(draft.workouts);
      return numericAlignment("long_run", "Long run", longRun, goal, `${formatNumber(longRun)} mi longest run`);
    }
    if (goal.category === "recovery") {
      const restDays = countDraftRestDays(draft.workouts, draft.weekStartDate);
      return numericAlignment("recovery", "Recovery", restDays, goal, `${restDays} rest day${restDays === 1 ? "" : "s"} planned`);
    }
    if (goal.category === "sessions") {
      const sessions = draft.workouts.filter((workout) => workout.sport !== "rest").length;
      return numericAlignment("sessions", "Sessions", sessions, goal, `${sessions} sessions planned`);
    }
    if (goal.category === "strength") {
      const strength = draft.workouts.filter((workout) => workout.sport === "strength" || workout.workoutType === "strength").length;
      return numericAlignment("strength", "Strength", strength, goal, `${strength} strength session${strength === 1 ? "" : "s"} planned`);
    }
    return {
      id: goal.draftId,
      label: draftGoalTitle(goal),
      detail: goal.description || "Manual goal will be evaluated after saving.",
      status: "aligned"
    };
  });
}

function numericAlignment(id: string, label: string, value: number, goal: PlanWeekGoalDraft, prefix: string): AlignmentItem {
  const min = optionalNumber(goal.minAcceptable);
  const max = optionalNumber(goal.maxAcceptable);
  const target = optionalNumber(goal.targetValue);
  const below = min !== null && value < min;
  const above = max !== null && value > max;
  const exactMiss = goal.evaluationMode === "exact-ish" && target !== null && Math.abs(value - target) > 0.5;
  const statusValue: AlignmentStatus = below || above || exactMiss ? "mismatch" : "aligned";
  const range = min !== null && max !== null ? `target range ${formatNumber(min)}-${formatNumber(max)}` : target !== null ? `target ${formatNumber(target)}` : "manual target";
  return {
    id,
    label,
    detail: `${prefix}, ${range}`,
    status: statusValue
  };
}

function planWeekDraftToPayload(draft: PlanWeekDraft) {
  return {
    purpose: purposeText(draft),
    targetLongRunDistance: optionalNumber(draft.goals.find((goal) => goal.category === "long_run" && goal.goalType === "achievement")?.targetValue ?? ""),
    workouts: draft.workouts.map((workout) => formToPayload(workout)),
    goals: draft.goals.map((goal) => ({
      ...goalFormToPayload({ ...goal, weekId: draft.weekId }),
      label: goalLabelFromDraft(goal),
      source: goal.source
    }))
  };
}

function startingPointOptions(draft: PlanWeekDraft): Array<{ value: PlanStartingPoint; label: string }> {
  return [
    ...(draft.hasExistingPlan ? [{ value: "existing" as const, label: "Existing plan" }] : []),
    { value: "copy_prior" as const, label: "Copy prior week" },
    { value: "smart_adjustment" as const, label: "Smart adjustment" },
    { value: "blank" as const, label: "Start blank" }
  ];
}

function purposeText(draft: PlanWeekDraft) {
  if (draft.purpose === "custom") {
    return draft.customPurpose.trim() || "Custom";
  }
  return weekPurposes.find((option) => option.value === draft.purpose)?.label ?? "Maintain";
}

function purposeFromText(value: string): WeekPurposeId | null {
  const normalized = value.trim().toLowerCase();
  return weekPurposes.find((option) => option.label.toLowerCase() === normalized)?.value ?? (normalized ? "custom" : null);
}

function draftGoalTitle(goal: PlanWeekGoalDraft) {
  if (goal.category === "mileage") {
    return "Mileage";
  }
  if (goal.category === "quality") {
    return "Quality";
  }
  if (goal.category === "long_run") {
    return goal.goalType === "guardrail" ? "Long-run guardrail" : "Long run";
  }
  if (goal.category === "recovery") {
    return "Recovery";
  }
  if (goal.category === "sessions") {
    return "Sessions";
  }
  if (goal.category === "strength") {
    return "Strength";
  }
  return "Custom goal";
}

function goalLabelFromDraft(goal: PlanWeekGoalDraft) {
  const target = optionalNumber(goal.targetValue);
  if (goal.category === "mileage" && target !== null) {
    return `Run ${formatNumber(target)} miles`;
  }
  if (goal.category === "quality" && target !== null) {
    return `Complete ${formatNumber(target)} hard session${target === 1 ? "" : "s"}`;
  }
  if (goal.category === "long_run" && goal.goalType === "achievement" && target !== null) {
    return `Long run near ${formatNumber(target)} miles`;
  }
  if (goal.category === "recovery" && target !== null) {
    return `Include at least ${formatNumber(target)} rest day${target === 1 ? "" : "s"}`;
  }
  if (goal.category === "sessions" && target !== null) {
    return `Complete ${formatNumber(target)} sessions`;
  }
  if (goal.category === "strength" && target !== null) {
    return `Complete ${formatNumber(target)} strength session${target === 1 ? "" : "s"}`;
  }
  return goal.label;
}

function formatDraftWorkoutLabel(workout: PlanWeekWorkoutDraft) {
  if (workout.sport === "rest") {
    return "Rest";
  }
  const miles = optionalNumber(workout.plannedDistance);
  return workout.title || (miles !== null && miles > 0 ? `${formatNumber(miles)} mi ${labelForWorkoutType(workout.workoutType)}` : labelForWorkoutType(workout.workoutType));
}

function formatGuardrailDraft(goal: PlanWeekGoalDraft) {
  const max = optionalNumber(goal.maxAcceptable);
  const target = optionalNumber(goal.targetValue);
  if (goal.category === "long_run" && max !== null) {
    return `Long run <= ${formatNumber(max)}% of week`;
  }
  if (goal.category === "quality" && max !== null) {
    return `Hard days <= ${formatNumber(max)}`;
  }
  if (target !== null) {
    return `${goalLabelFromDraft(goal)} target ${formatNumber(target)}`;
  }
  return goal.description || "Guardrail";
}

function sortDraftWorkouts(a: PlanWeekWorkoutDraft, b: PlanWeekWorkoutDraft) {
  return a.plannedDate.localeCompare(b.plannedDate) || a.title.localeCompare(b.title);
}

function sumDraftRunDistance(workouts: Array<Pick<Workout, "sport" | "plannedDistance"> | PlanWeekWorkoutDraft>) {
  return roundToTenth(
    workouts.reduce((sum, workout) => {
      if (workout.sport !== "run") {
        return sum;
      }
      const distance = typeof workout.plannedDistance === "string" ? Number(workout.plannedDistance || 0) : workout.plannedDistance ?? 0;
      return sum + distance;
    }, 0)
  );
}

function maxDraftRunDistance(workouts: PlanWeekWorkoutDraft[]) {
  return roundToTenth(
    Math.max(
      ...workouts
        .filter((workout) => workout.sport === "run")
        .map((workout) => Number(workout.plannedDistance || 0)),
      0
    )
  );
}

function countDraftHardSessions(workouts: PlanWeekWorkoutDraft[]) {
  return new Set(
    workouts
      .filter((workout) => workout.intensityCategory === "workout" || workout.intensityCategory === "race")
      .map((workout) => workout.plannedDate)
  ).size;
}

function countDraftRestDays(workouts: PlanWeekWorkoutDraft[], weekStartDate: string) {
  const trainingDays = new Set(workouts.filter((workout) => workout.sport !== "rest").map((workout) => workout.plannedDate));
  return Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)).filter((dateValue) => !trainingDays.has(dateValue)).length;
}

function normalizedActivitySport(sportType: string): Workout["sport"] {
  return sportType.toLowerCase().includes("run") ? "run" : "other";
}

function daysBetween(start: string, end: string) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000);
}

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10;
}

function draftId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function optionalNumber(value: string) {
  return value === "" ? null : Number(value);
}

function startOfWeek(day: Date) {
  const copy = new Date(day);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return toDateInputValue(copy);
}

function getInitialWeekStart() {
  return getWeekStartFromLocation();
}

function getWeekStartFromLocation() {
  const pathMatch = window.location.pathname.match(/^\/week\/(\d{4}-\d{2}-\d{2})\/?$/);
  const weekParam = pathMatch?.[1] ?? new URLSearchParams(window.location.search).get("week");
  if (!weekParam) {
    return startOfWeek(new Date());
  }

  const parsed = parseDate(weekParam);
  if (Number.isNaN(parsed.getTime())) {
    return startOfWeek(new Date());
  }
  return startOfWeek(parsed);
}

function ensureWeekRoute(weekStart: string) {
  if (window.location.pathname === weekPath(weekStart)) {
    return;
  }
  window.history.replaceState({ weekStart }, "", weekPath(weekStart));
}

function weekPath(weekStart: string) {
  return `/week/${weekStart}`;
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

function scrollExpandedWeekIntoView(element: HTMLElement) {
  const container = element.closest("main");
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const rect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const targetTop = container.scrollTop + rect.top - containerRect.top;

  container.scrollTo({
    top: Math.max(0, targetTop),
    behavior: prefersReducedMotion() ? "auto" : "smooth"
  });
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function addDays(dateValue: string, offset: number) {
  const date = parseDate(dateValue);
  date.setDate(date.getDate() + offset);
  return toDateInputValue(date);
}

function parseDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDateString() {
  return toDateInputValue(new Date());
}

function formatWeekRange(week: TrainingWeek) {
  return `${formatShortDate(week.weekStartDate)}-${formatShortDate(week.weekEndDate)}`;
}

function formatWeekRangeFromStart(start: string) {
  return `${formatShortDate(start)}-${formatShortDate(addDays(start, 6))}`;
}

function formatCompactWeekRangeFromStart(start: string) {
  return formatCompactWeekRange(start, addDays(start, 6));
}

function formatCompactWeekRange(start: string, end: string) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  const startLabel = formatShortDate(start);
  const endLabel = startDate.getMonth() === endDate.getMonth() ? String(endDate.getDate()) : formatShortDate(end);
  return `${startLabel}-${endLabel}`;
}

function formatWeekday(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(parseDate(dateValue));
}

function formatShortDate(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parseDate(dateValue));
}

function formatDateTime(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(dateValue));
}

function formatPace(seconds: number | null | undefined, miles: number | null | undefined) {
  if (!seconds || !miles) {
    return "-";
  }

  const paceSeconds = Math.round(seconds / miles);
  const minutes = Math.floor(paceSeconds / 60);
  const remainder = String(paceSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}/mi`;
}

function formatWorkoutMeta(workout: Workout) {
  if (workout.sport === "rest" || workout.intensityCategory === "rest") {
    return "Rest";
  }

  const pieces = [];
  if (workout.plannedDistance !== null && workout.plannedDistance > 0) {
    pieces.push(`${formatNumber(workout.plannedDistance)} mi`);
  }
  const pace = formatPace(workout.plannedDuration, workout.plannedDistance);
  if (pace !== "-") {
    pieces.push(pace);
  }
  return pieces.join(" · ") || workout.status.replaceAll("_", " ");
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getMileageTrend(current: number | null | undefined, previous: number | null | undefined): MileageTrend | null {
  if (current === null || current === undefined || previous === null || previous === undefined) {
    return null;
  }

  if (current <= 0 && previous <= 0) {
    return null;
  }

  const delta = current - previous;
  const roundedDelta = Math.abs(delta) < 0.05 ? 0 : delta;

  if (roundedDelta === 0) {
    return {
      direction: "same",
      delta: 0
    };
  }

  return {
    direction: roundedDelta > 0 ? "up" : "down",
    delta: roundedDelta
  };
}

function getCollapsedMileageTrend(week: TrainingWeek | undefined, previousWeek: TrainingWeek | undefined) {
  if (!week || !previousWeek) {
    return null;
  }

  return getMileageTrend(comparisonMileage(week), comparisonMileage(previousWeek));
}

function preferredMileage(week: TrainingWeek) {
  return week.actualMileage > 0 ? week.actualMileage : week.plannedMileage;
}

function comparisonMileage(week: TrainingWeek) {
  if (week.weekState === "future") {
    return week.plannedMileage;
  }
  if (week.weekState === "current") {
    return projectedMileage(week);
  }
  return week.actualMileage > 0 ? week.actualMileage : week.plannedMileage;
}

function projectedMileage(week: TrainingWeek) {
  const mileageEvaluation = week.goalEvaluations.find((evaluation) => {
    const goal = week.goals.find((candidate) => candidate.id === evaluation.goalId);
    return goal?.category === "mileage";
  });

  if (mileageEvaluation?.actualValue !== null && mileageEvaluation?.actualValue !== undefined) {
    return mileageEvaluation.actualValue + (mileageEvaluation.remainingPlannedValue ?? 0);
  }

  return week.plannedMileage > 0 ? week.plannedMileage : week.actualMileage;
}

function formatMileageTrendDelta(trend: MileageTrend) {
  if (trend.direction === "same") {
    return "0";
  }

  return formatNumber(Math.abs(trend.delta));
}

function formatMileageTrendAriaLabel(trend: MileageTrend) {
  if (trend.direction === "same") {
    return "Mileage unchanged from prior week";
  }

  return `Mileage ${trend.direction === "up" ? "increased" : "decreased"} ${formatNumber(Math.abs(trend.delta))} miles from prior week`;
}

function sumDistance(workouts: Workout[]) {
  return workouts.reduce((sum, workout) => sum + (workout.plannedDistance ?? 0), 0);
}

function sumActualDistance(activities: ActualActivity[]) {
  return activities.reduce((sum, activity) => sum + activity.distanceMiles, 0);
}

function dayColumnClass(workouts: Workout[], activities: ActualActivity[], isEmpty: boolean) {
  if (activities.length > 0) {
    return "day-column--actual";
  }
  const firstWorkout = workouts.find((workout) => workout.sport !== "rest") ?? workouts[0];
  if (!firstWorkout) {
    return isEmpty ? "day-column--empty day-column--rest" : "";
  }
  return `day-column--${firstWorkout.intensityCategory} ${firstWorkout.workoutType.replaceAll("_", "-")}`;
}

function formatWeekdayShort(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(parseDate(dateValue)).toUpperCase();
}

function formatDayNumber(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(parseDate(dateValue));
}

function collapsedWeekDayBadges(week: TrainingWeek | undefined, weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const dayActuals = week?.actualActivities.filter((activity) => activity.activityDate === date) ?? [];
    const dayWorkouts = week?.workouts.filter((workout) => workout.plannedDate === date) ?? [];
    const actualMiles = sumActualDistance(dayActuals);
    const plannedMiles = sumDistance(dayWorkouts);
    const weekday = formatWeekday(date);
    const dateLabel = formatShortDate(date);

    if (!week) {
      return {
        date,
        kind: "loading",
        label: "...",
        title: `${weekday} ${dateLabel}: loading`
      };
    }

    if (dayActuals.length > 0) {
      return {
        date,
        kind: actualMiles > 0 ? "actual" : "rest",
        label: actualMiles > 0 ? `${formatNumber(actualMiles)} mi` : "rest",
        title: `${weekday} ${dateLabel}: ${formatNumber(actualMiles)} completed miles`
      };
    }

    if (plannedMiles > 0) {
      return {
        date,
        kind: "planned",
        label: `${formatNumber(plannedMiles)} mi`,
        title: `${weekday} ${dateLabel}: ${formatNumber(plannedMiles)} planned miles`
      };
    }

    return {
      date,
      kind: "rest",
      label: "rest",
      title: `${weekday} ${dateLabel}: rest`
    };
  });
}

function formatCollapsedMileageSummary(week: TrainingWeek | undefined, weekStart: string, tone: "past" | "future") {
  if (!week) {
    return "loading";
  }

  const planned = week.plannedMileage;
  const actual = week.actualMileage;
  const isCurrentWeek = weekStart === startOfWeek(new Date());

  if (actual > 0 && planned > 0) {
    return `${formatNumber(actual)} / ${formatNumber(planned)} mi`;
  }

  if (actual > 0) {
    return isCurrentWeek ? `${formatNumber(actual)} mi · unplanned` : `${formatNumber(actual)} mi`;
  }

  if (planned > 0) {
    return `${formatNumber(planned)} mi planned`;
  }

  return tone === "future" ? "not planned" : "no plan";
}

function formatCollapsedWeekDetail(week: TrainingWeek | undefined, tone: "past" | "future") {
  if (!week) {
    return "loading";
  }

  const hasPlannedWork = week.plannedMileage > 0 || week.workouts.length > 0;
  const hasActualWork = week.actualMileage > 0 || week.actualActivities.length > 0;

  if (!hasPlannedWork && !hasActualWork && tone === "future") {
    return "tap to plan";
  }

  const planLabel = hasPlannedWork ? formatHardDays(week.hardDays) : "no plan";
  return `${planLabel} · ${formatLongRun(week.longRunDistance)}`;
}

function formatHardDays(count: number) {
  return `${count} hard`;
}

function formatLongRun(distance: number) {
  return distance > 0 ? `LR ${formatNumber(distance)}` : "LR --";
}

function formatTime(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(dateValue));
}

function openStravaActivity(activity: ActualActivity) {
  window.open(stravaActivityUrl(activity.stravaActivityId), "_blank", "noopener,noreferrer");
}

function stravaActivityUrl(stravaActivityId: string) {
  return `https://www.strava.com/activities/${encodeURIComponent(stravaActivityId)}`;
}

function labelForWorkoutType(value: Workout["workoutType"]) {
  return workoutTypes.find((type) => type.value === value)?.label ?? value;
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
