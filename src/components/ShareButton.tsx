import { useEffect, useRef, useState } from 'react';
import { ghostButtonStyle } from './museumKit';

// Copy-link / native-share button for public pages (show, vendor, collector).
// Touch devices get the native share sheet; desktop copies to the clipboard
// with inline "LINK COPIED" feedback. No external services involved.

const isTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export default function ShareButton({
  title,
  url,
}: {
  /** Share-sheet title; defaults to the document title. */
  title?: string;
  /** Defaults to the current page URL. */
  url?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const handleShare = async () => {
    const shareUrl = url ?? window.location.href;
    const shareTitle = title ?? document.title;
    if (isTouch && navigator.share) {
      try {
        await navigator.share({ title: shareTitle, url: shareUrl });
        return;
      } catch {
        // cancelled or unsupported payload — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied (rare) — select-and-copy fallback via prompt
      window.prompt('Copy this link:', shareUrl);
    }
  };

  return (
    <button
      onClick={handleShare}
      style={{ ...ghostButtonStyle, padding: '8px 18px', fontSize: 11.5 }}
    >
      {copied ? 'LINK COPIED ✓' : '⎘ SHARE'}
    </button>
  );
}
