import { ArrowDown, ArrowUp, CalendarDays, CheckCircle, ChevronDown, Flag, Pencil, Plus, Route, Trash2 } from "lucide-react";
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
  MesocyclePhase,
  PlanWeekSummary,
  RecurringGoal,
  TrainingPlan,
  TrainingPlanSummary,
  WeekGoalCategory
} from "../../types/domain";

type PlansViewProps = {
  onPlanApplied: () => void;
  onSelectPlan: (planId: string | null) => void;
  onSelectWeek: (weekStartDate: string) => void;
  requestedPlanId: string | null;
  writesBlocked: boolean;
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

export function PlansView({
  onPlanApplied,
  onSelectPlan,
  onSelectWeek,
  requestedPlanId,
  writesBlocked
}: PlansViewProps) {
  const [plans, setPlans] = useState<TrainingPlanSummary[]>([]);
  const [goalRaces, setGoalRaces] = useState<GoalRace[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(requestedPlanId);
  const [selectedPlan, setSelectedPlan] = useState<TrainingPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planEditor, setPlanEditor] = useState<PlanEditorState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedMesocycleIndex, setSelectedMesocycleIndex] = useState(0);
  const [success, setSuccess] = useState<string | null>(null);

  const plansByStartDate = useMemo(
    () =>
      [...plans].sort(
        (left, right) => left.startDate.localeCompare(right.startDate) || left.name.localeCompare(right.name)
      ),
    [plans]
  );
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
  const hasActiveEditor = Boolean(planEditor);
  const today = toDateInputValue(new Date());

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    setSelectedPlanId(requestedPlanId);
  }, [requestedPlanId]);

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
    setSuccess(null);
    setSelectedMesocycleIndex(0);
    setPlanEditor(buildDefaultPlanEditor(null));
  }

  function openEditPlan(plan: TrainingPlan) {
    setSuccess(null);
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

  function changePlanRace(goalRaceId: string) {
    const goalRace = goalRaces.find((race) => race.id === goalRaceId) ?? null;
    setSelectedMesocycleIndex(0);
    setPlanEditor((current) => {
      if (!current) {
        return current;
      }
      // A new plan is reseeded around the chosen race; an existing plan only relinks.
      if (current.mode === "create") {
        return buildDefaultPlanEditor(goalRace);
      }
      return { ...current, goalRaceId };
    });
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
      onSelectPlan(saved.id);
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

  async function deletePlan(planId: string) {
    if (
      writesBlocked ||
      !window.confirm("Delete this training plan? Weeks, workouts, and goals will be preserved.")
    ) {
      return;
    }
    try {
      setSuccess(null);
      await fetchJson(`/api/plans/${planId}?clearScaffolding=false`, { method: "DELETE" });
      setSelectedPlan(null);
      setSelectedPlanId(null);
      onSelectPlan(null);
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
          <button type="button" className="primary-button" onClick={openCreatePlan} disabled={writesBlocked}>
            <Plus size={16} />
            Create training plan
          </button>
        </div>
      </header>

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
          <div className="plan-form-grid plan-form-grid--plan-details">
            <label>
              <span>Name</span>
              <input value={planEditor.name} onChange={(event) => setPlanEditor((current) => current ? { ...current, name: event.target.value } : current)} required />
            </label>
            <div className="mesocycle-field-group">
              <span>Race</span>
              <div className="plan-race-row">
                <select
                  aria-label="Race"
                  value={planEditor.goalRaceId}
                  onChange={(event) => changePlanRace(event.target.value)}
                >
                  <option value="">No race · date range</option>
                  {goalRaces.map((goalRace) => (
                    <option key={goalRace.id} value={goalRace.id}>
                      {goalRace.name} · {formatShortDate(goalRace.raceDate)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label>
              <span>Start date</span>
              <input type="date" value={planEditor.startDate} onChange={(event) => updatePlanStartDate(setPlanEditor, event.target.value)} required />
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
              <div className="section-title-row">
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
            {planEditor.mode === "edit" && planEditor.id ? (
              <button
                type="button"
                className="ghost-button ghost-button--danger plan-form-actions-end"
                disabled={writesBlocked}
                onClick={() => deletePlan(planEditor.id as string)}
              >
                <Trash2 size={16} />
                Delete plan
              </button>
            ) : null}
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

      {!hasActiveEditor && selectedPlan ? (
        <article className="plan-card plan-hero">
          {plansByStartDate.length > 1 ? (
            <nav className="plan-switcher" aria-label="Switch plan">
              {plansByStartDate.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  className={`plan-switcher-pill ${selectedPlan.id === plan.id ? "plan-switcher-pill--active" : ""}`}
                  onClick={() => {
                    setSelectedPlanId(plan.id);
                    onSelectPlan(plan.id);
                  }}
                >
                  {plan.name}
                </button>
              ))}
            </nav>
          ) : null}
          <div className="plan-hero-header">
            <div>
              <p className="eyebrow">{selectedPlan.status.replaceAll("_", " ")}</p>
              <h2>{selectedPlan.name}</h2>
              <p>{selectedPlan.description || "Long-range structure for week planning."}</p>
            </div>
            <div className="plans-toolbar-actions">
              <button type="button" className="ghost-button" onClick={() => openEditPlan(selectedPlan)} disabled={writesBlocked}>
                <Pencil size={16} />
                Edit plan
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
            <div>
              <span>Peak week</span>
              <strong>{peakWeekMileage(selectedPlan.weekSummaries) ? `${formatNumber(peakWeekMileage(selectedPlan.weekSummaries))} mi` : "-"}</strong>
            </div>
          </div>
          <PlanShape weeks={selectedPlan.weekSummaries} onSelectWeek={onSelectWeek} />
          <div className="plan-timeline">
            {groupWeeksByMesocycle(selectedPlan.weekSummaries).map((group, groupIndex) => (
              <section key={`${group.mesocycleId ?? "none"}-${groupIndex}`} className="plan-timeline-group">
                <header className={`plan-timeline-group-header plan-phase--${group.phase ?? "base"}`}>
                  <div className="plan-timeline-group-title">
                    <span className="plan-phase-dot" aria-hidden="true" />
                    <strong>{group.name ?? (group.phase ? phaseLabel(group.phase) : "Weeks")}</strong>
                    <span>
                      {formatCompactWeekRange(group.weeks[0].week.weekStartDate, group.weeks[group.weeks.length - 1].week.weekEndDate)}
                      {" · "}
                      {group.weeks.length} {group.weeks.length === 1 ? "week" : "weeks"}
                    </span>
                  </div>
                </header>
                <div className="plan-timeline-weeks">
                  {group.weeks.map(({ week, index }) => {
                    const hasActivity = week.plannedMileage > 0 || week.actualMileage > 0;
                    const isCurrentWeek = week.weekStartDate <= today && today <= week.weekEndDate;
                    return (
                      <button
                        key={week.weekStartDate}
                        type="button"
                        className={`plan-week-bar ${week.hasManualOverride ? "plan-week-bar--manual" : ""} ${isCurrentWeek ? "plan-week-bar--current" : ""}`}
                        onClick={() => onSelectWeek(week.weekStartDate)}
                      >
                        <span className="plan-week-bar-label">
                          <span className="plan-week-bar-date">
                            W{index + 1} · {formatShortDate(week.weekStartDate)}
                          </span>
                          {week.isDownWeek ? <em className="plan-week-bar-flag">Down</em> : null}
                        </span>
                        <strong>{week.targetMileage ? `${formatNumber(week.targetMileage)} mi` : "--"}</strong>
                        {week.warning || hasActivity ? (
                          <small>
                            {week.warning ?? `${formatNumber(week.plannedMileage)} planned · ${formatNumber(week.actualMileage)} actual`}
                          </small>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </article>
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
      const weekIndex = weekIndexFromClientX(event.clientX, activeDrag.rect, totalWeeks);
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
    const weekIndex = weekIndexFromClientX(event.clientX, rect, totalWeeks);
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
  const selectedWeekCount = Math.max(1, weeksBetween(selected.startDate, addDays(selected.endDate, 1)));
  const longRunStartAuto = autoLongRun(selected.targetMileageStart);
  const longRunEndAuto = autoLongRun(selected.targetMileageEnd);
  const hasLongRunOverride =
    optionalNumber(selected.longRunStart) !== null || optionalNumber(selected.longRunEnd) !== null;
  const longRunStartEffective = optionalNumber(selected.longRunStart) ?? longRunStartAuto;
  const longRunEndEffective = optionalNumber(selected.longRunEnd) ?? longRunEndAuto;

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
          <select
            value={selected.phase}
            onChange={(event) => {
              const nextPhase = event.target.value as MesocyclePhase;
              updateMesocycle(setEditor, index, {
                phase: nextPhase,
                name:
                  !selected.name || selected.name === phaseLabel(selected.phase)
                    ? phaseLabel(nextPhase)
                    : selected.name
              });
            }}
          >
            {phaseOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Length (weeks)</span>
          <input
            type="number"
            min={1}
            value={selectedWeekCount}
            onChange={(event) => {
              const weekCount = Number(event.target.value);
              if (Number.isFinite(weekCount) && weekCount >= 1) {
                resizeMesocycleLength(setEditor, index, Math.round(weekCount));
              }
            }}
          />
        </label>
        <div className="mesocycle-field-group">
          <span>Weekly mileage</span>
          <div className="mesocycle-mileage-inputs">
            <input
              inputMode="decimal"
              aria-label="Mileage at phase start"
              value={selected.targetMileageStart}
              onChange={(event) => updateMesocycle(setEditor, index, { targetMileageStart: event.target.value })}
            />
            <span aria-hidden="true">→</span>
            <input
              inputMode="decimal"
              aria-label="Mileage at phase end"
              value={selected.targetMileageEnd}
              onChange={(event) => updateMesocycle(setEditor, index, { targetMileageEnd: event.target.value })}
            />
            <span>mi</span>
          </div>
        </div>
        <label>
          <span>Down weeks</span>
          <select
            value={selected.downWeekCadence}
            onChange={(event) => updateMesocycle(setEditor, index, { downWeekCadence: event.target.value })}
          >
            {cadenceOptions(selected.downWeekCadence).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {longRunStartEffective !== null || longRunEndEffective !== null ? (
        <p className="mesocycle-auto-hint">
          Long run {longRunStartEffective ?? "–"} → {longRunEndEffective ?? "–"} mi ·{" "}
          {hasLongRunOverride ? "custom" : "auto"}
        </p>
      ) : null}
      <details className="mesocycle-advanced">
        <summary>
          <ChevronDown size={14} />
          Advanced
        </summary>
        <div className="mesocycle-editor-grid">
          <label>
            <span>Name</span>
            <input value={selected.name} onChange={(event) => updateMesocycle(setEditor, index, { name: event.target.value })} />
          </label>
          <label>
            <span>Long run start (mi)</span>
            <input
              inputMode="decimal"
              placeholder={longRunStartAuto !== null ? `Auto: ${longRunStartAuto}` : "Auto"}
              value={selected.longRunStart}
              onChange={(event) => updateMesocycle(setEditor, index, { longRunStart: event.target.value })}
            />
          </label>
          <label>
            <span>Long run end (mi)</span>
            <input
              inputMode="decimal"
              placeholder={longRunEndAuto !== null ? `Auto: ${longRunEndAuto}` : "Auto"}
              value={selected.longRunEnd}
              onChange={(event) => updateMesocycle(setEditor, index, { longRunEnd: event.target.value })}
            />
          </label>
          <label>
            <span>Down week reduction %</span>
            <input inputMode="decimal" value={selected.downWeekReductionPct} onChange={(event) => updateMesocycle(setEditor, index, { downWeekReductionPct: event.target.value })} />
          </label>
          <label className="plan-form-grid-span">
            <span>Notes</span>
            <textarea value={selected.notes} onChange={(event) => updateMesocycle(setEditor, index, { notes: event.target.value })} rows={2} />
          </label>
        </div>
      </details>
    </article>
  );
}

type PlanWeekGroup = {
  mesocycleId: string | null;
  phase: MesocyclePhase | null;
  name: string | null;
  weeks: Array<{ week: PlanWeekSummary; index: number }>;
};

function groupWeeksByMesocycle(weeks: PlanWeekSummary[]): PlanWeekGroup[] {
  const groups: PlanWeekGroup[] = [];
  weeks.forEach((week, index) => {
    const last = groups[groups.length - 1];
    if (last && last.mesocycleId === week.mesocycleId && last.phase === week.mesocyclePhase) {
      last.weeks.push({ week, index });
    } else {
      groups.push({
        mesocycleId: week.mesocycleId,
        phase: week.mesocyclePhase,
        name: week.mesocycleName,
        weeks: [{ week, index }]
      });
    }
  });
  return groups;
}

function peakWeekMileage(weeks: PlanWeekSummary[]) {
  return Math.max(0, ...weeks.map((week) => week.targetMileage ?? 0));
}

function currentWeekMarker(weeks: PlanWeekSummary[]): { index: number; label: string } | null {
  const today = toDateInputValue(new Date());
  const currentIndex = weeks.findIndex((week) => week.weekStartDate <= today && today <= week.weekEndDate);
  if (currentIndex >= 0) {
    return { index: currentIndex, label: "Now" };
  }
  if (weeks.length > 0 && today < weeks[0].weekStartDate) {
    return { index: 0, label: "Next" };
  }
  return null;
}

function PlanShape({
  onSelectWeek,
  weeks
}: {
  onSelectWeek: (weekStartDate: string) => void;
  weeks: PlanWeekSummary[];
}) {
  const maxMileage = peakWeekMileage(weeks);
  if (weeks.length < 2 || maxMileage <= 0) {
    return null;
  }
  const marker = currentWeekMarker(weeks);
  return (
    <div className="plan-shape">
      <div className="plan-shape-peak">
        <span>Peak {formatNumber(maxMileage)} mi/wk</span>
      </div>
      <div className="plan-shape-bars">
        {weeks.map((week, index) => {
          const target = week.targetMileage ?? 0;
          const detail = target ? `${formatNumber(target)} mi target` : "no target";
          const label = `Week ${index + 1}, ${formatShortDate(week.weekStartDate)}: ${detail}${week.isDownWeek ? ", down week" : ""}`;
          return (
            <button
              key={week.weekStartDate}
              type="button"
              className={`plan-shape-bar plan-phase--${week.mesocyclePhase ?? "base"} ${week.isDownWeek ? "plan-shape-bar--down" : ""}`}
              style={{ height: `${Math.max((target / maxMileage) * 100, 4)}%` }}
              title={label}
              aria-label={label}
              onClick={() => onSelectWeek(week.weekStartDate)}
            />
          );
        })}
        {marker ? (
          <div
            className="plan-shape-now"
            style={{ left: `${((marker.index + 0.5) / weeks.length) * 100}%` }}
            aria-hidden="true"
          >
            <span>{marker.label}</span>
          </div>
        ) : null}
      </div>
      <div className="plan-shape-phases" aria-hidden="true">
        {groupWeeksByMesocycle(weeks).map((group, groupIndex) => (
          <span
            key={`${group.mesocycleId ?? "none"}-${groupIndex}`}
            className={`plan-phase--${group.phase ?? "base"}`}
            style={{ flexGrow: group.weeks.length }}
          >
            {group.name ?? (group.phase ? phaseLabel(group.phase) : "")}
          </span>
        ))}
      </div>
      <div className="plan-shape-axis">
        <span>{formatShortDate(weeks[0].weekStartDate)}</span>
        <span>{formatShortDate(weeks[weeks.length - 1].weekEndDate)}</span>
      </div>
    </div>
  );
}

function ordinalWeek(cadence: number) {
  return cadence === 2 ? "2nd" : cadence === 3 ? "3rd" : `${cadence}th`;
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
      longRunStart:
        mesocycle.longRunStart === autoLongRun(mesocycle.targetMileageStart)
          ? ""
          : toInputNumber(mesocycle.longRunStart),
      longRunEnd:
        mesocycle.longRunEnd === autoLongRun(mesocycle.targetMileageEnd)
          ? ""
          : toInputNumber(mesocycle.longRunEnd),
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
      longRunStart: "",
      longRunEnd: "",
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
      longRunStart: optionalNumber(mesocycle.longRunStart) ?? autoLongRun(mesocycle.targetMileageStart),
      longRunEnd: optionalNumber(mesocycle.longRunEnd) ?? autoLongRun(mesocycle.targetMileageEnd),
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

function resizeMesocycleLength(
  setPlanEditor: Dispatch<SetStateAction<PlanEditorState | null>>,
  index: number,
  weekCount: number
) {
  setPlanEditor((current) => {
    if (!current || !current.mesocycles[index]) {
      return current;
    }
    const nextWeekCount = Math.max(1, weekCount);
    if (index === current.mesocycles.length - 1) {
      const mesocycle = current.mesocycles[index];
      const endDate = addDays(mesocycle.startDate, nextWeekCount * 7 - 1);
      const nextMesocycles = [...current.mesocycles];
      nextMesocycles[index] = { ...mesocycle, endDate };
      return {
        ...current,
        endDate,
        mesocycles: normalizeMesocycleOrder(nextMesocycles)
      };
    }
    const boundaries = mesocycleBoundaryPositions(current);
    return applyBoundaryDrag(current, index + 1, boundaries[index] + nextWeekCount);
  });
}

function autoLongRun(mileage: string | number | null | undefined) {
  const value = optionalNumber(mileage);
  return value === null ? null : Math.max(Math.round(value * 0.28), 6);
}

function cadenceOptions(currentValue: string) {
  const options = [
    { value: "", label: "Off" },
    { value: "3", label: "Every 3rd week" },
    { value: "4", label: "Every 4th week" }
  ];
  if (currentValue && !options.some((option) => option.value === currentValue)) {
    options.push({ value: currentValue, label: `Every ${ordinalWeek(Number(currentValue))} week` });
  }
  return options;
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

function updatePlanStartDate(
  setPlanEditor: Dispatch<SetStateAction<PlanEditorState | null>>,
  rawStartDate: string
) {
  const startDate = normalizeToMonday(rawStartDate);
  setPlanEditor((current) => {
    if (!current) {
      return current;
    }
    if (current.mesocycles.length === 0) {
      const requestedWeekCount = weeksBetween(startDate, addDays(current.endDate, 1));
      const weekCount = Math.max(1, Math.round(requestedWeekCount));
      return { ...current, startDate, endDate: addDays(startDate, weekCount * 7 - 1) };
    }
    return resizePlanStartToWeekCount(current, startDate, weeksBetween(startDate, addDays(current.endDate, 1)));
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

  const weekCounts = rebalanceMesocycleWeekCounts(
    editor,
    roundedRequestedWeekCount,
    editor.mesocycles.length - 1,
    [...editor.mesocycles.keys()].reverse()
  );

  return reflowMesocycles(editor, editor.startDate, weekCounts);
}

function resizePlanStartToWeekCount(
  editor: PlanEditorState,
  startDate: string,
  requestedWeekCount: number
) {
  const roundedRequestedWeekCount = Math.round(requestedWeekCount);
  if (!Number.isFinite(roundedRequestedWeekCount)) {
    return editor;
  }

  const weekCounts = rebalanceMesocycleWeekCounts(
    editor,
    roundedRequestedWeekCount,
    0,
    [...editor.mesocycles.keys()]
  );

  return reflowMesocycles(editor, startDate, weekCounts);
}

function rebalanceMesocycleWeekCounts(
  editor: PlanEditorState,
  requestedWeekCount: number,
  growthIndex: number,
  shrinkOrder: number[]
) {
  const weekCounts = editor.mesocycles.map((mesocycle) =>
    Math.max(1, weeksBetween(mesocycle.startDate, addDays(mesocycle.endDate, 1)))
  );
  const currentWeekCount = weekCounts.reduce((sum, weekCount) => sum + weekCount, 0);
  const targetWeekCount = Math.max(weekCounts.length, requestedWeekCount);
  let weeksToRemove = Math.max(0, currentWeekCount - targetWeekCount);

  for (const index of shrinkOrder) {
    if (weeksToRemove <= 0) {
      break;
    }
    const removableWeeks = Math.min(weekCounts[index] - 1, weeksToRemove);
    weekCounts[index] -= removableWeeks;
    weeksToRemove -= removableWeeks;
  }

  if (targetWeekCount > currentWeekCount) {
    weekCounts[growthIndex] += targetWeekCount - currentWeekCount;
  }

  return weekCounts;
}

function reflowMesocycles(editor: PlanEditorState, startDate: string, weekCounts: number[]) {
  let cursor = startDate;
  const nextMesocycles = editor.mesocycles.map((mesocycle, index) => {
    const nextStartDate = cursor;
    const nextEndDate = addDays(nextStartDate, weekCounts[index] * 7 - 1);
    cursor = addDays(nextEndDate, 1);
    return {
      ...mesocycle,
      startDate: nextStartDate,
      endDate: nextEndDate
    };
  });

  return {
    ...editor,
    startDate,
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
      longRunStart: "",
      longRunEnd: "",
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

function weekIndexFromClientX(clientX: number, rect: DOMRect, totalWeeks: number) {
  const ratio = (clientX - rect.left) / rect.width;
  return Math.round(clamp(ratio, 0, 1) * totalWeeks);
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
