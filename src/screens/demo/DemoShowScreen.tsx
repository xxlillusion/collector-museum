import PageShell, { ComingSoon } from '../PageShell';

/**
 * The bundled demo show (Wave A scaffold stub — Stream A1 replaces this with
 * the walk host: hand-authored plan meta + bundled inventory, mounted on the
 * lazy VendorScene exactly like ShowDetail's walk).
 */
export default function DemoShowScreen() {
  return (
    <PageShell eyebrow="PUBLIC EXHIBITION" title="Demo Show">
      <ComingSoon note="The demo hall is being installed — the walk-through opens shortly." />
    </PageShell>
  );
}
