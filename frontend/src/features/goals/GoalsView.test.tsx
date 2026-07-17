import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../test/server";
import { GoalsView } from "./GoalsView";
import { ProfileProvider } from "../../lib/profile";

vi.mock("./DefaultGoalsCard", () => ({
  DefaultGoalsCard: () => <div>Weekly defaults</div>
}));

vi.mock("./GoalImpactSection", () => ({
  GoalImpactSection: () => <div>Goal impact</div>
}));

const apiUrl = (path: string) => new URL(path, window.location.origin).toString();

describe("GoalsView race management", () => {
  it("creates a race without leaving Goals & Races", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    server.use(
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([])),
      http.post(apiUrl("/api/goal-races"), async ({ request }) => {
        const payload = await request.json() as Record<string, unknown>;
        onCreate(payload);
        return HttpResponse.json(
          {
            id: "race-1",
            athleteAccountId: "profile-1",
            ...payload,
            targetPaceSecondsPerMile: 480,
            createdAt: "2026-07-13T12:00:00Z",
            updatedAt: "2026-07-13T12:00:00Z"
          },
          { status: 201 }
        );
      })
    );

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProfileProvider profileId="profile-1">
          <GoalsView writesBlocked={false} onSelectWeek={vi.fn()} />
        </ProfileProvider>
      </QueryClientProvider>
    );

    await screen.findByText("No races yet");
    await user.click(screen.getByRole("button", { name: "Add race" }));
    expect(screen.getByRole("button", { name: "Create race" })).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(screen.getByLabelText("Race date")).toHaveValue("");

    await user.type(screen.getByLabelText("Name"), "Boulder Half");
    await user.type(screen.getByLabelText("Race date"), "2026-10-04");
    await user.type(screen.getByLabelText("Target time"), "1:40:00");
    await user.click(screen.getByRole("button", { name: "Create race" }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Boulder Half",
        raceDate: "2026-10-04",
        distance: "half_marathon",
        targetTime: 6000
      })
    );
    expect(await screen.findByText("Boulder Half was created.")).toBeVisible();
    expect(screen.getByText("Boulder Half")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Goals & races" })).toBeVisible();
  });
});
