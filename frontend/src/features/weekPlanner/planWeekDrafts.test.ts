import { describe, expect, it } from "vitest";
import { addDays } from "../../lib/dates";
import type {
  ActualActivity,
  PlanWeekDraft,
  PlanWeekGoalDraft,
  PlanWeekWorkoutDraft,
  TrainingWeek,
  WeekPurposeId,
  Workout
} from "../../types/domain";
import {
  buildPlanWeekDraft,
  deriveGoalDraftsFromSchedule,
  draftWorkoutsFromWeek,
  evaluatePlanAlignment,
  planWeekDraftToPayload,
  scaleDraftWorkoutsToMileage,
  suggestLoad
} from "./planWeekDrafts";

describe("plan week draft helpers", () => {
  it("suggests conservative load changes by purpose", () => {
    expect(suggestLoad(30, "aerobic_build", []).suggestedMileage).toBe(31.2);
    expect(suggestLoad(30, "down_week", []).suggestedMileage).toBe(24);
    expect(suggestLoad(30, "recovery", []).suggestedMileage).toBe(19.5);
    expect(suggestLoad(null, "custom", [makeDraftWorkout({ plannedDistance: "12" })]).suggestedMileage).toBe(12);
  });

  it("copies a prior week's workouts onto matching target weekdays", () => {
    const priorWeek = makeWeek("2026-06-22", {
      workouts: [
        makeWorkout({
          id: "midweek",
          plannedDate: "2026-06-24",
          title: "Midweek aerobic",
          plannedDistance: 5
        })
      ]
    });
    const targetWeek = makeWeek("2026-06-29");

    const draft = buildPlanWeekDraft(targetWeek, {
      [priorWeek.weekStartDate]: priorWeek,
      [targetWeek.weekStartDate]: targetWeek
    });

    expect(draft.startingPoint).toBe("copy_prior");
    expect(draft.workouts[0]).toMatchObject({
      plannedDate: "2026-07-01",
      title: "Midweek aerobic",
      plannedDistance: "5"
    });
  });

  it("seeds workout drafts from completed run activities", () => {
    const sourceWeek = makeWeek("2026-06-22", {
      actualActivities: [
        makeActivity({
          activityDate: "2026-06-25",
          distanceMiles: 6.34,
          name: "Morning Run",
          sportType: "Run"
        })
      ],
      actualMileage: 6.34
    });

    const workouts = draftWorkoutsFromWeek(sourceWeek, "2026-06-29");

    expect(workouts[0]).toMatchObject({
      plannedDate: "2026-07-02",
      title: "Morning Run",
      sport: "run",
      plannedDistance: "6.3",
      purpose: "Seeded from completed activity"
    });
  });

  it("scales run mileage while leaving non-run sessions unchanged", () => {
    const strength = makeDraftWorkout({
      sport: "strength",
      workoutType: "strength",
      intensityCategory: "strength",
      plannedDistance: "2"
    });
    const rest = makeDraftWorkout({
      sport: "rest",
      workoutType: "rest",
      intensityCategory: "rest",
      plannedDistance: "0"
    });

    const scaled = scaleDraftWorkoutsToMileage(
      [makeDraftWorkout({ plannedDistance: "5" }), strength, rest],
      10
    );

    expect(scaled[0].plannedDistance).toBe("10");
    expect(scaled[1]).toBe(strength);
    expect(scaled[2]).toBe(rest);
  });

  it("derives schedule goals and guardrails from the draft week", () => {
    const draft = makeDraft({
      workouts: [
        makeDraftWorkout({ plannedDate: "2026-06-29", plannedDistance: "4" }),
        makeDraftWorkout({
          plannedDate: "2026-07-01",
          title: "Tempo",
          intensityCategory: "workout",
          plannedDistance: "6",
          workoutType: "tempo"
        }),
        makeDraftWorkout({
          plannedDate: "2026-07-02",
          sport: "strength",
          workoutType: "strength",
          intensityCategory: "strength",
          plannedDistance: ""
        }),
        makeDraftWorkout({
          plannedDate: "2026-07-05",
          title: "Long run",
          workoutType: "long_run",
          plannedDistance: "10"
        })
      ]
    });

    const goals = deriveGoalDraftsFromSchedule(draft, "Schedule");
    const achievementCategories = goals
      .filter((goal) => goal.goalType === "achievement")
      .map((goal) => goal.category);
    const guardrailCategories = goals
      .filter((goal) => goal.goalType === "guardrail")
      .map((goal) => goal.category);

    expect(achievementCategories).toEqual(
      expect.arrayContaining(["mileage", "quality", "long_run", "recovery", "sessions", "strength"])
    );
    expect(guardrailCategories).toEqual(["long_run", "quality"]);
  });

  it("evaluates aligned and mismatched plan goals", () => {
    const draft = makeDraft({
      workouts: [
        makeDraftWorkout({ plannedDate: "2026-06-29", plannedDistance: "5" }),
        makeDraftWorkout({
          plannedDate: "2026-07-01",
          intensityCategory: "workout",
          plannedDistance: "4",
          workoutType: "interval"
        }),
        makeDraftWorkout({
          plannedDate: "2026-07-04",
          plannedDistance: "9",
          workoutType: "long_run"
        })
      ],
      goals: [
        makeGoalDraft({
          category: "mileage",
          minAcceptable: "17",
          targetValue: "18",
          maxAcceptable: "19"
        }),
        makeGoalDraft({
          category: "quality",
          minAcceptable: "2",
          targetValue: "2",
          unit: "sessions",
          evaluationMode: "at_least"
        }),
        makeGoalDraft({
          category: "long_run",
          targetValue: "8",
          maxAcceptable: "8"
        }),
        makeGoalDraft({
          category: "recovery",
          minAcceptable: "4",
          targetValue: "4",
          unit: "days",
          evaluationMode: "at_least"
        })
      ]
    });

    const alignmentById = new Map(evaluatePlanAlignment(draft).map((item) => [item.id, item.status]));

    expect(alignmentById.get("mileage")).toBe("aligned");
    expect(alignmentById.get("quality")).toBe("mismatch");
    expect(alignmentById.get("long_run")).toBe("mismatch");
    expect(alignmentById.get("recovery")).toBe("aligned");
  });

  it("builds a save payload without draft-only fields and keeps goal source", () => {
    const draft = makeDraft({
      purpose: "maintain",
      workouts: [
        makeDraftWorkout({
          plannedDistance: "8",
          plannedDuration: "64",
          workoutType: "long_run"
        })
      ],
      goals: [
        makeGoalDraft({
          category: "long_run",
          source: "manual",
          sourceLabel: "Edited",
          targetValue: "8",
          minAcceptable: "7",
          maxAcceptable: "9",
          qualityType: "any"
        })
      ]
    });

    const payload = planWeekDraftToPayload(draft);

    expect(payload).toMatchObject({
      purpose: "Maintain",
      targetLongRunDistance: 8
    });
    expect(payload.workouts[0]).toMatchObject({
      plannedDistance: 8,
      plannedDuration: 3840
    });
    expect(payload.workouts[0]).not.toHaveProperty("draftId");
    expect(payload.goals[0]).toMatchObject({
      label: "Long run near 8 miles",
      source: "manual"
    });
    expect(payload.goals[0]).not.toHaveProperty("draftId");
    expect(payload.goals[0]).not.toHaveProperty("sourceLabel");
    expect(payload.goals[0]).not.toHaveProperty("qualityType");
  });
});

