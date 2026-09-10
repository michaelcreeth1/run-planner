import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { defaultForm } from "../../lib/forms";
import type { WorkoutForm } from "../../types/domain";
import { WorkoutEditor } from "./WorkoutEditor";

function EditorHarness({
  error = null,
  isSaving = false,
  initialEditor,
  mode = "scheduled",
  onSave,
  onClose
}: {
  error?: string | null;
  isSaving?: boolean;
  initialEditor?: WorkoutForm;
  mode?: "scheduled" | "template";
  onSave: (form: WorkoutForm) => void;
  onClose: () => void;
}) {
  const [editor, setEditor] = useState(() => initialEditor ?? defaultForm("2026-07-13"));
  return (
    <WorkoutEditor
      editor={editor}
      error={error}
      isSaving={isSaving}
      mode={mode}
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
    await user.click(screen.getByRole("button", { name: /More options/ }));
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

  it("does not add helper clutter beneath the workout name", () => {
    render(<EditorHarness mode="template" onSave={vi.fn()} onClose={vi.fn()} />);

    expect(screen.queryByText("Use a short, searchable name.")).not.toBeInTheDocument();
  });

  it("calculates pace from miles and time", async () => {
    const user = userEvent.setup();
    render(<EditorHarness onSave={vi.fn()} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Miles"), "6");
    await user.type(screen.getByLabelText("Time (H:MM:SS)"), "0:48:00");

    expect(screen.getByText("8:00/mi")).toBeVisible();
    expect(screen.queryByLabelText("Pace (/mi)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /More options/ }));
    expect(screen.getByLabelText("Pace (/mi)")).toHaveValue("8:00");
  });

  it("calculates time from miles and pace", async () => {
    const user = userEvent.setup();
    render(<EditorHarness onSave={vi.fn()} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Miles"), "5");
    await user.click(screen.getByRole("button", { name: /More options/ }));
    await user.type(screen.getByLabelText("Pace (/mi)"), "8:30");

    expect(screen.getByLabelText("Time (H:MM:SS)")).toHaveValue("0:42:30");
  });

  it("calculates miles from time and pace", async () => {
    const user = userEvent.setup();
    render(<EditorHarness onSave={vi.fn()} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Time (H:MM:SS)"), "0:45:00");
    await user.click(screen.getByRole("button", { name: /More options/ }));
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

  it("keeps a migrated one-step prescription compact until the runner edits it", async () => {
    const user = userEvent.setup();
    render(
      <EditorHarness
        initialEditor={{
          ...defaultForm("2026-07-13"),
          id: "workout-1",
          title: "Easy 10",
          plannedDistance: "10",
          prescription: {
            blocks: [
              {
                kind: "step",
                role: "other",
                extent: "distance",
                distanceMeters: 16093.44,
                displayUnit: "mi",
                supportingTargets: [],
                notes: ""
              }
            ]
          }
        }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText("1 segment")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Segment 1 role")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /More options/ }));

    expect(screen.getByText("1 segment")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Segment 1 role")).toBeVisible();
    expect(screen.getByRole("button", { name: "Use simple workout" })).toBeVisible();
  });

  it("shows repeat children, supports nested groups, and omits final-recovery controls", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditorHarness
        initialEditor={{
          ...defaultForm("2026-07-13"),
          prescription: {
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
                  displayUnit: "km",
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
          }
        }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: "Workout editor" })).toHaveClass("workout-editor-panel");
    expect(screen.queryByLabelText("Miles")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Time (H:MM:SS)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pace (/mi)")).not.toBeInTheDocument();
    const totals = screen.getByRole("region", { name: "Totals from workout structure" });
    expect(within(totals).getByText("~3.09 mi")).toBeVisible();
    expect(within(totals).getByText("~0:28:22")).toBeVisible();
    expect(within(totals).getAllByText("Estimated")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /More options/ }));
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText("Repeat these")).toBeVisible();
    const repetitions = screen.getByLabelText("Repeat set 1 repetitions");
    expect(repetitions).toHaveValue(4);
    expect(repetitions.closest(".workout-repeat__badge")).not.toBeNull();
    expect(screen.queryByText("Repetitions")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Segment 1.1 role")).toHaveValue("work");
    expect(screen.getByLabelText("Segment 1.2 role")).toHaveValue("recovery");
    expect(screen.queryByText("Include recovery after final repetition")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add repeat set inside" }));
    expect(screen.getByLabelText("Repeat set 1.3 repetitions")).toHaveValue(5);
    expect(screen.getByLabelText("Segment 1.3.1 role")).toHaveValue("work");
    await user.selectOptions(screen.getByLabelText("Segment 1.3.1 role"), "cooldown");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      prescription: expect.objectContaining({
        blocks: [expect.objectContaining({
          kind: "repeat",
          steps: expect.arrayContaining([
            expect.objectContaining({
              kind: "repeat",
              recoveryAfterFinal: false,
              steps: expect.arrayContaining([expect.objectContaining({ role: "cooldown" })])
            })
          ])
        })]
      })
    }));
  });
});
