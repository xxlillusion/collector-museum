import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import PlanEditor from './PlanEditor';
import { useTheme, withAlpha } from './themeKit';
import type { Theme } from './themeKit';
import { detectTables, inferScale } from '../lib/planDetect';
import type { VendorRect, VendorPlanMeta } from '../lib/vendorPlan';
import type { VendorSummary } from '../lib/useVendors';
import { planToLayout, standardTableW } from '../lib/vendorPlan';

/**
 * The floor-plan editing machinery, extracted from VendorSetupScreen so the
 * organizer show editor can mount the exact same detect → edit → assign flow:
 * dropzone + auto-detection, the PlanEditor mount, rotate/calibrate/start
 * marker, the per-box vendor-assignment panel (with quick-create), scale
 * readout + table-size toggle, Re-detect / Replace image. Hosts own the
 * chrome around it (Generate / Save / Publish buttons, saved plans, headers).
 *
 * Rect edits are debounce-persisted (500 ms) — hosts that snapshot the meta
 * (save plan, publish/create show) must call `flushPendingMeta()` on the
 * imperative handle first, which flushes any pending save and returns the
 * current meta.
 */

export interface PlanWorkbenchState {
  /** A plan has detected/edited meta (the editor is showing). */
  hasMeta: boolean;
  detecting: boolean;
  totalTables: number;
}

export interface PlanWorkbenchHandle {
  /** Flush the pending debounced rect save (if any); returns current meta. */
  flushPendingMeta: () => Promise<VendorPlanMeta | null>;
}

interface PlanWorkbenchProps {
  planUrl: string | null;
  planMeta: VendorPlanMeta | null;
  /** Raw working-slot plan blob — detection input for Re-detect. */
  getPlanBlob: () => Promise<Blob | undefined>;
  onSetPlan: (file: File) => Promise<void>;
  onSaveMeta: (meta: VendorPlanMeta) => Promise<void>;
  onClearPlan: () => Promise<void>;
  vendors: VendorSummary[];
  /** Quick-create-and-assign a new vendor. Omit to restrict assignment to
   *  the `vendors` list — the cloud show editor does (registered vendors
   *  only, no placeholder rows); the sandbox keeps it (local registry). */
  onAddVendor?: (name: string) => Promise<string>;
  /** Rendered at the head of the actions row, before Re-detect / Replace. */
  actions?: (state: PlanWorkbenchState) => ReactNode;
  /** Fires when hasMeta / detecting / totalTables change — hosts gate their
   *  surrounding chrome (save/publish buttons) on it. */
  onStateChange?: (state: PlanWorkbenchState) => void;
  ref?: Ref<PlanWorkbenchHandle>;
}

