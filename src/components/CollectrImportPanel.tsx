import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CardWithUrl } from '../lib/useCards';
import { planCollectrSync, type CollectrSyncPlan, type SyncCard } from '../lib/collectrImport';
import { readCollectrFolder } from '../lib/collectrFolder';
import { applyCollectrSync, type CollectrApplyResult } from '../lib/collectrApply';
import { useProvider } from '../lib/provider/context';
import { useTheme, withAlpha } from './themeKit';
import type { Theme } from './themeKit';
import { LCD, PIXEL_FONT, LcdDialog, lcdWell } from './lcdKit';

// Import an existing Collectr collection — collapsed behind a ghost button in
// ACQUISITIONS so the drop zone stays the primary action.
//
// The app never talks to Collectr. `tools/collectr-export/` (a local Playwright
// script the user runs against their own account) writes a folder; this panel
// reads it. Collectr PRO users can point it at their CSV export instead.
//
// The preview renders the very same sync plan object that IMPORT consumes, so
// what it promises is exactly what gets written — the bulkInventory.ts rule.

interface CollectrImportPanelProps {
  cards: CardWithUrl[];
  /** Refresh the collection once, after the whole batch lands. */
  onReloadCards: () => Promise<void>;
}

const smallGhostStyle = (t: Theme): React.CSSProperties => ({
  ...t.ghostButton,
  padding: '8px 14px',
  fontSize: 12,
  letterSpacing: '0.08em',
});

const smallPrimaryStyle = (t: Theme, disabled: boolean): React.CSSProperties => ({
  ...(disabled ? t.primaryButtonDisabled : t.primaryButton),
  padding: '9px 18px',
  fontSize: 12,
  letterSpacing: '0.1em',
});

const cellStyle = (t: Theme, head: boolean): React.CSSProperties => t.id === 'handheld'
  ? {
      textAlign: 'left', padding: '6px 8px', fontSize: 9.5,
      fontWeight: head ? 700 : 400, letterSpacing: '0.08em', color: LCD.ink,
      borderBottom: `${head ? 2 : 1}px solid ${head ? LCD.ink : LCD.mid}`,
      fontFamily: PIXEL_FONT, textTransform: 'uppercase', whiteSpace: 'nowrap',
    }
  : {
      textAlign: 'left', padding: '6px 8px', fontSize: head ? 10.5 : 12.5,
      fontWeight: 400, letterSpacing: head ? '0.14em' : '0.02em',
      color: head ? t.muted : undefined,
      borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap',
      fontFamily: head && t.id !== 'refined' ? t.fontMono : undefined,
    };

/** Preview rows are capped so a 500-card export doesn't render 500 <tr>s. */
const PREVIEW_LIMIT = 25;

