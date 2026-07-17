import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { GoalMetricDefinition, RecurringGoal } from "../../types/domain";
import { GoalListEditor } from "./GoalListEditor";
import type { GoalDraft } from "./goalDrafts";
import { goalDraftError, goalDraftPayload, goalToDraft, metricMap, serializeGoalDrafts } from "./goalDrafts";

const AUTOSAVE_DELAY_MS = 650;
const GOAL_INVALID_MESSAGE = "Finish every goal to save changes.";

export function DefaultGoalsCard({
  onGoalsSaved,
  writesBlocked
}: {
  onGoalsSaved?: () => void;
  writesBlocked: boolean;
}) {
  const [drafts, setDrafts] = useState<GoalDraft[]>([]);
  const [metrics, setMetrics] = useState<GoalMetricDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedDraftsRef = useRef(false);
  const lastSavedSnapshotRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metricsByKey = useMemo(() => metricMap(metrics), [metrics]);

  useEffect(() => {
    Promise.all([
      fetchJson<RecurringGoal[]>("/api/default-goals"),
      fetchJson<GoalMetricDefinition[]>("/api/goal-metrics")
    ])
      .then(([goals, availableMetrics]) => {
        const loadedDrafts = goals.map(goalToDraft);
        setMetrics(availableMetrics);
        lastSavedSnapshotRef.current = serializeGoalDrafts(loadedDrafts);
        hasLoadedDraftsRef.current = true;
        setDrafts(loadedDrafts);
      })
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Could not load baseline goals.")
      )
      .finally(() => setIsLoading(false));
  }, []);

  const saveDrafts = useCallback(
    async (draftsToSave: GoalDraft[]) => {
      const currentMetricMap = metricMap(metrics);
      if (
        writesBlocked ||
        draftsToSave.some((draft) => goalDraftError(draft, currentMetricMap) !== null)
      ) {
        return;
      }
      const snapshotToSave = serializeGoalDrafts(draftsToSave);
      if (snapshotToSave === lastSavedSnapshotRef.current) {
        return;
      }

      setIsSaving(true);
      setMessage("Saving changes…");
      setError(null);
      try {
        const saved = await fetchJson<RecurringGoal[]>("/api/default-goals", {
          method: "PUT",
          body: JSON.stringify(draftsToSave.map((draft) => goalDraftPayload(draft, currentMetricMap)))
        });
        const savedDrafts = saved.map((goal, index) => ({
          ...goalToDraft(goal),
          key: draftsToSave[index]?.key ?? goal.id
        }));
        lastSavedSnapshotRef.current = serializeGoalDrafts(savedDrafts);
        setDrafts((currentDrafts) => {
          if (serializeGoalDrafts(currentDrafts) === snapshotToSave) {
            return savedDrafts;
          }
          const savedByKey = new Map(savedDrafts.map((draft) => [draft.key, draft]));
          return currentDrafts.map((draft) => {
            const savedDraft = savedByKey.get(draft.key);
            return savedDraft ? { ...draft, id: savedDraft.id } : draft;
          });
        });
        setMessage("Goals saved.");
        onGoalsSaved?.();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Could not save baseline goals.");
        setMessage(null);
      } finally {
        setIsSaving(false);
      }
    },
    [metrics, onGoalsSaved, writesBlocked]
  );

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (isLoading || isSaving || !hasLoadedDraftsRef.current || metrics.length === 0) {
      return;
    }
    const currentSnapshot = serializeGoalDrafts(drafts);
    if (currentSnapshot === lastSavedSnapshotRef.current) {
      return;
    }
    if (writesBlocked) {
      setMessage(null);
      setError("Goals are read-only right now.");
      return;
    }
    if (drafts.some((draft) => goalDraftError(draft, metricsByKey) !== null)) {
      setError(null);
      setMessage(GOAL_INVALID_MESSAGE);
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
      }
    };
  }, [drafts, isLoading, isSaving, metrics, metricsByKey, saveDrafts, writesBlocked]);

  return (
    <section className="settings-card default-goals-card">
      <header className="settings-card-header goals-section-header">
        <div>
          <h2>Baseline goals</h2>
          <p>Every training week is checked against these.</p>
        </div>
      </header>
      {isLoading ? (
        <div className="settings-note">Loading…</div>
      ) : (
        <>
          <GoalListEditor
            addButtonLabel="Add goal"
            disabled={writesBlocked}
            drafts={drafts}
            emptyHint="No goals yet. Add a weekly target or limit, like rest days or a mileage cap."
            metrics={metrics}
            onDraftsChange={setDrafts}
          />
          {isSaving || message || error ? (
            <footer className="default-goals-footer">
              {isSaving ? <div className="settings-note">Saving changes…</div> : null}
              {!isSaving && message ? <div className="settings-note">{message}</div> : null}
              {error ? <div className="settings-note settings-note--danger">{error}</div> : null}
            </footer>
          ) : null}
        </>
      )}
    </section>
  );
}
