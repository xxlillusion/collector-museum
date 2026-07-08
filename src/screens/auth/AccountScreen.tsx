import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import {
  STORE_LIMIT,
  getMyProfile,
  updateMyProfile,
  listMyStores,
  createStore,
  setFlagshipStore,
  updateMyStoreSettings,
} from '../../lib/profileService';
import type { ProfileRecord, MyStoreRecord } from '../../lib/profileService';
import { COUNTRIES, regionOptions } from '../../lib/locations';
import {
  readLocalSnapshot,
  importLocalData,
  importedFlagKey,
} from '../../lib/importLocal';
import type { LocalSnapshot, ImportSelection } from '../../lib/importLocal';
import {
  GOLD,
  HAIRLINE,
  TEXT,
  MUTED,
  ERROR,
  panelStyle,
  panelTitleStyle,
  ghostButtonStyle,
  noteStyle,
  errorTextStyle,
} from '../../components/museumKit';
import {
  authLabelStyle,
  authInputStyle,
  authButtonStyle,
  authErrorStyle,
  NotConfiguredNote,
} from './LoginScreen';

/** Inner bordered card for one store inside the MY STORES panel. */
const storeCardStyle: CSSProperties = {
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 4,
  background: 'rgba(0,0,0,0.18)',
  padding: '18px 20px',
  marginBottom: 18,
};

const checkLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  fontSize: 15,
  color: TEXT,
  cursor: 'pointer',
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function StatusLine({ status, error }: { status: SaveStatus; error?: string | null }) {
  return (
    <p
      style={{
        margin: '6px 0 0',
        fontSize: 12,
        color: status === 'error' ? ERROR : MUTED,
        minHeight: 15,
      }}
    >
      {status === 'saving' && 'Saving…'}
      {status === 'saved' && 'Saved.'}
      {status === 'error' && (error || 'Could not save — try again.')}
    </p>
  );
}

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

/**
 * One store's settings card. Owns its optimistic record slice + save status
 * (the old saveVendor pattern, per store): patch state, call
 * updateMyStoreSettings, revert on error. Flagship state comes from the
 * parent's list (refreshed after setFlagshipStore) via the `store` prop.
 */
