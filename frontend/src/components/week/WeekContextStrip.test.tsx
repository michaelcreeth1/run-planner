import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WeekContextStrip } from "./WeekContextStrip";

describe("WeekContextStrip", () => {
  it("takes a surfaced workout back to the current week", async () => {
    const user = userEvent.setup();
    const onJumpToToday = vi.fn();

    render(
      <WeekContextStrip
        onJumpToToday={onJumpToToday}
        onOpenPlan={vi.fn()}
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

    await user.click(screen.getByRole("button", { name: /Show next up's Long run/i }));

    expect(onJumpToToday).toHaveBeenCalledOnce();
  });
});
