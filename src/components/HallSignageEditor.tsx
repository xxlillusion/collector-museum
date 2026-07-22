import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTheme, withAlpha } from './themeKit';
import { LCD, lcdWell, lcdImg } from './lcdKit';
import {
  DEFAULT_SIGNAGE_SUBTITLE,
  SIGNAGE_THEME_IDS,
  SIGNAGE_THEMES,
} from '../lib/hallSignage';
import type { HallSignageConfig, SignageTheme } from '../lib/hallSignage';

/**
 * Shared hall-signage editor (F3) — title / subtitle / theme swatches /
 * header + banner image slots. Purely controlled: `value` + `onChange` carry
 * the config (image PATH fields ride through untouched — each host owns its
 * own image plumbing via the slot props). Text fields commit on blur/Enter
 * so hosts can persist per commit without debounce plumbing.
 *
 * Hosts: VendorSetupScreen (sandbox, useHallSignage slots) and
 * ShowEditorScreen (organizer, cloud config + storage uploads).
 */

export interface SignageImageSlot {
  /** Preview URL (object URL or CDN) — null renders the empty picker. */
  url: string | null;
  onPick: (file: File) => void;
  onClear: () => void;
}

interface HallSignageEditorProps {
  value: HallSignageConfig;
  onChange: (next: HallSignageConfig) => void;
  header: SignageImageSlot;
  banner: SignageImageSlot;
  /** Host-specific default-title hint (organizer: the show's name). */
  titlePlaceholder?: string;
}

const THEME_LABELS: Record<SignageTheme, string> = {
  classicGold: 'CLASSIC GOLD',
  crimson: 'CRIMSON',
  forest: 'FOREST',
  navy: 'NAVY',
  slate: 'SLATE',
};

