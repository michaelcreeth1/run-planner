import { parseDate, startOfWeek } from "./dates";

export type AppTab = "week" | "plan" | "progress" | "settings";
export type PlanningSection = "overview" | "goals";
export type ProgressSection = "trends" | "activities";

export type AppRoute = {
  planId: string | null;
  planningSection: PlanningSection;
  progressSection: ProgressSection;
  tab: AppTab;
  weekStart: string;
};

export function parseAppRoute(pathname: string, search: string, fallbackWeekStart: string): AppRoute {
  const normalizedFallback = normalizeWeek(fallbackWeekStart) ?? fallbackWeekStart;
  const weekMatch = pathname.match(/^\/week\/(\d{4}-\d{2}-\d{2})\/?$/);
  const legacyWeek = new URLSearchParams(search).get("week");
  const weekStart = normalizeWeek(weekMatch?.[1] ?? legacyWeek ?? "") ?? normalizedFallback;

  if (weekMatch || legacyWeek) {
    return baseRoute({ tab: "week", weekStart });
  }
  const planGoalsMatch = pathname.match(/^\/plan\/([^/]+)\/goals\/?$/);
  if (planGoalsMatch) {
    return baseRoute({
      tab: "plan",
      weekStart,
      planId: decodeURIComponent(planGoalsMatch[1]),
      planningSection: "goals"
    });
  }
  if (/^\/plan\/goals\/?$/.test(pathname)) {
    return baseRoute({ tab: "plan", weekStart, planningSection: "goals" });
  }
  const planMatch = pathname.match(/^\/plan\/([^/]+)\/?$/);
  if (planMatch) {
    return baseRoute({ tab: "plan", weekStart, planId: decodeURIComponent(planMatch[1]) });
  }
  if (/^\/plan\/?$/.test(pathname)) {
    return baseRoute({ tab: "plan", weekStart });
  }
  if (/^\/progress\/activities\/?$/.test(pathname)) {
    return baseRoute({ tab: "progress", weekStart, progressSection: "activities" });
  }
  if (/^\/progress\/?$/.test(pathname)) {
    return baseRoute({ tab: "progress", weekStart });
  }
  if (/^\/settings\/?$/.test(pathname)) {
    return baseRoute({ tab: "settings", weekStart });
  }
  return baseRoute({ tab: "week", weekStart });
}

export function appRoutePath(route: AppRoute) {
  if (route.tab === "week") {
    return `/week/${route.weekStart}`;
  }
  if (route.tab === "plan") {
    if (route.planningSection === "goals") {
      return route.planId ? `/plan/${encodeURIComponent(route.planId)}/goals` : "/plan/goals";
    }
    return route.planId ? `/plan/${encodeURIComponent(route.planId)}` : "/plan";
  }
  if (route.tab === "progress") {
    return route.progressSection === "activities" ? "/progress/activities" : "/progress";
  }
  return "/settings";
}

function baseRoute(overrides: Partial<AppRoute> & Pick<AppRoute, "tab" | "weekStart">): AppRoute {
  return {
    planId: null,
    planningSection: "overview",
    progressSection: "trends",
    ...overrides
  };
}

function normalizeWeek(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = parseDate(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return startOfWeek(parsed);
}
