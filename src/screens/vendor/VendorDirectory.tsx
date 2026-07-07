import PageShell, { ComingSoon } from '../PageShell';

/** Public directory of registered vendors. Stream C fills this in. */
export default function VendorDirectory() {
  return (
    <PageShell title="Vendor Directory">
      <ComingSoon note="The vendor directory is on its way — this workstream hasn't landed yet." />
    </PageShell>
  );
}
