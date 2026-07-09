import { CalendarPlus, Check, ChevronRight, Circle, Moon } from "lucide-react";
import type { WeekContextStripViewModel } from "../../features/weekBoard/buildWeekContextStrip";

type WeekContextStripProps = {
  viewModel: WeekContextStripViewModel | null;
  onOpenPlan: () => void;
  onJumpToToday: () => void;
};

export function WeekContextStrip({ viewModel, onOpenPlan, onJumpToToday }: WeekContextStripProps) {
  if (!viewModel) {
    return null;
  }

  if (viewModel.kind === "onboarding") {
    return (
      <section className="week-context-strip week-context-strip--onboarding" aria-label="Training context">
        <div className="week-context-onboarding-copy">
          <strong>{viewModel.headline}</strong>
          <span>{viewModel.detail}</span>
        </div>
        <button type="button" className="week-context-cta" onClick={onOpenPlan}>
          <CalendarPlus size={16} aria-hidden="true" />
          <span>{viewModel.actionLabel}</span>
        </button>
      </section>
    );
  }

  return (
    <section className="week-context-strip" aria-label="Training context">
      <div className="week-context-segments">
        {viewModel.segments.map((segment) => (
          <div className="week-context-segment" key={segment.id}>
            <span className="week-context-segment-label">{segment.label}</span>
            <strong className="week-context-segment-value">{segment.value}</strong>
          </div>
        ))}
      </div>
      {viewModel.today ? <TodayChip today={viewModel.today} onJumpToToday={onJumpToToday} /> : null}
    </section>
  );
}

function TodayChip({
  today,
  onJumpToToday
}: {
  today: NonNullable<Extract<WeekContextStripViewModel, { kind: "active" }>["today"]>;
  onJumpToToday: () => void;
}) {
  if (today.kind === "rest") {
    return (
      <button type="button" className="week-context-today week-context-today--rest" onClick={onJumpToToday}>
        <span className="week-context-today-label">Today</span>
        <span className="week-context-today-main">
          <Moon size={14} aria-hidden="true" />
          <strong>Rest day</strong>
        </span>
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    );
  }

  if (today.kind === "open") {
    return (
      <button type="button" className="week-context-today week-context-today--open" onClick={onJumpToToday}>
        <span className="week-context-today-label">Today</span>
        <span className="week-context-today-main">
          <strong>No session planned</strong>
        </span>
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    );
  }

  const StatusIcon = today.status === "done" ? Check : Circle;
  return (
    <button
      type="button"
      className={`week-context-today week-context-today--${today.status}`}
      onClick={onJumpToToday}
    >
      <span className="week-context-today-label">Today</span>
      <span className="week-context-today-main">
        <StatusIcon size={14} strokeWidth={2.75} aria-hidden="true" />
        <strong>{today.title}</strong>
        <small>{today.meta}</small>
      </span>
      <ChevronRight size={15} aria-hidden="true" />
    </button>
  );
}