function makeWeek(
  weekStartDate: string,
  overrides: Partial<TrainingWeek> = {}
): TrainingWeek {
  const workouts = overrides.workouts ?? [];
  const actualActivities = overrides.actualActivities ?? [];
  const plannedMileage =
    overrides.plannedMileage ??
    workouts.reduce((sum, workout) => sum + (workout.sport === "run" ? workout.plannedDistance ?? 0 : 0), 0);
  const actualMileage =
    overrides.actualMileage ??
    actualActivities.reduce((sum, activity) => sum + activity.distanceMiles, 0);

  return {
    id: `week-${weekStartDate}`,
    weekStartDate,
    weekEndDate: addDays(weekStartDate, 6),
    plannedMileage,
    actualMileage,
    plannedTime: null,
    actualTime: null,
    targetLongRunDistance: null,
    notes: "",
    workouts,
    actualActivities,
    goals: [],
    goalEvaluations: [],
    weekState: "past",
    goalReviewSummary: "",
    hardDays: 0,
    longRunDistance: 0,
    longRunPercentage: 0,
    ...overrides
  };
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "workout-1",
    trainingWeekId: "week-1",
    athleteAccountId: "athlete-1",
    plannedDate: "2026-06-29",
    title: "Easy run",
    sport: "run",
    workoutType: "easy",
    intensityCategory: "easy",
    plannedDistance: 5,
    plannedDuration: null,
    plannedElevation: null,
    plannedTss: null,
    purpose: "",
    instructions: "",
    notes: "",
    status: "planned",
    ...overrides
  };
}

function makeActivity(overrides: Partial<ActualActivity> = {}): ActualActivity {
  return {
    id: "activity-1",
    stravaActivityId: "strava-1",
    name: "Morning Run",
    sportType: "Run",
    startDateLocal: "2026-06-25T07:00:00",
    activityDate: "2026-06-25",
    distance: 10200,
    distanceMiles: 6.34,
    movingTime: 3000,
    averageHeartrate: null,
    ...overrides
  };
}

function makeDraft(overrides: Partial<PlanWeekDraft> = {}): PlanWeekDraft {
  return {
    weekId: "week-target",
    weekStartDate: "2026-06-29",
    weekEndDate: "2026-07-05",
    weekState: "future",
    startingPoint: "blank",
    purpose: "maintain",
    customPurpose: "",
    priorWeekStartDate: null,
    noPriorUsableWeek: false,
    load: {
      priorMileage: null,
      suggestedMileage: 0,
      reason: ""
    },
    workouts: [],
    goals: [],
    hasExistingPlan: false,
    mismatchAcknowledged: false,
    ...overrides
  };
}

function makeDraftWorkout(overrides: Partial<PlanWeekWorkoutDraft> = {}): PlanWeekWorkoutDraft {
  return {
    draftId: "draft-workout-1",
    plannedDate: "2026-06-29",
    title: "Easy run",
    sport: "run",
    workoutType: "easy",
    intensityCategory: "easy",
    plannedDistance: "5",
    plannedDuration: "",
    purpose: "",
    instructions: "",
    notes: "",
    status: "planned",
    ...overrides
  };
}

function makeGoalDraft(overrides: Partial<PlanWeekGoalDraft> = {}): PlanWeekGoalDraft {
  const category = overrides.category ?? "mileage";
  const purpose = category === "quality" ? "Complete quality" : "Weekly goal";

  return {
    draftId: `draft-goal-${category}`,
    weekId: "week-target",
    category,
    goalType: "achievement",
    label: purpose,
    description: "",
    targetValue: "",
    minAcceptable: "",
    maxAcceptable: "",
    unit: category === "mileage" || category === "long_run" ? "mi" : "custom",
    evaluationMode: "range",
    priority: "primary",
    status: "not_started",
    isEnabled: true,
    source: "derived_from_plan",
    sourceLabel: "Schedule",
    ...overrides
  };
}
