import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  Link,
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
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

const FRONTEND_VERSION = "0.1.0";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const WEEK_STACK_RADIUS = 3;

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

type TabId = (typeof tabs)[number]["id"];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("week");
  const [apiVersion, setApiVersion] = useState<ApiVersion | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(getInitialWeekStart);
  const [week, setWeek] = useState<TrainingWeek | null>(null);
  const [isLoadingWeek, setIsLoadingWeek] = useState(true);
  const [weekStack, setWeekStack] = useState<Record<string, TrainingWeek>>({});
  const [editor, setEditor] = useState<WorkoutForm | null>(null);
  const [stravaStatus, setStravaStatus] = useState<StravaStatus | null>(null);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [lastSyncJob, setLastSyncJob] = useState<SyncJob | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const staleFrontend = apiVersion
    ? apiVersion.forceReload || compareVersions(FRONTEND_VERSION, apiVersion.frontendMinVersion) < 0
    : false;

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
    loadWeekStack(weekStart);
  }, [weekStart]);

  useEffect(() => {
    loadStravaStatus();
    loadActivities();
  }, []);

  useEffect(() => {
    function handlePopState() {
      setWeekStart(getWeekStartFromLocation());
    }

    ensureWeekRoute(weekStart);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [weekStart]);

  const stackStarts = useMemo(() => {
    return Array.from({ length: WEEK_STACK_RADIUS * 2 + 1 }, (_, index) =>
      addDays(weekStart, (index - WEEK_STACK_RADIUS) * 7)
    );
  }, [weekStart]);

  function loadWeekStack(start: string) {
    setIsLoadingWeek(true);
    const starts = Array.from({ length: WEEK_STACK_RADIUS * 2 + 1 }, (_, index) =>
      addDays(start, (index - WEEK_STACK_RADIUS) * 7)
    );

    Promise.all(starts.map((weekDate) => fetchJson<TrainingWeek>(`/api/weeks/${weekDate}`)))
      .then((weeks) => {
        const nextStack = Object.fromEntries(weeks.map((loadedWeek) => [loadedWeek.weekStartDate, loadedWeek]));
        setWeekStack(nextStack);
        setWeek(nextStack[start] ?? null);
        setApiError(null);
      })
      .catch((error: Error) => setApiError(error.message))
      .finally(() => setIsLoadingWeek(false));
  }

  function navigateToWeek(start: string) {
    const normalizedStart = startOfWeek(parseDate(start));
    const url = new URL(window.location.href);
    url.searchParams.set("week", normalizedStart);
    window.history.pushState({ weekStart: normalizedStart }, "", `${url.pathname}${url.search}${url.hash}`);
    setWeekStart(normalizedStart);
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
    loadWeekStack(weekStart);
  }

  async function deleteWorkout(workout: Workout) {
    await fetchJson(`/api/planned-workouts/${workout.id}`, { method: "DELETE" });
    loadWeekStack(weekStart);
  }

  async function duplicateWorkout(workout: Workout) {
    await fetchJson(`/api/planned-workouts/${workout.id}/duplicate`, { method: "POST" });
    loadWeekStack(weekStart);
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
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Strava sync failed.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/icons/icon.svg" alt="" />
          <div>
            <strong>Running Planner</strong>
            <span>v{FRONTEND_VERSION}</span>
          </div>
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

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">Training week</p>
            <h1>{week ? formatWeekRange(week) : formatWeekRangeFromStart(weekStart)}</h1>
          </div>
          <div className="week-actions">
            <button type="button" title="Previous week" onClick={() => navigateToWeek(addDays(weekStart, -7))}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" title="Next week" onClick={() => navigateToWeek(addDays(weekStart, 7))}>
              <ChevronRight size={18} />
            </button>
            <button className="primary" type="button" title="Refresh" onClick={() => loadWeekStack(weekStart)}>
              <RefreshCw size={18} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

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
            days={days}
            isLoading={isLoadingWeek}
            onSelectWeek={navigateToWeek}
            week={week}
            weekStack={weekStack}
            weekStarts={stackStarts}
            onCreate={openCreate}
            onEdit={openEdit}
            onDelete={deleteWorkout}
            onDuplicate={duplicateWorkout}
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
    </div>
  );
}

