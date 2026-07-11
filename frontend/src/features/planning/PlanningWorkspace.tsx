import { Route, Target } from "lucide-react";
import { useState } from "react";
import { GoalsView } from "../goals/GoalsView";
import { PlansView } from "../plans/PlansView";

type PlanningSection = "overview" | "goals";

export function PlanningWorkspace({
  onPlanApplied,
  onSelectWeek,
  writesBlocked
}: {
  onPlanApplied: () => void;
  onSelectWeek: (weekStartDate: string) => void;
  writesBlocked: boolean;
}) {
  const [section, setSection] = useState<PlanningSection>("overview");

  return (
    <section className="workspace-view" aria-label="Planning workspace">
      <nav className="workspace-tabs" aria-label="Planning sections">
        <button
          type="button"
          className={section === "overview" ? "active" : ""}
          aria-pressed={section === "overview"}
          onClick={() => setSection("overview")}
        >
          <Route size={16} aria-hidden="true" />
          <span>Training plan</span>
        </button>
        <button
          type="button"
          className={section === "goals" ? "active" : ""}
          aria-pressed={section === "goals"}
          onClick={() => setSection("goals")}
        >
          <Target size={16} aria-hidden="true" />
          <span>Goals &amp; races</span>
        </button>
      </nav>

      {section === "overview" ? (
        <PlansView
          writesBlocked={writesBlocked}
          onPlanApplied={onPlanApplied}
          onSelectWeek={onSelectWeek}
        />
      ) : (
        <GoalsView
          writesBlocked={writesBlocked}
          onManageRaces={() => setSection("overview")}
          onSelectWeek={onSelectWeek}
        />
      )}
    </section>
  );
}
