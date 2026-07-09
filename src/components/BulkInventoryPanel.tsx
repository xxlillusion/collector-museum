import { useMemo, useState } from 'react';
import type { InventoryStatus } from '../lib/db';
import { parseBulkLines } from '../lib/bulkInventory';
import type { BulkRow } from '../lib/bulkInventory';
import { formatPrice } from '../lib/price';
import {
  GOLD,
  HAIRLINE,
  MUTED,
  SERIF,
  panelStyle,
  panelTitleStyle,
  ghostButtonStyle,
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  inputStyle,
  noteStyle,
  errorTextStyle,
} from './museumKit';

// Bulk inventory tooling for the Vendor Registry — vendors have hundreds of
// cards and per-item typing is the ceiling. Two tools: PASTE & MATCH (one
// pasted line per item in grid order, previewed before applying) and APPLY TO
// EVERY ITEM (blanket status/condition). Collapsed behind a ghost button by
// default so the inventory panel stays calm.

/** The subset of the hook's items the panel needs (structural — accepts InventoryItemWithUrl). */
export interface BulkPanelItem {
  id: string;
  imageUrl: string;
  caption: string;
  price?: number;
  status?: InventoryStatus;
  condition?: string;
}

type BulkPatch = Partial<Pick<BulkPanelItem, 'caption' | 'price' | 'condition' | 'status'>>;

interface BulkInventoryPanelProps {
  items: BulkPanelItem[];
  onBulkUpdate: (
    updates: { id: string; patch: BulkPatch }[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<void>;
  /** Parent's onInventoryChanged — fired after a batch lands. */
  onDone: () => void;
}

const STATUS_LABEL: Record<InventoryStatus, string> = {
  forSale: 'For sale',
  sold: 'Sold',
  display: 'Display only',
};

/** Em-dash = "this field stays untouched". */
const UNTOUCHED = '—';

const smallGhostStyle: React.CSSProperties = {
  ...ghostButtonStyle,
  padding: '8px 14px',
  fontSize: 12,
  letterSpacing: '0.08em',
};

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

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  fontSize: 10.5,
  fontWeight: 400,
  letterSpacing: '0.14em',
  color: MUTED,
  borderBottom: `1px solid ${HAIRLINE}`,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 12.5,
  borderBottom: '1px solid rgba(212,175,55,0.12)',
  verticalAlign: 'middle',
};

/** Only defined fields make it into the patch — blanks leave values alone. */
function rowToPatch(row: BulkRow): BulkPatch {
  const patch: BulkPatch = {};
  if (row.caption !== undefined) patch.caption = row.caption;
  if (row.price !== undefined) patch.price = row.price;
  if (row.condition !== undefined) patch.condition = row.condition;
  if (row.status !== undefined) patch.status = row.status;
  return patch;
}

export default function BulkInventoryPanel({ items, onBulkUpdate, onDone }: BulkInventoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allStatus, setAllStatus] = useState<'' | InventoryStatus>('');
  const [allCondition, setAllCondition] = useState('');
  const applying = progress !== null;

  const rows = useMemo(() => parseBulkLines(text), [text]);
  const previewCount = Math.min(rows.length, items.length);

