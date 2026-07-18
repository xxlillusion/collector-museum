import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useSearch } from 'wouter';
import PageShell from '../PageShell';
import SearchBox from '../../components/SearchBox';
import { isSupabaseConfigured } from '../../lib/supabase';
import { searchAll, SEARCH_MIN_CHARS, SEARCH_LIMITS } from '../../lib/publicSearch';
import type { SearchResults, SearchInventoryItem } from '../../lib/publicSearch';
import type { PublicShowSummary } from '../../lib/publicShows';
import type { RegisteredVendorSummary } from '../../lib/publicVendors';
import { formatShowDate } from '../shows/ShowDirectory';
import { formatLocation } from '../../lib/locations';
import { formatPrice } from '../../lib/price';
import { Section, useTheme } from '../../components/themeKit';
import type { Theme } from '../../components/themeKit';
import { LcdCursor, LcdDialog, lcdImg, lcdMenuBox, lcdMenuRow } from '../../components/lcdKit';

// /search?q=… — cross-entity search results (roadmap item 14): published
// shows by name, registered vendors by name, public inventory by caption.
// Handheld: each section is a MENU (rows invert on hover/focus with a ▶
// cursor), card thumbnails get the pixelated LCD treatment, SOLD becomes an
// inverted chip, and the empty state is a dialog box.

const rowStyle = (t: Theme): CSSProperties => ({
  display: 'flex',
  gap: 16,
  alignItems: 'center',
  padding: '14px 16px',
  border: `${t.borderWidth}px solid ${t.border}`,
  borderRadius: 4,
  background: t.panel,
  textDecoration: 'none',
  color: t.text,
});

const arrowStyle = (t: Theme): CSSProperties => ({
  fontFamily: t.fontMono,
  fontSize: 12,
  letterSpacing: '0.18em',
  color: t.accent,
  whiteSpace: 'nowrap',
});

/** Small-caps meta rows previously inherited the page sans — keep that under
 *  'refined', go mono elsewhere. */
const metaFont = (t: Theme): string | undefined =>
  t.id === 'refined' ? undefined : t.fontMono;

/** Handheld menu-row hover/focus handlers + inverted-row style. */
function useLcdRow(): {
  hot: boolean;
  hotProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
} {
  const [hot, setHot] = useState(false);
  return {
    hot,
    hotProps: {
      onMouseEnter: () => setHot(true),
      onMouseLeave: () => setHot(false),
      onFocus: () => setHot(true),
      onBlur: () => setHot(false),
    },
  };
}

function TruncatedNote({ limit }: { limit: number }) {
  const t = useTheme();
  const lcd = t.id === 'handheld';
  return (
    <p style={{ ...t.note, fontSize: lcd ? 9.5 : 13, marginTop: 10 }}>
      {lcd
        ? `SHOWING THE FIRST ${limit} — TRY A NARROWER NAME!`
        : `Showing the first ${limit} — refine your search.`}
    </p>
  );
}

function ShowRow({ show }: { show: PublicShowSummary }) {
  const t = useTheme();
  const { hot, hotProps } = useLcdRow();
  const location = formatLocation(show);
  if (t.id === 'handheld') {
    return (
      <Link
        href={`/show/${show.id}`}
        {...hotProps}
        style={{ ...lcdMenuRow(hot), gap: 10, textDecoration: 'none' }}
      >
        <LcdCursor active={hot} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              marginBottom: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {show.name}
          </div>
          <div style={{ fontSize: 9.5, fontWeight: 400, color: hot ? t.accentContrast : t.muted }}>
            {formatShowDate(show.showDate) ?? 'TBA'}
            {location ? ` · ${location}` : ''}
            {' · '}
            {show.boothCount} BOOTH{show.boothCount === 1 ? '' : 'S'}
          </div>
        </div>
      </Link>
    );
  }
  return (
    <Link href={`/show/${show.id}`} className="museum-row" style={rowStyle(t)}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: t.fontDisplay, fontSize: 18, letterSpacing: '0.06em', marginBottom: 4 }}>
          {show.name}
        </div>
        <div style={{ ...t.note, fontSize: 13.5, lineHeight: 1.55 }}>
          {formatShowDate(show.showDate) ?? 'Date to be announced'}
          {location ? ` · ${location}` : ''}
        </div>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: t.muted, marginTop: 5, fontFamily: metaFont(t) }}>
          {show.boothCount} BOOTH{show.boothCount === 1 ? '' : 'S'} ·{' '}
          {show.vendorCount} VENDOR{show.vendorCount === 1 ? '' : 'S'}
        </div>
      </div>
      <span style={arrowStyle(t)}>VIEW →</span>
    </Link>
  );
}

