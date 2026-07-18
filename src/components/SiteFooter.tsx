import { Fragment } from 'react';
import { Link } from 'wouter';
import { useTheme } from './themeKit';

/**
 * Site-wide trust links (About · Privacy · Terms · Contact), mounted at the
 * bottom of PageShell and the landing page. Static pages live under
 * screens/static. Handheld: muted 10px link row with ink · separators inside
 * the screen frame; © line drops to tertiary-meta size.
 */
export default function SiteFooter() {
  const t = useTheme();
  const lcd = t.id === 'handheld';
  return (
    <footer
      style={{
        marginTop: lcd ? 44 : 64,
        paddingTop: lcd ? 14 : 18,
        borderTop: lcd ? `2px solid ${t.border}` : `1px solid ${t.border}`,
        textAlign: 'center',
      }}
    >
      <nav
        style={{
          display: 'flex',
          gap: lcd ? 10 : 20,
          justifyContent: 'center',
          flexWrap: 'wrap',
          fontFamily: t.fontMono,
          fontSize: lcd ? 10 : 11,
          letterSpacing: lcd ? '0.06em' : '0.18em',
        }}
      >
        {([['ABOUT', '/about'], ['PRIVACY', '/privacy'], ['TERMS', '/terms'], ['CONTACT', '/contact']] as const).map(
          ([label, href], i) => (
            <Fragment key={href}>
              {lcd && i > 0 && (
                <span aria-hidden style={{ color: t.text }}>
                  ·
                </span>
              )}
              <Link href={href} style={{ color: t.muted, textDecoration: 'none' }}>
                {label}
              </Link>
            </Fragment>
          ),
        )}
      </nav>
      <p
        style={{
          ...t.note,
          margin: '12px 0 0',
          fontSize: lcd ? 8.5 : 10.5,
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
