import PageShell, { ComingSoon } from '../PageShell';

/** Public collector profile (display name, location, public collection).
 *  Stream C fills this in. */
export default function CollectorPage({ profileId }: { profileId: string }) {
  void profileId;
  return (
    <PageShell title="Collector">
      <ComingSoon note="Collector profiles are on their way — this workstream hasn't landed yet." />
    </PageShell>
  );
}
