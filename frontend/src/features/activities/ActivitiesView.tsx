import { ArrowUpRight } from "lucide-react";
import type { StravaActivity } from "../../types/domain";
import { formatDateTime, formatPace } from "../../lib/formatters";
import { parseDate, startOfWeek } from "../../lib/dates";

export function ActivitiesView({
  activities,
  onSelectWeek
}: {
  activities: StravaActivity[];
  onSelectWeek: (weekStartDate: string) => void;
}) {
  return (
    <section className="activities-view">
      <header>
        <div>
          <p className="eyebrow">Imported activities</p>
          <h2>{activities.length} activities</h2>
        </div>
      </header>
      <div className="activity-table">
        <div className="activity-table-head" aria-hidden="true">
          <span>Activity</span>
          <span>Date</span>
          <span className="activity-col-num">Miles</span>
          <span className="activity-col-num">Pace</span>
          <span className="activity-col-num">Avg HR</span>
          <span />
        </div>
        {activities.map((activity) => (
          <article className="activity-table-row" key={activity.id}>
            <div className="activity-name">
              <strong>{activity.name}</strong>
              <span>{activity.sportType}</span>
            </div>
            <span className="activity-date">{formatDateTime(activity.startDateLocal)}</span>
            <span className="activity-col-num">{activity.distanceMiles.toFixed(1)}</span>
            <span className="activity-col-num">{formatPace(activity.movingTime, activity.distanceMiles)}</span>
            <span className="activity-col-num">
              {activity.averageHeartrate ? Math.round(activity.averageHeartrate) : "–"}
            </span>
            <button
              type="button"
              className="activity-open-week"
              title={`Open the week containing ${activity.name}`}
              aria-label={`Open the week containing ${activity.name}`}
              onClick={() => onSelectWeek(startOfWeek(parseDate(activity.startDateLocal.slice(0, 10))))}
            >
              <ArrowUpRight size={15} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