function WeekView({
  days,
  isLoading,
  onSelectWeek,
  week,
  weekStack,
  weekStarts,
  onCreate,
  onEdit,
  onDelete,
  onDuplicate
}: {
  days: string[];
  isLoading: boolean;
  onSelectWeek: (weekStart: string) => void;
  week: TrainingWeek | null;
  weekStack: Record<string, TrainingWeek>;
  weekStarts: string[];
  onCreate: (plannedDate: string) => void;
  onEdit: (workout: Workout) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
}) {
  const selectedWeekStart = week?.weekStartDate;
  const pastStarts = selectedWeekStart ? weekStarts.filter((start) => start < selectedWeekStart) : [];
  const futureStarts = selectedWeekStart ? weekStarts.filter((start) => start > selectedWeekStart) : [];

  return (
    <section className="week-timeline" aria-busy={isLoading}>
      <div className="week-preview-stack" aria-label="Prior weeks">
        {pastStarts.map((start) => (
          <CollapsedWeekCard
            key={start}
            onSelectWeek={onSelectWeek}
            tone="past"
            week={weekStack[start]}
            weekStart={start}
          />
        ))}
      </div>

      <ExpandedWeekBoard
        days={days}
        onCreate={onCreate}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onEdit={onEdit}
        week={week}
      />

      <div className="week-preview-stack" aria-label="Future weeks">
        {futureStarts.map((start) => (
          <CollapsedWeekCard
            key={start}
            onSelectWeek={onSelectWeek}
            tone="future"
            week={weekStack[start]}
            weekStart={start}
          />
        ))}
      </div>
    </section>
  );
}

function CollapsedWeekCard({
  onSelectWeek,
  tone,
  week,
  weekStart
}: {
  onSelectWeek: (weekStart: string) => void;
  tone: "past" | "future";
  week?: TrainingWeek;
  weekStart: string;
}) {
  const range = week ? formatWeekRange(week) : formatWeekRangeFromStart(weekStart);
  const planned = week?.plannedMileage ?? 0;
  const actual = week?.actualMileage ?? 0;
  const hardDays = week?.hardDays ?? 0;
  const longRun = week?.longRunDistance ?? 0;

  return (
    <button
      className={`week-preview-card ${tone}`}
      data-testid="week-preview-card"
      data-week-start={weekStart}
      type="button"
      onClick={() => onSelectWeek(weekStart)}
    >
      <span>{range}</span>
      <strong>
        {formatNumber(actual)} actual / {formatNumber(planned)} planned
      </strong>
      <small>
        {hardDays} hard · {formatNumber(longRun)} long
      </small>
    </button>
  );
}

