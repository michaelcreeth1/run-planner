import type {
  PrescriptionBlock,
  WorkoutForm,
  WorkoutPrescription,
  WorkoutTemplate
} from "../types/domain";
import { defaultForm } from "./forms";
import { sessionTypeForWorkout, sessionTypes } from "./options";
import { formatDurationSeconds } from "./workoutMetrics";

export function prescriptionTotals(prescription: WorkoutPrescription) {
  function totalBlocks(blocks: PrescriptionBlock[], multiplier = 1): { distance: number; duration: number } {
    let distance = 0;
    let duration = 0;
    for (const block of blocks) {
      if (block.kind === "step") {
        distance += (block.distanceMeters ?? 0) * multiplier;
        duration += (block.durationSeconds ?? 0) * multiplier;
        continue;
      }
      const repeated = totalBlocks(block.steps, block.repetitions * multiplier);
      distance += repeated.distance;
      duration += repeated.duration;
      if (!block.recoveryAfterFinal) {
        const finalRecovery = totalBlocks(
          block.steps.filter((step) => step.kind === "step" && step.role === "recovery"),
          multiplier
        );
        distance -= finalRecovery.distance;
        duration -= finalRecovery.duration;
      }
    }
    return { distance, duration };
  }

  return totalBlocks(prescription.blocks);
}

export function prescriptionFromForm(form: WorkoutForm): WorkoutPrescription {
  if (form.prescription?.blocks.length) {
    return form.prescription;
  }
  if (Number(form.plannedDistance) > 0) {
    return {
      blocks: [{
        kind: "step",
        role: "other",
        extent: "distance",
        distanceMeters: Number(form.plannedDistance) * 1609.344,
        displayUnit: "mi",
        supportingTargets: [],
        notes: ""
      }]
    };
  }
  return {
    blocks: [{
      kind: "step",
      role: "other",
      extent: "open",
      supportingTargets: [],
      notes: ""
    }]
  };
}

export function templateToWorkoutForm(template: WorkoutTemplate, plannedDate: string): WorkoutForm {
  const sessionType =
    sessionTypes.find((option) => option.workoutType === template.workoutType) ??
    sessionTypes.find((option) => option.value === "run:other")!;
  const totals = prescriptionTotals(template.prescription);
  return {
    ...defaultForm(plannedDate),
    id: template.id,
    title: template.name,
    sport: sessionType.sport,
    workoutType: sessionType.workoutType,
    intensityCategory: sessionType.intensityCategory,
    plannedDistance: totals.distance ? String(Math.round((totals.distance / 1609.344) * 100) / 100) : "",
    plannedDuration: totals.duration ? formatDurationSeconds(totals.duration) : "",
    purpose: template.purpose,
    instructions: template.instructions,
    prescription: template.prescription,
    version: template.version
  };
}

export function workoutTemplatePayload(form: WorkoutForm, tags: string[]) {
  const sessionType = sessionTypeForWorkout(form);
  return {
    name: form.title.trim() || sessionType.label,
    workoutType: sessionType.workoutType,
    tags,
    prescription: prescriptionFromForm(form),
    purpose: form.purpose,
    instructions: form.instructions,
    expectedVersion: form.version
  };
}