function VendorRow({ vendor }: { vendor: RegisteredVendorSummary }) {
  const t = useTheme();
  const { hot, hotProps } = useLcdRow();
  const location = formatLocation({ country: vendor.country, state: vendor.state });
  if (t.id === 'handheld') {
    return (
      <Link
        href={`/vendor/${vendor.id}`}
        {...hotProps}
        style={{ ...lcdMenuRow(hot), gap: 10, textDecoration: 'none' }}
      >
        <LcdCursor active={hot} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              marginBottom: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {vendor.name}
          </div>
          <div style={{ fontSize: 9.5, fontWeight: 400, color: hot ? t.accentContrast : t.muted }}>
            {location ? `${location} · ` : ''}
            {vendor.inventoryCount} ITEM{vendor.inventoryCount === 1 ? '' : 'S'}
          </div>
        </div>
      </Link>
    );
  }
  return (
    <Link href={`/vendor/${vendor.id}`} className="museum-row" style={rowStyle(t)}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: t.fontDisplay, fontSize: 18, letterSpacing: '0.06em', marginBottom: 4 }}>
          {vendor.name}
        </div>
        {location && (
          <div style={{ ...t.note, fontSize: 13.5, lineHeight: 1.55 }}>{location}</div>
        )}
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: t.muted, marginTop: 5, fontFamily: metaFont(t) }}>
          {vendor.inventoryCount} ITEM{vendor.inventoryCount === 1 ? '' : 'S'}
        </div>
      </div>
      <span style={arrowStyle(t)}>VISIT →</span>
    </Link>
  );
}

function CardRow({ item }: { item: SearchInventoryItem }) {
  const t = useTheme();
  const { hot, hotProps } = useLcdRow();
  const sold = item.status === 'sold';
  const condition = item.condition.trim();
  if (t.id === 'handheld') {
    return (
      <Link
        href={`/vendor/${item.vendorId}`}
        {...hotProps}
        style={{ ...lcdMenuRow(hot), gap: 10, textDecoration: 'none' }}
      >
        <LcdCursor active={hot} />
        <div
          style={{
            width: 40,
            aspectRatio: `${item.aspect > 0 ? item.aspect : 0.714}`,
            flexShrink: 0,
            border: `2px solid ${hot ? t.accentContrast : t.text}`,
            background: t.bg,
            padding: 2,
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          <img
            src={item.imageUrl}
            alt={item.caption || 'inventory item'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...lcdImg }}
          />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              marginBottom: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.caption || 'Untitled'}
          </div>
          <div style={{ fontSize: 9.5, fontWeight: 400, color: hot ? t.accentContrast : t.muted }}>
            {item.price !== undefined && (
              <span
                style={{
                  marginRight: 8,
                  textDecoration: sold ? 'line-through' : 'none',
                  ...(sold ? {} : { color: hot ? t.accentContrast : t.text, fontWeight: 700 }),
                }}
              >
                {formatPrice(item.price)}
              </span>
            )}
            {sold && (
              <span
                style={{
                  background: hot ? t.accentContrast : t.accent,
                  color: hot ? t.accent : t.accentContrast,
                  fontWeight: 700,
                  fontSize: 8.5,
                  letterSpacing: '0.06em',
                  padding: '0 5px',
                  marginRight: 8,
                }}
              >
                SOLD!
              </span>
            )}
            {condition && <span style={{ marginRight: 8 }}>{condition}</span>}
            <span>{item.vendorName}</span>
          </div>
        </div>
      </Link>
    );
  }
  return (
    <Link href={`/vendor/${item.vendorId}`} className="museum-row" style={rowStyle(t)}>
      <div
        style={{
          width: 44,
          aspectRatio: `${item.aspect > 0 ? item.aspect : 0.714}`,
          flexShrink: 0,
          borderRadius: 2,
          border: `${t.borderWidth}px solid ${t.border}`,
          background: t.surface,
          overflow: 'hidden',
        }}
      >
        <img
          src={item.imageUrl}
          alt={item.caption || 'inventory item'}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: t.fontDisplay, fontSize: 16, letterSpacing: '0.04em', marginBottom: 3 }}>
          {item.caption || 'Untitled'}
        </div>
        <div style={{ fontSize: 12, color: t.muted, letterSpacing: '0.04em', fontFamily: metaFont(t) }}>
          {item.price !== undefined && (
            <span
              style={{
                color: sold ? t.muted : t.accent,
                textDecoration: sold ? 'line-through' : 'none',
                marginRight: 8,
              }}
            >
              {formatPrice(item.price)}
            </span>
          )}
          {sold && (
            <span
              style={t.id === 'refined'
                ? {
                    fontSize: 10,
                    letterSpacing: '0.2em',
                    color: t.muted,
                    border: `1px solid ${t.border}`,
                    borderRadius: 2,
                    padding: '1px 6px',
                    marginRight: 8,
                  }
                : { ...t.chip, marginRight: 8 }}
            >
              SOLD
            </span>
          )}
          {condition && <span style={{ marginRight: 8 }}>{condition}</span>}
          <span style={{ fontStyle: t.id === 'refined' ? 'italic' : 'normal', fontFamily: t.fontMono }}>
            {item.vendorName}
          </span>
        </div>
      </div>
      <span style={arrowStyle(t)}>VISIT →</span>
    </Link>
  );
}

