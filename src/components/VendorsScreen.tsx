import { useCallback, useEffect, useRef, useState } from 'react';
import { useVendorInventory } from '../lib/useVendorInventory';
import { deriveShowsAttended } from '../lib/vendorShows';
import type { VendorSummary } from '../lib/useVendors';
import type { SavedPlanRecord } from '../lib/db';

// Vendor registry — create vendors, manage their banner, inventory (captioned
// images) and shows attended. Same "Museum Refined" visual language as
// HomeScreen. Inventory loads lazily for the selected vendor only.

const GOLD = '#d4af37';
const BG = '#171310';
const PANEL = '#1e1915';
const HAIRLINE = 'rgba(212,175,55,0.28)';
const TEXT = '#e8e4dc';
const MUTED = '#9a8f7d';
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';

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

const inputStyle: React.CSSProperties = {
  background: '#0d0b0a',
  color: TEXT,
  border: '1px solid #555',
  borderRadius: '4px',
  padding: '9px 11px',
  fontSize: '13.5px',
  fontFamily: SERIF,
};

const smallButton: React.CSSProperties = {
  background: 'transparent',
  color: TEXT,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: '3px',
  padding: '8px 14px',
  fontSize: '12px',
  letterSpacing: '0.08em',
  cursor: 'pointer',
  fontFamily: SERIF,
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
      style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', padding: '7px 9px', fontSize: '12px', fontStyle: value ? 'normal' : 'italic' }}
    />
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [showName, setShowName] = useState('');
  const [showDate, setShowDate] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const selected = vendors.find((v) => v.id === selectedId) ?? null;
  const inventory = useVendorInventory(selectedId);

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
    <div style={{ height: '100vh', overflowY: 'auto', boxSizing: 'border-box', background: BG, color: TEXT, fontFamily: SANS }}>
      <style>{`
        .vendor-row { transition: background 0.15s ease; cursor: pointer; }
        .vendor-row:hover { background: rgba(212,175,55,0.06); }
      `}</style>
      <div style={{ maxWidth: '980px', margin: '0 auto', padding: '56px 28px 80px' }}>
        <header style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: '34px', fontWeight: 400, letterSpacing: '0.18em', color: GOLD }}>
            VENDOR REGISTRY
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: '12px', color: MUTED, letterSpacing: '0.12em' }}>
            {vendors.length === 0
              ? 'NO VENDORS YET — ADD YOUR FIRST BELOW'
              : `${vendors.length} ${vendors.length === 1 ? 'VENDOR' : 'VENDORS'} ON FILE`}
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: '36px', alignItems: 'start' }}>
          {/* ---- Vendor list ---- */}
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
              <input
                type="text"
                placeholder="New vendor name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                style={{ ...inputStyle, flex: 1, minWidth: 0 }}
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                style={{
                  ...smallButton,
                  background: newName.trim() ? GOLD : '#332b1e',
                  color: newName.trim() ? '#1a1614' : '#7a6c50',
                  border: 'none',
                  cursor: newName.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Add
              </button>
            </div>

            {vendors.map((v) => (
              <div
                key={v.id}
                className="vendor-row"
                onClick={() => setSelectedId(v.id)}
                style={{
                  padding: '12px 12px',
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
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '28px' }}>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  style={{ ...inputStyle, fontSize: '19px', fontFamily: SERIF, flex: 1, minWidth: 0, letterSpacing: '0.06em' }}
                />
                <button
                  onClick={() => {
                    if (window.confirm(`Delete “${selected.name}” and their ${selected.inventoryCount} inventory items? Floor-plan spots assigned to them become unassigned.`)) {
                      onDeleteVendor(selected.id);
                    }
                  }}
                  style={{ ...smallButton, color: '#c66', borderColor: 'rgba(204,102,102,0.4)' }}
                >
                  Delete
                </button>
              </div>

              {/* Banner */}
              <div style={{ marginBottom: '32px' }}>
                <div style={{ fontFamily: SERIF, fontSize: '13px', letterSpacing: '0.14em', color: GOLD, marginBottom: '8px' }}>
                  TABLE BANNER
                </div>
                <div style={{ fontSize: '11.5px', color: MUTED, marginBottom: '10px', letterSpacing: '0.04em' }}>
                  Shown on the front of their tables in the hall — their name on the cloth if empty.
                </div>
                <div
                  onClick={() => document.getElementById('vendor-banner-input')?.click()}
                  style={{
                    position: 'relative', borderRadius: '2px',
                    border: `1px ${selected.bannerUrl ? 'solid' : 'dashed'} ${HAIRLINE}`,
                    background: PANEL, cursor: 'pointer', padding: selected.bannerUrl ? '8px' : '22px',
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
                        style={{
                          position: 'absolute', top: '6px', right: '6px',
                          background: 'rgba(0,0,0,0.75)', color: TEXT, border: `1px solid ${HAIRLINE}`,
                          borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer',
                          fontSize: '11px', lineHeight: '20px', textAlign: 'center', padding: 0,
                        }}
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
              <div style={{ marginBottom: '32px' }}>
                <div style={{ fontFamily: SERIF, fontSize: '13px', letterSpacing: '0.14em', color: GOLD, marginBottom: '8px' }}>
                  SHOWS ATTENDED
                </div>
                <div style={{ fontSize: '11.5px', color: MUTED, marginBottom: '10px', letterSpacing: '0.04em' }}>
                  Past shows from saved floor plans they're assigned in appear automatically.
                </div>
                {shows.length === 0 && (
                  <p style={{ margin: '0 0 12px', fontFamily: SERIF, fontStyle: 'italic', fontSize: '13px', color: MUTED }}>
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
                        style={{ ...smallButton, padding: '3px 8px', fontSize: '11px', color: '#c66' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Show name"
                    value={showName}
                    onChange={(e) => setShowName(e.target.value)}
                    style={{ ...inputStyle, flex: 1, minWidth: '140px' }}
                  />
                  <input
                    type="date"
                    value={showDate}
                    onChange={(e) => setShowDate(e.target.value)}
                    style={{ ...inputStyle, colorScheme: 'dark' }}
                  />
                  <button
                    onClick={handleAddShow}
                    disabled={!showName.trim() || !showDate}
                    style={{
                      ...smallButton,
                      background: showName.trim() && showDate ? GOLD : '#332b1e',
                      color: showName.trim() && showDate ? '#1a1614' : '#7a6c50',
                      border: 'none',
                      cursor: showName.trim() && showDate ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Add show
                  </button>
                </div>
              </div>

              {/* Inventory */}
              <div>
                <div style={{ fontFamily: SERIF, fontSize: '13px', letterSpacing: '0.14em', color: GOLD, marginBottom: '8px' }}>
                  INVENTORY
                </div>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                  onClick={() => document.getElementById('vendor-inventory-input')?.click()}
                  style={{
                    border: `1px dashed ${dragging ? GOLD : HAIRLINE}`,
                    borderRadius: '4px', padding: '22px', textAlign: 'center', cursor: 'pointer',
                    background: dragging ? 'rgba(212,175,55,0.08)' : PANEL,
                    transition: 'all 0.2s', marginBottom: '20px',
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

                {inventory.items.length === 0 && !inventory.loading && (
                  <p style={{ margin: 0, fontFamily: SERIF, fontStyle: 'italic', fontSize: '13px', color: MUTED }}>
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
                        style={{
                          position: 'absolute', top: '6px', right: '6px',
                          background: 'rgba(0,0,0,0.75)', color: TEXT, border: `1px solid ${HAIRLINE}`,
                          borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer',
                          fontSize: '11px', lineHeight: '20px', textAlign: 'center', padding: 0,
                        }}
                      >
                        ✕
                      </button>
                      <div style={{ marginTop: '8px' }}>
                        <CaptionInput itemId={item.id} caption={item.caption} onSave={inventory.setCaption} />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '11px', color: MUTED, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={item.visible}
                          onChange={(e) => inventory.setVisible(item.id, e.target.checked)}
                          style={{ accentColor: GOLD }}
                        />
                        Public on profile (future)
                      </label>
                    </figure>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '14px', color: MUTED, marginTop: '8px' }}>
              Add a vendor to start building their profile — banner, inventory and show history.
            </p>
          )}
        </div>

        <footer style={{ textAlign: 'center', marginTop: '56px' }}>
          <button
            onClick={onBack}
            style={{ ...smallButton, border: 'none', color: MUTED, fontSize: '13px' }}
          >
            ← Back to the museum
          </button>
        </footer>
      </div>
    </div>
  );
}
