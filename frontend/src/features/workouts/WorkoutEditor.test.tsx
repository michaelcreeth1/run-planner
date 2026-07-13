import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { defaultForm } from "../../lib/forms";
import type { WorkoutForm } from "../../types/domain";
import { WorkoutEditor } from "./WorkoutEditor";

function EditorHarness({ onSave, onClose }: { onSave: (form: WorkoutForm) => void; onClose: () => void }) {
  const [editor, setEditor] = useState(() => defaultForm("2026-07-13"));
  return (
    <WorkoutEditor
      editor={editor}
      setEditor={setEditor}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(editor);
      }}
    />
  );
}

describe("WorkoutEditor", () => {
  it("edits and submits a complete workout", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<EditorHarness onSave={onSave} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Title"), "Tempo intervals");
    await user.selectOptions(screen.getByLabelText("Type"), "tempo");
    await user.selectOptions(screen.getByLabelText("Intensity"), "workout");
    await user.type(screen.getByLabelText("Miles"), "7.5");
    await user.type(screen.getByLabelText("Minutes"), "55");
    await user.type(screen.getByLabelText("Purpose"), "Threshold development");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Tempo intervals",
        workoutType: "tempo",
        intensityCategory: "workout",
        plannedDistance: "7.5",
        plannedDuration: "55",
        purpose: "Threshold development"
      })
    );
  });

  it("closes without submitting", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(<EditorHarness onSave={onSave} onClose={onClose} />);

    await user.click(screen.getByTitle("Close"));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});
