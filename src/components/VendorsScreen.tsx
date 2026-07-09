import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { isSupabaseConfigured } from '../lib/supabase';
import BulkInventoryPanel from './BulkInventoryPanel';
import { useVendorInventory } from '../lib/useVendorInventory';
import { fetchInterestCounts } from '../lib/interestService';
import { useProvider } from '../lib/provider/context';
import { deriveShowsAttended } from '../lib/vendorShows';
import type { VendorSummary } from '../lib/useVendors';
import type { InventoryStatus, SavedPlanRecord } from '../lib/db';
import {
  GOLD,
  HAIRLINE,
  TEXT,
  MUTED,
  SERIF,
  SANS,
  PAGE_BG,
  panelStyle,
  panelTitleStyle,
  ghostButtonStyle,
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  inputStyle,
  noteStyle,
  errorTextStyle,
  museumHoverCss,
  Ornament,
} from './museumKit';

// Vendor registry — create vendors, manage their banner, inventory (captioned
// images) and shows attended. "Museum Refined" language via museumKit.
// Inventory loads lazily for the selected vendor only.

interface VendorsScreenProps {
  vendors: VendorSummary[];
  savedPlans: SavedPlanRecord[];
  onAddVendor: (name: string) => Promise<string>;
  onRenameVendor: (id: string, name: string) => Promise<void>;
  onDeleteVendor: (id: string) => Promise<void>;
  onSetVendorBanner: (id: string, file: File) => Promise<void>;
  onRemoveVendorBanner: (id: string) => Promise<void>;
  onAddManualShow: (id: string, name: string, date: string) => Promise<void>;
  onRemoveManualShow: (id: string, showId: string) => Promise<void>;
  /** Inventory counts shown in the list live in the parent's summaries. */
  onInventoryChanged: () => void;
  onBack: () => void;
}

/** Kit input adapted for flex rows (kit default is block + 100% width). */
const rowInputStyle: React.CSSProperties = {
  ...inputStyle,
  display: 'inline-block',
  width: 'auto',
  fontSize: 13.5,
  padding: '9px 11px',
};

/** Compact ghost button for inline row actions. */
const smallGhostStyle: React.CSSProperties = {
  ...ghostButtonStyle,
  padding: '8px 14px',
  fontSize: 12,
  letterSpacing: '0.08em',
};

/** Compact solid-gold action. */
const smallPrimaryStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  padding: '9px 18px',
  fontSize: 12,
  letterSpacing: '0.1em',
};

const smallPrimaryDisabledStyle: React.CSSProperties = {
  ...primaryButtonDisabledStyle,
  padding: '9px 18px',
  fontSize: 12,
  letterSpacing: '0.1em',
};

/** Floating ✕ over images (banner / inventory tiles). */
const removeBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 6,
  background: 'rgba(0,0,0,0.75)',
  color: TEXT,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: '50%',
  width: 22,
  height: 22,
  cursor: 'pointer',
  fontSize: 11,
  lineHeight: '20px',
  textAlign: 'center',
  padding: 0,
};

/** Caption input with debounced persist so typing doesn't hammer IndexedDB. */
function CaptionInput({
  itemId,
  caption,
  onSave,
}: {
  itemId: string;
  caption: string;
  onSave: (id: string, caption: string) => void;
}) {
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
      style={{ ...inputStyle, padding: '7px 9px', fontSize: 12, fontStyle: value ? 'normal' : 'italic' }}
    />
  );
}

const saleInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '6px 8px',
  fontSize: 11.5,
};

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
          style={{ ...saleInputStyle, width: '40%', minWidth: 0 }}
        />
        <select
          value={item.status ?? 'forSale'}
          title="Sale status"
          onChange={(e) => onSave(item.id, { status: e.target.value as InventoryStatus })}
          style={{ ...saleInputStyle, flex: 1, minWidth: 0 }}
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
        style={{ ...saleInputStyle, marginTop: '6px', fontStyle: condition ? 'normal' : 'italic' }}
      />
    </>
  );
}

