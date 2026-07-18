import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RuleEvaluation } from "../../features/goals/ruleEvaluation";
import { WeekCheckRow } from "./WeekChecksCard";

describe("WeekCheckRow", () => {
  it("uses the full warning row as the fix target", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const evaluation: RuleEvaluation = {
      ruleId: "rest-days",
      ruleLabel: "Rest days",
      weekId: "week-1",
      weekStartDate: "2026-07-13",
      weekEndDate: "2026-07-19",
      status: "warning",
      reason: "Only one rest day is planned.",
      relatedWorkoutIds: []
    };

    render(<ul><WeekCheckRow evaluation={evaluation} onOpen={onOpen} /></ul>);

    const rowAction = screen.getByRole("button", { name: 'Fix "Rest days" in this week' });
    expect(rowAction).toHaveTextContent("Only one rest day is planned.");
    expect(rowAction).toHaveTextContent("Fix");
    await user.click(screen.getByText("Only one rest day is planned."));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
