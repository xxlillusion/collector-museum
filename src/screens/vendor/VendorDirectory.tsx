import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import SearchBox from '../../components/SearchBox';
import { isSupabaseConfigured } from '../../lib/supabase';
import { listRegisteredVendors } from '../../lib/publicVendors';
import type { RegisteredVendorSummary } from '../../lib/publicVendors';
import { COUNTRIES, regionOptions, formatLocation } from '../../lib/locations';
import { filterSelectStyle, filterLabelStyle } from '../shows/ShowDirectory';
import { useTheme } from '../../components/themeKit';
import { LCD, LcdCursor, LcdDialog, lcdMenuBox, lcdMenuRow } from '../../components/lcdKit';

// Public directory of registered vendors (/vendors) — owned by the public
// browsing workstream (Stream C). Anon-safe: reads via lib/publicVendors.ts.

// Handheld-only directory row — the LCD menu idiom: hover/focus inverts the
// whole row (ink bg, screen text) with a leading ▶; never a hue shift.
function LcdVendorRow({ vendor, last }: { vendor: RegisteredVendorSummary; last: boolean }) {
  const [active, setActive] = useState(false);
  const location = formatLocation({ country: vendor.country, state: vendor.state });
  const areaServed = vendor.areaServed.trim();
  const meta = [
    location,
    areaServed ? `SERVES ${areaServed}` : null,
    `${vendor.inventoryCount} ITEM${vendor.inventoryCount === 1 ? '' : 'S'}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      href={`/vendor/${vendor.id}`}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{
        ...lcdMenuRow(active),
        textDecoration: 'none',
        ...(last ? { borderBottom: 'none' } : {}),
      }}
    >
      <LcdCursor active={active} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {vendor.name}
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 2,
            fontSize: 9.5,
            fontWeight: 400,
            letterSpacing: '0.06em',
            color: active ? LCD.screen : LCD.muted,
          }}
        >
          {meta}
        </span>
      </span>
    </Link>
  );
}

export default function VendorDirectory() {
  const [vendors, setVendors] = useState<RegisteredVendorSummary[] | null>(null);
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const t = useTheme();
  const lcd = t.id === 'handheld';

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setVendors([]);
      return;
    }
    let alive = true;
    listRegisteredVendors().then((v) => {
      if (alive) setVendors(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const regions = regionOptions(country || null);
  // Client-side filter — the registered-vendor list is small; no refetch needed.
  const filtered = (vendors ?? []).filter(
    (v) => (!country || v.country === country) && (!state || v.state === state),
  );
  const filtering = Boolean(country || state);

  return (
    <PageShell title="Vendor Directory" eyebrow="REGISTERED VENDORS">
      {!isSupabaseConfigured &&
        (lcd ? (
          <LcdDialog cursor>
            ! NO LINK CABLE! THE VENDOR DIRECTORY NEEDS A CLOUD CONNECTION — THIS
            MACHINE RUNS IN GUEST MODE.
          </LcdDialog>
        ) : (
          <p style={{ ...t.note, fontSize: 16 }}>
            The vendor directory needs a configured backend — this deployment runs in
            guest-only mode.
          </p>
        ))}

      {isSupabaseConfigured && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 18,
            marginBottom: 26,
          }}
        >
          <SearchBox width={280} />
          <div>
            <span style={filterLabelStyle(t)}>COUNTRY</span>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setState('');
              }}
              style={filterSelectStyle(t)}
            >
              <option value="">All countries</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {regions.length > 0 && (
            <div>
              <span style={filterLabelStyle(t)}>{country === 'CA' ? 'PROVINCE' : 'STATE'}</span>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                style={filterSelectStyle(t)}
              >
                <option value="">All</option>
                {regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {isSupabaseConfigured && vendors === null && (
        <p style={{ ...t.note, fontSize: lcd ? 11 : 16 }}>
          {lcd ? 'LOOKING FOR VENDORS…' : 'Loading vendors…'}
        </p>
      )}

      {isSupabaseConfigured &&
        vendors !== null &&
        filtered.length === 0 &&
        (lcd ? (
          <LcdDialog
            cursor={!filtering}
            choices={
              filtering
                ? [
                    {
                      label: 'SHOW ALL AREAS',
                      primary: true,
                      onClick: () => {
                        setCountry('');
                        setState('');
                      },
                    },
                  ]
                : undefined
            }
          >
            {filtering
              ? 'NO VENDORS IN THIS AREA YET!'
              : 'NO VENDORS HAVE SET UP SHOP YET! CHECK BACK SOON.'}
          </LcdDialog>
        ) : (
          <p style={{ ...t.note, fontSize: 16 }}>
            {filtering
              ? 'No vendors in this area yet — try widening the search.'
              : 'No registered vendors yet.'}
          </p>
        ))}

      {filtered.length > 0 && lcd && (
        <div style={lcdMenuBox}>
          {filtered.map((v, i) => (
            <LcdVendorRow key={v.id} vendor={v} last={i === filtered.length - 1} />
          ))}
        </div>
      )}

      {filtered.length > 0 && !lcd && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map((v) => {
            const location = formatLocation({ country: v.country, state: v.state });
            const areaServed = v.areaServed.trim();
            return (
              <Link
                key={v.id}
                href={`/vendor/${v.id}`}
                className="museum-row"
                style={{
                  display: 'flex',
                  gap: 20,
                  alignItems: 'center',
                  padding: '16px 18px',
                  border: `${t.borderWidth}px solid ${t.border}`,
                  borderRadius: 4,
                  background: t.panel,
                  textDecoration: 'none',
                  color: t.text,
                }}
              >
                <div
                  style={{
                    width: 110,
                    height: 66,
                    flexShrink: 0,
                    borderRadius: 2,
                    border: `${t.borderWidth}px solid ${t.border}`,
                    background: t.surface,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {v.bannerUrl ? (
                    <img
                      src={v.bannerUrl}
                      alt={`${v.name} banner`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span
                      style={{
                        fontFamily: t.fontDisplay,
                        fontSize: 24,
                        color: t.accent,
                        opacity: 0.55,
                      }}
                    >
                      {v.name.trim().charAt(0).toUpperCase() || '·'}
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontFamily: t.fontDisplay,
                      fontSize: 18,
                      letterSpacing: '0.06em',
                      color: t.text,
                      marginBottom: 4,
                    }}
                  >
                    {v.name}
                  </div>
                  {location && (
                    <div style={{ ...t.note, fontSize: 13.5, lineHeight: 1.55 }}>
                      {location}
                    </div>
                  )}
                  {areaServed && (
                    <div style={{ ...t.note, fontSize: 13, lineHeight: 1.55 }}>
                      Serves: {areaServed}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: '0.14em',
                      color: t.muted,
                      marginTop: 6,
                      fontFamily: t.id === 'refined' ? undefined : t.fontMono,
                    }}
                  >
                    {v.inventoryCount} ITEM{v.inventoryCount === 1 ? '' : 'S'}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: t.fontMono,
                    fontSize: 12,
                    letterSpacing: '0.18em',
                    color: t.accent,
                    whiteSpace: 'nowrap',
                  }}
                >
                  VISIT →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
