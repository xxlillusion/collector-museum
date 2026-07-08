import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import { getMyProfile } from '../../lib/profileService';
import type { ProfileRecord } from '../../lib/profileService';
import { publishShow, updateShow, getMyShowForEdit } from '../../lib/showService';
import type { MyShowForEdit } from '../../lib/showService';
import { listRegisteredVendors } from '../../lib/publicVendors';
import type { RegisteredVendorSummary } from '../../lib/publicVendors';
import { COUNTRIES, regionOptions } from '../../lib/locations';
import { useVendorPlan } from '../../lib/useVendorPlan';
import { useVendors } from '../../lib/useVendors';
import type { VendorSummary } from '../../lib/useVendors';
import { useProvider } from '../../lib/provider/context';
// Legacy per-box banner slots belong to the working plan image — seeding or
// replacing it wipes them, exactly like App.tsx's handleSetPlan wrapper.
import { deleteAllVendorBanners } from '../../lib/db';
import type { PlanWorkbenchHandle, PlanWorkbenchState } from '../../components/PlanWorkbench';
import {
  GOLD, MUTED, TEXT, SERIF,
  noteStyle as kitNoteStyle, inputStyle, labelStyle, errorTextStyle,
  primaryButtonStyle, primaryButtonDisabledStyle, ghostButtonStyle, subtleButtonStyle,
} from '../../components/museumKit';

// The workbench carries the detection pipeline + plan editor — lazy so the
// organizer list / gate pages never pull that chunk.
const PlanWorkbench = lazy(() => import('../../components/PlanWorkbench'));

// Kit note, sized up for the gate / status pages.
const noteStyle: React.CSSProperties = { ...kitNoteStyle, fontSize: 17, lineHeight: 1.7 };

/**
 * Organizer-only show create (/organizer/show/new) and edit
 * (/organizer/show/:id/edit). Both modes drive the shared local working
 * slots (useVendorPlan) through PlanWorkbench — edit mode seeds them from
 * the cloud show first (the proven useSavedPlans.loadPlan pattern), which
 * is why entering either mode confirms before clobbering a sandbox draft.
 */