  const runBatch = async (updates: { id: string; patch: BulkPatch }[], onSuccess: () => void) => {
    setNote(null);
    setError(null);
    setProgress('Applying…');
    try {
      let applied = 0;
      await onBulkUpdate(updates, (done, total) => {
        applied = done;
        setProgress(`Applying ${done} / ${total}…`);
      });
      setNote(`Applied ${applied} update${applied === 1 ? '' : 's'}.`);
      onSuccess();
      onDone();
    } catch (err) {
      setError(`Bulk update stopped: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProgress(null);
    }
  };

  const handleApplyPaste = () => {
    if (applying || previewCount === 0) return;
    const updates = rows
      .slice(0, previewCount)
      .map((row, i) => ({ id: items[i].id, patch: rowToPatch(row) }));
    runBatch(updates, () => setText(''));
  };

  const handleApplyAll = () => {
    if (applying) return;
    const patch: BulkPatch = {};
    if (allStatus) patch.status = allStatus;
    if (allCondition.trim()) patch.condition = allCondition.trim();
    if (Object.keys(patch).length === 0) return;
    const parts = [
      allStatus ? `status "${STATUS_LABEL[allStatus]}"` : null,
      allCondition.trim() ? `condition "${allCondition.trim()}"` : null,
    ].filter(Boolean);
    const ok = window.confirm(`Apply ${parts.join(' and ')} to all ${items.length} items?`);
    if (!ok) return;
    const updates = items.map((it) => ({ id: it.id, patch }));
    runBatch(updates, () => {
      setAllStatus('');
      setAllCondition('');
    });
  };

  if (!open) {
    return (
      <div style={{ marginBottom: '18px' }}>
        <button onClick={() => setOpen(true)} style={smallGhostStyle}>
          ▤ BULK TOOLS
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...panelStyle, padding: '18px 20px', marginBottom: '18px', background: '#171310' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ ...panelTitleStyle, margin: 0 }}>BULK TOOLS</div>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 12, letterSpacing: '0.08em', fontFamily: SERIF, cursor: 'pointer', padding: '2px 6px' }}
        >
          HIDE ✕
        </button>
      </div>

      {/* ---- Paste & match ---- */}
      <div style={{ margin: '16px 0 8px', fontSize: 11.5, letterSpacing: '0.18em', color: GOLD }}>
        PASTE &amp; MATCH
      </div>
      <div style={{ ...noteStyle, fontSize: 12, marginBottom: '10px' }}>
        One line per item, top to bottom in the grid order below. Fields:
        caption | price | condition | status — separated by tab (spreadsheet
        paste), | or comma. Tab and | take precedence, so captions may contain
        commas ("Charizard, holo"). Leave a field blank to keep its current value.
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'caption | price | condition | status\nCharizard, holo | 250 | PSA 9 | sold\n| 40   (price only — tab or comma work too)'}
        rows={5}
        disabled={applying}
        style={{ ...inputStyle, fontSize: 12.5, minHeight: '96px', resize: 'vertical' }}
      />

      {rows.length > 0 && rows.length !== items.length && (
        <div style={{ ...noteStyle, fontSize: 11.5, marginTop: '8px' }}>
          {rows.length} {rows.length === 1 ? 'line' : 'lines'} / {items.length}{' '}
          {items.length === 1 ? 'item' : 'items'} — applying the first {previewCount}.
        </div>
      )}

      {previewCount > 0 && (
        <div style={{ maxHeight: '300px', overflowY: 'auto', marginTop: '12px', border: `1px solid rgba(212,175,55,0.12)`, borderRadius: '2px' }}>
          <table data-testid="bulk-preview" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle} />
                <th style={thStyle}>CURRENT</th>
                <th style={thStyle}>→ CAPTION</th>
                <th style={thStyle}>PRICE</th>
                <th style={thStyle}>CONDITION</th>
                <th style={thStyle}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, previewCount).map((row, i) => {
                const item = items[i];
                return (
                  <tr key={item.id}>
                    <td style={{ ...tdStyle, width: 38 }}>
                      <img
                        src={item.imageUrl}
                        alt=""
                        style={{ width: 34, height: 34, objectFit: 'cover', display: 'block', borderRadius: 2, border: `1px solid ${HAIRLINE}` }}
                      />
                    </td>
                    <td style={{ ...tdStyle, color: MUTED, fontStyle: 'italic', textDecoration: row.caption !== undefined ? 'line-through' : 'none', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.caption || '(no caption)'}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: SERIF }}>{row.caption ?? UNTOUCHED}</td>
                    <td style={{ ...tdStyle, color: row.price !== undefined ? GOLD : undefined, whiteSpace: 'nowrap' }}>
                      {row.price !== undefined ? formatPrice(row.price) : UNTOUCHED}
                    </td>
                    <td style={tdStyle}>{row.condition ?? UNTOUCHED}</td>
                    <td style={tdStyle}>{row.status !== undefined ? STATUS_LABEL[row.status] : UNTOUCHED}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '12px' }}>
        <button
          onClick={handleApplyPaste}
          disabled={applying || previewCount === 0}
          style={!applying && previewCount > 0 ? smallPrimaryStyle : smallPrimaryDisabledStyle}
        >
          APPLY {previewCount > 0 ? `TO ${previewCount} ITEM${previewCount === 1 ? '' : 'S'}` : ''}
        </button>
        {progress && (
          <span style={{ fontFamily: SERIF, fontSize: '12.5px', color: GOLD, letterSpacing: '0.04em' }}>
            {progress}
          </span>
        )}
        {!progress && note && (
          <span style={{ fontFamily: SERIF, fontSize: '12.5px', color: GOLD, letterSpacing: '0.04em' }}>
            {note}
          </span>
        )}
      </div>
      {error && <p style={{ ...errorTextStyle, margin: '10px 0 0' }}>{error}</p>}

      {/* ---- Apply to every item ---- */}
      <div style={{ margin: '22px 0 8px', fontSize: 11.5, letterSpacing: '0.18em', color: GOLD }}>
        APPLY TO EVERY ITEM
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <select
          value={allStatus}
          title="Status for every item"
          disabled={applying}
          onChange={(e) => setAllStatus(e.target.value as '' | InventoryStatus)}
          style={{ ...inputStyle, display: 'inline-block', width: 'auto', fontSize: 12.5, padding: '8px 10px' }}
        >
          <option value="">— unchanged —</option>
          <option value="forSale">For sale</option>
          <option value="sold">Sold</option>
          <option value="display">Display only</option>
        </select>
        <input
          type="text"
          placeholder="Condition (blank = unchanged)"
          value={allCondition}
          disabled={applying}
          onChange={(e) => setAllCondition(e.target.value)}
          style={{ ...inputStyle, display: 'inline-block', width: 'auto', flex: 1, minWidth: '160px', fontSize: 12.5, padding: '8px 10px', fontStyle: allCondition ? 'normal' : 'italic' }}
        />
        <button
          onClick={handleApplyAll}
          disabled={applying || (!allStatus && !allCondition.trim())}
          style={!applying && (allStatus || allCondition.trim()) ? smallPrimaryStyle : smallPrimaryDisabledStyle}
        >
          SET ALL
        </button>
      </div>
    </div>
  );
}
