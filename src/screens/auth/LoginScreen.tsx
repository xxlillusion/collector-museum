import { useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import {
  GOLD, HAIRLINE, MUTED, SERIF,
  labelStyle, inputStyle, primaryButtonStyle, errorTextStyle,
  panelStyle, noteStyle,
} from '../../components/museumKit';

// ---- shared auth styles (imported by SignupScreen / ResetPasswordScreen) ----
// These now re-point at the museum kit so every auth form shares one aesthetic.
// Do not remove or rename — other screens depend on these exports.

export const authLabelStyle: CSSProperties = { ...labelStyle };

export const authInputStyle: CSSProperties = { ...inputStyle, outline: 'none' };

export const authButtonStyle: CSSProperties = { ...primaryButtonStyle };

export const authErrorStyle: CSSProperties = {
  ...errorTextStyle,
  margin: '14px 0 0',
  padding: '10px 14px',
  border: '1px solid rgba(200,80,60,0.45)',
  borderRadius: 2,
};

/** Muted italic-serif footnote with a gold link — shared visual for auth pages. */
const authFootnoteStyle: CSSProperties = {
  marginTop: 26,
  fontSize: 14,
  color: MUTED,
  fontFamily: SERIF,
  fontStyle: 'italic',
  textAlign: 'center',
};

export function NotConfiguredNote() {
  return (
    <p style={{ ...noteStyle, fontSize: 17, lineHeight: 1.7 }}>
      Accounts are not configured on this deployment — the museum runs in guest mode, and
      everything you add is kept privately in this browser.{' '}
      <Link href="/" style={{ color: GOLD }}>
        Back to the museum →
      </Link>
    </p>
  );
}

// Owned by the accounts workstream (Stream A).
export default function LoginScreen() {
  const { configured, session, signIn, resetPassword } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ---- forgot-password (inline) ----
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Already signed in (or just signed in) — go home.
  useEffect(() => {
    if (session) navigate('/');
  }, [session, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await signIn(email.trim(), password);
      if (err) setError(err);
      else navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetBusy(true);
    try {
      const { error: err } = await resetPassword(resetEmail.trim());
      if (err) setResetError(err);
      else setResetSent(true);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <PageShell title="Sign In" eyebrow="MEMBERS">
      {!configured ? (
        <NotConfiguredNote />
      ) : (
        <div style={{ maxWidth: 440, margin: '0 auto' }}>
          <div style={{ ...panelStyle, marginBottom: 0 }}>
            <form onSubmit={onSubmit}>
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="login-email" style={authLabelStyle}>
                  EMAIL
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={authInputStyle}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <label htmlFor="login-password" style={authLabelStyle}>
                    PASSWORD
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotOpen((open) => !open);
                      if (!forgotOpen && !resetEmail) setResetEmail(email);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontFamily: SERIF,
                      fontStyle: 'italic',
                      fontSize: 12.5,
                      color: GOLD,
                      cursor: 'pointer',
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={authInputStyle}
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                style={{ ...authButtonStyle, width: '100%', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'SIGNING IN…' : 'SIGN IN →'}
              </button>
              {error && <p style={authErrorStyle}>{error}</p>}
            </form>

            {forgotOpen && (
              <div style={{ marginTop: 28, paddingTop: 22, borderTop: `1px solid ${HAIRLINE}` }}>
                {resetSent ? (
                  <p style={{ ...noteStyle, margin: 0, fontSize: 15 }}>
                    Check your email for a reset link.
                  </p>
                ) : (
                  <form onSubmit={onReset}>
                    <p style={{ ...noteStyle, margin: '0 0 14px', fontSize: 14 }}>
                      Enter your account email and we&rsquo;ll send you a link to set a new
                      password.
                    </p>
                    <div style={{ marginBottom: 16 }}>
                      <label htmlFor="reset-email" style={authLabelStyle}>
                        EMAIL
                      </label>
                      <input
                        id="reset-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        style={authInputStyle}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={resetBusy}
                      style={{ ...authButtonStyle, opacity: resetBusy ? 0.6 : 1 }}
                    >
                      {resetBusy ? 'SENDING…' : 'SEND RESET LINK →'}
                    </button>
                    {resetError && <p style={authErrorStyle}>{resetError}</p>}
                  </form>
                )}
              </div>
            )}
          </div>

          <p style={authFootnoteStyle}>
            New to the museum?{' '}
            <Link href="/signup" style={{ color: GOLD }}>
              Create an account →
            </Link>
          </p>
        </div>
      )}
    </PageShell>
  );
}
