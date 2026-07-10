import PageShell, { ComingSoon } from '../PageShell';

/**
 * Static trust pages (Wave A scaffold stubs — Stream A1 fills the copy).
 * One file, four named exports; routes.tsx maps each through React.lazy.
 */

export function AboutPage() {
  return (
    <PageShell eyebrow="THE MUSEUM" title="About">
      <ComingSoon note="About Vendor Museum — copy arriving shortly." />
    </PageShell>
  );
}

export function PrivacyPage() {
  return (
    <PageShell eyebrow="THE MUSEUM" title="Privacy">
      <ComingSoon note="Privacy policy — copy arriving shortly." />
    </PageShell>
  );
}

export function TermsPage() {
  return (
    <PageShell eyebrow="THE MUSEUM" title="Terms">
      <ComingSoon note="Terms of use — copy arriving shortly." />
    </PageShell>
  );
}

export function ContactPage() {
  return (
    <PageShell eyebrow="THE MUSEUM" title="Contact">
      <ComingSoon note="Contact the museum — copy arriving shortly." />
    </PageShell>
  );
}
