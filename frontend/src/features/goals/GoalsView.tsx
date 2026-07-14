import { CalendarDays, Flag, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "../../lib/api";
import { toDateInputValue } from "../../lib/dates";
import { queryKeys, useGoalRacesQuery } from "../../lib/queries";
import { useProfileId } from "../../lib/profileContext";
import type { GoalRace, RaceDistance } from "../../types/domain";
import { DefaultGoalsCard } from "./DefaultGoalsCard";
import { GoalImpactSection } from "./GoalImpactSection";

const raceDistanceLabels: Record<GoalRace["distance"], string> = {
  "5k": "5K",
  "10k": "10K",
  half_marathon: "Half marathon",
  marathon: "Marathon",
  other: "Custom distance"
};

const distanceOptions: Array<{ value: RaceDistance; label: string }> = [
  { value: "5k", label: "5K" },
  { value: "10k", label: "10K" },
  { value: "half_marathon", label: "Half marathon" },
  { value: "marathon", label: "Marathon" },
  { value: "other", label: "Other" }
];

type GoalRaceFormState = {
  id?: string;
  name: string;
  raceDate: string;
  distance: RaceDistance;
  distanceMiles: string;
  targetTime: string;
  priority: GoalRace["priority"];
  location: string;
  altitudeContext: string;
  notes: string;
};

function formatTargetTime(totalSeconds: number | null) {
  if (!totalSeconds) {
    return "No target time";
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function formatRaceDateParts(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return {
    day: new Intl.DateTimeFormat(undefined, { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat(undefined, { month: "short" }).format(date)
  };
}

export function GoalsView({
  writesBlocked,
  onSelectWeek
}: {
  writesBlocked: boolean;
  onSelectWeek: (weekStartDate: string) => void;
}) {
  const profileId = useProfileId();
  const queryClient = useQueryClient();
  const racesQuery = useGoalRacesQuery(profileId);
  const races = racesQuery.data ?? [];
  const [racesError, setRacesError] = useState<string | null>(null);
  const [raceSuccess, setRaceSuccess] = useState<string | null>(null);
  const [raceForm, setRaceForm] = useState<GoalRaceFormState | null>(null);
  const [isSavingRace, setIsSavingRace] = useState(false);
  const sortedRaces = [...races].sort((left, right) => left.raceDate.localeCompare(right.raceDate));

  function invalidateDependentProfileData() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.plans(profileId) }),
      queryClient.invalidateQueries({ queryKey: [...queryKeys.profile(profileId), "plan"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.defaultGoals(profileId) })
    ]);
  }

  function openCreateRace() {
    setRacesError(null);
    setRaceSuccess(null);
    setRaceForm(defaultGoalRaceForm());
  }

  function openEditRace(race: GoalRace) {
    setRacesError(null);
    setRaceSuccess(null);
    setRaceForm(goalRaceToForm(race));
  }

  async function saveRace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!raceForm || writesBlocked) {
      return;
    }
    if (raceForm.targetTime.trim() && parseDurationHms(raceForm.targetTime) === null) {
      setRacesError("Target time must use H:MM:SS or MM:SS, like 1:42:30.");
      setRaceSuccess(null);
      return;
    }
    setIsSavingRace(true);
    try {
      const isEditing = Boolean(raceForm.id);
      const savedRace = await fetchJson<GoalRace>(
        isEditing ? `/api/goal-races/${raceForm.id}` : "/api/goal-races",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(goalRacePayload(raceForm))
        }
      );
      queryClient.setQueryData<GoalRace[]>(queryKeys.goalRaces(profileId), (current = []) =>
        upsertGoalRace(current, savedRace)
      );
      await invalidateDependentProfileData();
      setRaceForm(null);
      setRacesError(null);
      setRaceSuccess(`${savedRace.name} was ${isEditing ? "updated" : "created"}.`);
    } catch (error) {
      setRacesError(error instanceof Error ? error.message : "Could not save race.");
      setRaceSuccess(null);
    } finally {
      setIsSavingRace(false);
    }
  }

  async function deleteRace(race: GoalRace) {
    if (
      writesBlocked ||
      !window.confirm(
        `Delete ${race.name}? Any linked training plan will remain and become a date-range plan.`
      )
    ) {
      return;
    }
    setIsSavingRace(true);
    try {
      await fetchJson(`/api/goal-races/${race.id}`, { method: "DELETE" });
      queryClient.setQueryData<GoalRace[]>(queryKeys.goalRaces(profileId), (current = []) =>
        current.filter((candidate) => candidate.id !== race.id)
      );
      await invalidateDependentProfileData();
      setRaceForm(null);
      setRacesError(null);
      setRaceSuccess(`${race.name} was deleted.`);
    } catch (error) {
      setRacesError(error instanceof Error ? error.message : "Could not delete race.");
      setRaceSuccess(null);
    } finally {
      setIsSavingRace(false);
    }
  }

  return (
    <section className="settings-view goals-view">
      <header className="goals-page-intro">
        <div>
          <p className="eyebrow">Goal system</p>
          <h1>Races and weekly defaults</h1>
        </div>
        <button type="button" className="primary-button" onClick={openCreateRace} disabled={writesBlocked}>
          <Plus size={16} />
          <span>Add race</span>
        </button>
      </header>

      {raceForm ? (
        <form className="settings-card plan-form goal-race-editor" onSubmit={saveRace}>
          <div className="plan-form-header">
            <div>
              <strong>{raceForm.id ? "Edit race" : "Create race"}</strong>
              <span>Race details can be linked to a training plan after they are saved.</span>
            </div>
            <button type="button" className="ghost-button" onClick={() => setRaceForm(null)}>
              Close
            </button>
          </div>
          <div className="plan-form-grid">
            <label>
              <span>Name</span>
              <input
                value={raceForm.name}
                onChange={(event) => setRaceForm((current) => current ? { ...current, name: event.target.value } : current)}
                required
              />
            </label>
            <label>
              <span>Race date</span>
              <input
                type="date"
                value={raceForm.raceDate}
                onChange={(event) => setRaceForm((current) => current ? { ...current, raceDate: event.target.value } : current)}
                required
              />
            </label>
            <label>
              <span>Distance</span>
              <select
                value={raceForm.distance}
                onChange={(event) => setRaceForm((current) => current ? { ...current, distance: event.target.value as RaceDistance } : current)}
              >
                {distanceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {raceForm.distance === "other" ? (
              <label>
                <span>Custom miles</span>
                <input
                  inputMode="decimal"
                  value={raceForm.distanceMiles}
                  onChange={(event) => setRaceForm((current) => current ? { ...current, distanceMiles: event.target.value } : current)}
                  required
                />
              </label>
            ) : null}
            <label>
              <span>Target time</span>
              <input
                placeholder="1:42:30"
                value={raceForm.targetTime}
                onChange={(event) => setRaceForm((current) => current ? { ...current, targetTime: event.target.value } : current)}
              />
            </label>
            <label>
              <span>Priority</span>
              <select
                value={raceForm.priority}
                onChange={(event) => setRaceForm((current) => current ? { ...current, priority: event.target.value as GoalRace["priority"] } : current)}
              >
                {["A", "B", "C"].map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Location</span>
              <input
                value={raceForm.location}
                onChange={(event) => setRaceForm((current) => current ? { ...current, location: event.target.value } : current)}
              />
            </label>
            <label>
              <span>Altitude context</span>
              <input
                placeholder="Sea level, high altitude…"
                value={raceForm.altitudeContext}
                onChange={(event) => setRaceForm((current) => current ? { ...current, altitudeContext: event.target.value } : current)}
              />
            </label>
            <label className="plan-form-grid-span">
              <span>Notes</span>
              <textarea
                rows={2}
                value={raceForm.notes}
                onChange={(event) => setRaceForm((current) => current ? { ...current, notes: event.target.value } : current)}
              />
            </label>
          </div>
          <div className="plan-form-actions">
            <button type="submit" className="primary-button" disabled={isSavingRace || writesBlocked}>
              {raceForm.id ? "Save race" : "Create race"}
            </button>
            {raceForm.id ? (
              <button
                type="button"
                className="ghost-button ghost-button--danger plan-form-actions-end"
                disabled={isSavingRace || writesBlocked}
                onClick={() => {
                  const race = races.find((candidate) => candidate.id === raceForm.id);
                  if (race) {
                    deleteRace(race);
                  }
                }}
              >
                <Trash2 size={16} />
                Delete race
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {raceSuccess ? <div className="settings-note">{raceSuccess}</div> : null}

      <GoalImpactSection onSelectWeek={onSelectWeek} />

      <div className="goals-layout">
        <DefaultGoalsCard onRulesSaved={invalidateDependentProfileData} writesBlocked={writesBlocked} />

        <section className="settings-card goals-race-panel">
          <header className="settings-card-header goals-section-header">
            <div>
              <h2>Races</h2>
            </div>
            <button type="button" className="ghost-button ghost-button--compact" onClick={openCreateRace} disabled={writesBlocked}>
              <Plus size={15} />
              Add
            </button>
          </header>
          {racesError || racesQuery.error ? <div className="settings-note settings-note--danger">{racesError ?? "Could not load goal races."}</div> : null}
          {!racesError && sortedRaces.length === 0 ? (
            <div className="goals-empty-state">
              <Flag size={18} />
              <div>
                <strong>No races yet</strong>
                <span>Add a race here, then link it from a training plan when you are ready.</span>
              </div>
            </div>
          ) : null}
          <div className="goals-race-stack">
            {sortedRaces.map((race) => {
              const raceDate = formatRaceDateParts(race.raceDate);
              return (
                <article key={race.id} className="goals-race-item">
                  <div className="goals-race-date-badge" aria-label={race.raceDate}>
                    <span>{raceDate.month}</span>
                    <strong>{raceDate.day}</strong>
                  </div>
                  <div className="goals-race-main">
                    <div className="goals-race-title-row">
                      <strong>{race.name}</strong>
                      <div className="goals-race-title-actions">
                        <span>Priority {race.priority}</span>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Edit ${race.name}`}
                          title="Edit race"
                          disabled={writesBlocked}
                          onClick={() => openEditRace(race)}
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </div>
                    <span>
                      <CalendarDays size={13} />
                      {raceDistanceLabels[race.distance]} · {formatTargetTime(race.targetTime)}
                    </span>
                    {race.location ? (
                      <small>
                        <MapPin size={12} />
                        {race.location}
                      </small>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}

function defaultGoalRaceForm(): GoalRaceFormState {
  return {
    name: "",
    raceDate: toDateInputValue(new Date()),
    distance: "half_marathon",
    distanceMiles: "",
    targetTime: "",
    priority: "A",
    location: "",
    altitudeContext: "",
    notes: ""
  };
}

function goalRaceToForm(race: GoalRace): GoalRaceFormState {
  return {
    id: race.id,
    name: race.name,
    raceDate: race.raceDate,
    distance: race.distance,
    distanceMiles: race.distanceMiles === null ? "" : String(race.distanceMiles),
    targetTime: formatDurationHms(race.targetTime),
    priority: race.priority,
    location: race.location,
    altitudeContext: race.altitudeContext,
    notes: race.notes
  };
}

function upsertGoalRace(races: GoalRace[], savedRace: GoalRace) {
  return [savedRace, ...races.filter((race) => race.id !== savedRace.id)].sort(
    (left, right) => left.raceDate.localeCompare(right.raceDate) || left.name.localeCompare(right.name)
  );
}

function goalRacePayload(form: GoalRaceFormState) {
  return {
    name: form.name,
    raceDate: form.raceDate,
    distance: form.distance,
    distanceMiles: form.distance === "other" ? optionalNumber(form.distanceMiles) : null,
    targetTime: parseDurationHms(form.targetTime),
    priority: form.priority,
    location: form.location,
    altitudeContext: form.altitudeContext,
    notes: form.notes
  };
}

function formatDurationHms(totalSeconds: number | null) {
  if (!totalSeconds) {
    return "";
  }
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`
    : `${minutes}:${remainder}`;
}

function parseDurationHms(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.includes(":")) {
    return optionalNumber(trimmed);
  }
  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0) || parts.length < 2 || parts.length > 3) {
    return null;
  }
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  if (minutes >= 60 || seconds >= 60) {
    return null;
  }
  return Math.round(hours * 3600 + minutes * 60 + seconds);
}

function optionalNumber(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
