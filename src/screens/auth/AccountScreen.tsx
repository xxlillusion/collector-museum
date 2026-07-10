import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import { getMyProfile, updateMyProfile } from '../../lib/profileService';
import type { ProfileRecord } from '../../lib/profileService';
import { COUNTRIES, regionOptions } from '../../lib/locations';
import {
  readLocalSnapshot,
  importLocalData,
  importedFlagKey,
} from '../../lib/importLocal';
import type { LocalSnapshot, ImportSelection } from '../../lib/importLocal';
import { purgeMyData } from '../../lib/accountDeletion';
import MyStoresTab from './MyStoresTab';
import { errMsg, StatusLine, checkLabelStyle } from './accountShared';
import {
  GOLD,
  HAIRLINE,
  TEXT,
  MUTED,
  SERIF,
  panelStyle,
  panelTitleStyle,
  ghostButtonStyle,
} from '../../components/museumKit';
import {
  authLabelStyle,
  authInputStyle,
  authButtonStyle,
  authErrorStyle,
  NotConfiguredNote,
} from './LoginScreen';

type AccountTab = 'profile' | 'stores';

// Red-tinged warning tone for the danger zone — the palette's existing
// muted terracotta (declined chips / SOLD tags), never a raw alert red.
const DANGER = '#b0685c';
const DANGER_BORDER = 'rgba(176,104,92,0.5)';

