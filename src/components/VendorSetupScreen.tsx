import { useCallback, useEffect, useRef, useState } from 'react';
import PlanEditor from './PlanEditor';
import { detectTables, inferScale } from '../lib/planDetect';
import { getFloorPlan } from '../lib/db';
import type { VendorRect, VendorPlanMeta } from '../lib/vendorPlan';
import type { SavedPlanRecord } from '../lib/db';
import { planToLayout, standardTableW } from '../lib/vendorPlan';

interface VendorSetupScreenProps {
  planUrl: string | null;
  planMeta: VendorPlanMeta | null;
  onSetPlan: (file: File) => Promise<void>;
  onSaveMeta: (meta: VendorPlanMeta) => Promise<void>;
  onClearPlan: () => Promise<void>;
  vendorBannerUrls: Map<string, string>;
  onAddVendorBanner: (file: File) => Promise<string>;
  onRemoveVendorBanner: (id: string) => Promise<void>;
  savedPlans: SavedPlanRecord[];
  onSavePlan: (name: string) => Promise<void>;
  onLoadPlan: (id: string) => Promise<void>;
  onDeletePlan: (id: string) => Promise<void>;
  onGenerate: () => void;
  onBack: () => void;
}

const GOLD = '#d4af37';

export default function VendorSetupScreen({
  planUrl,
  planMeta,
  onSetPlan,
  onSaveMeta,
  onClearPlan,
  vendorBannerUrls,
  onAddVendorBanner,
  onRemoveVendorBanner,
  savedPlans,
  onSavePlan,
  onLoadPlan,
  onDeletePlan,
  onGenerate,
  onBack,
}: VendorSetupScreenProps) {
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

  const runDetection = useCallback(async () => {
    setDetecting(true);
    // Let the spinner paint before the pixel crunch
    await new Promise((r) => setTimeout(r, 30));
    try {
      const blob = await getFloorPlan();
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
  }, [onSaveMeta]);

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

  // Ref mirror for the debounced orphan sweep below
  const bannerUrlsRef = useRef(vendorBannerUrls);
  bannerUrlsRef.current = vendorBannerUrls;
  const removeBannerRef = useRef(onRemoveVendorBanner);
  removeBannerRef.current = onRemoveVendorBanner;

  // Debounce-persist rect edits so they survive refresh without a save button
  const handleRectsChange = useCallback((rects: VendorRect[]) => {
    setMeta((prev) => {
      if (!prev) return prev;
      const next = { ...prev, rects, updatedAt: Date.now() };
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        onSaveMeta(next);
        // Sweep banner blobs no rect references anymore (deleted/reassigned)
        const referenced = new Set(next.rects.map((r) => r.bannerId).filter(Boolean));
        for (const id of bannerUrlsRef.current.keys()) {
          if (!referenced.has(id)) removeBannerRef.current(id);
        }
      }, 500);
      return next;
    });
  }, [onSaveMeta]);

  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
  }, []);

  const selectedRect = meta?.rects.find((r) => r.id === selectedRectId) ?? null;

  const handleBannerUpload = useCallback(async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/') || !selectedRectId) return;
    // Cancel any pending persist so its sweep can't reap the new banner
    // before the assignment below lands
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const id = await onAddVendorBanner(file);
    const rects = metaRef.current?.rects.map((r) =>
      r.id === selectedRectId ? { ...r, bannerId: id } : r,
    );
    if (rects) handleRectsChange(rects);
  }, [selectedRectId, onAddVendorBanner, handleRectsChange]);

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

  const handleBannerRemove = useCallback(() => {
    if (!selectedRectId) return;
    const rects = metaRef.current?.rects.map((r) =>
      r.id === selectedRectId ? { ...r, bannerId: undefined } : r,
    );
    if (rects) handleRectsChange(rects); // the debounced sweep deletes the blob
  }, [selectedRectId, handleRectsChange]);

  const [savingName, setSavingName] = useState<string | null>(null); // null = closed

  const handleSavePlan = useCallback(async () => {
    const name = savingName?.trim();
    if (!name) return;
    // Flush any pending debounced edit so the snapshot is current
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (metaRef.current) await onSaveMeta(metaRef.current);
    }
    await onSavePlan(name);
    setSavingName(null);
  }, [savingName, onSavePlan, onSaveMeta]);

  const layout = meta ? planToLayout(meta) : null;
  const totalTables = layout?.tables.length ?? 0;

  return (
    <div style={{
      height: '100vh',
      overflowY: 'auto',
      boxSizing: 'border-box',
      background: '#1a1614',
      color: '#e8e4dc',
      fontFamily: 'Georgia, serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 24px',
    }}>
      <h1 style={{ fontSize: '2rem', letterSpacing: '0.12em', marginBottom: '4px', color: GOLD }}>
        VENDOR VIEW
      </h1>
      <p style={{ color: '#888', marginBottom: '32px', fontSize: '14px', letterSpacing: '0.08em' }}>
        WALK A CARD SHOW FROM ITS FLOOR PLAN
      </p>

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
                  <span>Vendor banner for this box:</span>
                  {selectedRect.bannerId && vendorBannerUrls.get(selectedRect.bannerId) ? (
                    <>
                      <img
                        src={vendorBannerUrls.get(selectedRect.bannerId)}
                        alt="Vendor banner"
                        style={{ height: '36px', borderRadius: '4px', border: '1px solid #555' }}
                      />
                      <button onClick={handleBannerRemove} style={{ ...secondaryButton, padding: '6px 12px', fontSize: '12px' }}>
                        Remove
                      </button>
                    </>
                  ) : (
                    <span style={{ color: '#666' }}>none — uses the global tablecloth banner</span>
                  )}
                  <label style={{
                    ...secondaryButton,
                    padding: '6px 12px',
                    fontSize: '12px',
                    display: 'inline-block',
                  }}>
                    {selectedRect.bannerId ? 'Replace…' : 'Upload…'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        handleBannerUpload(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
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
                <button
                  onClick={onGenerate}
                  disabled={totalTables === 0}
                  style={{
                    background: totalTables > 0 ? GOLD : '#333',
                    color: totalTables > 0 ? '#1a1614' : '#666',
                    border: 'none',
                    padding: '14px 40px',
                    fontSize: '16px',
                    letterSpacing: '0.1em',
                    borderRadius: '8px',
                    cursor: totalTables > 0 ? 'pointer' : 'not-allowed',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  GENERATE →
                </button>
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

      {(savedPlans.length > 0 || (meta && !detecting)) && (
        <div style={{ width: '100%', maxWidth: '900px', marginTop: '36px' }}>
          <div style={{
            color: '#888',
            fontSize: '13px',
            letterSpacing: '0.12em',
            marginBottom: '12px',
          }}>
            SAVED PLANS
          </div>

          {meta && !detecting && (
            savingName === null ? (
              <button onClick={() => setSavingName('')} style={{ ...secondaryButton, marginBottom: '12px' }}>
                💾 Save this plan…
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                <input
                  type="text"
                  autoFocus
                  placeholder="Plan name"
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePlan(); }}
                  style={{
                    background: '#0d0b0a',
                    color: '#e8e4dc',
                    border: '1px solid #555',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    fontSize: '14px',
                    fontFamily: 'Georgia, serif',
                    width: '220px',
                  }}
                />
                <button
                  onClick={handleSavePlan}
                  disabled={!savingName.trim()}
                  style={{
                    background: savingName.trim() ? GOLD : '#333',
                    color: savingName.trim() ? '#1a1614' : '#666',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '10px 20px',
                    fontSize: '14px',
                    cursor: savingName.trim() ? 'pointer' : 'not-allowed',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  Save
                </button>
                <button onClick={() => setSavingName(null)} style={{ ...secondaryButton, padding: '10px 14px', fontSize: '13px' }}>
                  Cancel
                </button>
              </div>
            )
          )}

          {savedPlans.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                border: '1px solid #3a3a3a',
                borderRadius: '8px',
                marginBottom: '8px',
                fontSize: '14px',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.name}
              </span>
              <span style={{ color: '#666', fontSize: '12px', whiteSpace: 'nowrap' }}>
                {new Date(p.updatedAt).toLocaleDateString()}
              </span>
              <button
                onClick={() => {
                  if (!meta || window.confirm(`Load “${p.name}”? The current working plan will be replaced.`)) {
                    onLoadPlan(p.id);
                  }
                }}
                style={{ ...secondaryButton, padding: '6px 14px', fontSize: '13px' }}
              >
                Load
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Delete the saved plan “${p.name}”?`)) onDeletePlan(p.id);
                }}
                style={{ ...secondaryButton, padding: '6px 10px', fontSize: '13px', color: '#c66' }}
              >
                ✕
              </button>
            </div>
          ))}
          {savedPlans.length === 0 && (
            <div style={{ color: '#555', fontSize: '13px' }}>Nothing saved yet.</div>
          )}
        </div>
      )}

      <button
        onClick={onBack}
        style={{
          ...secondaryButton,
          marginTop: '40px',
          border: 'none',
          color: '#888',
        }}
      >
        ← Back to the museum
      </button>
    </div>
  );
}

const secondaryButton: React.CSSProperties = {
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
