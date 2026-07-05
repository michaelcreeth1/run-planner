import { ArrowDown, ArrowUp, CalendarDays, CheckCircle, Flag, Pencil, Plus, Route, Trash2 } from "lucide-react";
import type { CSSProperties, Dispatch, FormEvent, PointerEvent as ReactPointerEvent, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { Placeholder } from "../../components/shared/Placeholder";
import { StatusBanner } from "../../components/shared/StatusBanner";
import { addDays, parseDate, startOfWeek, toDateInputValue } from "../../lib/dates";
import { fetchJson } from "../../lib/api";
import { formatCompactWeekRange, formatNumber, formatPace, formatShortDate } from "../../lib/formatters";
import { goalCategories } from "../../lib/options";
import type {
  GoalRace,
  Mesocycle,
  MesocyclePhase,
  RaceDistance,
  RecurringGoal,
  TrainingPlan,
  TrainingPlanSummary,
  WeekGoalCategory
} from "../../types/domain";

type PlansViewProps = {
  onPlanApplied: () => void;
  onSelectWeek: (weekStartDate: string) => void;
  writesBlocked: boolean;
};

type GoalRaceFormState = {
  id?: string;
  name: string;
  raceDate: string;
  distance: RaceDistance;
  distanceMiles: string;
  targetTime: string;
  priority: GoalRace["priority"];
  location: string;
  altitudeContext: string;
  notes: string;
};

type MesocycleDraft = {
  id?: string;
  orderIndex: number;
  name: string;
  phase: MesocyclePhase;
  startDate: string;
  endDate: string;
  targetMileageStart: string;
  targetMileageEnd: string;
  longRunStart: string;
  longRunEnd: string;
  downWeekCadence: string;
  downWeekReductionPct: string;
  notes: string;
};

type RecurringGoalDraft = {
  id?: string;
  category: WeekGoalCategory;
  label: string;
  targetValue: string;
  notes: string;
};

type PlanEditorState = {
  id?: string;
  mode: "create" | "edit";
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  goalRaceId: string;
  notes: string;
  mesocycles: MesocycleDraft[];
  recurringGoals: RecurringGoalDraft[];
};

const phaseOptions: Array<{ value: MesocyclePhase; label: string }> = [
  { value: "base", label: "Base" },
  { value: "build", label: "Build" },
  { value: "specific", label: "Specific" },
  { value: "taper", label: "Taper" },
  { value: "race", label: "Race" },
  { value: "recovery", label: "Recovery" },
  { value: "maintenance", label: "Maintenance" }
];

const distanceOptions: Array<{ value: RaceDistance; label: string }> = [
  { value: "5k", label: "5K" },
  { value: "10k", label: "10K" },
  { value: "half_marathon", label: "Half marathon" },
  { value: "marathon", label: "Marathon" },
  { value: "other", label: "Other" }
];


export function PlansView({ onPlanApplied, onSelectWeek, writesBlocked }: PlansViewProps) {
  const [plans, setPlans] = useState<TrainingPlanSummary[]>([]);
  const [goalRaces, setGoalRaces] = useState<GoalRace[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<TrainingPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [goalRaceForm, setGoalRaceForm] = useState<GoalRaceFormState | null>(null);
  const [planEditor, setPlanEditor] = useState<PlanEditorState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedMesocycleIndex, setSelectedMesocycleIndex] = useState(0);
  const [lastSavedGoalRaceId, setLastSavedGoalRaceId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const primaryPlan = useMemo(
    () =>
      plans.find((plan) => plan.id === selectedPlanId) ??
      plans.find((plan) => plan.isCurrent) ??
      plans.find((plan) => plan.isUpcoming) ??
      plans[0] ??
      null,
    [plans, selectedPlanId]
  );
  const planEditorGoalRace = planEditor
    ? goalRaces.find((goalRace) => goalRace.id === planEditor.goalRaceId) ?? null
    : null;
  const hasActiveEditor = Boolean(goalRaceForm || planEditor);

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    const nextPlanId = primaryPlan?.id ?? null;
    if (!nextPlanId) {
      setSelectedPlan(null);
      return;
    }
    setSelectedPlanId(nextPlanId);
    fetchJson<TrainingPlan>(`/api/plans/${nextPlanId}`)
      .then((body) => {
        setSelectedPlan(body);
        setError(null);
      })
      .catch((loadError: Error) => setError(loadError.message));
  }, [primaryPlan?.id]);

  function loadOverview() {
    setIsLoading(true);
    Promise.all([fetchJson<TrainingPlanSummary[]>("/api/plans"), fetchJson<GoalRace[]>("/api/goal-races")])
      .then(([planBody, goalRaceBody]) => {
        setPlans(planBody);
        setGoalRaces(goalRaceBody);
        setError(null);
      })
      .catch((loadError: Error) => setError(loadError.message))
      .finally(() => setIsLoading(false));
  }

  function openCreatePlan() {
    const goalRace = goalRaces[0] ?? null;
    setSuccess(null);
    setGoalRaceForm(null);
    setSelectedMesocycleIndex(0);
    setPlanEditor(buildDefaultPlanEditor(goalRace));
  }

  function openEditPlan(plan: TrainingPlan) {
    setSuccess(null);
    setGoalRaceForm(null);
    setSelectedMesocycleIndex(0);
    setPlanEditor(planToEditor(plan));
  }

  function updateRecurringGoal(index: number, updates: Partial<RecurringGoalDraft>) {
    setPlanEditor((current) =>
      current
        ? {
            ...current,
            recurringGoals: current.recurringGoals.map((goal, goalIndex) =>
              goalIndex === index ? { ...goal, ...updates } : goal
            )
          }
        : current
    );
  }

  function addRecurringGoal() {
    setPlanEditor((current) =>
      current
        ? {
            ...current,
            recurringGoals: [
              ...current.recurringGoals,
              { category: "custom", label: "", targetValue: "", notes: "" }
            ]
          }
        : current
    );
  }

  function removeRecurringGoal(index: number) {
    setPlanEditor((current) =>
      current
        ? {
            ...current,
            recurringGoals: current.recurringGoals.filter((_, goalIndex) => goalIndex !== index)
          }
        : current
    );
  }

  function openCreateGoalRace() {
    setSuccess(null);
    setPlanEditor(null);
    setGoalRaceForm(defaultGoalRaceForm());
  }

  function openEditGoalRace(goalRace: GoalRace) {
    setSuccess(null);
    setPlanEditor(null);
    setGoalRaceForm(goalRaceToForm(goalRace));
  }

  async function openPlanForGoalRace(goalRace: GoalRace, linkedPlan: TrainingPlanSummary | undefined) {
    setSuccess(null);
    setGoalRaceForm(null);
    setSelectedMesocycleIndex(0);
    if (!linkedPlan) {
      setPlanEditor(buildDefaultPlanEditor(goalRace));
      return;
    }

    setIsSaving(true);
    try {
      const plan =
        selectedPlan?.id === linkedPlan.id
          ? selectedPlan
          : await fetchJson<TrainingPlan>(`/api/plans/${linkedPlan.id}`);
      setSelectedPlanId(plan.id);
      setSelectedPlan(plan);
      openEditPlan(plan);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the plan.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveGoalRace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goalRaceForm || writesBlocked) {
      return;
    }
    if (goalRaceForm.targetTime.trim() && parseDurationHms(goalRaceForm.targetTime) === null) {
      setError("Target time must use H:MM:SS or MM:SS, like 1:42:30.");
      setSuccess(null);
      return;
    }
    setIsSaving(true);
    try {
      const isEditing = Boolean(goalRaceForm.id);
      const savedGoalRace = await fetchJson<GoalRace>(
        isEditing ? `/api/goal-races/${goalRaceForm.id}` : "/api/goal-races",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(goalRacePayload(goalRaceForm))
        }
      );
      const nextGoalRaces = upsertGoalRace(goalRaces, savedGoalRace);
      setGoalRaces(nextGoalRaces);
      setLastSavedGoalRaceId(savedGoalRace.id);
      setPlans((current) =>
        current.map((plan) =>
          plan.goalRaceId === savedGoalRace.id ? { ...plan, goalRaceName: savedGoalRace.name } : plan
        )
      );
      setSelectedPlan((current) =>
        current?.goalRaceId === savedGoalRace.id
          ? { ...current, goalRaceName: savedGoalRace.name, goalRace: savedGoalRace }
          : current
      );
      setSuccess(
        isEditing
          ? `${savedGoalRace.name} was updated.`
          : `${savedGoalRace.name} was saved and is ready for planning.`
      );
      setError(null);
      setGoalRaceForm(null);
      if (isEditing) {
        return;
      } else {
        setSelectedMesocycleIndex(0);
        setPlanEditor((current) =>
          current
            ? { ...current, goalRaceId: savedGoalRace.id }
            : buildDefaultPlanEditor(savedGoalRace)
        );
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save race.");
      setSuccess(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteGoalRace(goalRace: GoalRace) {
    if (
      writesBlocked ||
      !window.confirm(`Delete ${goalRace.name}? Plans that use it will become date-range plans.`)
    ) {
      return;
    }
    setIsSaving(true);
    try {
      await fetchJson(`/api/goal-races/${goalRace.id}`, { method: "DELETE" });
      setGoalRaces((current) => current.filter((race) => race.id !== goalRace.id));
      setLastSavedGoalRaceId((current) => (current === goalRace.id ? null : current));
      setGoalRaceForm((current) => (current?.id === goalRace.id ? null : current));
      setPlans((current) =>
        current.map((plan) =>
          plan.goalRaceId === goalRace.id ? { ...plan, goalRaceId: null, goalRaceName: null } : plan
        )
      );
      setSelectedPlan((current) =>
        current?.goalRaceId === goalRace.id
          ? { ...current, goalRaceId: null, goalRaceName: null, goalRace: null }
          : current
      );
      setPlanEditor((current) =>
        current?.goalRaceId === goalRace.id ? { ...current, goalRaceId: "" } : current
      );
      setSuccess(`${goalRace.name} was deleted.`);
      setError(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete race.");
      setSuccess(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planEditor || writesBlocked) {
      return;
    }
    setIsSaving(true);
    try {
      setSuccess(null);
      setError(null);
      const endpoint =
        planEditor.mode === "edit" && planEditor.id ? `/api/plans/${planEditor.id}` : "/api/plans";
      const method = planEditor.mode === "edit" ? "PUT" : "POST";
      const saved = await fetchJson<TrainingPlan>(endpoint, {
        method,
        body: JSON.stringify(planPayload(planEditor))
      });
      setSelectedPlanId(saved.id);
      setSelectedPlan(saved);
      setPlanEditor(null);
      setSuccess(`${saved.name} was ${planEditor.mode === "edit" ? "updated" : "created"}.`);
      loadOverview();
      onPlanApplied();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Could not save the plan.");
      setSuccess(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function deletePlan(plan: TrainingPlan) {
    if (
      writesBlocked ||
      !window.confirm("Delete this training plan? Weeks, workouts, and goals will be preserved.")
    ) {
      return;
    }
    try {
      setSuccess(null);
      await fetchJson(`/api/plans/${plan.id}?clearScaffolding=false`, { method: "DELETE" });
      setSelectedPlan(null);
      setSelectedPlanId(null);
      setPlanEditor(null);
      loadOverview();
      onPlanApplied();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the plan.");
    }
  }

  if (isLoading) {
    return <Placeholder title="Plan" detail="Loading training plans." icon={<Route size={22} />} />;
  }

  return (
    <section className="plans-view">
      {error ? <StatusBanner tone="warning" icon={<Flag size={16} />} title="Plan issue" detail={error} /> : null}
      {success ? <StatusBanner tone="success" icon={<CheckCircle size={16} />} title="Saved" detail={success} /> : null}

      <header className="plans-toolbar">
        <div>
          <p className="eyebrow">Training planning</p>
          <h1>Macrocycle overview</h1>
        </div>
        <div className="plans-toolbar-actions">
          <button type="button" className="ghost-button" onClick={openCreateGoalRace} disabled={writesBlocked}>
            <Plus size={16} />
            Add race
          </button>
          <button type="button" className="primary-button" onClick={openCreatePlan} disabled={writesBlocked}>
            <Plus size={16} />
            Create training plan
          </button>
        </div>
      </header>

      {goalRaceForm ? (
        <form className="plan-card plan-form" onSubmit={saveGoalRace}>
          <div className="plan-form-header">
            <strong>{goalRaceForm.id ? "Edit race" : "Race"}</strong>
            <button type="button" className="ghost-button" onClick={() => setGoalRaceForm(null)}>
              Close
            </button>
          </div>
          <div className="plan-form-grid">
            <label>
              <span>Name</span>
              <input value={goalRaceForm.name} onChange={(event) => setGoalRaceForm((current) => current ? { ...current, name: event.target.value } : current)} required />
            </label>
            <label>
              <span>Race date</span>
              <input type="date" value={goalRaceForm.raceDate} onChange={(event) => setGoalRaceForm((current) => current ? { ...current, raceDate: event.target.value } : current)} required />
            </label>
            <label>
              <span>Distance</span>
              <select value={goalRaceForm.distance} onChange={(event) => setGoalRaceForm((current) => current ? { ...current, distance: event.target.value as RaceDistance } : current)}>
                {distanceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {goalRaceForm.distance === "other" ? (
              <label>
                <span>Custom miles</span>
                <input value={goalRaceForm.distanceMiles} onChange={(event) => setGoalRaceForm((current) => current ? { ...current, distanceMiles: event.target.value } : current)} />
              </label>
            ) : null}
            <label>
              <span>Target time</span>
              <input
                placeholder="1:42:30"
                value={goalRaceForm.targetTime}
                onChange={(event) => setGoalRaceForm((current) => current ? { ...current, targetTime: event.target.value } : current)}
              />
            </label>
            <label>
              <span>Priority</span>
              <select value={goalRaceForm.priority} onChange={(event) => setGoalRaceForm((current) => current ? { ...current, priority: event.target.value as GoalRace["priority"] } : current)}>
                {["A", "B", "C"].map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="plan-form-actions">
            <button type="submit" className="primary-button" disabled={isSaving}>
              {goalRaceForm.id ? "Update race" : "Save race"}
            </button>
          </div>
        </form>
      ) : null}

      {!hasActiveEditor && goalRaces.length > 0 ? (
        <article className="plan-card">
          <div className="plan-form-section-header">
            <div className="section-title-row">
              <strong>Races</strong>
              <span>{goalRaces.length} saved</span>
            </div>
          </div>
          <div className="plan-goal-race-list">
            {goalRaces.map((goalRace) => {
              const linkedPlan = plans.find((plan) => plan.goalRaceId === goalRace.id);
              return (
                <article
                  key={goalRace.id}
                  className={`goal-race-card ${goalRace.id === lastSavedGoalRaceId ? "goal-race-card--new" : ""}`}
                >
                  <div className="goal-race-card-main">
                    <strong>{goalRace.name}</strong>
                    <span>{formatShortDate(goalRace.raceDate)} · {distanceLabel(goalRace.distance)}</span>
                    <small>
                      {goalRace.targetTime ? formatDurationHms(goalRace.targetTime) : "No target time set"}
                      {goalRace.targetPaceSecondsPerMile ? ` · ${formatPace(goalRace.targetPaceSecondsPerMile, 1)}` : ""}
                    </small>
                  </div>
                  <div className="goal-race-card-actions">
                    <button
                      type="button"
                      className="icon-button"
                      disabled={writesBlocked}
                      title="Edit race"
                      aria-label={`Edit ${goalRace.name}`}
                      onClick={() => openEditGoalRace(goalRace)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      disabled={writesBlocked || isSaving}
                      title="Delete race"
                      aria-label={`Delete ${goalRace.name}`}
                      onClick={() => deleteGoalRace(goalRace)}
                    >
                      <Trash2 size={16} />
                    </button>
                    <button
                      type="button"
                      className="primary-button goal-race-plan-button"
                      disabled={writesBlocked || isSaving}
                      onClick={() => openPlanForGoalRace(goalRace, linkedPlan)}
                    >
                      {linkedPlan ? "Edit Plan" : "Create Plan"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </article>
      ) : null}

      {planEditor ? (
        <form className="plan-card plan-form" onSubmit={savePlan}>
          <div className="plan-form-header">
            <div>
              <strong>
                {planEditor.mode === "edit" ? "Edit training plan" : "Create training plan"}
                {planEditorGoalRace ? ` for ${planEditorGoalRace.name}` : ""}
              </strong>
              {planEditorGoalRace ? (
                <span>{formatShortDate(planEditorGoalRace.raceDate)}</span>
              ) : (
                <span>Date range only</span>
              )}
            </div>
          </div>
          <div className="plan-form-grid">
            <label>
              <span>Name</span>
              <input value={planEditor.name} onChange={(event) => setPlanEditor((current) => current ? { ...current, name: event.target.value } : current)} required />
            </label>
            <label>
              <span>Start date</span>
              <input type="date" value={planEditor.startDate} onChange={(event) => setPlanEditor((current) => current ? { ...current, startDate: normalizeToMonday(event.target.value) } : current)} required />
            </label>
            <label>
              <span>End date</span>
              <input type="date" value={planEditor.endDate} onChange={(event) => updatePlanEndDate(setPlanEditor, event.target.value)} required />
            </label>
            <label className="plan-form-grid-span">
              <span>Description</span>
              <textarea value={planEditor.description} onChange={(event) => setPlanEditor((current) => current ? { ...current, description: event.target.value } : current)} rows={2} />
            </label>
          </div>

          <div className="plan-form-section">
            <div className="plan-form-section-header">
              <div>
                <strong>Mesocycles</strong>
                <span>
                  {planEditor.mesocycles.length} phases
                  {planEditorGoalRace ? ` · race milestone ${formatShortDate(planEditorGoalRace.raceDate)}` : ""}
                </span>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  addMesocycle(setPlanEditor);
                  setSelectedMesocycleIndex(planEditor.mesocycles.length);
                }}
              >
                <Plus size={16} />
                Add phase
              </button>
            </div>
            <MesocycleTimelineEditor
              editor={planEditor}
              selectedIndex={selectedMesocycleIndex}
              setEditor={setPlanEditor}
              onSelectIndex={setSelectedMesocycleIndex}
            />
            <MesocycleInspector
              editor={planEditor}
              selectedIndex={selectedMesocycleIndex}
              setEditor={setPlanEditor}
              onSelectIndex={setSelectedMesocycleIndex}
            />
          </div>

          <div className="plan-form-section">
            <div className="plan-form-section-header">
              <strong>Recurring weekly goals</strong>
              <span>{planEditor.recurringGoals.length}</span>
            </div>
            <p className="plan-form-hint">
              Added to every week this plan scaffolds. Weekly mileage and long-run targets come from
              the mesocycles above; use these for standing intent like strength or rest days.
            </p>
            <div className="plan-recurring-goal-list">
              {planEditor.recurringGoals.map((goal, index) => (
                <div key={goal.id ?? `draft-${index}`} className="plan-recurring-goal-row">
                  <label>
                    <span>Category</span>
                    <select
                      value={goal.category}
                      onChange={(event) => updateRecurringGoal(index, { category: event.target.value as WeekGoalCategory })}
                    >
                      {goalCategories.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Goal</span>
                    <input
                      value={goal.label}
                      placeholder="Complete 1 strength session"
                      onChange={(event) => updateRecurringGoal(index, { label: event.target.value })}
                      required
                    />
                  </label>
                  <label>
                    <span>Target</span>
                    <input
                      value={goal.targetValue}
                      inputMode="decimal"
                      onChange={(event) => updateRecurringGoal(index, { targetValue: event.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost-button ghost-button--danger"
                    onClick={() => removeRecurringGoal(index)}
                  >
                    <Trash2 size={16} />
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="ghost-button" onClick={addRecurringGoal}>
                <Plus size={16} />
                Add weekly goal
              </button>
            </div>
          </div>

          <div className="plan-form-actions">
            <button type="submit" className="primary-button" disabled={isSaving}>
              {planEditor.mode === "edit" ? "Save plan" : "Create plan"}
            </button>
            <button type="button" className="ghost-button" onClick={() => setPlanEditor(null)}>
              Close
            </button>
          </div>
        </form>
      ) : null}

      {plans.length === 0 && !hasActiveEditor ? (
        <Placeholder
          title="Plan"
          detail="Create a training plan to scaffold weekly targets and phase context into the Week tab."
          icon={<CalendarDays size={22} />}
        />
      ) : null}

      {!hasActiveEditor && plans.length > 0 ? (
        <div className="plan-card">
          <div className="plan-form-section-header">
            <strong>All plans</strong>
            <span>{plans.length}</span>
          </div>
          <div className="plan-goal-race-list">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                className={`plan-week-bar ${selectedPlan?.id === plan.id ? "plan-week-bar--manual" : ""}`}
                onClick={() => setSelectedPlanId(plan.id)}
              >
                <strong>{plan.name}</strong>
                <span>{formatCompactWeekRange(plan.startDate, plan.endDate)}</span>
                <small>{plan.goalRaceName ?? "Date-range plan"}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!hasActiveEditor && selectedPlan ? (
        <div className="plan-detail-grid">
          <article className="plan-card plan-hero">
            <div className="plan-hero-header">
              <div>
                <p className="eyebrow">{selectedPlan.status.replaceAll("_", " ")}</p>
                <h2>{selectedPlan.name}</h2>
                <p>{selectedPlan.description || "Long-range structure for week planning."}</p>
              </div>
              <div className="plans-toolbar-actions">
                <button type="button" className="ghost-button" onClick={() => openEditPlan(selectedPlan)} disabled={writesBlocked}>
                  <Pencil size={16} />
                  Edit
                </button>
                <button type="button" className="ghost-button ghost-button--danger" onClick={() => deletePlan(selectedPlan)} disabled={writesBlocked}>
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>
            <div className="plan-hero-metrics">
              <div>
                <span>Range</span>
                <strong>{formatCompactWeekRange(selectedPlan.startDate, selectedPlan.endDate)}</strong>
              </div>
              <div>
                <span>Race</span>
                <strong>{selectedPlan.goalRace?.name ?? "Date-range plan"}</strong>
              </div>
              <div>
                <span>Target pace</span>
                <strong>{selectedPlan.goalRace?.targetPaceSecondsPerMile ? formatPace(selectedPlan.goalRace.targetPaceSecondsPerMile, 1) : "-"}</strong>
              </div>
            </div>
            <div className="plan-timeline">
              {selectedPlan.weekSummaries.map((week) => (
                <button key={week.weekStartDate} type="button" className={`plan-week-bar plan-week-bar--${week.mesocyclePhase ?? "base"} ${week.hasManualOverride ? "plan-week-bar--manual" : ""}`} onClick={() => onSelectWeek(week.weekStartDate)}>
                  <span>{formatShortDate(week.weekStartDate)}</span>
                  <strong>{week.targetMileage ? `${formatNumber(week.targetMileage)} mi` : "--"}</strong>
                  <small>{week.warning ?? `${formatNumber(week.plannedMileage)} planned · ${formatNumber(week.actualMileage)} actual`}</small>
                </button>
              ))}
            </div>
          </article>

          <article className="plan-card">
            <div className="plan-form-section-header">
              <strong>Mesocycles</strong>
              <span>{selectedPlan.mesocycles.length}</span>
            </div>
            <div className="mesocycle-overview-list">
              {selectedPlan.mesocycles.map((mesocycle) => (
                <article key={mesocycle.id} className="mesocycle-overview-card">
                  <header>
                    <strong>{mesocycle.name || phaseLabel(mesocycle.phase)}</strong>
                    <span>{phaseLabel(mesocycle.phase)}</span>
                  </header>
                  <p>{formatCompactWeekRange(mesocycle.startDate, mesocycle.endDate)}</p>
                  <small>
                    {mesocycle.targetMileageStart ?? "-"} {"->"} {mesocycle.targetMileageEnd ?? "-"} mi
                    {mesocycle.downWeekCadence ? ` · down week every ${mesocycle.downWeekCadence}` : ""}
                  </small>
                </article>
              ))}
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}

function MesocycleTimelineEditor({
  editor,
  onSelectIndex,
  selectedIndex,
  setEditor
}: {
  editor: PlanEditorState;
  onSelectIndex: (index: number) => void;
  selectedIndex: number;
  setEditor: Dispatch<SetStateAction<PlanEditorState | null>>;
}) {
  const [drag, setDrag] = useState<{ boundaryIndex: number; pointerId: number; rect: DOMRect } | null>(null);
  const weekStarts = enumerateWeeks(editor.startDate, editor.endDate);
  const totalWeeks = Math.max(weeksBetween(editor.startDate, addDays(editor.endDate, 1)), 1);
  const boundaryPositions = mesocycleBoundaryPositions(editor);
  const draggableBoundaries = boundaryPositions
    .map((boundaryWeek, boundaryIndex) => ({ boundaryIndex, boundaryWeek }))
    .filter(({ boundaryIndex }) => boundaryIndex > 0 && boundaryIndex < editor.mesocycles.length);

  function weekIndexFromClientX(clientX: number, rect: DOMRect) {
    const ratio = (clientX - rect.left) / rect.width;
    return Math.round(clamp(ratio, 0, 1) * totalWeeks);
  }

  useEffect(() => {
    if (!drag) {
      return;
    }
    const activeDrag = drag;

    function moveBoundary(event: PointerEvent) {
      if (event.pointerId !== activeDrag.pointerId) {
        return;
      }
      event.preventDefault();
      const weekIndex = weekIndexFromClientX(event.clientX, activeDrag.rect);
      setEditor((current) => (current ? applyBoundaryDrag(current, activeDrag.boundaryIndex, weekIndex) : current));
    }

    function endBoundaryDrag(event: PointerEvent) {
      if (event.pointerId === activeDrag.pointerId) {
        setDrag(null);
      }
    }

    window.addEventListener("pointermove", moveBoundary);
    window.addEventListener("pointerup", endBoundaryDrag);
    window.addEventListener("pointercancel", endBoundaryDrag);
    return () => {
      window.removeEventListener("pointermove", moveBoundary);
      window.removeEventListener("pointerup", endBoundaryDrag);
      window.removeEventListener("pointercancel", endBoundaryDrag);
    };
  }, [drag, setEditor, totalWeeks]);

  function beginBoundaryDrag(event: ReactPointerEvent<HTMLButtonElement>, boundaryIndex: number) {
    const track = event.currentTarget.closest(".mesocycle-timeline-track");
    if (!(track instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    const rect = track.getBoundingClientRect();
    const weekIndex = weekIndexFromClientX(event.clientX, rect);
    setDrag({ boundaryIndex, pointerId: event.pointerId, rect });
    setEditor((current) => (current ? applyBoundaryDrag(current, boundaryIndex, weekIndex) : current));
  }

  return (
    <div className="mesocycle-timeline-editor">
      <div className="mesocycle-timeline-scale">
        {weekStarts.map((weekStart, index) => (
          <span key={weekStart} style={{ left: `${(index / totalWeeks) * 100}%` }}>
            {index % 2 === 0 || weekStarts.length <= 8 ? formatShortDate(weekStart) : ""}
          </span>
        ))}
      </div>
      <div className="mesocycle-timeline-track" style={{ "--week-count": totalWeeks } as CSSProperties}>
        {editor.mesocycles.map((mesocycle, index) => {
          const startWeek = boundaryPositions[index] ?? weeksBetween(editor.startDate, mesocycle.startDate);
          const endWeek = boundaryPositions[index + 1] ?? totalWeeks;
          return (
            <button
              key={`${mesocycle.id ?? "draft"}-${index}`}
              type="button"
              className={[
                "mesocycle-timeline-bar",
                `mesocycle-timeline-bar--${mesocycle.phase}`,
                index === 0 ? "first" : "",
                index === editor.mesocycles.length - 1 ? "last" : "",
                selectedIndex === index ? "selected" : ""
              ].filter(Boolean).join(" ")}
              style={{
                left: `${(startWeek / totalWeeks) * 100}%`,
                right: `${Math.max(0, ((totalWeeks - endWeek) / totalWeeks) * 100)}%`
              }}
              onClick={() => onSelectIndex(index)}
            >
              <strong>{mesocycle.name || phaseLabel(mesocycle.phase)}</strong>
              <span>{formatCompactWeekRange(mesocycle.startDate, mesocycle.endDate)}</span>
            </button>
          );
        })}
        {draggableBoundaries.map(({ boundaryWeek, boundaryIndex }) => (
          <button
            key={`boundary-${boundaryIndex}`}
            type="button"
            className={[
              "mesocycle-boundary-handle",
              drag?.boundaryIndex === boundaryIndex ? "dragging" : ""
            ].filter(Boolean).join(" ")}
            style={{ left: `${(boundaryWeek / totalWeeks) * 100}%` }}
            title="Drag to resize phases"
            aria-label="Drag to resize mesocycle boundary"
            onPointerDown={(event) => beginBoundaryDrag(event, boundaryIndex)}
          />
        ))}
      </div>
    </div>
  );
}

function MesocycleInspector({
  editor,
  onSelectIndex,
  selectedIndex,
  setEditor
}: {
  editor: PlanEditorState;
  onSelectIndex: (index: number) => void;
  selectedIndex: number;
  setEditor: Dispatch<SetStateAction<PlanEditorState | null>>;
}) {
  const selected = editor.mesocycles[Math.min(selectedIndex, editor.mesocycles.length - 1)];
  const index = Math.max(0, Math.min(selectedIndex, editor.mesocycles.length - 1));
  if (!selected) {
    return null;
  }

  return (
    <article className="mesocycle-inspector">
      <header className="mesocycle-editor-card-header">
        <div>
          <strong>{selected.name || phaseLabel(selected.phase)}</strong>
          <span>{formatCompactWeekRange(selected.startDate, selected.endDate)}</span>
        </div>
        <div className="mesocycle-editor-actions">
          <button
            type="button"
            className="icon-button"
            title="Move phase earlier"
            aria-label="Move phase earlier"
            disabled={index === 0}
            onClick={() => {
              moveMesocycle(setEditor, index, -1);
              onSelectIndex(index - 1);
            }}
          >
            <ArrowUp size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Move phase later"
            aria-label="Move phase later"
            disabled={index === editor.mesocycles.length - 1}
            onClick={() => {
              moveMesocycle(setEditor, index, 1);
              onSelectIndex(index + 1);
            }}
          >
            <ArrowDown size={16} />
          </button>
          <button
            type="button"
            className="icon-button icon-button--danger"
            title="Delete phase"
            aria-label="Delete phase"
            disabled={editor.mesocycles.length <= 1}
            onClick={() => {
              removeMesocycle(setEditor, index);
              onSelectIndex(Math.max(index - 1, 0));
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>
      <div className="mesocycle-editor-grid">
        <label>
          <span>Phase</span>
          <select value={selected.phase} onChange={(event) => updateMesocycle(setEditor, index, { phase: event.target.value as MesocyclePhase })}>
            {phaseOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Name</span>
          <input value={selected.name} onChange={(event) => updateMesocycle(setEditor, index, { name: event.target.value })} />
        </label>
        <label>
          <span>Start</span>
          <input
            type="date"
            value={selected.startDate}
            onChange={(event) => updateMesocycleBoundary(setEditor, index, normalizeToMonday(event.target.value))}
          />
        </label>
        <label>
          <span>End</span>
          <input
            type="date"
            value={selected.endDate}
            onChange={(event) => updateMesocycleBoundary(setEditor, index + 1, addDays(normalizeToSunday(event.target.value), 1))}
          />
        </label>
        <label>
          <span>Mileage start</span>
          <input inputMode="decimal" value={selected.targetMileageStart} onChange={(event) => updateMesocycle(setEditor, index, { targetMileageStart: event.target.value })} />
        </label>
        <label>
          <span>Mileage end</span>
          <input inputMode="decimal" value={selected.targetMileageEnd} onChange={(event) => updateMesocycle(setEditor, index, { targetMileageEnd: event.target.value })} />
        </label>
        <label>
          <span>Long run start</span>
          <input inputMode="decimal" value={selected.longRunStart} onChange={(event) => updateMesocycle(setEditor, index, { longRunStart: event.target.value })} />
        </label>
        <label>
          <span>Long run end</span>
          <input inputMode="decimal" value={selected.longRunEnd} onChange={(event) => updateMesocycle(setEditor, index, { longRunEnd: event.target.value })} />
        </label>
        <label>
          <span>Down cadence</span>
          <input inputMode="numeric" value={selected.downWeekCadence} onChange={(event) => updateMesocycle(setEditor, index, { downWeekCadence: event.target.value })} />
        </label>
        <label>
          <span>Reduction %</span>
          <input inputMode="decimal" value={selected.downWeekReductionPct} onChange={(event) => updateMesocycle(setEditor, index, { downWeekReductionPct: event.target.value })} />
        </label>
        <label className="plan-form-grid-span">
          <span>Notes</span>
          <textarea value={selected.notes} onChange={(event) => updateMesocycle(setEditor, index, { notes: event.target.value })} rows={2} />
        </label>
      </div>
    </article>
  );
}

function defaultGoalRaceForm(): GoalRaceFormState {
  return {
    name: "",
    raceDate: toDateInputValue(new Date()),
    distance: "half_marathon",
    distanceMiles: "",
    targetTime: "",
    priority: "A",
    location: "",
    altitudeContext: "",
    notes: ""
  };
}

function goalRaceToForm(goalRace: GoalRace): GoalRaceFormState {
  return {
    id: goalRace.id,
    name: goalRace.name,
    raceDate: goalRace.raceDate,
    distance: goalRace.distance,
    distanceMiles: goalRace.distanceMiles === null ? "" : String(goalRace.distanceMiles),
    targetTime: formatDurationHms(goalRace.targetTime),
    priority: goalRace.priority,
    location: goalRace.location,
    altitudeContext: goalRace.altitudeContext,
    notes: goalRace.notes
  };
}

function upsertGoalRace(goalRaces: GoalRace[], savedGoalRace: GoalRace) {
  const merged = [
    savedGoalRace,
    ...goalRaces.filter((goalRace) => goalRace.id !== savedGoalRace.id)
  ];
  return merged.sort((left, right) => left.raceDate.localeCompare(right.raceDate) || left.name.localeCompare(right.name));
}

function goalRacePayload(form: GoalRaceFormState) {
  return {
    name: form.name,
    raceDate: form.raceDate,
    distance: form.distance,
    distanceMiles: form.distance === "other" ? optionalNumber(form.distanceMiles) : null,
    targetTime: parseDurationHms(form.targetTime),
    priority: form.priority,
    location: form.location,
    altitudeContext: form.altitudeContext,
    notes: form.notes
  };
}

function formatDurationHms(totalSeconds: number | null | undefined) {
  if (!totalSeconds) {
    return "";
  }
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`;
  }
  return `${minutes}:${remainder}`;
}

function parseDurationHms(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.includes(":")) {
    return optionalNumber(trimmed);
  }
  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0) || parts.length < 2 || parts.length > 3) {
    return null;
  }
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  return Math.round(hours * 3600 + minutes * 60 + seconds);
}

function buildDefaultPlanEditor(goalRace: GoalRace | null): PlanEditorState {
  const startDate = normalizeToMonday(addDays(toDateInputValue(new Date()), 7));
  const raceEndDate = goalRace ? normalizeToSunday(goalRace.raceDate) : null;
  const fallbackEndDate = normalizeToSunday(addDays(startDate, 7 * 11));
  const endDate = raceEndDate && raceEndDate >= startDate ? raceEndDate : fallbackEndDate;
  return {
    id: undefined,
    mode: "create",
    name: goalRace ? `${goalRace.name} plan` : "New training plan",
    description: "",
    startDate,
    endDate,
    goalRaceId: goalRace?.id ?? "",
    notes: "",
    mesocycles: generateMesocycles(startDate, endDate, goalRace),
    recurringGoals: []
  };
}

function planToEditor(plan: TrainingPlan): PlanEditorState {
  return {
    id: plan.id,
    mode: "edit",
    name: plan.name,
    description: plan.description,
    startDate: plan.startDate,
    endDate: plan.endDate,
    goalRaceId: plan.goalRaceId ?? "",
    notes: plan.notes,
    mesocycles: plan.mesocycles.map((mesocycle) => ({
      id: mesocycle.id,
      orderIndex: mesocycle.orderIndex,
      name: mesocycle.name,
      phase: mesocycle.phase,
      startDate: mesocycle.startDate,
      endDate: mesocycle.endDate,
      targetMileageStart: toInputNumber(mesocycle.targetMileageStart),
      targetMileageEnd: toInputNumber(mesocycle.targetMileageEnd),
      longRunStart: toInputNumber(mesocycle.longRunStart),
      longRunEnd: toInputNumber(mesocycle.longRunEnd),
      downWeekCadence: toInputNumber(mesocycle.downWeekCadence),
      downWeekReductionPct: toInputNumber(mesocycle.downWeekReductionPct) || "20",
      notes: mesocycle.notes
    })),
    recurringGoals: plan.recurringGoals.map((goal) => ({
      id: goal.id,
      category: goal.category,
      label: goal.label,
      targetValue: toInputNumber(goal.targetValue),
      notes: goal.notes
    }))
  };
}

function generateMesocycles(startDate: string, endDate: string, goalRace: GoalRace | null): MesocycleDraft[] {
  const weeks = enumerateWeeks(startDate, endDate);
  const totalWeeks = weeks.length;

  // Allocate from the race backward so the recipe can never claim more weeks
  // than the date range contains; base absorbs whatever remains.
  let remaining = totalWeeks;
  const take = (count: number) => {
    const taken = Math.min(Math.max(count, 0), remaining);
    remaining -= taken;
    return taken;
  };

  let recipe: Array<{ phase: MesocyclePhase; count: number }>;
  if (goalRace) {
    const taperWeeks = take(totalWeeks >= 10 ? 2 : totalWeeks >= 6 ? 1 : 0);
    const specificWeeks = take(totalWeeks >= 8 ? 3 : totalWeeks >= 5 ? 2 : 1);
    const buildWeeks = take(totalWeeks >= 6 ? 2 : 0);
    const baseWeeks = take(remaining);
    recipe = [
      { phase: "base" as const, count: baseWeeks },
      { phase: "build" as const, count: buildWeeks },
      { phase: "specific" as const, count: specificWeeks },
      { phase: "taper" as const, count: taperWeeks }
    ];
  } else {
    const maintenanceWeeks = take(totalWeeks >= 3 ? 1 : 0);
    const buildWeeks = take(Math.floor(totalWeeks / 3));
    const baseWeeks = take(remaining);
    recipe = [
      { phase: "base" as const, count: baseWeeks },
      { phase: "build" as const, count: buildWeeks },
      { phase: "maintenance" as const, count: maintenanceWeeks }
    ];
  }
  recipe = recipe.filter((item) => item.count > 0);

  const baseline = suggestedBaseline(goalRace);
  const peak = suggestedPeak(goalRace);
  let cursorIndex = 0;
  return recipe.map((item, orderIndex) => {
    const firstWeek = weeks[cursorIndex];
    const lastWeek = weeks[cursorIndex + item.count - 1];
    cursorIndex += item.count;
    const startMileage = mileageRangeForPhase(item.phase, baseline, peak)[0];
    const endMileage = mileageRangeForPhase(item.phase, baseline, peak)[1];
    return {
      orderIndex,
      name: phaseLabel(item.phase),
      phase: item.phase,
      startDate: firstWeek,
      endDate: addDays(lastWeek, 6),
      targetMileageStart: toInputNumber(startMileage),
      targetMileageEnd: toInputNumber(endMileage),
      longRunStart: toInputNumber(Math.max(Math.round(startMileage * 0.28), 6)),
      longRunEnd: toInputNumber(Math.max(Math.round(endMileage * 0.28), 6)),
      downWeekCadence: item.phase === "taper" ? "" : "4",
      downWeekReductionPct: "20",
      notes: ""
    };
  });
}

const recurringGoalUnits: Record<WeekGoalCategory, RecurringGoal["unit"]> = {
  mileage: "mi",
  long_run: "mi",
  sessions: "sessions",
  quality: "sessions",
  strength: "sessions",
  recovery: "days",
  custom: "custom"
};

function recurringGoalPayload(goal: RecurringGoalDraft) {
  const targetValue = optionalNumber(goal.targetValue);
  const evaluationMode = goal.category !== "custom" && targetValue !== null ? "at_least" : "manual";
  return {
    id: goal.id,
    category: goal.category,
    goalType: "achievement",
    label: goal.label,
    description: "",
    targetValue,
    minAcceptable: evaluationMode === "at_least" ? targetValue : null,
    maxAcceptable: null,
    unit: recurringGoalUnits[goal.category],
    evaluationMode,
    priority: "secondary",
    notes: goal.notes
  };
}

function planPayload(editor: PlanEditorState) {
  return {
    name: editor.name,
    description: editor.description,
    goalRaceId: editor.goalRaceId || null,
    startDate: editor.startDate,
    endDate: editor.endDate,
    status: "active",
    notes: editor.notes,
    mesocycles: normalizeMesocycleOrder(editor.mesocycles).map((mesocycle) => ({
      id: mesocycle.id,
      orderIndex: mesocycle.orderIndex,
      name: mesocycle.name,
      phase: mesocycle.phase,
      startDate: mesocycle.startDate,
      endDate: mesocycle.endDate,
      targetMileageStart: optionalNumber(mesocycle.targetMileageStart),
      targetMileageEnd: optionalNumber(mesocycle.targetMileageEnd),
      longRunStart: optionalNumber(mesocycle.longRunStart),
      longRunEnd: optionalNumber(mesocycle.longRunEnd),
      downWeekCadence: optionalNumber(mesocycle.downWeekCadence),
      downWeekReductionPct: optionalNumber(mesocycle.downWeekReductionPct) ?? 20,
      notes: mesocycle.notes
    })),
    recurringGoals: editor.recurringGoals.map(recurringGoalPayload)
  };
}

function mesocycleBoundaryPositions(editor: PlanEditorState) {
  return [
    0,
    ...editor.mesocycles.map((mesocycle) => weeksBetween(editor.startDate, addDays(mesocycle.endDate, 1)))
  ];
}

function applyBoundaryDrag(
  editor: PlanEditorState,
  boundaryIndex: number,
  requestedWeekIndex: number
) {
  const boundaries = mesocycleBoundaryPositions(editor);
  if (boundaryIndex === editor.mesocycles.length) {
    return resizePlanEndToWeekCount(editor, requestedWeekIndex);
  }

  const minWeek = boundaryIndex === 0 ? Math.min(0, requestedWeekIndex) : boundaries[boundaryIndex - 1] + 1;
  const maxWeek = boundaries[boundaryIndex + 1] - 1;
  const weekIndex = Math.round(clamp(requestedWeekIndex, minWeek, maxWeek));
  const nextMesocycles = [...editor.mesocycles];

  if (boundaryIndex === 0) {
    const nextStartDate = addDays(editor.startDate, weekIndex * 7);
    nextMesocycles[0] = {
      ...nextMesocycles[0],
      startDate: nextStartDate
    };
    return {
      ...editor,
      startDate: nextStartDate,
      mesocycles: normalizeMesocycleOrder(nextMesocycles)
    };
  }

  const leftIndex = boundaryIndex - 1;
  const rightIndex = boundaryIndex;
  nextMesocycles[leftIndex] = {
    ...nextMesocycles[leftIndex],
    endDate: addDays(editor.startDate, weekIndex * 7 - 1)
  };
  nextMesocycles[rightIndex] = {
    ...nextMesocycles[rightIndex],
    startDate: addDays(editor.startDate, weekIndex * 7)
  };
  return {
    ...editor,
    mesocycles: normalizeMesocycleOrder(nextMesocycles)
  };
}

function updateMesocycleBoundary(
  setPlanEditor: Dispatch<SetStateAction<PlanEditorState | null>>,
  boundaryIndex: number,
  boundaryDate: string
) {
  setPlanEditor((current) => {
    if (!current) {
      return current;
    }
    return applyBoundaryDrag(current, boundaryIndex, weeksBetween(current.startDate, boundaryDate));
  });
}

function updatePlanEndDate(
  setPlanEditor: Dispatch<SetStateAction<PlanEditorState | null>>,
  rawEndDate: string
) {
  const endDate = normalizeToSunday(rawEndDate);
  setPlanEditor((current) => {
    if (!current) {
      return current;
    }
    if (current.mesocycles.length === 0) {
      return { ...current, endDate };
    }
    return resizePlanEndToWeekCount(current, weeksBetween(current.startDate, addDays(endDate, 1)));
  });
}

function resizePlanEndToWeekCount(editor: PlanEditorState, requestedWeekCount: number) {
  const roundedRequestedWeekCount = Math.round(requestedWeekCount);
  if (!Number.isFinite(roundedRequestedWeekCount)) {
    return editor;
  }

  if (editor.mesocycles.length === 0) {
    const weekCount = Math.max(1, roundedRequestedWeekCount);
    return {
      ...editor,
      endDate: addDays(editor.startDate, weekCount * 7 - 1)
    };
  }

  const weekCounts = editor.mesocycles.map((mesocycle) =>
    Math.max(1, weeksBetween(mesocycle.startDate, addDays(mesocycle.endDate, 1)))
  );
  const currentWeekCount = weekCounts.reduce((sum, weekCount) => sum + weekCount, 0);
  const shrinkCapacity = weekCounts.filter((weekCount) => weekCount > 1).length;
  const minimumWeekCount = currentWeekCount - shrinkCapacity;
  const targetWeekCount = Math.max(minimumWeekCount, roundedRequestedWeekCount);
  let weeksToRemove = Math.max(0, currentWeekCount - targetWeekCount);

  // Pull from the end backward, with each existing phase donating at most one week.
  for (let index = weekCounts.length - 1; index >= 0 && weeksToRemove > 0; index -= 1) {
    if (weekCounts[index] <= 1) {
      continue;
    }
    weekCounts[index] -= 1;
    weeksToRemove -= 1;
  }

  if (targetWeekCount > currentWeekCount) {
    weekCounts[weekCounts.length - 1] += targetWeekCount - currentWeekCount;
  }

  let cursor = editor.startDate;
  const nextMesocycles = editor.mesocycles.map((mesocycle, index) => {
    const startDate = cursor;
    const endDate = addDays(startDate, weekCounts[index] * 7 - 1);
    cursor = addDays(endDate, 1);
    return {
      ...mesocycle,
      startDate,
      endDate
    };
  });

  return {
    ...editor,
    endDate: nextMesocycles.at(-1)?.endDate ?? editor.endDate,
    mesocycles: normalizeMesocycleOrder(nextMesocycles)
  };
}

function updateMesocycle(
  setPlanEditor: Dispatch<SetStateAction<PlanEditorState | null>>,
  index: number,
  updates: Partial<MesocycleDraft>
) {
  setPlanEditor((current) => {
    if (!current) {
      return current;
    }
    return {
      ...current,
      mesocycles: normalizeMesocycleOrder(
        current.mesocycles.map((mesocycle, mesocycleIndex) =>
          mesocycleIndex === index ? { ...mesocycle, ...updates } : mesocycle
        )
      )
    };
  });
}

function addMesocycle(setPlanEditor: Dispatch<SetStateAction<PlanEditorState | null>>) {
  setPlanEditor((current) => {
    if (!current) {
      return current;
    }
    const last = current.mesocycles.at(-1);
    const nextStart = last ? normalizeToMonday(addDays(last.endDate, 1)) : normalizeToMonday(current.startDate);
    const nextEnd = addDays(nextStart, 6);
    const previousMileage = optionalNumber(last?.targetMileageEnd) ?? 30;
    const nextPhase: MesocycleDraft = {
      orderIndex: current.mesocycles.length,
      name: "Maintenance",
      phase: "maintenance",
      startDate: nextStart,
      endDate: nextEnd,
      targetMileageStart: toInputNumber(previousMileage),
      targetMileageEnd: toInputNumber(previousMileage),
      longRunStart: toInputNumber(Math.max(Math.round(previousMileage * 0.28), 6)),
      longRunEnd: toInputNumber(Math.max(Math.round(previousMileage * 0.28), 6)),
      downWeekCadence: "",
      downWeekReductionPct: "20",
      notes: ""
    };
    return {
      ...current,
      endDate: nextEnd > current.endDate ? nextEnd : current.endDate,
      mesocycles: normalizeMesocycleOrder([...current.mesocycles, nextPhase])
    };
  });
}

function removeMesocycle(
  setPlanEditor: Dispatch<SetStateAction<PlanEditorState | null>>,
  index: number
) {
  setPlanEditor((current) => {
    if (!current || current.mesocycles.length <= 1) {
      return current;
    }
    const removed = current.mesocycles[index];
    const nextMesocycles = current.mesocycles.filter((_, mesocycleIndex) => mesocycleIndex !== index);
    if (nextMesocycles[index]) {
      nextMesocycles[index] = {
        ...nextMesocycles[index],
        startDate: removed.startDate
      };
    } else if (nextMesocycles.length) {
      nextMesocycles[nextMesocycles.length - 1] = {
        ...nextMesocycles[nextMesocycles.length - 1],
        endDate: removed.endDate
      };
    }
    return {
      ...current,
      mesocycles: normalizeMesocycleOrder(nextMesocycles)
    };
  });
}

function moveMesocycle(
  setPlanEditor: Dispatch<SetStateAction<PlanEditorState | null>>,
  index: number,
  direction: -1 | 1
) {
  setPlanEditor((current) => {
    if (!current) {
      return current;
    }
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= current.mesocycles.length) {
      return current;
    }
    const nextMesocycles = [...current.mesocycles];
    const sourceContent = mesocycleContent(nextMesocycles[index]);
    const targetContent = mesocycleContent(nextMesocycles[targetIndex]);
    nextMesocycles[index] = { ...nextMesocycles[index], ...targetContent };
    nextMesocycles[targetIndex] = { ...nextMesocycles[targetIndex], ...sourceContent };
    return {
      ...current,
      mesocycles: normalizeMesocycleOrder(nextMesocycles)
    };
  });
}

function mesocycleContent(mesocycle: MesocycleDraft) {
  return {
    name: mesocycle.name,
    phase: mesocycle.phase,
    targetMileageStart: mesocycle.targetMileageStart,
    targetMileageEnd: mesocycle.targetMileageEnd,
    longRunStart: mesocycle.longRunStart,
    longRunEnd: mesocycle.longRunEnd,
    downWeekCadence: mesocycle.downWeekCadence,
    downWeekReductionPct: mesocycle.downWeekReductionPct,
    notes: mesocycle.notes
  };
}

function normalizeMesocycleOrder(mesocycles: MesocycleDraft[]) {
  return mesocycles.map((mesocycle, index) => ({
    ...mesocycle,
    orderIndex: index
  }));
}

function enumerateWeeks(startDate: string, endDate: string) {
  const starts: string[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 7)) {
    starts.push(cursor);
  }
  return starts;
}

function weeksBetween(startDate: string, endDate: string) {
  return Math.round((parseDate(endDate).getTime() - parseDate(startDate).getTime()) / (7 * 86400000));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeToMonday(value: string) {
  return startOfWeek(parseDate(value));
}

function normalizeToSunday(value: string) {
  return addDays(normalizeToMonday(value), 6);
}

function suggestedBaseline(goalRace: GoalRace | null) {
  if (!goalRace) {
    return 28;
  }
  if (goalRace.distance === "marathon") {
    return 38;
  }
  if (goalRace.distance === "half_marathon") {
    return 30;
  }
  return 24;
}

function suggestedPeak(goalRace: GoalRace | null) {
  if (!goalRace) {
    return 34;
  }
  if (goalRace.distance === "marathon") {
    return 52;
  }
  if (goalRace.distance === "half_marathon") {
    return 40;
  }
  return 32;
}

function mileageRangeForPhase(phase: MesocyclePhase, baseline: number, peak: number): [number, number] {
  if (phase === "base") {
    return [baseline, baseline + 4];
  }
  if (phase === "build") {
    return [baseline + 4, peak - 2];
  }
  if (phase === "specific") {
    return [peak - 2, peak];
  }
  if (phase === "taper") {
    return [Math.round(peak * 0.82), Math.round(peak * 0.65)];
  }
  if (phase === "race") {
    return [Math.round(peak * 0.6), Math.round(peak * 0.45)];
  }
  if (phase === "recovery") {
    return [Math.round(baseline * 0.65), Math.round(baseline * 0.55)];
  }
  return [baseline, baseline];
}

function phaseLabel(phase: MesocyclePhase) {
  return phaseOptions.find((option) => option.value === phase)?.label ?? phase;
}

function distanceLabel(distance: RaceDistance) {
  return distanceOptions.find((option) => option.value === distance)?.label ?? distance;
}

function optionalNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInputNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}
