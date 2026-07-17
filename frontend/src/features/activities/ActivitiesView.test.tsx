import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActivitiesView } from "./ActivitiesView";

describe("ActivitiesView", () => {
  it("shows an actionable empty state without an empty table header", async () => {
    const user = userEvent.setup();
    const onOpenStravaSettings = vi.fn();

    render(
      <ActivitiesView
        activities={[]}
        onOpenStravaSettings={onOpenStravaSettings}
        onSelectWeek={vi.fn()}
      />
    );

    expect(screen.getByText("No activities yet")).toBeVisible();
    expect(screen.queryByText("Avg HR")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect Strava" }));

    expect(onOpenStravaSettings).toHaveBeenCalledOnce();
  });
});
