import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../../lib/api";
import { useProfileId } from "../../lib/profileContext";
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
  const profileId = useProfileId();
  const [drafts, setDrafts] = useState<GoalDraft[]>([]);
  const [metrics, setMetrics] = useState<GoalMetricDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedDraftsRef = useRef(false);
  const lastSavedSnapshotRef = useRef("");
  const failedSnapshotRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadControllerRef = useRef<AbortController | null>(null);
  const saveControllerRef = useRef<AbortController | null>(null);
  const activeProfileIdRef = useRef(profileId);
  activeProfileIdRef.current = profileId;
  const metricsByKey = useMemo(() => metricMap(metrics), [metrics]);

  useEffect(() => {
    loadControllerRef.current?.abort();
    saveControllerRef.current?.abort();
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const controller = new AbortController();
    loadControllerRef.current = controller;
    hasLoadedDraftsRef.current = false;
    lastSavedSnapshotRef.current = "";
    failedSnapshotRef.current = "";
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
        lastSavedSnapshotRef.current = serializeGoalDrafts(loadedDrafts);
        hasLoadedDraftsRef.current = true;
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
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [profileId]);

  const saveDrafts = useCallback(
    async (draftsToSave: GoalDraft[]) => {
      const currentMetricMap = metricMap(metrics);
      if (
        activeProfileIdRef.current !== profileId ||
        resolvedProfileId !== profileId ||
        writesBlocked ||
        draftsToSave.some((draft) => goalDraftError(draft, currentMetricMap) !== null)
      ) {
        return;
      }
      const snapshotToSave = serializeGoalDrafts(draftsToSave);
      if (snapshotToSave === lastSavedSnapshotRef.current) {
        return;
      }

      saveControllerRef.current?.abort();
      const controller = new AbortController();
      const savingProfileId = profileId;
      saveControllerRef.current = controller;
      failedSnapshotRef.current = "";
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
        lastSavedSnapshotRef.current = serializeGoalDrafts(savedDrafts);
        failedSnapshotRef.current = "";
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
        if (!controller.signal.aborted && activeProfileIdRef.current === savingProfileId) {
          failedSnapshotRef.current = snapshotToSave;
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
    },
    [metrics, onGoalsSaved, profileId, resolvedProfileId, writesBlocked]
  );

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (
      resolvedProfileId !== profileId ||
      isLoading ||
      isSaving ||
      !hasLoadedDraftsRef.current ||
      metrics.length === 0
    ) {
      return;
    }
    const currentSnapshot = serializeGoalDrafts(drafts);
    if (currentSnapshot === lastSavedSnapshotRef.current) {
      return;
    }
    if (currentSnapshot === failedSnapshotRef.current) {
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
  }, [drafts, isLoading, isSaving, metrics, metricsByKey, profileId, resolvedProfileId, saveDrafts, writesBlocked]);

  const isLoadingCurrentProfile = isLoading || resolvedProfileId !== profileId;
  const canRetrySave = Boolean(
    error &&
    !isSaving &&
    !writesBlocked &&
    serializeGoalDrafts(drafts) === failedSnapshotRef.current
  );

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
              {canRetrySave ? (
                <button className="text-action" type="button" onClick={() => void saveDrafts(drafts)}>
                  Retry save
                </button>
              ) : null}
            </footer>
          ) : null}
        </>
      )}
    </section>
  );
}
