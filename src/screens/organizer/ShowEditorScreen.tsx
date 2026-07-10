import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import { getMyProfile } from '../../lib/profileService';
import type { ProfileRecord } from '../../lib/profileService';
import { publishShow, updateShow, getMyShowForEdit } from '../../lib/showService';
import type { MyShowForEdit } from '../../lib/showService';
import {
  listApplicationsForShow, setApplicationStatus,
} from '../../lib/applicationService';
import type { BoothApplication } from '../../lib/applicationService';
import { listRegisteredVendors } from '../../lib/publicVendors';
import type { RegisteredVendorSummary } from '../../lib/publicVendors';
import { COUNTRIES, regionOptions } from '../../lib/locations';
import { useVendorPlan } from '../../lib/useVendorPlan';
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
  const [venueName, setVenueName] = useState('');
  const [address, setAddress] = useState('');
  const [hours, setHours] = useState('');
  const [admission, setAdmission] = useState('');
  const [externalUrl, setExternalUrl] = useState('');

  const [wb, setWb] = useState<PlanWorkbenchState>({ hasMeta: false, detecting: false, totalTables: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Create mode: publish to the public directory right away, or create
  // hidden and publish later from My Shows (OrganizerHome's toggle).
  const [publishNow, setPublishNow] = useState(true);
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

  // ---- vendors for the assignment dropdown: registered accounts only — a
  // booth is assigned to a real store or left empty (no placeholder rows;
  // legacy placeholder assignments render as unassigned here but keep
  // rendering in old walks) ----
  useEffect(() => {
    let cancelled = false;
    listRegisteredVendors().then((list) => { if (!cancelled) setRegistered(list); });
    return () => { cancelled = true; };
  }, []);

  // Booth applications (edit mode) — approved applicants float to the top of
  // the assignment dropdown so placing them is one click away.
  const [apps, setApps] = useState<BoothApplication[]>([]);
  const [appBusyId, setAppBusyId] = useState<string | null>(null);
  const [appError, setAppError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit || !showId || !isOrganizer) return;
    let cancelled = false;
    listApplicationsForShow(showId).then((list) => {
      if (!cancelled) setApps(list);
    });
    return () => { cancelled = true; };
  }, [isEdit, showId, isOrganizer]);

  const handleApplication = useCallback(async (id: string, status: 'approved' | 'declined') => {
    if (!showId) return;
    setAppBusyId(id);
    setAppError(null);
    try {
      await setApplicationStatus(id, status);
      setApps(await listApplicationsForShow(showId));
    } catch (e) {
      setAppError(e instanceof Error ? e.message : String(e));
    } finally {
      setAppBusyId(null);
    }
  }, [showId]);

  const approvedApplicantIds = useMemo(
    () => new Set(apps.filter((a) => a.status === 'approved').map((a) => a.vendorId)),
    [apps],
  );

  const vendors = useMemo<VendorSummary[]>(() => {
    return [...registered].sort((a, b) => {
      // Approved applicants first, then everyone else alphabetically
      const pa = approvedApplicantIds.has(a.id) ? 0 : 1;
      const pb = approvedApplicantIds.has(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
  }, [registered, approvedApplicantIds]);

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
    setVenueName(show.venueName);
    setAddress(show.address);
    setHours(show.hours);
    setAdmission(show.admission);
    setExternalUrl(show.externalUrl);
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
        venueName: venueName.trim(),
        address: address.trim(),
        hours: hours.trim(),
        admission: admission.trim(),
        externalUrl: externalUrl.trim(),
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
          published: publishNow,
        });
        setCreatedId(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [userId, busy, name, showDate, country, stateCode, city, venueName, address, hours, admission, externalUrl, isEdit, showId, imageReplaced, publishNow, vendorPlan.planMeta, vendorPlan.getPlanBlob]);

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
          {publishNow
            ? 'Your show is live in the public directory.'
            : 'Your show was created hidden — publish it from My Shows whenever it’s ready.'}
        </p>
        <p style={{ marginTop: 22, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {publishNow && (
            <Link href={`/show/${createdId}`} style={{ color: GOLD, fontSize: 15, fontFamily: SERIF, letterSpacing: '0.08em' }}>
              View the show page →
            </Link>
          )}
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

      {/* Booth applications — approve/decline; approved stores jump to the
          top of the per-booth assignment dropdown below. */}
      {isEdit && apps.length > 0 && (
        <div
          style={{
            border: `1px solid rgba(212,175,55,0.3)`,
            borderRadius: 4,
            padding: '14px 18px',
            marginBottom: 26,
          }}
        >
          <div style={{ ...labelStyle, marginBottom: 6 }}>
            BOOTH APPLICATIONS ({apps.filter((a) => a.status === 'pending').length} pending)
          </div>
          {apps.map((a) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 14,
                flexWrap: 'wrap',
                padding: '9px 4px',
                borderBottom: '1px solid rgba(212,175,55,0.12)',
                opacity: appBusyId === a.id ? 0.6 : 1,
              }}
            >
              <span style={{ fontFamily: SERIF, fontSize: 15, color: TEXT, minWidth: 140 }}>
                {a.vendorName}
              </span>
              {a.message && (
                <span style={{ ...kitNoteStyle, fontSize: 12.5, flex: 1, minWidth: 160 }}>
                  “{a.message}”
                </span>
              )}
              {a.status === 'pending' ? (
                <span style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => handleApplication(a.id, 'approved')}
                    disabled={appBusyId === a.id}
                    style={{ ...ghostButtonStyle, padding: '5px 14px', fontSize: 11 }}
                  >
                    APPROVE
                  </button>
                  <button
                    onClick={() => handleApplication(a.id, 'declined')}
                    disabled={appBusyId === a.id}
                    style={{ ...ghostButtonStyle, padding: '5px 14px', fontSize: 11, color: '#b0685c', borderColor: 'rgba(176,104,92,0.5)' }}
                  >
                    DECLINE
                  </button>
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 10.5,
                    letterSpacing: '0.18em',
                    fontFamily: SERIF,
                    color: a.status === 'approved' ? GOLD : MUTED,
                    border: `1px solid ${a.status === 'approved' ? GOLD : 'rgba(255,255,255,0.15)'}`,
                    borderRadius: 2,
                    padding: '3px 9px',
                  }}
                >
                  {a.status.toUpperCase()}
                </span>
              )}
            </div>
          ))}
          {appError && <p style={{ ...errorTextStyle, marginTop: 10 }}>{appError}</p>}
          <p style={{ ...kitNoteStyle, fontSize: 12, marginTop: 10 }}>
            Approving moves the store to the top of each booth's vendor dropdown — assign
            them to a booth below to place them on the floor.
          </p>
        </div>
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
          <label htmlFor="show-editor-city" style={labelStyle}>CITY</label>
          <input
            id="show-editor-city"
            type="text"
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            style={{ ...inputStyle, width: 220 }}
          />
        </div>
      </div>

      {/* Attendance logistics — everything a visitor needs to actually go */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <label htmlFor="show-editor-venue" style={labelStyle}>VENUE</label>
          <input
            id="show-editor-venue"
            type="text"
            placeholder="Expo Center Hall B"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            style={{ ...inputStyle, width: 280 }}
          />
        </div>
        <div>
          <label htmlFor="show-editor-address" style={labelStyle}>ADDRESS</label>
          <input
            id="show-editor-address"
            type="text"
            placeholder="123 Main St, Springfield"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{ ...inputStyle, width: 340 }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 30 }}>
        <div>
          <label htmlFor="show-editor-hours" style={labelStyle}>HOURS</label>
          <input
            id="show-editor-hours"
            type="text"
            placeholder="Sat 9am – 4pm"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            style={{ ...inputStyle, width: 200 }}
          />
        </div>
        <div>
          <label htmlFor="show-editor-admission" style={labelStyle}>ADMISSION</label>
          <input
            id="show-editor-admission"
            type="text"
            placeholder="$5 — kids free"
            value={admission}
            onChange={(e) => setAdmission(e.target.value)}
            style={{ ...inputStyle, width: 200 }}
          />
        </div>
        <div>
          <label htmlFor="show-editor-url" style={labelStyle}>SHOW WEBSITE / TICKETS (URL)</label>
          <input
            id="show-editor-url"
            type="url"
            placeholder="https://…"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            style={{ ...inputStyle, width: 280 }}
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

      {!isEdit && (
        <div style={{ marginTop: 26 }}>
          <span style={labelStyle}>VISIBILITY</span>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {([
              [true, 'Publish immediately', 'appears in the public directory right away'],
              [false, 'Create hidden', 'publish it later from My Shows'],
            ] as const).map(([value, label, sub]) => (
              <label
                key={label}
                style={{ display: 'flex', alignItems: 'baseline', gap: 10, cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="show-editor-visibility"
                  checked={publishNow === value}
                  onChange={() => setPublishNow(value)}
                  style={{ accentColor: GOLD }}
                />
                <span style={{ fontFamily: SERIF, fontSize: 14.5, color: TEXT }}>
                  {label}
                  <span style={{ display: 'block', fontSize: 12, color: MUTED, fontStyle: 'italic', marginTop: 2 }}>
                    {sub}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
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
            : (isEdit ? 'SAVE CHANGES' : (publishNow ? 'CREATE & PUBLISH →' : 'CREATE HIDDEN →'))}
        </button>
        <Link href="/organizer" style={{ color: MUTED, fontSize: 14, fontFamily: SERIF, fontStyle: 'italic' }}>
          ← Back to my shows
        </Link>
      </div>
    </PageShell>
  );
}
