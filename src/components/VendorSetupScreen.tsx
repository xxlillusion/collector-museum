import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import PlanWorkbench, { secondaryButton } from './PlanWorkbench';
import { useTheme, withAlpha } from './themeKit';
import { LCD, LcdCss, LcdDialog, lcdMenuBox, lcdMenuRow, lcdScreenFrame } from './lcdKit';
import type { PlanWorkbenchHandle, PlanWorkbenchState } from './PlanWorkbench';
import type { VendorPlanMeta } from '../lib/vendorPlan';
import type { SavedPlanRecord } from '../lib/db';
import type { VendorSummary } from '../lib/useVendors';
import { useSavedPlans } from '../lib/useSavedPlans';

interface VendorSetupScreenProps {
  planUrl: string | null;
  planMeta: VendorPlanMeta | null;
  /** Raw working-slot plan blob — detection input for Re-detect. */
  getPlanBlob: () => Promise<Blob | undefined>;
  onSetPlan: (file: File) => Promise<void>;
  onSaveMeta: (meta: VendorPlanMeta) => Promise<void>;
  onClearPlan: () => Promise<void>;
  vendors: VendorSummary[];
  onAddVendor: (name: string) => Promise<string>;
  savedPlans: SavedPlanRecord[];
  onSavePlan: (name: string, showDate?: string) => Promise<void>;
  onLoadPlan: (id: string) => Promise<void>;
  onDeletePlan: (id: string) => Promise<void>;
  onGenerate: () => void;
  onBack: () => void;
}

