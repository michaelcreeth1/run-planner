import { describe, expect, it } from "vitest";
import type { WorkoutPrescription } from "../types/domain";
import { isStructuredPrescription, prescriptionTotals, scalePrescriptionDistance, workoutTemplatePayload } from "./prescriptions";
import { defaultForm } from "./forms";

describe("prescription totals", () => {
  it("saves edited simple distances and durations instead of the old baseline", () => {
    const original = workoutTemplatePayload({ ...defaultForm("2099-01-05"), plannedDistance: "5" }, []).prescription;
    const edited = { ...defaultForm("2099-01-05"), plannedDistance: "7", prescription: original };
    expect(prescriptionTotals(workoutTemplatePayload(edited, []).prescription).distance / 1609.344).toBeCloseTo(7);
    const timed = workoutTemplatePayload({ ...edited, plannedDistance: "", plannedDuration: "0:30:00" }, []).prescription;
    expect(timed.blocks[0]).toMatchObject({ extent: "duration", durationSeconds: 1800 });
    expect(prescriptionTotals(timed).duration).toBe(1800);
    const cleared = workoutTemplatePayload({ ...edited, plannedDistance: "" }, []).prescription;
    expect(cleared.blocks[0]).toMatchObject({ extent: "open" });
  });

  it("preserves authored structure when saving to the library", () => {
    const prescription: WorkoutPrescription = { blocks: [{
      kind: "step", role: "work", extent: "duration", durationSeconds: 1800,
      supportingTargets: [], notes: "Threshold effort"
    }] };
    const payload = workoutTemplatePayload({ ...defaultForm("2099-01-05"), prescription, plannedDistance: "5" }, []);
    expect(payload.prescription).toEqual(prescription);
  });
  it("keeps mixed distance and duration totals explicitly incomplete", () => {
    const prescription: WorkoutPrescription = {
      blocks: [{
        kind: "repeat",
        repetitions: 4,
        recoveryAfterFinal: false,
        notes: "",
        steps: [
          {
            kind: "step",
            role: "work",
            extent: "distance",
            distanceMeters: 1000,
            displayUnit: "m",
            supportingTargets: [],
            notes: ""
          },
          {
            kind: "step",
            role: "recovery",
            extent: "duration",
            durationSeconds: 120,
            displayUnit: "min",
            supportingTargets: [],
            notes: ""
          }
        ]
      }]
    };

    const totals = prescriptionTotals(prescription);
    expect(totals).toMatchObject({
      distance: 4000,
      duration: 360,
      distanceComplete: false,
      durationComplete: false,
      hasOpenEndedExtent: false
    });
    expect(totals.estimatedDistance).toBeCloseTo(4965.61, 2);
    expect(totals.estimatedDuration).toBeCloseTo(1702.16, 2);
  });

  it("recognizes the migrated one-part baseline as a simple workout", () => {
    const prescription: WorkoutPrescription = {
      blocks: [{
        kind: "step",
        role: "other",
        extent: "distance",
        distanceMeters: 8046.72,
        displayUnit: "mi",
        supportingTargets: [],
        notes: ""
      }]
    };

    expect(isStructuredPrescription(prescription)).toBe(false);
    expect(isStructuredPrescription({
      blocks: [{
        kind: "step",
        role: "work",
        extent: "distance",
        distanceMeters: 8046.72,
        displayUnit: "mi",
        supportingTargets: [],
        notes: ""
      }]
    })).toBe(true);
  });

  it("scales every distance step while preserving structured intent", () => {
    const prescription: WorkoutPrescription = {
      blocks: [
        {
          kind: "step",
          role: "warmup",
          extent: "distance",
          distanceMeters: 1609.344,
          displayUnit: "mi",
          supportingTargets: [],
          notes: "Easy"
        },
        {
          kind: "repeat",
          repetitions: 2,
          recoveryAfterFinal: true,
          notes: "",
          steps: [{
            kind: "step",
            role: "work",
            extent: "distance",
            distanceMeters: 1609.344,
            displayUnit: "mi",
            supportingTargets: [],
            notes: "Controlled"
          }]
        }
      ]
    };

    const scaled = scalePrescriptionDistance(prescription, 6)!;

    expect(prescriptionTotals(scaled).distance / 1609.344).toBeCloseTo(6);
    expect(scaled.blocks[0]).toMatchObject({ role: "warmup", notes: "Easy" });
    expect(scaled.blocks[1]).toMatchObject({ kind: "repeat", repetitions: 2 });
  });
});
