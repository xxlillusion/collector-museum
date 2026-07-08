import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import {
  authLabelStyle,
  authInputStyle,
  authButtonStyle,
  authErrorStyle,
  NotConfiguredNote,
} from './LoginScreen';
import { GOLD, TEXT, SERIF, panelStyle, noteStyle } from '../../components/museumKit';

/** Password-recovery landing (reset-email links). Owned by Stream A. */
export default function ResetPasswordScreen() {
  const { configured, session, loading, passwordRecovery, updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // A recovery link produces a session in this tab (PASSWORD_RECOVERY event);
  // a normally signed-in user may also land here — both can set a password.
  const canReset = passwordRecovery || Boolean(session);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await updatePassword(password);
      if (err) setError(err);
      else setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell title="Reset Password" eyebrow="MEMBERS">
      {!configured ? (
        <NotConfiguredNote />
      ) : loading ? null : done ? (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: TEXT, fontFamily: SERIF }}>
            Your password has been updated.
          </p>
          <p style={{ ...noteStyle, fontSize: 14 }}>
            <Link href="/account" style={{ color: GOLD }}>
              Go to my account →
            </Link>
          </p>
        </div>
      ) : canReset ? (
        <div style={{ maxWidth: 440, margin: '0 auto' }}>
          <div style={{ ...panelStyle, marginBottom: 0 }}>
            <form onSubmit={onSubmit}>
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="reset-new-password" style={authLabelStyle}>
                  NEW PASSWORD
                </label>
                <input
                  id="reset-new-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={authInputStyle}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label htmlFor="reset-confirm-password" style={authLabelStyle}>
                  CONFIRM NEW PASSWORD
                </label>
                <input
                  id="reset-confirm-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  style={authInputStyle}
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                style={{ ...authButtonStyle, width: '100%', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'UPDATING…' : 'UPDATE PASSWORD →'}
              </button>
              {error && <p style={authErrorStyle}>{error}</p>}
            </form>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <p style={{ ...noteStyle, fontSize: 17, lineHeight: 1.7 }}>
            Open the link from your password-reset email to set a new password.
          </p>
          <p style={{ ...noteStyle, fontSize: 14 }}>
            <Link href="/login" style={{ color: GOLD }}>
              Back to sign in →
            </Link>
          </p>
        </div>
      )}
    </PageShell>
  );
}
