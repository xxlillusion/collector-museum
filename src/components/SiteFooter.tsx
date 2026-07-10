import { Link } from 'wouter';
import { HAIRLINE, MUTED, SERIF } from './museumKit';

/**
 * Site-wide trust links (About · Privacy · Terms · Contact), mounted at the
 * bottom of PageShell and the landing page. Static pages live under
 * screens/static.
 */
export default function SiteFooter() {
  return (
    <footer style={{ marginTop: 64, paddingTop: 18, borderTop: `1px solid ${HAIRLINE}`, textAlign: 'center' }}>
      <nav
        style={{
          display: 'flex',
          gap: 20,
          justifyContent: 'center',
          flexWrap: 'wrap',
          fontFamily: SERIF,
          fontSize: 11,
          letterSpacing: '0.18em',
        }}
      >
        {([['ABOUT', '/about'], ['PRIVACY', '/privacy'], ['TERMS', '/terms'], ['CONTACT', '/contact']] as const).map(
          ([label, href]) => (
            <Link key={href} href={href} style={{ color: MUTED, textDecoration: 'none' }}>
              {label}
            </Link>
          ),
        )}
      </nav>
    </footer>
  );
}
