import type { CSSProperties } from 'react';
import { useTheme } from '../../components/themeKit';
import type { Theme } from '../../components/themeKit';

// Small helpers shared by AccountScreen's tabs (profile sections and
// MyStoresTab) — kept out of both files so neither imports the other.

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function StatusLine({ status, error }: { status: SaveStatus; error?: string | null }) {
  const t = useTheme();
  if (t.id === 'handheld') {
    // LCD: statuses in game voice; errors are the inverted "!" box (t.errorText).
    return (
      <p
        style={{
          margin: '6px 0 0',
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: t.muted,
          minHeight: 15,
        }}
      >
        {status === 'saving' && 'SAVING…'}
        {status === 'saved' && 'SAVED!'}
        {status === 'error' && (
          <span style={t.errorText}>! {error || 'COULD NOT SAVE — TRY AGAIN.'}</span>
        )}
      </p>
    );
  }
  return (
    <p
      style={{
        margin: '6px 0 0',
        fontSize: 12,
        color: status === 'error' ? t.error : t.muted,
        minHeight: 15,
      }}
    >
      {status === 'saving' && 'Saving…'}
      {status === 'saved' && 'Saved.'}
      {status === 'error' && (error || 'Could not save — try again.')}
    </p>
  );
}

export const checkLabelStyle = (t: Theme): CSSProperties => ({
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  fontSize: t.id === 'handheld' ? 10.5 : 15,
  ...(t.id === 'handheld'
    ? { textTransform: 'uppercase' as const, letterSpacing: '0.04em', lineHeight: 1.8 }
    : {}),
  color: t.text,
  cursor: 'pointer',
});
