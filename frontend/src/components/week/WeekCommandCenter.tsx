import {
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Target,
  Trash2,
  X
} from "lucide-react";
import type {
  CompactWeekStatViewModel,
  GoalCardViewModel,
  WeekActionViewModel,
  WeekCommandCenterViewModel
} from "../../features/weekGoals/buildWeekCommandCenterViewModel";

type WeekCommandCenterProps = {
  viewModel: WeekCommandCenterViewModel;
  onAction: (actionId: string) => void;
};

export function WeekCommandCenter({ onAction, viewModel }: WeekCommandCenterProps) {
  const showNarrative = viewModel.mode === "planning" && viewModel.narrative.trim().length > 0;
  const showGoalOutcomes = viewModel.mode === "review";

  if (viewModel.isUnplanned) {
    return (
      <section className={`week-command-center week-command-center--${viewModel.mode} week-command-center--unplanned`} aria-label="Week slate">
        <header className="week-command-header">
          <div className="week-command-title">
            <div className="week-command-meta">
              <p className="eyebrow">{viewModel.purposeTag}</p>
              <span className="week-command-mode">{viewModel.modeLabel}</span>
            </div>
            <h1>{viewModel.title}</h1>
          </div>
          <div className="week-command-actions" aria-label="Week actions">
            {viewModel.actionButtons.map((action) => (
              <WeekActionButton action={action} key={action.id} onAction={onAction} />
            ))}
          </div>
        </header>
        <div className="week-empty-planning-state">
          <strong>{viewModel.mode === "review" ? "Nothing to review." : "Start with a training purpose."}</strong>
          <p>
            {viewModel.mode === "review"
              ? "No sessions were planned and no activities were logged. Close this week in one step."
              : viewModel.narrative}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={`week-command-center week-command-center--${viewModel.mode}`} aria-label="Week slate summary">
      <header className="week-command-header">
        <div className="week-command-title">
          <div className="week-command-meta">
            <p className="eyebrow">{viewModel.purposeTag}</p>
            <span className="week-command-mode">{viewModel.modeLabel}</span>
          </div>
          <h1>{viewModel.title}</h1>
        </div>
        <div className="week-command-actions" aria-label="Week actions">
          {viewModel.actionButtons.map((action) => (
            <WeekActionButton action={action} key={action.id} onAction={onAction} />
          ))}
        </div>
      </header>

      {showNarrative ? (
        <div className="week-slate-context">
          <span>Training narrative</span>
          <strong>{viewModel.narrative}</strong>
        </div>
      ) : null}

      {viewModel.primaryGoalCards.length ? <GoalSummaryStrip goals={viewModel.primaryGoalCards} /> : null}

      {viewModel.compactStats?.length ? (
        <div className={`week-command-stats${showGoalOutcomes ? " week-command-stats--outcomes" : ""}`} aria-label={showGoalOutcomes ? "Past week goal outcomes" : "Week summary"}>
          {viewModel.compactStats.map((stat) => (
            <WeekCommandStat key={stat.label} showOutcome={showGoalOutcomes} stat={stat} />
          ))}
        </div>
      ) : null}

    </section>
  );
}

function WeekCommandStat({
  showOutcome,
  stat
}: {
  showOutcome: boolean;
  stat: CompactWeekStatViewModel;
}) {
  const outcome = showOutcome ? stat.outcome : undefined;
  const OutcomeIcon = outcome === "hit" ? Check : X;
  const outcomeLabel = outcome === "hit" ? "Goal hit" : "Goal not hit";
  const className = [
    "week-command-stat",
    `week-command-stat--${stat.severity ?? "neutral"}`,
    outcome ? `week-command-stat--${outcome}` : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} aria-label={outcome ? `${stat.label}: ${stat.value}. ${outcomeLabel}.` : undefined}>
      {outcome ? (
        <div className={`week-command-stat-outcome week-command-stat-outcome--${outcome}`} aria-hidden="true">
          <OutcomeIcon size={15} strokeWidth={2.6} />
        </div>
      ) : null}
      <span>{stat.label}</span>
      <strong>{stat.value}</strong>
      {stat.detail ? <small>{stat.detail}</small> : null}
    </div>
  );
}

function GoalSummaryStrip({ goals }: { goals: GoalCardViewModel[] }) {
  const visibleGoals = goals.filter((goal) => !["mileage", "quality", "long_run", "recovery"].includes(goal.id));
  if (!visibleGoals.length) {
    return null;
  }

  return (
    <section className="week-goal-summary" aria-label="Primary goal status">
      {visibleGoals.map((goal) => (
        <div className={`week-goal-summary-item week-goal-summary-item--${goal.severity}`} key={`${goal.id}-${goal.goalId ?? "informational"}`}>
          <span>{goal.label}</span>
          <strong>{goal.statusLabel}</strong>
          <small>{goal.explanation}</small>
        </div>
      ))}
    </section>
  );
}

function WeekActionButton({
  action,
  onAction
}: {
  action: WeekActionViewModel;
  onAction: (actionId: string) => void;
}) {
  const Icon = iconForAction(action.icon);
  return (
    <button
      className={`week-action-button week-action-button--${action.variant}`}
      disabled={action.disabled}
      title={action.tooltip ?? action.label}
      type="button"
      onClick={() => onAction(action.id)}
    >
      <Icon size={15} />
      <span>{action.label}</span>
    </button>
  );
}

function iconForAction(icon?: string) {
  if (icon === "copy") {
    return Copy;
  }
  if (icon === "calendar") {
    return CalendarDays;
  }
  if (icon === "trash") {
    return Trash2;
  }
  if (icon === "check") {
    return CheckCircle2;
  }
  return Target;
}
