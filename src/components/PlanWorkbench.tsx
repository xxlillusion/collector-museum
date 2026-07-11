import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import PlanEditor from './PlanEditor';
import { noteStyle, HAIRLINE } from './museumKit';
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

const GOLD = '#d4af37';

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
            border: `2px dashed ${dragging ? GOLD : '#555'}`,
            borderRadius: '12px',
            padding: '48px 40px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'rgba(212,175,55,0.05)' : 'rgba(255,255,255,0.03)',
            transition: 'all 0.2s',
            marginBottom: '32px',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🗺️</div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>
            {detecting ? 'Reading the floor plan…' : 'Drop a convention floor plan here'}
          </div>
          <div style={{ fontSize: '13px', color: '#666' }}>
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
              color: GOLD,
              letterSpacing: '0.1em',
              padding: '20px',
              fontSize: '14px',
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
                  ...noteStyle,
                  fontSize: 13,
                  textAlign: 'center',
                  border: `1px solid ${HAIRLINE}`,
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
                  border: '1px solid #444',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  margin: '12px 0 0',
                  fontSize: '13px',
                  color: '#aaa',
                }}>
                  <span>Vendor at this booth:</span>
                  <select
                    value={selectedRect.vendorId && vendorNames.has(selectedRect.vendorId) ? selectedRect.vendorId : ''}
                    onChange={(e) => handleAssignVendor(e.target.value || undefined)}
                    style={{
                      background: '#0d0b0a',
                      color: '#e8e4dc',
                      border: '1px solid #555',
                      borderRadius: '6px',
                      padding: '7px 10px',
                      fontSize: '13px',
                      fontFamily: 'Georgia, serif',
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
                      style={{ ...secondaryButton, padding: '6px 12px', fontSize: '12px' }}
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
                          background: '#0d0b0a',
                          color: '#e8e4dc',
                          border: '1px solid #555',
                          borderRadius: '6px',
                          padding: '7px 10px',
                          fontSize: '13px',
                          fontFamily: 'Georgia, serif',
                          width: '150px',
                        }}
                      />
                      <button
                        onClick={handleQuickCreateVendor}
                        disabled={!creatingVendor.trim()}
                        style={{
                          ...secondaryButton,
                          padding: '6px 12px',
                          fontSize: '12px',
                          background: creatingVendor.trim() ? GOLD : '#333',
                          color: creatingVendor.trim() ? '#1a1614' : '#666',
                          border: 'none',
                          cursor: creatingVendor.trim() ? 'pointer' : 'not-allowed',
                        }}
                      >
                        Create & assign
                      </button>
                      <button
                        onClick={() => setCreatingVendor(null)}
                        style={{ ...secondaryButton, padding: '6px 10px', fontSize: '12px' }}
                      >
                        Cancel
                      </button>
                    </>
                  ))}
                  {!selectedRect.vendorId && (
                    <span style={{ color: '#666' }}>unassigned — plain cloth / global banner</span>
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
                  border: `1px solid ${GOLD}`,
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
                      width: '80px',
                      background: '#0d0b0a',
                      color: '#e8e4dc',
                      border: '1px solid #555',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '14px',
                      fontFamily: 'Georgia, serif',
                    }}
                  />
                  <select
                    value={calibrationUnit}
                    onChange={(e) => setCalibrationUnit(e.target.value as 'm' | 'ft')}
                    style={{
                      background: '#0d0b0a',
                      color: '#e8e4dc',
                      border: '1px solid #555',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '14px',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    <option value="ft">feet</option>
                    <option value="m">meters</option>
                  </select>
                  <button
                    onClick={applyCalibration}
                    disabled={!(parseFloat(calibrationValue) > 0)}
                    style={{
                      background: parseFloat(calibrationValue) > 0 ? GOLD : '#333',
                      color: parseFloat(calibrationValue) > 0 ? '#1a1614' : '#666',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 18px',
                      fontSize: '14px',
                      cursor: parseFloat(calibrationValue) > 0 ? 'pointer' : 'not-allowed',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => { setCalibrationPx(null); setCalibrationValue(''); }}
                    style={{ ...secondaryButton, padding: '8px 14px', fontSize: '13px' }}
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
                color: '#888',
                fontSize: '13px',
                letterSpacing: '0.05em',
                margin: '12px 2px 24px',
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
                          background: active ? GOLD : 'transparent',
                          color: active ? '#1a1614' : '#aaa',
                          border: `1px solid ${active ? GOLD : '#555'}`,
                          borderRadius: '6px',
                          padding: '3px 10px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          fontFamily: 'Georgia, serif',
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
                  style={secondaryButton}
                >
                  Re-detect
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Replace the floor plan? Your table boxes will be cleared.')) {
                      onClearPlan();
                    }
                  }}
                  style={secondaryButton}
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

export const secondaryButton: CSSProperties = {
  background: 'transparent',
  color: '#e8e4dc',
  border: '1px solid #555',
  padding: '14px 24px',
  fontSize: '14px',
  letterSpacing: '0.05em',
  borderRadius: '8px',
  cursor: 'pointer',
  fontFamily: 'Georgia, serif',
};
