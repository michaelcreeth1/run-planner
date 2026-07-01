import { LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AthleteProfile, SessionUser } from "../types/domain";

export function AppHeader({
  activeProfile,
  isSwitchingProfile,
  profiles,
  user,
  onLogout,
  onOpenSettings,
  onSwitchProfile
}: {
  activeProfile: AthleteProfile | null;
  isSwitchingProfile: boolean;
  profiles: AthleteProfile[];
  user: SessionUser | null;
  onLogout: () => void;
  onOpenSettings: () => void;
  onSwitchProfile: (athleteAccountId: string) => void;
}) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountName = user?.displayName ?? user?.username ?? "Account";

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAccountMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  return (
    <header className="app-header">
      <div className="app-header-actions">
        <div className="account-menu" ref={accountMenuRef}>
          <button
            type="button"
            className="account-menu-trigger"
            title={accountName}
            aria-label="Open account menu"
            aria-haspopup="menu"
            aria-expanded={isAccountMenuOpen}
            onClick={() => setIsAccountMenuOpen((current) => !current)}
          >
            <span>{accountInitials(accountName)}</span>
          </button>
          {isAccountMenuOpen ? (
            <div className="account-menu-panel" role="menu">
              <div className="account-menu-identity">
                <span className="account-avatar">{accountInitials(accountName)}</span>
                <div>
                  <strong>{accountName}</strong>
                  <span>{user?.isAdmin ? "Admin" : user?.username}</span>
                </div>
              </div>
              <label className="account-menu-profile">
                <span>Profile</span>
                <select
                  value={activeProfile?.id ?? ""}
                  disabled={isSwitchingProfile || profiles.length === 0}
                  onChange={(event) => onSwitchProfile(event.target.value)}
                >
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="account-menu-item"
                role="menuitem"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  onOpenSettings();
                }}
              >
                <Settings size={17} />
                <span>Settings</span>
              </button>
              <button
                type="button"
                className="account-menu-item"
                role="menuitem"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  onLogout();
                }}
              >
                <LogOut size={17} />
                <span>Log out</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function accountInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "A";
}