function StorePanel({
  store,
  flagshipBusy,
  onMakeFlagship,
}: {
  store: MyStoreRecord;
  flagshipBusy: boolean;
  onMakeFlagship: (storeId: string) => void;
}) {
  const [rec, setRec] = useState<MyStoreRecord>(store);
  const [nameDraft, setNameDraft] = useState(store.name);
  const [areaDraft, setAreaDraft] = useState(store.areaServed);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useCallback(
    async (patch: Partial<Omit<MyStoreRecord, 'id' | 'isFlagship'>>) => {
      const prev = rec;
      setRec({ ...rec, ...patch });
      setStatus('saving');
      setSaveError(null);
      try {
        await updateMyStoreSettings(rec.id, patch);
        setStatus('saved');
      } catch (err) {
        setRec(prev);
        setStatus('error');
        setSaveError(errMsg(err));
      }
    },
    [rec],
  );

  function onCountryChange(nextRaw: string) {
    const next = nextRaw || null;
    // Keep the region only when it exists in the new country's list.
    const keep = next !== null && regionOptions(next).some((r) => r.code === rec.state);
    void save({ country: next, state: keep ? rec.state : null });
  }

  const regions = regionOptions(rec.country);
  const id = store.id;

  return (
    <div style={storeCardStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {store.isFlagship ? (
          <span>
            <span style={{ color: GOLD, fontSize: 12, letterSpacing: '0.18em' }}>
              ★ FLAGSHIP
            </span>
            <span style={{ marginLeft: 10, fontSize: 12, color: MUTED, fontStyle: 'italic' }}>
              your default store
            </span>
          </span>
        ) : (
          <button
            onClick={() => onMakeFlagship(id)}
            disabled={flagshipBusy}
            style={{
              ...ghostButtonStyle,
              padding: '6px 14px',
              fontSize: 11,
              opacity: flagshipBusy ? 0.6 : 1,
            }}
          >
            MAKE FLAGSHIP
          </button>
        )}
        <Link href={`/vendor/${id}`} style={{ color: GOLD, fontSize: 13 }}>
          View public page →
        </Link>
      </div>
      <div style={{ maxWidth: 420 }}>
        <div style={{ marginBottom: 18 }}>
          <label htmlFor={`store-${id}-name`} style={authLabelStyle}>
            STORE NAME
          </label>
          <input
            id={`store-${id}-name`}
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              const trimmed = nameDraft.trim();
              if (!trimmed) {
                setNameDraft(rec.name); // never save an empty name
                return;
              }
              if (trimmed !== rec.name) void save({ name: trimmed });
            }}
            style={authInputStyle}
          />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label htmlFor={`store-${id}-country`} style={authLabelStyle}>
            COUNTRY
          </label>
          <select
            id={`store-${id}-country`}
            value={rec.country ?? ''}
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
            <label htmlFor={`store-${id}-state`} style={authLabelStyle}>
              {rec.country === 'CA' ? 'PROVINCE' : 'STATE'}
            </label>
            <select
              id={`store-${id}-state`}
              value={rec.state ?? ''}
              onChange={(e) => void save({ state: e.target.value || null })}
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
          <label htmlFor={`store-${id}-area`} style={authLabelStyle}>
            AREA SERVED
          </label>
          <input
            id={`store-${id}-area`}
            type="text"
            value={areaDraft}
            placeholder='e.g. "Greater Philadelphia / tri-state shows"'
            onChange={(e) => setAreaDraft(e.target.value)}
            onBlur={() => {
              const trimmed = areaDraft.trim();
              if (trimmed !== rec.areaServed) void save({ areaServed: trimmed });
            }}
            style={authInputStyle}
          />
        </div>
        <label style={checkLabelStyle}>
          <input
            type="checkbox"
            checked={rec.inventoryPublic}
            onChange={(e) => void save({ inventoryPublic: e.target.checked })}
            style={{ accentColor: GOLD }}
          />
          <span>Show my inventory publicly</span>
        </label>
        <StatusLine status={status} error={saveError} />
      </div>
    </div>
  );
}

