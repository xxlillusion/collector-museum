import { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { useAuth } from '../../lib/auth';
import { listMyShows, setShowPublished, deleteShow } from '../../lib/showService';
import type { MyShow } from '../../lib/showService';
import { formatShowDate } from '../shows/ShowDirectory';

const GOLD = '#d4af37';

// Owned by the shows workstream (Stream C).
export default function OrganizerHome() {
  const { configured, session, loading } = useAuth();
  const [shows, setShows] = useState<MyShow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const userId = session?.user.id ?? null;

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
    reload();
  }, [reload]);

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

      {configured && session && (
        <>
          <div
            style={{
              border: '1px solid #3a352c',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.025)',
              padding: '16px 20px',
              marginBottom: 28,
              fontSize: 15,
              lineHeight: 1.7,
              color: '#b7ad98',
            }}
          >
            <span style={{ color: '#f0e6ce' }}>How to publish a show:</span> from the{' '}
            <Link href="/" style={{ color: GOLD }}>
              home screen
            </Link>
            , open <span style={{ color: '#e8e0d0' }}>WALK A CARD SHOW</span>, upload the floor
            plan, fix up the detected booths and assign vendors, then press{' '}
            <span style={{ color: '#e8e0d0' }}>Publish to Card Shows…</span> in the Saved Plans
            section. Published shows appear in the{' '}
            <Link href="/shows" style={{ color: GOLD }}>
              public directory
            </Link>{' '}
            and can be walked in 3D by anyone.
          </div>

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
