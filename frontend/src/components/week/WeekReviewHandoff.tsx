import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { formatCompactWeekRangeFromStart } from "../../lib/formatters";

export function WeekReviewHandoff({
  nextWeekStart,
  onDismiss,
  onPlanNextWeek
}: {
  nextWeekStart: string;
  onDismiss: () => void;
  onPlanNextWeek: (weekStartDate: string) => void;
}) {
  return (
    <section className="week-review-handoff" aria-label="Week review completed">
      <div className="week-review-handoff-icon" aria-hidden="true">
        <CheckCircle2 size={19} />
      </div>
      <div>
        <span>Review complete</span>
        <strong>Carry the learning into {formatCompactWeekRangeFromStart(nextWeekStart)}</strong>
        <small>The reviewed week is saved. Use it as context while the details are still fresh.</small>
      </div>
      <button className="week-review-handoff-primary" type="button" onClick={() => onPlanNextWeek(nextWeekStart)}>
        <span>Plan next week</span>
        <ArrowRight size={15} />
      </button>
      <button className="week-review-handoff-dismiss" type="button" title="Dismiss" onClick={onDismiss}>
        <X size={15} />
      </button>
    </section>
  );
}
