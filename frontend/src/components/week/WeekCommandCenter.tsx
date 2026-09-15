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
  WeekCommandCenterViewModel,
  WeekMode,
  WeekProgressViewModel
} from "../../features/weekGoals/buildWeekCommandCenterViewModel";
import { formatNumber } from "../../lib/formatters";

type WeekCommandCenterProps = {
  viewModel: WeekCommandCenterViewModel;
  onAction: (actionId: string) => void;
};

export function WeekCommandCenter({ onAction, viewModel }: WeekCommandCenterProps) {
  const showNarrative = viewModel.mode === "planning" && viewModel.narrative.trim().length > 0;
  const showGoalOutcomes = viewModel.mode === "review";
  const visibleCompactStats = viewModel.progress.targetMiles === null
    ? viewModel.compactStats
    : viewModel.compactStats?.filter((stat) => stat.label !== "Mileage");

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

      <WeekProgress mode={viewModel.mode} progress={viewModel.progress} />

      {viewModel.primaryGoalCards.length ? <GoalSummaryStrip goals={viewModel.primaryGoalCards} /> : null}

      {visibleCompactStats?.length ? (
        <div className={`week-command-stats${showGoalOutcomes ? " week-command-stats--outcomes" : ""}`} aria-label={showGoalOutcomes ? "Past week goal outcomes" : "Week summary"}>
          {visibleCompactStats.map((stat) => (
            <WeekCommandStat
              compact={viewModel.mode === "execution"}
              key={stat.label}
              showOutcome={showGoalOutcomes}
              stat={stat}
            />
          ))}
        </div>
      ) : null}

    </section>
  );
}

function WeekProgress({
  mode,
  progress
}: {
  mode: WeekMode;
  progress: WeekProgressViewModel;
}) {
  const hasTarget = progress.targetMiles !== null;
  const targetMiles = progress.targetMiles ?? 0;
  const primaryValue = hasTarget
    ? `${formatNumber(progress.completedMiles)} / ${formatNumber(targetMiles)} mi`
    : `${formatNumber(progress.completedMiles)} mi`;
  const matchesTarget = (value: number) =>
    hasTarget && Math.abs(value - targetMiles) < 0.05;
  const showScheduled =
    mode !== "review" && progress.scheduledMiles > 0 && !matchesTarget(progress.scheduledMiles);
  const showProjected =
    mode === "execution" && progress.projectedMiles > 0 && !matchesTarget(progress.projectedMiles);
  const deltaLabel =
    progress.deltaMiles === null
      ? null
      : Math.abs(progress.deltaMiles) < 0.05
        ? null
        : progress.deltaMiles > 0
          ? `${formatNumber(progress.deltaMiles)} mi above target`
          : `${formatNumber(Math.abs(progress.deltaMiles))} mi below target`;
  const deltaClass =
    progress.deltaMiles === null || Math.abs(progress.deltaMiles) < 0.05
      ? "neutral"
        : progress.deltaMiles > 0
        ? "above"
        : "below";
  const completedSessionsLabel = `${progress.completedSessions} completed session${progress.completedSessions === 1 ? "" : "s"}`;
  const showDetails = showScheduled || showProjected || Boolean(deltaLabel);

  return (
    <section className="week-progress" aria-label="Week progress">
      <div className="week-progress-heading">
        <p>
          <strong>{primaryValue}</strong>
          <span>{hasTarget ? "completed / target" : "completed"}</span>
          {mode !== "planning" ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{completedSessionsLabel}</span>
            </>
          ) : null}
        </p>
      </div>
      {progress.progressPercent !== null ? (
        <div
          aria-label={`${formatNumber(progress.completedMiles)} of ${formatNumber(targetMiles)} target miles completed`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(progress.progressPercent)}
          className="week-progress-track"
          role="progressbar"
        >
          <span style={{ width: `${progress.progressPercent}%` }} />
        </div>
      ) : null}
      {showDetails ? (
        <div className="week-progress-details">
          {showScheduled ? <span>{formatNumber(progress.scheduledMiles)} mi scheduled</span> : null}
          {showProjected ? <span>{formatNumber(progress.projectedMiles)} mi projected</span> : null}
          {deltaLabel ? <span className={`week-progress-delta week-progress-delta--${deltaClass}`}>{deltaLabel}</span> : null}
        </div>
      ) : null}
    </section>
  );
}

function WeekCommandStat({
  compact,
  showOutcome,
  stat
}: {
  compact: boolean;
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
  const showDetail = Boolean(
    stat.detail &&
      (!compact || stat.label === "Mileage" || stat.severity === "warning" || stat.severity === "danger")
  );

  return (
    <div className={className} aria-label={outcome ? `${stat.label}: ${stat.value}. ${outcomeLabel}.` : undefined}>
      {outcome ? (
        <div className={`week-command-stat-outcome week-command-stat-outcome--${outcome}`} aria-hidden="true">
          <OutcomeIcon size={15} strokeWidth={2.6} />
        </div>
      ) : null}
      <span>{stat.label}</span>
      <strong>{stat.value}</strong>
      {showDetail ? <small>{stat.detail}</small> : null}
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
