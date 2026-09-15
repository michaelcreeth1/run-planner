import { describe, expect, it } from "vitest";
import type { WorkoutPrescription } from "../types/domain";
import { isStructuredPrescription, prescriptionTotals, scalePrescriptionDistance } from "./prescriptions";

describe("prescription totals", () => {
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
