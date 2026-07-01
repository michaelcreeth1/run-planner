import { Save, X } from "lucide-react";
import type { FormEvent } from "react";
import type {
  WeekGoalCategory,
  WeekGoalEvaluationMode,
  WeekGoalForm,
  WeekGoalPriority,
  WeekGoalStatus,
  WeekGoalType,
  WeekGoalUnit
} from "../../types/domain";
import { goalCategories, goalEvaluationModes, goalStatuses, goalUnits } from "../../lib/options";

export function WeekGoalEditor({
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
