import PageShell from '../PageShell';
import { noteStyle } from '../../components/museumKit';

// /search?q=… — cross-entity search results (roadmap item 14).
// SCAFFOLD: replaced wholesale by the search workstream.
export default function SearchScreen() {
  return (
    <PageShell title="Search" eyebrow="THE CATALOGUE">
      <p style={{ ...noteStyle, fontSize: 16 }}>Search is being installed…</p>
    </PageShell>
  );
}
