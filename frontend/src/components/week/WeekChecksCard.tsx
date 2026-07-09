import { ChevronRight, ListChecks } from "lucide-react";
import { useMemo } from "react";
import type { RuleEvaluation, RuleStatus } from "../../features/goals/ruleEvaluation";
import { buildPlanRules, evaluateRulesForWeek, ruleStatusLabels } from "../../features/goals/ruleEvaluation";
import { useRuleContext } from "../../features/goals/useRuleContext";
import { todayDateString } from "../../lib/dates";
import type { TrainingWeek, Workout } from "../../types/domain";

const attentionStatuses = new Set<RuleStatus>(["warning", "fail", "pending"]);

export function WeekChecksCard({
  week,
  onEditWorkout,
  onOpenPlanWeek
}: {
  week: TrainingWeek;
  onEditWorkout: (workout: Workout) => void;
  onOpenPlanWeek: (week: TrainingWeek) => void;
}) {
  const { plan, defaultGoals, isLoading, error } = useRuleContext();

  const evaluations = useMemo(() => {
    if (isLoading || error) {
      return [];
    }
    const rules = buildPlanRules({ defaultGoals, plan });
    const summary = plan?.weekSummaries.find((candidate) => candidate.weekStartDate === week.weekStartDate) ?? null;
    const mesocycle = summary?.mesocycleId
      ? plan?.mesocycles.find((candidate) => candidate.id === summary.mesocycleId) ?? null
      : null;
    return evaluateRulesForWeek(rules, { week, summary, mesocycle }, todayDateString()).filter(
      (evaluation) => evaluation.status !== "not_applicable"
    );
  }, [defaultGoals, error, isLoading, plan, week]);

  // An entirely pending week has nothing to check yet — stay out of the way.
  if (isLoading || error || evaluations.length === 0 || evaluations.every((evaluation) => evaluation.status === "pending")) {
    return null;
  }

  const issueCount = evaluations.filter((evaluation) => attentionStatuses.has(evaluation.status)).length;

  return (
    <section className="week-checks-card" aria-label="Week checks">
      <header className="week-checks-header">
        <span className="week-checks-title">
          <ListChecks size={15} />
          <strong>Week checks</strong>
        </span>
        <small>{issueCount === 0 ? "All checks pass" : `${issueCount} need${issueCount === 1 ? "s" : ""} attention`}</small>
      </header>
      <ul className="week-checks-list">
        {evaluations.map((evaluation) => (
          <WeekCheckRow
            key={evaluation.ruleId}
            evaluation={evaluation}
            onOpen={() => {
              const workout = firstRelatedWorkout(evaluation, week);
              if (workout) {
                onEditWorkout(workout);
              } else {
                onOpenPlanWeek(week);
              }
            }}
          />
        ))}
      </ul>
    </section>
  );
}

function WeekCheckRow({ evaluation, onOpen }: { evaluation: RuleEvaluation; onOpen: () => void }) {
  const needsAttention = attentionStatuses.has(evaluation.status);
  const detail = evaluation.metrics ? `${evaluation.reason} ${evaluation.metrics}` : evaluation.reason;

  return (
    <li className={`week-check-row week-check-row--${evaluation.status}`}>
      <span className="week-check-dot" aria-hidden="true" />
      <div className="week-check-copy">
        <strong>{evaluation.ruleLabel}</strong>
        <span title={detail}>{evaluation.reason}</span>
      </div>
      <span className={`week-check-status week-check-status--${evaluation.status}`}>
        {ruleStatusLabels[evaluation.status]}
      </span>
      {needsAttention ? (
        <button
          type="button"
          className="week-check-action"
          title={`Fix "${evaluation.ruleLabel}"`}
          aria-label={`Open the plan to fix "${evaluation.ruleLabel}"`}
          onClick={onOpen}
        >
          <ChevronRight size={15} />
        </button>
      ) : null}
    </li>
  );
}

function firstRelatedWorkout(evaluation: RuleEvaluation, week: TrainingWeek) {
  const workoutId = evaluation.relatedWorkoutIds[0];
  return workoutId ? week.workouts.find((workout) => workout.id === workoutId) ?? null : null;
}
