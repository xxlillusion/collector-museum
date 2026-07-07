import PageShell, { ComingSoon } from '../PageShell';

/** Organizer-only show create (/organizer/show/new) and edit
 *  (/organizer/show/:id/edit). Stream B fills this in (PlanWorkbench). */
export default function ShowEditorScreen({ showId }: { showId?: string }) {
  return (
    <PageShell title={showId ? 'Edit Show' : 'Create a Show'}>
      <ComingSoon note="Show creation is on its way — this workstream hasn't landed yet." />
    </PageShell>
  );
}
