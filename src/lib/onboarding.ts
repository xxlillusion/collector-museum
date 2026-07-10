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
