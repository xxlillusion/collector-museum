import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getPublicCollectorProfile } from '../../lib/publicCollectors';
import { cardDetailsLine, hasCardMeta } from '../../lib/cardMeta';
import { orderForWalls } from '../../lib/wallOrder';
import { wallEligible, binderEligible } from '../../lib/displayPref';
import { recordWalk } from '../../lib/visitService';
import { useTheme } from '../../components/themeKit';
import { LCD, PIXEL_FONT, LcdDialog, LcdCss } from '../../components/lcdKit';
import type { CardWithUrl } from '../../lib/useCards';

// Walk a collector's public collection in the 3D museum
// (/museum/collector/:id) — owned by the public browsing workstream (Stream C).
//
// Scene stays lazy on purpose: this chunk must remain a few kB — the ~1 MB
// three.js bundle loads only when the museum actually mounts.
const Scene = lazy(() => import('../../components/Scene'));

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable'; note: string }
  | {
      status: 'ready';
      cards: CardWithUrl[];
      /** Curated wall order (featured / hangOrder / display / onWalls from
       *  the owner's metadata). */
      wallCards: CardWithUrl[];
      /** Binder membership (display ≠ 'walls') — F2. */
      binderCards: CardWithUrl[];
      captions: Map<string, string>;
      details: Map<string, string>;
    };

/** Fullscreen interstitial shown while blobs download / Scene code loads.
 *  'refined' keeps the legacy literals pixel-identical; other themes branch;
 *  'handheld' renders an LCD boot dialog on the shell-green desk. */
function MuseumLoading({ text }: { text: string }) {
  const t = useTheme();
  const themed = t.id !== 'refined';
  const lcd = t.id === 'handheld';
  if (lcd) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: LCD.shell,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LcdCss />
        <LcdDialog cursor style={{ minWidth: 260, maxWidth: '86vw', textAlign: 'center' }}>
          {text}
        </LcdDialog>
      </div>
    );
  }
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: themed ? t.bg : '#0b0a08',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: themed ? t.muted : '#b7ad98',
        fontFamily: t.fontMono,
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
  const t = useTheme();
  const themed = t.id !== 'refined';
  const lcd = t.id === 'handheld';

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
              display: item.display,
              wallSlot: item.wallSlot,
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
        // Caption only once the owner set placard metadata (same gate as
        // App.tsx's own-museum captions) — unedited uploads keep their raw
        // filenames off the public placard.
        if (item.name && hasCardMeta(item.meta)) captions.set(item.imageUrl, item.name);
        const line = cardDetailsLine(item.meta);
        if (line) details.set(item.imageUrl, line);
      }
      // Anonymous walk counter — the public collector museum actually opens
      // (never the sandbox/own museum). Fire-and-forget, day-deduped.
      recordWalk('collector', profileId);
      setState({
        status: 'ready',
        cards,
        wallCards: orderForWalls(wallEligible(cards)),
        binderCards: binderEligible(cards),
        captions,
        details,
      });
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
        {lcd ? (
          <LcdDialog style={{ maxWidth: 480 }}>{state.note}</LcdDialog>
        ) : (
          <p style={{ fontSize: 17, lineHeight: 1.7, color: themed ? t.muted : '#b7ad98', fontStyle: 'italic' }}>
            {state.note}
          </p>
        )}
        <p style={{ marginTop: 24 }}>
          <Link
            href={`/collector/${profileId}`}
            style={lcd
              ? { color: t.accent, textDecoration: 'none', fontSize: 10.5, fontWeight: 700, fontFamily: PIXEL_FONT, letterSpacing: '0.06em', textTransform: 'uppercase' }
              : { color: t.accent, textDecoration: 'none', fontSize: 14, letterSpacing: 1 }}
          >
            {lcd ? '▶ BACK TO THE COLLECTOR PROFILE' : '← Back to the collector profile'}
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
          binderCards={state.binderCards}
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
