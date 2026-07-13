import { Activity, BarChart3 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { ProgressSection } from "../../lib/navigation";
import type { AnalyticsPlanning, StravaActivity } from "../../types/domain";
import { ActivitiesView } from "../activities/ActivitiesView";
import { AnalyticsView } from "../analytics/AnalyticsView";

export function ProgressView({
  activities,
  analytics,
  futureWeeks,
  isLoading,
  lookbackWeeks,
  onChangeSection,
  onSelectWeek,
  section,
  setFutureWeeks,
  setLookbackWeeks
}: {
  activities: StravaActivity[];
  analytics: AnalyticsPlanning | null;
  futureWeeks: number;
  isLoading: boolean;
  lookbackWeeks: number;
  onChangeSection: (section: ProgressSection) => void;
  onSelectWeek: (weekStartDate: string) => void;
  section: ProgressSection;
  setFutureWeeks: Dispatch<SetStateAction<number>>;
  setLookbackWeeks: Dispatch<SetStateAction<number>>;
}) {
  return (
    <section className="workspace-view" aria-label="Progress workspace">
      <nav className="workspace-tabs" aria-label="Progress sections">
        <button
          type="button"
          className={section === "trends" ? "active" : ""}
          aria-pressed={section === "trends"}
          onClick={() => onChangeSection("trends")}
        >
          <BarChart3 size={16} aria-hidden="true" />
          <span>Trends</span>
        </button>
        <button
          type="button"
          className={section === "activities" ? "active" : ""}
          aria-pressed={section === "activities"}
          onClick={() => onChangeSection("activities")}
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
          onSelectWeek={onSelectWeek}
          setFutureWeeks={setFutureWeeks}
          setLookbackWeeks={setLookbackWeeks}
        />
      ) : (
        <ActivitiesView activities={activities} onSelectWeek={onSelectWeek} />
      )}
    </section>
  );
}
