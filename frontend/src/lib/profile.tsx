import { ProfileContext } from "./profileContext";

export function ProfileProvider({ profileId, children }: { profileId: string; children: React.ReactNode }) {
  return <ProfileContext.Provider value={profileId}>{children}</ProfileContext.Provider>;
}
