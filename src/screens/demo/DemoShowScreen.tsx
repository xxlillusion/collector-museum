import { lazy, Suspense, useMemo } from 'react';
import { useLocation } from 'wouter';
import { demoManifest, demoVendorSummaries, fetchDemoInventory } from '../../lib/demoShow';
import { GOLD, HAIRLINE, SERIF } from '../../components/museumKit';

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
  const [, navigate] = useLocation();
  const vendors = useMemo(demoVendorSummaries, []);

  return (
    <>
      <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#000' }} />}>
        <VendorScene
          planMeta={demoManifest.planMeta}
          planUrl={demoManifest.planImage}
          bannerUrl={null}
          vendorBannerUrls={EMPTY_BANNERS}
          vendors={vendors}
          fetchInventory={fetchDemoInventory}
          onBack={() => navigate('/')}
          exitLabel="← Leave"
        />
      </Suspense>
      {/* Fixed placard so visitors always know this is staged data. Bottom
          center clears every HUD surface: hint pills sit at bottom 40, the
          joystick bottom-left, minimap top-right, directory top-left. */}
      <div
        style={{
          position: 'fixed',
          bottom: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9,
          pointerEvents: 'none',
          background: 'rgba(20,16,12,0.72)',
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 2,
          padding: '5px 14px',
          fontFamily: SERIF,
          fontSize: 10.5,
          letterSpacing: '0.24em',
          color: GOLD,
          whiteSpace: 'nowrap',
        }}
      >
        SAMPLE EXHIBITION · FICTIONAL VENDORS
      </div>
    </>
  );
}
