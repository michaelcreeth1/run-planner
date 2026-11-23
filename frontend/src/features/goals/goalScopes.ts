import type { TrainingPlan } from "../../types/domain";
import { derivedGoalType, type GoalDraft } from "./goalDrafts";

export function baselineOverrideDescription(draft: GoalDraft, plan: TrainingPlan | null) {
  if (!plan) return null;
  const overrides = plan.recurringGoals.filter((goal) =>
    (goal.metricKey || goal.category) === draft.metricKey && goal.goalType === derivedGoalType(draft)
  );
  if (!overrides.length) return null;
  const scopes = overrides.map((goal) => goal.mesocyclePhase ? `${goal.mesocyclePhase} phase` : "whole plan");
  return `Affects every week except overrides in ${plan.name}: ${Array.from(new Set(scopes)).join(", ")}.`;
}
