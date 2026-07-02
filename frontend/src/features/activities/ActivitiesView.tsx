import type { StravaActivity } from "../../types/domain";
import { formatDateTime, formatPace } from "../../lib/formatters";

export function ActivitiesView({ activities }: { activities: StravaActivity[] }) {
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
          </article>
        ))}
      </div>
    </section>
  );
}
