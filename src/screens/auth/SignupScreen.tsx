import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import type { AccountType } from '../../lib/auth';
import { readLocalSnapshot } from '../../lib/importLocal';
import {
  authLabelStyle,
  authInputStyle,
  authButtonStyle,
  authErrorStyle,
  NotConfiguredNote,
} from './LoginScreen';
import { useTheme, withAlpha } from '../../components/themeKit';
import { LcdCursor, LcdDialog, lcdMenuBox, lcdMenuRow } from '../../components/lcdKit';

/** Selectable panel — themed border, accent highlight when chosen. */
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
  const t = useTheme();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="museum-lift"
      style={{
        flex: 1,
        textAlign: 'left',
        background: selected ? withAlpha(t.accent, 0.08) : t.panel,
        border: `${t.borderWidth}px solid ${selected ? t.accent : t.border}`,
        borderRadius: 2,
        padding: '14px 16px',
        cursor: 'pointer',
        fontFamily: t.fontMono,
      }}
    >
      <span
        style={{
          display: 'block',
          fontSize: 13,
          letterSpacing: '0.18em',
          color: selected ? t.accent : t.text,
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
          color: t.muted,
          fontStyle: t.id === 'refined' ? 'italic' : 'normal',
        }}
      >
        {blurb}
      </span>
    </button>
  );
}

/** Handheld twin of TypeCard: a menu row with ▶ selection (inverted when
 *  active) — same state writes, rendered only under t.id === 'handheld'. */
function LcdClassRow({
  selected,
  title,
  blurb,
  last,
  onSelect,
}: {
  selected: boolean;
  title: string;
  blurb: string;
  last?: boolean;
  onSelect: () => void;
}) {
  const t = useTheme();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        width: '100%',
        textAlign: 'left',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        ...lcdMenuRow(selected),
        ...(last ? { borderBottom: 'none' } : {}),
        alignItems: 'flex-start',
      }}
    >
      <LcdCursor active={selected} />
      <span style={{ display: 'block', minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700 }}>{title}</span>
        <span
          style={{
            display: 'block',
            fontSize: 9,
            lineHeight: 1.8,
            letterSpacing: '0.04em',
            fontWeight: 400,
            color: selected ? 'inherit' : t.muted,
            opacity: selected ? 0.85 : 1,
          }}
        >
          {blurb}
        </span>
      </span>
    </button>
  );
}

/**
 * Post-signup destination, set by the submit handler just before signUp and
 * read by the session effect. Module-scoped ON PURPOSE: when the new session
 * arrives, DataProviderBoundary remounts the whole data subtree (identity
 * key), so the effect runs in a fresh component instance — refs and state
 * don't survive, this does. Time-boxed so a much later visit to /signup
 * while signed in still bounces to plain '/'.
 */
let postSignupDest: { dest: string; at: number } | null = null;

/** Not cleared on read — StrictMode runs the session effect twice and both
 *  invocations must see the same destination. */
function getPostSignupDest(): string {
  const fresh = postSignupDest && Date.now() - postSignupDest.at < 60_000;
  return fresh ? postSignupDest!.dest : '/';
}

