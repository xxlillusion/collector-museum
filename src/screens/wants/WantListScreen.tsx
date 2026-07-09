import PageShell from '../PageShell';
import { noteStyle } from '../../components/museumKit';

// /wants — the visitor's want-list (hearted inventory items).
// SCAFFOLD: replaced wholesale by the mobile/want-list workstream.
export default function WantListScreen() {
  return (
    <PageShell title="Want List" eyebrow="MY MARKS">
      <p style={{ ...noteStyle, fontSize: 16 }}>The want list is being framed…</p>
    </PageShell>
  );
}
