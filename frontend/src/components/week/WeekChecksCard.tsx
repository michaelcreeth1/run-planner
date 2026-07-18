import { ChevronDown, ChevronRight, ListChecks } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RuleEvaluation, RuleStatus } from "../../features/goals/ruleEvaluation";
import { buildPlanRules, evaluateRulesForWeek, ruleStatusLabels } from "../../features/goals/ruleEvaluation";
import { useRuleContext } from "../../features/goals/useRuleContext";
import { todayDateString } from "../../lib/dates";
import type { TrainingWeek, Workout } from "../../types/domain";

const attentionStatuses = new Set<RuleStatus>(["warning", "fail"]);
const visibleStatuses = new Set<RuleStatus>(["warning", "fail", "pending"]);

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

  const issueCount = evaluations.filter((evaluation) => attentionStatuses.has(evaluation.status)).length;
  const pendingCount = evaluations.filter((evaluation) => evaluation.status === "pending").length;
  const visibleEvaluations = selectVisibleWeekChecks(evaluations);
  const [isOpen, setIsOpen] = useState(issueCount > 0);

  // Start each selected week in its useful default state: open for exceptions, closed for a clean slate.
  useEffect(() => {
    setIsOpen(issueCount > 0);
  }, [issueCount, week.weekStartDate]);

  // An entirely pending week has nothing to check yet — stay out of the way.
  if (isLoading || error || evaluations.length === 0 || evaluations.every((evaluation) => evaluation.status === "pending")) {
    return null;
  }

  const summary = issueCount
    ? issueCount === 1
      ? "1 check needs attention"
      : `${issueCount} checks need attention`
    : pendingCount
      ? `${pendingCount} check${pendingCount === 1 ? "" : "s"} pending`
      : "All checks pass";

  return (
    <details className="week-checks-card" open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary className="week-checks-header">
        <span className="week-checks-title">
          <ListChecks size={15} />
          <strong>Week checks</strong>
        </span>
        <span className="week-checks-summary">
          <small>{summary}</small>
          <ChevronDown aria-hidden="true" size={16} />
        </span>
      </summary>
      <ul className="week-checks-list">
        {visibleEvaluations.map((evaluation) => (
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
    </details>
  );
}

export function selectVisibleWeekChecks(evaluations: RuleEvaluation[]) {
  const attentionEvaluations = evaluations.filter((evaluation) => visibleStatuses.has(evaluation.status));
  return attentionEvaluations.length ? attentionEvaluations : evaluations;
}

export function WeekCheckRow({ evaluation, onOpen }: { evaluation: RuleEvaluation; onOpen: () => void }) {
  const needsAttention = attentionStatuses.has(evaluation.status);
  const detail = evaluation.metrics ? `${evaluation.reason} ${evaluation.metrics}` : evaluation.reason;
  const contents = (
    <>
      <span className="week-check-dot" aria-hidden="true" />
      <span className="week-check-copy">
        <strong>{evaluation.ruleLabel}</strong>
        <span title={detail}>{evaluation.reason}</span>
      </span>
      <span className={`week-check-status week-check-status--${evaluation.status}`}>
        {ruleStatusLabels[evaluation.status]}
      </span>
      {needsAttention ? (
        <span className="week-check-action" aria-hidden="true">
          Fix <ChevronRight size={15} />
        </span>
      ) : null}
    </>
  );

  return (
    <li className={`week-check-row week-check-row--${evaluation.status}`}>
      {needsAttention ? (
        <button
          type="button"
          className="week-check-row-action"
          title={`Fix "${evaluation.ruleLabel}"`}
          aria-label={`Fix "${evaluation.ruleLabel}" in this week`}
          onClick={onOpen}
        >
          {contents}
        </button>
      ) : (
        <span className="week-check-row-content">{contents}</span>
      )}
    </li>
  );
}

function firstRelatedWorkout(evaluation: RuleEvaluation, week: TrainingWeek) {
  const workoutId = evaluation.relatedWorkoutIds[0];
  return workoutId ? week.workouts.find((workout) => workout.id === workoutId) ?? null : null;
}
