import { Check, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../../lib/api";
import { goalCategories, goalEvaluationModes, goalUnits } from "../../lib/options";
import type {
  RecurringGoal,
  WeekGoalCategory,
  WeekGoalEvaluationMode,
  WeekGoalType,
  WeekGoalUnit
} from "../../types/domain";

type DefaultGoalDraft = {
  key: string;
  id?: string;
  category: WeekGoalCategory;
  goalType: WeekGoalType;
  label: string;
  evaluationMode: WeekGoalEvaluationMode;
  value: string;
  minValue: string;
  maxValue: string;
  unit: WeekGoalUnit;
};

const singleValueModes: WeekGoalEvaluationMode[] = ["at_least", "at_most", "exact-ish"];
const AUTOSAVE_DELAY_MS = 650;
const RULE_NAME_REQUIRED_MESSAGE = "Name every rule to save changes.";

function unitSuffix(unit: WeekGoalUnit, countField: string): string {
  const singular = Number(countField) === 1;
  switch (unit) {
    case "mi":
      return " mi";
    case "percent":
      return "%";
    case "sessions":
      return singular ? " session" : " sessions";
    case "days":
      return singular ? " day" : " days";
    default:
      return "";
  }
}

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
    category: goal.category,
    goalType: goal.goalType,
    label: goal.label,
    evaluationMode: goal.evaluationMode,
    value: numberToField(singleValue),
    minValue: numberToField(goal.minAcceptable),
    maxValue: numberToField(goal.maxAcceptable),
    unit: goal.unit
  };
}

// evaluate_numeric on the backend reads min/max acceptable, so each mode
// writes the bound it is judged by; targetValue mirrors it for display.
function draftToPayload(draft: DefaultGoalDraft) {
  const value = fieldToNumber(draft.value);
  const bounds =
    draft.evaluationMode === "at_least"
      ? { targetValue: value, minAcceptable: value, maxAcceptable: null }
      : draft.evaluationMode === "at_most"
        ? { targetValue: value, minAcceptable: null, maxAcceptable: value }
        : draft.evaluationMode === "exact-ish"
          ? { targetValue: value, minAcceptable: null, maxAcceptable: null }
          : draft.evaluationMode === "range"
            ? {
                targetValue: null,
                minAcceptable: fieldToNumber(draft.minValue),
                maxAcceptable: fieldToNumber(draft.maxValue)
              }
            : { targetValue: null, minAcceptable: null, maxAcceptable: null };
  return {
    id: draft.id,
    category: draft.category,
    goalType: draft.goalType,
    label: draft.label.trim(),
    description: "",
    ...bounds,
    unit: draft.unit,
    evaluationMode: draft.evaluationMode,
    priority: draft.goalType === "guardrail" ? "guardrail" : "secondary",
    notes: ""
  };
}

function serializeDrafts(drafts: DefaultGoalDraft[]) {
  return JSON.stringify(drafts.map(draftToPayload));
}

function savedGoalsToDrafts(goals: RecurringGoal[], sourceDrafts: DefaultGoalDraft[]) {
  return goals.map((goal, index) => ({
    ...goalToDraft(goal),
    key: sourceDrafts[index]?.key ?? goal.id
  }));
}

function mergeSavedIds(currentDrafts: DefaultGoalDraft[], sourceDrafts: DefaultGoalDraft[], savedDrafts: DefaultGoalDraft[]) {
  const savedBySourceKey = new Map(sourceDrafts.map((draft, index) => [draft.key, savedDrafts[index]]));
  return currentDrafts.map((draft) => {
    if (draft.id) {
      return draft;
    }
    const savedDraft = savedBySourceKey.get(draft.key);
    return savedDraft?.id ? { ...draft, id: savedDraft.id } : draft;
  });
}

function ruleSummary(draft: DefaultGoalDraft): string {
  switch (draft.evaluationMode) {
    case "at_least":
      return draft.value ? `≥ ${draft.value}${unitSuffix(draft.unit, draft.value)}` : "No value set";
    case "at_most":
      return draft.value ? `≤ ${draft.value}${unitSuffix(draft.unit, draft.value)}` : "No value set";
    case "exact-ish":
      return draft.value ? `≈ ${draft.value}${unitSuffix(draft.unit, draft.value)}` : "No value set";
    case "range":
      return draft.minValue && draft.maxValue
        ? `${draft.minValue}–${draft.maxValue}${unitSuffix(draft.unit, draft.maxValue)}`
        : "No range set";
    case "boolean":
      return "Yes / no";
    default:
      return "Checked manually";
  }
}

