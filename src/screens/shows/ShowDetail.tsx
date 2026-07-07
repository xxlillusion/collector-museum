import PageShell, { ComingSoon } from '../PageShell';

// Owned by the shows workstream (Stream C).
export default function ShowDetail({ showId }: { showId: string }) {
  return (
    <PageShell title="Show">
      <ComingSoon
        note={`Show details — floor plan, attending vendors and the 3D walk — land with the shows workstream. Show: ${showId}`}
      />
    </PageShell>
  );
}
