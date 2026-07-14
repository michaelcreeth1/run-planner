import { describe, expect, it } from "vitest";
import { defaultForm } from "./forms";
import { formatDurationSeconds, paceInputFromMetrics, parseDurationSeconds, parsePaceSeconds, recalculateWorkoutMetrics } from "./workoutMetrics";

describe("workout metric calculations", () => {
  it("formats persisted duration and distance as pace", () => {
    expect(paceInputFromMetrics(3_300, 7.5)).toBe("7:20");
    expect(paceInputFromMetrics(null, 7.5)).toBe("");
  });

  it("recalculates the third metric based on the last field edited", () => {
    const initial = {
      ...defaultForm("2026-07-13"),
      plannedDistance: "6",
      plannedDuration: "0:48:00",
      plannedPace: "8:00"
    };

    expect(
      recalculateWorkoutMetrics({ ...initial, plannedPace: "7:30" }, "plannedPace").plannedDuration
    ).toBe("0:45:00");
    expect(
      recalculateWorkoutMetrics({ ...initial, plannedDistance: "8" }, "plannedDistance").plannedPace
    ).toBe("6:00");
  });

  it("accepts whole-minute and clock-style pace values", () => {
    expect(parsePaceSeconds("8")).toBe(480);
    expect(parsePaceSeconds("8:30")).toBe(510);
    expect(parsePaceSeconds("8:75")).toBeNull();
  });

  it("parses and formats duration as hours, minutes, and seconds", () => {
    expect(parseDurationSeconds("1:02:03")).toBe(3723);
    expect(parseDurationSeconds("62:03")).toBeNull();
    expect(formatDurationSeconds(3723)).toBe("1:02:03");
  });

  it("does not immediately restore a metric the user clears", () => {
    const form = {
      ...defaultForm("2026-07-13"),
      plannedDistance: "6",
      plannedDuration: "",
      plannedPace: "8:00"
    };

    expect(recalculateWorkoutMetrics(form, "plannedDuration").plannedDuration).toBe("");
  });
});
