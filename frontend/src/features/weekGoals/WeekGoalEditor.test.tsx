import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { defaultGoalForm } from "../../lib/forms";
import type { GoalMetricDefinition, WeekGoalForm } from "../../types/domain";
import { WeekGoalEditor } from "./WeekGoalEditor";

const metrics: GoalMetricDefinition[] = [
  {
    key: "weekly_run_distance",
    label: "Weekly running distance",
    category: "mileage",
    unit: "mi",
    valueType: "decimal",
    operators: ["at_least", "at_most", "range", "exact-ish"],
    minimum: 0,
    maximum: null
  },
  {
    key: "rest_day_count",
    label: "Rest days",
    category: "recovery",
    unit: "days",
    valueType: "integer",
    operators: ["at_least", "exact-ish"],
    minimum: 0,
    maximum: 7
  }
];

function GoalHarness({
  error = null,
  isSaving = false,
  onSave
}: {
  error?: string | null;
  isSaving?: boolean;
  onSave: (form: WeekGoalForm) => void;
}) {
  const [editor, setEditor] = useState(() => defaultGoalForm("week-1"));
  return (
    <WeekGoalEditor
      editor={editor}
      error={error}
      isSaving={isSaving}
      metrics={metrics}
      setEditor={setEditor}
      onClose={vi.fn()}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(editor);
      }}
    />
  );
}

describe("WeekGoalEditor", () => {
  it("builds a week goal from metric, condition, and value", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<GoalHarness onSave={onSave} />);

    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enabled")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Priority")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Metric"), "weekly_run_distance");
    await user.type(screen.getByLabelText("Value"), "28");

    expect(screen.getAllByText("Run at least 28 miles").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        metricKey: "weekly_run_distance",
        category: "mileage",
        goalType: "achievement",
        label: "Run at least 28 miles",
        minAcceptable: "28",
        targetValue: "28",
        unit: "mi",
        evaluationMode: "at_least",
        priority: "secondary",
        status: "not_started",
        isEnabled: true
      })
    );
  });

  it("derives limits from the condition while allowing custom wording", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<GoalHarness onSave={onSave} />);

    await user.selectOptions(screen.getByLabelText("Metric"), "weekly_run_distance");
    await user.selectOptions(screen.getByLabelText("Condition"), "at_most");
    await user.type(screen.getByLabelText("Value"), "40");
    const label = screen.getByLabelText("Label");
    await user.clear(label);
    await user.type(label, "Cap this week at 40 miles");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        goalType: "guardrail",
        label: "Cap this week at 40 miles",
        maxAcceptable: "40",
        priority: "guardrail"
      })
    );
  });

  it("disables and relabels submit while saving and shows a save failure", () => {
    render(<GoalHarness error="Goal save failed." isSaving onSave={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByTitle("Close")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Goal save failed.");
  });
});
