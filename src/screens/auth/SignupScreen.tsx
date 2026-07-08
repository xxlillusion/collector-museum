import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import type { AccountType } from '../../lib/auth';
import {
  authLabelStyle,
  authInputStyle,
  authButtonStyle,
  authErrorStyle,
  NotConfiguredNote,
} from './LoginScreen';
import {
  GOLD, HAIRLINE, MUTED, TEXT, SERIF, PANEL,
  panelStyle, noteStyle,
} from '../../components/museumKit';

/** Selectable museum panel — hairline border, gold highlight when chosen. */
function TypeCard({
  selected,
  title,
  blurb,
  onSelect,
}: {
  selected: boolean;
  title: string;
  blurb: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="museum-lift"
      style={{
        flex: 1,
        textAlign: 'left',
        background: selected ? 'rgba(212,175,55,0.08)' : PANEL,
        border: `1px solid ${selected ? GOLD : HAIRLINE}`,
        borderRadius: 2,
        padding: '14px 16px',
        cursor: 'pointer',
        fontFamily: SERIF,
      }}
    >
      <span
        style={{
          display: 'block',
          fontSize: 13,
          letterSpacing: '0.18em',
          color: selected ? GOLD : TEXT,
          marginBottom: 6,
        }}
      >
        {title}
      </span>
      <span
        style={{
          display: 'block',
          fontSize: 13,
          lineHeight: 1.55,
          color: MUTED,
          fontStyle: 'italic',
        }}
      >
        {blurb}
      </span>
    </button>
  );
}

// Owned by the accounts workstream (Stream A).
export default function SignupScreen() {
  const { configured, session, signUp } = useAuth();
  const [, navigate] = useLocation();
  const [displayName, setDisplayName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('collector');
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
    try {
      const { error: err } = await signUp(email.trim(), password, {
        displayName: displayName.trim(),
        accountType,
      });
      if (err) setError(err);
      else setSubmitted(true); // session effect handles the redirect if auto-confirmed
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell title="Create Account" eyebrow="MEMBERS">
      {!configured ? (
        <NotConfiguredNote />
      ) : submitted && !session ? (
        // Email confirmation is on for this deployment: no session yet.
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: TEXT, fontFamily: SERIF }}>
            Almost there — we sent a confirmation link to <strong>{email}</strong>. Follow it,
            then sign in.
          </p>
          <p style={{ ...noteStyle, fontSize: 14 }}>
            <Link href="/login" style={{ color: GOLD }}>
              Go to sign in →
            </Link>
          </p>
        </div>
      ) : (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div style={{ ...panelStyle, marginBottom: 0 }}>
            <form onSubmit={onSubmit}>
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="signup-display-name" style={authLabelStyle}>
                  DISPLAY NAME
                </label>
                <input
                  id="signup-display-name"
                  type="text"
                  required
                  autoComplete="nickname"
                  placeholder="How you appear across the museum"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={authInputStyle}
                />
              </div>
              <div style={{ marginBottom: 18 }}>
                <span style={authLabelStyle}>I AM A…</span>
                <div style={{ display: 'flex', gap: 12 }}>
                  <TypeCard
                    selected={accountType === 'collector'}
                    title="COLLECTOR"
                    blurb="I collect cards and want to show them off."
                    onSelect={() => setAccountType('collector')}
                  />
                  <TypeCard
                    selected={accountType === 'vendor'}
                    title="VENDOR"
                    blurb="I sell cards — get a vendor profile and appear in show booth assignments."
                    onSelect={() => setAccountType('vendor')}
                  />
                </div>
              </div>
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
              <button
                type="submit"
                disabled={busy}
                style={{ ...authButtonStyle, width: '100%', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'CREATING…' : 'CREATE ACCOUNT →'}
              </button>
              {error && <p style={authErrorStyle}>{error}</p>}
            </form>
          </div>
          <p
            style={{
              marginTop: 26,
              fontSize: 14,
              color: MUTED,
              fontFamily: SERIF,
              fontStyle: 'italic',
              textAlign: 'center',
            }}
          >
            Already have an account?{' '}
            <Link href="/login" style={{ color: GOLD }}>
              Sign in →
            </Link>
          </p>
        </div>
      )}
    </PageShell>
  );
}