export default function VendorsScreen({
  vendors,
  savedPlans,
  onAddVendor,
  onRenameVendor,
  onDeleteVendor,
  onSetVendorBanner,
  onRemoveVendorBanner,
  onAddManualShow,
  onRemoveManualShow,
  onInventoryChanged,
  onBack,
}: VendorsScreenProps) {
  const provider = useProvider();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [showName, setShowName] = useState('');
  const [showDate, setShowDate] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Bumped after each bulk-tools batch so SaleFields re-syncs its debounced
  // local price/condition state from the freshly patched items.
  const [bulkVersion, setBulkVersion] = useState(0);

  // "Import my collection" — one-time copy of the user's own cards into the
  // selected vendor's inventory. Count loads up-front; records on demand.
  const [collectionCount, setCollectionCount] = useState(0);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importing = importProgress !== null;

  const selected = vendors.find((v) => v.id === selectedId) ?? null;
  const inventory = useVendorInventory(selectedId);

  // Demand signals ("interested" hearts) — cloud accounts only; the interests
  // RLS only shows a vendor the rows on their own items.
  const [interestCounts, setInterestCounts] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    setInterestCounts(new Map());
    if (!selectedId || provider.kind !== 'remote') return;
    let cancelled = false;
    fetchInterestCounts(selectedId).then((counts) => {
      if (!cancelled) setInterestCounts(counts);
    });
    return () => { cancelled = true; };
  }, [selectedId, provider.kind]);

  useEffect(() => {
    let cancelled = false;
    provider.getCards().then((cards) => {
      if (!cancelled) setCollectionCount(cards.length);
    });
    return () => { cancelled = true; };
  }, [provider]);

  // Keep something sensibly selected as the list changes
  useEffect(() => {
    if (!selectedId && vendors.length > 0) setSelectedId(vendors[0].id);
    else if (selectedId && !vendors.some((v) => v.id === selectedId)) {
      setSelectedId(vendors[0]?.id ?? null);
    }
  }, [vendors, selectedId]);

  useEffect(() => {
    setNameDraft(selected?.name ?? '');
  }, [selected?.id, selected?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stale import feedback shouldn't follow you to another vendor
  useEffect(() => {
    setImportError(null);
  }, [selectedId]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    const id = await onAddVendor(name);
    setNewName('');
    setSelectedId(id);
  }, [newName, onAddVendor]);

  const commitRename = useCallback(() => {
    const name = nameDraft.trim();
    if (selected && name && name !== selected.name) {
      onRenameVendor(selected.id, name);
    }
  }, [nameDraft, selected, onRenameVendor]);

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
   * item for the selected vendor (card name → caption). No linkage remains
   * after the copy — later card edits/deletes don't touch the inventory.
   */
  const handleImportCollection = useCallback(async () => {
    if (!selected || importing) return;
    const vendorId = selected.id;
    const vendorName = selected.name;
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
  }, [selected, importing, provider, inventory, onInventoryChanged]);

  const handleAddShow = useCallback(async () => {
    if (!selected || !showName.trim() || !showDate) return;
    await onAddManualShow(selected.id, showName.trim(), showDate);
    setShowName('');
    setShowDate('');
  }, [selected, showName, showDate, onAddManualShow]);

  const shows = selected
    ? deriveShowsAttended(selected.id, selected.manualShows, savedPlans)
    : [];

  return (
    <div style={{ height: '100vh', overflowY: 'auto', boxSizing: 'border-box', background: PAGE_BG, color: TEXT, fontFamily: SANS }}>
      <style>{museumHoverCss}</style>
      <div style={{ maxWidth: '980px', margin: '0 auto', padding: '56px 28px 80px' }}>
        <header style={{ textAlign: 'center', marginBottom: '44px' }}>
          <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: '34px', fontWeight: 400, letterSpacing: '0.18em', color: GOLD }}>
            VENDOR REGISTRY
          </h1>
          <p style={{ margin: '12px 0 16px', fontSize: '12px', color: MUTED, letterSpacing: '0.24em' }}>
            YOUR STORES &amp; THEIR INVENTORY
          </p>
          <Ornament />
          <p style={{ margin: '16px 0 0', fontSize: '11.5px', color: MUTED, letterSpacing: '0.12em' }}>
            {vendors.length === 0
              ? 'NO VENDORS YET — ADD YOUR FIRST BELOW'
              : `${vendors.length} ${vendors.length === 1 ? 'VENDOR' : 'VENDORS'} ON FILE`}
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: '36px', alignItems: 'start' }}>
          {/* ---- Vendor list ---- */}
          <div style={{ ...panelStyle, padding: '18px 16px', marginBottom: 0 }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
              <input
                type="text"
                placeholder="New vendor name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                style={{ ...rowInputStyle, flex: 1, minWidth: 0 }}
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                style={newName.trim() ? smallPrimaryStyle : smallPrimaryDisabledStyle}
              >
                ADD
              </button>
            </div>

            {vendors.map((v) => (
              <div
                key={v.id}
                className="museum-row"
                onClick={() => setSelectedId(v.id)}
                style={{
                  padding: '12px 12px',
                  cursor: 'pointer',
                  borderLeft: v.id === selectedId ? `2px solid ${GOLD}` : '2px solid transparent',
                  borderBottom: '1px solid rgba(212,175,55,0.12)',
                  background: v.id === selectedId ? 'rgba(212,175,55,0.08)' : 'transparent',
                }}
              >
                <div style={{ fontFamily: SERIF, fontSize: '14.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.name}
                </div>
                <div style={{ fontSize: '11px', color: MUTED, marginTop: '3px', letterSpacing: '0.05em' }}>
                  {v.inventoryCount} {v.inventoryCount === 1 ? 'item' : 'items'}
                  {v.bannerUrl ? ' · banner' : ''}
                </div>
              </div>
            ))}
          </div>

          {/* ---- Selected vendor profile ---- */}
          {selected ? (
            <div>
              {/* Name + delete */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '24px' }}>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  style={{ ...rowInputStyle, fontSize: '19px', flex: 1, minWidth: 0, letterSpacing: '0.06em' }}
                />
                <button
                  onClick={() => {
                    if (window.confirm(`Delete “${selected.name}” and their ${selected.inventoryCount} inventory items? Floor-plan spots assigned to them become unassigned.`)) {
                      onDeleteVendor(selected.id);
                    }
                  }}
                  style={{ ...smallGhostStyle, color: '#c66', borderColor: 'rgba(204,102,102,0.4)' }}
                >
                  DELETE
                </button>
              </div>

              {isSupabaseConfigured && (
                <div style={{ margin: '-14px 0 24px' }}>
                  <Link
                    href={`/vendor/${selected.id}`}
                    style={{ color: GOLD, textDecoration: 'none', fontSize: '12.5px', letterSpacing: '0.06em', fontFamily: SERIF }}
                  >
                    View public page →
                  </Link>
                </div>
              )}

              {/* Banner */}
              <div style={panelStyle}>
                <div style={panelTitleStyle}>TABLE BANNER</div>
                <div style={{ ...noteStyle, fontSize: 12.5, marginBottom: '12px' }}>
                  Shown on the front of their tables in the hall — their name on the cloth if empty.
                </div>
                <div
                  onClick={() => document.getElementById('vendor-banner-input')?.click()}
                  style={{
                    position: 'relative', borderRadius: '2px',
                    border: `1px ${selected.bannerUrl ? 'solid' : 'dashed'} ${HAIRLINE}`,
                    background: '#171310', cursor: 'pointer', padding: selected.bannerUrl ? '8px' : '22px',
                    textAlign: 'center', maxWidth: '420px',
                  }}
                >
                  {selected.bannerUrl ? (
                    <>
                      <img
                        src={selected.bannerUrl}
                        alt={`${selected.name} banner`}
                        style={{ width: '100%', maxHeight: '110px', objectFit: 'contain', display: 'block' }}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveVendorBanner(selected.id); }}
                        title="Remove banner"
                        style={removeBadgeStyle}
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <div style={{ fontFamily: SERIF, fontSize: '13px', color: MUTED }}>
                      Add a banner image — click to browse
                    </div>
                  )}
                  <input
                    id="vendor-banner-input"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && file.type.startsWith('image/')) onSetVendorBanner(selected.id, file);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              {/* Shows attended */}
              <div style={panelStyle}>
                <div style={panelTitleStyle}>SHOWS ATTENDED</div>
                <div style={{ ...noteStyle, fontSize: 12.5, marginBottom: '12px' }}>
                  Past shows from saved floor plans they're assigned in appear automatically.
                </div>
                {shows.length === 0 && (
                  <p style={{ ...noteStyle, margin: '0 0 12px', fontSize: 13 }}>
                    None yet.
                  </p>
                )}
                {shows.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '9px 10px', borderBottom: '1px solid rgba(212,175,55,0.12)', fontSize: '13.5px',
                    }}
                  >
                    <span style={{ fontFamily: SERIF, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.name}
                    </span>
                    <span style={{ color: MUTED, fontSize: '12px', whiteSpace: 'nowrap' }}>{s.date}</span>
                    {s.source === 'plan' ? (
                      <span style={{ color: MUTED, fontSize: '10.5px', letterSpacing: '0.08em', border: `1px solid ${HAIRLINE}`, borderRadius: '3px', padding: '2px 6px', whiteSpace: 'nowrap' }}>
                        FLOOR PLAN
                      </span>
                    ) : (
                      <button
                        onClick={() => onRemoveManualShow(selected.id, s.id)}
                        title="Remove"
                        style={{ ...smallGhostStyle, padding: '3px 8px', fontSize: 11, color: '#c66' }}
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
                    style={{ ...rowInputStyle, flex: 1, minWidth: '140px' }}
                  />
                  <input
                    type="date"
                    value={showDate}
                    onChange={(e) => setShowDate(e.target.value)}
                    style={rowInputStyle}
                  />
                  <button
                    onClick={handleAddShow}
                    disabled={!showName.trim() || !showDate}
                    style={showName.trim() && showDate ? smallPrimaryStyle : smallPrimaryDisabledStyle}
                  >
                    ADD SHOW
                  </button>
                </div>
              </div>

              {/* Inventory */}
              <div style={{ ...panelStyle, marginBottom: 0 }}>
                <div style={panelTitleStyle}>INVENTORY</div>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                  onClick={() => document.getElementById('vendor-inventory-input')?.click()}
                  style={{
                    border: `1px dashed ${dragging ? GOLD : HAIRLINE}`,
                    borderRadius: '4px', padding: '22px', textAlign: 'center', cursor: 'pointer',
                    background: dragging ? 'rgba(212,175,55,0.08)' : '#171310',
                    transition: 'all 0.2s', marginBottom: '14px',
                  }}
                >
                  <div style={{ fontFamily: SERIF, fontSize: '13.5px' }}>
                    {uploading ? 'Cataloguing inventory…' : 'Add inventory images'}
                  </div>
                  <div style={{ fontSize: '11.5px', color: MUTED, marginTop: '6px', letterSpacing: '0.05em' }}>
                    Drop images here, or click to browse — each can carry a caption
                  </div>
                  <input
                    id="vendor-inventory-input"
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
                        ...smallGhostStyle,
                        opacity: importing || uploading ? 0.5 : 1,
                        cursor: importing || uploading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      IMPORT MY COLLECTION ({collectionCount})
                    </button>
                    {importProgress ? (
                      <span style={{ fontFamily: SERIF, fontSize: '12.5px', color: GOLD, letterSpacing: '0.04em' }}>
                        {importProgress}
                      </span>
                    ) : (
                      <span style={{ ...noteStyle, fontSize: 11.5 }}>
                        A one-time copy — captions from card names.
                      </span>
                    )}
                  </div>
                )}
                {importError && (
                  <p style={{ ...errorTextStyle, margin: '0 0 18px' }}>{importError}</p>
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
                  <p style={{ ...noteStyle, margin: 0, fontSize: 13 }}>
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
                          borderRadius: '2px', border: '3px solid #3a2f1e',
                          outline: `1px solid ${HAIRLINE}`, outlineOffset: '3px', boxSizing: 'border-box',
                        }}
                      />
                      <button
                        onClick={() => { inventory.removeItem(item.id).then(onInventoryChanged); }}
                        title="Remove item"
                        style={removeBadgeStyle}
                      >
                        ✕
                      </button>
                      {(interestCounts.get(item.id) ?? 0) > 0 && (
                        <div
                          title="Visitors who tapped “I'm interested” on this item"
                          style={{
                            position: 'absolute', top: 6, left: 6,
                            background: 'rgba(0,0,0,0.75)', color: GOLD,
                            border: `1px solid ${HAIRLINE}`, borderRadius: '10px',
                            padding: '2px 8px', fontSize: '10.5px', letterSpacing: '0.06em',
                          }}
                        >
                          ♥ {interestCounts.get(item.id)}
                        </div>
                      )}
                      <div style={{ marginTop: '8px' }}>
                        <CaptionInput itemId={item.id} caption={item.caption} onSave={inventory.setCaption} />
                      </div>
                      <SaleFields item={item} syncKey={bulkVersion} onSave={inventory.setSale} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '11px', color: MUTED, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={item.visible}
                          onChange={(e) => inventory.setVisible(item.id, e.target.checked)}
                          style={{ accentColor: GOLD }}
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
          ) : (
            <p style={{ ...noteStyle, marginTop: '8px' }}>
              Add a vendor to start building their profile — banner, inventory and show history.
            </p>
          )}
        </div>

        <footer style={{ textAlign: 'center', marginTop: '56px' }}>
          <button
            onClick={onBack}
            style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: '13px', letterSpacing: '0.08em', fontFamily: SERIF, cursor: 'pointer', padding: '8px 14px' }}
          >
            ← Back to the museum
          </button>
        </footer>
      </div>
    </div>
  );
}
