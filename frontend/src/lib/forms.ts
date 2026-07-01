import type { WeekGoalForm, WorkoutForm } from "../types/domain";

export function defaultForm(plannedDate: string): WorkoutForm {
  return {
    plannedDate,
    title: "",
    sport: "run",
    workoutType: "easy",
    intensityCategory: "easy",
    plannedDistance: "",
    plannedDuration: "",
    purpose: "",
    instructions: "",
    notes: "",
    status: "planned"
  };
}

export function formToPayload(form: WorkoutForm) {
  return {
    plannedDate: form.plannedDate,
    title: form.title,
    sport: form.sport,
    workoutType: form.workoutType,
    intensityCategory: form.intensityCategory,
    plannedDistance: form.plannedDistance === "" ? null : Number(form.plannedDistance),
    plannedDuration: form.plannedDuration === "" ? null : Number(form.plannedDuration) * 60,
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
