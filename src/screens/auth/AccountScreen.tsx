import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useLocation } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import {
  readLocalSnapshot,
  importLocalData,
  importedFlagKey,
} from '../../lib/importLocal';
import type { LocalSnapshot, ImportSelection } from '../../lib/importLocal';
import {
  authLabelStyle,
  authInputStyle,
  authButtonStyle,
  authErrorStyle,
  NotConfiguredNote,
} from './LoginScreen';

const GOLD = '#d4af37';
const HAIRLINE = 'rgba(212,175,55,0.28)';
const MUTED = '#b7ad98';

const sectionStyle: CSSProperties = {
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 4,
  padding: '24px 26px',
  marginBottom: 28,
};

const sectionTitleStyle: CSSProperties = {
  margin: '0 0 18px',
  fontSize: 13,
  fontWeight: 400,
  letterSpacing: '0.22em',
  color: GOLD,
};

function ImportRow({
  label,
  count,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  count: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 12,
        padding: '8px 0',
        fontSize: 15,
        color: disabled ? MUTED : '#e8e0d0',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: GOLD }}
      />
      <span>{label}</span>
      <span style={{ fontSize: 13, color: MUTED }}>{count}</span>
    </label>
  );
}

// Owned by the accounts workstream (Stream A).
export default function AccountScreen() {
  const { configured, session, loading, signOut } = useAuth();
  const [, navigate] = useLocation();
  const userId = session?.user.id ?? null;

  // ---- profile (display name persists to `profiles`) ----
  const [displayName, setDisplayName] = useState('');
  const [nameStatus, setNameStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // ---- import wizard ----
  const [snapshot, setSnapshot] = useState<LocalSnapshot | null>(null);
  const [selection, setSelection] = useState<ImportSelection>({
    cards: true,
    vendors: true,
    plans: true,
  });
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [importDone, setImportDone] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Signed out (or never signed in) — this page is account-only.
  useEffect(() => {
    if (configured && !loading && !session) navigate('/login');
  }, [configured, loading, session, navigate]);

  // Load the profile's display name.
  useEffect(() => {
    if (!userId || !supabase) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const name = (data as { display_name: string } | null)?.display_name;
        if (!cancelled && name) setDisplayName(name);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Count what the guest (local IndexedDB) side holds.
  useEffect(() => {
    let cancelled = false;
    readLocalSnapshot()
      .then((snap) => {
        if (cancelled) return;
        setSnapshot(snap);
        setSelection({
          cards: snap.cards.length > 0,
          vendors: snap.vendors.length > 0,
          plans: snap.plans.length > 0,
        });
      })
      .catch(() => {
        if (!cancelled) setSnapshot({ cards: [], vendors: [], inventory: [], plans: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveDisplayName = useCallback(async () => {
    if (!userId || !supabase) return;
    setNameStatus('saving');
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', userId);
    setNameStatus(error ? 'error' : 'saved');
  }, [userId, displayName]);

  async function runImport() {
    if (!userId || !snapshot) return;
    setImporting(true);
    setImportDone(false);
    setImportError(null);
    try {
      await importLocalData(userId, snapshot, selection, setProgress);
      setImportDone(true);
      setProgress('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  if (!configured) {
    return (
      <PageShell title="My Account">
        <NotConfiguredNote />
      </PageShell>
    );
  }
  if (!session) {
    // Redirecting (effect above) — render the shell so there's no flash.
    return <PageShell title="My Account">{null}</PageShell>;
  }

  const alreadyImported = userId ? localStorage.getItem(importedFlagKey(userId)) : null;
  const nothingSelected = !selection.cards && !selection.vendors && !selection.plans;
  const nothingLocal =
    snapshot !== null &&
    snapshot.cards.length === 0 &&
    snapshot.vendors.length === 0 &&
    snapshot.plans.length === 0;

  return (
    <PageShell title="My Account">
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>PROFILE</h2>
        <p style={{ margin: '0 0 18px', fontSize: 15, color: MUTED }}>
          Signed in as <span style={{ color: '#e8e0d0' }}>{session.user.email}</span>
        </p>
        <div style={{ maxWidth: 420, marginBottom: 20 }}>
          <label htmlFor="account-display-name" style={authLabelStyle}>
            DISPLAY NAME
          </label>
          <input
            id="account-display-name"
            type="text"
            value={displayName}
            placeholder="How you appear across the museum"
            onChange={(e) => {
              setDisplayName(e.target.value);
              setNameStatus('idle');
            }}
            onBlur={saveDisplayName}
            style={authInputStyle}
          />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: MUTED, minHeight: 15 }}>
            {nameStatus === 'saving' && 'Saving…'}
            {nameStatus === 'saved' && 'Saved.'}
            {nameStatus === 'error' && 'Could not save — try again.'}
          </p>
        </div>
        <button
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
          style={{
            background: 'transparent',
            color: GOLD,
            border: `1px solid ${HAIRLINE}`,
            padding: '11px 30px',
            fontSize: 12,
            letterSpacing: '0.16em',
            fontFamily: 'inherit',
            cursor: 'pointer',
            borderRadius: 2,
          }}
        >
          SIGN OUT
        </button>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>BRING IN THIS BROWSER&rsquo;S COLLECTION</h2>
        <p style={{ margin: '0 0 14px', fontSize: 14.5, lineHeight: 1.65, color: MUTED }}>
          Anything added while browsing as a guest lives only in this browser. Copy it into
          your account — the local data stays untouched, and running the import again simply
          re-syncs the same items.
        </p>
        {alreadyImported && !importDone && (
          <p style={{ margin: '0 0 14px', fontSize: 13, color: MUTED, fontStyle: 'italic' }}>
            Imported previously on {new Date(alreadyImported).toLocaleDateString()} — you can
            import again.
          </p>
        )}
        {snapshot === null ? (
          <p style={{ fontSize: 14, color: MUTED }}>Reading local data…</p>
        ) : nothingLocal ? (
          <p style={{ fontSize: 14, color: MUTED, fontStyle: 'italic' }}>
            Nothing to import — this browser has no guest data.
          </p>
        ) : (
          <>
            <ImportRow
              label="My collection"
              count={`${snapshot.cards.length} ${snapshot.cards.length === 1 ? 'card' : 'cards'}`}
              checked={selection.cards}
              disabled={importing || snapshot.cards.length === 0}
              onChange={(v) => setSelection((s) => ({ ...s, cards: v }))}
            />
            <ImportRow
              label="My vendors & inventory"
              count={`${snapshot.vendors.length} ${snapshot.vendors.length === 1 ? 'vendor' : 'vendors'} · ${snapshot.inventory.length} ${snapshot.inventory.length === 1 ? 'item' : 'items'}`}
              checked={selection.vendors}
              disabled={importing || snapshot.vendors.length === 0}
              onChange={(v) => setSelection((s) => ({ ...s, vendors: v }))}
            />
            <ImportRow
              label="My saved plans (become draft shows)"
              count={`${snapshot.plans.length} ${snapshot.plans.length === 1 ? 'plan' : 'plans'}`}
              checked={selection.plans}
              disabled={importing || snapshot.plans.length === 0}
              onChange={(v) => setSelection((s) => ({ ...s, plans: v }))}
            />
            <div style={{ marginTop: 18 }}>
              <button
                onClick={runImport}
                disabled={importing || nothingSelected}
                style={{
                  ...authButtonStyle,
                  opacity: importing || nothingSelected ? 0.55 : 1,
                  cursor: importing || nothingSelected ? 'not-allowed' : 'pointer',
                }}
              >
                {importing ? 'IMPORTING…' : importDone || alreadyImported ? 'IMPORT AGAIN →' : 'IMPORT →'}
              </button>
              <p style={{ margin: '12px 0 0', fontSize: 13, color: MUTED, minHeight: 16 }}>
                {importing && progress}
                {importDone && !importing && 'Done — everything selected is now in your account.'}
              </p>
              {importError && <p style={authErrorStyle}>{importError}</p>}
            </div>
          </>
        )}
      </section>
    </PageShell>
  );
}
