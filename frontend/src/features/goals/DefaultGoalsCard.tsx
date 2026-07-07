import { Plus, Save, ShieldCheck, Target, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import { goalCategories, goalUnits } from "../../lib/options";
import type { RecurringGoal, WeekGoalCategory, WeekGoalType, WeekGoalUnit } from "../../types/domain";

type DefaultGoalDraft = {
  id?: string;
  category: WeekGoalCategory;
  goalType: WeekGoalType;
  label: string;
  value: string;
  unit: WeekGoalUnit;
};

function goalToDraft(goal: RecurringGoal): DefaultGoalDraft {
  const value = goal.targetValue ?? goal.maxAcceptable ?? goal.minAcceptable;
  return {
    id: goal.id,
    category: goal.category,
    goalType: goal.goalType,
    label: goal.label,
    value: value === null || value === undefined ? "" : String(value),
    unit: goal.unit
  };
}

function draftToPayload(draft: DefaultGoalDraft) {
  const value = draft.value.trim() === "" ? null : Number(draft.value);
  const numeric = value !== null && Number.isFinite(value) ? value : null;
  const isGuardrail = draft.goalType === "guardrail";
  return {
    id: draft.id,
    category: draft.category,
    goalType: draft.goalType,
    label: draft.label,
    description: "",
    targetValue: numeric,
    minAcceptable: !isGuardrail && numeric !== null ? numeric : null,
    maxAcceptable: isGuardrail && numeric !== null ? numeric : null,
    unit: draft.unit,
    evaluationMode: numeric === null ? "manual" : isGuardrail ? "at_most" : "at_least",
    priority: isGuardrail ? "guardrail" : "secondary",
    notes: ""
  };
}

export function DefaultGoalsCard({ writesBlocked }: { writesBlocked: boolean }) {
  const [drafts, setDrafts] = useState<DefaultGoalDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<RecurringGoal[]>("/api/default-goals")
      .then((goals) => setDrafts(goals.map(goalToDraft)))
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Could not load default goals.")
      )
      .finally(() => setIsLoading(false));
  }, []);

  function updateDraft(index: number, updates: Partial<DefaultGoalDraft>) {
    setDrafts((current) =>
      current.map((draft, draftIndex) => (draftIndex === index ? { ...draft, ...updates } : draft))
    );
  }

  function addDraft(goalType: WeekGoalType) {
    setDrafts((current) => [
      ...current,
      { category: "custom", goalType, label: "", value: "", unit: "custom" }
    ]);
  }

  function removeDraft(index: number) {
    setDrafts((current) => current.filter((_, draftIndex) => draftIndex !== index));
  }

  async function save() {
    if (writesBlocked || isSaving) {
      return;
    }
    setMessage(null);
    setError(null);
    setIsSaving(true);
    try {
      const saved = await fetchJson<RecurringGoal[]>("/api/default-goals", {
        method: "PUT",
        body: JSON.stringify(drafts.map(draftToPayload))
      });
      setDrafts(saved.map(goalToDraft));
      setMessage("Weekly defaults saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save default goals.");
    } finally {
      setIsSaving(false);
    }
  }

  const achievements = drafts.filter((draft) => draft.goalType === "achievement");
  const guardrails = drafts.filter((draft) => draft.goalType === "guardrail");

  function renderRow(draft: DefaultGoalDraft) {
    const index = drafts.indexOf(draft);
    const isGuardrail = draft.goalType === "guardrail";
    const removeLabel = draft.label.trim() || (isGuardrail ? "this guardrail" : "this goal");

    return (
      <article
        key={draft.id ?? `draft-${index}`}
        className={`default-goal-item default-goal-item--${draft.goalType}`}
      >
        <div className="default-goal-fields">
          <label className="default-goal-field default-goal-field--category">
            <span>Category</span>
            <select
              value={draft.category}
              onChange={(event) => updateDraft(index, { category: event.target.value as WeekGoalCategory })}
            >
              {goalCategories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="default-goal-field default-goal-field--label">
            <span>{isGuardrail ? "Guardrail rule" : "Goal"}</span>
            <input
              value={draft.label}
              placeholder={isGuardrail ? "No more than 2 hard days" : "Preserve at least 1 rest day"}
              onChange={(event) => updateDraft(index, { label: event.target.value })}
              required
            />
          </label>
          <label className="default-goal-field default-goal-field--value">
            <span>{isGuardrail ? "Limit" : "Target"}</span>
            <input
              value={draft.value}
              inputMode="decimal"
              onChange={(event) => updateDraft(index, { value: event.target.value })}
            />
          </label>
          <label className="default-goal-field default-goal-field--unit">
            <span>Unit</span>
            <select
              value={draft.unit}
              onChange={(event) => updateDraft(index, { unit: event.target.value as WeekGoalUnit })}
            >
              {goalUnits.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="icon-button default-goal-remove"
          aria-label={`Remove ${removeLabel}`}
          title={`Remove ${removeLabel}`}
          onClick={() => removeDraft(index)}
        >
          <Trash2 size={15} />
        </button>
      </article>
    );
  }

  return (
    <section className="settings-form default-goals-workspace">
      <header className="settings-card default-goals-overview">
        <div>
          <span className="goals-section-kicker">
            <Target size={15} />
            Weekly defaults
          </span>
          <h2>Reusable week rules</h2>
          <p>Standing goals and guardrails applied unless a plan or manual edit overrides them.</p>
        </div>
        {!isLoading ? (
          <button
            className="primary default-goals-save"
            type="button"
            disabled={writesBlocked || isSaving}
            onClick={save}
          >
            <Save size={16} />
            <span>{isSaving ? "Saving" : "Save defaults"}</span>
          </button>
        ) : null}
      </header>
      {isLoading ? (
        <section className="settings-card">
          <div className="settings-note">Loading…</div>
        </section>
      ) : (
        <>
          <div className="default-goals-content">
            <section className="default-goal-section default-goal-section--achievement">
              <header className="default-goal-section-header">
                <div>
                  <span className="default-goal-section-icon">
                    <Target size={17} />
                  </span>
                  <div>
                    <strong>Standing goals</strong>
                    <span>Targets to preserve when weeks are created.</span>
                  </div>
                </div>
                <span className="default-goal-count">{achievements.length}</span>
              </header>
              {achievements.length === 0 ? (
                <div className="goals-empty-state goals-empty-state--compact">
                  <Target size={17} />
                  <div>
                    <strong>No standing goals</strong>
                    <span>Add a target you want every week to remember.</span>
                  </div>
                </div>
              ) : null}
              <div className="default-goal-list">{achievements.map(renderRow)}</div>
              <button type="button" className="ghost-button default-goal-add" onClick={() => addDraft("achievement")}>
                <Plus size={16} />
                <span>Add goal</span>
              </button>
            </section>

            <section className="default-goal-section default-goal-section--guardrail">
              <header className="default-goal-section-header">
                <div>
                  <span className="default-goal-section-icon">
                    <ShieldCheck size={17} />
                  </span>
                  <div>
                    <strong>Guardrails</strong>
                    <span>Limits that flag weeks before training gets lopsided.</span>
                  </div>
                </div>
                <span className="default-goal-count">{guardrails.length}</span>
              </header>
              {guardrails.length === 0 ? (
                <div className="goals-empty-state goals-empty-state--compact">
                  <ShieldCheck size={17} />
                  <div>
                    <strong>No guardrails</strong>
                    <span>Add a limit for risk, recovery, or intensity.</span>
                  </div>
                </div>
              ) : null}
              <div className="default-goal-list">{guardrails.map(renderRow)}</div>
              <button type="button" className="ghost-button default-goal-add" onClick={() => addDraft("guardrail")}>
                <Plus size={16} />
                <span>Add guardrail</span>
              </button>
            </section>
          </div>
          {message ? <div className="settings-note">{message}</div> : null}
          {error ? <div className="settings-note settings-note--danger">{error}</div> : null}
        </>
      )}
    </section>
  );
}
