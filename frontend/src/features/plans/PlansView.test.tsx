import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { ProfileProvider } from "../../lib/profile";
import { server } from "../../test/server";
import { PlansView } from "./PlansView";

const apiUrl = (path: string) => new URL(path, window.location.origin).toString();

describe("PlansView", () => {
  it("shows which timeline phase is selected for editing", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    server.use(
      http.get(apiUrl("/api/plans"), () => HttpResponse.json([])),
      http.get(apiUrl("/api/goal-races"), () => HttpResponse.json([]))
    );

    render(
      <QueryClientProvider client={queryClient}>
        <ProfileProvider profileId="profile-1">
          <PlansView
            onPlanApplied={vi.fn()}
            onSelectPlan={vi.fn()}
            onSelectWeek={vi.fn()}
            requestedPlanId={null}
            writesBlocked={false}
          />
        </ProfileProvider>
      </QueryClientProvider>
    );

    await user.click(await screen.findByRole("button", { name: "Create training plan" }));

    const basePhase = screen.getByRole("button", { name: "Base phase" });
    const buildPhase = screen.getByRole("button", { name: "Build phase" });
    expect(basePhase).toHaveAttribute("aria-pressed", "true");
    expect(buildPhase).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Editing selected phase")).toBeVisible();

    await user.click(buildPhase);

    expect(basePhase).toHaveAttribute("aria-pressed", "false");
    expect(buildPhase).toHaveAttribute("aria-pressed", "true");
    const inspector = screen.getByText("Editing selected phase").closest("article");
    expect(inspector).not.toBeNull();
    expect(within(inspector!).getByText("Build", { selector: "strong" })).toBeVisible();
  });
});
