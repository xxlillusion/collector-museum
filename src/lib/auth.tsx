import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';

export type AccountType = 'collector' | 'vendor';

export interface SignUpOptions {
  displayName?: string;
  /** Stored in auth metadata; the signup trigger creates the profile row
   *  (and, for vendors, the canonical vendor row) from it. */
  accountType?: AccountType;
}

export interface AuthState {
  /** False = no Supabase env configured; auth UI should not render. */
  configured: boolean;
  session: Session | null;
  /** True until the initial session restore resolves. */
  loading: boolean;
  /** True while the session came from a password-recovery link — the
   *  /reset-password screen shows the new-password form. Session-scoped
   *  (recovery links only produce the event in the tab that opened them). */
  passwordRecovery: boolean;
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  signUp(email: string, password: string, opts?: SignUpOptions): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
  /** Sends the recovery email; the link lands on /reset-password. */
  resetPassword(email: string): Promise<{ error: string | null }>;
  /** Sets a new password for the current session (normal or recovery). */
  updatePassword(newPassword: string): Promise<{ error: string | null }>;
}

const notConfigured = { error: 'Accounts are not configured on this deployment.' };

const noAuth: AuthState = {
  configured: false,
  session: null,
  loading: false,
  passwordRecovery: false,
  signIn: async () => notConfigured,
  signUp: async () => notConfigured,
  signOut: async () => {},
  resetPassword: async () => notConfigured,
  updatePassword: async () => notConfigured,
};

const AuthContext = createContext<AuthState>(noAuth);

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(() => {
    if (!supabase) return noAuth;
    return {
      configured: true,
      session,
      loading,
      passwordRecovery,
      signIn: async (email, password) => {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signUp: async (email, password, opts) => {
        const { error } = await supabase!.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: opts?.displayName ?? '',
              account_type: opts?.accountType ?? 'collector',
            },
          },
        });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await supabase!.auth.signOut();
      },
      resetPassword: async (email) => {
        const { error } = await supabase!.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        return { error: error?.message ?? null };
      },
      updatePassword: async (newPassword) => {
        const { error } = await supabase!.auth.updateUser({ password: newPassword });
        if (!error) setPasswordRecovery(false);
        return { error: error?.message ?? null };
      },
    };
  }, [session, loading, passwordRecovery]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
