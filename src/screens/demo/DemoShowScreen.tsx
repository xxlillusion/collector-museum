import { lazy, Suspense, useMemo } from 'react';
import { useLocation } from 'wouter';
import { demoManifest, demoVendorSummaries, fetchDemoInventory } from '../../lib/demoShow';
import { resolveSignage } from '../../lib/hallSignage';
import { useTheme } from '../../components/themeKit';
import { LCD, PIXEL_FONT } from '../../components/lcdKit';

// Lazy exactly like ShowDetail's walk — /demo stays a light DOM chunk and the
// three.js hall loads only when the route mounts the scene.
const VendorScene = lazy(() => import('../../components/VendorScene'));

// The demo carries no legacy per-box banners and no global tablecloth banner —
// vendor names letter onto the front drapes instead.
const EMPTY_BANNERS = new Map<string, string>();

/**
 * The bundled demo show (UX Wave A): a walkable convention hall built from
 * `lib/demoShow.ts` — no account, no backend, survives DB resets. Mounted the
 * same way ShowDetail mounts a published show's walk.
 */
export default function DemoShowScreen() {
  const t = useTheme();
  // 'handheld': the placard becomes an inverted ink chip — same position
  // (bottom right was chosen deliberately to clear every HUD surface).
  const lcd = t.id === 'handheld';
  const [, navigate] = useLocation();
  const vendors = useMemo(demoVendorSummaries, []);
  // Bundled signage (F3) — the manifest's config through the same resolver
  // every real show uses; absent manifest signage = classic defaults.
  const signage = useMemo(() => resolveSignage(demoManifest.signage), []);

  return (
    <>
      <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#000' }} />}>
        <VendorScene
          planMeta={demoManifest.planMeta}
          planUrl={demoManifest.planImage}
          bannerUrl={null}
          vendorBannerUrls={EMPTY_BANNERS}
          vendors={vendors}
          signage={signage}
          fetchInventory={fetchDemoInventory}
          onBack={() => navigate('/')}
          exitLabel="← Leave"
        />
      </Suspense>
      {/* Fixed placard so visitors always know this is staged data. Bottom
          RIGHT clears every HUD surface: hint pills bottom-center (56), the
          floating theme bar bottom-center (10), joystick bottom-left,
          minimap top-right, directory top-left. */}
      <div
        style={lcd ? {
          position: 'fixed',
          bottom: 10,
          right: 14,
          zIndex: 9,
          pointerEvents: 'none',
          background: LCD.ink,
          color: LCD.screen,
          border: 'none',
          borderRadius: 0,
          padding: '5px 12px',
          fontFamily: PIXEL_FONT,
          fontWeight: 700,
          fontSize: 9,
          letterSpacing: '0.1em',
          whiteSpace: 'nowrap',
        } : {
          position: 'fixed',
          bottom: 10,
          right: 14,
          zIndex: 9,
          pointerEvents: 'none',
          background: 'rgba(20,16,12,0.72)',
          border: `${t.borderWidth}px solid ${t.border}`,
          borderRadius: 2,
          padding: '5px 14px',
          fontFamily: t.fontMono,
          fontSize: 10.5,
          letterSpacing: '0.24em',
          color: t.accent,
          whiteSpace: 'nowrap',
        }}
      >
        SAMPLE EXHIBITION · FICTIONAL VENDORS
      </div>
    </>
  );
}
