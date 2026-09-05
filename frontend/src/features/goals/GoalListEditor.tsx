import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { GoalMetricDefinition, WeekGoalEvaluationMode, WeekGoalMetric } from "../../types/domain";
import type { GoalDraft } from "./goalDrafts";
import {
  goalDraftError,
  goalOperatorLabels,
  goalSentence,
  goalValueUnit,
  metricMap,
  newGoalDraft
} from "./goalDrafts";

// Shared editor for standing weekly goals. Rows read as plain sentences and
// expand into a single-line metric/condition/value form when edited.
export function GoalListEditor({
  addButtonLabel,
  disabled = false,
  drafts,
  emptyHint,
  metrics,
  onDraftsChange
}: {
  addButtonLabel: string;
  disabled?: boolean;
  drafts: GoalDraft[];
  emptyHint?: string;
  metrics: GoalMetricDefinition[];
  onDraftsChange: (drafts: GoalDraft[]) => void;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const metricsByKey = useMemo(() => metricMap(metrics), [metrics]);

  function updateDraft(key: string, updates: Partial<GoalDraft>) {
    onDraftsChange(drafts.map((draft) => (draft.key === key ? { ...draft, ...updates } : draft)));
  }

  function changeMetric(draft: GoalDraft, metricKey: WeekGoalMetric) {
    const metric = metricsByKey.get(metricKey);
    if (!metric) {
      return;
    }
    const evaluationMode = metric.operators.includes(draft.evaluationMode)
      ? draft.evaluationMode
      : metric.operators.includes("at_least")
        ? "at_least"
        : metric.operators[0];
    updateDraft(draft.key, { metricKey, evaluationMode, value: "", minValue: "", maxValue: "" });
  }

  function addDraft() {
    const draft = newGoalDraft(metrics);
    if (!draft) {
      return;
    }
    onDraftsChange([...drafts, draft]);
    setEditingKey(draft.key);
  }

  function removeDraft(key: string) {
    onDraftsChange(drafts.filter((draft) => draft.key !== key));
    setEditingKey((current) => (current === key ? null : current));
  }

  function renderRow(draft: GoalDraft) {
    const metric = draft.metricKey ? metricsByKey.get(draft.metricKey) : undefined;
    const isEditing = editingKey === draft.key;
    const validationError = goalDraftError(draft, metricsByKey);
    const sentence = metric ? goalSentence(draft, metric) : draft.legacyLabel || "Unsupported goal";

    if (!isEditing) {
      return (
        <article key={draft.key} className="goal-row">
          <span className="goal-row-sentence">{sentence}</span>
          {validationError ? <small className="goal-row-flag">Needs review</small> : null}
          <span className="goal-row-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={`Edit ${sentence}`}
              title="Edit goal"
              disabled={disabled}
              onClick={() => setEditingKey(draft.key)}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="icon-button icon-button--danger"
              aria-label={`Remove ${sentence}`}
              title="Remove goal"
              disabled={disabled}
              onClick={() => removeDraft(draft.key)}
            >
              <Trash2 size={14} />
            </button>
          </span>
        </article>
      );
    }

    return (
      <article key={draft.key} className="goal-row goal-row--editing">
        <div className="goal-row-fields">
          <label>
            <span>Metric</span>
            <select
              value={draft.metricKey}
              onChange={(event) => changeMetric(draft, event.target.value as WeekGoalMetric)}
            >
              {!draft.metricKey ? <option value="">Unsupported legacy goal</option> : null}
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
                  {goalOperatorLabels[operator] ?? operator}
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
              <span>Value</span>
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
          {metric ? (
            <span className="goal-row-unit" aria-hidden="true">
              {goalValueUnit(metric, draft.value || draft.maxValue)}
            </span>
          ) : null}
        </div>
        <div className="goal-row-feedback" aria-live="polite">
          {validationError ? <small>{validationError}</small> : <span>{sentence}</span>}
        </div>
        <div className="goal-row-editor-actions">
          <button
            type="button"
            className="ghost-button ghost-button--compact ghost-button--danger"
            onClick={() => removeDraft(draft.key)}
          >
            <Trash2 size={15} />
            <span>Remove</span>
          </button>
          <button
            type="button"
            className="ghost-button ghost-button--compact"
            disabled={Boolean(validationError)}
            onClick={() => setEditingKey(null)}
          >
            <Check size={15} />
            <span>Done</span>
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="goal-list">
      {drafts.length === 0 && emptyHint ? <p className="goal-list-empty">{emptyHint}</p> : null}
      {drafts.map(renderRow)}
      <button
        type="button"
        className="ghost-button goal-list-add"
        disabled={disabled || metrics.length === 0}
        onClick={addDraft}
      >
        <Plus size={16} />
        <span>{addButtonLabel}</span>
      </button>
    </div>
  );
}
