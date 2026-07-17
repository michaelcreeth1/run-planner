import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { formatCompactWeekRangeFromStart } from "../../lib/formatters";

export function WeekReviewHandoff({
  nextWeekStart,
  onDismiss,
  onPlanNextWeek,
  wasEmpty
}: {
  nextWeekStart: string;
  onDismiss: () => void;
  onPlanNextWeek: (weekStartDate: string) => void;
  wasEmpty: boolean;
}) {
  return (
    <section className="week-review-handoff" aria-label="Week review completed">
      <div className="week-review-handoff-icon" aria-hidden="true">
        <CheckCircle2 size={19} />
      </div>
      <div>
        <span>{wasEmpty ? "Week closed" : "Review complete"}</span>
        <strong>
          {wasEmpty
            ? "Week closed with no training logged"
            : `Carry the learning into ${formatCompactWeekRangeFromStart(nextWeekStart)}`}
        </strong>
        <small>
          {wasEmpty
            ? "There was nothing to review. Plan the next week when you are ready."
            : "The reviewed week is saved. Use it as context while the details are still fresh."}
        </small>
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