const tabButtonStyle = (active: boolean): CSSProperties => ({
  background: 'transparent',
  border: 'none',
  borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
  color: active ? GOLD : MUTED,
  fontFamily: SERIF,
  fontSize: 13,
  letterSpacing: '0.18em',
  padding: '10px 4px',
  cursor: 'pointer',
});

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
        color: disabled ? MUTED : TEXT,
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
  const { configured, session, loading, signOut, updatePassword } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const userId = session?.user.id ?? null;

  // Tab from the query param so MY STORES is deep-linkable (/account?tab=stores).
  const tab: AccountTab =
    new URLSearchParams(search).get('tab') === 'stores' ? 'stores' : 'profile';
  const setTab = (next: AccountTab) =>
    navigate(next === 'stores' ? '/account?tab=stores' : '/account', { replace: true });

  // ---- profile (loaded once via profileService; sections edit slices of it) ----
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);

  // ---- display name ----
  const [displayName, setDisplayName] = useState('');
  const [nameStatus, setNameStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // ---- location & bio ----
  const [country, setCountry] = useState<string | null>(null);
  const [stateRegion, setStateRegion] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [locStatus, setLocStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [locError, setLocError] = useState<string | null>(null);

  // ---- change password ----
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // ---- organizer / collection toggles ----
  const [orgStatus, setOrgStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [orgError, setOrgError] = useState<string | null>(null);
  const [collStatus, setCollStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [collError, setCollError] = useState<string | null>(null);

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
  // One-shot ?import=1 (signup routes here when the browser holds guest
  // data): scroll to and pulse the import panel below.
  const importPanelRef = useRef<HTMLElement | null>(null);
  const [highlightImport, setHighlightImport] = useState(false);

  // ---- delete my data (typed confirmation gates the button) ----
  const [purgeText, setPurgeText] = useState('');
  const [purging, setPurging] = useState(false);
  const [purgeProgress, setPurgeProgress] = useState('');
  const [purgeError, setPurgeError] = useState<string | null>(null);

  // Read the param once at mount, then strip it via replaceState so
  // refresh/back land on a plain /account — the /?view=vendors pattern.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('import') !== '1') return;
    setHighlightImport(true);
    params.delete('import');
    const rest = params.toString();
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash,
    );
  }, []);

  // Keep the panel in view while the sections above it load in (profile /
  // snapshot arriving shifts the layout), then let the highlight fade.
  useEffect(() => {
    if (!highlightImport) return;
    importPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [highlightImport, profile, snapshot]);
  useEffect(() => {
    if (!highlightImport) return;
    const t = setTimeout(() => setHighlightImport(false), 6000);
    return () => clearTimeout(t);
  }, [highlightImport]);

  // Signed out (or never signed in) — this page is account-only.
  useEffect(() => {
    if (configured && !loading && !session) navigate('/login');
  }, [configured, loading, session, navigate]);

  // Load the full profile (display name, location, bio, flags).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getMyProfile(userId)
      .then((p) => {
        if (cancelled) return;
        if (!p) {
          setProfileLoadError('Could not load your profile — try reloading the page.');
          return;
        }
        setProfile(p);
        setDisplayName(p.displayName);
        setCountry(p.country);
        setStateRegion(p.state);
        setCity(p.city ?? '');
        setBio(p.bio);
      })
      .catch((err) => {
        if (!cancelled) setProfileLoadError(errMsg(err));
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
    if (!userId) return;
    setNameStatus('saving');
    try {
      const trimmed = displayName.trim();
      await updateMyProfile(userId, { displayName: trimmed });
      setProfile((p) => (p ? { ...p, displayName: trimmed } : p));
      setNameStatus('saved');
    } catch {
      setNameStatus('error');
    }
  }, [userId, displayName]);

  const saveLocation = useCallback(
    async (patch: Partial<Pick<ProfileRecord, 'country' | 'state' | 'city' | 'bio'>>) => {
      if (!userId) return;
      setLocStatus('saving');
      setLocError(null);
      try {
        await updateMyProfile(userId, patch);
        setProfile((p) => (p ? { ...p, ...patch } : p));
        setLocStatus('saved');
      } catch (err) {
        setLocStatus('error');
        setLocError(errMsg(err));
      }
    },
    [userId],
  );

  function onCountryChange(nextRaw: string) {
    const next = nextRaw || null;
    setCountry(next);
    // Keep the region only when it exists in the new country's list.
    const keep = next !== null && regionOptions(next).some((r) => r.code === stateRegion);
    const nextState = keep ? stateRegion : null;
    setStateRegion(nextState);
    void saveLocation({ country: next, state: nextState });
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwDone(false);
    if (newPw.length < 6) {
      setPwError('Password must be at least 6 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('Passwords do not match.');
      return;
    }
    setPwBusy(true);
    try {
      const { error: err } = await updatePassword(newPw);
      if (err) setPwError(err);
      else {
        setPwDone(true);
        setNewPw('');
        setConfirmPw('');
      }
    } catch (err) {
      setPwError(errMsg(err));
    } finally {
      setPwBusy(false);
    }
  }

  async function toggleOrganizer(next: boolean) {
    if (!userId || !profile) return;
    const prev = profile.isOrganizer;
    setProfile({ ...profile, isOrganizer: next });
    setOrgStatus('saving');
    setOrgError(null);
    try {
      await updateMyProfile(userId, { isOrganizer: next });
      setOrgStatus('saved');
    } catch (err) {
      setProfile((p) => (p ? { ...p, isOrganizer: prev } : p));
      setOrgStatus('error');
      setOrgError(errMsg(err));
    }
  }

  async function toggleCollectionPublic(next: boolean) {
    if (!userId || !profile) return;
    const prev = profile.collectionPublic;
    setProfile({ ...profile, collectionPublic: next });
    setCollStatus('saving');
    setCollError(null);
    try {
      await updateMyProfile(userId, { collectionPublic: next });
      setCollStatus('saved');
    } catch (err) {
      setProfile((p) => (p ? { ...p, collectionPublic: prev } : p));
      setCollStatus('error');
      setCollError(errMsg(err));
    }
  }

  async function runPurge() {
    if (!userId || purgeText !== 'DELETE' || purging) return;
    setPurging(true);
    setPurgeError(null);
    try {
      await purgeMyData(userId, setPurgeProgress);
      // Everything owned is gone — end the session and land on the door.
      await signOut();
      navigate('/');
    } catch (err) {
      setPurgeError(errMsg(err));
      setPurgeProgress('');
      setPurging(false);
    }
    // No finally-reset on success: the sign-out redirect unmounts this screen.
  }

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
      setImportError(errMsg(err));
    } finally {
      setImporting(false);
    }
  }

  if (!configured) {
    return (
      <PageShell title="My Account" eyebrow="MEMBERS">
        <NotConfiguredNote />
      </PageShell>
    );
  }
  if (!session) {
    // Redirecting (effect above) — render the shell so there's no flash.
    return <PageShell title="My Account" eyebrow="MEMBERS">{null}</PageShell>;
  }

  const alreadyImported = userId ? localStorage.getItem(importedFlagKey(userId)) : null;
  const nothingSelected = !selection.cards && !selection.vendors && !selection.plans;
  const nothingLocal =
    snapshot !== null &&
    snapshot.cards.length === 0 &&
    snapshot.vendors.length === 0 &&
    snapshot.plans.length === 0;

  const regions = regionOptions(country);

  return (
    <PageShell title="My Account" eyebrow="MEMBERS">
      {/* Tab bar — MY STORES holds every store surface (settings + inventory). */}
      <div
        style={{
          display: 'flex',
          gap: 26,
          borderBottom: `1px solid ${HAIRLINE}`,
          marginBottom: 28,
        }}
      >
        <button onClick={() => setTab('profile')} style={tabButtonStyle(tab === 'profile')}>
          PROFILE
        </button>
        <button onClick={() => setTab('stores')} style={tabButtonStyle(tab === 'stores')}>
          MY STORES
        </button>
      </div>

      {tab === 'stores' && userId ? (
        <MyStoresTab
          userId={userId}
          onBecameVendor={() =>
            setProfile((p) => (p ? { ...p, accountType: 'vendor' } : p))
          }
        />
      ) : (
        <>
          <section style={panelStyle}>
            <h2 style={panelTitleStyle}>PROFILE</h2>
            <p style={{ margin: '0 0 18px', fontSize: 15, color: MUTED }}>
              Signed in as <span style={{ color: TEXT }}>{session.user.email}</span>
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
              <StatusLine status={nameStatus} />
            </div>
            <button
              onClick={async () => {
                await signOut();
                navigate('/');
              }}
              style={ghostButtonStyle}
            >
              SIGN OUT
            </button>
          </section>

          {profileLoadError && (
            <section style={panelStyle}>
              <p style={{ ...authErrorStyle, margin: 0 }}>{profileLoadError}</p>
            </section>
          )}
          {!profile && !profileLoadError && (
            <section style={panelStyle}>
              <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Loading profile…</p>
            </section>
          )}

          {profile && (
            <>
              <section style={panelStyle}>
                <h2 style={panelTitleStyle}>LOCATION &amp; BIO</h2>
                <div style={{ maxWidth: 420 }}>
                  <div style={{ marginBottom: 18 }}>
                    <label htmlFor="account-country" style={authLabelStyle}>
                      COUNTRY
                    </label>
                    <select
                      id="account-country"
                      value={country ?? ''}
                      onChange={(e) => onCountryChange(e.target.value)}
                      style={authInputStyle}
                    >
                      <option value="">—</option>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {regions.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <label htmlFor="account-state" style={authLabelStyle}>
                        {country === 'CA' ? 'PROVINCE' : 'STATE'}
                      </label>
                      <select
                        id="account-state"
                        value={stateRegion ?? ''}
                        onChange={(e) => {
                          const next = e.target.value || null;
                          setStateRegion(next);
                          void saveLocation({ state: next });
                        }}
                        style={authInputStyle}
                      >
                        <option value="">—</option>
                        {regions.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div style={{ marginBottom: 18 }}>
                    <label htmlFor="account-city" style={authLabelStyle}>
                      CITY
                    </label>
                    <input
                      id="account-city"
                      type="text"
                      value={city}
                      placeholder="e.g. Philadelphia"
                      onChange={(e) => setCity(e.target.value)}
                      onBlur={() => void saveLocation({ city: city.trim() || null })}
                      style={authInputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="account-bio" style={authLabelStyle}>
                      BIO
                    </label>
                    <textarea
                      id="account-bio"
                      value={bio}
                      placeholder="A few lines about you and what you collect"
                      onChange={(e) => setBio(e.target.value)}
                      onBlur={() => void saveLocation({ bio })}
                      rows={4}
                      style={{ ...authInputStyle, lineHeight: 1.6, resize: 'vertical' }}
                    />
                    <StatusLine status={locStatus} error={locError} />
                  </div>
                </div>
              </section>

              <section style={panelStyle}>
                <h2 style={panelTitleStyle}>MY COLLECTION</h2>
                <label style={checkLabelStyle}>
                  <input
                    type="checkbox"
                    checked={profile.collectionPublic}
                    onChange={(e) => void toggleCollectionPublic(e.target.checked)}
                    style={{ accentColor: GOLD }}
                  />
                  <span>Make my collection public</span>
                </label>
                <StatusLine status={collStatus} error={collError} />
                {profile.collectionPublic && (
                  <>
                    <p style={{ margin: '10px 0 0', fontSize: 14, color: MUTED }}>
                      <Link href={`/collector/${userId}`} style={{ color: GOLD }}>
                        View my public collection page →
                      </Link>
                    </p>
                    <p style={{ margin: '6px 0 0', fontSize: 14, color: MUTED }}>
                      <Link href={`/museum/collector/${userId}`} style={{ color: GOLD }}>
                        Walk my public museum →
                      </Link>
                    </p>
                  </>
                )}
              </section>

              <section style={panelStyle}>
                <h2 style={panelTitleStyle}>ORGANIZER</h2>
                <label style={checkLabelStyle}>
                  <input
                    type="checkbox"
                    checked={profile.isOrganizer}
                    onChange={(e) => void toggleOrganizer(e.target.checked)}
                    style={{ accentColor: GOLD }}
                  />
                  <span>Organizer — I run card shows</span>
                </label>
                <StatusLine status={orgStatus} error={orgError} />
                {profile.isOrganizer && (
                  <p style={{ margin: '10px 0 0', fontSize: 14, color: MUTED }}>
                    <Link href="/organizer" style={{ color: GOLD }}>
                      Go to organizer tools →
                    </Link>
                  </p>
                )}
              </section>

              <section style={panelStyle}>
                <h2 style={panelTitleStyle}>CHANGE PASSWORD</h2>
                <form onSubmit={onChangePassword} style={{ maxWidth: 420 }}>
                  <div style={{ marginBottom: 18 }}>
                    <label htmlFor="account-new-password" style={authLabelStyle}>
                      NEW PASSWORD
                    </label>
                    <input
                      id="account-new-password"
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      style={authInputStyle}
                    />
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label htmlFor="account-confirm-password" style={authLabelStyle}>
                      CONFIRM NEW PASSWORD
                    </label>
                    <input
                      id="account-confirm-password"
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      style={authInputStyle}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={pwBusy}
                    style={{ ...authButtonStyle, opacity: pwBusy ? 0.6 : 1 }}
                  >
                    {pwBusy ? 'UPDATING…' : 'UPDATE PASSWORD →'}
                  </button>
                  <p style={{ margin: '12px 0 0', fontSize: 13, color: MUTED, minHeight: 16 }}>
                    {pwDone && 'Password updated.'}
                  </p>
                  {pwError && <p style={authErrorStyle}>{pwError}</p>}
                </form>
              </section>
            </>
          )}

          <style>{`@keyframes vmImportPulse {
            0% { box-shadow: 0 0 0 0 rgba(212,175,55,0.55); }
            70% { box-shadow: 0 0 0 16px rgba(212,175,55,0); }
            100% { box-shadow: 0 0 0 0 rgba(212,175,55,0); }
          }`}</style>
          <section
            ref={importPanelRef}
            id="import-panel"
            style={{
              ...panelStyle,
              ...(highlightImport
                ? {
                    border: `1px solid ${GOLD}`,
                    animation: 'vmImportPulse 1.8s ease-out 3',
                  }
                : {}),
            }}
          >
            <h2 style={panelTitleStyle}>BRING IN THIS BROWSER&rsquo;S COLLECTION</h2>
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

          {/* ---- danger zone: clearly separated at the very bottom ---- */}
          <section
            style={{
              ...panelStyle,
              marginTop: 44,
              border: `1px solid ${DANGER_BORDER}`,
            }}
          >
            <h2 style={{ ...panelTitleStyle, color: DANGER }}>DELETE MY DATA</h2>
            <p style={{ margin: '0 0 12px', fontSize: 14.5, lineHeight: 1.65, color: MUTED }}>
              Permanently deletes everything this account owns — stores and their
              inventory, shows and their booths, booth applications, your collection
              cards, and your ♥ interest marks. Collection card images are removed
              with the records; store banner, inventory and floor-plan images become
              unreachable and are periodically cleaned. This cannot be undone.
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 14.5, lineHeight: 1.65, color: MUTED }}>
              Your login itself survives, so you can sign back in and start fresh. To
              remove the account entirely, email us via the{' '}
              <Link href="/contact" style={{ color: GOLD }}>
                contact page
              </Link>
              .
            </p>
            <div style={{ maxWidth: 420 }}>
              <label htmlFor="account-purge-confirm" style={authLabelStyle}>
                TYPE DELETE TO CONFIRM
              </label>
              <input
                id="account-purge-confirm"
                type="text"
                value={purgeText}
                placeholder="DELETE"
                autoComplete="off"
                disabled={purging}
                onChange={(e) => setPurgeText(e.target.value)}
                style={authInputStyle}
              />
              <button
                onClick={() => void runPurge()}
                disabled={purgeText !== 'DELETE' || purging}
                style={{
                  ...ghostButtonStyle,
                  marginTop: 16,
                  color: DANGER,
                  border: `1px solid ${DANGER_BORDER}`,
                  opacity: purgeText !== 'DELETE' || purging ? 0.45 : 1,
                  cursor: purgeText !== 'DELETE' || purging ? 'not-allowed' : 'pointer',
                }}
              >
                {purging ? 'DELETING…' : 'DELETE MY DATA →'}
              </button>
              <p style={{ margin: '12px 0 0', fontSize: 13, color: MUTED, minHeight: 16 }}>
                {purging && purgeProgress}
              </p>
              {purgeError && <p style={authErrorStyle}>{purgeError}</p>}
            </div>
          </section>
        </>
      )}
    </PageShell>
  );
}