export default function ShowEditorScreen({ showId }: { showId?: string }) {
  const isEdit = Boolean(showId);
  const { configured, session, loading: authLoading } = useAuth();
  const provider = useProvider();
  const vendorPlan = useVendorPlan();
  const { setPlan, clearPlan, reload: reloadPlan } = vendorPlan;
  const localVendors = useVendors();
  const workbenchRef = useRef<PlanWorkbenchHandle>(null);

  // undefined = still loading, null = no profile row
  const [profile, setProfile] = useState<ProfileRecord | null | undefined>(undefined);
  // undefined = still loading, null = not found / not visible (edit mode only)
  const [show, setShow] = useState<MyShowForEdit | null | undefined>(isEdit ? undefined : null);
  const [registered, setRegistered] = useState<RegisteredVendorSummary[]>([]);

  // Entering the editor replaces the local sandbox draft — confirmed gates
  // the workbench until the organizer okays that (auto-okayed when no draft).
  const [confirmed, setConfirmed] = useState(false);
  // Edit mode: true once the cloud show has been copied into the working slots.
  const [seeded, setSeeded] = useState(!isEdit);
  // Edit mode: the plan image is re-uploaded only when the organizer replaced it.
  const [imageReplaced, setImageReplaced] = useState(false);

  const [name, setName] = useState('');
  const [showDate, setShowDate] = useState('');
  const [country, setCountry] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [city, setCity] = useState('');

  const [wb, setWb] = useState<PlanWorkbenchState>({ hasMeta: false, detecting: false, totalTables: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  const userId = session?.user.id ?? null;

  // ---- organizer gate ----
  useEffect(() => {
    if (!configured || !userId) return;
    let cancelled = false;
    getMyProfile(userId)
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
  }, [configured, userId]);

  const isOrganizer = Boolean(profile?.isOrganizer);

  // ---- vendors for the assignment dropdown: registered accounts ∪ the
  // organizer's own placeholder records, deduped by id (registered wins) ----
  useEffect(() => {
    let cancelled = false;
    listRegisteredVendors().then((list) => { if (!cancelled) setRegistered(list); });
    return () => { cancelled = true; };
  }, []);

  const vendors = useMemo<VendorSummary[]>(() => {
    const map = new Map<string, VendorSummary>();
    for (const v of localVendors.vendors) map.set(v.id, v);
    for (const r of registered) map.set(r.id, r);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [localVendors.vendors, registered]);

  // ---- edit mode: load the show ----
  useEffect(() => {
    if (!isEdit || !showId || !isOrganizer) return;
    let cancelled = false;
    getMyShowForEdit(showId)
      .then((s) => { if (!cancelled) setShow(s); })
      .catch((e) => {
        if (!cancelled) {
          setShow(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => { cancelled = true; };
  }, [isEdit, showId, isOrganizer]);

  // Prefill the form from the loaded show
  useEffect(() => {
    if (!show) return;
    setName(show.name);
    setShowDate(show.showDate ?? '');
    setCountry(show.country ?? '');
    setStateCode(show.state ?? '');
    setCity(show.city ?? '');
  }, [show]);

  // No sandbox draft = nothing to clobber; skip the confirmation step.
  useEffect(() => {
    if (!vendorPlan.loading && vendorPlan.planMeta === null) setConfirmed(true);
  }, [vendorPlan.loading, vendorPlan.planMeta]);

  // ---- edit mode: seed the working slots from the cloud show (the
  // useSavedPlans.loadPlan pattern: raw blob put + meta save, then reload) ----
  const seedStarted = useRef(false);
  useEffect(() => {
    if (!isEdit || !confirmed || !show || seedStarted.current) return;
    seedStarted.current = true;
    (async () => {
      try {
        await deleteAllVendorBanners();
        await provider.deleteFloorPlan();
        await provider.deletePlanMeta();
        if (show.planBlob) await provider.putFloorPlanBlob(show.planBlob);
        if (show.meta) await provider.savePlanMeta(show.meta);
        await reloadPlan();
        setSeeded(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [isEdit, confirmed, show, provider, reloadPlan]);

  // ---- workbench plan handlers (mirror App.tsx's wrappers: legacy per-box
  // banners belong to the plan image, so replacing/clearing it wipes them) ----
  const handleSetPlan = useCallback(async (file: File) => {
    await deleteAllVendorBanners();
    await setPlan(file);
    setImageReplaced(true);
  }, [setPlan]);

  const handleClearPlan = useCallback(async () => {
    await deleteAllVendorBanners();
    await clearPlan();
  }, [clearPlan]);

  // ---- submit ----
  const handleSubmit = useCallback(async () => {
    if (!userId || busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the show a name.');
      return;
    }
    setBusy(true);
    setError(null);
    setSavedNote(false);
    try {
      // Flush the pending debounced rect save so the snapshot is current
      const meta = (await workbenchRef.current?.flushPendingMeta()) ?? vendorPlan.planMeta;
      const blob = await vendorPlan.getPlanBlob();
      if (!meta || !blob) {
        throw new Error('Add a floor plan (and let table detection run) before saving the show.');
      }
      const location = {
        country: country || undefined,
        state: stateCode || undefined,
        city: city.trim() || undefined,
      };
      if (isEdit && showId) {
        await updateShow({
          showId,
          organizerId: userId,
          name: trimmed,
          showDate: showDate || undefined,
          ...location,
          meta,
          planBlob: imageReplaced ? blob : undefined,
        });
        setSavedNote(true);
      } else {
        const id = await publishShow({
          organizerId: userId,
          name: trimmed,
          showDate: showDate || undefined,
          ...location,
          planBlob: blob,
          meta,
        });
        setCreatedId(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [userId, busy, name, showDate, country, stateCode, city, isEdit, showId, imageReplaced, vendorPlan.planMeta, vendorPlan.getPlanBlob]);

  const title = isEdit ? 'Edit Show' : 'Create a Show';
  const regions = regionOptions(country);

  // ---- gates ----
  if (!configured) {
    return (
      <PageShell title={title} eyebrow="ORGANIZER TOOLS">
        <p style={noteStyle}>
          Organizer accounts need a configured backend — this deployment runs in guest-only
          mode. You can still build and walk floor plans from the home screen.
        </p>
      </PageShell>
    );
  }
  if (authLoading || (session && profile === undefined)) {
    return (
      <PageShell title={title} eyebrow="ORGANIZER TOOLS">
        <p style={noteStyle}>Checking your session…</p>
      </PageShell>
    );
  }
  if (!session) {
    return (
      <PageShell title={title} eyebrow="ORGANIZER TOOLS">
        <p style={noteStyle}>Sign in to create and manage card shows.</p>
        <p style={{ marginTop: 18 }}>
          <Link href="/login" style={{ color: GOLD, fontSize: 15, fontFamily: SERIF, letterSpacing: '0.08em' }}>Sign in →</Link>
        </p>
      </PageShell>
    );
  }
  if (!isOrganizer) {
    return (
      <PageShell title={title} eyebrow="ORGANIZER TOOLS">
        <p style={noteStyle}>
          Only organizers can create shows — enable the organizer designation on your{' '}
          <Link href="/account" style={{ color: GOLD }}>Account page</Link> and come back.
        </p>
        <p style={{ marginTop: 18 }}>
          <Link href="/account" style={{ color: GOLD, fontSize: 15, fontFamily: SERIF, letterSpacing: '0.08em' }}>Go to my account →</Link>
        </p>
      </PageShell>
    );
  }

  // ---- edit mode load states ----
  if (isEdit && show === undefined) {
    return (
      <PageShell title={title} eyebrow="ORGANIZER TOOLS">
        <p style={noteStyle}>Loading the show…</p>
      </PageShell>
    );
  }
  if (isEdit && show === null) {
    return (
      <PageShell title={title} eyebrow="ORGANIZER TOOLS">
        <p style={noteStyle}>That show doesn't exist (or isn't yours).</p>
        {error && <p style={{ ...errorTextStyle, marginTop: 12 }}>{error}</p>}
        <p style={{ marginTop: 18 }}>
          <Link href="/organizer" style={{ color: GOLD, fontSize: 15, fontFamily: SERIF, letterSpacing: '0.08em' }}>← Back to my shows</Link>
        </p>
      </PageShell>
    );
  }

  // ---- create success ----
  if (createdId) {
    return (
      <PageShell title={title} eyebrow="ORGANIZER TOOLS">
        <p style={{ ...noteStyle, fontStyle: 'normal', color: TEXT, fontFamily: SERIF }}>
          Your show is live in the public directory.
        </p>
        <p style={{ marginTop: 22, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Link href={`/show/${createdId}`} style={{ color: GOLD, fontSize: 15, fontFamily: SERIF, letterSpacing: '0.08em' }}>
            View the show page →
          </Link>
          <Link href="/organizer" style={{ color: GOLD, fontSize: 15, fontFamily: SERIF, letterSpacing: '0.08em' }}>
            My shows →
          </Link>
        </p>
      </PageShell>
    );
  }

  // ---- confirm working-draft clobber ----
  if (!confirmed) {
    return (
      <PageShell title={title} eyebrow="ORGANIZER TOOLS">
        <p style={noteStyle}>
          {isEdit
            ? 'Editing this show loads its floor plan into the editor, replacing the draft in your local sandbox (Convention View).'
            : 'Start a new show? Your local sandbox draft will be replaced.'}
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 24, alignItems: 'center' }}>
          {isEdit ? (
            <button
              onClick={() => setConfirmed(true)}
              style={primaryButtonStyle}
            >
              CONTINUE →
            </button>
          ) : (
            <>
              <button
                onClick={async () => {
                  await handleClearPlan();
                  setConfirmed(true);
                }}
                style={primaryButtonStyle}
              >
                START FRESH →
              </button>
              <button
                onClick={() => setConfirmed(true)}
                style={ghostButtonStyle}
              >
                Keep the sandbox draft as this show's plan
              </button>
            </>
          )}
          <Link href="/organizer" style={{ ...subtleButtonStyle, textDecoration: 'none', display: 'inline-block' }}>
            Cancel
          </Link>
        </div>
      </PageShell>
    );
  }

  if (!seeded) {
    return (
      <PageShell title={title} eyebrow="ORGANIZER TOOLS">
        <p style={noteStyle}>Preparing the floor plan editor…</p>
        {error && <p style={{ ...errorTextStyle, marginTop: 12 }}>{error}</p>}
      </PageShell>
    );
  }

  // ---- the editor ----
  return (
    <PageShell title={title} eyebrow="ORGANIZER TOOLS" wide>
      {isEdit && show && !show.published && (
        <p style={{ ...kitNoteStyle, fontSize: 14, marginBottom: 18 }}>
          This show is currently hidden — publish it from{' '}
          <Link href="/organizer" style={{ color: GOLD }}>My Shows</Link> when it's ready.
        </p>
      )}

      {/* Show details */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <label htmlFor="show-editor-name" style={labelStyle}>SHOW NAME</label>
          <input
            id="show-editor-name"
            type="text"
            placeholder="Show name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ ...inputStyle, width: 280 }}
          />
        </div>
        <div>
          <label htmlFor="show-editor-date" style={labelStyle}>DATE</label>
          <input
            id="show-editor-date"
            type="date"
            title="Show date (optional) — shown in the public directory"
            value={showDate}
            onChange={(e) => setShowDate(e.target.value)}
            style={{ ...inputStyle, width: 180, color: showDate ? TEXT : '#777' }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 30 }}>
        <div>
          <label htmlFor="show-editor-country" style={labelStyle}>COUNTRY</label>
          <select
            id="show-editor-country"
            value={country}
            onChange={(e) => { setCountry(e.target.value); setStateCode(''); }}
            style={{ ...inputStyle, width: 200 }}
          >
            <option value="">— country —</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        {regions.length > 0 && (
          <div>
            <label htmlFor="show-editor-state" style={labelStyle}>STATE / PROVINCE</label>
            <select
              id="show-editor-state"
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
              style={{ ...inputStyle, width: 200 }}
            >
              <option value="">— state / province —</option>
              {regions.map((r) => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="show-editor-city" style={labelStyle}>CITY / VENUE</label>
          <input
            id="show-editor-city"
            type="text"
            placeholder="City / venue"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            style={{ ...inputStyle, width: 220 }}
          />
        </div>
      </div>

      {/* Floor plan workbench — detect, fix up, assign vendors */}
      <Suspense fallback={<p style={noteStyle}>Loading the floor plan editor…</p>}>
        <PlanWorkbench
          ref={workbenchRef}
          planUrl={vendorPlan.planUrl}
          planMeta={vendorPlan.planMeta}
          getPlanBlob={vendorPlan.getPlanBlob}
          onSetPlan={handleSetPlan}
          onSaveMeta={vendorPlan.saveMeta}
          onClearPlan={handleClearPlan}
          vendors={vendors}
          onAddVendor={localVendors.addVendor}
          onStateChange={setWb}
        />
      </Suspense>

      {error && (
        <p style={{ ...errorTextStyle, margin: '18px 0 0' }}>{error}</p>
      )}
      {savedNote && !error && (
        <p style={{ color: GOLD, fontSize: 14, fontFamily: SERIF, margin: '18px 0 0' }}>
          Changes saved.{' '}
          {show?.published && (
            <Link href={`/show/${showId}`} style={{ color: GOLD }}>View the show page →</Link>
          )}
        </p>
      )}

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 22 }}>
        <button
          onClick={handleSubmit}
          disabled={busy || !name.trim() || !wb.hasMeta || wb.detecting}
          style={
            !busy && name.trim() && wb.hasMeta && !wb.detecting
              ? primaryButtonStyle
              : primaryButtonDisabledStyle
          }
        >
          {busy
            ? (isEdit ? 'Saving…' : 'Creating…')
            : (isEdit ? 'SAVE CHANGES' : 'CREATE SHOW →')}
        </button>
        <Link href="/organizer" style={{ color: MUTED, fontSize: 14, fontFamily: SERIF, fontStyle: 'italic' }}>
          ← Back to my shows
        </Link>
      </div>
    </PageShell>
  );
}
