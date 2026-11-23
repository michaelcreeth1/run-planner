import { AlertCircle, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import { formatNumber, formatShortDate, formatWeekday, labelForWorkoutType } from "../../lib/formatters";
import { sessionTypes, type SessionTypeOption } from "../../lib/options";
import { prescriptionTotals } from "../../lib/prescriptions";
import type { TrainingPaceEstimate, WorkoutTemplate } from "../../types/domain";

const INLINE_SEARCH_THRESHOLD = 6;

export function SessionPicker({ date, disabled = false, id, onQuickSession, onSelect }: {
  date: string;
  disabled?: boolean;
  id?: string;
  onQuickSession?: (sessionType?: SessionTypeOption) => void;
  onSelect: (template: WorkoutTemplate, easyPaceSecondsPerMile?: number) => void;
}) {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [paceEstimate, setPaceEstimate] = useState<TrainingPaceEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      fetchJson<WorkoutTemplate[]>("/api/workout-templates", { signal: controller.signal }),
      fetchJson<TrainingPaceEstimate>("/api/training-pace-estimate", { signal: controller.signal }).catch(() => null)
    ]).then(([loaded, pace]) => {
      if (controller.signal.aborted) return;
      setTemplates(loaded);
      setPaceEstimate(pace);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Could not load saved workouts.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);

  const query = search.trim().toLowerCase();
  const visibleTemplates = templates.filter((template) =>
    [template.name, template.workoutType, template.purpose, ...template.tags].join(" ").toLowerCase().includes(query)
  );
  const dateLabel = `${formatWeekday(date)}, ${formatShortDate(date)}`;
  const emptyMessage = onQuickSession
    ? "No saved workouts yet. Create one in Workouts, or start with a quick session."
    : "No saved workouts yet.";

  return (
    <section className="session-picker" id={id} aria-label={`${onQuickSession ? "Add session for" : "Saved workouts for"} ${dateLabel}`}>
      {onQuickSession ? (
        <>
          <header className="session-picker-heading"><strong>{dateLabel}</strong></header>
          <button className="session-picker-quick" disabled={disabled} type="button" onClick={() => onQuickSession()}>
            <Plus size={18} aria-hidden="true" />
            <span><strong>Quick session</strong><small>Start with an easy run from scratch.</small></span>
          </button>
          <div className="session-picker-types" aria-label="Other session types">
            {sessionTypes.filter((option) => option.sport !== "run" && option.sport !== "rest").map((option) => (
              <button key={option.value} disabled={disabled} type="button" onClick={() => onQuickSession(option)}>
                <Plus size={16} aria-hidden="true" /> {option.label}
              </button>
            ))}
          </div>
          <h3>Saved workouts</h3>
          <p className="field-help">Add an independent copy of a library workout.</p>
        </>
      ) : null}
      {onQuickSession || templates.length > INLINE_SEARCH_THRESHOLD ? (
        <label className="workout-library-search">
          <Search size={17} aria-hidden="true" />
          <input aria-label="Search saved workouts" disabled={disabled} placeholder="Search saved workouts" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      ) : null}
      {loading ? <p role="status">Loading saved workouts…</p> : error ? (
        <div className="session-picker-error" role="alert"><AlertCircle size={16} /><span>{error}</span><button disabled={disabled} type="button" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>
      ) : !visibleTemplates.length ? (
        <p>{query ? "No saved workouts match your search." : emptyMessage}</p>
      ) : (
        <div className="workout-library-picker__list">
          {visibleTemplates.map((template) => {
            const totals = prescriptionTotals(template.prescription, { easyPaceSecondsPerMile: paceEstimate?.easyPaceSecondsPerMile, workoutType: template.workoutType });
            return (
              <button key={template.id} disabled={disabled} type="button" onClick={() => onSelect(template, paceEstimate?.easyPaceSecondsPerMile)}>
                <span><strong>{template.name}</strong><small>{labelForWorkoutType(template.workoutType)} · {totals.distanceComplete ? "" : "~"}{formatNumber(totals.estimatedDistance / 1609.344)} mi</small></span>
                {onQuickSession ? <Plus size={16} aria-hidden="true" /> : <small aria-hidden="true">Add</small>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