export default function VendorSetupScreen({
  planUrl,
  planMeta,
  getPlanBlob,
  onSetPlan,
  onSaveMeta,
  onClearPlan,
  vendors,
  onAddVendor,
  savedPlans,
  onSavePlan,
  onLoadPlan,
  onDeletePlan,
  onGenerate,
  onBack,
}: VendorSetupScreenProps) {
  const t = useTheme();
  const workbenchRef = useRef<PlanWorkbenchHandle>(null);
  // Mirrors the workbench's editing state so the surrounding chrome (save /
  // publish buttons) can gate on it; hasMeta seeds from the restored plan.
  const [wb, setWb] = useState<PlanWorkbenchState>({
    hasMeta: planMeta !== null,
    detecting: false,
    totalTables: 0,
  });

  const [savingName, setSavingName] = useState<string | null>(null); // null = closed
  const [savingDate, setSavingDate] = useState('');

  // Handheld theme only: the Load / Delete confirmations run as in-page LCD
  // dialogs instead of window.confirm. Inert for the other themes.
  const [pendingLoadId, setPendingLoadId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Export/import portable plan files. This screen mounts its own
  // useSavedPlans instance for these two functions only — App's prop wiring
  // is frozen, and the hook's module-level refresh bus keeps App's instance
  // (which feeds the `savedPlans` prop rendered below) in sync after an
  // import. Sandbox/guest-only host, so imports always hit the local
  // provider (never `upsertCloudPlan` — see useSavedPlans.importPlanFile).
  const { exportPlan, importPlanFile } = useSavedPlans();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const handleExport = useCallback(async (id: string) => {
    try {
      const result = await exportPlan(id);
      if (!result) return;
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setImportMsg({ kind: 'err', text: 'Export failed — the plan could not be read.' });
    }
  }, [exportPlan]);

  const handleImportChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const result = await importPlanFile(file);
      setImportMsg(result.ok
        ? { kind: 'ok', text: `Imported “${result.name}”` }
        : { kind: 'err', text: result.error });
    } catch {
      setImportMsg({ kind: 'err', text: 'Import failed — the file could not be read.' });
    } finally {
      setImporting(false);
    }
  }, [importPlanFile]);

  const handleSavePlan = useCallback(async () => {
    const name = savingName?.trim();
    if (!name) return;
    // Flush any pending debounced edit so the snapshot is current
    await workbenchRef.current?.flushPendingMeta();
    await onSavePlan(name, savingDate || undefined);
    setSavingName(null);
    setSavingDate('');
  }, [savingName, savingDate, onSavePlan]);

  // Screen chrome styles — under 'refined' these reproduce the pre-theme gold
  // palette exactly; other themes swap in their tokens. The handheld theme
  // uses the LCD input recipe (screen bg, 3px ink, pixel font, square).
  const isR = t.id === 'refined';
  const lcd = t.id === 'handheld';
  const secondaryBtn = secondaryButton(t);
  const danger = isR ? '#c66' : t.error;
  const setupInput: CSSProperties = lcd
    ? {
        background: LCD.screen,
        color: LCD.ink,
        border: `3px solid ${LCD.ink}`,
        borderRadius: 0,
        padding: '9px 10px',
        fontSize: '11px',
        fontFamily: t.fontBody,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }
    : {
        background: t.surface,
        color: t.text,
        border: isR ? '1px solid #555' : `${t.borderWidth}px solid ${t.border}`,
        borderRadius: '6px',
        padding: '10px 12px',
        fontSize: '14px',
        fontFamily: isR ? 'Georgia, serif' : t.fontBody,
      };
  /** Handheld row-action chips for the saved-plan menu rows. */
  const lcdChip: CSSProperties = { ...t.chip, fontSize: 10, cursor: 'pointer', padding: '4px 8px', whiteSpace: 'nowrap' };
  const pendingLoad = pendingLoadId === null ? null : savedPlans.find((p) => p.id === pendingLoadId) ?? null;
  const pendingDelete = pendingDeleteId === null ? null : savedPlans.find((p) => p.id === pendingDeleteId) ?? null;
  const primaryAction = (enabled: boolean): CSSProperties => enabled
    ? (isR
        ? { background: t.accent, color: t.accentContrast, border: 'none', borderRadius: '6px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer', fontFamily: 'Georgia, serif' }
        : { ...t.primaryButton, padding: '10px 20px', fontSize: lcd ? '11px' : '14px' })
    : (isR
        ? { background: '#333', color: '#666', border: 'none', borderRadius: '6px', padding: '10px 20px', fontSize: '14px', cursor: 'not-allowed', fontFamily: 'Georgia, serif' }
        : { ...t.primaryButtonDisabled, padding: '10px 20px', fontSize: lcd ? '11px' : '14px' });

  return (
    <div style={{
      height: '100vh',
      overflowY: 'auto',
      boxSizing: 'border-box',
      background: isR ? '#1a1614' : t.pageBg,
      color: t.text,
      fontFamily: isR ? 'Georgia, serif' : t.fontBody,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 24px',
    }}>
      {lcd && <LcdCss />}
      {/* Handheld: the whole workspace sits on one LCD "screen" frame. For
          every other theme this wrapper is display:contents — layout-inert,
          renders exactly as before. */}
      <div style={lcd ? {
        ...lcdScreenFrame,
        width: '100%',
        maxWidth: '960px',
        boxSizing: 'border-box',
        padding: '28px 18px 40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      } : { display: 'contents' }}>
      <h1 style={{ fontSize: lcd ? '22px' : '2rem', letterSpacing: t.id === 'night' ? '0.05em' : lcd ? '0.08em' : '0.12em', marginBottom: '4px', color: t.accent, fontFamily: isR ? undefined : t.fontDisplay, fontWeight: isR ? undefined : t.displayWeight }}>
        CONVENTION VIEW
      </h1>
      <p style={{ color: isR ? '#888' : t.muted, marginBottom: '20px', fontSize: lcd ? '10px' : '14px', letterSpacing: '0.08em', fontFamily: isR ? undefined : t.fontMono }}>
        WALK A CARD SHOW FROM ITS FLOOR PLAN
      </p>

      {/* Local-sandbox note — this editor never publishes; organizers create
          public shows from their account (/organizer/show/new). The handheld
          theme renders it as the inverted ink strip (its error/notice idiom). */}
      <div style={lcd ? {
        width: '100%',
        maxWidth: '900px',
        boxSizing: 'border-box',
        background: LCD.ink,
        color: LCD.screen,
        border: 'none',
        borderRadius: 0,
        padding: '10px 16px',
        marginBottom: '28px',
        fontSize: '9.5px',
        fontWeight: 700,
        lineHeight: 1.9,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        textAlign: 'center',
      } : {
        width: '100%',
        maxWidth: '900px',
        boxSizing: 'border-box',
        border: `${t.borderWidth}px solid ${withAlpha(t.accent, 0.35)}`,
        borderRadius: '8px',
        background: withAlpha(t.accent, 0.05),
        padding: '10px 16px',
        marginBottom: '28px',
        fontSize: '13px',
        lineHeight: 1.6,
        color: isR ? '#b7ad98' : t.muted,
        textAlign: 'center',
      }}>
        {lcd
          ? 'SHOWS BUILT HERE ARE SAVED TO THIS BROWSER ONLY! WALK THEM ANYTIME — ORGANIZERS PUBLISH PUBLIC SHOWS FROM THEIR ACCOUNT.'
          : <>Shows built here are local to this browser — you can walk them, but they can't be
        shared or published. Organizers create public shows from their account.</>}
      </div>

      <PlanWorkbench
        ref={workbenchRef}
        planUrl={planUrl}
        planMeta={planMeta}
        getPlanBlob={getPlanBlob}
        onSetPlan={onSetPlan}
        onSaveMeta={onSaveMeta}
        onClearPlan={onClearPlan}
        vendors={vendors}
        onAddVendor={onAddVendor}
        onStateChange={setWb}
        actions={({ totalTables }) => (
          <button
            onClick={onGenerate}
            disabled={totalTables === 0}
            style={isR
              ? {
                  background: totalTables > 0 ? t.accent : '#333',
                  color: totalTables > 0 ? t.accentContrast : '#666',
                  border: 'none',
                  padding: '14px 40px',
                  fontSize: '16px',
                  letterSpacing: '0.1em',
                  borderRadius: '8px',
                  cursor: totalTables > 0 ? 'pointer' : 'not-allowed',
                  fontFamily: 'Georgia, serif',
                }
              : {
                  ...(totalTables > 0 ? t.primaryButton : t.primaryButtonDisabled),
                  padding: lcd ? '12px 28px' : '14px 40px',
                  fontSize: lcd ? '12px' : '16px',
                  letterSpacing: lcd ? '0.08em' : '0.1em',
                }}
          >
            {lcd ? '▶ GENERATE' : 'GENERATE →'}
          </button>
        )}
      />

      {/* Always rendered — the import affordance must be reachable even in a
          fresh browser with no working plan and nothing saved yet. */}
      <div style={{ width: '100%', maxWidth: '900px', marginTop: '36px' }}>
          <div style={{
            color: isR ? '#888' : lcd ? t.text : t.muted,
            fontSize: lcd ? '12px' : '13px',
            fontWeight: lcd ? 700 : undefined,
            letterSpacing: lcd ? '0.08em' : '0.12em',
            marginBottom: '12px',
            fontFamily: isR ? undefined : t.fontMono,
          }}>
            SAVED PLANS
          </div>

          {wb.hasMeta && !wb.detecting && (
            savingName === null ? (
              <button onClick={() => setSavingName('')} style={{ ...secondaryBtn, marginBottom: '12px' }}>
                {lcd ? '▶ SAVE THIS PLAN…' : '💾 Save this plan…'}
              </button>
            ) : (() => {
              const saveControls = (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: lcd ? 0 : '12px', marginTop: lcd ? 8 : 0 }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Plan name"
                    value={savingName}
                    onChange={(e) => setSavingName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSavePlan(); }}
                    style={{
                      ...setupInput,
                      width: '220px',
                    }}
                  />
                  <input
                    type="date"
                    title="Show date (optional) — past shows count toward vendors' show history"
                    value={savingDate}
                    onChange={(e) => setSavingDate(e.target.value)}
                    style={{
                      ...setupInput,
                      color: savingDate ? t.text : (isR ? '#777' : t.muted),
                      padding: '9px 12px',
                      colorScheme: lcd ? 'light' : 'dark',
                    }}
                  />
                  <button
                    onClick={handleSavePlan}
                    disabled={!savingName.trim()}
                    style={primaryAction(!!savingName.trim())}
                  >
                    {lcd ? '▶ SAVE' : 'Save'}
                  </button>
                  <button onClick={() => { setSavingName(null); setSavingDate(''); }} style={{ ...secondaryBtn, padding: '10px 14px', fontSize: '13px' }}>
                    Cancel
                  </button>
                </div>
              );
              return lcd ? (
                <LcdDialog style={{ marginBottom: 12, width: '100%', boxSizing: 'border-box' }}>
                  NAME THIS PLAN! A PAST SHOW DATE COUNTS TOWARD VENDOR SHOW HISTORIES.
                  {saveControls}
                </LcdDialog>
              ) : saveControls;
            })()
          )}

          {lcd && savedPlans.length > 0 ? (
            <div style={{ ...lcdMenuBox, marginBottom: 8 }}>
              {savedPlans.map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    ...lcdMenuRow(false),
                    gap: 8,
                    flexWrap: 'wrap',
                    ...(i === savedPlans.length - 1 ? { borderBottom: 'none' } : {}),
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                  <span style={{ color: t.muted, fontSize: 9, whiteSpace: 'nowrap' }}>
                    {p.showDate ? `show ${p.showDate} · ` : ''}{new Date(p.updatedAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => handleExport(p.id)}
                    title="Download this plan as a portable file"
                    style={lcdChip}
                  >
                    ↓ EXPORT
                  </button>
                  <button
                    onClick={() => {
                      if (!wb.hasMeta) onLoadPlan(p.id);
                      else setPendingLoadId(p.id);
                    }}
                    style={lcdChip}
                  >
                    ▶ LOAD
                  </button>
                  <button
                    onClick={() => setPendingDeleteId(p.id)}
                    style={lcdChip}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : savedPlans.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                border: isR ? '1px solid #3a3a3a' : `${t.borderWidth}px solid ${t.border}`,
                borderRadius: '8px',
                marginBottom: '8px',
                fontSize: '14px',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.name}
              </span>
              <span style={{ color: isR ? '#666' : t.muted, fontSize: '12px', whiteSpace: 'nowrap', fontFamily: isR ? undefined : t.fontMono }}>
                {p.showDate ? `show ${p.showDate} · ` : ''}{new Date(p.updatedAt).toLocaleDateString()}
              </span>
              <button
                onClick={() => handleExport(p.id)}
                title="Download this plan as a portable file"
                style={{ ...secondaryBtn, padding: '6px 14px', fontSize: '13px' }}
              >
                ⬇ Export
              </button>
              <button
                onClick={() => {
                  if (!wb.hasMeta || window.confirm(`Load “${p.name}”? The current working plan will be replaced.`)) {
                    onLoadPlan(p.id);
                  }
                }}
                style={{ ...secondaryBtn, padding: '6px 14px', fontSize: '13px' }}
              >
                Load
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Delete the saved plan “${p.name}”?`)) onDeletePlan(p.id);
                }}
                style={{ ...secondaryBtn, padding: '6px 10px', fontSize: '13px', color: danger }}
              >
                ✕
              </button>
            </div>
          ))}

          {lcd && pendingLoad && (
            <LcdDialog
              style={{ margin: '10px 0' }}
              choices={[
                { label: 'NO', primary: true, onClick: () => setPendingLoadId(null) },
                { label: 'YES', onClick: () => { setPendingLoadId(null); onLoadPlan(pendingLoad.id); } },
              ]}
            >
              LOAD {pendingLoad.name}? THE CURRENT WORKING PLAN WILL BE REPLACED!
            </LcdDialog>
          )}
          {lcd && pendingDelete && (
            <LcdDialog
              style={{ margin: '10px 0' }}
              choices={[
                { label: 'NO', primary: true, onClick: () => setPendingDeleteId(null) },
                { label: 'YES', onClick: () => { setPendingDeleteId(null); onDeletePlan(pendingDelete.id); } },
              ]}
            >
              REALLY DELETE THE SAVED PLAN {pendingDelete.name}?
            </LcdDialog>
          )}

          {savedPlans.length === 0 && (
            lcd ? (
              <LcdDialog cursor>
                NOTHING SAVED YET! SAVE A PLAN — OR IMPORT A PLAN FILE BELOW.
              </LcdDialog>
            ) : (
              <div style={{ color: isR ? '#555' : t.muted, fontSize: '13px' }}>Nothing saved yet.</div>
            )
          )}

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginTop: '14px' }}>
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              style={{ ...secondaryBtn, padding: '10px 18px', fontSize: '13px' }}
            >
              {importing
                ? (lcd ? 'IMPORTING…' : 'Importing…')
                : (lcd ? '↑ IMPORT A PLAN FILE…' : '⬆ Import a plan file…')}
            </button>
            {importMsg && (
              lcd ? (
                importMsg.kind === 'ok' ? (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: t.text, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {importMsg.text}!
                  </span>
                ) : (
                  <span style={t.errorText}>! {importMsg.text}</span>
                )
              ) : (
                <span style={{ fontSize: '13px', color: importMsg.kind === 'ok' ? t.accent : danger }}>
                  {importMsg.text}
                </span>
              )
            )}
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.vmplan.json,application/json"
            style={{ display: 'none' }}
            onChange={handleImportChange}
          />
          <div style={isR
            ? { color: '#777', fontSize: '12px', fontStyle: 'italic', marginTop: '8px' }
            : { ...t.note, fontSize: lcd ? 9.5 : 12, marginTop: '8px' }}
          >
            Vendor assignments only carry over within the same registry.
          </div>
        </div>
      </div>

      <button
        onClick={onBack}
        style={{
          ...secondaryBtn,
          marginTop: '40px',
          border: 'none',
          color: isR ? '#888' : t.muted,
        }}
      >
        ← Back to the museum
      </button>
    </div>
  );
}