// Owned by the accounts workstream (Stream A).
export default function AccountScreen() {
  const { configured, session, loading, signOut, updatePassword } = useAuth();
  const [, navigate] = useLocation();
  const userId = session?.user.id ?? null;

  // ---- profile (loaded once via profileService; sections edit slices of it) ----
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);

  // ---- display name ----
  const [displayName, setDisplayName] = useState('');
  const [nameStatus, setNameStatus] = useState<SaveStatus>('idle');

  // ---- location & bio ----
  const [country, setCountry] = useState<string | null>(null);
  const [stateRegion, setStateRegion] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [locStatus, setLocStatus] = useState<SaveStatus>('idle');
  const [locError, setLocError] = useState<string | null>(null);

  // ---- change password ----
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // ---- organizer / collection toggles ----
  const [orgStatus, setOrgStatus] = useState<SaveStatus>('idle');
  const [orgError, setOrgError] = useState<string | null>(null);
  const [collStatus, setCollStatus] = useState<SaveStatus>('idle');
  const [collError, setCollError] = useState<string | null>(null);

  // ---- my stores (any account may hold up to STORE_LIMIT) ----
  const [stores, setStores] = useState<MyStoreRecord[] | null>(null); // null = loading
  const [storesLoadError, setStoresLoadError] = useState<string | null>(null);
  const [newStoreName, setNewStoreName] = useState('');
  const [creatingStore, setCreatingStore] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [flagshipBusy, setFlagshipBusy] = useState(false);
  const [flagshipError, setFlagshipError] = useState<string | null>(null);

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

  // Load the account's stores — every account type may hold them.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setStores(null);
    setStoresLoadError(null);
    listMyStores(userId)
      .then((list) => {
        if (!cancelled) setStores(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setStores([]);
          setStoresLoadError(errMsg(err));
        }
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

  async function openStore() {
    if (!userId || !stores) return;
    const name = newStoreName.trim();
    if (!name || creatingStore) return;
    setCreatingStore(true);
    setCreateError(null);
    try {
      const wasFirst = stores.length === 0;
      const created = await createStore(userId, name);
      setStores([...stores, created]);
      setNewStoreName('');
      if (wasFirst) {
        // createStore flips account_type server-side; mirror it locally so the
        // page reflects vendor status without a reload.
        setProfile((p) => (p ? { ...p, accountType: 'vendor' } : p));
      }
    } catch (err) {
      setCreateError(errMsg(err));
    } finally {
      setCreatingStore(false);
    }
  }

  async function makeFlagship(storeId: string) {
    if (!userId || flagshipBusy) return;
    setFlagshipBusy(true);
    setFlagshipError(null);
    try {
      await setFlagshipStore(storeId);
      setStores(await listMyStores(userId));
    } catch (err) {
      setFlagshipError(errMsg(err));
    } finally {
      setFlagshipBusy(false);
    }
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
  const canOpenStore = stores !== null && stores.length < STORE_LIMIT;

  const openStoreForm = (
    <div style={{ display: 'flex', gap: 12, maxWidth: 420, alignItems: 'stretch' }}>
      <input
        type="text"
        value={newStoreName}
        placeholder="Store name"
        onChange={(e) => {
          setNewStoreName(e.target.value);
          setCreateError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void openStore();
        }}
        style={{ ...authInputStyle, flex: 1 }}
      />
      <button
        onClick={() => void openStore()}
        disabled={creatingStore || !newStoreName.trim()}
        style={{
          ...ghostButtonStyle,
          whiteSpace: 'nowrap',
          opacity: creatingStore || !newStoreName.trim() ? 0.6 : 1,
        }}
      >
        {creatingStore
          ? 'OPENING…'
          : stores && stores.length > 0
            ? 'OPEN A SECOND STORE'
            : 'OPEN A STORE'}
      </button>
    </div>
  );

  return (
    <PageShell title="My Account" eyebrow="MEMBERS">
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
            <h2 style={panelTitleStyle}>MY STORES</h2>
            {storesLoadError ? (
              <p style={{ ...authErrorStyle, margin: 0 }}>{storesLoadError}</p>
            ) : stores === null ? (
              <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Loading stores…</p>
            ) : stores.length === 0 ? (
              <>
                <p style={{ ...noteStyle, margin: '0 0 16px' }}>
                  Sell cards? Open a store — it lists you in the vendor directory and lets
                  organizers assign you to show booths.
                </p>
                {openStoreForm}
                {createError && <p style={authErrorStyle}>{createError}</p>}
              </>
            ) : (
              <>
                {stores.map((s) => (
                  <StorePanel
                    key={s.id}
                    store={s}
                    flagshipBusy={flagshipBusy}
                    onMakeFlagship={(id) => void makeFlagship(id)}
                  />
                ))}
                {flagshipError && <p style={errorTextStyle}>{flagshipError}</p>}
                {canOpenStore ? (
                  <div style={{ marginTop: 4 }}>
                    {openStoreForm}
                    {createError && <p style={authErrorStyle}>{createError}</p>}
                  </div>
                ) : (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED, fontStyle: 'italic' }}>
                    Store limit reached ({STORE_LIMIT} per account).
                  </p>
                )}
                <p style={{ margin: '16px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                  Store inventory itself is managed in the Vendor Registry (home → Vendor
                  Registry).
                </p>
              </>
            )}
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
              <p style={{ margin: '10px 0 0', fontSize: 14, color: MUTED }}>
                <Link href={`/collector/${userId}`} style={{ color: GOLD }}>
                  View my public collection page →
                </Link>
              </p>
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

      <section style={panelStyle}>
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
    </PageShell>
  );
}
