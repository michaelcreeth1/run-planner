import { selectPrimaryPlan, useDefaultGoalsQuery, usePlanQuery, usePlansQuery } from "../../lib/queries";
import { useProfileId } from "../../lib/profileContext";
import type { RecurringGoal, TrainingPlan } from "../../types/domain";

export type RuleContext = {
  plan: TrainingPlan | null;
  defaultGoals: RecurringGoal[];
};

export type RuleContextState = RuleContext & {
  isLoading: boolean;
  error: string | null;
};

export function useRuleContext(): RuleContextState {
  const profileId = useProfileId();
  const plansQuery = usePlansQuery(profileId);
  const primaryPlan = selectPrimaryPlan(plansQuery.data ?? []);
  const planQuery = usePlanQuery(profileId, primaryPlan?.id ?? null);
  const defaultGoalsQuery = useDefaultGoalsQuery(profileId);
  const error = plansQuery.error ?? planQuery.error ?? defaultGoalsQuery.error;

  return {
    plan: planQuery.data ?? null,
    defaultGoals: defaultGoalsQuery.data ?? [],
    isLoading: plansQuery.isLoading || defaultGoalsQuery.isLoading || (Boolean(primaryPlan) && planQuery.isLoading),
    error: error instanceof Error ? error.message : error ? "Could not load goal rules." : null
  };
}
