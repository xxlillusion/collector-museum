import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { getMyProfile } from './profileService';
import type { ProfileRecord } from './profileService';

/**
 * The signed-in user's profile row, for UI gating (vendor registry entry,
 * organizer tools). null while signed out / loading / on error — gates fail
 * closed. `loading` distinguishes "no profile" from "not loaded yet".
 */
export function useMyProfile(): { profile: ProfileRecord | null; loading: boolean } {
  const { configured, session } = useAuth();
  const userId = configured ? (session?.user.id ?? null) : null;
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMyProfile(userId)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { profile, loading };
}
