import { CalendarDays, Flag, MapPin, Route } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { GoalRace } from "../../types/domain";
import { DefaultGoalsCard } from "./DefaultGoalsCard";

const raceDistanceLabels: Record<GoalRace["distance"], string> = {
  "5k": "5K",
  "10k": "10K",
  half_marathon: "Half marathon",
  marathon: "Marathon",
  other: "Custom distance"
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
  onManageRaces
}: {
  writesBlocked: boolean;
  onManageRaces: () => void;
}) {
  const [races, setRaces] = useState<GoalRace[]>([]);
  const [racesError, setRacesError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<GoalRace[]>("/api/goal-races")
      .then(setRaces)
      .catch((error) =>
        setRacesError(error instanceof Error ? error.message : "Could not load goal races.")
      );
  }, []);

  const sortedRaces = [...races].sort((left, right) => left.raceDate.localeCompare(right.raceDate));

  return (
    <section className="settings-view goals-view">
      <header className="goals-page-intro">
        <div>
          <p className="eyebrow">Goal system</p>
          <h1>Races and weekly defaults</h1>
        </div>
        <button type="button" className="ghost-button" onClick={onManageRaces}>
          <Route size={16} />
          <span>Manage races</span>
        </button>
      </header>

      <div className="goals-layout">
        <DefaultGoalsCard writesBlocked={writesBlocked} />

        <section className="settings-card goals-race-panel">
          <header className="settings-card-header goals-section-header">
            <div>
              <span className="goals-section-kicker">
                <Flag size={15} />
                Race anchors
              </span>
              <h2>Goal races</h2>
            </div>
            <span className="settings-pill settings-pill--neutral">
              {races.length} {races.length === 1 ? "race" : "races"}
            </span>
          </header>
          {racesError ? <div className="settings-note settings-note--danger">{racesError}</div> : null}
          {!racesError && sortedRaces.length === 0 ? (
            <div className="goals-empty-state">
              <Flag size={18} />
              <div>
                <strong>No races yet</strong>
                <span>Add one in the Plan tab to anchor a training plan.</span>
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
                      <span>Priority {race.priority}</span>
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
