import { CalendarDays, Flag, Pencil, Plus, Route, Trash2 } from "lucide-react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { Placeholder } from "../../components/shared/Placeholder";
import { StatusBanner } from "../../components/shared/StatusBanner";
import { addDays, parseDate, startOfWeek, toDateInputValue } from "../../lib/dates";
import { fetchJson } from "../../lib/api";
import { formatCompactWeekRange, formatNumber, formatPace, formatShortDate } from "../../lib/formatters";
import type {
  GoalRace,
  Mesocycle,
  MesocyclePhase,
  PlanGoal,
  RaceDistance,
  ScaffoldPreview,
  TrainingPlan,
  TrainingPlanSummary
} from "../../types/domain";

type PlansViewProps = {
  onPlanApplied: () => void;
  onSelectWeek: (weekStartDate: string) => void;
  writesBlocked: boolean;
};

type GoalRaceFormState = {
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

type PlanGoalDraft = {
  id?: string;
  category: PlanGoal["category"];
  label: string;
  targetValue: string;
  unit: PlanGoal["unit"];
  flowsDown: boolean;
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
  planGoals: PlanGoalDraft[];
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

const planGoalCategoryOptions: Array<{ value: PlanGoal["category"]; label: string }> = [
  { value: "peak_weekly_mileage", label: "Peak weekly mileage" },
  { value: "weekly_mileage_progression", label: "Weekly mileage progression" },
  { value: "long_run_progression", label: "Long-run progression" },
  { value: "race_time", label: "Race time" },
  { value: "consistency", label: "Consistency" },
  { value: "custom", label: "Custom" }
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
  const [preview, setPreview] = useState<ScaffoldPreview | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const primaryPlan = useMemo(
    () =>
      plans.find((plan) => plan.id === selectedPlanId) ??
      plans.find((plan) => plan.isCurrent) ??
      plans.find((plan) => plan.isUpcoming) ??
      plans[0] ??
      null,
    [plans, selectedPlanId]
  );

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
    setPreview(null);
    setPlanEditor(buildDefaultPlanEditor(goalRace));
  }

  function openEditPlan(plan: TrainingPlan) {
    setPreview(null);
    setPlanEditor(planToEditor(plan));
  }

  async function saveGoalRace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goalRaceForm || writesBlocked) {
      return;
    }
    setIsSaving(true);
    try {
      await fetchJson<GoalRace>("/api/goal-races", {
        method: "POST",
        body: JSON.stringify(goalRacePayload(goalRaceForm))
      });
      setGoalRaceForm(null);
      loadOverview();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save goal race.");
    } finally {
      setIsSaving(false);
    }
  }

  async function previewPlanChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planEditor || writesBlocked) {
      return;
    }
    setIsSaving(true);
    try {
      const endpoint =
        planEditor.mode === "edit" && planEditor.id
          ? `/api/plans/${planEditor.id}/preview`
          : "/api/plans/preview";
      const body = await fetchJson<ScaffoldPreview>(endpoint, {
        method: "POST",
        body: JSON.stringify(planPayload(planEditor))
      });
      setPreview(body);
      setError(null);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Could not preview the plan.");
    } finally {
      setIsSaving(false);
    }
  }

  async function applyPlan() {
    if (!planEditor || !preview || writesBlocked) {
      return;
    }
    setIsSaving(true);
    try {
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
      setPreview(null);
      loadOverview();
      onPlanApplied();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Could not apply the plan.");
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
      await fetchJson(`/api/plans/${plan.id}?clearScaffolding=false`, { method: "DELETE" });
      setSelectedPlan(null);
      setSelectedPlanId(null);
      setPlanEditor(null);
      setPreview(null);
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

      <header className="plans-toolbar">
        <div>
          <p className="eyebrow">Training planning</p>
          <h1>Macrocycle overview</h1>
        </div>
        <div className="plans-toolbar-actions">
          <button type="button" className="ghost-button" onClick={() => setGoalRaceForm(defaultGoalRaceForm())} disabled={writesBlocked}>
            <Plus size={16} />
            Add goal race
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
            <strong>Goal race</strong>
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
              <span>Target time (seconds)</span>
              <input value={goalRaceForm.targetTime} onChange={(event) => setGoalRaceForm((current) => current ? { ...current, targetTime: event.target.value } : current)} />
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
              Save goal race
            </button>
          </div>
        </form>
      ) : null}

      {planEditor ? (
        <form className="plan-card plan-form" onSubmit={previewPlanChanges}>
          <div className="plan-form-header">
            <strong>{planEditor.mode === "edit" ? "Edit training plan" : "Create training plan"}</strong>
            <div className="plan-form-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setPlanEditor((current) => (current ? regeneratePlanEditor(current, goalRaces) : current))}
              >
                Regenerate mesocycles
              </button>
              <button type="button" className="ghost-button" onClick={() => { setPlanEditor(null); setPreview(null); }}>
                Close
              </button>
            </div>
          </div>
          <div className="plan-form-grid">
            <label>
              <span>Name</span>
              <input value={planEditor.name} onChange={(event) => setPlanEditor((current) => current ? { ...current, name: event.target.value } : current)} required />
            </label>
            <label>
              <span>Goal race</span>
              <select value={planEditor.goalRaceId} onChange={(event) => setPlanEditor((current) => current ? regeneratePlanEditor({ ...current, goalRaceId: event.target.value }, goalRaces) : current)}>
                <option value="">Date range only</option>
                {goalRaces.map((goalRace) => (
                  <option key={goalRace.id} value={goalRace.id}>
                    {goalRace.name} · {formatShortDate(goalRace.raceDate)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Start date</span>
              <input type="date" value={planEditor.startDate} onChange={(event) => setPlanEditor((current) => current ? regeneratePlanEditor({ ...current, startDate: event.target.value }, goalRaces) : current)} required />
            </label>
            <label>
              <span>End date</span>
              <input type="date" value={planEditor.endDate} onChange={(event) => setPlanEditor((current) => current ? regeneratePlanEditor({ ...current, endDate: event.target.value }, goalRaces) : current)} required />
            </label>
            <label className="plan-form-grid-span">
              <span>Description</span>
              <textarea value={planEditor.description} onChange={(event) => setPlanEditor((current) => current ? { ...current, description: event.target.value } : current)} rows={2} />
            </label>
          </div>

          <div className="plan-form-section">
            <div className="plan-form-section-header">
              <strong>Mesocycles</strong>
              <span>{planEditor.mesocycles.length} phases</span>
            </div>
            <div className="mesocycle-editor-list">
              {planEditor.mesocycles.map((mesocycle, index) => (
                <article key={`${mesocycle.startDate}-${mesocycle.phase}-${index}`} className="mesocycle-editor-card">
                  <div className="mesocycle-editor-grid">
                    <label>
                      <span>Phase</span>
                      <select value={mesocycle.phase} onChange={(event) => updateMesocycle(setPlanEditor, index, { phase: event.target.value as MesocyclePhase })}>
                        {phaseOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Name</span>
                      <input value={mesocycle.name} onChange={(event) => updateMesocycle(setPlanEditor, index, { name: event.target.value })} />
                    </label>
                    <label>
                      <span>Range</span>
                      <input value={`${formatCompactWeekRange(mesocycle.startDate, mesocycle.endDate)}`} readOnly />
                    </label>
                    <label>
                      <span>Mileage</span>
                      <input value={`${mesocycle.targetMileageStart || "-"} -> ${mesocycle.targetMileageEnd || "-"}`} readOnly />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="plan-form-section">
            <div className="plan-form-section-header">
              <strong>Plan goals</strong>
              <span>{planEditor.planGoals.length}</span>
            </div>
            <div className="plan-goal-list">
              {planEditor.planGoals.map((goal, index) => (
                <article key={`${goal.category}-${index}`} className="plan-goal-chip">
                  <strong>{planGoalCategoryOptions.find((option) => option.value === goal.category)?.label ?? goal.category}</strong>
                  <span>{goal.label}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="plan-form-actions">
            <button type="submit" className="primary-button" disabled={isSaving}>
              Preview changes
            </button>
            {preview ? (
              <button type="button" className="primary-button primary-button--accent" onClick={applyPlan} disabled={isSaving}>
                {planEditor.mode === "edit" ? "Apply update" : "Create plan"}
              </button>
            ) : null}
          </div>

          {preview ? (
            <div className="plan-preview">
              <div className="plan-form-section-header">
                <strong>Scaffolding preview</strong>
                <span>{preview.weeks.length} week changes</span>
              </div>
              {preview.warnings.length ? (
                <ul className="plan-preview-warnings">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              <div className="plan-preview-list">
                {preview.weeks.map((week) => (
                  <article key={week.weekStartDate} className={`plan-preview-row plan-preview-row--${week.action}`}>
                    <div>
                      <strong>{formatCompactWeekRange(week.weekStartDate, addDays(week.weekStartDate, 6))}</strong>
                      <span>{week.action.replaceAll("_", " ")}</span>
                    </div>
                    <p>
                      {week.changes.map((change) => `${change.field}: ${String(change.from ?? "-")} -> ${String(change.to ?? "-")}`).join(" · ") || "No field writes required."}
                    </p>
                    {week.warnings.length ? <small>{week.warnings.join(" ")}</small> : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </form>
      ) : null}

      {plans.length === 0 && !planEditor ? (
        <Placeholder
          title="Plan"
          detail="Create a training plan to scaffold weekly targets and phase context into the Week tab."
          icon={<CalendarDays size={22} />}
        />
      ) : null}

      {plans.length > 0 ? (
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

      {selectedPlan ? (
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
                <span>Goal race</span>
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

          <article className="plan-card">
            <div className="plan-form-section-header">
              <strong>Goal races</strong>
              <span>{goalRaces.length}</span>
            </div>
            <div className="plan-goal-race-list">
              {goalRaces.map((goalRace) => (
                <article key={goalRace.id} className="goal-race-card">
                  <strong>{goalRace.name}</strong>
                  <span>{formatShortDate(goalRace.raceDate)} · {distanceLabel(goalRace.distance)}</span>
                  <small>{goalRace.targetPaceSecondsPerMile ? formatPace(goalRace.targetPaceSecondsPerMile, 1) : "No target pace set"}</small>
                </article>
              ))}
            </div>
          </article>
        </div>
      ) : null}
    </section>
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

function goalRacePayload(form: GoalRaceFormState) {
  return {
    name: form.name,
    raceDate: form.raceDate,
    distance: form.distance,
    distanceMiles: form.distance === "other" ? optionalNumber(form.distanceMiles) : null,
    targetTime: optionalNumber(form.targetTime),
    priority: form.priority,
    location: form.location,
    altitudeContext: form.altitudeContext,
    notes: form.notes
  };
}

function buildDefaultPlanEditor(goalRace: GoalRace | null): PlanEditorState {
  const startDate = normalizeToMonday(goalRace?.raceDate ? addDays(goalRace.raceDate, -7 * 11) : toDateInputValue(new Date()));
  const endDate = goalRace ? normalizeToSunday(goalRace.raceDate) : normalizeToSunday(addDays(startDate, 7 * 11));
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
    planGoals: defaultPlanGoals(goalRace)
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
    planGoals: plan.planGoals.map((goal) => ({
      id: goal.id,
      category: goal.category,
      label: goal.label,
      targetValue: toInputNumber(goal.targetValue),
      unit: goal.unit,
      flowsDown: goal.flowsDown,
      notes: goal.notes
    }))
  };
}

function regeneratePlanEditor(editor: PlanEditorState, goalRaces: GoalRace[]) {
  const goalRace = goalRaces.find((race) => race.id === editor.goalRaceId) ?? null;
  return {
    ...editor,
    endDate: goalRace ? normalizeToSunday(goalRace.raceDate) : normalizeToSunday(editor.endDate),
    mesocycles: generateMesocycles(editor.startDate, goalRace ? normalizeToSunday(goalRace.raceDate) : editor.endDate, goalRace),
    planGoals: defaultPlanGoals(goalRace)
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
    const raceWeeks = take(1);
    const taperWeeks = take(totalWeeks >= 10 ? 2 : totalWeeks >= 6 ? 1 : 0);
    const specificWeeks = take(totalWeeks >= 8 ? 3 : totalWeeks >= 5 ? 2 : 1);
    const buildWeeks = take(totalWeeks >= 6 ? 2 : 0);
    const baseWeeks = take(remaining);
    recipe = [
      { phase: "base" as const, count: baseWeeks },
      { phase: "build" as const, count: buildWeeks },
      { phase: "specific" as const, count: specificWeeks },
      { phase: "taper" as const, count: taperWeeks },
      { phase: "race" as const, count: raceWeeks }
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
      downWeekCadence: item.phase === "taper" || item.phase === "race" ? "" : "4",
      downWeekReductionPct: "20",
      notes: ""
    };
  });
}

function defaultPlanGoals(goalRace: GoalRace | null): PlanGoalDraft[] {
  return [
    {
      category: "peak_weekly_mileage",
      label: `Peak near ${suggestedPeak(goalRace)} miles`,
      targetValue: String(suggestedPeak(goalRace)),
      unit: "mi",
      flowsDown: true,
      notes: ""
    },
    ...(goalRace?.targetTime
      ? [
          {
            category: "race_time" as const,
            label: `Race target ${goalRace.targetTime} seconds`,
            targetValue: String(goalRace.targetTime),
            unit: "time" as const,
            flowsDown: false,
            notes: ""
          }
        ]
      : [])
  ];
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
    mesocycles: editor.mesocycles.map((mesocycle) => ({
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
    planGoals: editor.planGoals.map((goal) => ({
      id: goal.id,
      category: goal.category,
      label: goal.label,
      targetValue: optionalNumber(goal.targetValue),
      unit: goal.unit,
      flowsDown: goal.flowsDown,
      notes: goal.notes
    }))
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
      mesocycles: current.mesocycles.map((mesocycle, mesocycleIndex) =>
        mesocycleIndex === index ? { ...mesocycle, ...updates } : mesocycle
      )
    };
  });
}

function enumerateWeeks(startDate: string, endDate: string) {
  const starts: string[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 7)) {
    starts.push(cursor);
  }
  return starts;
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
