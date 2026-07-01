import type { StravaActivity } from "../../types/domain";
import { formatDateTime, formatNumber, formatPace } from "../../lib/formatters";

export function ActivitiesView({ activities }: { activities: StravaActivity[] }) {
  return (
    <section className="activities-view">
      <header>
        <div>
          <p className="eyebrow">Imported activities</p>
          <h2>{activities.length} activities</h2>
        </div>
      </header>
      <div className="activity-list">
        {activities.map((activity) => (
          <article className="activity-row" key={activity.id}>
            <div>
              <strong>{activity.name}</strong>
              <span>
                {activity.sportType} · {formatDateTime(activity.startDateLocal)}
              </span>
            </div>
            <dl>
              <div>
                <dt>Miles</dt>
                <dd>{formatNumber(activity.distanceMiles)}</dd>
              </div>
              <div>
                <dt>Pace</dt>
                <dd>{formatPace(activity.movingTime, activity.distanceMiles)}</dd>
              </div>
              <div>
                <dt>HR</dt>
                <dd>{activity.averageHeartrate ? Math.round(activity.averageHeartrate) : "-"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
