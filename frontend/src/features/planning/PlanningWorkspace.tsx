import { Route, Target } from "lucide-react";
import type { PlanningSection } from "../../lib/navigation";
import { GoalsView } from "../goals/GoalsView";
import { PlansView } from "../plans/PlansView";

export function PlanningWorkspace({
  onChangeSection,
  onPlanApplied,
  onSelectPlan,
  onSelectWeek,
  section,
  selectedPlanId,
  writesBlocked
}: {
  onChangeSection: (section: PlanningSection) => void;
  onPlanApplied: () => void;
  onSelectPlan: (planId: string | null) => void;
  onSelectWeek: (weekStartDate: string) => void;
  section: PlanningSection;
  selectedPlanId: string | null;
  writesBlocked: boolean;
}) {
  return (
    <section className="workspace-view" aria-label="Planning workspace">
      <nav className="workspace-tabs" aria-label="Planning sections">
        <button
          type="button"
          className={section === "overview" ? "active" : ""}
          aria-pressed={section === "overview"}
          onClick={() => onChangeSection("overview")}
        >
          <Route size={16} aria-hidden="true" />
          <span>Training plan</span>
        </button>
        <button
          type="button"
          className={section === "goals" ? "active" : ""}
          aria-pressed={section === "goals"}
          onClick={() => onChangeSection("goals")}
        >
          <Target size={16} aria-hidden="true" />
          <span>Goals &amp; races</span>
        </button>
      </nav>

      <div hidden={section !== "overview"}>
        <PlansView
          onSelectPlan={onSelectPlan}
          writesBlocked={writesBlocked}
          onPlanApplied={onPlanApplied}
          onSelectWeek={onSelectWeek}
          requestedPlanId={selectedPlanId}
        />
      </div>
      <div hidden={section !== "goals"}>
        <GoalsView
          writesBlocked={writesBlocked}
          onSelectWeek={onSelectWeek}
        />
      </div>
    </section>
  );
}
