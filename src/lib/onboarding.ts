/**
 * Onboarding checklist seams (Wave A scaffold — Stream A2 builds the
 * component). Step completion is derived live from data the home screen
 * already holds (cards, stores, profile flags); only the dismissal persists,
 * per account, in this browser — the same localStorage idiom as wants/stars.
 */

export type OnboardingRole = 'collector' | 'vendor';

export type OnboardingStepId =
  | 'collector-cards'
  | 'collector-walk'
  | 'collector-share'
  | 'vendor-inventory'
  | 'vendor-qr'
  | 'vendor-apply';

export interface OnboardingStep {
  id: OnboardingStepId;
  /** Short imperative label, e.g. "Hang your first cards". */
  label: string;
  /** Optional route the step's CTA navigates to. */
  href?: string;
  done: boolean;
  /** True when `done` can be derived from live data (renders ✓/○). Steps
   *  with no completion signal render as plain → CTAs instead. */
  derivable: boolean;
  /** Short italic explainer shown beside the label. */
  hint: string;
}

export interface OnboardingInputs {
  role: OnboardingRole;
  cardCount: number;
  /** Any of the account's stores holds at least one inventory item. */
  hasInventory: boolean;
  collectionPublic: boolean;
}

/**
 * Build the checklist for an account. Collectors get the collector steps;
 * vendor accounts also collect cards, so their list is vendor steps first,
 * collector steps beneath. `done` comes straight from the inputs — nothing
 * is stored except the dismissal.
 */
export function buildOnboardingSteps(i: OnboardingInputs): OnboardingStep[] {
  const collector: OnboardingStep[] = [
    {
      id: 'collector-cards',
      label: 'Hang your first cards',
      done: i.cardCount > 0,
      derivable: true,
      hint: 'submit scans at the acquisitions desk below',
    },
    {
      id: 'collector-walk',
      label: 'Walk your gallery',
      done: false,
      derivable: false,
      hint: 'step into the 3D museum',
    },
    {
      id: 'collector-share',
      label: 'Share your museum',
      href: '/account',
      done: i.collectionPublic,
      derivable: true,
      hint: 'make your collection public',
    },
  ];
  if (i.role !== 'vendor') return collector;
  return [
    {
      id: 'vendor-inventory',
      label: 'Add your first inventory',
      href: '/account?tab=stores',
      done: i.hasInventory,
      derivable: true,
      hint: 'photos, captions and prices for your store',
    },
    {
      id: 'vendor-qr',
      label: 'Print your booth QR',
      href: '/account?tab=stores',
      done: false,
      derivable: false,
      hint: 'a table sign that links to your store page',
    },
    {
      id: 'vendor-apply',
      label: 'Apply to a show',
      href: '/shows',
      done: false,
      derivable: false,
      hint: 'browse published shows and request a booth',
    },
    ...collector,
  ];
}

const dismissedKey = (userId: string) => `vendor-museum:onboarding:${userId}`;

export function isOnboardingDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(dismissedKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function dismissOnboarding(userId: string): void {
  try {
    localStorage.setItem(dismissedKey(userId), '1');
  } catch {
    /* private mode — nudge simply reappears */
  }
}
