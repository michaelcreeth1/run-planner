import { Save, X } from "lucide-react";
import { useRef } from "react";
import type { FormEvent } from "react";
import { useModalDialog } from "../../hooks/useModalDialog";
import type { PrescriptionBlock, PrescriptionStep, WorkoutForm } from "../../types/domain";
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
  const drawerRef = useRef<HTMLElement | null>(null);
  const initialEditorSnapshotRef = useRef(JSON.stringify(editor));

  function handleClose() {
    if (isSaving) {
      return;
    }
    if (JSON.stringify(editor) !== initialEditorSnapshotRef.current && !window.confirm("Discard unsaved workout changes?")) {
      return;
    }
    onClose();
  }

  useModalDialog({ dialogRef: drawerRef, onDismiss: handleClose });

  function setMetric(field: WorkoutMetricField, value: string) {
    setEditor(recalculateWorkoutMetrics({ ...editor, [field]: value }, field));
  }

  function newStep(role: PrescriptionStep["role"] = "other"): PrescriptionStep {
    return {
      kind: "step",
      role,
      extent: "distance",
      distanceMeters: role === "recovery" ? 400 : 1609.344,
      displayUnit: "mi",
      supportingTargets: [],
      notes: ""
    };
  }

  function updateBlocks(updater: (blocks: PrescriptionBlock[]) => PrescriptionBlock[]) {
    setEditor({ ...editor, prescription: { blocks: updater(editor.prescription?.blocks ?? []) } });
  }

  function updateStep(index: number, updates: Partial<PrescriptionStep>) {
    updateBlocks((blocks) => blocks.map((block, current) => current === index && block.kind === "step" ? { ...block, ...updates } : block));
  }

  function moveBlock(index: number, direction: -1 | 1) {
    updateBlocks((blocks) => {
      const target = index + direction;
      if (target < 0 || target >= blocks.length) return blocks;
      const next = [...blocks];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function displayValue(step: PrescriptionStep) {
    if (step.extent === "distance") {
      const divisor = step.displayUnit === "km" ? 1000 : step.displayUnit === "m" ? 1 : 1609.344;
      return String(Math.round(((step.distanceMeters ?? 0) / divisor) * 100) / 100);
    }
    if (step.extent === "duration") {
      return String(step.displayUnit === "min" ? (step.durationSeconds ?? 0) / 60 : step.durationSeconds ?? 0);
    }
    return "";
  }

  function setStepExtent(index: number, step: PrescriptionStep, extent: PrescriptionStep["extent"]) {
    if (extent === "distance") updateStep(index, { extent, distanceMeters: 1609.344, durationSeconds: null, displayUnit: "mi" });
    else if (extent === "duration") updateStep(index, { extent, distanceMeters: null, durationSeconds: 300, displayUnit: "min" });
    else updateStep(index, { extent, distanceMeters: null, durationSeconds: null, displayUnit: null });
  }

  function setStepValue(index: number, step: PrescriptionStep, value: string) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return;
    if (step.extent === "distance") {
      const multiplier = step.displayUnit === "km" ? 1000 : step.displayUnit === "m" ? 1 : 1609.344;
      updateStep(index, { distanceMeters: number * multiplier });
    } else if (step.extent === "duration") {
      updateStep(index, { durationSeconds: Math.round(number * (step.displayUnit === "min" ? 60 : 1)) });
    }
  }

  return (
    <div className="editor-backdrop">
      <aside aria-label="Workout editor" aria-modal="true" className="editor-panel" ref={drawerRef} role="dialog" tabIndex={-1}>
        <header>
          <h2>{editor.id ? "Edit workout" : "New workout"}</h2>
          <button type="button" title="Close" disabled={isSaving} onClick={handleClose}>
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
          <section className="workout-structure" aria-label="Structured workout">
            <div className="workout-structure__heading">
              <div>
                <span>Workout structure</span>
                <small className="field-help">Optional structured steps preserve intent without replacing your notes.</small>
              </div>
              {editor.prescription ? null : (
                <button type="button" onClick={() => setEditor({ ...editor, prescription: { blocks: [newStep("warmup")] } })}>
                  Add structure
                </button>
              )}
            </div>
            {editor.prescription ? (
              <div className="workout-structure__blocks">
                {editor.prescription.blocks.map((block, index) => block.kind === "step" ? (
                  <div className="workout-step" key={block.id ?? `step-${index}`}>
                    <div className="workout-step__tools">
                      <button aria-label={`Move step ${index + 1} earlier`} disabled={index === 0} type="button" onClick={() => moveBlock(index, -1)}>↑</button>
                      <button aria-label={`Move step ${index + 1} later`} disabled={index === editor.prescription!.blocks.length - 1} type="button" onClick={() => moveBlock(index, 1)}>↓</button>
                      <button aria-label={`Remove step ${index + 1}`} type="button" onClick={() => updateBlocks((blocks) => blocks.filter((_, current) => current !== index))}>Remove</button>
                    </div>
                    <select aria-label={`Step ${index + 1} role`} value={block.role} onChange={(event) => updateStep(index, { role: event.target.value as PrescriptionStep["role"] })}>
                      <option value="warmup">Warm-up</option><option value="work">Work</option><option value="recovery">Recovery</option><option value="cooldown">Cool-down</option><option value="other">Other</option>
                    </select>
                    <select aria-label={`Step ${index + 1} extent`} value={block.extent} onChange={(event) => setStepExtent(index, block, event.target.value as PrescriptionStep["extent"])}>
                      <option value="distance">Distance</option><option value="duration">Duration</option><option value="open">Open-ended</option>
                    </select>
                    {block.extent === "open" ? <span className="field-help">No fixed extent</span> : <>
                      <input aria-label={`Step ${index + 1} amount`} min="0" step="0.1" type="number" value={displayValue(block)} onChange={(event) => setStepValue(index, block, event.target.value)} />
                      <select aria-label={`Step ${index + 1} unit`} value={block.displayUnit ?? "mi"} onChange={(event) => {
                        const unit = event.target.value as PrescriptionStep["displayUnit"];
                        updateStep(index, { displayUnit: unit });
                      }}>
                        {block.extent === "distance" ? <><option value="mi">mi</option><option value="km">km</option><option value="m">m</option></> : <><option value="min">min</option><option value="sec">sec</option></>}
                      </select>
                    </>}
                    <input aria-label={`Step ${index + 1} guidance`} placeholder="Target or guidance" value={block.primaryTarget?.guidance ?? ""} onChange={(event) => updateStep(index, { primaryTarget: event.target.value ? { kind: "guidance", guidance: event.target.value } : null })} />
                  </div>
                ) : (
                  <div className="workout-repeat" key={block.id ?? `repeat-${index}`}>
                    <strong>Repeat group</strong>
                    <label><span>Repetitions</span><input aria-label={`Repeat group ${index + 1} repetitions`} min="1" type="number" value={block.repetitions} onChange={(event) => updateBlocks((blocks) => blocks.map((item, current) => current === index && item.kind === "repeat" ? { ...item, repetitions: Math.max(1, Number(event.target.value)) } : item))} /></label>
                    <label className="checkbox-label"><input checked={block.recoveryAfterFinal} type="checkbox" onChange={(event) => updateBlocks((blocks) => blocks.map((item, current) => current === index && item.kind === "repeat" ? { ...item, recoveryAfterFinal: event.target.checked } : item))} /> Include recovery after final repetition</label>
                    <p className="field-help">{block.steps.length} step{block.steps.length === 1 ? "" : "s"} per repetition. Edit nested steps after saving is supported by the prescription API.</p>
                    <button type="button" onClick={() => updateBlocks((blocks) => blocks.filter((_, current) => current !== index))}>Remove group</button>
                  </div>
                ))}
                <div className="workout-structure__actions">
                  <button type="button" onClick={() => updateBlocks((blocks) => [...blocks, newStep()])}>Add step</button>
                  <button type="button" onClick={() => updateBlocks((blocks) => [...blocks, { kind: "repeat", repetitions: 5, recoveryAfterFinal: false, notes: "", steps: [newStep("work"), { ...newStep("recovery"), extent: "duration", distanceMeters: null, durationSeconds: 120, displayUnit: "min" }] }])}>Add repeat group</button>
                </div>
              </div>
            ) : null}
          </section>
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