export default function PlanWorkbench({
  planUrl,
  planMeta,
  getPlanBlob,
  onSetPlan,
  onSaveMeta,
  onClearPlan,
  vendors,
  onAddVendor,
  actions,
  onStateChange,
  ref,
}: PlanWorkbenchProps) {
  const t = useTheme();
  const [dragging, setDragging] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [meta, setMeta] = useState<VendorPlanMeta | null>(planMeta);
  const [calibrationPx, setCalibrationPx] = useState<number | null>(null);
  const [calibrationValue, setCalibrationValue] = useState('');
  const [calibrationUnit, setCalibrationUnit] = useState<'m' | 'ft'>('ft');
  const [selectedRectId, setSelectedRectId] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  // A restored session arrives with saved meta; a fresh upload sets it below
  useEffect(() => setMeta(planMeta), [planMeta]);

  // Ref mirror so runDetection can read the latest meta without re-memoizing
  // (its identity feeds the auto-detect effect below)
  const metaRef = useRef(meta);
  metaRef.current = meta;

  useImperativeHandle(ref, () => ({
    flushPendingMeta: async () => {
      // Flush any pending debounced edit so the caller's snapshot is current
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (metaRef.current) await onSaveMeta(metaRef.current);
      }
      return metaRef.current;
    },
  }), [onSaveMeta]);

  const runDetection = useCallback(async () => {
    setDetecting(true);
    // Let the spinner paint before the pixel crunch
    await new Promise((r) => setTimeout(r, 30));
    try {
      const blob = await getPlanBlob();
      if (!blob) return;
      const tableFt = metaRef.current?.tableLengthFt;
      const result = await detectTables(blob, standardTableW(tableFt));
      // A user-calibrated scale survives Re-detect; only the boxes regenerate
      const manual = metaRef.current?.pxPerMeterSource === 'manual';
      const next: VendorPlanMeta = {
        rects: result.rects,
        pxPerMeter: manual ? metaRef.current!.pxPerMeter : result.pxPerMeter,
        pxPerMeterSource: manual ? 'manual' : 'inferred',
        tableLengthFt: tableFt,
        imgW: result.imgW,
        imgH: result.imgH,
        updatedAt: Date.now(),
      };
      setMeta(next);
      await onSaveMeta(next);
    } finally {
      setDetecting(false);
    }
  }, [getPlanBlob, onSaveMeta]);

  // A stored plan with no meta (e.g. refresh mid-detection) would otherwise
  // render an empty screen with no way forward — detect it automatically.
  const autoDetected = useRef(false);
  useEffect(() => {
    if (planUrl && !meta && !detecting && !autoDetected.current) {
      autoDetected.current = true;
      runDetection();
    }
  }, [planUrl, meta, detecting, runDetection]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    setDetecting(true);
    await onSetPlan(file);
    await runDetection();
  }, [onSetPlan, runDetection]);

  const applyCalibration = useCallback(() => {
    const value = parseFloat(calibrationValue);
    if (!calibrationPx || !meta || !Number.isFinite(value) || value <= 0) return;
    const meters = calibrationUnit === 'ft' ? value * 0.3048 : value;
    const next: VendorPlanMeta = {
      ...meta,
      pxPerMeter: calibrationPx / meters,
      pxPerMeterSource: 'manual',
      updatedAt: Date.now(),
    };
    setMeta(next);
    onSaveMeta(next);
    setCalibrationPx(null);
    setCalibrationValue('');
  }, [calibrationPx, calibrationValue, calibrationUnit, meta, onSaveMeta]);

  // Debounce-persist rect edits so they survive refresh without a save button
  const handleRectsChange = useCallback((rects: VendorRect[]) => {
    setMeta((prev) => {
      if (!prev) return prev;
      const next = { ...prev, rects, updatedAt: Date.now() };
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        onSaveMeta(next);
      }, 500);
      return next;
    });
  }, [onSaveMeta]);

  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
  }, []);

  const selectedRect = meta?.rects.find((r) => r.id === selectedRectId) ?? null;

  // Assigning a vendor is THE way a table gets a banner now; it also clears
  // any legacy per-box bannerId so the vendor's own banner/name wins.
  const handleAssignVendor = useCallback((vendorId: string | undefined) => {
    if (!selectedRectId) return;
    const rects = metaRef.current?.rects.map((r) =>
      r.id === selectedRectId
        ? { ...r, vendorId, bannerId: vendorId ? undefined : r.bannerId }
        : r,
    );
    if (rects) handleRectsChange(rects);
  }, [selectedRectId, handleRectsChange]);

  const [creatingVendor, setCreatingVendor] = useState<string | null>(null); // null = closed

  const handleQuickCreateVendor = useCallback(async () => {
    const name = creatingVendor?.trim();
    if (!name || !onAddVendor) return;
    const id = await onAddVendor(name);
    setCreatingVendor(null);
    handleAssignVendor(id);
  }, [creatingVendor, onAddVendor, handleAssignVendor]);

  // Show-standard table size: re-derives an inferred scale from the current
  // boxes (they're the ruler), but never touches a manual calibration
  const handleTableSize = useCallback((ft: 6 | 8) => {
    const prev = metaRef.current;
    if (!prev || (prev.tableLengthFt ?? 6) === ft) return;
    const next: VendorPlanMeta = { ...prev, tableLengthFt: ft, updatedAt: Date.now() };
    if (prev.pxPerMeterSource !== 'manual' && prev.rects.length > 0) {
      next.pxPerMeter = inferScale(prev.rects, prev.imgW, standardTableW(ft));
    }
    setMeta(next);
    onSaveMeta(next);
  }, [onSaveMeta]);

  const handleStartChange = useCallback((p: { x: number; y: number }) => {
    const prev = metaRef.current;
    if (!prev) return;
    const next: VendorPlanMeta = { ...prev, startPx: p, updatedAt: Date.now() };
    setMeta(next);
    onSaveMeta(next); // single click — persist immediately, no debounce
  }, [onSaveMeta]);

  const vendorNames = useMemo(
    () => new Map(vendors.map((v) => [v.id, v.name])),
    [vendors],
  );

  const layout = meta ? planToLayout(meta) : null;
  const totalTables = layout?.tables.length ?? 0;
  const hasMeta = meta !== null;
  const state: PlanWorkbenchState = { hasMeta, detecting, totalTables };

  useEffect(() => {
    onStateChange?.({ hasMeta, detecting, totalTables });
  }, [onStateChange, hasMeta, detecting, totalTables]);

  // Workbench chrome styles — under 'refined' these reproduce the pre-theme
  // literals exactly; other themes swap in their tokens.
  const isR = t.id === 'refined';
  const secondaryBtn = secondaryButton(t);
  const wbInput: CSSProperties = {
    background: t.surface,
    color: t.text,
    border: isR ? '1px solid #555' : `${t.borderWidth}px solid ${t.border}`,
    borderRadius: '6px',
    fontFamily: isR ? 'Georgia, serif' : t.fontBody,
  };

  return (
    <div style={{
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {!planUrl && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => document.getElementById('plan-input')?.click()}
          style={{
            width: '100%',
            maxWidth: '560px',
            border: `2px dashed ${dragging ? t.accent : (isR ? '#555' : t.border)}`,
            borderRadius: '12px',
            padding: '48px 40px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? withAlpha(t.accent, 0.05) : 'rgba(255,255,255,0.03)',
            transition: 'all 0.2s',
            marginBottom: '32px',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🗺️</div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>
            {detecting ? 'Reading the floor plan…' : 'Drop a convention floor plan here'}
          </div>
          <div style={{ fontSize: '13px', color: isR ? '#666' : t.muted }}>
            or click to browse — tables are detected automatically, then you can fix them up
          </div>
          <input
            id="plan-input"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {planUrl && (
        <div style={{ width: '100%', maxWidth: '900px' }}>
          {detecting && (
            <div style={{
              textAlign: 'center',
              color: t.accent,
              letterSpacing: '0.1em',
              padding: '20px',
              fontSize: '14px',
              fontFamily: isR ? undefined : t.fontMono,
            }}>
              DETECTING TABLES…
            </div>
          )}

          {!detecting && meta && (
            <>
              {/* One-line orientation for first-time editors — the tools
                  below are otherwise discover-by-poking */}
              <div
                style={{
                  ...t.note,
                  fontSize: 13,
                  textAlign: 'center',
                  border: `${t.borderWidth}px solid ${t.border}`,
                  borderRadius: '6px',
                  padding: '8px 14px',
                  margin: '0 0 10px',
                }}
              >
                Drag boxes to fix detection · click a box to assign a vendor · Shift-click or drag empty space to select several · scroll to zoom, Space- or middle-drag to pan
              </div>
              <PlanEditor
                planUrl={planUrl}
                imgW={meta.imgW}
                imgH={meta.imgH}
                rects={meta.rects}
                pxPerMeter={meta.pxPerMeter}
                tableLengthFt={meta.tableLengthFt}
                onChange={handleRectsChange}
                onCalibrateLine={setCalibrationPx}
                onSelectionChange={setSelectedRectId}
                startPx={meta.startPx ?? null}
                onStartChange={handleStartChange}
                vendorNames={vendorNames}
              />

              {selectedRect && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                  background: 'rgba(255,255,255,0.05)',
                  border: isR ? '1px solid #444' : `${t.borderWidth}px solid ${t.border}`,
                  borderRadius: '8px',
                  padding: '10px 16px',
                  margin: '12px 0 0',
                  fontSize: '13px',
                  color: isR ? '#aaa' : t.muted,
                }}>
                  <span>Vendor at this booth:</span>
                  <select
                    value={selectedRect.vendorId && vendorNames.has(selectedRect.vendorId) ? selectedRect.vendorId : ''}
                    onChange={(e) => handleAssignVendor(e.target.value || undefined)}
                    style={{
                      ...wbInput,
                      padding: '7px 10px',
                      fontSize: '13px',
                      maxWidth: '220px',
                    }}
                  >
                    <option value="">— unassigned —</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  {onAddVendor && (creatingVendor === null ? (
                    <button
                      onClick={() => setCreatingVendor('')}
                      style={{ ...secondaryBtn, padding: '6px 12px', fontSize: '12px' }}
                    >
                      ＋ New vendor…
                    </button>
                  ) : (
                    <>
                      <input
                        type="text"
                        autoFocus
                        placeholder="Vendor name"
                        value={creatingVendor}
                        onChange={(e) => setCreatingVendor(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleQuickCreateVendor(); }}
                        style={{
                          ...wbInput,
                          padding: '7px 10px',
                          fontSize: '13px',
                          width: '150px',
                        }}
                      />
                      <button
                        onClick={handleQuickCreateVendor}
                        disabled={!creatingVendor.trim()}
                        style={{
                          ...secondaryBtn,
                          padding: '6px 12px',
                          fontSize: '12px',
                          background: creatingVendor.trim() ? t.accent : (isR ? '#333' : t.primaryButtonDisabled.background),
                          color: creatingVendor.trim() ? t.accentContrast : (isR ? '#666' : t.primaryButtonDisabled.color),
                          border: 'none',
                          cursor: creatingVendor.trim() ? 'pointer' : 'not-allowed',
                        }}
                      >
                        Create & assign
                      </button>
                      <button
                        onClick={() => setCreatingVendor(null)}
                        style={{ ...secondaryBtn, padding: '6px 10px', fontSize: '12px' }}
                      >
                        Cancel
                      </button>
                    </>
                  ))}
                  {!selectedRect.vendorId && (
                    <span style={{ color: isR ? '#666' : t.muted }}>unassigned — plain cloth / global banner</span>
                  )}
                </div>
              )}

              {calibrationPx !== null && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                  background: 'rgba(255,255,255,0.05)',
                  border: `${t.borderWidth}px solid ${t.accent}`,
                  borderRadius: '8px',
                  padding: '12px 16px',
                  margin: '12px 0 0',
                  fontSize: '14px',
                }}>
                  <span>How long is that line in real life?</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    autoFocus
                    value={calibrationValue}
                    onChange={(e) => setCalibrationValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyCalibration(); }}
                    style={{
                      ...wbInput,
                      width: '80px',
                      padding: '8px 10px',
                      fontSize: '14px',
                    }}
                  />
                  <select
                    value={calibrationUnit}
                    onChange={(e) => setCalibrationUnit(e.target.value as 'm' | 'ft')}
                    style={{
                      ...wbInput,
                      padding: '8px 10px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="ft">feet</option>
                    <option value="m">meters</option>
                  </select>
                  <button
                    onClick={applyCalibration}
                    disabled={!(parseFloat(calibrationValue) > 0)}
                    style={{
                      background: parseFloat(calibrationValue) > 0 ? t.accent : (isR ? '#333' : t.primaryButtonDisabled.background),
                      color: parseFloat(calibrationValue) > 0 ? t.accentContrast : (isR ? '#666' : t.primaryButtonDisabled.color),
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 18px',
                      fontSize: '14px',
                      cursor: parseFloat(calibrationValue) > 0 ? 'pointer' : 'not-allowed',
                      fontFamily: isR ? 'Georgia, serif' : t.fontBody,
                    }}
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => { setCalibrationPx(null); setCalibrationValue(''); }}
                    style={{ ...secondaryBtn, padding: '8px 14px', fontSize: '13px' }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Scale readout */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                color: isR ? '#888' : t.muted,
                fontSize: '13px',
                letterSpacing: '0.05em',
                margin: '12px 2px 24px',
                fontFamily: isR ? undefined : t.fontMono,
              }}>
                <span>
                  Hall ≈ {layout ? `${layout.hall.width.toFixed(0)} × ${layout.hall.depth.toFixed(0)} m` : '—'}
                  {meta.pxPerMeterSource === 'manual' ? ' · calibrated' : ''}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  Table size:
                  {([6, 8] as const).map((ft) => {
                    const active = (meta.tableLengthFt ?? 6) === ft;
                    return (
                      <button
                        key={ft}
                        onClick={() => handleTableSize(ft)}
                        style={{
                          background: active ? t.accent : 'transparent',
                          color: active ? t.accentContrast : (isR ? '#aaa' : t.muted),
                          border: `${t.borderWidth}px solid ${active ? t.accent : (isR ? '#555' : t.border)}`,
                          borderRadius: '6px',
                          padding: '3px 10px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          fontFamily: isR ? 'Georgia, serif' : t.fontMono,
                        }}
                      >
                        {ft} ft
                      </button>
                    );
                  })}
                </span>
                <span>
                  {meta.rects.length} box{meta.rects.length === 1 ? '' : 'es'} → {totalTables} table{totalTables === 1 ? '' : 's'} (≈{meta.tableLengthFt ?? 6} ft each)
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {actions?.(state)}
                <button
                  onClick={runDetection}
                  style={secondaryBtn}
                >
                  Re-detect
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Replace the floor plan? Your table boxes will be cleared.')) {
                      onClearPlan();
                    }
                  }}
                  style={secondaryBtn}
                >
                  Replace image
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Quiet outlined action for the workbench chrome — now a function of the
 *  active theme (all consumers live in this batch: this file +
 *  VendorSetupScreen). Under 'refined' it is the pre-theme literal style;
 *  other themes reuse their ghost-button recipe. */
export const secondaryButton = (t: Theme): CSSProperties =>
  t.id === 'refined'
    ? {
        background: 'transparent',
        color: '#e8e4dc',
        border: '1px solid #555',
        padding: '14px 24px',
        fontSize: '14px',
        letterSpacing: '0.05em',
        borderRadius: '8px',
        cursor: 'pointer',
        fontFamily: 'Georgia, serif',
      }
    : { ...t.ghostButton, padding: '14px 24px', fontSize: '14px', letterSpacing: '0.05em' };
