import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import PageShell from '../PageShell';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getPublicVendorProfile } from '../../lib/publicVendors';
import { useAuth } from '../../lib/auth';
import { useProvider } from '../../lib/provider/context';
import { wallEligible, binderEligible } from '../../lib/displayPref';
import { isWanted, toggleWant } from '../../lib/interestService';
import { recordWalk } from '../../lib/visitService';
import { useTheme } from '../../components/themeKit';
import { LCD, PIXEL_FONT, LcdDialog, LcdCss } from '../../components/lcdKit';
import type { CardWithUrl } from '../../lib/useCards';
import type { InspectSale } from '../../components/InspectOverlay';

// Walk a vendor's public inventory in the 3D museum (/museum/vendor/:id) —
// owned by the public browsing workstream (Stream C).
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
      /** Wall/binder membership (F2 display flag; untouched items = both). */
      wallCards: CardWithUrl[];
      binderCards: CardWithUrl[];
      captions: Map<string, string>;
      sales: Map<string, InspectSale>;
      idByUrl: Map<string, string>;
      /** The owning account's profile id (null = unclaimed vendor page) —
       *  the arrangement stream gates owner-arrange on it (F1). */
      profileId: string | null;
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

export default function VendorMuseum({ vendorId }: { vendorId: string }) {
  const [, navigate] = useLocation();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const t = useTheme();
  const themed = t.id !== 'refined';
  const lcd = t.id === 'handheld';
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  // Owner arrange (F1): the signed-in account behind this vendor page may
  // re-hang the walls in 3D. Persists through the provider seam (the route
  // sits inside the provider boundary; vendor-owner RLS authorizes the
  // write) and patches the one-shot fetch optimistically — without the local
  // patch the move would never render.
  const provider = useProvider();
  const profileId = state.status === 'ready' ? state.profileId : null;
  const isOwner = Boolean(userId && profileId && userId === profileId);
  const arrange = useMemo(
    () =>
      isOwner
        ? {
            onSetSlot: async (id: string, slot: string | null) => {
              // Pure updater — the provider write stays outside it
              // (StrictMode double-invokes updaters).
              setState((prev) => {
                if (prev.status !== 'ready') return prev;
                const cards = prev.cards.map((c) =>
                  c.id === id ? { ...c, wallSlot: slot ?? undefined } : c,
                );
                return {
                  ...prev,
                  cards,
                  wallCards: wallEligible(cards),
                  binderCards: binderEligible(cards),
                };
              });
              await provider.updateInventoryItem(id, { wallSlot: slot ?? undefined });
            },
          }
        : undefined,
    [isOwner, provider],
  );

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
      setState({
        status: 'ready',
        cards,
        wallCards: wallEligible(cards),
        binderCards: binderEligible(cards),
        captions,
        sales,
        idByUrl,
        profileId: profile.profileId,
      });
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
        {lcd ? (
          <LcdDialog style={{ maxWidth: 480 }}>{state.note}</LcdDialog>
        ) : (
          <p style={{ fontSize: 17, lineHeight: 1.7, color: themed ? t.muted : '#b7ad98', fontStyle: 'italic' }}>
            {state.note}
          </p>
        )}
        <p style={{ marginTop: 24 }}>
          <Link
            href={`/vendor/${vendorId}`}
            style={lcd
              ? { color: t.accent, textDecoration: 'none', fontSize: 10.5, fontWeight: 700, fontFamily: PIXEL_FONT, letterSpacing: '0.06em', textTransform: 'uppercase' }
              : { color: t.accent, textDecoration: 'none', fontSize: 14, letterSpacing: 1 }}
          >
            {lcd ? '▶ BACK TO THE VENDOR PROFILE' : '← Back to the vendor profile'}
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
          sales={state.sales}
          want={want}
          bannerUrl={null}
          onManage={() => navigate(`/vendor/${vendorId}`)}
          exitLabel="← Back to Vendor"
          arrange={arrange}
        />
      </Suspense>
    </div>
  );
}