function ExpandedWeekBoard({
  days,
  week,
  onCreate,
  onEdit,
  onDelete,
  onDuplicate
}: {
  days: string[];
  week: TrainingWeek | null;
  onCreate: (plannedDate: string) => void;
  onEdit: (workout: Workout) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
}) {
  const workouts = week?.workouts ?? [];
  const actualActivities = week?.actualActivities ?? [];

  return (
    <div className="expanded-week-board">
      <section className="summary-grid" aria-label="Week summary">
        <Metric label="Planned" value={`${formatNumber(week?.plannedMileage ?? 0)} mi`} />
        <Metric label="Actual" value={`${formatNumber(week?.actualMileage ?? 0)} mi`} />
        <Metric label="Hard days" value={String(week?.hardDays ?? 0)} />
        <Metric label="Long run" value={`${formatNumber(week?.longRunDistance ?? 0)} mi`} />
      </section>

      <section className="risk-strip" aria-label="Risk indicators">
        <span>Long run {formatNumber(week?.longRunPercentage ?? 0)}%</span>
        <span>{week?.hardDays ?? 0} hard days</span>
        <span>{workouts.length} planned sessions</span>
        <span>{actualActivities.length} actual activities</span>
      </section>

      <section className="week-board" aria-label="Weekly planning board">
        {days.map((dateValue) => {
          const dayWorkouts = workouts.filter((workout) => workout.plannedDate === dateValue);
          const dayActuals = actualActivities.filter((activity) => activity.activityDate === dateValue);
          return (
            <article className="day-column" key={dateValue}>
              <header>
                <div>
                  <strong>{formatWeekday(dateValue)}</strong>
                  <span>{formatShortDate(dateValue)}</span>
                </div>
                <button type="button" title="Add workout" onClick={() => onCreate(dateValue)}>
                  <Plus size={17} />
                </button>
              </header>
              <div className="workout-stack">
                {dayWorkouts.map((workout) => (
                  <WorkoutItem
                    key={workout.id}
                    workout={workout}
                    onDelete={onDelete}
                    onDuplicate={onDuplicate}
                    onEdit={onEdit}
                  />
                ))}
                {dayActuals.map((activity) => (
                  <ActualActivityItem activity={activity} key={activity.id} />
                ))}
              </div>
              <footer>
                {formatNumber(sumDistance(dayWorkouts))} planned · {formatNumber(sumActualDistance(dayActuals))} actual
              </footer>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function ActualActivityItem({ activity }: { activity: ActualActivity }) {
  return (
    <div className="actual-item">
      <div>
        <strong>{activity.name}</strong>
        <span>{activity.sportType} actual</span>
      </div>
      <dl>
        <div>
          <dt>Miles</dt>
          <dd>{formatNumber(activity.distanceMiles)}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{activity.movingTime ? formatDuration(activity.movingTime) : "-"}</dd>
        </div>
      </dl>
      <small>
        {formatTime(activity.startDateLocal)}
        {activity.averageHeartrate ? ` · ${Math.round(activity.averageHeartrate)} bpm` : ""}
      </small>
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
    <div className={`workout-item ${workout.intensityCategory} ${workout.workoutType.replaceAll("_", "-")}`}>
      <div className="workout-title-row">
        <div>
          <strong>{workout.title}</strong>
          <span>{labelForWorkoutType(workout.workoutType)}</span>
        </div>
      </div>
      <dl>
        <div>
          <dt>Plan</dt>
          <dd>{formatNumber(workout.plannedDistance ?? 0)} mi</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{workout.plannedDuration ? `${Math.round(workout.plannedDuration / 60)}m` : "-"}</dd>
        </div>
      </dl>
      <small>{workout.status.replaceAll("_", " ")}</small>
      <div className="workout-controls">
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
                <dt>Time</dt>
                <dd>{activity.movingTime ? formatDuration(activity.movingTime) : "-"}</dd>
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
  const body = await response.json();
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
  const weekParam = new URLSearchParams(window.location.search).get("week");
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
  const url = new URL(window.location.href);
  if (url.searchParams.get("week") === weekStart) {
    return;
  }
  url.searchParams.set("week", weekStart);
  window.history.replaceState({ weekStart }, "", `${url.pathname}${url.search}${url.hash}`);
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

function formatWeekRange(week: TrainingWeek) {
  return `${formatShortDate(week.weekStartDate)}-${formatShortDate(week.weekEndDate)}`;
}

function formatWeekRangeFromStart(start: string) {
  return `${formatShortDate(start)}-${formatShortDate(addDays(start, 6))}`;
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

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function sumDistance(workouts: Workout[]) {
  return workouts.reduce((sum, workout) => sum + (workout.plannedDistance ?? 0), 0);
}

function sumActualDistance(activities: ActualActivity[]) {
  return activities.reduce((sum, activity) => sum + activity.distanceMiles, 0);
}

function formatTime(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(dateValue));
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
