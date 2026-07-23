import { useCallback, useEffect, useState } from 'react';
import VendorManagementPanel, {
  rowInputStyle,
  smallGhostStyle,
  smallPrimaryStyle,
  smallPrimaryDisabledStyle,
} from './VendorManagementPanel';
import type { VendorSummary } from '../lib/useVendors';
import type { SavedPlanRecord } from '../lib/db';
import { Ornament, useTheme, withAlpha } from './themeKit';
import { LCD, LcdCursor, LcdDialog, lcdMenuBox, lcdMenuRow, lcdScreenFrame } from './lcdKit';

// Vendor registry — create vendors, manage their banner, inventory (captioned
// images) and shows attended. Styled via the active themeKit theme.
// Sandbox / guest-only surface: signed-in accounts manage their stores on
// /account?tab=stores instead (same VendorManagementPanel under the hood).

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
  const t = useTheme();
  const lcd = t.id === 'handheld';
  const rowInput = rowInputStyle(t);
  const smallGhost = smallGhostStyle(t);
  const smallPrimary = smallPrimaryStyle(t);
  const smallPrimaryDisabled = smallPrimaryDisabledStyle(t);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  // Handheld theme only: delete confirmation runs as an in-page LCD dialog
  // instead of window.confirm. Inert for the other themes.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const selected = vendors.find((v) => v.id === selectedId) ?? null;

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

  // A pending delete confirmation shouldn't follow you to another vendor
  useEffect(() => {
    setConfirmingDelete(false);
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

  return (
    <div style={{ height: '100vh', overflowY: 'auto', boxSizing: 'border-box', background: t.pageBg, color: t.text, fontFamily: t.fontBody, ...(lcd ? { padding: '0 14px' } : {}) }}>
      <style>{t.hoverCss}</style>
      <div style={{ maxWidth: '980px', margin: '0 auto', padding: '56px 28px 80px', ...(lcd ? { ...lcdScreenFrame, margin: '26px auto 60px', padding: '32px 22px 48px' } : {}) }}>
        <header style={{ textAlign: 'center', marginBottom: '44px' }}>
          <h1 style={{ margin: 0, fontFamily: t.fontDisplay, fontSize: lcd ? '24px' : '34px', fontWeight: t.displayWeight, letterSpacing: t.id === 'night' ? '0.05em' : lcd ? '0.08em' : '0.18em', color: t.accent }}>
            VENDOR REGISTRY
          </h1>
          <p style={{ margin: '12px 0 16px', fontSize: lcd ? '10px' : '12px', color: t.muted, letterSpacing: lcd ? '0.1em' : '0.24em', fontFamily: t.id === 'refined' ? undefined : t.fontMono }}>
            YOUR STORES &amp; THEIR INVENTORY
          </p>
          <Ornament />
          <p style={{ margin: '16px 0 0', fontSize: lcd ? '10px' : '11.5px', color: t.muted, letterSpacing: lcd ? '0.06em' : '0.12em', fontFamily: t.id === 'refined' ? undefined : t.fontMono }}>
            {vendors.length === 0
              ? 'NO VENDORS YET — ADD YOUR FIRST BELOW'
              : `${vendors.length} ${vendors.length === 1 ? 'VENDOR' : 'VENDORS'} ON FILE`}
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: '36px', alignItems: 'start' }}>
          {/* ---- Vendor list ---- */}
          <div style={{ ...t.panelStyle, padding: '18px 16px', marginBottom: 0 }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
              <input
                type="text"
                placeholder="New vendor name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                style={{ ...rowInput, flex: 1, minWidth: 0 }}
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                style={{ ...(newName.trim() ? smallPrimary : smallPrimaryDisabled), ...(lcd ? { whiteSpace: 'nowrap' as const, padding: '9px 12px' } : {}) }}
              >
                {lcd ? '▶ ADD VENDOR' : 'ADD'}
              </button>
            </div>

            {lcd && vendors.length > 0 ? (
              <div style={lcdMenuBox}>
                {vendors.map((v, i) => (
                  <div
                    key={v.id}
                    className="museum-row"
                    onClick={() => setSelectedId(v.id)}
                    style={{
                      ...lcdMenuRow(v.id === selectedId),
                      cursor: 'pointer',
                      ...(i === vendors.length - 1 ? { borderBottom: 'none' } : {}),
                    }}
                  >
                    <LcdCursor active={v.id === selectedId} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.name}
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 400, color: v.id === selectedId ? LCD.screen : t.muted, marginTop: 2, letterSpacing: '0.05em' }}>
                        {v.inventoryCount} {v.inventoryCount === 1 ? 'item' : 'items'}
                        {v.bannerUrl ? ' · banner' : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : vendors.map((v) => (
              <div
                key={v.id}
                className="museum-row"
                onClick={() => setSelectedId(v.id)}
                style={{
                  padding: '12px 12px',
                  cursor: 'pointer',
                  borderLeft: v.id === selectedId ? `2px solid ${t.accent}` : '2px solid transparent',
                  borderBottom: `1px solid ${withAlpha(t.accent, 0.12)}`,
                  background: v.id === selectedId ? withAlpha(t.accent, 0.08) : 'transparent',
                }}
              >
                <div style={{ fontFamily: t.id === 'refined' ? t.fontDisplay : t.fontBody, fontSize: '14.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.name}
                </div>
                <div style={{ fontSize: '11px', color: t.muted, marginTop: '3px', letterSpacing: '0.05em' }}>
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
                  style={{ ...rowInput, fontSize: lcd ? '13px' : '19px', fontWeight: lcd ? 700 : undefined, flex: 1, minWidth: 0, letterSpacing: '0.06em' }}
                />
                <button
                  onClick={() => {
                    if (lcd) {
                      setConfirmingDelete(true);
                      return;
                    }
                    if (window.confirm(`Delete “${selected.name}” and their ${selected.inventoryCount} inventory items? Floor-plan spots assigned to them become unassigned.`)) {
                      onDeleteVendor(selected.id);
                    }
                  }}
                  style={lcd ? smallGhost : {
                    ...smallGhost,
                    color: t.id === 'refined' ? '#c66' : t.error,
                    borderColor: t.id === 'refined' ? 'rgba(204,102,102,0.4)' : withAlpha(t.error, 0.4),
                  }}
                >
                  DELETE
                </button>
              </div>

              {lcd && confirmingDelete && (
                <LcdDialog
                  style={{ marginBottom: 24 }}
                  choices={[
                    { label: 'NO', primary: true, onClick: () => setConfirmingDelete(false) },
                    { label: 'YES', onClick: () => { setConfirmingDelete(false); onDeleteVendor(selected.id); } },
                  ]}
                >
                  REALLY DELETE {selected.name}? THEIR BINDER ({selected.inventoryCount}{' '}
                  {selected.inventoryCount === 1 ? 'ITEM' : 'ITEMS'}) GOES TOO! THEIR BOOTHS BECOME UNASSIGNED.
                </LcdDialog>
              )}

              <VendorManagementPanel
                vendor={selected}
                savedPlans={savedPlans}
                onSetBanner={(file) => onSetVendorBanner(selected.id, file)}
                onRemoveBanner={() => onRemoveVendorBanner(selected.id)}
                onAddManualShow={(name, date) => onAddManualShow(selected.id, name, date)}
                onRemoveManualShow={(showId) => onRemoveManualShow(selected.id, showId)}
                onInventoryChanged={onInventoryChanged}
              />
            </div>
          ) : lcd ? (
            <LcdDialog cursor style={{ marginTop: 8 }}>
              NO VENDORS YET! ADD YOUR FIRST — BANNER, BINDER AND SHOW HISTORY AWAIT.
            </LcdDialog>
          ) : (
            <p style={{ ...t.note, marginTop: '8px' }}>
              Add a vendor to start building their profile — banner, inventory and show history.
            </p>
          )}
        </div>

        <footer style={{ textAlign: 'center', marginTop: '56px' }}>
          <button
            onClick={onBack}
            style={{ ...t.subtleButton, fontSize: '13px', padding: '8px 14px' }}
          >
            ← Back to the museum
          </button>
        </footer>
      </div>
    </div>
  );
}
