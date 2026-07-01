import { Save, X } from "lucide-react";
import type { FormEvent } from "react";
import type { Workout, WorkoutForm } from "../../types/domain";
import { intensities, workoutTypes } from "../../lib/options";

export function WorkoutEditor({
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
