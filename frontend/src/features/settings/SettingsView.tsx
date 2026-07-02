import { Link, Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { StatusBanner } from "../../components/shared/StatusBanner";
import { API_BASE_URL, fetchJson } from "../../lib/api";
import type { AdminUserForm, ApiVersion, AthleteProfile, ProfileForm, SessionStatus, SessionUser, StravaStatus, SyncJob } from "../../types/domain";

export function SettingsView({
  apiVersion,
  stravaStatus,
  session,
  isSyncing,
  lastSyncJob,
  onBackfill,
  onRefreshActivities,
  onRefreshStatus,
  onRefreshSession,
  writesBlocked,
  frontendVersion
}: {
  apiVersion: ApiVersion | null;
  stravaStatus: StravaStatus | null;
  session: SessionStatus;
  isSyncing: boolean;
  lastSyncJob: SyncJob | null;
  onBackfill: () => void;
  onRefreshActivities: () => void;
  onRefreshStatus: () => void;
  onRefreshSession: () => void;
  writesBlocked: boolean;
  frontendVersion: string;
}) {
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    displayName: "",
    timezone: "America/Denver"
  });
  const [userForm, setUserForm] = useState<AdminUserForm>({
    username: "",
    displayName: "",
    password: "",
    initialProfileName: "",
    timezone: "America/Denver",
    isAdmin: false
  });
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isDisconnectingStrava, setIsDisconnectingStrava] = useState(false);

  function blockSettingsWrite(action: string) {
    if (!writesBlocked) {
      return false;
    }
    setSettingsMessage(null);
    setSettingsError(`Reload required before ${action}.`);
    return true;
  }

  function connectStrava() {
    if (blockSettingsWrite("connecting Strava")) {
      return;
    }
    window.location.href = `${API_BASE_URL}/api/auth/strava/start`;
  }

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsError(null);
    if (blockSettingsWrite("creating a profile")) {
      return;
    }
    try {
      await fetchJson<AthleteProfile>("/api/auth/profiles", {
        method: "POST",
        body: JSON.stringify(profileForm)
      });
      setProfileForm({ displayName: "", timezone: "America/Denver" });
      setSettingsMessage("Profile created.");
      onRefreshSession();
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Could not create profile.");
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsError(null);
    if (blockSettingsWrite("creating a user")) {
      return;
    }
    try {
      await fetchJson<SessionUser>("/api/auth/users", {
        method: "POST",
        body: JSON.stringify(userForm)
      });
      setUserForm({
        username: "",
        displayName: "",
        password: "",
        initialProfileName: "",
        timezone: "America/Denver",
        isAdmin: false
      });
      setSettingsMessage("User created.");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Could not create user.");
    }
  }

  async function disconnectStrava() {
    setSettingsError(null);
    if (blockSettingsWrite("disconnecting Strava")) {
      return;
    }
    setIsDisconnectingStrava(true);
    try {
      await fetchJson<{ status: string }>("/api/auth/strava/disconnect", {
        method: "POST"
      });
      setSettingsMessage("Strava disconnected. Connect again to refresh stored tokens.");
      onRefreshStatus();
      onRefreshActivities();
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Could not disconnect Strava.");
    } finally {
      setIsDisconnectingStrava(false);
    }
  }

  return (
    <section className="settings-view">
      {settingsError ? (
        <StatusBanner tone="danger" icon={<ShieldAlert size={18} />} title="Settings error" detail={settingsError} />
      ) : null}
      {settingsMessage ? (
        <div className="settings-note">{settingsMessage}</div>
      ) : null}

      <section className="settings-card">
        <header className="settings-card-header">
          <div>
            <h2>Strava</h2>
            <p>Connection and activity sync</p>
          </div>
          <span className={`settings-pill ${stravaStatus?.connected ? "settings-pill--success" : "settings-pill--neutral"}`}>
            {stravaStatus?.connected ? "Connected" : "Not connected"}
          </span>
        </header>
        <div className="settings-kv">
          <div className="settings-kv-row">
            <span>Athlete</span>
            <strong>{stravaStatus?.connected ? stravaStatus.athleteName ?? "Connected" : "—"}</strong>
          </div>
          <div className="settings-kv-row">
            <span>Granted scopes</span>
            <strong>{stravaStatus?.grantedScopes.length ? stravaStatus.grantedScopes.join(", ") : "none"}</strong>
          </div>
        </div>
        {stravaStatus?.message ? (
          <div className="settings-note">{stravaStatus.message}</div>
        ) : null}
        <div className="settings-actions">
          <button
            className="primary"
            disabled={!stravaStatus?.connected || isSyncing || writesBlocked}
            type="button"
            onClick={onBackfill}
          >
            <RefreshCw size={16} />
            <span>{isSyncing ? "Syncing" : "Backfill 180 days"}</span>
          </button>
          <button type="button" disabled={writesBlocked} onClick={connectStrava}>
            <Link size={16} />
            <span>{stravaStatus?.connected ? "Reconnect Strava" : "Connect Strava"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onRefreshStatus();
              onRefreshActivities();
            }}
          >
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
          <button
            className="danger"
            disabled={!stravaStatus?.connected || isDisconnectingStrava || writesBlocked}
            type="button"
            onClick={disconnectStrava}
          >
            <Trash2 size={16} />
            <span>{isDisconnectingStrava ? "Disconnecting" : "Disconnect"}</span>
          </button>
        </div>
        {lastSyncJob ? (
          <div className="settings-note">
            Last sync {lastSyncJob.status}: {lastSyncJob.activitiesFetched} fetched,{" "}
            {lastSyncJob.activitiesCreated} created, {lastSyncJob.activitiesUpdated} updated
          </div>
        ) : null}
      </section>

      <section className="settings-card">
        <header className="settings-card-header">
          <div>
            <h2>About</h2>
            <p>Component versions</p>
          </div>
        </header>
        <div className="settings-kv">
          <div className="settings-kv-row">
            <span>Frontend</span>
            <strong>{frontendVersion}</strong>
          </div>
          <div className="settings-kv-row">
            <span>Backend</span>
            <strong>{apiVersion?.backendVersion ?? "unknown"}</strong>
          </div>
          <div className="settings-kv-row">
            <span>Schema</span>
            <strong>{apiVersion?.schemaVersion ?? "unknown"}</strong>
          </div>
          <div className="settings-kv-row">
            <span>AI</span>
            <strong>Stub</strong>
          </div>
        </div>
      </section>

      <form className="settings-card settings-form" onSubmit={createProfile}>
        <header className="settings-card-header">
          <div>
            <h2>Add profile</h2>
            <p>Create another athlete profile under this account</p>
          </div>
        </header>
        <div className="form-grid">
          <label>
            <span>Profile name</span>
            <input
              value={profileForm.displayName}
              onChange={(event) => setProfileForm((current) => ({ ...current, displayName: event.target.value }))}
            />
          </label>
          <label>
            <span>Timezone</span>
            <input
              value={profileForm.timezone}
              onChange={(event) => setProfileForm((current) => ({ ...current, timezone: event.target.value }))}
            />
          </label>
        </div>
        <button className="primary" type="submit" disabled={writesBlocked}>
          <Plus size={17} />
          <span>Add profile</span>
        </button>
      </form>
      {session.user?.isAdmin ? (
        <form className="settings-card settings-form" onSubmit={createUser}>
          <header className="settings-card-header">
            <div>
              <h2>Create user</h2>
              <p>Add a new account with its own login</p>
            </div>
          </header>
          <div className="form-grid form-grid--three">
            <label>
              <span>Username</span>
              <input
                value={userForm.username}
                autoComplete="off"
                onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))}
              />
            </label>
            <label>
              <span>Display name</span>
              <input
                value={userForm.displayName}
                onChange={(event) => setUserForm((current) => ({ ...current, displayName: event.target.value }))}
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                value={userForm.password}
                autoComplete="new-password"
                onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              <span>Initial profile</span>
              <input
                value={userForm.initialProfileName}
                onChange={(event) => setUserForm((current) => ({ ...current, initialProfileName: event.target.value }))}
              />
            </label>
            <label>
              <span>Timezone</span>
              <input
                value={userForm.timezone}
                onChange={(event) => setUserForm((current) => ({ ...current, timezone: event.target.value }))}
              />
            </label>
          </div>
          <label className="checkbox-row">
            <input
              checked={userForm.isAdmin}
              type="checkbox"
              onChange={(event) => setUserForm((current) => ({ ...current, isAdmin: event.target.checked }))}
            />
            <span>Admin</span>
          </label>
          <button className="primary" type="submit" disabled={writesBlocked}>
            <Plus size={17} />
            <span>Create user</span>
          </button>
        </form>
      ) : null}
    </section>
  );
}
