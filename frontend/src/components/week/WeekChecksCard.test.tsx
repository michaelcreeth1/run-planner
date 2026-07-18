import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RuleEvaluation } from "../../features/goals/ruleEvaluation";
import { selectVisibleWeekChecks, WeekCheckRow } from "./WeekChecksCard";

function evaluation(status: RuleEvaluation["status"], ruleId: string = status): RuleEvaluation {
  return {
    ruleId,
    ruleLabel: ruleId,
    weekId: "week-1",
    weekStartDate: "2026-07-13",
    weekEndDate: "2026-07-19",
    status,
    reason: `${ruleId} reason`,
    relatedWorkoutIds: []
  };
}

describe("selectVisibleWeekChecks", () => {
  it("shows passed checks when there are no exceptions", () => {
    const evaluations = [evaluation("pass", "rest-days"), evaluation("pass", "hard-days")];

    expect(selectVisibleWeekChecks(evaluations)).toEqual(evaluations);
  });

  it("keeps an exception-focused list when attention is needed", () => {
    const warning = evaluation("warning", "rest-days");

    expect(selectVisibleWeekChecks([evaluation("pass", "hard-days"), warning])).toEqual([warning]);
  });
});

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
