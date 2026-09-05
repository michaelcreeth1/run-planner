import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlanningWorkspace } from "./PlanningWorkspace";

vi.mock("../plans/PlansView", () => ({
  PlansView: () => {
    const [draftName, setDraftName] = useState("");
    return <input aria-label="Plan draft name" value={draftName} onChange={(event) => setDraftName(event.target.value)} />;
  }
}));

vi.mock("../goals/GoalsView", () => ({ GoalsView: () => <div>Goal workspace</div> }));

function WorkspaceHarness() {
  const [section, setSection] = useState<"overview" | "goals">("overview");
  return (
    <PlanningWorkspace
      onChangeSection={setSection}
      onPlanApplied={vi.fn()}
      onSelectPlan={vi.fn()}
      onSelectWeek={vi.fn()}
      section={section}
      selectedPlanId={null}
      writesBlocked={false}
    />
  );
}

describe("PlanningWorkspace", () => {
  it("keeps an in-progress plan editor mounted while viewing goals", async () => {
    const user = userEvent.setup();
    render(<WorkspaceHarness />);

    await user.type(screen.getByLabelText("Plan draft name"), "Fall marathon plan");
    await user.click(screen.getByRole("button", { name: "Goals & races" }));
    expect(screen.getByText("Goal workspace")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Training plan" }));
    expect(screen.getByLabelText("Plan draft name")).toHaveValue("Fall marathon plan");
  });
});
