import { Link } from 'wouter';
import { useTheme } from './themeKit';

/**
 * Site-wide trust links (About · Privacy · Terms · Contact), mounted at the
 * bottom of PageShell and the landing page. Static pages live under
 * screens/static.
 */
export default function SiteFooter() {
  const t = useTheme();
  return (
    <footer style={{ marginTop: 64, paddingTop: 18, borderTop: `1px solid ${t.border}`, textAlign: 'center' }}>
      <nav
        style={{
          display: 'flex',
          gap: 20,
          justifyContent: 'center',
          flexWrap: 'wrap',
          fontFamily: t.fontMono,
          fontSize: 11,
          letterSpacing: '0.18em',
        }}
      >
        {([['ABOUT', '/about'], ['PRIVACY', '/privacy'], ['TERMS', '/terms'], ['CONTACT', '/contact']] as const).map(
          ([label, href]) => (
            <Link key={href} href={href} style={{ color: t.muted, textDecoration: 'none' }}>
              {label}
            </Link>
          ),
        )}
      </nav>
      <p
        style={{
          ...t.note,
          margin: '12px 0 0',
          fontSize: 10.5,
          lineHeight: undefined,
          letterSpacing: '0.06em',
          opacity: 0.75,
        }}
      >
        © 2026 Vendor Museum — a personal project, built with care
      </p>
    </footer>
  );
}
