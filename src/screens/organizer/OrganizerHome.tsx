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

export default function OrganizerHome() {
  const t = useTheme();
  /** Big note commentary for the gate / empty states. */
  const bigNoteStyle: CSSProperties = { ...t.note, fontSize: 17, lineHeight: 1.7 };
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
  const { configured, session, loading } = useAuth();
  const [shows, setShows] = useState<MyShow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // null = still checking the profile
  const [isOrganizer, setIsOrganizer] = useState<boolean | null>(null);

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

  const handleDelete = useCallback(
    async (show: MyShow) => {
      if (!window.confirm(`Delete “${show.name}”? Its booths and floor plan go with it.`)) return;
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
            <Link href="/login" style={{ color: t.accent, fontSize: 15, fontFamily: t.fontMono, letterSpacing: '0.08em' }}>
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
            <Link href="/account" style={{ color: t.accent, fontSize: 15, fontFamily: t.fontMono, letterSpacing: '0.08em' }}>
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
              CREATE A SHOW →
            </Link>
          </div>

          <Section numeral="I." title="MY SHOWS">
            {error && (
              <p style={{ ...t.errorText, marginBottom: 14 }}>{error}</p>
            )}

            {shows === null && !error && <p style={t.note}>Loading your shows…</p>}

            {shows !== null && shows.length === 0 && !error && (
              <p style={t.note}>Nothing published yet.</p>
            )}

            {shows !== null &&
              shows.map((s) => {
                const busy = busyId === s.id;
                return (
                  <div
                    key={s.id}
                    className="museum-row"
                    style={{
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
                        fontSize: 16.5,
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
                      style={{
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
                        fontSize: 13,
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
                      style={{ ...rowActionStyle, textDecoration: 'none', display: 'inline-block' }}
                    >
                      EDIT
                    </Link>
                    <button
                      onClick={() => handleTogglePublished(s)}
                      disabled={busy}
                      style={rowActionStyle}
                    >
                      {s.published ? 'UNPUBLISH' : 'PUBLISH'}
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      disabled={busy}
                      style={{ ...rowActionStyle, color: t.error }}
                    >
                      DELETE
                    </button>
                  </div>
                );
              })}
          </Section>
        </>
      )}
    </PageShell>
  );
}
