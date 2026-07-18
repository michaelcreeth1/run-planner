import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { defaultForm } from "../../lib/forms";
import type { WorkoutForm } from "../../types/domain";
import { WorkoutEditor } from "./WorkoutEditor";

function EditorHarness({
  error = null,
  isSaving = false,
  onSave,
  onClose
}: {
  error?: string | null;
  isSaving?: boolean;
  onSave: (form: WorkoutForm) => void;
  onClose: () => void;
}) {
  const [editor, setEditor] = useState(() => defaultForm("2026-07-13"));
  return (
    <WorkoutEditor
      editor={editor}
      error={error}
      isSaving={isSaving}
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
    await user.selectOptions(screen.getByLabelText("Session type"), "run:tempo");
    await user.type(screen.getByLabelText("Miles"), "7.5");
    await user.type(screen.getByLabelText("Time (H:MM:SS)"), "0:55:00");
    await user.type(screen.getByLabelText("Purpose"), "Threshold development");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Tempo intervals",
        workoutType: "tempo",
        intensityCategory: "workout",
        plannedDistance: "7.5",
        plannedDuration: "0:55:00",
        plannedPace: "7:20",
        purpose: "Threshold development"
      })
    );
  });

  it("derives the sport and intensity from one session type choice", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<EditorHarness onSave={onSave} onClose={vi.fn()} />);

    expect(screen.queryByLabelText("Intensity")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Session type"), "strength:strength");
    await user.type(screen.getByLabelText("Title"), "Gym session");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        sport: "strength",
        workoutType: "strength",
        intensityCategory: "strength"
      })
    );
  });

  it("allows a workout to be submitted without a custom title", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<EditorHarness onSave={onSave} onClose={vi.fn()} />);

    expect(screen.getByLabelText("Title")).not.toBeRequired();
    expect(screen.getByPlaceholderText("Easy run")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledOnce();
  });

  it("calculates pace from miles and time", async () => {
    const user = userEvent.setup();
    render(<EditorHarness onSave={vi.fn()} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Miles"), "6");
    await user.type(screen.getByLabelText("Time (H:MM:SS)"), "0:48:00");

    expect(screen.getByLabelText("Pace (/mi)")).toHaveValue("8:00");
  });

  it("calculates time from miles and pace", async () => {
    const user = userEvent.setup();
    render(<EditorHarness onSave={vi.fn()} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Miles"), "5");
    await user.type(screen.getByLabelText("Pace (/mi)"), "8:30");

    expect(screen.getByLabelText("Time (H:MM:SS)")).toHaveValue("0:42:30");
  });

  it("calculates miles from time and pace", async () => {
    const user = userEvent.setup();
    render(<EditorHarness onSave={vi.fn()} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Time (H:MM:SS)"), "0:45:00");
    await user.type(screen.getByLabelText("Pace (/mi)"), "9:00");

    expect(screen.getByLabelText("Miles")).toHaveValue(5);
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

  it("disables and relabels submit while saving and shows a save failure", () => {
    render(
      <EditorHarness
        error="Workout save failed."
        isSaving
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByTitle("Close")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Workout save failed.");
  });
});