export default function SearchScreen() {
  const t = useTheme();
  const lcd = t.id === 'handheld';
  // Reactive ?q=… — wouter ^3.10 exports useSearch (the query string sans '?').
  const searchString = useSearch();
  const q = (new URLSearchParams(searchString).get('q') ?? '').trim();
  const longEnough = q.length >= SEARCH_MIN_CHARS;

  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || q.length < SEARCH_MIN_CHARS) {
      setResults(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setResults(null);
    searchAll(q).then((r) => {
      if (!alive) return;
      setResults(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [q]);

  const empty =
    results !== null &&
    results.shows.length === 0 &&
    results.vendors.length === 0 &&
    results.items.length === 0;

  const list: CSSProperties = lcd
    ? { display: 'flex', flexDirection: 'column', ...lcdMenuBox }
    : { display: 'flex', flexDirection: 'column', gap: 12 };

  return (
    <PageShell title="Search" eyebrow="THE CATALOGUE">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 36 }}>
        {/* Keyed by q so the box re-seeds when the URL changes. */}
        <SearchBox key={q} initialQuery={q} autoFocus />
      </div>

      {!isSupabaseConfigured && (
        <p style={{ ...t.note, fontSize: lcd ? 11 : 16 }}>
          Search needs a configured backend — this deployment runs in guest-only mode.
        </p>
      )}

      {isSupabaseConfigured && !longEnough && (
        <p style={{ ...t.note, fontSize: lcd ? 11 : 16 }}>
          Type at least {SEARCH_MIN_CHARS} characters to search shows, vendors and cards.
        </p>
      )}

      {isSupabaseConfigured && longEnough && loading && (
        <p style={{ ...t.note, fontSize: lcd ? 11 : 16 }}>Searching the catalogue…</p>
      )}

      {isSupabaseConfigured && empty && (lcd ? (
        <div style={{ maxWidth: 460, margin: '0 auto' }}>
          <LcdDialog cursor>NO RESULTS FOUND FOR “{q}”! TRY ANOTHER NAME?</LcdDialog>
        </div>
      ) : (
        <p style={{ ...t.note, fontSize: 16 }}>
          Nothing in the catalogue matches “{q}”.
        </p>
      ))}

      {results !== null && results.shows.length > 0 && (
        <Section title="SHOWS">
          <div style={list}>
            {results.shows.map((s) => (
              <ShowRow key={s.id} show={s} />
            ))}
          </div>
          {results.truncated.shows && <TruncatedNote limit={SEARCH_LIMITS.shows} />}
        </Section>
      )}

      {results !== null && results.vendors.length > 0 && (
        <Section title="VENDORS">
          <div style={list}>
            {results.vendors.map((v) => (
              <VendorRow key={v.id} vendor={v} />
            ))}
          </div>
          {results.truncated.vendors && <TruncatedNote limit={SEARCH_LIMITS.vendors} />}
        </Section>
      )}

      {results !== null && results.items.length > 0 && (
        <Section title="CARDS">
          <div style={list}>
            {results.items.map((it) => (
              <CardRow key={it.id} item={it} />
            ))}
          </div>
          {results.truncated.items && <TruncatedNote limit={SEARCH_LIMITS.items} />}
        </Section>
      )}
    </PageShell>
  );
}
