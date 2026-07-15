import { Check, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../../lib/api";
import type {
  GoalMetricDefinition,
  RecurringGoal,
  WeekGoalEvaluationMode,
  WeekGoalMetric,
  WeekGoalType
} from "../../types/domain";

type DefaultGoalDraft = {
  key: string;
  id?: string;
  metricKey: WeekGoalMetric | "";
  goalType: WeekGoalType;
  label: string;
  evaluationMode: WeekGoalEvaluationMode;
  value: string;
  minValue: string;
  maxValue: string;
};

const AUTOSAVE_DELAY_MS = 650;
const RULE_INVALID_MESSAGE = "Finish every rule to save changes.";
const operatorLabels: Partial<Record<WeekGoalEvaluationMode, string>> = {
  at_least: "At least",
  at_most: "At most",
  range: "Between",
  "exact-ish": "Exactly"
};

function numberToField(value: number | null): string {
  return value === null ? "" : String(value);
}

function fieldToNumber(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferLegacyMetric(goal: RecurringGoal): WeekGoalMetric | "" {
  const key = `${goal.category}:${goal.unit}`;
  const mapping: Record<string, WeekGoalMetric> = {
    "mileage:mi": "weekly_run_distance",
    "sessions:sessions": "training_session_count",
    "long_run:mi": "longest_run_distance",
    "long_run:percent": "long_run_share",
    "quality:days": "hard_training_day_count",
    "quality:sessions": "hard_training_day_count",
    "recovery:days": "rest_day_count",
    "strength:sessions": "strength_session_count"
  };
  return mapping[key] ?? "";
}

function goalToDraft(goal: RecurringGoal): DefaultGoalDraft {
  const singleValue =
    goal.evaluationMode === "at_least"
      ? goal.minAcceptable ?? goal.targetValue
      : goal.evaluationMode === "at_most"
        ? goal.maxAcceptable ?? goal.targetValue
        : goal.targetValue;
  return {
    key: goal.id,
    id: goal.id,
    metricKey: goal.metricKey ?? inferLegacyMetric(goal),
    goalType: goal.goalType,
    label: goal.label,
    evaluationMode: goal.evaluationMode,
    value: numberToField(singleValue),
    minValue: numberToField(goal.minAcceptable),
    maxValue: numberToField(goal.maxAcceptable)
  };
}

function metricMap(metrics: GoalMetricDefinition[]) {
  return new Map(metrics.map((metric) => [metric.key, metric]));
}

function valueUnit(metric: GoalMetricDefinition, value: string): string {
  const singular = Number(value) === 1;
  switch (metric.unit) {
    case "mi":
      return singular ? "mile" : "miles";
    case "sessions":
      return singular ? "session" : "sessions";
    case "days":
      return singular ? "day" : "days";
    case "percent":
      return "%";
    default:
      return metric.unit;
  }
}

function thresholdPhrase(draft: DefaultGoalDraft, metric: GoalMetricDefinition): string {
  if (draft.evaluationMode === "range") {
    if (!draft.minValue || !draft.maxValue) {
      return "needs a range";
    }
    const suffix = valueUnit(metric, draft.maxValue);
    return metric.unit === "percent"
      ? `between ${draft.minValue}% and ${draft.maxValue}%`
      : `between ${draft.minValue} and ${draft.maxValue} ${suffix}`;
  }
  if (!draft.value) {
    return "needs a value";
  }
  const condition =
    draft.evaluationMode === "at_least"
      ? "at least"
      : draft.evaluationMode === "at_most"
        ? "at most"
        : "exactly";
  const suffix = valueUnit(metric, draft.value);
  return metric.unit === "percent"
    ? `${condition} ${draft.value}%`
    : `${condition} ${draft.value} ${suffix}`;
}

function generatedRuleSentence(draft: DefaultGoalDraft, metric: GoalMetricDefinition): string {
  const isIncomplete =
    draft.evaluationMode === "range"
      ? !draft.minValue || !draft.maxValue
      : !draft.value;
  if (isIncomplete) {
    return `Set ${metric.label.toLowerCase()}`;
  }
  if (
    metric.key === "back_to_back_hard_pairs" &&
    draft.evaluationMode === "at_most" &&
    Number(draft.value) === 0
  ) {
    return "Avoid back-to-back hard days";
  }
  const phrase = thresholdPhrase(draft, metric);
  switch (metric.key) {
    case "weekly_run_distance":
      return `Run ${phrase}`;
    case "training_session_count":
      return `Complete ${phrase}`;
    case "longest_run_distance":
      return `Keep the longest run ${phrase}`;
    case "hard_training_day_count":
      return `Schedule ${phrase} of hard training`;
    case "rest_day_count":
      return `Keep ${phrase} of rest`;
    case "strength_session_count":
      return `Complete ${phrase} of strength or mobility`;
    case "long_run_share":
      return `Keep the long run ${phrase} of weekly distance`;
    default:
      return `${metric.label}: ${phrase}`;
  }
}

function draftError(
  draft: DefaultGoalDraft,
  metricsByKey: Map<WeekGoalMetric, GoalMetricDefinition>
): string | null {
  if (!draft.metricKey) {
    return "Choose a metric.";
  }
  const metric = metricsByKey.get(draft.metricKey);
  if (!metric) {
    return "This rule uses an unsupported metric.";
  }
  if (!metric.operators.includes(draft.evaluationMode)) {
    return `${metric.label} does not support that condition.`;
  }
  const values =
    draft.evaluationMode === "range" ? [draft.minValue, draft.maxValue] : [draft.value];
  if (values.some((value) => fieldToNumber(value) === null)) {
    return draft.evaluationMode === "range" ? "Enter both ends of the range." : "Enter a value.";
  }
  const numbers = values.map((value) => Number(value));
  if (draft.evaluationMode === "range" && numbers[0] > numbers[1]) {
    return "The minimum cannot be greater than the maximum.";
  }
  if (numbers.some((value) => value < metric.minimum)) {
    return `${metric.label} cannot be less than ${metric.minimum}.`;
  }
  if (metric.maximum !== null && numbers.some((value) => value > metric.maximum!)) {
    return `${metric.label} cannot be greater than ${metric.maximum}.`;
  }
  if (metric.valueType === "integer" && numbers.some((value) => !Number.isInteger(value))) {
    return `${metric.label} must be a whole number.`;
  }
  return null;
}

function draftToPayload(
  draft: DefaultGoalDraft,
  metricsByKey: Map<WeekGoalMetric, GoalMetricDefinition>
) {
  if (!draft.metricKey) {
    throw new Error("A metric is required.");
  }
  const metric = metricsByKey.get(draft.metricKey);
  if (!metric) {
    throw new Error("Unsupported metric.");
  }
  const value = fieldToNumber(draft.value);
  const bounds =
    draft.evaluationMode === "at_least"
      ? { targetValue: value, minAcceptable: value, maxAcceptable: null }
      : draft.evaluationMode === "at_most"
        ? { targetValue: value, minAcceptable: null, maxAcceptable: value }
        : draft.evaluationMode === "range"
          ? {
              targetValue: null,
              minAcceptable: fieldToNumber(draft.minValue),
              maxAcceptable: fieldToNumber(draft.maxValue)
            }
          : { targetValue: value, minAcceptable: null, maxAcceptable: null };
  return {
    id: draft.id,
    metricKey: draft.metricKey,
    category: metric.category,
    goalType: draft.goalType,
    label: draft.label.trim() || generatedRuleSentence(draft, metric),
    description: "",
    ...bounds,
    unit: metric.unit,
    evaluationMode: draft.evaluationMode,
    priority: draft.goalType === "guardrail" ? "guardrail" : "secondary",
    notes: ""
  };
}

function serializeDrafts(drafts: DefaultGoalDraft[]) {
  return JSON.stringify(drafts);
}

export function DefaultGoalsCard({
  onRulesSaved,
  writesBlocked
}: {
  onRulesSaved?: () => void;
  writesBlocked: boolean;
}) {
  const [drafts, setDrafts] = useState<DefaultGoalDraft[]>([]);
  const [metrics, setMetrics] = useState<GoalMetricDefinition[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedDraftsRef = useRef(false);
  const lastSavedSnapshotRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metricsByKey = useMemo(() => metricMap(metrics), [metrics]);

  useEffect(() => {
    Promise.all([
      fetchJson<RecurringGoal[]>("/api/default-goals"),
      fetchJson<GoalMetricDefinition[]>("/api/goal-metrics")
    ])
      .then(([goals, availableMetrics]) => {
        const loadedDrafts = goals.map(goalToDraft);
        setMetrics(availableMetrics);
        lastSavedSnapshotRef.current = serializeDrafts(loadedDrafts);
        hasLoadedDraftsRef.current = true;
        setDrafts(loadedDrafts);
      })
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Could not load default goals.")
      )
      .finally(() => setIsLoading(false));
  }, []);

  const saveDrafts = useCallback(
    async (draftsToSave: DefaultGoalDraft[]) => {
      const currentMetricMap = metricMap(metrics);
      if (
        writesBlocked ||
        draftsToSave.some((draft) => draftError(draft, currentMetricMap) !== null)
      ) {
        return;
      }
      const snapshotToSave = serializeDrafts(draftsToSave);
      if (snapshotToSave === lastSavedSnapshotRef.current) {
        return;
      }

      setIsSaving(true);
      setMessage("Saving changes…");
      setError(null);
      try {
        const saved = await fetchJson<RecurringGoal[]>("/api/default-goals", {
          method: "PUT",
          body: JSON.stringify(draftsToSave.map((draft) => draftToPayload(draft, currentMetricMap)))
        });
        const savedDrafts = saved.map((goal, index) => ({
          ...goalToDraft(goal),
          key: draftsToSave[index]?.key ?? goal.id
        }));
        lastSavedSnapshotRef.current = serializeDrafts(savedDrafts);
        setDrafts((currentDrafts) => {
          if (serializeDrafts(currentDrafts) === snapshotToSave) {
            return savedDrafts;
          }
          const savedByKey = new Map(savedDrafts.map((draft) => [draft.key, draft]));
          return currentDrafts.map((draft) => {
            const savedDraft = savedByKey.get(draft.key);
            return savedDraft ? { ...draft, id: savedDraft.id } : draft;
          });
        });
        setMessage("Rules saved.");
        onRulesSaved?.();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Could not save default goals.");
        setMessage(null);
      } finally {
        setIsSaving(false);
      }
    },
    [metrics, onRulesSaved, writesBlocked]
  );

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (isLoading || isSaving || !hasLoadedDraftsRef.current || metrics.length === 0) {
      return;
    }
    const currentSnapshot = serializeDrafts(drafts);
    if (currentSnapshot === lastSavedSnapshotRef.current) {
      return;
    }
    if (writesBlocked) {
      setMessage(null);
      setError("Rules are read-only right now.");
      return;
    }
    if (drafts.some((draft) => draftError(draft, metricsByKey) !== null)) {
      setError(null);
      setMessage(RULE_INVALID_MESSAGE);
      return;
    }
    setError(null);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveDrafts(drafts);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [drafts, isLoading, isSaving, metrics, metricsByKey, saveDrafts, writesBlocked]);

  function updateDraft(key: string, updates: Partial<DefaultGoalDraft>) {
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...updates } : draft)));
  }

  function changeMetric(draft: DefaultGoalDraft, metricKey: WeekGoalMetric) {
    const metric = metricsByKey.get(metricKey);
    if (!metric) {
      return;
    }
    const preferredMode = draft.goalType === "guardrail" ? "at_most" : "at_least";
    updateDraft(draft.key, {
      metricKey,
      evaluationMode: metric.operators.includes(preferredMode) ? preferredMode : metric.operators[0],
      value: "",
      minValue: "",
      maxValue: ""
    });
  }

  function addDraft() {
    const firstMetric = metrics[0];
    if (!firstMetric) {
      return;
    }
    const draft: DefaultGoalDraft = {
      key: crypto.randomUUID(),
      metricKey: firstMetric.key,
      goalType: "achievement",
      label: "",
      evaluationMode: firstMetric.operators.includes("at_least") ? "at_least" : firstMetric.operators[0],
      value: "",
      minValue: "",
      maxValue: ""
    };
    setDrafts((current) => [...current, draft]);
    setEditingKey(draft.key);
  }

  function removeDraft(key: string) {
    setDrafts((current) => current.filter((draft) => draft.key !== key));
    setEditingKey((current) => (current === key ? null : current));
  }

  function renderRow(draft: DefaultGoalDraft) {
    const metric = draft.metricKey ? metricsByKey.get(draft.metricKey) : undefined;
    const isEditing = editingKey === draft.key;
    const validationError = draftError(draft, metricsByKey);
    const generated = metric ? generatedRuleSentence(draft, metric) : "Choose a supported metric";
    const name = draft.label.trim() || generated;

    return (
      <article
        key={draft.key}
        className={`default-goal-item${isEditing ? " default-goal-item--editing" : ""}`}
      >
        {isEditing ? (
          <div className="default-goal-editor">
            <label className="default-goal-name">
              <span>Name (optional)</span>
              <input
                value={draft.label}
                placeholder="Use the generated rule text"
                onChange={(event) => updateDraft(draft.key, { label: event.target.value })}
              />
            </label>
            <div className="default-goal-editor-grid">
              <label>
                <span>Type</span>
                <select
                  value={draft.goalType}
                  onChange={(event) =>
                    updateDraft(draft.key, { goalType: event.target.value as WeekGoalType })
                  }
                >
                  <option value="achievement">Goal</option>
                  <option value="guardrail">Guardrail</option>
                </select>
              </label>
              <label>
                <span>Metric</span>
                <select
                  value={draft.metricKey}
                  onChange={(event) => changeMetric(draft, event.target.value as WeekGoalMetric)}
                >
                  {!draft.metricKey ? <option value="">Unsupported legacy rule</option> : null}
                  {metrics.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Condition</span>
                <select
                  value={draft.evaluationMode}
                  onChange={(event) =>
                    updateDraft(draft.key, {
                      evaluationMode: event.target.value as WeekGoalEvaluationMode
                    })
                  }
                >
                  {(metric?.operators ?? []).map((operator) => (
                    <option key={operator} value={operator}>
                      {operatorLabels[operator] ?? operator}
                    </option>
                  ))}
                </select>
              </label>
              {draft.evaluationMode === "range" ? (
                <>
                  <label>
                    <span>Minimum</span>
                    <input
                      type="number"
                      min={metric?.minimum}
                      max={metric?.maximum ?? undefined}
                      step={metric?.valueType === "integer" ? 1 : 0.1}
                      value={draft.minValue}
                      onChange={(event) => updateDraft(draft.key, { minValue: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>Maximum</span>
                    <input
                      type="number"
                      min={metric?.minimum}
                      max={metric?.maximum ?? undefined}
                      step={metric?.valueType === "integer" ? 1 : 0.1}
                      value={draft.maxValue}
                      onChange={(event) => updateDraft(draft.key, { maxValue: event.target.value })}
                    />
                  </label>
                </>
              ) : (
                <label>
                  <span>{draft.goalType === "guardrail" ? "Limit" : "Value"}</span>
                  <input
                    type="number"
                    min={metric?.minimum}
                    max={metric?.maximum ?? undefined}
                    step={metric?.valueType === "integer" ? 1 : 0.1}
                    value={draft.value}
                    onChange={(event) => updateDraft(draft.key, { value: event.target.value })}
                  />
                </label>
              )}
              <div className="default-goal-unit">
                <span>Unit</span>
                <strong>{metric ? valueUnit(metric, draft.value || draft.maxValue) : "—"}</strong>
              </div>
            </div>
            <div className="default-goal-preview" aria-live="polite">
              <span>Rule preview</span>
              <strong>{generated}</strong>
              {validationError ? <small>{validationError}</small> : null}
            </div>
            <div className="default-goal-editor-actions">
              <button
                type="button"
                className="ghost-button default-goal-delete"
                onClick={() => removeDraft(draft.key)}
              >
                <Trash2 size={15} />
                <span>Remove</span>
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={Boolean(validationError)}
                onClick={() => setEditingKey(null)}
              >
                <Check size={15} />
                <span>Done</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="default-goal-display">
            <div className="default-goal-summary">
              <strong>{name}</strong>
              <small>{metric?.label ?? "Needs review"}</small>
            </div>
            <span className="default-goal-rule">{generated}</span>
            <button
              type="button"
              className="icon-button default-goal-edit"
              aria-label={`Edit ${name}`}
              title={`Edit ${name}`}
              onClick={() => setEditingKey(draft.key)}
            >
              <Pencil size={14} />
            </button>
          </div>
        )}
      </article>
    );
  }

  return (
    <section className="settings-form default-goals-workspace">
      {isLoading ? (
        <section className="settings-card">
          <div className="settings-note">Loading…</div>
        </section>
      ) : (
        <>
          <div className="default-goals-content">
            <section className="default-goal-section">
              <header className="default-goal-section-header">
                <div>
                  <span className="default-goal-section-icon">
                    <Target size={17} />
                  </span>
                  <div>
                    <strong>Rules</strong>
                    <span>Goals and guardrails measured from your planned and completed training.</span>
                  </div>
                </div>
              </header>
              {drafts.length === 0 ? (
                <div className="goals-empty-state goals-empty-state--compact">
                  <Target size={17} />
                  <div>
                    <strong>No rules yet</strong>
                    <span>Add a measurable target or limit for every week.</span>
                  </div>
                </div>
              ) : null}
              <div className="default-goal-list">{drafts.map(renderRow)}</div>
              <button type="button" className="ghost-button default-goal-add" onClick={addDraft}>
                <Plus size={16} />
                <span>Add rule</span>
              </button>
            </section>
          </div>

          {isSaving || message || error ? (
            <div className="default-goals-footer">
              {isSaving ? <div className="settings-note">Saving changes…</div> : null}
              {!isSaving && message ? <div className="settings-note">{message}</div> : null}
              {error ? <div className="settings-note settings-note--danger">{error}</div> : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
