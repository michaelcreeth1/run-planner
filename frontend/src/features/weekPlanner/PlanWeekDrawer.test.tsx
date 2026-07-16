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

    expect(screen.getByText("1 needs attention")).toBeInTheDocument();
    expect(screen.getByText("5 planned, target range 10-12")).toBeInTheDocument();
    expect(screen.getByText(/rules are advisory and never prevent you from saving/i)).toBeInTheDocument();

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

  it("uses compact direction controls and labels the outcome-oriented rebalance option", () => {
    render(<PlannerHarness onSave={vi.fn()} />);

    expect(screen.getByLabelText("Starting point")).toHaveValue("blank");
    expect(screen.getByRole("option", { name: "Rebalance remaining days" })).toBeInTheDocument();
    expect(screen.queryByText("Smart adjustment")).not.toBeInTheDocument();
    expect(screen.getByText("Week direction")).toBeInTheDocument();
  });

  it("keeps session names in sync with the selected type until renamed", async () => {
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
    expect(screen.queryByRole("button", { name: "Rest" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Mon session 1 type"), "run:threshold");
    expect(screen.getByLabelText("Mon session 1 name")).toHaveValue("Threshold workout");

    const nameInput = screen.getByLabelText("Mon session 2 name");
    await user.clear(nameInput);
    await user.type(nameInput, "Gym work");
    await user.selectOptions(screen.getByLabelText("Mon session 2 type"), "run:easy");

    expect(nameInput).toHaveValue("Gym work");
    expect(screen.getByLabelText("Mon session 2 mileage")).toHaveValue(null);

    await user.click(screen.getByRole("button", { name: "Remove Mon session 2" }));

    expect(screen.queryByDisplayValue("Gym work")).not.toBeInTheDocument();
  });

  it("adds sessions from the day heading and removes them with the inline control", async () => {
    const user = userEvent.setup();
    render(<PlannerHarness onSave={vi.fn()} />);

    expect(screen.queryByText("Add session")).not.toBeInTheDocument();
    expect(screen.queryByText("Set rest day")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add session to Tue" }));

    expect(screen.getByLabelText("Tue session 1 name")).toHaveValue("Easy run");
    expect(screen.getByLabelText("Tue session 1 type")).toHaveValue("run:easy");
    expect(screen.getByLabelText("Tue session 1 mileage")).toHaveValue(null);

    await user.click(screen.getByRole("button", { name: "Remove Tue session 1" }));

    expect(screen.queryByLabelText("Tue session 1 name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add session to Tue" })).toBeInTheDocument();
  });

  it("offers contextual fixes on the failing rule and clears them once met", async () => {
    const user = userEvent.setup();
    render(<PlannerHarness onSave={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Match schedule" }));

    expect(screen.getByLabelText("Mon session 1 mileage")).toHaveValue(10);
    expect(screen.getByText("All rules met")).toBeInTheDocument();
    expect(screen.queryByText("5 planned, target range 10-12")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update target" })).not.toBeInTheDocument();
  });

  it("can update a mismatched target from the current schedule", async () => {
    const user = userEvent.setup();
    render(<PlannerHarness onSave={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Update target" }));

    expect(screen.getByText("All rules met")).toBeInTheDocument();
  });

  it("shows every rule with its status baked in, guardrails included", async () => {
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

    expect(screen.getAllByText("Rules")).toHaveLength(1);
    expect(screen.queryByText("Targets")).not.toBeInTheDocument();
    expect(screen.queryByText("Guardrails")).not.toBeInTheDocument();
    expect(screen.getByText("Run 10 miles")).toBeInTheDocument();
    expect(screen.getByText("1 needs attention")).toBeInTheDocument();
    expect(screen.queryByText("No more than 2 hard days")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show all rules" }));

    expect(screen.getByText("No more than 2 hard days")).toBeVisible();
    expect(screen.getByRole("button", { name: "Hide passing rules" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Edit Mileage rule"));

    expect(screen.getByLabelText("Target mileage")).toHaveValue(10);
  });

  it("keeps an open rule visible after edits bring it back in line", async () => {
    const user = userEvent.setup();
    render(<PlannerHarness onSave={vi.fn()} />);

    await user.click(screen.getByLabelText("Edit Mileage rule"));
    const minimumInput = screen.getByLabelText("Minimum mileage");
    await user.clear(minimumInput);
    await user.type(minimumInput, "4");

    expect(screen.getByText("All rules met")).toBeInTheDocument();
    expect(screen.getByLabelText("Minimum mileage")).toHaveValue(4);

    await user.click(screen.getByLabelText("Edit Mileage rule"));

    expect(screen.queryByText("Run 10 miles")).not.toBeInTheDocument();
  });

  it("keeps live schedule totals and the load suggestion in the footer", () => {
    render(<PlannerHarness onSave={vi.fn()} />);

    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.getByText("Suggested")).toBeInTheDocument();
    expect(screen.getByText("1 session · 0 hard")).toBeInTheDocument();
    expect(screen.getByText("prior 5 mi")).toBeInTheDocument();
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