// Owned by the accounts workstream (Stream A).
export default function SignupScreen() {
  const t = useTheme();
  const lcd = t.id === 'handheld';
  const aLabel = authLabelStyle(t);
  const aInput = authInputStyle(t);
  const aButton = authButtonStyle(t);
  const aError = authErrorStyle(t);
  const { configured, session, signUp } = useAuth();
  const [, navigate] = useLocation();
  const [displayName, setDisplayName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('collector');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Signed in (auto-confirm signups create a session immediately) — go to
  // the destination decided before signUp ran. NOTE: the destination lives at
  // MODULE scope (postSignupDest below), not in a ref — the provider seam
  // remounts the whole data subtree when the auth identity changes
  // (DataProviderBoundary keys on it), so this effect actually runs in a
  // FRESH SignupScreen instance whose refs/state were reset.
  useEffect(() => {
    if (session) navigate(getPostSignupDest());
  }, [session, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Decide the post-signup destination BEFORE calling signUp — the
      // session effect above fires as soon as the auth state changes, so
      // the flag must already hold the answer (roadmap 15: guests with local
      // cards/vendors/plans land on the account import panel, not bare home).
      try {
        const snap = await readLocalSnapshot();
        postSignupDest = {
          dest:
            snap.cards.length + snap.vendors.length + snap.plans.length > 0
              ? '/account?import=1'
              : '/',
          at: Date.now(),
        };
      } catch {
        postSignupDest = null;
      }
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
    <PageShell
      title={lcd ? 'START YOUR COLLECTION!' : 'Create Account'}
      eyebrow={lcd ? 'NEW GAME' : 'MEMBERS'}
    >
      {!configured ? (
        <NotConfiguredNote />
      ) : submitted && !session ? (
        // Email confirmation is on for this deployment: no session yet.
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          {lcd ? (
            <LcdDialog cursor>
              Almost there! We sent a confirmation link to <strong>{email}</strong>. Follow
              it, then sign in!
              <span style={{ display: 'block', marginTop: 6 }}>
                <Link
                  href="/login"
                  style={{ color: 'inherit', fontWeight: 700, textDecoration: 'none' }}
                >
                  ▶ GO TO SIGN IN
                </Link>
              </span>
            </LcdDialog>
          ) : (
            <>
              <p
                style={{
                  fontSize: 17,
                  lineHeight: 1.7,
                  color: t.text,
                  fontFamily: t.id === 'refined' ? t.fontDisplay : undefined,
                }}
              >
                Almost there — we sent a confirmation link to <strong>{email}</strong>. Follow it,
                then sign in.
              </p>
              <p style={{ ...t.note, fontSize: 14 }}>
                <Link href="/login" style={{ color: t.accent }}>
                  Go to sign in →
                </Link>
              </p>
            </>
          )}
        </div>
      ) : (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div style={{ ...t.panelStyle, marginBottom: 0 }}>
            <form onSubmit={onSubmit}>
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="signup-display-name" style={aLabel}>
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
                  style={aInput}
                />
              </div>
              <div style={{ marginBottom: 18 }}>
                <span style={aLabel}>{lcd ? 'CHOOSE YOUR CLASS!' : 'I AM A…'}</span>
                {lcd ? (
                  <div style={lcdMenuBox}>
                    <LcdClassRow
                      selected={accountType === 'collector'}
                      title="COLLECTOR"
                      blurb="I collect cards and want to show them off."
                      onSelect={() => setAccountType('collector')}
                    />
                    <LcdClassRow
                      selected={accountType === 'vendor'}
                      title="VENDOR"
                      blurb="I sell cards — get a vendor profile and appear in show booth assignments."
                      last
                      onSelect={() => setAccountType('vendor')}
                    />
                  </div>
                ) : (
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
                )}
              </div>
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="signup-email" style={aLabel}>
                  EMAIL
                </label>
                <input
                  id="signup-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={aInput}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label htmlFor="signup-password" style={aLabel}>
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
                  style={aInput}
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                style={{ ...aButton, width: '100%', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'CREATING…' : lcd ? '▶ NEW GAME' : 'CREATE ACCOUNT →'}
              </button>
              {error && <p style={aError}>{lcd ? `! ${error}` : error}</p>}
            </form>
          </div>
          <p
            style={{
              ...t.note,
              lineHeight: undefined,
              marginTop: 26,
              fontSize: lcd ? 10 : 14,
              textAlign: 'center',
            }}
          >
            {lcd ? 'GOT A SAVE FILE? ' : 'Already have an account? '}
            <Link
              href="/login"
              style={{
                color: t.accent,
                ...(lcd ? { fontWeight: 700 as const, textDecoration: 'none' } : {}),
              }}
            >
              {lcd ? '▶ CONTINUE' : 'Sign in →'}
            </Link>
          </p>
        </div>
      )}
    </PageShell>
  );
}
