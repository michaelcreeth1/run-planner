import type { WorkoutForm } from "../types/domain";

export type WorkoutMetricField = "plannedDistance" | "plannedDuration" | "plannedPace";

export function paceInputFromMetrics(
  durationSeconds: number | null | undefined,
  distanceMiles: number | null | undefined,
  paceSeconds: number | null | undefined = null
) {
  if (paceSeconds && paceSeconds > 0) {
    return formatPaceSeconds(paceSeconds);
  }
  if (!durationSeconds || !distanceMiles || durationSeconds <= 0 || distanceMiles <= 0) {
    return "";
  }
  return formatPaceSeconds(durationSeconds / distanceMiles);
}

export function recalculateWorkoutMetrics(
  form: WorkoutForm,
  changedField: WorkoutMetricField
): WorkoutForm {
  if (form[changedField].trim() === "") {
    return form;
  }

  const distance = positiveNumber(form.plannedDistance);
  const durationSeconds = parseDurationSeconds(form.plannedDuration);
  const paceSeconds = parsePaceSeconds(form.plannedPace);

  if (changedField === "plannedDistance") {
    if (distance !== null && durationSeconds !== null) {
      return { ...form, plannedPace: formatPaceSeconds(durationSeconds / distance) };
    }
    if (distance !== null && paceSeconds !== null) {
      return { ...form, plannedDuration: formatDurationSeconds(distance * paceSeconds) };
    }
  }

  if (changedField === "plannedDuration") {
    if (durationSeconds !== null && distance !== null) {
      return { ...form, plannedPace: formatPaceSeconds(durationSeconds / distance) };
    }
    if (durationSeconds !== null && paceSeconds !== null) {
      return { ...form, plannedDistance: formatDistance(durationSeconds / paceSeconds) };
    }
  }

  if (changedField === "plannedPace" && paceSeconds !== null) {
    if (distance !== null) {
      return { ...form, plannedDuration: formatDurationSeconds(distance * paceSeconds) };
    }
    if (durationSeconds !== null) {
      return { ...form, plannedDistance: formatDistance(durationSeconds / paceSeconds) };
    }
  }

  return form;
}

export function parsePaceSeconds(value: string) {
  const match = value.trim().match(/^(\d+)(?::([0-5]?\d))?$/);
  if (!match) {
    return null;
  }
  const seconds = Number(match[1]) * 60 + Number(match[2] ?? 0);
  return seconds > 0 ? seconds : null;
}

export function parseDurationSeconds(value: string) {
  const match = value.trim().match(/^(\d+):([0-5]\d):([0-5]\d)$/);
  if (!match) {
    return null;
  }
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return seconds > 0 ? seconds : null;
}

function positiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatPaceSeconds(value: number) {
  const rounded = Math.round(value);
  const minutes = Math.floor(rounded / 60);
  const seconds = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function formatDurationSeconds(value: number) {
  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 3600);
  const minutes = String(Math.floor((rounded % 3600) / 60)).padStart(2, "0");
  const seconds = String(rounded % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatDistance(value: number) {
  return String(Math.round(value * 100) / 100);
}
