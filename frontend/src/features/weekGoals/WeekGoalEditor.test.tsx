import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { defaultGoalForm } from "../../lib/forms";
import type { WeekGoalForm } from "../../types/domain";
import { WeekGoalEditor } from "./WeekGoalEditor";

function GoalHarness({ onSave }: { onSave: (form: WeekGoalForm) => void }) {
  const [editor, setEditor] = useState(() => defaultGoalForm("week-1"));
  return (
    <WeekGoalEditor
      editor={editor}
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
  it("edits goal rules and preserves enabled state", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<GoalHarness onSave={onSave} />);

    await user.selectOptions(screen.getByLabelText("Category"), "mileage");
    await user.type(screen.getByLabelText("Label"), "Weekly mileage");
    await user.type(screen.getByLabelText("Min"), "28");
    await user.type(screen.getByLabelText("Target"), "32");
    await user.selectOptions(screen.getByLabelText("Unit"), "mi");
    await user.selectOptions(screen.getByLabelText("Evaluation"), "at_least");
    await user.click(screen.getByLabelText("Enabled"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "mileage",
        label: "Weekly mileage",
        minAcceptable: "28",
        targetValue: "32",
        unit: "mi",
        evaluationMode: "at_least",
        isEnabled: false
      })
    );
  });
});
