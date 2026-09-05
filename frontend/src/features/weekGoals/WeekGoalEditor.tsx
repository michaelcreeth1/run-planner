import { Save, X } from "lucide-react";
import { useMemo, useRef } from "react";
import type { FormEvent } from "react";
import type {
  GoalMetricDefinition,
  WeekGoalEvaluationMode,
  WeekGoalForm,
  WeekGoalMetric
} from "../../types/domain";
import type { GoalDraft } from "../goals/goalDrafts";
import {
  goalDraftError,
  goalDraftPayload,
  goalOperatorLabels,
  goalSentence,
  goalValueUnit,
  metricMap
} from "../goals/goalDrafts";

export function WeekGoalEditor({
  editor,
  error,
  isSaving,
  metrics,
  setEditor,
  onSubmit,
  onClose
}: {
  editor: WeekGoalForm;
  error: string | null;
  isSaving: boolean;
  metrics: GoalMetricDefinition[];
  setEditor: (editor: WeekGoalForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const metricsByKey = useMemo(() => metricMap(metrics), [metrics]);
  const customLabelRef = useRef(Boolean(editor.id && editor.label.trim()));
  const draft = goalDraftFromWeekForm(editor);
  const metric = draft.metricKey ? metricsByKey.get(draft.metricKey) : undefined;
  const validationError = goalDraftError(draft, metricsByKey);
  const suggestedLabel = metric ? goalSentence(draft, metric) : "Choose a metric to build this goal.";

  function applyDraft(nextDraft: GoalDraft, forceSuggestedLabel = false) {
    if (!nextDraft.metricKey) {
      return;
    }
    const payload = goalDraftPayload(nextDraft, metricsByKey);
    if (forceSuggestedLabel) {
      customLabelRef.current = false;
    }
    setEditor({
      ...editor,
      metricKey: payload.metricKey,
      category: payload.category,
      goalType: payload.goalType,
      label:
        customLabelRef.current && editor.label.trim() && !forceSuggestedLabel
          ? editor.label
          : payload.label,
      targetValue: numberField(payload.targetValue),
      minAcceptable: numberField(payload.minAcceptable),
      maxAcceptable: numberField(payload.maxAcceptable),
      unit: payload.unit,
      evaluationMode: payload.evaluationMode,
      priority: payload.priority as WeekGoalForm["priority"]
    });
  }

  function changeMetric(metricKey: WeekGoalMetric) {
    const nextMetric = metricsByKey.get(metricKey);
    if (!nextMetric) {
      return;
    }
    const evaluationMode = nextMetric.operators.includes("at_least")
      ? "at_least"
      : nextMetric.operators[0];
    applyDraft(
      {
        ...draft,
        metricKey,
        evaluationMode,
        value: "",
        minValue: "",
        maxValue: ""
      },
      true
    );
  }

  function changeCondition(evaluationMode: WeekGoalEvaluationMode) {
    applyDraft({ ...draft, evaluationMode, value: "", minValue: "", maxValue: "" }, true);
  }

  function updateThreshold(updates: Partial<GoalDraft>) {
    applyDraft({ ...draft, ...updates });
  }

  return (
    <div className="editor-backdrop">
      <aside className="editor-panel" aria-label="Weekly goal editor">
        <header>
          <h2>{editor.id ? "Edit week goal" : "New week goal"}</h2>
          <button type="button" title="Close" disabled={isSaving} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <form aria-busy={isSaving} onSubmit={onSubmit}>
          {error ? <div className="settings-note settings-note--danger" role="alert">{error}</div> : null}
          <div className="form-grid">
            <label>
              <span>Metric</span>
              <select
                required
                value={draft.metricKey}
                onChange={(event) => changeMetric(event.target.value as WeekGoalMetric)}
              >
                {!draft.metricKey ? <option value="">Choose a metric</option> : null}
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
                disabled={!metric}
                value={metric ? draft.evaluationMode : ""}
                onChange={(event) => changeCondition(event.target.value as WeekGoalEvaluationMode)}
              >
                {!metric ? <option value="">Choose a metric first</option> : null}
                {(metric?.operators ?? []).map((operator) => (
                  <option key={operator} value={operator}>
                    {goalOperatorLabels[operator] ?? operator}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {draft.evaluationMode === "range" ? (
            <div className="form-grid">
              <ThresholdField
                label="Minimum"
                metric={metric}
                value={draft.minValue}
                onChange={(value) => updateThreshold({ minValue: value })}
              />
              <ThresholdField
                label="Maximum"
                metric={metric}
                value={draft.maxValue}
                onChange={(value) => updateThreshold({ maxValue: value })}
              />
            </div>
          ) : (
            <ThresholdField
              label="Value"
              metric={metric}
              value={draft.value}
              onChange={(value) => updateThreshold({ value })}
            />
          )}

          {metric ? (
            <div className="goal-row-feedback week-goal-preview" aria-live="polite">
              <span>{suggestedLabel}</span>
              <small>{goalValueUnit(metric, draft.value || draft.maxValue)}</small>
            </div>
          ) : null}
          {validationError ? <p className="field-error">{validationError}</p> : null}

          <label>
            <span>Label</span>
            <input
              required
              value={editor.label}
              onChange={(event) => {
                customLabelRef.current = true;
                setEditor({ ...editor, label: event.target.value });
              }}
            />
          </label>
          {metric && editor.label !== suggestedLabel ? (
            <button
              className="text-action"
              type="button"
              onClick={() => applyDraft(draft, true)}
            >
              Use suggested wording
            </button>
          ) : null}
          <label>
            <span>Description <small>(optional)</small></span>
            <textarea
              rows={3}
              value={editor.description}
              onChange={(event) => setEditor({ ...editor, description: event.target.value })}
            />
          </label>
          <div className="editor-actions">
            <button className="primary" disabled={Boolean(validationError) || isSaving} type="submit">
              <Save size={17} />
              <span>{isSaving ? "Saving…" : "Save"}</span>
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function ThresholdField({
  label,
  metric,
  onChange,
  value
}: {
  label: string;
  metric: GoalMetricDefinition | undefined;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        disabled={!metric}
        max={metric?.maximum ?? undefined}
        min={metric?.minimum}
        step={metric?.valueType === "integer" ? 1 : 0.1}
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function goalDraftFromWeekForm(editor: WeekGoalForm): GoalDraft {
  const singleValue =
    editor.evaluationMode === "at_least"
      ? editor.minAcceptable || editor.targetValue
      : editor.evaluationMode === "at_most"
        ? editor.maxAcceptable || editor.targetValue
        : editor.targetValue;
  return {
    key: editor.id ?? "new-week-goal",
    id: editor.id,
    metricKey: editor.metricKey ?? "",
    legacyLabel: editor.label,
    evaluationMode: editor.evaluationMode,
    value: singleValue,
    minValue: editor.minAcceptable,
    maxValue: editor.maxAcceptable,
    notes: editor.description
  };
}

function numberField(value: number | null) {
  return value === null ? "" : String(value);
}
