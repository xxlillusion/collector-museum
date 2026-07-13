import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useTheme, withAlpha } from './themeKit';
import {
  buildOnboardingSteps,
  isOnboardingDismissed,
  dismissOnboarding,
} from '../lib/onboarding';
import type { OnboardingInputs, OnboardingStep } from '../lib/onboarding';

// First-visit checklist on the signed-in home (Wave A, Stream A2). Steps with
// a live data signal render ✓/○; steps without one render as plain → CTAs.
// Only the dismissal persists (localStorage, per account) — completion is
// re-derived from the data the home screen already holds. Auto-hides once
// every derivable step is done.

interface OnboardingChecklistProps extends OnboardingInputs {
  userId: string;
  /** ENTER THE GALLERY — the home screen's own handler. */
  onEnterGallery: () => void;
}

function scrollToAcquisitions() {
  document
    .getElementById('home-dropzone')
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export default function OnboardingChecklist({
  userId,
  role,
  cardCount,
  hasInventory,
  collectionPublic,
  onEnterGallery,
}: OnboardingChecklistProps) {
  const [, navigate] = useLocation();
  const t = useTheme();
  const [dismissed, setDismissed] = useState(() => isOnboardingDismissed(userId));

  const steps = useMemo(
    () => buildOnboardingSteps({ role, cardCount, hasInventory, collectionPublic }),
    [role, cardCount, hasInventory, collectionPublic],
  );
  const derivable = steps.filter((s) => s.derivable);
  const doneCount = derivable.filter((s) => s.done).length;

  // Dismissed, or nothing left to nudge about — every derivable step done.
  if (dismissed || doneCount === derivable.length) return null;

  const dismiss = () => {
    // Side effect stays OUTSIDE the state updater (StrictMode double-invokes
    // updaters — see CLAUDE.md).
    dismissOnboarding(userId);
    setDismissed(true);
  };

  const activate = (step: OnboardingStep) => {
    if (step.id === 'collector-cards') {
      scrollToAcquisitions();
      return;
    }
    if (step.id === 'collector-walk') {
      // The gallery needs at least one work on the walls first.
      if (cardCount > 0) onEnterGallery();
      else scrollToAcquisitions();
      return;
    }
    if (step.href) navigate(step.href);
  };

  return (
    <section
      aria-label="Getting started"
      style={{
        maxWidth: 620,
        margin: '0 auto 48px',
        border: `${t.borderWidth}px solid ${t.border}`,
        borderRadius: 4,
        background: t.panel,
        padding: '16px 20px 8px',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: t.fontMono, fontSize: 12, letterSpacing: '0.22em', color: t.accent }}>
          GETTING STARTED
        </span>
        <span
          style={{
            fontSize: 10.5,
            letterSpacing: '0.14em',
            color: t.muted,
            fontFamily: t.id === 'refined' ? undefined : t.fontMono,
          }}
        >
          {doneCount} OF {derivable.length} COMPLETE
        </span>
        <button
          onClick={dismiss}
          title="Dismiss — this checklist won't reappear"
          aria-label="Dismiss getting-started checklist"
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            color: t.muted,
            border: `${t.borderWidth}px solid ${t.border}`,
            borderRadius: '50%',
            width: 22,
            height: 22,
            cursor: 'pointer',
            fontSize: 11,
            lineHeight: '20px',
            textAlign: 'center',
            padding: 0,
            flex: 'none',
          }}
        >
          ✕
        </button>
      </div>
      <p style={{ ...t.note, margin: '6px 0 10px', fontSize: 12.5, lineHeight: 1.5 }}>
        A few first steps to make this museum yours.
      </p>
      <div>
        {steps.map((step) => (
          <button
            key={step.id}
            className="museum-row"
            onClick={() => activate(step)}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              borderTop: `1px solid ${withAlpha(t.accent, 0.10)}`,
              padding: '9px 4px',
              cursor: 'pointer',
              fontFamily: t.fontMono,
            }}
          >
            <span
              aria-hidden
              style={{
                flex: 'none',
                width: 16,
                textAlign: 'center',
                fontSize: 12,
                color: step.done ? t.ok : step.derivable ? t.muted : t.accent,
              }}
            >
              {step.derivable ? (step.done ? '✓' : '○') : '→'}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                fontSize: 13.5,
                letterSpacing: '0.04em',
                color: step.done ? t.muted : t.text,
              }}>
                {step.label}
              </span>
              <span style={{ ...t.note, fontSize: 11.5, lineHeight: undefined }}>
                {' '}— {step.hint}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
