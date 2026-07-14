import { createContext, useContext } from "react";

export const ProfileContext = createContext<string | null>(null);

export function useProfileId() {
  const profileId = useContext(ProfileContext);
  if (!profileId) {
    throw new Error("Profile data was requested outside of an active profile.");
  }
  return profileId;
}
