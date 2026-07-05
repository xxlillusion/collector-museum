import { useCallback, useEffect, useRef, useState } from 'react';
import PlanEditor from './PlanEditor';
import { detectTables } from '../lib/planDetect';
import { getFloorPlan } from '../lib/db';
import type { VendorRect, VendorPlanMeta } from '../lib/vendorPlan';
import { planToLayout } from '../lib/vendorPlan';

interface VendorSetupScreenProps {
  planUrl: string | null;
  planMeta: VendorPlanMeta | null;
  onSetPlan: (file: File) => Promise<void>;
  onSaveMeta: (meta: VendorPlanMeta) => Promise<void>;
  onClearPlan: () => Promise<void>;
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
  onGenerate,
  onBack,
}: VendorSetupScreenProps) {
  const [dragging, setDragging] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [meta, setMeta] = useState<VendorPlanMeta | null>(planMeta);
  const saveTimer = useRef<number | null>(null);

  // A restored session arrives with saved meta; a fresh upload sets it below
  useEffect(() => setMeta(planMeta), [planMeta]);

  const runDetection = useCallback(async () => {
    setDetecting(true);
    // Let the spinner paint before the pixel crunch
    await new Promise((r) => setTimeout(r, 30));
    try {
      const blob = await getFloorPlan();
      if (!blob) return;
      const result = await detectTables(blob);
      const next: VendorPlanMeta = {
        rects: result.rects,
        pxPerMeter: result.pxPerMeter,
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

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    setDetecting(true);
    await onSetPlan(file);
    await runDetection();
  }, [onSetPlan, runDetection]);

  // Debounce-persist rect edits so they survive refresh without a save button
  const handleRectsChange = useCallback((rects: VendorRect[]) => {
    setMeta((prev) => {
      if (!prev) return prev;
      const next = { ...prev, rects, updatedAt: Date.now() };
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => onSaveMeta(next), 500);
      return next;
    });
  }, [onSaveMeta]);

  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
  }, []);

  const layout = meta ? planToLayout(meta) : null;
  const totalTables = layout?.tables.length ?? 0;

  return (
    <div style={{
      minHeight: '100vh',
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
                onChange={handleRectsChange}
              />

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
                </span>
                <span>
                  {meta.rects.length} box{meta.rects.length === 1 ? '' : 'es'} → {totalTables} table{totalTables === 1 ? '' : 's'} (6 ft each)
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
