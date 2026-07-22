/**
 * Organizer hall signage (F3) — pure config/resolve layer. The canvas/texture
 * work lives in hallAtmosphereAssets.ts; this module owns the stored shape,
 * the theme palettes and the defaults-from-show-name rule.
 *
 * Stored form: `shows.signage` jsonb (cloud) / the `hallSignage` settings
 * slot (sandbox, JSON-in-Blob). Uploaded image PATHS live inside the cloud
 * config; the sandbox keeps image blobs in their own settings slots and the
 * host passes resolved object URLs instead.
 */

export type SignageTheme = 'classicGold' | 'crimson' | 'forest' | 'navy' | 'slate';

export const SIGNAGE_THEME_IDS: readonly SignageTheme[] = [
  'classicGold',
  'crimson',
  'forest',
  'navy',
  'slate',
];

export function isSignageTheme(v: unknown): v is SignageTheme {
  return (SIGNAGE_THEME_IDS as readonly unknown[]).includes(v);
}

export interface SignagePalette {
  /** Accent (header lettering, banner ornament) — 'classicGold' = today's gold. */
  gold: string;
  /** Soft accent for rules/ornaments (rgba). */
  goldSoft: string;
  /** Light lettering (subtitle, banner wordmark). */
  cream: string;
  /** Canvas background base. */
  dark: string;
  /** Pennant triangle colors, cycled along each string. */
  pennants: string[];
}

/** Exact hues are render-side tuning (stream B may refine); the THEME NAMES
 *  are the frozen, persisted vocabulary. 'classicGold' must reproduce
 *  today's hard-coded palette (hallAtmosphereAssets.ts). */
export const SIGNAGE_THEMES: Record<SignageTheme, SignagePalette> = {
  classicGold: {
    gold: '#d4af37',
    goldSoft: 'rgba(212,175,55,0.55)',
    cream: '#e8d9a8',
    dark: '#1b1613',
    pennants: ['#d4af37', '#e8d9a8', '#a8842a', '#f2e8c8'],
  },
  crimson: {
    gold: '#c8323e',
    goldSoft: 'rgba(200,50,62,0.55)',
    cream: '#f2d8b8',
    dark: '#1a0f10',
    pennants: ['#c8323e', '#f2d8b8', '#8f1f28', '#e0b64c'],
  },
  forest: {
    gold: '#3f7d4e',
    goldSoft: 'rgba(63,125,78,0.55)',
    cream: '#e4ecd8',
    dark: '#101711',
    pennants: ['#3f7d4e', '#e4ecd8', '#2a5636', '#d4af37'],
  },
  navy: {
    gold: '#3f6da8',
    goldSoft: 'rgba(63,109,168,0.55)',
    cream: '#dce6f2',
    dark: '#0e1218',
    pennants: ['#3f6da8', '#dce6f2', '#28486e', '#d4af37'],
  },
  slate: {
    gold: '#8f98a3',
    goldSoft: 'rgba(143,152,163,0.55)',
    cream: '#e8eaed',
    dark: '#14161a',
    pennants: ['#8f98a3', '#e8eaed', '#5c646e', '#c8ccd2'],
  },
};

export const DEFAULT_SIGNAGE_TITLE = 'CARD SHOW';
/** Double-spaced like today's baked header subtitle. */
export const DEFAULT_SIGNAGE_SUBTITLE = 'TRADE  ·  COLLECT  ·  PLAY';

const MAX_TEXT_LEN = 80;

/** Stored organizer config — every field optional; {} ≡ defaults. */
export interface HallSignageConfig {
  /** Header + entrance sign text; absent → the show's name → 'CARD SHOW'. */
  title?: string;
  subtitle?: string;
  theme?: SignageTheme;
  /** Storage path in the plans bucket (cloud only). */
  headerImagePath?: string;
  bannerImagePath?: string;
}

/** What VendorScene/HallAtmosphere consume — fully defaulted + url-resolved. */
export interface ResolvedHallSignage {
  title: string;
  subtitle: string;
  theme: SignageTheme;
  headerImageUrl?: string;
  bannerImageUrl?: string;
}

/**
 * The headline default rule: `resolveSignage(null, 'Sacramento Card Expo')`
 * puts the show's own name on the header + entrance sign with zero organizer
 * effort. `classicGold` with no overrides reproduces today's baked visuals.
 */
export function resolveSignage(
  config: HallSignageConfig | null | undefined,
  showName?: string,
  urls?: { header?: string; banner?: string },
): ResolvedHallSignage {
  const title =
    clampText(config?.title) || clampText(showName) || DEFAULT_SIGNAGE_TITLE;
  const subtitle = clampText(config?.subtitle) || DEFAULT_SIGNAGE_SUBTITLE;
  const theme = isSignageTheme(config?.theme) ? config.theme : 'classicGold';
  const out: ResolvedHallSignage = { title, subtitle, theme };
  if (urls?.header) out.headerImageUrl = urls.header;
  if (urls?.banner) out.bannerImageUrl = urls.banner;
  return out;
}

function clampText(v: string | undefined): string {
  const t = v?.trim() ?? '';
  return t.length > MAX_TEXT_LEN ? t.slice(0, MAX_TEXT_LEN) : t;
}

/** Stable key for the atmosphere asset cache (one entry per distinct look). */
export function signageCacheKey(s: ResolvedHallSignage): string {
  return JSON.stringify([
    s.title,
    s.subtitle,
    s.theme,
    s.headerImageUrl ?? '',
    s.bannerImageUrl ?? '',
  ]);
}

/** Validate untrusted jsonb / settings-blob JSON into a config (null = not a
 *  config). Unknown keys are dropped; known keys are type-checked. */
export function parseSignage(raw: unknown): HallSignageConfig | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: HallSignageConfig = {};
  if (typeof r.title === 'string' && r.title.trim()) out.title = clampText(r.title);
  if (typeof r.subtitle === 'string' && r.subtitle.trim()) {
    out.subtitle = clampText(r.subtitle);
  }
  if (isSignageTheme(r.theme)) out.theme = r.theme;
  if (typeof r.headerImagePath === 'string' && r.headerImagePath) {
    out.headerImagePath = r.headerImagePath;
  }
  if (typeof r.bannerImagePath === 'string' && r.bannerImagePath) {
    out.bannerImagePath = r.bannerImagePath;
  }
  return out;
}

/** True when the config would render anything different from the defaults —
 *  hosts may skip persisting all-default configs. */
export function isDefaultSignage(config: HallSignageConfig | null | undefined): boolean {
  if (!config) return true;
  return (
    !clampText(config.title) &&
    !clampText(config.subtitle) &&
    (!config.theme || config.theme === 'classicGold') &&
    !config.headerImagePath &&
    !config.bannerImagePath
  );
}
