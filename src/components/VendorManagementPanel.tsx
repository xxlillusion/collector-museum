import { useCallback, useEffect, useRef, useState } from 'react';
import BulkInventoryPanel from './BulkInventoryPanel';
import { useVendorInventory } from '../lib/useVendorInventory';
import { fetchInterestCounts } from '../lib/interestService';
import { useProvider } from '../lib/provider/context';
import { deriveShowsAttended } from '../lib/vendorShows';
import type { VendorSummary } from '../lib/useVendors';
import type { InventoryStatus, SavedPlanRecord } from '../lib/db';
import { useTheme, withAlpha } from './themeKit';
import type { Theme } from './themeKit';

// Per-vendor management panels (banner / shows attended / inventory) shared
// by the sandbox Vendor Registry (VendorsScreen) and the account MY STORES
// tab. All data flows through the provider seam, so the same component works
// against IndexedDB and Supabase. May be mounted more than once at a time
// (one per store on the account tab) — no fixed DOM ids, per-instance timers.

interface VendorManagementPanelProps {
  vendor: VendorSummary;
  /** Feeds the derived shows-attended list. */
  savedPlans: SavedPlanRecord[];
  onSetBanner: (file: File) => Promise<void>;
  onRemoveBanner: () => Promise<void>;
  onAddManualShow: (name: string, date: string) => Promise<void>;
  onRemoveManualShow: (showId: string) => Promise<void>;
  /** Inventory counts shown by hosts live in their summaries — reload them. */
  onInventoryChanged: () => void;
}

// Themed style recipes — functions of the active theme so the panel restyles
// live. Every consumer of these exports lives in this component batch
// (VendorsScreen + this file); under 'refined' they produce exactly the old
// museumKit-derived objects.

/** Kit input adapted for flex rows (kit default is block + 100% width). */
export const rowInputStyle = (t: Theme): React.CSSProperties => ({
  ...t.input,
  display: 'inline-block',
  width: 'auto',
  fontSize: 13.5,
  padding: '9px 11px',
});

/** Compact ghost button for inline row actions. */
export const smallGhostStyle = (t: Theme): React.CSSProperties => ({
  ...t.ghostButton,
  padding: '8px 14px',
  fontSize: 12,
  letterSpacing: '0.08em',
});

/** Compact solid-accent action. */
export const smallPrimaryStyle = (t: Theme): React.CSSProperties => ({
  ...t.primaryButton,
  padding: '9px 18px',
  fontSize: 12,
  letterSpacing: '0.1em',
});

export const smallPrimaryDisabledStyle = (t: Theme): React.CSSProperties => ({
  ...t.primaryButtonDisabled,
  padding: '9px 18px',
  fontSize: 12,
  letterSpacing: '0.1em',
});

/** Floating ✕ over images (banner / inventory tiles). */
const removeBadgeStyle = (t: Theme): React.CSSProperties => ({
  position: 'absolute',
  top: 6,
  right: 6,
  background: 'rgba(0,0,0,0.75)',
  color: t.text,
  border: `${t.borderWidth}px solid ${t.border}`,
  borderRadius: '50%',
  width: 22,
  height: 22,
  cursor: 'pointer',
  fontSize: 11,
  lineHeight: '20px',
  textAlign: 'center',
  padding: 0,
});

