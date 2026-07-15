import { describe, expect, it } from "vitest";
import type {
  ActualActivity,
  Mesocycle,
  PlanWeekSummary,
  RecurringGoal,
  TrainingPlan,
  TrainingWeek,
  WeekGoal,
  Workout
} from "../../types/domain";
import { buildPlanRules, evaluateRule, evaluateRulesForWeek, summarizeRuleMatrix } from "./ruleEvaluation";

const TODAY = "2026-07-08";
const FULL_WEEK_DATES = [
  "2026-07-06",
  "2026-07-07",
  "2026-07-08",
  "2026-07-09",
  "2026-07-10",
  "2026-07-11",
  "2026-07-12"
];

function makeWorkout(overrides: Partial<Workout>): Workout {
  return {
    id: crypto.randomUUID(),
    trainingWeekId: "week-1",
    athleteAccountId: "athlete-1",
    plannedDate: "2026-07-06",
    title: "Easy run",
    sport: "run",
    workoutType: "easy",
    intensityCategory: "easy",
    plannedDistance: 5,
    plannedDuration: null,
    plannedPace: null,
    plannedElevation: null,
    plannedTss: null,
    purpose: "",
    instructions: "",
    notes: "",
    status: "planned",
    ...overrides
  };
}

function makeWeek(overrides: Partial<TrainingWeek>): TrainingWeek {
  return {
    id: "week-1",
    weekStartDate: "2026-07-06",
    weekEndDate: "2026-07-12",
    plannedMileage: 0,
    actualMileage: 0,
    plannedTime: null,
    actualTime: null,
    mesocycleId: null,
    purpose: "aerobic_build",
    purposeSource: "plan",
    targetMileage: null,
    targetMileageSource: "plan",
    targetLongRunDistance: null,
    targetLongRunSource: "plan",
    isDownWeek: false,
    notes: "",
    reviewedAt: null,
    workouts: [],
    actualActivities: [],
    goals: [],
    goalEvaluations: [],
    weekState: "current",
    goalReviewSummary: "",
    hardDays: 0,
    longRunDistance: 0,
    longRunPercentage: 0,
    ...overrides
  };
}

