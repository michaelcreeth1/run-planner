import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Copy,
  Edit3,
  Flag,
  Plus,
  RefreshCw,
  ShieldAlert,
  Target,
  Trash2
} from "lucide-react";
import type {
  DisplaySeverity,
  GoalCardViewModel,
  GoalDisplayStatus,
  WeekActionViewModel,
  WeekCommandCenterViewModel
} from "../../features/weekGoals/buildWeekCommandCenterViewModel";

type WeekCommandCenterProps = {
  viewModel: WeekCommandCenterViewModel;
  onAction: (actionId: string) => void;
  onEditGoal: (goalId: string) => void;
};

export function WeekCommandCenter({ onAction, onEditGoal, viewModel }: WeekCommandCenterProps) {
  return (
    <section className={`week-command-center week-command-center--${viewModel.mode}`} aria-label="Week command center">
      <header className="week-command-header">
        <div className="week-command-title">
          <p className="eyebrow">Training week</p>
          <h1>{viewModel.title}</h1>
          <span>{viewModel.modeLabel}</span>
        </div>
        <div className="week-command-actions" aria-label="Week actions">
          {viewModel.actionButtons.map((action) => (
            <WeekActionButton action={action} key={action.id} onAction={onAction} />
          ))}
        </div>
      </header>

      <div className="week-command-intent">
        <div>
          <span>Intent</span>
          <strong>{viewModel.purpose ?? intentFallback(viewModel.mode)}</strong>
        </div>
        <div>
          <span>{questionLabel(viewModel.mode)}</span>
          <strong>{viewModel.primarySummary}</strong>
          {viewModel.secondarySummary ? <small>{viewModel.secondarySummary}</small> : null}
        </div>
      </div>

      <GoalScorecard goals={viewModel.primaryGoalCards} onEditGoal={onEditGoal} variant="primary" />

      <details className="all-goals-details">
        <summary>
          <span>All goals</span>
          <small>{viewModel.detailSummary}</small>
          <ChevronDown size={16} />
        </summary>
        <div className="all-goals-body">
          {viewModel.detailGoalCards.length ? (
            <GoalScorecard goals={viewModel.detailGoalCards} onEditGoal={onEditGoal} variant="detail" />
          ) : null}
          {viewModel.guardrailDetails.length ? (
            <section className="guardrail-warning-strip" aria-label="Guardrails">
              {viewModel.guardrailDetails.map((warning) => (
                <div className={`guardrail-warning guardrail-warning--${warning.severity}`} key={warning.id}>
                  <ShieldAlert size={16} />
                  <div>
                    <strong>{warning.label}</strong>
                    <span>{warning.detail}</span>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
          {viewModel.notesDetail ? (
            <section className="week-notes-detail" aria-label="Week notes">
              <span>Notes</span>
              <p>{viewModel.notesDetail}</p>
            </section>
          ) : null}
        </div>
      </details>
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

function GoalScorecard({
  goals,
  onEditGoal,
  variant
}: {
  goals: GoalCardViewModel[];
  onEditGoal: (goalId: string) => void;
  variant: "primary" | "detail";
}) {
  return (
    <section className={`goal-scorecard goal-scorecard--${variant}`} aria-label={variant === "primary" ? "Primary goals" : "Goal details"}>
      {goals.map((goal) => (
        <GoalCard goal={goal} key={`${goal.id}-${goal.goalId ?? "informational"}`} onEditGoal={onEditGoal} />
      ))}
    </section>
  );
}

function GoalCard({
  goal,
  onEditGoal
}: {
  goal: GoalCardViewModel;
  onEditGoal: (goalId: string) => void;
}) {
  const Icon = iconForStatus(goal.status);
  return (
    <article className={`goal-card goal-card--${goal.severity}`}>
      <div className="goal-card-icon" aria-hidden="true">
        <Icon size={16} />
      </div>
      <div className="goal-card-main">
        <strong>{goal.label}</strong>
        <span>{goal.explanation}</span>
      </div>
      <div className="goal-card-value">
        <strong>{goal.primaryValue}</strong>
        <GoalStatusPill severity={goal.severity} status={goal.status} statusLabel={goal.statusLabel} />
      </div>
      {goal.editable && goal.goalId ? (
        <button
          className="goal-card-edit"
          title={`Edit ${goal.label} goal`}
          type="button"
          onClick={() => onEditGoal(goal.goalId ?? "")}
        >
          <Edit3 size={14} />
        </button>
      ) : null}
    </article>
  );
}

function GoalStatusPill({
  severity,
  status,
  statusLabel
}: {
  severity: DisplaySeverity;
  status: GoalDisplayStatus;
  statusLabel: string;
}) {
  return <span className={`goal-status-pill goal-status-pill--${severity} goal-status-pill--${status}`}>{statusLabel}</span>;
}

function iconForAction(icon?: string) {
  if (icon === "copy") {
    return Copy;
  }
  if (icon === "refresh") {
    return RefreshCw;
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

function iconForStatus(status: GoalDisplayStatus) {
  if (["achieved", "on_track", "planned"].includes(status)) {
    return status === "planned" ? Target : CheckCircle2;
  }
  if (["at_risk", "partial", "exceeded", "missed"].includes(status)) {
    return ShieldAlert;
  }
  if (status === "waived") {
    return Flag;
  }
  return Plus;
}

function questionLabel(mode: WeekCommandCenterViewModel["mode"]) {
  if (mode === "planning") {
    return "Is this plan right?";
  }
  if (mode === "execution") {
    return "Am I on track?";
  }
  return "Did it accomplish the intent?";
}

function intentFallback(mode: WeekCommandCenterViewModel["mode"]) {
  if (mode === "planning") {
    return "Set the purpose for this training week.";
  }
  if (mode === "execution") {
    return "Execute the plan and adjust the remaining week.";
  }
  return "Review the outcome against the original intent.";
}
