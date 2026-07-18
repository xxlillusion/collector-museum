import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { useTheme } from '../../components/themeKit';

/**
 * Static trust pages (UX Wave A). One file, four named exports; routes.tsx
 * maps each through React.lazy. Short, honest copy in the museum voice —
 * themed note-style body, small-caps side headings, nothing legalese.
 * Handheld: prose sits in an ink-bordered panel, ink body text at dialog
 * sizing, headings 12–13px 700, and the contact mailto becomes a ▶ row.
 */

/** Per-theme prose styles — each page destructures what it uses. */
function usePageStyles() {
  const t = useTheme();
  const lcd = t.id === 'handheld';
  const bodyStyle: CSSProperties = lcd
    ? {
        fontFamily: t.fontBody,
        fontSize: 10.5,
        lineHeight: 2,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: t.text,
        margin: '0 0 18px',
      }
    : {
        ...t.note,
        fontSize: 15.5,
        lineHeight: 1.8,
        margin: '0 0 22px',
      };
  // Side headings share the panel-title recipe (small caps, letterspaced).
  const headingStyle: CSSProperties = lcd
    ? {
        ...t.panelTitle,
        fontSize: 12.5,
        margin: '28px 0 10px',
      }
    : {
        ...t.panelTitle,
        margin: '34px 0 12px',
      };
  const emailLinkStyle: CSSProperties = lcd
    ? {
        color: t.text,
        textDecoration: 'underline',
        fontStyle: 'normal',
        fontWeight: 700,
      }
    : {
        color: t.accent,
        textDecoration: 'none',
        fontStyle: 'normal',
      };
  return { t, lcd, bodyStyle, headingStyle, emailLinkStyle };
}

function Prose({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      {t.id === 'handheld' ? (
        <div style={{ ...t.panelStyle, marginBottom: 0 }}>{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

export function AboutPage() {
  const { bodyStyle, emailLinkStyle } = usePageStyles();
  return (
    <PageShell eyebrow="THE MUSEUM" title="About">
      <Prose>
        <p style={bodyStyle}>
          Vendor Museum is a small experiment in taking card shows seriously as
          places. Organizers publish a floor plan, vendors set out their
          binders, and you walk the hall in first person — past the tablecloth
          drapes, up to a booth, through the sleeves — before you ever get in
          the car.
        </p>
        <p style={bodyStyle}>
          It is also a museum in the plainer sense: collectors can hang their
          own cards as framed, spotlit works in a private 3D gallery, and share
          the room if they choose to.
        </p>
        <p style={bodyStyle}>
          This is a personal project, built and run by one person because card
          shows deserved better than a PDF map and a folding-table photo. It
          isn't a marketplace — nothing is bought or sold here; every deal
          still happens at the table, where it belongs.
        </p>
        <p style={bodyStyle}>
          If you'd like to see the idea before signing up,{' '}
          <Link href="/demo" style={emailLinkStyle}>walk the sample hall</Link>{' '}
          or try the no-account sandbox — everything runs in your browser.
        </p>
      </Prose>
    </PageShell>
  );
}

export function PrivacyPage() {
  const { bodyStyle, headingStyle, emailLinkStyle } = usePageStyles();
  return (
    <PageShell eyebrow="THE MUSEUM" title="Privacy">
      <Prose>
        <p style={bodyStyle}>
          The short version: this site collects the minimum it needs to work,
          and nothing it doesn't.
        </p>
        <h2 style={headingStyle}>IF YOU HAVE AN ACCOUNT</h2>
        <p style={bodyStyle}>
          Your email address, display name, optional profile fields (location,
          bio) and the images you upload — cards, inventory, banners, floor
          plans — are stored with Supabase, the project's hosting backend.
          They're used to show your museum, your stores and your shows to
          whoever you've chosen to share them with, and for nothing else.
        </p>
        <h2 style={headingStyle}>IF YOU'RE A GUEST</h2>
        <p style={bodyStyle}>
          The sandbox and demo run entirely in your browser. Cards, floor
          plans and vendors you create there live in this browser's own
          storage (IndexedDB and localStorage) and never leave your machine.
          Clearing your browser data clears them.
        </p>
        <h2 style={headingStyle}>WHAT ISN'T HERE</h2>
        <p style={bodyStyle}>
          No analytics, no trackers, no advertising pixels, no selling of
          data. The one thing counted is walks: public shows and museums keep
          a plain tally that goes up by one when somebody walks through — a
          number, nothing more. No identifiers, no cookies, nothing that
          knows who you are or follows you around.
        </p>
        <p style={bodyStyle}>
          Want your account or images removed? Write to{' '}
          <a href="mailto:jason.a.dale2@gmail.com" style={emailLinkStyle}>
            jason.a.dale2@gmail.com
          </a>{' '}
          and it will be done, promptly and without ceremony.
        </p>
      </Prose>
    </PageShell>
  );
}

export function TermsPage() {
  const { bodyStyle } = usePageStyles();
  return (
    <PageShell eyebrow="THE MUSEUM" title="Terms">
      <Prose>
        <p style={bodyStyle}>
          Vendor Museum is a personal project, provided as-is and free of
          charge. It aims to be reliable, but it comes with no warranties, no
          uptime promises and no guarantee that any feature stays exactly as
          you found it — things may change, move or occasionally break while
          the project grows.
        </p>
        <p style={bodyStyle}>
          Upload only content you have the right to share. Photographs of your
          own cards and your own banners are what this place is for; other
          people's artwork, logos or photographs are not yours to hang.
        </p>
        <p style={bodyStyle}>
          Be decent. No harassment, no scams, no misrepresenting what you're
          selling or who you are. Listings here are shop windows, not
          contracts — every actual sale happens between you and the vendor,
          at the table.
        </p>
        <p style={bodyStyle}>
          Accounts that abuse the space or other people can be removed, with
          judgement applied by a human rather than a policy engine.
        </p>
      </Prose>
    </PageShell>
  );
}

export function ContactPage() {
  const { t, lcd, bodyStyle, emailLinkStyle } = usePageStyles();
  return (
    <PageShell eyebrow="THE MUSEUM" title="Contact">
      <Prose>
        <p style={bodyStyle}>
          Questions, bug reports, takedown requests, or a card show you think
          should be walkable — all of it goes to the same place:
        </p>
        {lcd ? (
          // The mailto as a ▶ row — the LCD "press A" affordance.
          <p style={{ ...bodyStyle, fontWeight: 700, fontSize: 11 }}>
            <a
              href="mailto:jason.a.dale2@gmail.com"
              style={{ color: t.text, textDecoration: 'none' }}
            >
              ▶ JASON.A.DALE2@GMAIL.COM
            </a>
          </p>
        ) : (
          <p style={{ ...bodyStyle, textAlign: 'center', fontSize: 17 }}>
            <a href="mailto:jason.a.dale2@gmail.com" style={emailLinkStyle}>
              jason.a.dale2@gmail.com
            </a>
          </p>
        )}
        <p style={bodyStyle}>
          Expect a human, not a helpdesk. Replies come when the human is awake,
          which is most of the time and never all of it.
        </p>
        <p style={{ ...bodyStyle, color: t.text, opacity: 0.85 }}>
          If you're a show organizer or a vendor and want a hand getting your
          floor plan or inventory in, say so — happy to walk you through it.
        </p>
      </Prose>
    </PageShell>
  );
}
