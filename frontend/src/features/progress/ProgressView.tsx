import { Activity, BarChart3 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import type { AnalyticsPlanning, StravaActivity } from "../../types/domain";
import { ActivitiesView } from "../activities/ActivitiesView";
import { AnalyticsView } from "../analytics/AnalyticsView";

type ProgressSection = "trends" | "activities";

export function ProgressView({
  activities,
  analytics,
  futureWeeks,
  isLoading,
  lookbackWeeks,
  setFutureWeeks,
  setLookbackWeeks
}: {
  activities: StravaActivity[];
  analytics: AnalyticsPlanning | null;
  futureWeeks: number;
  isLoading: boolean;
  lookbackWeeks: number;
  setFutureWeeks: Dispatch<SetStateAction<number>>;
  setLookbackWeeks: Dispatch<SetStateAction<number>>;
}) {
  const [section, setSection] = useState<ProgressSection>("trends");

  return (
    <section className="workspace-view" aria-label="Progress workspace">
      <nav className="workspace-tabs" aria-label="Progress sections">
        <button
          type="button"
          className={section === "trends" ? "active" : ""}
          aria-pressed={section === "trends"}
          onClick={() => setSection("trends")}
        >
          <BarChart3 size={16} aria-hidden="true" />
          <span>Trends</span>
        </button>
        <button
          type="button"
          className={section === "activities" ? "active" : ""}
          aria-pressed={section === "activities"}
          onClick={() => setSection("activities")}
        >
          <Activity size={16} aria-hidden="true" />
          <span>Activities</span>
          <small>{activities.length}</small>
        </button>
      </nav>

      {section === "trends" ? (
        <AnalyticsView
          analytics={analytics}
          futureWeeks={futureWeeks}
          isLoading={isLoading}
          lookbackWeeks={lookbackWeeks}
          setFutureWeeks={setFutureWeeks}
          setLookbackWeeks={setLookbackWeeks}
        />
      ) : (
        <ActivitiesView activities={activities} />
      )}
    </section>
  );
}
