import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Copy, Plus, Repeat2, Save, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useModalDialog } from "../../hooks/useModalDialog";
import type { PrescriptionBlock, PrescriptionStep, WorkoutForm } from "../../types/domain";
import { sessionTypeForWorkout, sessionTypeGroups, sessionTypes } from "../../lib/options";
import { recalculateWorkoutMetrics, type WorkoutMetricField } from "../../lib/workoutMetrics";

export function WorkoutEditor({
  editor,
  error,
  isSaving,
  mode = "scheduled",
  templateTags = [],
  setTemplateTags,
  setEditor,
  onSubmit,
  onClose
}: {
  editor: WorkoutForm;
  error: string | null;
  isSaving: boolean;
  mode?: "scheduled" | "template";
  templateTags?: string[];
  setTemplateTags?: (tags: string[]) => void;
  setEditor: (editor: WorkoutForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const selectedSessionType = sessionTypeForWorkout(editor);
  const drawerRef = useRef<HTMLElement | null>(null);
  const initialEditorSnapshotRef = useRef(JSON.stringify(editor));
  const [structureOpen, setStructureOpen] = useState(false);
  const [tagInput, setTagInput] = useState(() => templateTags.join(", "));

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

  function newRepeatGroup(): PrescriptionBlock {
    return {
      kind: "repeat",
      repetitions: 5,
      recoveryAfterFinal: false,
      notes: "",
      steps: [
        newStep("work"),
        {
          ...newStep("recovery"),
          extent: "duration",
          distanceMeters: null,
          durationSeconds: 120,
          displayUnit: "min"
        }
      ]
    };
  }

  function updateBlocks(updater: (blocks: PrescriptionBlock[]) => PrescriptionBlock[]) {
    setEditor({ ...editor, prescription: { blocks: updater(editor.prescription?.blocks ?? []) } });
  }

  function transformBlocksAtPath(
    blocks: PrescriptionBlock[],
    parentPath: number[],
    updater: (children: PrescriptionBlock[]) => PrescriptionBlock[]
  ): PrescriptionBlock[] {
    if (!parentPath.length) {
      return updater(blocks);
    }
    const [parentIndex, ...remainingPath] = parentPath;
    return blocks.map((block, index) =>
      index === parentIndex && block.kind === "repeat"
        ? { ...block, steps: transformBlocksAtPath(block.steps, remainingPath, updater) }
        : block
    );
  }

  function updateBlocksAtPath(
    parentPath: number[],
    updater: (children: PrescriptionBlock[]) => PrescriptionBlock[]
  ) {
    updateBlocks((blocks) => transformBlocksAtPath(blocks, parentPath, updater));
  }

  function updateBlockAtPath(
    path: number[],
    updater: (block: PrescriptionBlock) => PrescriptionBlock
  ) {
    const parentPath = path.slice(0, -1);
    const blockIndex = path.at(-1);
    if (blockIndex === undefined) return;
    updateBlocksAtPath(parentPath, (blocks) =>
      blocks.map((block, index) => index === blockIndex ? updater(block) : block)
    );
  }

  function updateStep(path: number[], updates: Partial<PrescriptionStep>) {
    updateBlockAtPath(path, (block) => block.kind === "step" ? { ...block, ...updates } : block);
  }

  function moveBlock(path: number[], direction: -1 | 1) {
    const parentPath = path.slice(0, -1);
    const blockIndex = path.at(-1);
    if (blockIndex === undefined) return;
    updateBlocksAtPath(parentPath, (blocks) => {
      const index = blockIndex;
      const target = index + direction;
      if (target < 0 || target >= blocks.length) return blocks;
      const next = [...blocks];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function duplicateBlock(path: number[]) {
    const parentPath = path.slice(0, -1);
    const blockIndex = path.at(-1);
    if (blockIndex === undefined) return;
    updateBlocksAtPath(parentPath, (blocks) => [
      ...blocks.slice(0, blockIndex + 1),
      structuredClone(blocks[blockIndex]),
      ...blocks.slice(blockIndex + 1)
    ]);
  }

  function removeBlock(path: number[]) {
    const parentPath = path.slice(0, -1);
    const blockIndex = path.at(-1);
    if (blockIndex === undefined) return;
    updateBlocksAtPath(parentPath, (blocks) => blocks.filter((_, index) => index !== blockIndex));
  }

  function addBlock(parentPath: number[], block: PrescriptionBlock) {
    updateBlocksAtPath(parentPath, (blocks) => [...blocks, block]);
  }

  function blockNumber(path: number[]) {
    return path.map((index) => index + 1).join(".");
  }

  function structureSummary(blocks: PrescriptionBlock[]) {
    const { steps, repeats } = countStructure(blocks);
    return `${steps} ${steps === 1 ? "step" : "steps"}${repeats ? ` · ${repeats} repeat ${repeats === 1 ? "group" : "groups"}` : ""}`;
  }

  function countStructure(blocks: PrescriptionBlock[]): { steps: number; repeats: number } {
    return blocks.reduce((total, block) => {
      if (block.kind === "step") return { steps: total.steps + 1, repeats: total.repeats };
      const nested = countStructure(block.steps);
      return { steps: total.steps + nested.steps, repeats: total.repeats + nested.repeats + 1 };
    }, { steps: 0, repeats: 0 });
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

  function setStepExtent(path: number[], step: PrescriptionStep, extent: PrescriptionStep["extent"]) {
    if (extent === "distance") updateStep(path, { extent, distanceMeters: 1609.344, durationSeconds: null, displayUnit: "mi" });
    else if (extent === "duration") updateStep(path, { extent, distanceMeters: null, durationSeconds: 300, displayUnit: "min" });
    else updateStep(path, { extent, distanceMeters: null, durationSeconds: null, displayUnit: null });
  }

  function setStepValue(path: number[], step: PrescriptionStep, value: string) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return;
    if (step.extent === "distance") {
      const multiplier = step.displayUnit === "km" ? 1000 : step.displayUnit === "m" ? 1 : 1609.344;
      updateStep(path, { distanceMeters: number * multiplier });
    } else if (step.extent === "duration") {
      updateStep(path, { durationSeconds: Math.round(number * (step.displayUnit === "min" ? 60 : 1)) });
    }
  }

  function renderBlocks(blocks: PrescriptionBlock[], parentPath: number[] = []) {
    const nested = parentPath.length > 0;
    return (
      <div className={nested ? "workout-repeat__blocks" : "workout-structure__blocks"}>
        {blocks.map((block, index) => {
          const path = [...parentPath, index];
          const number = blockNumber(path);
          if (block.kind === "step") {
            return (
              <article className="workout-step" key={block.id ?? `step-${number}`}>
                <header className="workout-step__header">
                  <strong>Step {number}</strong>
                  <div className="workout-step__tools">
                    <button aria-label={`Move step ${number} earlier`} disabled={index === 0} type="button" onClick={() => moveBlock(path, -1)}><ArrowUp size={16} /></button>
                    <button aria-label={`Move step ${number} later`} disabled={index === blocks.length - 1} type="button" onClick={() => moveBlock(path, 1)}><ArrowDown size={16} /></button>
                    <button aria-label={`Duplicate step ${number}`} type="button" onClick={() => duplicateBlock(path)}><Copy size={16} /></button>
                    <button className="workout-step__remove" aria-label={`Remove step ${number}`} type="button" onClick={() => removeBlock(path)}><Trash2 size={16} /></button>
                  </div>
                </header>
                <div className="workout-step__fields">
                  <label><span>Role</span><select aria-label={`Step ${number} role`} value={block.role} onChange={(event) => updateStep(path, { role: event.target.value as PrescriptionStep["role"] })}>
                    <option value="warmup">Warm-up</option><option value="work">Work</option><option value="recovery">Recovery</option><option value="cooldown">Cool-down</option><option value="other">Other</option>
                  </select></label>
                  <label><span>Extent</span><select aria-label={`Step ${number} extent`} value={block.extent} onChange={(event) => setStepExtent(path, block, event.target.value as PrescriptionStep["extent"])}>
                    <option value="distance">Distance</option><option value="duration">Duration</option><option value="open">Open-ended</option>
                  </select></label>
                  {block.extent === "open" ? <p className="workout-step__open">No fixed distance or duration.</p> : <label className="workout-step__amount"><span>Amount</span><span className="workout-step__amount-fields">
                    <input aria-label={`Step ${number} amount`} min="0" step="0.1" type="number" value={displayValue(block)} onChange={(event) => setStepValue(path, block, event.target.value)} />
                    <select aria-label={`Step ${number} unit`} value={block.displayUnit ?? "mi"} onChange={(event) => updateStep(path, { displayUnit: event.target.value as PrescriptionStep["displayUnit"] })}>
                      {block.extent === "distance" ? <><option value="mi">mi</option><option value="km">km</option><option value="m">m</option></> : <><option value="min">min</option><option value="sec">sec</option></>}
                    </select>
                  </span></label>}
                  <label className="workout-step__guidance"><span>Target or guidance</span><input aria-label={`Step ${number} guidance`} placeholder="Easy effort, threshold pace, HR ceiling…" value={block.primaryTarget?.guidance ?? ""} onChange={(event) => updateStep(path, { primaryTarget: event.target.value ? { kind: "guidance", guidance: event.target.value } : null })} /></label>
                </div>
              </article>
            );
          }

          return (
            <article className="workout-repeat" key={block.id ?? `repeat-${number}`}>
              <header className="workout-repeat__header">
                <span className="workout-repeat__title">
                  <span className="workout-repeat__badge"><Repeat2 size={16} />{block.repetitions}×</span>
                  <strong>Repeat group {number}</strong>
                </span>
                <div className="workout-step__tools">
                  <button aria-label={`Move repeat group ${number} earlier`} disabled={index === 0} type="button" onClick={() => moveBlock(path, -1)}><ArrowUp size={16} /></button>
                  <button aria-label={`Move repeat group ${number} later`} disabled={index === blocks.length - 1} type="button" onClick={() => moveBlock(path, 1)}><ArrowDown size={16} /></button>
                  <button aria-label={`Duplicate repeat group ${number}`} type="button" onClick={() => duplicateBlock(path)}><Copy size={16} /></button>
                  <button className="workout-step__remove" aria-label={`Remove repeat group ${number}`} type="button" onClick={() => removeBlock(path)}><Trash2 size={16} /></button>
                </div>
              </header>
              <div className="workout-repeat__settings">
                <label><span>Repetitions</span><input aria-label={`Repeat group ${number} repetitions`} min="1" max="100" type="number" value={block.repetitions} onChange={(event) => updateBlockAtPath(path, (item) => item.kind === "repeat" ? { ...item, repetitions: Math.max(1, Number(event.target.value)) } : item)} /></label>
              </div>
              <div className="workout-repeat__sequence">
                <div className="workout-repeat__sequence-heading">
                  <strong>Repeated sequence</strong>
                  <span>{block.steps.length} direct {block.steps.length === 1 ? "block" : "blocks"}</span>
                </div>
                {renderBlocks(block.steps, path)}
                <div className="workout-repeat__actions">
                  <button type="button" onClick={() => addBlock(path, newStep())}><Plus size={16} /> Add step inside group</button>
                  <button type="button" onClick={() => addBlock(path, newRepeatGroup())}><Repeat2 size={16} /> Add nested repeat group</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div className="editor-backdrop">
      <aside aria-label="Workout editor" aria-modal="true" className="editor-panel workout-editor-panel" ref={drawerRef} role="dialog" tabIndex={-1}>
        <header>
          <h2>{editor.id ? `Edit ${mode === "template" ? "library workout" : "workout"}` : `New ${mode === "template" ? "library workout" : "workout"}`}</h2>
          <button type="button" title="Close" disabled={isSaving} onClick={handleClose}>
            <X size={18} />
          </button>
        </header>
        <form aria-busy={isSaving} onSubmit={onSubmit}>
          {error ? <div className="settings-note settings-note--danger" role="alert">{error}</div> : null}
          <div className="workout-editor-basics">
            {mode === "scheduled" ? <label>
              <span>Date</span>
              <input
                type="date"
                value={editor.plannedDate}
                onChange={(event) => setEditor({ ...editor, plannedDate: event.target.value })}
              />
            </label> : null}
            <label>
              <span>{mode === "template" ? "Name" : "Title"}</span>
              <input
                aria-label="Title"
                placeholder={selectedSessionType.label}
                value={editor.title}
                onChange={(event) => setEditor({ ...editor, title: event.target.value })}
              />
              <small className="field-help">{mode === "template" ? "Use a short, searchable name." : `Optional — defaults to ${selectedSessionType.label}.`}</small>
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
            {mode === "template" ? (
              <label>
                <span>Tags</span>
                <input
                  aria-label="Workout tags"
                  placeholder="threshold, track, marathon"
                  value={tagInput}
                  onChange={(event) => {
                    setTagInput(event.target.value);
                    setTemplateTags?.(
                      event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean)
                    );
                  }}
                />
                <small className="field-help">Separate tags with commas.</small>
              </label>
            ) : null}
          </div>
          <div className="form-grid form-grid--three workout-metrics-grid">
            <label>
              <span>Miles</span>
              <input
                min="0"
                step="0.01"
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
          <section className={`workout-structure${structureOpen ? " workout-structure--open" : ""}`} aria-label="Structured workout">
            <div className="workout-structure__heading">
              <div>
                <h3>Workout structure</h3>
                <p>Optional steps for intervals, progressions, and other prescribed sessions.</p>
              </div>
              {editor.prescription ? (
                <button className="workout-structure__toggle" type="button" aria-expanded={structureOpen} onClick={() => setStructureOpen((open) => !open)}>
                  {structureOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {structureOpen ? "Hide" : "Edit"}
                </button>
              ) : (
                <button className="workout-structure__toggle" type="button" onClick={() => {
                  setEditor({ ...editor, prescription: { blocks: [newStep("warmup")] } });
                  setStructureOpen(true);
                }}>
                  <Plus size={16} /> Add structure
                </button>
              )}
            </div>
            {editor.prescription && !structureOpen ? (
              <p className="workout-structure__summary">{structureSummary(editor.prescription.blocks)}</p>
            ) : null}
            {editor.prescription && structureOpen ? (
              <div className="workout-structure__editor">
                {renderBlocks(editor.prescription.blocks)}
                <div className="workout-structure__actions">
                  <button type="button" onClick={() => addBlock([], newStep())}><Plus size={16} /> Add top-level step</button>
                  <button type="button" onClick={() => addBlock([], newRepeatGroup())}><Repeat2 size={16} /> Add top-level repeat group</button>
                  <button className="workout-structure__clear" type="button" onClick={() => {
                    setEditor({ ...editor, prescription: null });
                    setStructureOpen(false);
                  }}>Use simple workout</button>
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
          {mode === "scheduled" ? <label>
            <span>Notes</span>
            <textarea
              rows={3}
              value={editor.notes}
              onChange={(event) => setEditor({ ...editor, notes: event.target.value })}
            />
          </label> : null}
          <div className="editor-actions">
            <button className="primary" disabled={isSaving} type="submit">
              <Save size={17} />
              <span>{isSaving ? "Saving…" : mode === "template" ? "Save to library" : "Save"}</span>
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
