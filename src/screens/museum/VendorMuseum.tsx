import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getPublicVendorProfile } from '../../lib/publicVendors';
import { useAuth } from '../../lib/auth';
import { isWanted, toggleWant } from '../../lib/interestService';
import { recordWalk } from '../../lib/visitService';
import type { CardWithUrl } from '../../lib/useCards';
import type { InspectSale } from '../../components/InspectOverlay';

// Walk a vendor's public inventory in the 3D museum (/museum/vendor/:id) —
// owned by the public browsing workstream (Stream C).
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
      captions: Map<string, string>;
      sales: Map<string, InspectSale>;
      idByUrl: Map<string, string>;
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

export default function VendorMuseum({ vendorId }: { vendorId: string }) {
  const [, navigate] = useLocation();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  // Scene's want prop is url-keyed; map back to item ids here.
  const idByUrl = state.status === 'ready' ? state.idByUrl : null;
  const want = useMemo(
    () =>
      idByUrl
        ? {
            isWanted: (url: string) => {
              const id = idByUrl.get(url);
              return id ? isWanted(id) : false;
            },
            toggle: (url: string) => {
              const id = idByUrl.get(url);
              return id ? toggleWant(userId, id) : false;
            },
          }
        : undefined,
    [idByUrl, userId],
  );

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
      const profile = await getPublicVendorProfile(vendorId);
      if (cancelled) return;
      if (!profile) {
        setState({
          status: 'unavailable',
          note: 'We couldn’t find that vendor — the profile may have been removed.',
        });
        return;
      }
      if (!profile.inventoryPublic) {
        setState({ status: 'unavailable', note: 'This vendor keeps their inventory private.' });
        return;
      }
      if (profile.items.length === 0) {
        setState({
          status: 'unavailable',
          note: 'Nothing to hang yet — this vendor has no public inventory.',
        });
        return;
      }
      // The museum binder decodes Blobs (sleeve textures), so every image is
      // downloaded rather than passed as a CDN URL. Buckets are public-read.
      const results = await Promise.all(
        profile.items.map(async (item, index): Promise<CardWithUrl | null> => {
          try {
            const res = await fetch(item.imageUrl);
            if (!res.ok) return null;
            const imageBlob = await res.blob();
            return {
              id: item.id,
              name: item.caption || profile.name,
              imageBlob,
              addedAt: index,
              imageUrl: item.imageUrl,
              aspect: item.aspect,
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
      const sales = new Map<string, InspectSale>();
      const idByUrl = new Map<string, string>();
      for (const item of profile.items) {
        if (item.caption) captions.set(item.imageUrl, item.caption);
        sales.set(item.imageUrl, {
          price: item.price,
          status: item.status,
          condition: item.condition || undefined,
        });
        idByUrl.set(item.imageUrl, item.id);
      }
      // Anonymous walk counter — the public vendor museum actually opens
      // (never the sandbox/own museum). Fire-and-forget, day-deduped.
      recordWalk('vendor', vendorId);
      setState({ status: 'ready', cards, captions, sales, idByUrl });
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (state.status === 'loading') {
    return <MuseumLoading text="Hanging the collection…" />;
  }

  if (state.status === 'unavailable') {
    return (
      <PageShell title="Vendor Museum">
        <p style={{ fontSize: 17, lineHeight: 1.7, color: '#b7ad98', fontStyle: 'italic' }}>
          {state.note}
        </p>
        <p style={{ marginTop: 24 }}>
          <Link
            href={`/vendor/${vendorId}`}
            style={{ color: GOLD, textDecoration: 'none', fontSize: 14, letterSpacing: 1 }}
          >
            ← Back to the vendor profile
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
          captions={state.captions}
          sales={state.sales}
          want={want}
          bannerUrl={null}
          onManage={() => navigate(`/vendor/${vendorId}`)}
          exitLabel="← Back to Vendor"
        />
      </Suspense>
    </div>
  );
}
