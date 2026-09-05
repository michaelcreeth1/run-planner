import type { RuleEvaluation, RuleStatus } from "../../features/goals/ruleEvaluation";

const visibleStatuses = new Set<RuleStatus>(["warning", "fail", "pending"]);

export function selectVisibleWeekChecks(evaluations: RuleEvaluation[]) {
  const attentionEvaluations = evaluations.filter((evaluation) => visibleStatuses.has(evaluation.status));
  return attentionEvaluations.length ? attentionEvaluations : evaluations;
}
