import { useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../components/themeKit';
import type { Theme } from '../../components/themeKit';
import { LcdDialog } from '../../components/lcdKit';

// ---- shared auth styles (imported by SignupScreen / ResetPasswordScreen) ----
// Functions of the active theme so every auth form restyles live with the
// theme switcher. Do not remove or rename — other screens depend on these.

export const authLabelStyle = (t: Theme): CSSProperties => ({ ...t.label });

export const authInputStyle = (t: Theme): CSSProperties => ({ ...t.input, outline: 'none' });

export const authButtonStyle = (t: Theme): CSSProperties => ({ ...t.primaryButton });

export const authErrorStyle = (t: Theme): CSSProperties =>
  t.id === 'handheld'
    ? // LCD: t.errorText already IS the inverted ink box — no red border,
      // no radius; render sites add the "! " prefix.
      { ...t.errorText, margin: '14px 0 0' }
    : {
        ...t.errorText,
        margin: '14px 0 0',
        padding: '10px 14px',
        border: '1px solid rgba(200,80,60,0.45)',
        borderRadius: 2,
      };

/** Muted commentary footnote with an accent link — shared visual for auth pages. */
const authFootnoteStyle = (t: Theme): CSSProperties => ({
  ...t.note,
  lineHeight: undefined,
  marginTop: 26,
  fontSize: t.id === 'handheld' ? 10 : 14,
  textAlign: 'center',
});

export function NotConfiguredNote() {
  const t = useTheme();
  if (t.id === 'handheld') {
    return (
      <LcdDialog cursor>
        Accounts are switched off on this machine! The museum runs in guest mode —
        everything you add is saved to this browser.{' '}
        <Link
          href="/"
          style={{ color: 'inherit', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          ▶ BACK TO THE MUSEUM
        </Link>
      </LcdDialog>
    );
  }
  return (
    <p style={{ ...t.note, fontSize: 17, lineHeight: 1.7 }}>
      Accounts are not configured on this deployment — the museum runs in guest mode, and
      everything you add is kept privately in this browser.{' '}
      <Link href="/" style={{ color: t.accent }}>
        Back to the museum →
      </Link>
    </p>
  );
}

// Owned by the accounts workstream (Stream A).
export default function LoginScreen() {
  const t = useTheme();
  const lcd = t.id === 'handheld';
  const aLabel = authLabelStyle(t);
  const aInput = authInputStyle(t);
  const aButton = authButtonStyle(t);
  const aError = authErrorStyle(t);
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
    <PageShell
      title={lcd ? 'CONTINUE' : 'Sign In'}
      eyebrow={lcd ? 'WELCOME BACK!' : 'MEMBERS'}
    >
      {!configured ? (
        <NotConfiguredNote />
      ) : (
        <div style={{ maxWidth: 440, margin: '0 auto' }}>
          <div style={{ ...t.panelStyle, marginBottom: 0 }}>
            <form onSubmit={onSubmit}>
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="login-email" style={aLabel}>
                  EMAIL
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={aInput}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <label htmlFor="login-password" style={aLabel}>
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
                      fontFamily: t.id === 'refined' ? t.fontDisplay : t.fontMono,
                      fontStyle: t.id === 'refined' ? 'italic' : 'normal',
                      fontSize: lcd ? 10 : 12.5,
                      color: lcd ? t.muted : t.accent,
                      ...(lcd ? { textTransform: 'uppercase' as const, letterSpacing: '0.06em' } : {}),
                      cursor: 'pointer',
                    }}
                  >
                    {lcd ? '▶ FORGOT PASSWORD?' : 'Forgot password?'}
                  </button>
                </div>
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={aInput}
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                style={{ ...aButton, width: '100%', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'SIGNING IN…' : lcd ? '▶ LOG IN' : 'SIGN IN →'}
              </button>
              {error && <p style={aError}>{lcd ? `! ${error}` : error}</p>}
            </form>

            {forgotOpen && (
              <div style={{ marginTop: 28, paddingTop: 22, borderTop: `${lcd ? 2 : 1}px solid ${t.border}` }}>
                {resetSent ? (
                  lcd ? (
                    <LcdDialog cursor>Check your mailbox! A reset link is on its way!</LcdDialog>
                  ) : (
                    <p style={{ ...t.note, margin: 0, fontSize: 15 }}>
                      Check your email for a reset link.
                    </p>
                  )
                ) : (
                  <form onSubmit={onReset}>
                    <p style={{ ...t.note, margin: '0 0 14px', fontSize: lcd ? 10 : 14 }}>
                      {lcd
                        ? 'Lost your password? We’ll send a link!'
                        : 'Enter your account email and we’ll send you a link to set a new password.'}
                    </p>
                    <div style={{ marginBottom: 16 }}>
                      <label htmlFor="reset-email" style={aLabel}>
                        EMAIL
                      </label>
                      <input
                        id="reset-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        style={aInput}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={resetBusy}
                      style={{ ...aButton, opacity: resetBusy ? 0.6 : 1 }}
                    >
                      {resetBusy ? 'SENDING…' : lcd ? '▶ SEND RESET LINK' : 'SEND RESET LINK →'}
                    </button>
                    {resetError && <p style={aError}>{lcd ? `! ${resetError}` : resetError}</p>}
                  </form>
                )}
              </div>
            )}
          </div>

          <p style={authFootnoteStyle(t)}>
            {lcd ? 'FIRST TIME HERE? ' : 'New to the museum? '}
            <Link
              href="/signup"
              style={{
                color: t.accent,
                ...(lcd ? { fontWeight: 700 as const, textDecoration: 'none' } : {}),
              }}
            >
              {lcd ? '▶ NEW GAME' : 'Create an account →'}
            </Link>
          </p>
        </div>
      )}
    </PageShell>
  );
}
