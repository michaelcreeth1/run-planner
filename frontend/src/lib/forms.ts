import type { WeekGoalForm, WorkoutForm } from "../types/domain";
import { sessionTypeForWorkout } from "./options";
import { parseDurationSeconds, parsePaceSeconds } from "./workoutMetrics";

export function defaultForm(plannedDate: string): WorkoutForm {
  return {
    plannedDate,
    title: "",
    sport: "run",
    workoutType: "easy",
    intensityCategory: "easy",
    plannedDistance: "",
    plannedDuration: "",
    plannedPace: "",
    purpose: "",
    instructions: "",
    notes: "",
    status: "planned"
  };
}

export function formToPayload(form: WorkoutForm) {
  const sessionType = sessionTypeForWorkout(form);
  return {
    plannedDate: form.plannedDate,
    title: form.title,
    sport: sessionType.sport,
    workoutType: sessionType.workoutType,
    intensityCategory: sessionType.intensityCategory,
    plannedDistance: form.plannedDistance === "" ? null : Number(form.plannedDistance),
    plannedDuration: form.plannedDuration === "" ? null : parseDurationSeconds(form.plannedDuration),
    plannedPace: parsePaceSeconds(form.plannedPace),
    purpose: form.purpose,
    instructions: form.instructions,
    notes: form.notes,
    status: form.status
  };
}

export function defaultGoalForm(weekId: string): WeekGoalForm {
  return {
    weekId,
    category: "custom",
    goalType: "achievement",
    label: "",
    description: "",
    targetValue: "",
    minAcceptable: "",
    maxAcceptable: "",
    unit: "custom",
    evaluationMode: "manual",
    priority: "secondary",
    status: "not_started",
    isEnabled: true
  };
}

export function goalFormToPayload(form: WeekGoalForm) {
  return {
    category: form.category,
    goalType: form.goalType,
    label: form.label,
    description: form.description,
    targetValue: optionalNumber(form.targetValue),
    minAcceptable: optionalNumber(form.minAcceptable),
    maxAcceptable: optionalNumber(form.maxAcceptable),
    unit: form.unit,
    evaluationMode: form.evaluationMode,
    priority: form.priority,
    status: form.status,
    source: "manual",
    isEditable: true,
    isEnabled: form.isEnabled
  };
}

export function optionalNumber(value: string) {
  return value === "" ? null : Number(value);
}
