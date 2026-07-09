import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getPublicCollectorProfile } from '../../lib/publicCollectors';
import { cardDetailsLine } from '../../lib/cardMeta';
import { orderForWalls } from '../../lib/wallOrder';
import type { CardWithUrl } from '../../lib/useCards';

// Walk a collector's public collection in the 3D museum
// (/museum/collector/:id) — owned by the public browsing workstream (Stream C).
//
// Scene stays lazy on purpose: this chunk must remain a few kB — the ~1 MB
// three.js bundle loads only when the museum actually mounts.
const Scene = lazy(() => import('../../components/Scene'));

const GOLD = '#d4af37';

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable'; note: string }
  | {
      status: 'ready';
      cards: CardWithUrl[];
      /** Curated wall order (featured / hangOrder / onWalls from the owner's
       *  metadata) — the binder keeps the full `cards` list. */
      wallCards: CardWithUrl[];
      captions: Map<string, string>;
      details: Map<string, string>;
    };

/** Fullscreen interstitial shown while blobs download / Scene code loads. */
function MuseumLoading({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0b0a08',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#b7ad98',
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontStyle: 'italic',
        fontSize: 18,
        letterSpacing: 1,
      }}
    >
      {text}
    </div>
  );
}

export default function CollectorMuseum({ profileId }: { profileId: string }) {
  const [, navigate] = useLocation();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState({
        status: 'unavailable',
        note: 'The public museum needs the cloud connection, which isn’t configured here.',
      });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      const profile = await getPublicCollectorProfile(profileId);
      if (cancelled) return;
      if (!profile) {
        setState({
          status: 'unavailable',
          note: 'We couldn’t find that collector — the profile may have been removed.',
        });
        return;
      }
      if (!profile.collectionPublic) {
        setState({ status: 'unavailable', note: 'This collection is private.' });
        return;
      }
      if (profile.items.length === 0) {
        setState({
          status: 'unavailable',
          note: 'Nothing to hang yet — this collection is empty.',
        });
        return;
      }
      // The museum binder decodes Blobs (sleeve textures), so every image is
      // downloaded rather than passed as a CDN URL. The cards bucket is
      // public-read post-0003.
      const results = await Promise.all(
        profile.items.map(async (item, index): Promise<CardWithUrl | null> => {
          try {
            const res = await fetch(item.imageUrl);
            if (!res.ok) return null;
            const imageBlob = await res.blob();
            return {
              id: item.id,
              name: item.name || profile.displayName,
              imageBlob,
              addedAt: index, // index-based — feeds the wall sort's tiebreak
              imageUrl: item.imageUrl,
              aspect: item.aspect,
              // Curation fields ride along so orderForWalls can sort them
              featured: item.featured,
              hangOrder: item.hangOrder,
              onWalls: item.onWalls,
            };
          } catch {
            return null; // one missing image shouldn't sink the whole gallery
          }
        }),
      );
      if (cancelled) return;
      const cards = results.filter((c): c is CardWithUrl => c !== null);
      if (cards.length === 0) {
        setState({
          status: 'unavailable',
          note: 'The images couldn’t be loaded right now — please try again shortly.',
        });
        return;
      }
      const captions = new Map<string, string>();
      const details = new Map<string, string>();
      for (const item of profile.items) {
        if (item.name) captions.set(item.imageUrl, item.name);
        const line = cardDetailsLine(item.meta);
        if (line) details.set(item.imageUrl, line);
      }
      setState({ status: 'ready', cards, wallCards: orderForWalls(cards), captions, details });
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (state.status === 'loading') {
    return <MuseumLoading text="Hanging the collection…" />;
  }

  if (state.status === 'unavailable') {
    return (
      <PageShell title="Collector Museum">
        <p style={{ fontSize: 17, lineHeight: 1.7, color: '#b7ad98', fontStyle: 'italic' }}>
          {state.note}
        </p>
        <p style={{ marginTop: 24 }}>
          <Link
            href={`/collector/${profileId}`}
            style={{ color: GOLD, textDecoration: 'none', fontSize: 14, letterSpacing: 1 }}
          >
            ← Back to the collector profile
          </Link>
        </p>
      </PageShell>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, height: '100vh', background: '#000' }}>
      <Suspense fallback={<MuseumLoading text="Hanging the collection…" />}>
        <Scene
          cards={state.cards}
          wallCards={state.wallCards}
          captions={state.captions}
          details={state.details}
          bannerUrl={null}
          onManage={() => navigate(`/collector/${profileId}`)}
          exitLabel="← Back to Collector"
        />
      </Suspense>
    </div>
  );
}