export default function CollectrImportPanel({ cards, onReloadCards }: CollectrImportPanelProps) {
  const t = useTheme();
  const lcd = t.id === 'handheld';
  const provider = useProvider();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<CollectrSyncPlan | null>(null);
  const [images, setImages] = useState<Map<string, File>>(new Map());
  const [meta, setMeta] = useState<{ exportedAt?: string; source: string; dropped: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<CollectrApplyResult | null>(null);
  const [showAll, setShowAll] = useState(false);

  const dirRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  // webkitdirectory is not declared on InputHTMLAttributes in @types/react 19,
  // so it has to be set imperatively — as a JSX prop it fails `tsc -b`.
  useEffect(() => {
    dirRef.current?.setAttribute('webkitdirectory', '');
  }, [open]);

  const syncCards = useMemo<SyncCard[]>(
    () => cards.map((c) => ({
      id: c.id, name: c.name, setName: c.setName, cardNumber: c.cardNumber,
      year: c.year, grade: c.grade, condition: c.condition,
      quantity: c.quantity, collectrId: c.collectrId,
    })),
    [cards],
  );

  const reset = () => {
    setPlan(null); setImages(new Map()); setMeta(null);
    setError(null); setResult(null); setShowAll(false); setProgress('');
  };

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    reset();
    const read = await readCollectrFolder(fileList);
    if ('error' in read) { setError(read.error); return; }
    setImages(read.images);
    setMeta({ exportedAt: read.exportedAt, source: read.source, dropped: read.droppedCount });
    setPlan(planCollectrSync(syncCards, read.items));
  }, [syncCards]);

  const runImport = useCallback(async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const res = await applyCollectrSync(provider, plan, images, setProgress);
      setResult(res);
      setPlan(null);
      await onReloadCards();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }, [plan, images, provider, onReloadCards]);

  const willWrite = plan ? plan.adds.length + plan.updates.length : 0;

  if (!open) {
    return (
      <div style={{ marginTop: 12 }}>
        <button type="button" style={smallGhostStyle(t)} onClick={() => setOpen(true)}>
          {lcd ? '▤ IMPORT FROM COLLECTR' : '▤ Import from Collectr'}
        </button>
      </div>
    );
  }

  const note = (text: string) => (
    <p style={{
      ...t.note, margin: '10px 0 0',
      fontSize: lcd ? 9.5 : 12,
      ...(lcd ? { textTransform: 'uppercase' as const, fontFamily: PIXEL_FONT } : {}),
    }}>{text}</p>
  );

  const countRow = (label: string, value: number, accent?: boolean) => (
    <div key={label} style={{
      display: 'flex', justifyContent: 'space-between', gap: 16,
      padding: '5px 0', fontSize: lcd ? 10 : 13,
      ...(lcd ? { fontFamily: PIXEL_FONT, textTransform: 'uppercase' as const } : {}),
      color: accent ? t.accent : undefined,
    }}>
      <span style={{ color: accent ? t.accent : t.muted, letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );

  return (
    <div style={{
      marginTop: 12, padding: lcd ? 12 : 16,
      border: `${t.borderWidth}px solid ${t.border}`,
      borderRadius: lcd ? 0 : 4,
      background: lcd ? LCD.panel : t.panel,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <strong style={{
          fontFamily: t.fontDisplay, fontSize: lcd ? 11 : 14, letterSpacing: '0.08em',
          ...(lcd ? { textTransform: 'uppercase' as const } : {}),
        }}>
          {lcd ? 'IMPORT FROM COLLECTR' : 'Import from Collectr'}
        </strong>
        <button
          type="button"
          style={smallGhostStyle(t)}
          onClick={() => { reset(); setOpen(false); }}
        >
          {lcd ? 'CLOSE' : 'Close'}
        </button>
      </div>

      {!plan && !result && note(
        lcd
          ? 'RUN THE COLLECTR EXPORT SCRIPT, THEN PICK ITS FOLDER. PRO USERS CAN PICK A CSV EXPORT INSTEAD.'
          : 'Run the Collectr export script (tools/collectr-export), then choose the folder it made. Collectr PRO users can pick their CSV export instead.',
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          style={smallGhostStyle(t)}
          disabled={busy}
          onClick={() => dirRef.current?.click()}
        >
          {lcd ? 'CHOOSE FOLDER' : 'Choose folder…'}
        </button>
        <button
          type="button"
          style={smallGhostStyle(t)}
          disabled={busy}
          onClick={() => filesRef.current?.click()}
        >
          {lcd ? 'OR PICK FILES' : 'or pick files…'}
        </button>
      </div>

      {/* Two inputs on purpose: directory pickers are Chromium/WebKit-only, and
          the flat multi-select is also what the headless test drives. */}
      <input
        id="collectr-folder-input" ref={dirRef} type="file" multiple
        style={{ display: 'none' }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        id="collectr-files-input" ref={filesRef} type="file" multiple
        style={{ display: 'none' }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      {error && (
        <p style={{
          margin: '12px 0 0', fontSize: lcd ? 10 : 12.5, color: t.accent,
          ...(lcd ? { fontFamily: PIXEL_FONT, textTransform: 'uppercase' as const } : {}),
        }}>{error}</p>
      )}

      {plan && (
        <div data-testid="collectr-preview" style={{ marginTop: 14 }}>
          <div style={lcd ? lcdWell : {
            padding: '10px 12px', border: `1px solid ${t.border}`, borderRadius: 4,
            background: withAlpha(t.accent, 0.05),
          }}>
            {countRow(lcd ? 'NEW' : 'New cards', plan.adds.length, plan.adds.length > 0)}
            {countRow(lcd ? 'UPDATED' : 'Updated', plan.updates.length, plan.updates.length > 0)}
            {countRow(lcd ? 'UNCHANGED' : 'Already up to date', plan.unchanged.length)}
            {plan.blocked.length > 0 && countRow(lcd ? 'NO IMAGE' : 'Skipped (no image)', plan.blocked.length)}
            {plan.untouchedCount > 0 && countRow(
              lcd ? 'NOT IN EXPORT' : 'In your museum, not in this export', plan.untouchedCount,
            )}
          </div>

          {meta?.dropped ? note(
            lcd
              ? `${meta.dropped} UNREADABLE ROWS SKIPPED.`
              : `${meta.dropped} unreadable ${meta.dropped === 1 ? 'row was' : 'rows were'} skipped.`,
          ) : null}

          {plan.updates.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th style={cellStyle(t, true)}>{lcd ? 'CARD' : 'Card'}</th>
                  <th style={cellStyle(t, true)}>{lcd ? 'BEFORE' : 'Before'}</th>
                  <th style={cellStyle(t, true)}>{lcd ? 'AFTER' : 'After'}</th>
                </tr>
              </thead>
              <tbody>
                {(showAll ? plan.updates : plan.updates.slice(0, PREVIEW_LIMIT)).map((u) => (
                  <tr key={u.id}>
                    <td style={cellStyle(t, false)}>{u.item.name}</td>
                    <td style={{ ...cellStyle(t, false), color: t.muted }}>
                      {describe(u.before.quantity, u.before.condition, u.before.grade)}
                    </td>
                    <td style={cellStyle(t, false)}>
                      {describe(u.item.quantity, u.item.condition, u.item.grade)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {plan.updates.length > PREVIEW_LIMIT && (
            <button
              type="button"
              style={{ ...smallGhostStyle(t), marginTop: 10 }}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? (lcd ? 'SHOW FEWER' : 'Show fewer')
                : (lcd ? `SHOW ALL ${plan.updates.length}` : `Show all ${plan.updates.length}`)}
            </button>
          )}

          {note(
            lcd
              ? 'YOUR WALL ARRANGEMENT, FEATURED CARDS AND HANG ORDER ARE NEVER CHANGED.'
              : 'Your wall arrangement, featured cards and hang order are never changed. Nothing is ever deleted.',
          )}

          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              style={smallPrimaryStyle(t, busy || willWrite === 0)}
              disabled={busy || willWrite === 0}
              onClick={runImport}
            >
              {busy
                ? (lcd ? 'IMPORTING…' : 'Importing…')
                : willWrite === 0
                  ? (lcd ? 'NOTHING TO DO' : 'Nothing to import')
                  : (lcd ? `▶ IMPORT ${willWrite}` : `Import ${willWrite} card${willWrite === 1 ? '' : 's'} →`)}
            </button>
          </div>

          {busy && progress && (
            <p style={{
              ...t.note, margin: '10px 0 0', fontSize: lcd ? 9.5 : 12,
              ...(lcd ? { fontFamily: PIXEL_FONT, textTransform: 'uppercase' as const } : {}),
            }}>{progress}</p>
          )}
        </div>
      )}

      {result && (lcd ? (
        <div style={{ marginTop: 12 }}>
          <LcdDialog>
            {`IMPORT DONE! ${result.added} ADDED, ${result.updated} UPDATED, ${result.unchanged} ALREADY UP TO DATE.`}
          </LcdDialog>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: 0, fontSize: 13.5 }}>
            Done — <strong>{result.added}</strong> added, <strong>{result.updated}</strong> updated,{' '}
            {result.unchanged} already up to date
            {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}.
          </p>
          {result.failures.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: t.muted }}>
              {result.failures.slice(0, 10).map((f, i) => <li key={i}>{f}</li>)}
              {result.failures.length > 10 && <li>…and {result.failures.length - 10} more.</li>}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/** "×3 · NM" — the before/after cell summary. */
function describe(quantity?: number, condition?: string, grade?: string): string {
  const parts = [
    typeof quantity === 'number' && quantity > 1 ? `×${quantity}` : '×1',
    grade || condition,
  ].filter(Boolean);
  return parts.join(' · ');
}
