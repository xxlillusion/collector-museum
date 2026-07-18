import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import { getMyProfile } from '../../lib/profileService';
import { listMyShows, setShowPublished, deleteShow } from '../../lib/showService';
import type { MyShow } from '../../lib/showService';
import { formatShowDate } from '../shows/ShowDirectory';
import { Section, useTheme } from '../../components/themeKit';
import { LCD, LcdDialog, lcdMenuBox, lcdMenuRow } from '../../components/lcdKit';

export default function OrganizerHome() {
  const t = useTheme();
  const lcd = t.id === 'handheld';
  /** Big note commentary for the gate / empty states. */
  const bigNoteStyle: CSSProperties = { ...t.note, fontSize: lcd ? 11 : 17, lineHeight: lcd ? 1.9 : 1.7 };
  /** Accent text affordance for the show rows (Edit / Publish / Delete). */
  const rowActionStyle: CSSProperties = {
    background: 'transparent',
    border: 'none',
    padding: '4px 2px',
    color: t.accent,
    fontFamily: t.fontMono,
    fontSize: 12.5,
    letterSpacing: '0.12em',
    cursor: 'pointer',
  };
  /** Handheld twin of rowActionStyle: chip-shaped row actions. */
  const rowChipStyle: CSSProperties = { ...t.chip, fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap' };
  const gateLinkStyle: CSSProperties = { color: t.accent, fontSize: lcd ? 11 : 15, fontFamily: t.fontMono, letterSpacing: '0.08em' };
  const { configured, session, loading } = useAuth();
  const [shows, setShows] = useState<MyShow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // null = still checking the profile
  const [isOrganizer, setIsOrganizer] = useState<boolean | null>(null);
  // Handheld theme only: delete confirmation runs as an in-page LCD dialog
  // instead of window.confirm. Inert for the other themes.
  const [pendingDelete, setPendingDelete] = useState<MyShow | null>(null);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!configured || !userId) return;
    let cancelled = false;
    getMyProfile(userId)
      .then((p) => { if (!cancelled) setIsOrganizer(Boolean(p?.isOrganizer)); })
      .catch(() => { if (!cancelled) setIsOrganizer(false); });
    return () => { cancelled = true; };
  }, [configured, userId]);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      setShows(await listMyShows(userId));
      setError(null);
    } catch (e) {
      setShows([]);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [userId]);

  useEffect(() => {
    if (isOrganizer) reload();
  }, [isOrganizer, reload]);

  const handleTogglePublished = useCallback(
    async (show: MyShow) => {
      setBusyId(show.id);
      try {
        await setShowPublished(show.id, !show.published);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyId(null);
      }
    },
    [reload],
  );

  /** The confirmed delete — shared by the window.confirm path and the
   *  handheld dialog's YES choice. */
  const doDelete = useCallback(
    async (show: MyShow) => {
      setBusyId(show.id);
      try {
        await deleteShow(show.id);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyId(null);
      }
    },
    [reload],
  );

  const handleDelete = useCallback(
    async (show: MyShow) => {
      if (!window.confirm(`Delete “${show.name}”? Its booths and floor plan go with it.`)) return;
      await doDelete(show);
    },
    [doDelete],
  );

  return (
    <PageShell title="Organizer" eyebrow="ORGANIZER TOOLS">
      {!configured && (
        <p style={bigNoteStyle}>
          Organizer accounts need a configured backend — this deployment runs in guest-only
          mode. You can still build and walk floor plans from the home screen.
        </p>
      )}

      {configured && loading && <p style={bigNoteStyle}>Checking your session…</p>}

      {configured && !loading && !session && (
        <>
          <p style={bigNoteStyle}>Sign in to publish and manage your card shows.</p>
          <p style={{ marginTop: 18 }}>
            <Link href="/login" style={gateLinkStyle}>
              Sign in →
            </Link>
          </p>
        </>
      )}

      {configured && session && isOrganizer === null && (
        <p style={bigNoteStyle}>Checking your organizer status…</p>
      )}

      {configured && session && isOrganizer === false && (
        <>
          <p style={bigNoteStyle}>
            Only organizers can create shows — enable the organizer designation on your{' '}
            <Link href="/account" style={{ color: t.accent }}>Account page</Link> and come back to
            publish floor plans anyone can walk in 3D.
          </p>
          <p style={{ marginTop: 18 }}>
            <Link href="/account" style={gateLinkStyle}>
              Go to my account →
            </Link>
          </p>
        </>
      )}

      {configured && session && isOrganizer && (
        <>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <Link
              href="/organizer/show/new"
              style={{
                ...t.primaryButton,
                display: 'inline-block',
                textDecoration: 'none',
              }}
            >
              {lcd ? '▶ CREATE A SHOW' : 'CREATE A SHOW →'}
            </Link>
          </div>

          <Section numeral="I." title="MY SHOWS">
            {error && (
              <p style={{ ...t.errorText, marginBottom: 14 }}>{lcd ? '! ' : ''}{error}</p>
            )}

            {shows === null && !error && <p style={t.note}>Loading your shows…</p>}

            {shows !== null && shows.length === 0 && !error && (
              lcd ? (
                <LcdDialog cursor style={{ maxWidth: 480 }}>
                  NO SHOWS YET! BUILD YOUR FIRST ONE?
                </LcdDialog>
              ) : (
                <p style={t.note}>Nothing published yet.</p>
              )
            )}

            {shows !== null && (() => {
              const rows = shows.map((s, i) => {
                const busy = busyId === s.id;
                return (
                  <div
                    key={s.id}
                    className="museum-row"
                    style={lcd ? {
                      ...lcdMenuRow(false),
                      gap: 10,
                      flexWrap: 'wrap',
                      opacity: busy ? 0.6 : 1,
                      ...(i === shows.length - 1 ? { borderBottom: 'none' } : {}),
                    } : {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      flexWrap: 'wrap',
                      padding: '14px 12px',
                      borderBottom: `1px solid ${t.border}`,
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 140,
                        color: t.text,
                        fontFamily: t.fontDisplay,
                        fontSize: lcd ? 11 : 16.5,
                        fontWeight: lcd ? 700 : undefined,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {s.published ? (
                        <Link
                          href={`/show/${s.id}`}
                          style={{ color: t.text, textDecoration: 'none' }}
                        >
                          {s.name}
                        </Link>
                      ) : (
                        s.name
                      )}
                    </span>
                    <span
                      style={lcd ? {
                        ...t.chip,
                        ...(s.published
                          ? { background: LCD.ink, color: LCD.screen }
                          : { color: t.muted }),
                      } : {
                        fontSize: 10.5,
                        letterSpacing: '0.18em',
                        fontFamily: t.fontMono,
                        color: s.published ? t.accent : t.muted,
                        border: `${t.borderWidth}px solid ${s.published ? t.accent : t.border}`,
                        borderRadius: 2,
                        padding: '3px 9px',
                      }}
                    >
                      {s.published ? 'PUBLISHED' : 'HIDDEN'}
                    </span>
                    <span
                      style={{
                        ...t.note,
                        fontSize: lcd ? 9.5 : 13,
                        whiteSpace: 'nowrap',
                        lineHeight: 'normal',
                      }}
                    >
                      {formatShowDate(s.showDate) ?? 'no date'} · {s.boothCount} booth
                      {s.boothCount === 1 ? '' : 's'}
                      {s.hasPlanImage ? '' : ' · no plan image'}
                    </span>
                    <Link
                      href={`/organizer/show/${s.id}/edit`}
                      style={lcd
                        ? { ...rowChipStyle, textDecoration: 'none', display: 'inline-block' }
                        : { ...rowActionStyle, textDecoration: 'none', display: 'inline-block' }}
                    >
                      EDIT
                    </Link>
                    <button
                      onClick={() => handleTogglePublished(s)}
                      disabled={busy}
                      style={lcd ? rowChipStyle : rowActionStyle}
                    >
                      {s.published ? 'UNPUBLISH' : 'PUBLISH'}
                    </button>
                    <button
                      onClick={() => (lcd ? setPendingDelete(s) : handleDelete(s))}
                      disabled={busy}
                      style={lcd ? rowChipStyle : { ...rowActionStyle, color: t.error }}
                    >
                      DELETE
                    </button>
                  </div>
                );
              });
              return lcd && shows.length > 0 ? <div style={lcdMenuBox}>{rows}</div> : rows;
            })()}

            {lcd && pendingDelete && (
              <LcdDialog
                style={{ marginTop: 14 }}
                choices={[
                  { label: 'NO', primary: true, onClick: () => setPendingDelete(null) },
                  { label: 'YES', onClick: () => { const s = pendingDelete; setPendingDelete(null); doDelete(s); } },
                ]}
              >
                ! REALLY DELETE {pendingDelete.name}? ITS BOOTHS AND FLOOR PLAN GO WITH IT!
              </LcdDialog>
            )}
          </Section>
        </>
      )}
    </PageShell>
  );
}