export function DefaultGoalsCard({
  onRulesSaved,
  writesBlocked
}: {
  onRulesSaved?: () => void;
  writesBlocked: boolean;
}) {
  const [drafts, setDrafts] = useState<DefaultGoalDraft[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedDraftsRef = useRef(false);
  const lastSavedSnapshotRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchJson<RecurringGoal[]>("/api/default-goals")
      .then((goals) => {
        const loadedDrafts = goals.map(goalToDraft);
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
      if (writesBlocked || draftsToSave.some((draft) => !draft.label.trim())) {
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
          body: JSON.stringify(draftsToSave.map(draftToPayload))
        });
        const savedDrafts = savedGoalsToDrafts(saved, draftsToSave);
        const savedSnapshot = serializeDrafts(savedDrafts);
        lastSavedSnapshotRef.current = savedSnapshot;
        setDrafts((currentDrafts) =>
          serializeDrafts(currentDrafts) === snapshotToSave
            ? savedDrafts
            : mergeSavedIds(currentDrafts, draftsToSave, savedDrafts)
        );
        setMessage("Rules saved.");
        onRulesSaved?.();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Could not save default goals.");
        setMessage(null);
      } finally {
        setIsSaving(false);
      }
    },
    [onRulesSaved, writesBlocked]
  );

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (isLoading || isSaving || !hasLoadedDraftsRef.current) {
      return;
    }

    const currentSnapshot = serializeDrafts(drafts);
    if (currentSnapshot === lastSavedSnapshotRef.current) {
      setError(null);
      setMessage((current) => (current === RULE_NAME_REQUIRED_MESSAGE ? null : current));
      return;
    }

    if (writesBlocked) {
      setMessage(null);
      setError("Rules are read-only right now.");
      return;
    }

    if (drafts.some((draft) => !draft.label.trim())) {
      setError(null);
      setMessage(RULE_NAME_REQUIRED_MESSAGE);
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
        saveTimerRef.current = null;
      }
    };
  }, [drafts, isLoading, isSaving, saveDrafts, writesBlocked]);

  function updateDraft(key: string, updates: Partial<DefaultGoalDraft>) {
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...updates } : draft)));
  }

  function changeMode(draft: DefaultGoalDraft, mode: WeekGoalEvaluationMode) {
    const updates: Partial<DefaultGoalDraft> = { evaluationMode: mode };
    if (mode === "range" && draft.minValue === "") {
      updates.minValue = draft.value;
    }
    if (singleValueModes.includes(mode) && draft.value === "") {
      updates.value = draft.minValue || draft.maxValue;
    }
    updateDraft(draft.key, updates);
  }

  function addDraft(goalType: WeekGoalType) {
    const draft: DefaultGoalDraft = {
      key: crypto.randomUUID(),
      category: "custom",
      goalType,
      label: "",
      evaluationMode: goalType === "guardrail" ? "at_most" : "at_least",
      value: "",
      minValue: "",
      maxValue: "",
      unit: "custom"
    };
    setDrafts((current) => [...current, draft]);
    setEditingKey(draft.key);
  }

  function removeDraft(key: string) {
    setDrafts((current) => current.filter((draft) => draft.key !== key));
    setEditingKey((current) => (current === key ? null : current));
  }

  function renderRow(draft: DefaultGoalDraft) {
    const isGuardrail = draft.goalType === "guardrail";
    const isEditing = editingKey === draft.key;
    const name = draft.label.trim() || "New rule";
    const categoryLabel = goalCategories.find((option) => option.value === draft.category)?.label ?? "Custom";
    const showValueFields = draft.evaluationMode !== "boolean" && draft.evaluationMode !== "manual";

    return (
      <article
        key={draft.key}
        className={`default-goal-item${isEditing ? " default-goal-item--editing" : ""}`}
      >
        {isEditing ? (
          <div className="default-goal-editor">
            <label className="default-goal-name">
              <span>Rule</span>
              <input
                autoFocus={!draft.label}
                value={draft.label}
                placeholder={isGuardrail ? "No more than 2 hard days" : "Preserve at least 1 rest day"}
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
                <span>Category</span>
                <select
                  value={draft.category}
                  onChange={(event) =>
                    updateDraft(draft.key, { category: event.target.value as WeekGoalCategory })
                  }
                >
                  {goalCategories.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Condition</span>
                <select
                  value={draft.evaluationMode}
                  onChange={(event) => changeMode(draft, event.target.value as WeekGoalEvaluationMode)}
                >
                  {goalEvaluationModes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {draft.evaluationMode === "range" ? (
                <>
                  <label>
                    <span>Min</span>
                    <input
                      value={draft.minValue}
                      inputMode="decimal"
                      onChange={(event) => updateDraft(draft.key, { minValue: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>Max</span>
                    <input
                      value={draft.maxValue}
                      inputMode="decimal"
                      onChange={(event) => updateDraft(draft.key, { maxValue: event.target.value })}
                    />
                  </label>
                </>
              ) : null}
              {singleValueModes.includes(draft.evaluationMode) ? (
                <label>
                  <span>{isGuardrail ? "Limit" : "Value"}</span>
                  <input
                    value={draft.value}
                    inputMode="decimal"
                    onChange={(event) => updateDraft(draft.key, { value: event.target.value })}
                  />
                </label>
              ) : null}
              {showValueFields ? (
                <label>
                  <span>Unit</span>
                  <select
                    value={draft.unit}
                    onChange={(event) => updateDraft(draft.key, { unit: event.target.value as WeekGoalUnit })}
                  >
                    {goalUnits.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
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
              <button type="button" className="ghost-button" onClick={() => setEditingKey(null)}>
                <Check size={15} />
                <span>Done</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="default-goal-display">
            <div className="default-goal-summary">
              <strong>{name}</strong>
              <small>{categoryLabel}</small>
            </div>
            <span className="default-goal-rule">{ruleSummary(draft)}</span>
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
                    <span>Goals and guardrails applied to every week unless a plan or manual edit overrides them.</span>
                  </div>
                </div>
              </header>
              {drafts.length === 0 ? (
                <div className="goals-empty-state goals-empty-state--compact">
                  <Target size={17} />
                  <div>
                    <strong>No rules yet</strong>
                    <span>Add a target or limit you want every week to remember.</span>
                  </div>
                </div>
              ) : null}
              <div className="default-goal-list">{drafts.map(renderRow)}</div>
              <button type="button" className="ghost-button default-goal-add" onClick={() => addDraft("achievement")}>
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
