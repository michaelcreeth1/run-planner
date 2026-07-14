import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlanWeekDraft } from "../../types/domain";
import { PlanWeekDrawer } from "./PlanWeekDrawer";

function PlannerHarness({ onSave }: { onSave: (draft: PlanWeekDraft) => void }) {
  const [draft, setDraft] = useState<PlanWeekDraft | null>(() => mismatchedDraft());

  return draft ? (
    <PlanWeekDrawer
      draft={draft}
      isSaving={false}
      onClose={vi.fn()}
      onCompleteReview={vi.fn()}
      onSave={onSave}
      setDraft={setDraft}
      weekStack={{}}
    />
  ) : null;
}

describe("PlanWeekDrawer", () => {
  it("allows a plan to be saved when its schedule does not meet its goals", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<PlannerHarness onSave={onSave} />);

    expect(screen.getByText("1 mismatch")).toBeInTheDocument();
    expect(screen.getByText(/checks are advisory and never prevent you from saving/i)).toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: "Save plan" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ weekId: "week-target" }));
  });

  it("completes a past-week review without exposing or saving a plan draft", async () => {
    const user = userEvent.setup();
    const onCompleteReview = vi.fn();
    const onSave = vi.fn();
    render(
      <PlanWeekDrawer
        draft={{ ...mismatchedDraft(), weekState: "past" }}
        isSaving={false}
        onClose={vi.fn()}
        onCompleteReview={onCompleteReview}
        onSave={onSave}
        setDraft={vi.fn()}
        weekStack={{}}
      />
    );

    expect(screen.getByText(/review is read-only/i)).toBeInTheDocument();
    expect(screen.queryByText("Starting point")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Complete review" }));

    expect(onCompleteReview).toHaveBeenCalledWith("week-target");
    expect(onSave).not.toHaveBeenCalled();
  });
});

function mismatchedDraft(): PlanWeekDraft {
  return {
    weekId: "week-target",
    weekStartDate: "2026-07-13",
    weekEndDate: "2026-07-19",
    weekState: "future",
    startingPoint: "blank",
    purpose: "maintain",
    customPurpose: "",
    priorWeekStartDate: null,
    noPriorUsableWeek: false,
    load: {
      priorMileage: 5,
      suggestedMileage: 5,
      reason: "Maintain the current load."
    },
    workouts: [
      {
        draftId: "workout-1",
        plannedDate: "2026-07-13",
        title: "Easy run",
        sport: "run",
        workoutType: "easy",
        intensityCategory: "easy",
        plannedDistance: "5",
        plannedDuration: "",
        plannedPace: "",
        purpose: "Aerobic maintenance",
        instructions: "",
        notes: "",
        status: "planned"
      }
    ],
    goals: [
      {
        draftId: "goal-1",
        weekId: "week-target",
        category: "mileage",
        goalType: "achievement",
        label: "Run 10 miles",
        description: "",
        targetValue: "10",
        minAcceptable: "10",
        maxAcceptable: "12",
        unit: "mi",
        evaluationMode: "range",
        priority: "primary",
        status: "not_started",
        isEnabled: true,
        source: "manual",
        sourceLabel: "Edited"
      }
    ],
    hasExistingPlan: false
  };
}
