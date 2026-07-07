import { useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';

const GOLD = '#d4af37';
const HAIRLINE = 'rgba(212,175,55,0.28)';
const MUTED = '#b7ad98';

export const authLabelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  letterSpacing: '0.14em',
  color: MUTED,
  marginBottom: 6,
};

export const authInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#0d0b0a',
  color: '#e8e0d0',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 2,
  padding: '12px 14px',
  fontSize: 15,
  fontFamily: 'inherit',
  outline: 'none',
};

export const authButtonStyle: CSSProperties = {
  background: GOLD,
  color: '#1a1614',
  border: 'none',
  padding: '13px 40px',
  fontSize: 13,
  letterSpacing: '0.16em',
  fontFamily: 'inherit',
  cursor: 'pointer',
  borderRadius: 2,
};

export const authErrorStyle: CSSProperties = {
  margin: '14px 0 0',
  padding: '10px 14px',
  border: '1px solid rgba(200,80,60,0.45)',
  borderRadius: 2,
  color: '#e0967e',
  fontSize: 14,
};

export function NotConfiguredNote() {
  return (
    <p style={{ fontSize: 17, lineHeight: 1.7, color: MUTED, fontStyle: 'italic' }}>
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
    <PageShell title="Sign In">
      {!configured ? (
        <NotConfiguredNote />
      ) : (
        <div style={{ maxWidth: 420 }}>
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
                    fontFamily: 'inherit',
                    fontSize: 12,
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
            <button type="submit" disabled={busy} style={{ ...authButtonStyle, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'SIGNING IN…' : 'SIGN IN →'}
            </button>
            {error && <p style={authErrorStyle}>{error}</p>}
          </form>

          {forgotOpen && (
            <div style={{ marginTop: 28, paddingTop: 22, borderTop: `1px solid ${HAIRLINE}` }}>
              {resetSent ? (
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: '#e8e0d0' }}>
                  Check your email for a reset link.
                </p>
              ) : (
                <form onSubmit={onReset}>
                  <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.6, color: MUTED }}>
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

          <p style={{ marginTop: 28, fontSize: 14, color: MUTED }}>
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
