import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import QRCode from 'qrcode';
import { Link } from 'wouter';
import {
  STORE_LIMIT,
  createStore,
  setFlagshipStore,
  updateMyStoreSettings,
  listMyStores,
  listUnclaimedVendors,
  claimVendorAsStore,
  autoClaimMyVendors,
  unregisterStore,
} from '../../lib/profileService';
import type { MyStoreRecord, UnclaimedVendor } from '../../lib/profileService';
import { COUNTRIES, regionOptions } from '../../lib/locations';
import { useVendors } from '../../lib/useVendors';
import { useSavedPlans } from '../../lib/useSavedPlans';
import VendorManagementPanel from '../../components/VendorManagementPanel';
import { errMsg, StatusLine, checkLabelStyle } from './accountShared';
import type { SaveStatus } from './accountShared';
import {
  GOLD,
  HAIRLINE,
  MUTED,
  SERIF,
  panelStyle,
  panelTitleStyle,
  ghostButtonStyle,
  noteStyle,
  errorTextStyle,
} from '../../components/museumKit';
import { authLabelStyle, authInputStyle, authErrorStyle } from './LoginScreen';

// MY STORES tab of /account: everything a vendor account manages lives here —
// store settings (the old MY VENDOR TABLE fields), booth QR, and per-store
// banner / shows / inventory via the shared VendorManagementPanel (the same
// component the local sandbox registry uses). On load, unlinked vendors the
// account owns (legacy registry entries, old organizer placeholders) are
// auto-claimed as stores up to the cap; the rest are listed as claimable.

/** Inner bordered card for one store inside the MY STORES panel. */
const storeCardStyle: CSSProperties = {
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 4,
  background: 'rgba(0,0,0,0.18)',
  padding: '18px 20px',
  marginBottom: 18,
};

/**
 * Booth QR modal: a printable code linking to the store's public page —
 * tape it to the physical table at real shows. Print uses the visibility
 * trick so only the QR sheet reaches paper.
 */
