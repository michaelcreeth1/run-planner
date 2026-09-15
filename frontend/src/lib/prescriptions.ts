import type {
  PrescriptionBlock,
  Workout,
  WorkoutForm,
  WorkoutPrescription,
  WorkoutTemplate
} from "../types/domain";
import { defaultForm } from "./forms";
import { sessionTypeForWorkout, sessionTypes } from "./options";
import { formatDurationSeconds } from "./workoutMetrics";

const DEFAULT_EASY_PACE_SECONDS_PER_MILE = 600;
const WORK_PACE_FACTORS: Partial<Record<Workout["workoutType"], number>> = {
  tempo: 0.9,
  threshold: 0.85,
  interval: 0.75,
  hill: 0.82,
  race: 0.78,
  time_trial: 0.78,
  progression: 0.9,
  strides: 0.72
};

export function prescriptionTotals(
  prescription: WorkoutPrescription,
  options: {
    easyPaceSecondsPerMile?: number;
    workoutType?: Workout["workoutType"];
  } = {}
) {
  const easyPace = options.easyPaceSecondsPerMile ?? DEFAULT_EASY_PACE_SECONDS_PER_MILE;

  function stepPace(block: Extract<PrescriptionBlock, { kind: "step" }>) {
    const target = block.primaryTarget;
    if (target?.kind === "pace") {
      const targetValues = [target.value, target.minValue, target.maxValue]
        .filter((value): value is number => Boolean(value));
      if (targetValues.length) {
        const pace = targetValues.reduce((sum, value) => sum + value, 0) / targetValues.length;
        return pace < 10 ? pace * 1609.344 : pace;
      }
    }
    if (block.role !== "work") return easyPace;
    return easyPace * (WORK_PACE_FACTORS[options.workoutType ?? "other"] ?? 0.9);
  }

  function totalBlocks(blocks: PrescriptionBlock[], multiplier = 1): {
    distance: number;
    duration: number;
    estimatedDistance: number;
    estimatedDuration: number;
    distanceComplete: boolean;
    durationComplete: boolean;
    hasOpenEndedExtent: boolean;
  } {
    let distance = 0;
    let duration = 0;
    let estimatedDistance = 0;
    let estimatedDuration = 0;
    let distanceComplete = true;
    let durationComplete = true;
    let hasOpenEndedExtent = false;
    for (const block of blocks) {
      if (block.kind === "step") {
        const pace = stepPace(block);
        if (block.extent === "distance") {
          const stepDistance = (block.distanceMeters ?? 0) * multiplier;
          distance += stepDistance;
          estimatedDistance += stepDistance;
          estimatedDuration += (stepDistance / 1609.344) * pace;
          durationComplete = false;
        } else if (block.extent === "duration") {
          const stepDuration = (block.durationSeconds ?? 0) * multiplier;
          duration += stepDuration;
          estimatedDuration += stepDuration;
          estimatedDistance += (stepDuration / pace) * 1609.344;
          distanceComplete = false;
        } else {
          const assumedSeconds = ({
            warmup: 600,
            recovery: 120,
            cooldown: 600,
            work: 300,
            other: 600
          }[block.role] ?? 600) * multiplier;
          estimatedDuration += assumedSeconds;
          estimatedDistance += (assumedSeconds / pace) * 1609.344;
          distanceComplete = false;
          durationComplete = false;
          hasOpenEndedExtent = true;
        }
        continue;
      }
      const repeated = totalBlocks(block.steps, block.repetitions * multiplier);
      distance += repeated.distance;
      duration += repeated.duration;
      estimatedDistance += repeated.estimatedDistance;
      estimatedDuration += repeated.estimatedDuration;
      distanceComplete = distanceComplete && repeated.distanceComplete;
      durationComplete = durationComplete && repeated.durationComplete;
      hasOpenEndedExtent = hasOpenEndedExtent || repeated.hasOpenEndedExtent;
      if (!block.recoveryAfterFinal) {
        const finalRecovery = totalBlocks(
          block.steps.filter((step) => step.kind === "step" && step.role === "recovery"),
          multiplier
        );
        distance -= finalRecovery.distance;
        duration -= finalRecovery.duration;
        estimatedDistance -= finalRecovery.estimatedDistance;
        estimatedDuration -= finalRecovery.estimatedDuration;
      }
    }
    return {
      distance,
      duration,
      estimatedDistance,
      estimatedDuration,
      distanceComplete,
      durationComplete,
      hasOpenEndedExtent
    };
  }

  return totalBlocks(prescription.blocks);
}

export function isStructuredPrescription(prescription?: WorkoutPrescription | null) {
  if (!prescription || prescription.blocks.length !== 1) return Boolean(prescription?.blocks.length);
  const onlyPart = prescription.blocks[0];
  return !(
    onlyPart.kind === "step" &&
    onlyPart.role === "other" &&
    !onlyPart.primaryTarget &&
    onlyPart.supportingTargets.length === 0 &&
    !onlyPart.notes
  );
}

export function scalePrescriptionDistance(
  prescription: WorkoutPrescription | null | undefined,
  targetDistanceMiles: number
): WorkoutPrescription | null | undefined {
  if (!prescription || targetDistanceMiles <= 0) {
    return prescription;
  }
  const totals = prescriptionTotals(prescription);
  if (!totals.distanceComplete || totals.distance <= 0) {
    return prescription;
  }
  const scale = (targetDistanceMiles * 1609.344) / totals.distance;
  const scaleBlocks = (blocks: PrescriptionBlock[]): PrescriptionBlock[] =>
    blocks.map((block) => {
      if (block.kind === "repeat") {
        return { ...block, steps: scaleBlocks(block.steps) };
      }
      return block.extent === "distance" && block.distanceMeters
        ? { ...block, distanceMeters: block.distanceMeters * scale }
        : block;
    });
  return { blocks: scaleBlocks(prescription.blocks) };
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
    plannedDistance: totals.distanceComplete && totals.distance ? String(Math.round((totals.distance / 1609.344) * 100) / 100) : "",
    plannedDuration: totals.durationComplete && totals.duration ? formatDurationSeconds(totals.duration) : "",
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
