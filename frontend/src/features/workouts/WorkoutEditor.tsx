import { Save, X } from "lucide-react";
import type { FormEvent } from "react";
import type { WorkoutForm } from "../../types/domain";
import { sessionTypeForWorkout, sessionTypeGroups, sessionTypes } from "../../lib/options";
import { recalculateWorkoutMetrics, type WorkoutMetricField } from "../../lib/workoutMetrics";

export function WorkoutEditor({
  editor,
  error,
  isSaving,
  setEditor,
  onSubmit,
  onClose
}: {
  editor: WorkoutForm;
  error: string | null;
  isSaving: boolean;
  setEditor: (editor: WorkoutForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const selectedSessionType = sessionTypeForWorkout(editor);

  function setMetric(field: WorkoutMetricField, value: string) {
    setEditor(recalculateWorkoutMetrics({ ...editor, [field]: value }, field));
  }

  return (
    <div className="editor-backdrop">
      <aside className="editor-panel" aria-label="Workout editor">
        <header>
          <h2>{editor.id ? "Edit workout" : "New workout"}</h2>
          <button type="button" title="Close" disabled={isSaving} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <form aria-busy={isSaving} onSubmit={onSubmit}>
          {error ? <div className="settings-note settings-note--danger" role="alert">{error}</div> : null}
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
              aria-label="Title"
              placeholder={selectedSessionType.label}
              value={editor.title}
              onChange={(event) => setEditor({ ...editor, title: event.target.value })}
            />
            <small className="field-help">Optional — defaults to {selectedSessionType.label}.</small>
          </label>
          <label>
            <span>Session type</span>
            <select
              value={selectedSessionType.value}
              onChange={(event) => {
                const sessionType = sessionTypes.find((option) => option.value === event.target.value);
                if (sessionType) {
                  setEditor({
                    ...editor,
                    sport: sessionType.sport,
                    workoutType: sessionType.workoutType,
                    intensityCategory: sessionType.intensityCategory
                  });
                }
              }}
            >
              {sessionTypeGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="form-grid form-grid--three workout-metrics-grid">
            <label>
              <span>Miles</span>
              <input
                min="0"
                step="0.1"
                type="number"
                value={editor.plannedDistance}
                onChange={(event) => setMetric("plannedDistance", event.target.value)}
              />
            </label>
            <label>
              <span>Time (H:MM:SS)</span>
              <input
                inputMode="numeric"
                pattern="[0-9]+:[0-5][0-9]:[0-5][0-9]"
                placeholder="0:45:00"
                title="Enter time as hours:minutes:seconds"
                value={editor.plannedDuration}
                onChange={(event) => setMetric("plannedDuration", event.target.value)}
              />
            </label>
            <label>
              <span>Pace (/mi)</span>
              <input
                pattern="[0-9]+(:[0-5][0-9])?"
                placeholder="8:30"
                title="Enter pace as minutes:seconds per mile"
                value={editor.plannedPace}
                onChange={(event) => setMetric("plannedPace", event.target.value)}
              />
            </label>
          </div>
          <p className="field-help">Enter any two; the third is calculated automatically. Time uses H:MM:SS.</p>
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
            <button className="primary" disabled={isSaving} type="submit">
              <Save size={17} />
              <span>{isSaving ? "Saving…" : "Save"}</span>
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
