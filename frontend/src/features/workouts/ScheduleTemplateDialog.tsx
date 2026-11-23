import { CalendarPlus, Pencil, X } from "lucide-react";
import { useRef, useState } from "react";
import { useModalDialog } from "../../hooks/useModalDialog";
import { formatPrescriptionBlock, labelForWorkoutType } from "../../lib/formatters";
import type { WorkoutTemplate } from "../../types/domain";
import type { SessionTypeOption } from "../../lib/options";
import { SessionPicker } from "./SessionPicker";

export function AddSessionDialog({ date, onClose, onQuickSession, onSelect }: {
  date: string;
  onClose: () => void;
  onQuickSession: (sessionType?: SessionTypeOption) => void;
  onSelect: (template: WorkoutTemplate) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useModalDialog({ dialogRef, onDismiss: onClose });
  return (
    <div className="editor-backdrop">
      <aside aria-label="Add session" aria-modal="true" className="editor-panel session-picker-panel" ref={dialogRef} role="dialog" tabIndex={-1}>
        <header><h2>Add session</h2><button aria-label="Close add session" className="icon-button" type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="session-picker-body"><SessionPicker date={date} onQuickSession={onQuickSession} onSelect={onSelect} /></div>
      </aside>
    </div>
  );
}

export function WorkoutTemplatePreview({ template }: { template: WorkoutTemplate }) {
  return (
    <div className="workout-template-preview">
      <span>{labelForWorkoutType(template.workoutType)}</span>
      {template.purpose ? <section><h3>Purpose</h3><p>{template.purpose}</p></section> : null}
      {template.instructions ? <section><h3>Instructions</h3><p>{template.instructions}</p></section> : null}
      <section><h3>Workout structure</h3><ol>{template.prescription.blocks.map((block, index) => <li key={block.id ?? index}>{formatPrescriptionBlock(block)}</li>)}</ol></section>
    </div>
  );
}

export function ScheduleTemplateDialog({ template, initialDate, isSaving, error, onClose, onSchedule }: {
  template: WorkoutTemplate;
  initialDate: string;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSchedule: (date: string) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [date, setDate] = useState(initialDate);
  const dismiss = () => { if (!isSaving) onClose(); };
  useModalDialog({ dialogRef, onDismiss: dismiss });
  return (
    <div className="editor-backdrop">
      <aside aria-label={`Schedule ${template.name}`} aria-modal="true" className="editor-panel session-picker-panel" ref={dialogRef} role="dialog" tabIndex={-1}>
        <header><div><span>Schedule workout</span><h2>{template.name}</h2></div><button aria-label="Close scheduling" className="icon-button" disabled={isSaving} type="button" onClick={dismiss}><X size={18} /></button></header>
        <form aria-busy={isSaving} onSubmit={(event) => { event.preventDefault(); if (!isSaving && date) onSchedule(date); }}>
          <div className="session-picker-body">
            {error ? <p role="alert" className="settings-note settings-note--danger">{error}</p> : null}
            <label><span>Date</span><input aria-label="Schedule date" disabled={isSaving} required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <p className="field-help">This adds an independent copy. Your saved workout stays in the library.</p>
            <WorkoutTemplatePreview template={template} />
          </div>
          <footer className="editor-actions"><button className="ghost-button" disabled={isSaving} type="button" onClick={dismiss}>Cancel</button><button className="primary-button" disabled={isSaving || !date} type="submit"><CalendarPlus size={17} />{isSaving ? "Scheduling…" : "Schedule workout"}</button></footer>
        </form>
      </aside>
    </div>
  );
}

export function TemplatePreviewDialog({ template, writesBlocked, onClose, onEdit, onSchedule }: {
  template: WorkoutTemplate;
  writesBlocked: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSchedule: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useModalDialog({ dialogRef, onDismiss: onClose });
  return (
    <div className="editor-backdrop">
      <aside aria-label={`${template.name} saved workout details`} aria-modal="true" className="editor-panel session-picker-panel" ref={dialogRef} role="dialog" tabIndex={-1}>
        <header><h2>{template.name}</h2><button aria-label="Close saved workout details" className="icon-button" type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="session-picker-body"><WorkoutTemplatePreview template={template} /></div>
        <footer className="editor-actions">
          <button className="ghost-button" type="button" onClick={onClose}>Close</button>
          <button className="ghost-button" disabled={writesBlocked} type="button" onClick={onEdit}><Pencil size={17} aria-hidden="true" />Edit</button>
          <button className="primary-button" disabled={writesBlocked} type="button" onClick={onSchedule}><CalendarPlus size={17} />Schedule</button>
        </footer>
      </aside>
    </div>
  );
}
