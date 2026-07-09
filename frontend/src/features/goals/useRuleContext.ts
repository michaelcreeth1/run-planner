import { useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { RecurringGoal, TrainingPlan, TrainingPlanSummary } from "../../types/domain";

export type RuleContext = {
  plan: TrainingPlan | null;
  defaultGoals: RecurringGoal[];
};

export type RuleContextState = RuleContext & {
  isLoading: boolean;
  error: string | null;
};

// Shared by the Goals page matrix and the Week page checks card; cached so
// expanding week after week does not refetch the plan and default goals.
let ruleContextCache: Promise<RuleContext> | null = null;

export function loadRuleContext(): Promise<RuleContext> {
  if (!ruleContextCache) {
    ruleContextCache = fetchRuleContext().catch((error) => {
      ruleContextCache = null;
      throw error;
    });
  }
  return ruleContextCache;
}

export function invalidateRuleContext() {
  ruleContextCache = null;
}

async function fetchRuleContext(): Promise<RuleContext> {
  const [plans, defaultGoals] = await Promise.all([
    fetchJson<TrainingPlanSummary[]>("/api/plans"),
    fetchJson<RecurringGoal[]>("/api/default-goals")
  ]);
  const soonestUpcoming = plans
    .filter((plan) => plan.isUpcoming)
    .sort((left, right) => left.startDate.localeCompare(right.startDate))[0];
  const activePlanSummary =
    plans.find((plan) => plan.isCurrent) ??
    soonestUpcoming ??
    plans.find((plan) => plan.status === "active") ??
    null;
  const plan = activePlanSummary ? await fetchJson<TrainingPlan>(`/api/plans/${activePlanSummary.id}`) : null;
  return { plan, defaultGoals };
}

export function useRuleContext(): RuleContextState {
  const [state, setState] = useState<RuleContextState>({
    plan: null,
    defaultGoals: [],
    isLoading: true,
    error: null
  });

  useEffect(() => {
    let isMounted = true;
    loadRuleContext()
      .then((context) => {
        if (isMounted) {
          setState({ ...context, isLoading: false, error: null });
        }
      })
      .catch((error) => {
        if (isMounted) {
          setState({
            plan: null,
            defaultGoals: [],
            isLoading: false,
            error: error instanceof Error ? error.message : "Could not load goal rules."
          });
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return state;
}