function StoreQrModal({ store, onClose }: { store: MyStoreRecord; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const url = `${window.location.origin}/vendor/${store.id}`;

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: 260,
      margin: 2,
      color: { dark: '#1a1611', light: '#ffffff' },
    }).catch(() => {});
  }, [url]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .qr-print-area, .qr-print-area * { visibility: visible !important; }
        .qr-print-area { position: fixed !important; inset: 0 !important; background: #fff !important; }
      }`}</style>
      <div
        className="qr-print-area"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: 6,
          padding: '34px 40px',
          textAlign: 'center',
          maxWidth: 360,
        }}
      >
        <div
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 20,
            letterSpacing: '0.12em',
            color: '#1a1611',
            marginBottom: 6,
          }}
        >
          {store.name.toUpperCase()}
        </div>
        <div style={{ fontSize: 11.5, color: '#6b6257', letterSpacing: '0.08em', marginBottom: 16 }}>
          SCAN TO BROWSE MY INVENTORY & MUSEUM
        </div>
        <canvas ref={canvasRef} style={{ display: 'block', margin: '0 auto' }} />
        <div style={{ fontSize: 10.5, color: '#6b6257', marginTop: 12, wordBreak: 'break-all' }}>
          {url}
        </div>
        <div
          className="qr-modal-actions"
          style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}
        >
          <style>{`@media print { .qr-modal-actions { display: none !important; } }`}</style>
          <button
            onClick={() => window.print()}
            style={{
              background: '#1a1611',
              color: '#f5efe2',
              border: 'none',
              borderRadius: 3,
              padding: '9px 22px',
              fontSize: 12,
              letterSpacing: '0.12em',
              cursor: 'pointer',
            }}
          >
            PRINT
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              color: '#6b6257',
              border: '1px solid #c9c2b6',
              borderRadius: 3,
              padding: '9px 22px',
              fontSize: 12,
              letterSpacing: '0.12em',
              cursor: 'pointer',
            }}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
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
  const [websiteDraft, setWebsiteDraft] = useState(store.website);
  const [emailDraft, setEmailDraft] = useState(store.contactEmail);
  const [instagramDraft, setInstagramDraft] = useState(store.instagram);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

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
    <div style={{ ...storeCardStyle, marginBottom: 0 }}>
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
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <button
            onClick={() => setQrOpen(true)}
            title="Printable QR linking to your public page — for your physical booth table"
            style={{ ...ghostButtonStyle, padding: '6px 14px', fontSize: 11 }}
          >
            ▦ BOOTH QR
          </button>
          <Link href={`/vendor/${id}`} style={{ color: GOLD, fontSize: 13 }}>
            View public page →
          </Link>
        </span>
      </div>
      {qrOpen && <StoreQrModal store={rec} onClose={() => setQrOpen(false)} />}
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
        <div style={{ marginBottom: 18 }}>
          <label htmlFor={`store-${id}-website`} style={authLabelStyle}>
            WEBSITE
          </label>
          <input
            id={`store-${id}-website`}
            type="url"
            value={websiteDraft}
            placeholder="https://…"
            onChange={(e) => setWebsiteDraft(e.target.value)}
            onBlur={() => {
              const trimmed = websiteDraft.trim();
              if (trimmed !== rec.website) void save({ website: trimmed });
            }}
            style={authInputStyle}
          />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label htmlFor={`store-${id}-email`} style={authLabelStyle}>
            PUBLIC CONTACT EMAIL
          </label>
          <input
            id={`store-${id}-email`}
            type="email"
            value={emailDraft}
            placeholder="Shown on your public page"
            onChange={(e) => setEmailDraft(e.target.value)}
            onBlur={() => {
              const trimmed = emailDraft.trim();
              if (trimmed !== rec.contactEmail) void save({ contactEmail: trimmed });
            }}
            style={authInputStyle}
          />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label htmlFor={`store-${id}-instagram`} style={authLabelStyle}>
            INSTAGRAM
          </label>
          <input
            id={`store-${id}-instagram`}
            type="text"
            value={instagramDraft}
            placeholder="handle (without the @)"
            onChange={(e) => setInstagramDraft(e.target.value)}
            onBlur={() => {
              const trimmed = instagramDraft.trim().replace(/^@/, '');
              if (trimmed !== instagramDraft) setInstagramDraft(trimmed);
              if (trimmed !== rec.instagram) void save({ instagram: trimmed });
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

export default function MyStoresTab({
  userId,
  onBecameVendor,
}: {
  userId: string;
  /** The claims/creates flipped the account to 'vendor' — mirror it in the parent. */
  onBecameVendor: () => void;
}) {
  const [stores, setStores] = useState<MyStoreRecord[] | null>(null); // null = loading
  const [unclaimed, setUnclaimed] = useState<UnclaimedVendor[]>([]);
  const [storesLoadError, setStoresLoadError] = useState<string | null>(null);
  const [newStoreName, setNewStoreName] = useState('');
  const [creatingStore, setCreatingStore] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [flagshipBusy, setFlagshipBusy] = useState(false);
  const [flagshipError, setFlagshipError] = useState<string | null>(null);
  const [claimBusyId, setClaimBusyId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [storeActionError, setStoreActionError] = useState<string | null>(null);

  // Banner / shows / inventory data for the management panels — the provider
  // seam lists every vendor the account owns (stores included), so summaries
  // for each store come straight from useVendors. Bounded: ≤ STORE_LIMIT
  // stores, and this tab only mounts when active.
  const vendors = useVendors();
  const savedPlans = useSavedPlans();

  // Load + silent adoption pass: legacy registry vendors (and old organizer
  // placeholders) the account owns become stores up to the cap.
  useEffect(() => {
    let cancelled = false;
    setStores(null);
    setStoresLoadError(null);
    autoClaimMyVendors(userId)
      .then((result) => {
        if (cancelled) return;
        setStores(result.stores);
        setUnclaimed(result.unclaimed);
        if (result.becameVendor) onBecameVendor();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /** Re-list stores + unclaimed, healing a missing flagship after removals. */
  const refresh = useCallback(async () => {
    let list = await listMyStores(userId);
    if (list.length > 0 && !list.some((s) => s.isFlagship)) {
      try {
        await setFlagshipStore(list[0].id);
        list = await listMyStores(userId);
      } catch { /* non-fatal — heals on next action */ }
    }
    setStores(list);
    setUnclaimed(await listUnclaimedVendors(userId));
  }, [userId]);

  async function openStore() {
    if (!stores) return;
    const name = newStoreName.trim();
    if (!name || creatingStore) return;
    setCreatingStore(true);
    setCreateError(null);
    try {
      const wasFirst = stores.length === 0;
      const created = await createStore(userId, name);
      setStores([...stores, created]);
      setNewStoreName('');
      if (wasFirst) onBecameVendor();
      // createStore writes Supabase directly — sync the seam's summaries.
      await vendors.reload();
    } catch (err) {
      setCreateError(errMsg(err));
    } finally {
      setCreatingStore(false);
    }
  }

  async function makeFlagship(storeId: string) {
    if (flagshipBusy) return;
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

  async function claim(vendorId: string) {
    if (claimBusyId) return;
    setClaimBusyId(vendorId);
    setClaimError(null);
    try {
      const wasEmpty = (stores?.length ?? 0) === 0;
      await claimVendorAsStore(userId, vendorId);
      if (wasEmpty) onBecameVendor();
      await refresh();
    } catch (err) {
      setClaimError(errMsg(err));
    } finally {
      setClaimBusyId(null);
    }
  }

  async function unregister(store: MyStoreRecord) {
    const ok = window.confirm(
      `Unregister “${store.name}”? It keeps its inventory and public page but stops being one of your stores — you can claim it back below while a slot is free.`,
    );
    if (!ok) return;
    setStoreActionError(null);
    try {
      await unregisterStore(userId, store.id);
      await refresh();
    } catch (err) {
      setStoreActionError(errMsg(err));
    }
  }

  async function deleteStore(store: MyStoreRecord) {
    const count = vendors.vendors.find((v) => v.id === store.id)?.inventoryCount ?? 0;
    const ok = window.confirm(
      `Delete “${store.name}” and their ${count} inventory items? This removes the store, its public page and its booth assignments for good.`,
    );
    if (!ok) return;
    setStoreActionError(null);
    try {
      await vendors.deleteVendor(store.id);
      await refresh();
    } catch (err) {
      setStoreActionError(errMsg(err));
    }
  }

  const canOpenStore = stores !== null && stores.length < STORE_LIMIT;
  const atCap = stores !== null && stores.length >= STORE_LIMIT;

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
    <>
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
            {stores.map((s) => {
              const summary = vendors.vendors.find((v) => v.id === s.id) ?? null;
              return (
                <div key={s.id} style={{ ...storeCardStyle, padding: 0, background: 'transparent', border: 'none' }}>
                  <StorePanel
                    store={s}
                    flagshipBusy={flagshipBusy}
                    onMakeFlagship={(id) => void makeFlagship(id)}
                  />
                  <div style={{ border: `1px solid ${HAIRLINE}`, borderTop: 'none', borderRadius: '0 0 4px 4px', background: 'rgba(0,0,0,0.18)', padding: '18px 20px' }}>
                    {summary ? (
                      <VendorManagementPanel
                        vendor={summary}
                        savedPlans={savedPlans.savedPlans}
                        onSetBanner={(file) => vendors.setVendorBanner(s.id, file)}
                        onRemoveBanner={() => vendors.removeVendorBanner(s.id)}
                        onAddManualShow={(name, date) => vendors.addManualShow(s.id, name, date)}
                        onRemoveManualShow={(showId) => vendors.removeManualShow(s.id, showId)}
                        onInventoryChanged={() => void vendors.reload()}
                      />
                    ) : (
                      <p style={{ margin: 0, fontSize: 14, color: MUTED }}>
                        {vendors.loading ? 'Loading inventory…' : 'Inventory unavailable — reload the page.'}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 22 }}>
                      <button
                        onClick={() => void unregister(s)}
                        title="Keep the vendor page + inventory but free this store slot"
                        style={{ ...ghostButtonStyle, padding: '7px 14px', fontSize: 11 }}
                      >
                        UNREGISTER STORE
                      </button>
                      <button
                        onClick={() => void deleteStore(s)}
                        style={{ ...ghostButtonStyle, padding: '7px 14px', fontSize: 11, color: '#c66', borderColor: 'rgba(204,102,102,0.4)' }}
                      >
                        DELETE STORE &amp; INVENTORY
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {flagshipError && <p style={errorTextStyle}>{flagshipError}</p>}
            {storeActionError && <p style={errorTextStyle}>{storeActionError}</p>}
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
          </>
        )}
      </section>

      {unclaimed.length > 0 && (
        <section style={panelStyle}>
          <h2 style={panelTitleStyle}>UNCLAIMED VENDOR PAGES</h2>
          <p style={{ ...noteStyle, margin: '0 0 14px' }}>
            Vendors you created outside My Stores. Claim one to register it as a store
            {atCap ? ' — store limit reached, free a slot first.' : '.'}
          </p>
          {unclaimed.map((v) => (
            <div
              key={v.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '10px 4px',
                borderBottom: '1px solid rgba(212,175,55,0.12)',
                fontSize: 14,
              }}
            >
              <span style={{ fontFamily: SERIF, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {v.name}
              </span>
              <span style={{ color: MUTED, fontSize: 12, whiteSpace: 'nowrap' }}>
                {new Date(v.createdAt).toLocaleDateString()}
              </span>
              <button
                onClick={() => void claim(v.id)}
                disabled={atCap || claimBusyId !== null}
                style={{
                  ...ghostButtonStyle,
                  padding: '6px 14px',
                  fontSize: 11,
                  opacity: atCap || claimBusyId !== null ? 0.5 : 1,
                  cursor: atCap || claimBusyId !== null ? 'not-allowed' : 'pointer',
                }}
              >
                {claimBusyId === v.id ? 'CLAIMING…' : 'CLAIM'}
              </button>
            </div>
          ))}
          {claimError && <p style={errorTextStyle}>{claimError}</p>}
        </section>
      )}
    </>
  );
}
