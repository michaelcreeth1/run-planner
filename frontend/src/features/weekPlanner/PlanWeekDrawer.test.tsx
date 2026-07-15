import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlanWeekDraft } from "../../types/domain";
import { PlanWeekDrawer } from "./PlanWeekDrawer";

function PlannerHarness({
  initialDraft = mismatchedDraft(),
  onSave
}: {
  initialDraft?: PlanWeekDraft;
  onSave: (draft: PlanWeekDraft) => void;
}) {
  const [draft, setDraft] = useState<PlanWeekDraft | null>(() => initialDraft);

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

    expect(screen.getByText("1 exception to review")).toBeInTheDocument();
    expect(screen.getByText(/checks are advisory and never prevent you from saving/i)).toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: "Save changes" });
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

  it("uses compact direction controls and labels the outcome-oriented rebalance option", () => {
    render(<PlannerHarness onSave={vi.fn()} />);

    expect(screen.getByLabelText("Starting point")).toHaveValue("blank");
    expect(screen.getByRole("option", { name: "Rebalance remaining days" })).toBeInTheDocument();
    expect(screen.queryByText("Smart adjustment")).not.toBeInTheDocument();
    expect(screen.getByText("Week direction")).toBeInTheDocument();
  });

  it("edits session names and types with one scoped action menu per session", async () => {
    const user = userEvent.setup();
    const draft = mismatchedDraft();
    draft.workouts.push({
      ...draft.workouts[0],
      draftId: "workout-2",
      title: "Strength session",
      sport: "run",
      workoutType: "strength",
      intensityCategory: "strength",
      plannedDistance: "3"
    });
    render(<PlannerHarness initialDraft={draft} onSave={vi.fn()} />);

    expect(screen.getByLabelText("Mon session 1 mileage")).toHaveValue(5);
    expect(screen.getByLabelText("Mon session 2 type")).toHaveValue("strength:strength");
    expect(screen.queryByLabelText("Mon session 2 mileage")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Actions for Mon session 1")).toHaveAttribute("title", "Easy run actions");
    expect(screen.getByLabelText("Actions for Mon session 2")).toHaveAttribute("title", "Strength session actions");
    expect(screen.queryByRole("button", { name: "Rest" })).not.toBeInTheDocument();

    const nameInput = screen.getByLabelText("Mon session 2 name");
    await user.clear(nameInput);
    await user.type(nameInput, "Gym work");
    await user.selectOptions(screen.getByLabelText("Mon session 2 type"), "run:easy");

    expect(nameInput).toHaveValue("Gym work");
    expect(screen.getByLabelText("Mon session 2 mileage")).toHaveValue(null);

    await user.click(screen.getByLabelText("Actions for Mon session 2"));
    await user.click(screen.getByRole("button", { name: "Remove Mon session 2" }));

    expect(screen.queryByDisplayValue("Gym work")).not.toBeInTheDocument();
  });

  it("adds sessions from the day heading without persistent actions below the day", async () => {
    const user = userEvent.setup();
    render(<PlannerHarness onSave={vi.fn()} />);

    expect(screen.queryByText("Add session")).not.toBeInTheDocument();
    expect(screen.queryByText("Set rest day")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add session to Tue" }));

    expect(screen.getByLabelText("Tue session 1 name")).toHaveValue("Easy run");
    expect(screen.getByLabelText("Tue session 1 type")).toHaveValue("run:easy");
    expect(screen.getByLabelText("Tue session 1 mileage")).toHaveValue(null);
    expect(screen.getByLabelText("Actions for Tue session 1")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Actions for Tue session 1"));
    await user.click(screen.getByRole("button", { name: "Remove Tue session 1" }));

    expect(screen.queryByLabelText("Tue session 1 name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add session to Tue" })).toBeInTheDocument();
  });

  it("offers contextual fixes and hides passing checks", async () => {
    const user = userEvent.setup();
    render(<PlannerHarness onSave={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Match schedule to target" }));

    expect(screen.getByLabelText("Mon session 1 mileage")).toHaveValue(10);
    expect(screen.getByText("Everything lines up")).toBeInTheDocument();
    expect(screen.getByText("1 check passed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update target" })).not.toBeInTheDocument();
  });

  it("can update a mismatched target from the current schedule", async () => {
    const user = userEvent.setup();
    render(<PlannerHarness onSave={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Update target" }));

    expect(screen.getByText("Everything lines up")).toBeInTheDocument();
    expect(screen.getByText("1 check passed")).toBeInTheDocument();
  });

  it("keeps targets and expandable guardrails together in the review section", async () => {
    const user = userEvent.setup();
    const draft = mismatchedDraft();
    draft.goals.push({
      ...draft.goals[0],
      draftId: "guardrail-1",
      category: "quality",
      goalType: "guardrail",
      label: "No more than 2 hard days",
      targetValue: "2",
      minAcceptable: "",
      maxAcceptable: "2",
      unit: "days",
      evaluationMode: "at_most",
      priority: "guardrail"
    });
    render(<PlannerHarness initialDraft={draft} onSave={vi.fn()} />);

    expect(screen.queryByText("Rebalance schedule to direction")).not.toBeInTheDocument();
    expect(screen.getAllByText("Targets")).toHaveLength(1);
    expect(screen.getAllByText("Guardrails")).toHaveLength(1);

    await user.click(screen.getByText("Guardrails"));

    expect(screen.getByText("No more than 2 hard days")).toBeVisible();
    expect(screen.getByText("Hard days <= 2")).toBeVisible();
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
