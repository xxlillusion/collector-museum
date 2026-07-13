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
  fontSize: 15,
  color: t.text,
  cursor: 'pointer',
});