function ImageSlotRow({
  label,
  hint,
  slotId,
  slot,
}: {
  label: string;
  hint: string;
  /** Stable hook for drive scripts (inputs are refs, not ids — two rows mount). */
  slotId: 'header' | 'banner';
  slot: SignageImageSlot;
}) {
  const t = useTheme();
  const lcd = t.id === 'handheld';
  const inputRef = useRef<HTMLInputElement>(null);

  const removeBadge: CSSProperties = lcd
    ? {
        position: 'absolute', top: 6, right: 6, background: LCD.ink, color: LCD.screen,
        border: 'none', borderRadius: 0, width: 20, height: 20, cursor: 'pointer',
        fontSize: 10, fontWeight: 700, lineHeight: '20px', textAlign: 'center', padding: 0,
      }
    : {
        position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.75)', color: t.text,
        border: `${t.borderWidth}px solid ${t.border}`, borderRadius: '50%', width: 22,
        height: 22, cursor: 'pointer', fontSize: 11, lineHeight: '20px', textAlign: 'center',
        padding: 0,
      };

  return (
    <div style={{ flex: '1 1 220px', minWidth: 200 }}>
      <span style={{ ...t.label, ...(lcd ? { fontWeight: 700, color: t.text } : {}) }}>{label}</span>
      <div
        onClick={() => inputRef.current?.click()}
        style={lcd ? {
          ...lcdWell,
          position: 'relative', cursor: 'pointer', padding: slot.url ? '6px' : '16px',
          textAlign: 'center',
        } : {
          position: 'relative', borderRadius: t.radius,
          border: `${t.borderWidth}px ${slot.url ? 'solid' : 'dashed'} ${t.border}`,
          background: t.bg, cursor: 'pointer', padding: slot.url ? '6px' : '16px',
          textAlign: 'center',
        }}
      >
        {slot.url ? (
          <>
            <img
              src={slot.url}
              alt={`${label} preview`}
              style={{ width: '100%', maxHeight: 80, objectFit: 'contain', display: 'block', ...(lcd ? lcdImg : {}) }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); slot.onClear(); }}
              title={`Remove ${label.toLowerCase()}`}
              style={removeBadge}
            >
              ✕
            </button>
          </>
        ) : (
          <div style={{ fontSize: lcd ? 9.5 : 12, color: t.muted, ...(lcd ? { textTransform: 'uppercase' as const, letterSpacing: '0.06em', lineHeight: 1.8 } : {}) }}>
            {hint}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          data-signage-slot={slotId}
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && file.type.startsWith('image/')) slot.onPick(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

export default function HallSignageEditor({
  value,
  onChange,
  header,
  banner,
  titlePlaceholder,
}: HallSignageEditorProps) {
  const t = useTheme();
  const lcd = t.id === 'handheld';

  // Text drafts commit on blur/Enter; external resets (plan load/clear) land
  // while the inputs are unfocused, so re-seeding on value change is safe.
  const [titleDraft, setTitleDraft] = useState(value.title ?? '');
  const [subDraft, setSubDraft] = useState(value.subtitle ?? '');
  const titleRef = useRef<HTMLInputElement>(null);
  const subRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitleDraft(value.title ?? '');
  }, [value.title]);
  useEffect(() => {
    if (document.activeElement !== subRef.current) setSubDraft(value.subtitle ?? '');
  }, [value.subtitle]);

  const commitText = (field: 'title' | 'subtitle', raw: string) => {
    const trimmed = raw.trim();
    if ((value[field] ?? '') === trimmed) return; // no-op — don't echo saves
    const next: HallSignageConfig = { ...value };
    if (trimmed) next[field] = trimmed;
    else delete next[field];
    onChange(next);
  };

  const pickTheme = (theme: SignageTheme) => {
    const current = value.theme ?? 'classicGold';
    if (current === theme) return;
    const next: HallSignageConfig = { ...value };
    if (theme === 'classicGold') delete next.theme; // default stays implicit
    else next.theme = theme;
    onChange(next);
  };

  const selectedTheme: SignageTheme = value.theme ?? 'classicGold';

  return (
    <div>
      {/* Title + subtitle */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <label htmlFor="hall-signage-title" style={{ ...t.label, ...(lcd ? { fontWeight: 700, color: t.text } : {}) }}>
            HALL TITLE
          </label>
          <input
            id="hall-signage-title"
            ref={titleRef}
            type="text"
            placeholder={titlePlaceholder ?? "Defaults to your show's name"}
            value={titleDraft}
            maxLength={80}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => commitText('title', titleDraft)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ ...t.input, width: 280 }}
          />
        </div>
        <div>
          <label htmlFor="hall-signage-subtitle" style={{ ...t.label, ...(lcd ? { fontWeight: 700, color: t.text } : {}) }}>
            SUBTITLE
          </label>
          <input
            id="hall-signage-subtitle"
            ref={subRef}
            type="text"
            placeholder={DEFAULT_SIGNAGE_SUBTITLE.replace(/\s+/g, ' ')}
            value={subDraft}
            maxLength={80}
            onChange={(e) => setSubDraft(e.target.value)}
            onBlur={() => commitText('subtitle', subDraft)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ ...t.input, width: 280 }}
          />
        </div>
      </div>
      <div style={{ ...t.note, fontSize: lcd ? 9.5 : 12, marginBottom: 16 }}>
        The title crowns the north wall and the entrance sign; subtitle words
        (separated by ·) become the hanging banner wordmark.
      </div>

      {/* Theme swatches — each chip previews its pennant palette */}
      <span style={{ ...t.label, ...(lcd ? { fontWeight: 700, color: t.text } : {}) }}>COLOR THEME</span>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {SIGNAGE_THEME_IDS.map((id) => {
          const selected = id === selectedTheme;
          const pal = SIGNAGE_THEMES[id];
          return (
            <button
              key={id}
              onClick={() => pickTheme(id)}
              title={THEME_LABELS[id]}
              style={lcd ? {
                display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px',
                background: selected ? LCD.ink : LCD.screen,
                color: selected ? LCD.screen : LCD.ink,
                border: `3px solid ${LCD.ink}`, borderRadius: 0, cursor: 'pointer',
                fontFamily: t.fontBody, fontSize: 9, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
              } : {
                display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px',
                background: selected ? withAlpha(t.accent, 0.12) : t.surface,
                color: selected ? t.accent : t.muted,
                border: `${Math.max(t.borderWidth, selected ? 2 : 1)}px solid ${selected ? t.accent : t.border}`,
                borderRadius: t.radius, cursor: 'pointer',
                fontFamily: t.fontMono, fontSize: 10.5, letterSpacing: '0.12em',
              }}
            >
              <span style={{ display: 'flex', gap: 2 }}>
                {pal.pennants.map((hex, i) => (
                  <span
                    key={i}
                    style={{
                      width: 10, height: 10, background: hex, display: 'inline-block',
                      borderRadius: lcd ? 0 : 2,
                      border: '1px solid rgba(0,0,0,0.35)',
                    }}
                  />
                ))}
              </span>
              {THEME_LABELS[id]}
            </button>
          );
        })}
      </div>

      {/* Uploaded art slots */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <ImageSlotRow
          label="HEADER IMAGE"
          hint={lcd ? 'PICK A WIDE BANNER IMAGE!' : 'Wide banner art for the north wall — click to browse'}
          slotId="header"
          slot={header}
        />
        <ImageSlotRow
          label="BANNER IMAGE"
          hint={lcd ? 'PICK VERTICAL BANNER ART!' : 'Vertical art for the hanging cloth banners — click to browse'}
          slotId="banner"
          slot={banner}
        />
      </div>
      <div style={{ ...t.note, fontSize: lcd ? 9.5 : 12, marginTop: 10 }}>
        Images replace the lettered designs; leave them empty for the themed
        defaults. Banner art keeps the swallowtail cloth shape.
      </div>
    </div>
  );
}
