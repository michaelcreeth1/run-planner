import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../test/server";
import type { SessionStatus } from "../../types/domain";
import { SettingsView } from "./SettingsView";

const apiUrl = (path: string) => new URL(path, window.location.origin).toString();

describe("SettingsView", () => {
  it("prioritizes connecting Strava and keeps rare forms collapsed", async () => {
    const user = userEvent.setup();
    renderSettings();

    expect(screen.getByRole("button", { name: "Connect Strava" })).toHaveClass("primary");
    expect(screen.getByRole("button", { name: "Backfill 180 days" })).toBeDisabled();
    expect(screen.getByText(/connect strava before importing/i)).toBeVisible();
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Profile name")).not.toBeInTheDocument();
    expect(screen.queryByText("Stub")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add profile" }));
    expect(screen.getByLabelText("Profile name")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Create user" }));
    expect(screen.getByLabelText("Username")).toBeVisible();
  });

  it("updates and deletes inactive profiles", async () => {
    const user = userEvent.setup();
    const onRefreshSession = vi.fn();
    const updatePayload = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    server.use(
      http.patch(apiUrl("/api/auth/profiles/profile-2"), async ({ request }) => {
        const payload = await request.json() as Record<string, unknown>;
        updatePayload(payload);
        return HttpResponse.json({
          id: "profile-2",
          displayName: payload.displayName,
          timezone: payload.timezone,
          stravaAthleteId: null
        });
      }),
      http.delete(apiUrl("/api/auth/profiles/profile-2"), () => new HttpResponse(null, { status: 204 }))
    );
    renderSettings({ onRefreshSession });

    await user.click(screen.getByRole("button", { name: "Edit Trail runner" }));
    await user.clear(screen.getByLabelText("Profile name"));
    await user.type(screen.getByLabelText("Profile name"), "Mountain runner");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(updatePayload).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Mountain runner" }));
    expect(onRefreshSession).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Delete Trail runner" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(onRefreshSession).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });
});

function renderSettings(overrides: { onRefreshSession?: () => void } = {}) {
  const session: SessionStatus = {
    authenticated: true,
    configured: true,
    username: "michael",
    user: { id: "user-1", username: "michael", displayName: "Michael", isAdmin: true },
    activeAthleteAccountId: "profile-1",
    profiles: [
      { id: "profile-1", displayName: "Road runner", timezone: "America/Denver", stravaAthleteId: null },
      { id: "profile-2", displayName: "Trail runner", timezone: "America/Los_Angeles", stravaAthleteId: null }
    ]
  };
  return render(
    <SettingsView
      apiVersion={null}
      frontendVersion="0.1.1"
      isSyncing={false}
      lastSyncJob={null}
      onBackfill={vi.fn()}
      onRefreshActivities={vi.fn()}
      onRefreshSession={overrides.onRefreshSession ?? vi.fn()}
      onRefreshStatus={vi.fn()}
      session={session}
      stravaStatus={{
        connected: false,
        configured: true,
        athleteName: null,
        grantedScopes: [],
        expiresAt: null,
        message: ""
      }}
      writesBlocked={false}
    />
  );
}
