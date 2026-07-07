import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../auth';
import { localProvider } from './local';
import { makeRemoteProvider } from './remote';
import { DataProviderBoundary } from './context';
import type { DataProvider } from './types';

/**
 * Chooses the data provider from the auth session: guests get IndexedDB,
 * signed-in users get Supabase. Keyed on the user id (NOT the session
 * object — token refreshes would churn identity and remount the app).
 */
export function ProviderRoot({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const provider = useMemo<DataProvider>(
    () => (userId ? makeRemoteProvider(userId) : localProvider),
    [userId],
  );
  return (
    <DataProviderBoundary provider={provider} identity={userId ?? 'guest'}>
      {children}
    </DataProviderBoundary>
  );
}