/** Caption input with debounced persist so typing doesn't hammer the store. */
function CaptionInput({
  itemId,
  caption,
  onSave,
}: {
  itemId: string;
  caption: string;
  onSave: (id: string, caption: string) => void;
}) {
  const t = useTheme();
  const [value, setValue] = useState(caption);
  const timer = useRef<number | null>(null);
  // Re-sync when the underlying item changes (vendor switch reuses inputs)
  useEffect(() => setValue(caption), [itemId, caption]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (next: string) => {
    setValue(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onSave(itemId, next), 500);
  };

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return (
    <input
      type="text"
      placeholder="Add a caption…"
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      style={{ ...t.input, padding: '7px 9px', fontSize: 12, fontStyle: value ? 'normal' : 'italic' }}
    />
  );
}

const saleInputStyle = (t: Theme): React.CSSProperties => ({
  ...t.input,
  padding: '6px 8px',
  fontSize: 11.5,
});

/**
 * Price / status / condition per inventory tile. Price and condition are
 * debounced like captions; status saves immediately. Price accepts "$1,200"
 * style input and stores a number; empty clears it.
 */
function SaleFields({
  item,
  syncKey = 0,
  onSave,
}: {
  item: { id: string; price?: number; status?: InventoryStatus; condition?: string };
  /** Bump to force a re-sync from the item (bulk tools rewrite many items in place). */
  syncKey?: number;
  onSave: (
    id: string,
    patch: Partial<{ price: number | undefined; status: InventoryStatus; condition: string }>,
  ) => void;
}) {
  const t = useTheme();
  const saleInput = saleInputStyle(t);
  const [price, setPrice] = useState(item.price !== undefined ? String(item.price) : '');
  const [condition, setCondition] = useState(item.condition ?? '');
  const priceTimer = useRef<number | null>(null);
  const condTimer = useRef<number | null>(null);
  // Re-sync when the underlying item changes (vendor switch reuses inputs) or
  // after a bulk apply — never on plain price/condition echoes, so debounced
  // typing isn't clobbered by its own round-trip.
  useEffect(() => {
    setPrice(item.price !== undefined ? String(item.price) : '');
    setCondition(item.condition ?? '');
  }, [item.id, syncKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const queuePrice = (raw: string) => {
    setPrice(raw);
    if (priceTimer.current !== null) window.clearTimeout(priceTimer.current);
    priceTimer.current = window.setTimeout(() => {
      const n = Number(raw.replace(/[$,\s]/g, ''));
      onSave(item.id, { price: raw.trim() && Number.isFinite(n) && n >= 0 ? n : undefined });
    }, 500);
  };

  const queueCondition = (raw: string) => {
    setCondition(raw);
    if (condTimer.current !== null) window.clearTimeout(condTimer.current);
    condTimer.current = window.setTimeout(() => onSave(item.id, { condition: raw.trim() }), 500);
  };

  useEffect(() => () => {
    if (priceTimer.current !== null) window.clearTimeout(priceTimer.current);
    if (condTimer.current !== null) window.clearTimeout(condTimer.current);
  }, []);

  return (
    <>
      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
        <input
          type="text"
          inputMode="decimal"
          placeholder="$ price"
          title="Asking price (blank = no price shown)"
          value={price}
          onChange={(e) => queuePrice(e.target.value)}
          style={{ ...saleInput, width: '40%', minWidth: 0 }}
        />
        <select
          value={item.status ?? 'forSale'}
          title="Sale status"
          onChange={(e) => onSave(item.id, { status: e.target.value as InventoryStatus })}
          style={{ ...saleInput, flex: 1, minWidth: 0 }}
        >
          <option value="forSale">For sale</option>
          <option value="sold">Sold</option>
          <option value="display">Display only</option>
        </select>
      </div>
      <input
        type="text"
        placeholder="Condition (NM, PSA 9…)"
        value={condition}
        onChange={(e) => queueCondition(e.target.value)}
        style={{ ...saleInput, marginTop: '6px', fontStyle: condition ? 'normal' : 'italic' }}
      />
    </>
  );
}

export default function VendorManagementPanel({
  vendor,
  savedPlans,
  onSetBanner,
  onRemoveBanner,
  onAddManualShow,
  onRemoveManualShow,
  onInventoryChanged,
}: VendorManagementPanelProps) {
  const provider = useProvider();
  const t = useTheme();
  const rowInput = rowInputStyle(t);
  const smallGhost = smallGhostStyle(t);
  const smallPrimary = smallPrimaryStyle(t);
  const smallPrimaryDisabled = smallPrimaryDisabledStyle(t);
  const removeBadge = removeBadgeStyle(t);
  // Serif under Refined; the theme's body face otherwise (names, prompts).
  const contentFont = t.id === 'refined' ? t.fontDisplay : t.fontBody;
  const danger = t.id === 'refined' ? '#c66' : t.error;
  const [showName, setShowName] = useState('');
  const [showDate, setShowDate] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const inventoryInputRef = useRef<HTMLInputElement>(null);

  // Bumped after each bulk-tools batch so SaleFields re-syncs its debounced
  // local price/condition state from the freshly patched items.
  const [bulkVersion, setBulkVersion] = useState(0);

  // "Import my collection" — one-time copy of the user's own cards into this
  // vendor's inventory. Count loads up-front; records on demand.
  const [collectionCount, setCollectionCount] = useState(0);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importing = importProgress !== null;

  const inventory = useVendorInventory(vendor.id);

  // Demand signals ("interested" hearts) — cloud accounts only; the interests
  // RLS only shows a vendor the rows on their own items.
  const [interestCounts, setInterestCounts] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    setInterestCounts(new Map());
    if (provider.kind !== 'remote') return;
    let cancelled = false;
    fetchInterestCounts(vendor.id).then((counts) => {
      if (!cancelled) setInterestCounts(counts);
    });
    return () => { cancelled = true; };
  }, [vendor.id, provider.kind]);

  useEffect(() => {
    let cancelled = false;
    provider.getCards().then((cards) => {
      if (!cancelled) setCollectionCount(cards.length);
    });
    return () => { cancelled = true; };
  }, [provider]);

  // Stale import feedback shouldn't follow you to another vendor
  useEffect(() => {
    setImportError(null);
  }, [vendor.id]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      await inventory.addItems(Array.from(files));
      onInventoryChanged();
    } finally {
      setUploading(false);
    }
  }, [inventory, onInventoryChanged]);

  /**
   * One-time copy: every card in the user's collection becomes an inventory
   * item for this vendor (card name → caption). No linkage remains after the
   * copy — later card edits/deletes don't touch the inventory.
   */
  const handleImportCollection = useCallback(async () => {
    if (importing) return;
    const vendorId = vendor.id;
    const vendorName = vendor.name;
    setImportError(null);

    const cards = await provider.getCards();
    setCollectionCount(cards.length);
    if (cards.length === 0) return;

    const ok = window.confirm(
      `Copy all ${cards.length} cards from your collection into ${vendorName}'s inventory? Existing inventory is untouched.`,
    );
    if (!ok) return;

    let copied = 0;
    try {
      for (const card of cards) {
        copied += 1;
        setImportProgress(`Importing ${copied} / ${cards.length}…`);
        const file = new File(
          [card.imageBlob],
          `${card.name || 'card'}.webp`,
          { type: card.imageBlob.type || 'image/webp' },
        );
        const item = await provider.saveInventoryItem(vendorId, file);
        if (card.name) {
          await provider.updateInventoryItem(item.id, { caption: card.name });
        }
      }
    } catch (err) {
      setImportError(
        `Import stopped after ${copied - 1} of ${cards.length} cards: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setImportProgress(null);
      await inventory.reload();
      onInventoryChanged();
    }
  }, [vendor.id, vendor.name, importing, provider, inventory, onInventoryChanged]);

  const handleAddShow = useCallback(async () => {
    if (!showName.trim() || !showDate) return;
    await onAddManualShow(showName.trim(), showDate);
    setShowName('');
    setShowDate('');
  }, [showName, showDate, onAddManualShow]);

  const shows = deriveShowsAttended(vendor.id, vendor.manualShows, savedPlans);

  return (
    <div>
      {/* Banner */}
      <div style={t.panelStyle}>
        <div style={t.panelTitle}>TABLE BANNER</div>
        <div style={{ ...t.note, fontSize: 12.5, marginBottom: '12px' }}>
          Shown on the front of their tables in the hall — their name on the cloth if empty.
        </div>
        <div
          onClick={() => bannerInputRef.current?.click()}
          style={{
            position: 'relative', borderRadius: t.radius,
            border: `${t.borderWidth}px ${vendor.bannerUrl ? 'solid' : 'dashed'} ${t.border}`,
            background: t.bg, cursor: 'pointer', padding: vendor.bannerUrl ? '8px' : '22px',
            textAlign: 'center', maxWidth: '420px',
          }}
        >
          {vendor.bannerUrl ? (
            <>
              <img
                src={vendor.bannerUrl}
                alt={`${vendor.name} banner`}
                style={{ width: '100%', maxHeight: '110px', objectFit: 'contain', display: 'block' }}
              />
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveBanner(); }}
                title="Remove banner"
                style={removeBadge}
              >
                ✕
              </button>
            </>
          ) : (
            <div style={{ fontFamily: contentFont, fontSize: '13px', color: t.muted }}>
              Add a banner image — click to browse
            </div>
          )}
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && file.type.startsWith('image/')) onSetBanner(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Shows attended */}
      <div style={t.panelStyle}>
        <div style={t.panelTitle}>SHOWS ATTENDED</div>
        <div style={{ ...t.note, fontSize: 12.5, marginBottom: '12px' }}>
          Past shows from saved floor plans they're assigned in appear automatically.
        </div>
        {shows.length === 0 && (
          <p style={{ ...t.note, margin: '0 0 12px', fontSize: 13 }}>
            None yet.
          </p>
        )}
        {shows.map((s) => (
          <div
            key={s.id}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '9px 10px', borderBottom: `1px solid ${withAlpha(t.accent, 0.12)}`, fontSize: '13.5px',
            }}
          >
            <span style={{ fontFamily: contentFont, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {s.name}
            </span>
            <span style={{ color: t.muted, fontSize: '12px', whiteSpace: 'nowrap' }}>{s.date}</span>
            {s.source === 'plan' ? (
              <span style={{ color: t.muted, fontSize: '10.5px', letterSpacing: '0.08em', border: `${t.borderWidth}px solid ${t.border}`, borderRadius: '3px', padding: '2px 6px', whiteSpace: 'nowrap', fontFamily: t.id === 'refined' ? undefined : t.fontMono }}>
                FLOOR PLAN
              </span>
            ) : (
              <button
                onClick={() => onRemoveManualShow(s.id)}
                title="Remove"
                style={{ ...smallGhost, padding: '3px 8px', fontSize: 11, color: danger }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Show name"
            value={showName}
            onChange={(e) => setShowName(e.target.value)}
            style={{ ...rowInput, flex: 1, minWidth: '140px' }}
          />
          <input
            type="date"
            value={showDate}
            onChange={(e) => setShowDate(e.target.value)}
            style={rowInput}
          />
          <button
            onClick={handleAddShow}
            disabled={!showName.trim() || !showDate}
            style={showName.trim() && showDate ? smallPrimary : smallPrimaryDisabled}
          >
            ADD SHOW
          </button>
        </div>
      </div>

      {/* Inventory */}
      <div style={{ ...t.panelStyle, marginBottom: 0 }}>
        <div style={t.panelTitle}>INVENTORY</div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inventoryInputRef.current?.click()}
          style={{
            border: `${t.borderWidth}px dashed ${dragging ? t.accent : t.border}`,
            borderRadius: '4px', padding: '22px', textAlign: 'center', cursor: 'pointer',
            background: dragging ? withAlpha(t.accent, 0.08) : t.bg,
            transition: 'all 0.2s', marginBottom: '14px',
          }}
        >
          <div style={{ fontFamily: contentFont, fontSize: '13.5px' }}>
            {uploading ? 'Cataloguing inventory…' : 'Add inventory images'}
          </div>
          <div style={{ fontSize: '11.5px', color: t.muted, marginTop: '6px', letterSpacing: '0.05em' }}>
            Drop images here, or click to browse — each can carry a caption
          </div>
          <input
            ref={inventoryInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />
        </div>

        {/* One-time copy from the user's own card collection */}
        {collectionCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '18px' }}>
            <button
              onClick={handleImportCollection}
              disabled={importing || uploading}
              style={{
                ...smallGhost,
                opacity: importing || uploading ? 0.5 : 1,
                cursor: importing || uploading ? 'not-allowed' : 'pointer',
              }}
            >
              IMPORT MY COLLECTION ({collectionCount})
            </button>
            {importProgress ? (
              <span style={{ fontFamily: t.fontMono, fontSize: '12.5px', color: t.accent, letterSpacing: '0.04em' }}>
                {importProgress}
              </span>
            ) : (
              <span style={{ ...t.note, fontSize: 11.5 }}>
                A one-time copy — captions from card names.
              </span>
            )}
          </div>
        )}
        {importError && (
          <p style={{ ...t.errorText, margin: '0 0 18px' }}>{importError}</p>
        )}

        {/* Paste-from-spreadsheet bulk editing (captions / prices / status) */}
        {inventory.items.length > 0 && (
          <BulkInventoryPanel
            items={inventory.items}
            onBulkUpdate={inventory.bulkUpdate}
            onDone={() => {
              setBulkVersion((v) => v + 1);
              onInventoryChanged();
            }}
          />
        )}

        {inventory.items.length === 0 && !inventory.loading && (
          <p style={{ ...t.note, margin: 0, fontSize: 13 }}>
            No inventory yet.
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '18px' }}>
          {inventory.items.map((item) => (
            <figure key={item.id} style={{ margin: 0, position: 'relative' }}>
              <img
                src={item.imageUrl}
                alt={item.caption || 'Inventory item'}
                style={{
                  width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block',
                  ...t.cardFrame,
                }}
              />
              <button
                onClick={() => { inventory.removeItem(item.id).then(onInventoryChanged); }}
                title="Remove item"
                style={removeBadge}
              >
                ✕
              </button>
              {(interestCounts.get(item.id) ?? 0) > 0 && (
                <div
                  title="Visitors who tapped “I'm interested” on this item"
                  style={{
                    position: 'absolute', top: 6, left: 6,
                    background: 'rgba(0,0,0,0.75)', color: t.accent,
                    border: `${t.borderWidth}px solid ${t.border}`, borderRadius: '10px',
                    padding: '2px 8px', fontSize: '10.5px', letterSpacing: '0.06em',
                    fontFamily: t.id === 'refined' ? undefined : t.fontMono,
                  }}
                >
                  ♥ {interestCounts.get(item.id)}
                </div>
              )}
              <div style={{ marginTop: '8px' }}>
                <CaptionInput itemId={item.id} caption={item.caption} onSave={inventory.setCaption} />
              </div>
              <SaleFields item={item} syncKey={bulkVersion} onSave={inventory.setSale} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '11px', color: t.muted, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={item.visible}
                  onChange={(e) => inventory.setVisible(item.id, e.target.checked)}
                  style={{ accentColor: t.accent }}
                />
                <span title="Shown on your public profile and in show binders">
                  Public
                </span>
              </label>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
