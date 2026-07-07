import PageShell, { ComingSoon } from '../PageShell';

// Owned by the vendor-portal workstream (Stream B).
export default function VendorPage({ vendorId }: { vendorId: string }) {
  return (
    <PageShell title="Vendor Profile">
      <ComingSoon
        note={`Public vendor profiles (banner, visible inventory, upcoming shows) land with the vendor-portal workstream. Vendor: ${vendorId}`}
      />
    </PageShell>
  );
}
