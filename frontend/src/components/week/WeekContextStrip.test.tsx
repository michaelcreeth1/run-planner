import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WeekContextStrip } from "./WeekContextStrip";

describe("WeekContextStrip", () => {
  it("opens a surfaced workout directly", async () => {
    const user = userEvent.setup();
    const onJumpToToday = vi.fn();
    const onOpenWorkout = vi.fn();

    render(
      <WeekContextStrip
        onJumpToToday={onJumpToToday}
        onOpenPlan={vi.fn()}
        onOpenWorkout={onOpenWorkout}
        viewModel={{
          kind: "active",
          segments: [],
          today: {
            kind: "workout",
            label: "Next up",
            meta: "Saturday · 8 mi",
            status: "upcoming",
            title: "Long run",
            workoutId: "workout-2"
          }
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /Next up.*Long run/i }));

    expect(onOpenWorkout).toHaveBeenCalledWith("workout-2");
    expect(onJumpToToday).not.toHaveBeenCalled();
  });
});
