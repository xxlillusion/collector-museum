import PageShell, { ComingSoon } from '../PageShell';

/** Walk a vendor's public inventory in the 3D museum. Stream C fills this
 *  in (lazy Scene — keep three.js out of this chunk until then). */
export default function VendorMuseum({ vendorId }: { vendorId: string }) {
  void vendorId;
  return (
    <PageShell title="Vendor Museum">
      <ComingSoon note="The public vendor museum is on its way — this workstream hasn't landed yet." />
    </PageShell>
  );
}
