import { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import { getMyProfile } from '../../lib/profileService';
import { listMyShows, setShowPublished, deleteShow } from '../../lib/showService';
import type { MyShow } from '../../lib/showService';
import { formatShowDate } from '../shows/ShowDirectory';

const GOLD = '#d4af37';

export default function OrganizerHome() {
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
    <PageShell title="Organizer">
      {!configured && (
        <p style={noteStyle}>
          Organizer accounts need a configured backend — this deployment runs in guest-only
          mode. You can still build and walk floor plans from the home screen.
        </p>
      )}

      {configured && loading && <p style={noteStyle}>Checking your session…</p>}

      {configured && !loading && !session && (
        <>
          <p style={noteStyle}>Sign in to publish and manage your card shows.</p>
          <p style={{ marginTop: 18 }}>
            <Link href="/login" style={{ color: GOLD, fontSize: 15 }}>
              Sign in →
            </Link>
          </p>
        </>
      )}

      {configured && session && isOrganizer === null && (
        <p style={noteStyle}>Checking your organizer status…</p>
      )}

      {configured && session && isOrganizer === false && (
        <>
          <p style={noteStyle}>
            Only organizers can create shows — enable the organizer designation on your{' '}
            <Link href="/account" style={{ color: GOLD }}>Account page</Link> and come back to
            publish floor plans anyone can walk in 3D.
          </p>
          <p style={{ marginTop: 18 }}>
            <Link href="/account" style={{ color: GOLD, fontSize: 15 }}>Go to my account →</Link>
          </p>
        </>
      )}

      {configured && session && isOrganizer && (
        <>
          <Link
            href="/organizer/show/new"
            style={{
              display: 'inline-block',
              background: GOLD,
              color: '#1a1614',
              textDecoration: 'none',
              padding: '14px 34px',
              fontSize: 15,
              letterSpacing: '0.1em',
              borderRadius: 8,
              marginBottom: 30,
              fontFamily: 'Georgia, serif',
            }}
          >
            ＋ CREATE A SHOW →
          </Link>

          <h2
            style={{
              fontWeight: 400,
              fontSize: 20,
              letterSpacing: 2,
              color: '#f0e6ce',
              margin: '0 0 14px',
            }}
          >
            MY SHOWS
          </h2>

          {error && (
            <p style={{ color: '#c66', fontSize: 14, marginBottom: 14 }}>{error}</p>
          )}

          {shows === null && !error && <p style={noteStyle}>Loading your shows…</p>}

          {shows !== null && shows.length === 0 && !error && (
            <p style={noteStyle}>Nothing published yet.</p>
          )}

          {shows !== null &&
            shows.map((s) => {
              const busy = busyId === s.id;
              return (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    padding: '12px 16px',
                    border: '1px solid #3a352c',
                    borderRadius: 8,
                    marginBottom: 10,
                    fontSize: 15,
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 140, color: '#f0e6ce' }}>
                    {s.published ? (
                      <Link
                        href={`/show/${s.id}`}
                        style={{ color: '#f0e6ce', textDecoration: 'none' }}
                      >
                        {s.name}
                      </Link>
                    ) : (
                      s.name
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      letterSpacing: 1.5,
                      color: s.published ? GOLD : '#8a816d',
                      border: `1px solid ${s.published ? GOLD : '#4a4436'}`,
                      borderRadius: 4,
                      padding: '2px 8px',
                    }}
                  >
                    {s.published ? 'PUBLISHED' : 'HIDDEN'}
                  </span>
                  <span style={{ color: '#8a816d', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {formatShowDate(s.showDate) ?? 'no date'} · {s.boothCount} booth
                    {s.boothCount === 1 ? '' : 's'}
                    {s.hasPlanImage ? '' : ' · no plan image'}
                  </span>
                  <Link
                    href={`/organizer/show/${s.id}/edit`}
                    style={{ ...smallButton, textDecoration: 'none', display: 'inline-block' }}
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleTogglePublished(s)}
                    disabled={busy}
                    style={smallButton}
                  >
                    {s.published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    disabled={busy}
                    style={{ ...smallButton, color: '#c66' }}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
        </>
      )}
    </PageShell>
  );
}

const noteStyle: React.CSSProperties = {
  fontSize: 17,
  lineHeight: 1.7,
  color: '#b7ad98',
  fontStyle: 'italic',
};

const smallButton: React.CSSProperties = {
  background: 'transparent',
  color: '#e8e0d0',
  border: '1px solid #4a4436',
  borderRadius: 6,
  padding: '6px 14px',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'Georgia, serif',
};
