import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "./api";
import type { GoalRace, RecurringGoal, TrainingPlan, TrainingPlanSummary } from "../types/domain";

export const queryKeys = {
  profile: (profileId: string) => ["profile", profileId] as const,
  plans: (profileId: string) => [...queryKeys.profile(profileId), "plans"] as const,
  plan: (profileId: string, planId: string | null) => [...queryKeys.profile(profileId), "plan", planId] as const,
  goalRaces: (profileId: string) => [...queryKeys.profile(profileId), "goal-races"] as const,
  defaultGoals: (profileId: string) => [...queryKeys.profile(profileId), "default-goals"] as const
};

export function selectPrimaryPlan(plans: TrainingPlanSummary[]) {
  const soonestUpcoming = plans
    .filter((plan) => plan.isUpcoming)
    .sort((left, right) => left.startDate.localeCompare(right.startDate))[0];
  return plans.find((plan) => plan.isCurrent) ?? soonestUpcoming ?? plans.find((plan) => plan.status === "active") ?? plans[0] ?? null;
}

export function usePlansQuery(profileId: string | null) {
  return useQuery({
    queryKey: queryKeys.plans(profileId ?? "anonymous"),
    queryFn: () => fetchJson<TrainingPlanSummary[]>("/api/plans"),
    enabled: Boolean(profileId)
  });
}

export function usePlanQuery(profileId: string, planId: string | null) {
  return useQuery({
    queryKey: queryKeys.plan(profileId, planId),
    queryFn: () => fetchJson<TrainingPlan>(`/api/plans/${planId}`),
    enabled: Boolean(planId)
  });
}

export function useGoalRacesQuery(profileId: string) {
  return useQuery({
    queryKey: queryKeys.goalRaces(profileId),
    queryFn: () => fetchJson<GoalRace[]>("/api/goal-races")
  });
}

export function useDefaultGoalsQuery(profileId: string) {
  return useQuery({
    queryKey: queryKeys.defaultGoals(profileId),
    queryFn: () => fetchJson<RecurringGoal[]>("/api/default-goals")
  });
}
