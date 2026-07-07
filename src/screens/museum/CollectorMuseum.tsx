import PageShell, { ComingSoon } from '../PageShell';

/** Walk a collector's public collection in the 3D museum. Stream C fills
 *  this in (lazy Scene — keep three.js out of this chunk until then). */
export default function CollectorMuseum({ profileId }: { profileId: string }) {
  void profileId;
  return (
    <PageShell title="Collector Museum">
      <ComingSoon note="The public collector museum is on its way — this workstream hasn't landed yet." />
    </PageShell>
  );
}
