import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../../lib/api";
import { useProfileId } from "../../lib/profileContext";
import type { GoalMetricDefinition, RecurringGoal } from "../../types/domain";
import { GoalListEditor } from "./GoalListEditor";
import type { GoalEditRequest } from "./GoalListEditor";
import type { GoalDraft } from "./goalDrafts";
import { goalDraftError, goalDraftPayload, goalToDraft, metricMap, serializeGoalDrafts } from "./goalDrafts";

export function DefaultGoalsCard({
  editRequest = null,
  onGoalsSaved,
  writesBlocked,
  overrideDescription
}: {
  editRequest?: GoalEditRequest | null;
  onGoalsSaved?: () => void;
  writesBlocked: boolean;
  overrideDescription?: (draft: GoalDraft) => string | null;
}) {
  const profileId = useProfileId();
  const [drafts, setDrafts] = useState<GoalDraft[]>([]);
  const [metrics, setMetrics] = useState<GoalMetricDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<GoalDraft[]>([]);
  const [editorVersion, setEditorVersion] = useState(0);
  const loadControllerRef = useRef<AbortController | null>(null);
  const saveControllerRef = useRef<AbortController | null>(null);
  const activeProfileIdRef = useRef(profileId);
  activeProfileIdRef.current = profileId;
  const metricsByKey = useMemo(() => metricMap(metrics), [metrics]);

  useEffect(() => {
    loadControllerRef.current?.abort();
    saveControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setSavedDrafts([]);
    setDrafts([]);
    setMetrics([]);
    setIsLoading(true);
    setIsSaving(false);
    setResolvedProfileId(null);
    setMessage(null);
    setError(null);
    Promise.all([
      fetchJson<RecurringGoal[]>("/api/default-goals", { signal: controller.signal }),
      fetchJson<GoalMetricDefinition[]>("/api/goal-metrics", { signal: controller.signal })
    ])
      .then(([goals, availableMetrics]) => {
        if (controller.signal.aborted || activeProfileIdRef.current !== profileId) {
          return;
        }
        const loadedDrafts = goals.map(goalToDraft);
        setMetrics(availableMetrics);
        setSavedDrafts(loadedDrafts);
        setDrafts(loadedDrafts);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted && activeProfileIdRef.current === profileId) {
          setError(loadError instanceof Error ? loadError.message : "Could not load baseline goals.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && activeProfileIdRef.current === profileId) {
          setResolvedProfileId(profileId);
          setIsLoading(false);
        }
      });
    return () => {
      controller.abort();
      saveControllerRef.current?.abort();
    };
  }, [profileId]);

  async function saveDrafts(draftsToSave: GoalDraft[]) {
    const currentMetricMap = metricMap(metrics);
    if (
      activeProfileIdRef.current !== profileId ||
      resolvedProfileId !== profileId ||
      writesBlocked || isSaving ||
      draftsToSave.some((draft) => goalDraftError(draft, currentMetricMap) !== null)
    ) {
      return;
    }
    const snapshotToSave = serializeGoalDrafts(draftsToSave);
    if (snapshotToSave === serializeGoalDrafts(savedDrafts)) {
      return;
    }

    saveControllerRef.current?.abort();
    const controller = new AbortController();
    const savingProfileId = profileId;
    saveControllerRef.current = controller;
    setIsSaving(true);
    setMessage("Saving changes…");
    setError(null);
    try {
      const saved = await fetchJson<RecurringGoal[]>("/api/default-goals", {
        method: "PUT",
        body: JSON.stringify(draftsToSave.map((draft) => goalDraftPayload(draft, currentMetricMap))),
        signal: controller.signal
      });
      if (controller.signal.aborted || activeProfileIdRef.current !== savingProfileId) {
        return;
      }
      const savedDrafts = saved.map((goal, index) => ({
        ...goalToDraft(goal),
        key: draftsToSave[index]?.key ?? goal.id
      }));
      setSavedDrafts(savedDrafts);
      setDrafts(savedDrafts);
      setEditorVersion((current) => current + 1);
      setMessage("Goals saved.");
      onGoalsSaved?.();
    } catch (saveError) {
      if (!controller.signal.aborted && activeProfileIdRef.current === savingProfileId) {
        setError(saveError instanceof Error ? saveError.message : "Could not save baseline goals.");
        setMessage(null);
      }
    } finally {
      if (saveControllerRef.current === controller) {
        saveControllerRef.current = null;
      }
      if (!controller.signal.aborted && activeProfileIdRef.current === savingProfileId) {
        setIsSaving(false);
      }
    }
  }

  const isLoadingCurrentProfile = isLoading || resolvedProfileId !== profileId;
  const hasChanges = serializeGoalDrafts(drafts) !== serializeGoalDrafts(savedDrafts);
  const invalid = drafts.some((draft) => goalDraftError(draft, metricsByKey) !== null);

  function cancelChanges() {
    setDrafts(savedDrafts);
    setEditorVersion((current) => current + 1);
    setError(null);
    setMessage(null);
  }

  return (
    <section className="settings-card default-goals-card">
      <header className="settings-card-header goals-section-header">
        <div>
          <h2>Baseline goals</h2>
        </div>
      </header>
      {isLoadingCurrentProfile ? (
        <div className="settings-note">Loading…</div>
      ) : (
        <>
          <p className="field-help">Affects every week unless a plan or phase rule overrides it. Changes stay in this draft until you save goals.</p>
          <GoalListEditor
            key={`${profileId}-${editorVersion}`}
            addButtonLabel="Add goal"
            disabled={writesBlocked || isSaving}
            drafts={drafts}
            editRequest={editRequest}
            emptyHint="No goals yet. Add a weekly target or limit, like rest days or a mileage cap."
            metrics={metrics}
            onDraftsChange={(next) => { setDrafts(next); setMessage(null); setError(null); }}
            scopeImpact={(draft) => overrideDescription?.(draft) ?? "Affects every week unless a plan or phase rule overrides it."}
            persistenceHint="Saved when you save goals. Cancel changes restores all baseline goals."
          />
          <footer className="default-goals-footer" aria-live="polite">
            {hasChanges ? <div className="goal-save-actions">
              <button className="primary-button" type="button" disabled={isSaving || writesBlocked || invalid} onClick={() => void saveDrafts(drafts)}>
                {isSaving ? "Saving…" : "Save goals"}
              </button>
              <button className="ghost-button" type="button" disabled={isSaving} onClick={cancelChanges}>Cancel changes</button>
              <small>{invalid ? "Finish every goal to save changes." : "Unsaved changes"}</small>
            </div> : null}
            {message ? <div className="settings-note">{message}</div> : null}
            {error ? <div role="alert" className="settings-note settings-note--danger">{error}</div> : null}
          </footer>
        </>
      )}
    </section>
  );
}
