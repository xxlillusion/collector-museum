import { createContext, useContext, Fragment } from 'react';
import type { ReactNode } from 'react';
import type { DataProvider } from './types';
import { localProvider } from './local';

// Defaults to the local (guest) provider so the app works with no boundary
// mounted — and so anything rendered outside the boundary stays guest-safe.
const ProviderContext = createContext<DataProvider>(localProvider);

export function useProvider(): DataProvider {
  return useContext(ProviderContext);
}

/**
 * Mounts a provider and — critically — remounts the whole data-consuming
 * subtree whenever the identity changes (sign-in/out). Every hook re-runs its
 * load effect against the new provider and every existing object-URL cleanup
 * fires, exactly like a page refresh. No hook ever handles a mid-flight
 * provider swap.
 *
 * NOTE: React context does NOT cross the R3F <Canvas> root. Anything inside a
 * Canvas that needs data must receive it via props (see VendorScene's
 * fetchInventory).
 */
export function DataProviderBoundary({
  provider,
  identity,
  children,
}: {
  provider: DataProvider;
  /** Stable per-user key — e.g. supabase user id, or 'guest'. */
  identity: string;
  children: ReactNode;
}) {
  return (
    <ProviderContext.Provider value={provider}>
      <Fragment key={identity}>{children}</Fragment>
    </ProviderContext.Provider>
  );
}