function makeWeekGoal(overrides: Partial<WeekGoal>): WeekGoal {
  return {
    id: crypto.randomUUID(),
    trainingWeekId: "week-1",
    athleteAccountId: "athlete-1",
    weekStartDate: "2026-07-06",
    category: "recovery",
    goalType: "guardrail",
    label: "Rest day",
    description: "",
    targetValue: null,
    minAcceptable: null,
    maxAcceptable: null,
    unit: "days",
    evaluationMode: "at_least",
    priority: "guardrail",
    status: "not_started",
    source: "default",
    isEditable: true,
    isEnabled: true,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function makeRecurringGoal(overrides: Partial<RecurringGoal>): RecurringGoal {
  return {
    id: crypto.randomUUID(),
    trainingPlanId: null,
    athleteAccountId: "athlete-1",
    category: "custom",
    goalType: "guardrail",
    label: "",
    description: "",
    targetValue: null,
    minAcceptable: null,
    maxAcceptable: null,
    unit: "custom",
    evaluationMode: "manual",
    priority: "guardrail",
    notes: "",
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function makeSummary(overrides: Partial<PlanWeekSummary>): PlanWeekSummary {
  return {
    weekStartDate: "2026-07-06",
    weekEndDate: "2026-07-12",
    mesocycleId: "meso-1",
    mesocycleName: "Build",
    mesocyclePhase: "build",
    weekIndexInMesocycle: 1,
    mesocycleWeekCount: 4,
    plannedMileage: 0,
    actualMileage: 0,
    targetMileage: 40,
    targetLongRunDistance: 12,
    purpose: "aerobic_build",
    purposeSource: "plan",
    targetMileageSource: "plan",
    targetLongRunSource: "plan",
    isDownWeek: false,
    hasManualOverride: false,
    warning: null,
    ...overrides
  };
}

function makeMesocycle(overrides: Partial<Mesocycle>): Mesocycle {
  return {
    id: "meso-1",
    trainingPlanId: "plan-1",
    athleteAccountId: "athlete-1",
    orderIndex: 0,
    name: "Build",
    phase: "build",
    startDate: "2026-06-01",
    endDate: "2026-07-26",
    targetMileageStart: 30,
    targetMileageEnd: 45,
    longRunStart: null,
    longRunEnd: null,
    downWeekCadence: 4,
    downWeekReductionPct: 20,
    notes: "",
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function plannedWeek(workouts: Workout[], overrides: Partial<TrainingWeek> = {}): TrainingWeek {
  const plannedMileage = workouts.reduce(
    (sum, workout) => (workout.sport === "run" ? sum + (workout.plannedDistance ?? 0) : sum),
    0
  );
  return makeWeek({ plannedMileage, workouts, ...overrides });
}

const defaultRules = buildPlanRules({ defaultGoals: [], plan: null });
const restRule = defaultRules.find((rule) => rule.kind === "rest_days")!;
const hardRule = defaultRules.find((rule) => rule.kind === "hard_days")!;
const longRunPercentRule = defaultRules.find((rule) => rule.kind === "long_run_percent")!;
const longRunScheduledRule = defaultRules.find((rule) => rule.kind === "long_run_scheduled")!;

describe("buildPlanRules", () => {
  it("falls back to standard rules when no goals are configured", () => {
    expect(defaultRules.map((rule) => rule.kind)).toEqual([
      "rest_days",
      "hard_days",
      "long_run_percent",
      "long_run_scheduled"
    ]);
    expect(restRule.threshold).toBe(1);
    expect(hardRule.threshold).toBe(2);
    expect(longRunPercentRule.threshold).toBe(30);
  });

  it("derives thresholds and labels from configured goals", () => {
    const rules = buildPlanRules({
      defaultGoals: [
        makeRecurringGoal({
          category: "quality",
          label: "No more than 3 hard days",
          evaluationMode: "at_most",
          maxAcceptable: 3,
          unit: "days"
        }),
        makeRecurringGoal({
          metricKey: "rest_day_count",
          category: "recovery",
          label: "Preserve at least 2 rest days",
          evaluationMode: "at_least",
          minAcceptable: 2,
          unit: "days"
        })
      ],
      plan: null
    });
    const hard = rules.find((rule) => rule.kind === "hard_days")!;
    const rest = rules.find((rule) => rule.kind === "rest_days")!;
    expect(hard.threshold).toBe(3);
    expect(hard.label).toBe("No more than 3 hard days");
    expect(rest.threshold).toBe(2);
    expect(rest.label).toBe("Preserve at least 2 rest days");
  });

  it("adds the down-week rhythm rule only when the plan uses a cadence", () => {
    const plan = {
      mesocycles: [makeMesocycle({})],
      recurringGoals: [],
      weekSummaries: []
    } as unknown as TrainingPlan;
    const rules = buildPlanRules({ defaultGoals: [], plan });
    expect(rules.some((rule) => rule.kind === "down_week_rhythm")).toBe(true);
  });
});

describe("pending and override states", () => {
  it("marks unplanned weeks as pending, not failing", () => {
    const week = makeWeek({ weekState: "future" });
    const evaluations = evaluateRulesForWeek(defaultRules, { week }, TODAY);
    expect(evaluations.every((evaluation) => evaluation.status === "pending")).toBe(true);
  });

  it("marks past weeks without a plan or activities as pending", () => {
    const week = makeWeek({ weekStartDate: "2026-06-01", weekEndDate: "2026-06-07", weekState: "past" });
    const evaluation = evaluateRule(restRule, { week }, TODAY);
    expect(evaluation.status).toBe("pending");
    expect(evaluation.reason).toContain("planned or logged");
  });

  it("marks waived week goals as override", () => {
    const week = plannedWeek([makeWorkout({})], {
      goals: [makeWeekGoal({ category: "recovery", status: "waived", label: "Rest day" })]
    });
    const evaluation = evaluateRule(restRule, { week }, TODAY);
    expect(evaluation.status).toBe("override");
    expect(evaluation.reason).toContain("waived");
  });
});

describe("rest day rule", () => {
  it("passes when enough rest days remain", () => {
    const week = plannedWeek([makeWorkout({ plannedDate: "2026-07-06" }), makeWorkout({ plannedDate: "2026-07-07" })]);
    expect(evaluateRule(restRule, { week }, TODAY).status).toBe("pass");
  });

  it("fails when every day has a session", () => {
    const week = plannedWeek(FULL_WEEK_DATES.map((date) => makeWorkout({ plannedDate: date })));
    const evaluation = evaluateRule(restRule, { week }, TODAY);
    expect(evaluation.status).toBe("fail");
    expect(evaluation.reason).toContain("No rest day");
  });
});

describe("hard day rule", () => {
  it("fails above the limit and links the offending sessions", () => {
    const week = plannedWeek([
      makeWorkout({ plannedDate: "2026-07-06", workoutType: "tempo", intensityCategory: "workout" }),
      makeWorkout({ plannedDate: "2026-07-08", workoutType: "interval", intensityCategory: "workout" }),
      makeWorkout({ plannedDate: "2026-07-10", workoutType: "hill", intensityCategory: "workout" })
    ]);
    const evaluation = evaluateRule(hardRule, { week }, TODAY);
    expect(evaluation.status).toBe("fail");
    expect(evaluation.relatedWorkoutIds).toHaveLength(3);
    expect(evaluation.metrics).toContain("limit 2");
  });

  it("warns on back-to-back hard days inside the limit", () => {
    const week = plannedWeek([
      makeWorkout({ plannedDate: "2026-07-06", workoutType: "tempo", intensityCategory: "workout" }),
      makeWorkout({ plannedDate: "2026-07-07", workoutType: "interval", intensityCategory: "workout" })
    ]);
    expect(evaluateRule(hardRule, { week }, TODAY).status).toBe("warning");
  });

  it("passes at or below the limit", () => {
    const week = plannedWeek([
      makeWorkout({ plannedDate: "2026-07-06", workoutType: "tempo", intensityCategory: "workout" }),
      makeWorkout({ plannedDate: "2026-07-09", workoutType: "interval", intensityCategory: "workout" })
    ]);
    expect(evaluateRule(hardRule, { week }, TODAY).status).toBe("pass");
  });
});

describe("long run percent rule", () => {
  it("passes under the limit", () => {
    const week = plannedWeek([
      makeWorkout({ plannedDate: "2026-07-11", workoutType: "long_run", plannedDistance: 12 }),
      makeWorkout({ plannedDate: "2026-07-07", plannedDistance: 28 })
    ]);
    expect(evaluateRule(longRunPercentRule, { week }, TODAY).status).toBe("pass");
  });

  it("fails clearly over the limit and reports the math", () => {
    const week = plannedWeek([
      makeWorkout({ plannedDate: "2026-07-11", workoutType: "long_run", plannedDistance: 15 }),
      makeWorkout({ plannedDate: "2026-07-07", plannedDistance: 28 })
    ]);
    const evaluation = evaluateRule(longRunPercentRule, { week }, TODAY);
    expect(evaluation.status).toBe("fail");
    expect(evaluation.metrics).toContain("Long run 15 mi / 43 mi = 35%");
    expect(evaluation.metrics).toContain("limit 30%");
  });

  it("warns when only slightly over the limit", () => {
    const week = plannedWeek([
      makeWorkout({ plannedDate: "2026-07-11", workoutType: "long_run", plannedDistance: 32 }),
      makeWorkout({ plannedDate: "2026-07-07", plannedDistance: 68 })
    ]);
    expect(evaluateRule(longRunPercentRule, { week }, TODAY).status).toBe("warning");
  });

  it("is not applicable without a long run", () => {
    const week = plannedWeek([makeWorkout({ plannedDate: "2026-07-07", plannedDistance: null })], {
      plannedMileage: 20
    });
    expect(evaluateRule(longRunPercentRule, { week }, TODAY).status).toBe("not_applicable");
  });
});

describe("long run scheduled rule", () => {
  it("passes when a long run exists", () => {
    const week = plannedWeek([makeWorkout({ workoutType: "long_run", plannedDistance: 14, title: "Long run" })]);
    const evaluation = evaluateRule(longRunScheduledRule, { week }, TODAY);
    expect(evaluation.status).toBe("pass");
    expect(evaluation.relatedWorkoutIds).toHaveLength(1);
  });

  it("warns for future weeks and fails for current weeks without one", () => {
    const futureWeek = plannedWeek([makeWorkout({ plannedDate: "2026-07-14", intensityCategory: "easy" })], {
      weekStartDate: "2026-07-13",
      weekEndDate: "2026-07-19",
      weekState: "future"
    });
    expect(evaluateRule(longRunScheduledRule, { week: futureWeek }, TODAY).status).toBe("warning");

    const currentWeek = plannedWeek([makeWorkout({ plannedDistance: 4 })]);
    expect(evaluateRule(longRunScheduledRule, { week: currentWeek }, TODAY).status).toBe("fail");
  });

  it("does not apply during race weeks", () => {
    const week = plannedWeek([makeWorkout({ workoutType: "race", intensityCategory: "race", plannedDistance: 13.1 })]);
    expect(evaluateRule(longRunScheduledRule, { week }, TODAY).status).toBe("not_applicable");
  });
});

describe("down-week rhythm rule", () => {
  const plan = {
    mesocycles: [makeMesocycle({})],
    recurringGoals: [],
    weekSummaries: []
  } as unknown as TrainingPlan;
  const rhythmRule = buildPlanRules({ defaultGoals: [], plan }).find((rule) => rule.kind === "down_week_rhythm")!;

  it("passes on scheduled down weeks", () => {
    const week = plannedWeek([makeWorkout({})], { isDownWeek: true });
    const summary = makeSummary({ isDownWeek: true, weekIndexInMesocycle: 4 });
    const evaluation = evaluateRule(rhythmRule, { week, summary, mesocycle: makeMesocycle({}) }, TODAY);
    expect(evaluation.status).toBe("pass");
  });

  it("warns when an expected down week is missing", () => {
    const week = plannedWeek([makeWorkout({})]);
    const summary = makeSummary({ weekIndexInMesocycle: 4 });
    const evaluation = evaluateRule(rhythmRule, { week, summary, mesocycle: makeMesocycle({}) }, TODAY);
    expect(evaluation.status).toBe("warning");
    expect(evaluation.reason).toContain("4th week");
  });

  it("is not applicable on regular weeks", () => {
    const week = plannedWeek([makeWorkout({})]);
    const summary = makeSummary({ weekIndexInMesocycle: 2 });
    const evaluation = evaluateRule(rhythmRule, { week, summary, mesocycle: makeMesocycle({}) }, TODAY);
    expect(evaluation.status).toBe("not_applicable");
  });
});

function makeActivity(overrides: Partial<ActualActivity>): ActualActivity {
  return {
    id: crypto.randomUUID(),
    stravaActivityId: "12345",
    name: "Morning Run",
    sportType: "Run",
    startDateLocal: "2026-06-01T07:00:00",
    activityDate: "2026-06-01",
    distance: 8047,
    distanceMiles: 5,
    movingTime: 2700,
    averageHeartrate: null,
    ...overrides
  };
}

function pastWeekWithActuals(activities: ActualActivity[], overrides: Partial<TrainingWeek> = {}): TrainingWeek {
  const actualMileage = activities.reduce((sum, activity) => sum + activity.distanceMiles, 0);
  return makeWeek({
    weekStartDate: "2026-06-01",
    weekEndDate: "2026-06-07",
    weekState: "past",
    actualMileage,
    actualActivities: activities,
    ...overrides
  });
}

describe("historical weeks evaluated from actuals", () => {
  it("counts rest days from activity dates", () => {
    const week = pastWeekWithActuals(
      ["2026-06-01", "2026-06-02", "2026-06-04", "2026-06-05", "2026-06-07"].map((date) =>
        makeActivity({ activityDate: date })
      )
    );
    const evaluation = evaluateRule(restRule, { week }, TODAY);
    expect(evaluation.status).toBe("pass");
    expect(evaluation.reason).toContain("taken");
  });

  it("counts hard days from activity names", () => {
    const week = pastWeekWithActuals([
      makeActivity({ activityDate: "2026-06-01", name: "Tempo Tuesday" }),
      makeActivity({ activityDate: "2026-06-03", name: "Hill repeats" }),
      makeActivity({ activityDate: "2026-06-05", name: "Track intervals" })
    ]);
    const evaluation = evaluateRule(hardRule, { week }, TODAY);
    expect(evaluation.status).toBe("fail");
    expect(evaluation.reason).toContain("completed");
  });

  it("passes the long run check when a real long run happened", () => {
    const week = pastWeekWithActuals([
      makeActivity({ activityDate: "2026-06-02", distanceMiles: 6 }),
      makeActivity({ activityDate: "2026-06-04", distanceMiles: 6 }),
      makeActivity({ activityDate: "2026-06-07", distanceMiles: 12, name: "Sunday Long Run" })
    ]);
    expect(evaluateRule(longRunScheduledRule, { week }, TODAY).status).toBe("pass");
  });

  it("fails the long run check when no run stands out", () => {
    const week = pastWeekWithActuals(
      ["2026-06-01", "2026-06-02", "2026-06-04", "2026-06-05", "2026-06-06"].map((date) =>
        makeActivity({ activityDate: date, distanceMiles: 6 })
      )
    );
    const evaluation = evaluateRule(longRunScheduledRule, { week }, TODAY);
    expect(evaluation.status).toBe("fail");
    expect(evaluation.reason).toContain("no true long run");
  });

  it("measures the long run share against actual mileage", () => {
    const week = pastWeekWithActuals([
      makeActivity({ activityDate: "2026-06-02", distanceMiles: 10 }),
      makeActivity({ activityDate: "2026-06-07", distanceMiles: 15, name: "Long Run" })
    ]);
    const evaluation = evaluateRule(longRunPercentRule, { week }, TODAY);
    expect(evaluation.status).toBe("fail");
    expect(evaluation.metrics).toContain("Long run 15 mi / 25 mi = 60%");
  });

  it("still evaluates planned structure for past weeks without actuals", () => {
    const week = plannedWeek([makeWorkout({ plannedDate: "2026-06-02" })], {
      weekStartDate: "2026-06-01",
      weekEndDate: "2026-06-07",
      weekState: "past"
    });
    const evaluation = evaluateRule(restRule, { week }, TODAY);
    expect(evaluation.status).toBe("pass");
    expect(evaluation.reason).toContain("planned");
  });
});

describe("summarizeRuleMatrix", () => {
  it("counts each week once with fail taking precedence", () => {
    const failingWeek = plannedWeek(FULL_WEEK_DATES.map((date) => makeWorkout({ plannedDate: date })));
    const pendingWeek = makeWeek({ id: "week-2", weekStartDate: "2026-07-13", weekEndDate: "2026-07-19" });
    const evaluations = [
      ...evaluateRulesForWeek(defaultRules, { week: failingWeek }, TODAY),
      ...evaluateRulesForWeek(defaultRules, { week: pendingWeek }, TODAY)
    ];
    const summary = summarizeRuleMatrix(evaluations);
    expect(summary.totalWeeks).toBe(2);
    expect(summary.failureWeeks).toBe(1);
    expect(summary.pendingWeeks).toBe(1);
    expect(summary.healthyWeeks).toBe(0);
  });
});
