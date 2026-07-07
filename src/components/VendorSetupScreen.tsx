import { useCallback, useRef, useState } from 'react';
import PlanWorkbench, { secondaryButton } from './PlanWorkbench';
import type { PlanWorkbenchHandle, PlanWorkbenchState } from './PlanWorkbench';
import type { VendorPlanMeta } from '../lib/vendorPlan';
import type { SavedPlanRecord } from '../lib/db';
import type { VendorSummary } from '../lib/useVendors';
import { useAuth } from '../lib/auth';
import { publishShow } from '../lib/showService';

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

const GOLD = '#d4af37';

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

  // Publish to the public shows directory — organizer accounts only.
  // This screen is DOM (outside any Canvas), so auth context is available.
  const { configured, session } = useAuth();
  const [publishName, setPublishName] = useState<string | null>(null); // null = closed
  const [publishDate, setPublishDate] = useState('');
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishResult, setPublishResult] = useState<{ id?: string; error?: string } | null>(null);

  const handlePublishShow = useCallback(async () => {
    const name = publishName?.trim();
    if (!name || !session || publishBusy) return;
    setPublishBusy(true);
    setPublishResult(null);
    try {
      // Flush any pending debounced edit so the published snapshot is current
      // (same as the save path).
      const meta = (await workbenchRef.current?.flushPendingMeta()) ?? null;
      const blob = await getPlanBlob();
      if (!blob || !meta) throw new Error('No floor plan to publish.');
      const id = await publishShow({
        organizerId: session.user.id,
        name,
        showDate: publishDate || undefined,
        planBlob: blob,
        meta,
      });
      setPublishResult({ id });
      setPublishName(null);
      setPublishDate('');
    } catch (e) {
      setPublishResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setPublishBusy(false);
    }
  }, [publishName, publishDate, session, publishBusy, getPlanBlob]);

  const handleSavePlan = useCallback(async () => {
    const name = savingName?.trim();
    if (!name) return;
    // Flush any pending debounced edit so the snapshot is current
    await workbenchRef.current?.flushPendingMeta();
    await onSavePlan(name, savingDate || undefined);
    setSavingName(null);
    setSavingDate('');
  }, [savingName, savingDate, onSavePlan]);

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
        CONVENTION VIEW
      </h1>
      <p style={{ color: '#888', marginBottom: '32px', fontSize: '14px', letterSpacing: '0.08em' }}>
        WALK A CARD SHOW FROM ITS FLOOR PLAN
      </p>

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
        )}
      />

      {(savedPlans.length > 0 || (wb.hasMeta && !wb.detecting)) && (
        <div style={{ width: '100%', maxWidth: '900px', marginTop: '36px' }}>
          <div style={{
            color: '#888',
            fontSize: '13px',
            letterSpacing: '0.12em',
            marginBottom: '12px',
          }}>
            SAVED PLANS
          </div>

          {wb.hasMeta && !wb.detecting && (
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
                <input
                  type="date"
                  title="Show date (optional) — past shows count toward vendors' show history"
                  value={savingDate}
                  onChange={(e) => setSavingDate(e.target.value)}
                  style={{
                    background: '#0d0b0a',
                    color: savingDate ? '#e8e4dc' : '#777',
                    border: '1px solid #555',
                    borderRadius: '6px',
                    padding: '9px 12px',
                    fontSize: '14px',
                    fontFamily: 'Georgia, serif',
                    colorScheme: 'dark',
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
                <button onClick={() => { setSavingName(null); setSavingDate(''); }} style={{ ...secondaryButton, padding: '10px 14px', fontSize: '13px' }}>
                  Cancel
                </button>
              </div>
            )
          )}

          {/* Publish to the public shows directory — signed-in organizers only */}
          {wb.hasMeta && !wb.detecting && configured && session && (
            publishName === null ? (
              <button
                onClick={() => { setPublishName(''); setPublishResult(null); }}
                style={{ ...secondaryButton, marginBottom: '12px', marginLeft: savingName === null ? '10px' : 0 }}
              >
                📣 Publish to Card Shows…
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                <input
                  type="text"
                  autoFocus
                  placeholder="Show name"
                  value={publishName}
                  onChange={(e) => setPublishName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePublishShow(); }}
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
                <input
                  type="date"
                  title="Show date (optional) — shown in the public directory"
                  value={publishDate}
                  onChange={(e) => setPublishDate(e.target.value)}
                  style={{
                    background: '#0d0b0a',
                    color: publishDate ? '#e8e4dc' : '#777',
                    border: '1px solid #555',
                    borderRadius: '6px',
                    padding: '9px 12px',
                    fontSize: '14px',
                    fontFamily: 'Georgia, serif',
                    colorScheme: 'dark',
                  }}
                />
                <button
                  onClick={handlePublishShow}
                  disabled={!publishName.trim() || publishBusy}
                  style={{
                    background: publishName.trim() && !publishBusy ? GOLD : '#333',
                    color: publishName.trim() && !publishBusy ? '#1a1614' : '#666',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '10px 20px',
                    fontSize: '14px',
                    cursor: publishName.trim() && !publishBusy ? 'pointer' : 'not-allowed',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {publishBusy ? 'Publishing…' : 'Publish'}
                </button>
                <button
                  onClick={() => { setPublishName(null); setPublishDate(''); }}
                  disabled={publishBusy}
                  style={{ ...secondaryButton, padding: '10px 14px', fontSize: '13px' }}
                >
                  Cancel
                </button>
              </div>
            )
          )}
          {publishResult?.id && (
            <div style={{ color: GOLD, fontSize: '13px', marginBottom: '12px' }}>
              Published — view it at{' '}
              <a href={`/show/${publishResult.id}`} style={{ color: GOLD }}>
                /show/{publishResult.id}
              </a>
            </div>
          )}
          {publishResult?.error && (
            <div style={{ color: '#c66', fontSize: '13px', marginBottom: '12px' }}>
              Publish failed: {publishResult.error}
            </div>
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
                {p.showDate ? `show ${p.showDate} · ` : ''}{new Date(p.updatedAt).toLocaleDateString()}
              </span>
              <button
                onClick={() => {
                  if (!wb.hasMeta || window.confirm(`Load “${p.name}”? The current working plan will be replaced.`)) {
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
