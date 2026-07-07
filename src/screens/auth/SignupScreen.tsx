import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import {
  authLabelStyle,
  authInputStyle,
  authButtonStyle,
  authErrorStyle,
  NotConfiguredNote,
} from './LoginScreen';

const GOLD = '#d4af37';
const MUTED = '#b7ad98';

// Owned by the accounts workstream (Stream A).
export default function SignupScreen() {
  const { configured, session, signUp } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Signed in (auto-confirm signups create a session immediately) — go home.
  useEffect(() => {
    if (session) navigate('/');
  }, [session, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await signUp(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
    else setSubmitted(true); // session effect handles the redirect if auto-confirmed
  }

  return (
    <PageShell title="Create Account">
      {!configured ? (
        <NotConfiguredNote />
      ) : submitted && !session ? (
        // Email confirmation is on for this deployment: no session yet.
        <div style={{ maxWidth: 480 }}>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: '#e8e0d0' }}>
            Almost there — we sent a confirmation link to <strong>{email}</strong>. Follow it,
            then sign in.
          </p>
          <p style={{ fontSize: 14, color: MUTED }}>
            <Link href="/login" style={{ color: GOLD }}>
              Go to sign in →
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ maxWidth: 420 }}>
          <div style={{ marginBottom: 18 }}>
            <label htmlFor="signup-email" style={authLabelStyle}>
              EMAIL
            </label>
            <input
              id="signup-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={authInputStyle}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label htmlFor="signup-password" style={authLabelStyle}>
              PASSWORD
            </label>
            <input
              id="signup-password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={authInputStyle}
            />
          </div>
          <button type="submit" disabled={busy} style={{ ...authButtonStyle, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'CREATING…' : 'CREATE ACCOUNT →'}
          </button>
          {error && <p style={authErrorStyle}>{error}</p>}
          <p style={{ marginTop: 28, fontSize: 14, color: MUTED }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: GOLD }}>
              Sign in →
            </Link>
          </p>
        </form>
      )}
    </PageShell>
  );
}
