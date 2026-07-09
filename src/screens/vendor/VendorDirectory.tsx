import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import SearchBox from '../../components/SearchBox';
import { isSupabaseConfigured } from '../../lib/supabase';
import { listRegisteredVendors } from '../../lib/publicVendors';
import type { RegisteredVendorSummary } from '../../lib/publicVendors';
import { COUNTRIES, regionOptions, formatLocation } from '../../lib/locations';
import { filterSelectStyle, filterLabelStyle } from '../shows/ShowDirectory';
import {
  GOLD, HAIRLINE, TEXT, MUTED, PANEL, SERIF, noteStyle,
} from '../../components/museumKit';

// Public directory of registered vendors (/vendors) — owned by the public
// browsing workstream (Stream C). Anon-safe: reads via lib/publicVendors.ts.
export default function VendorDirectory() {
  const [vendors, setVendors] = useState<RegisteredVendorSummary[] | null>(null);
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');

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
      {!isSupabaseConfigured && (
        <p style={{ ...noteStyle, fontSize: 16 }}>
          The vendor directory needs a configured backend — this deployment runs in
          guest-only mode.
        </p>
      )}

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
            <span style={filterLabelStyle}>COUNTRY</span>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setState('');
              }}
              style={filterSelectStyle}
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
              <span style={filterLabelStyle}>{country === 'CA' ? 'PROVINCE' : 'STATE'}</span>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                style={filterSelectStyle}
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
        <p style={{ ...noteStyle, fontSize: 16 }}>Loading vendors…</p>
      )}

      {isSupabaseConfigured && vendors !== null && filtered.length === 0 && (
        <p style={{ ...noteStyle, fontSize: 16 }}>
          {filtering
            ? 'No vendors in this area yet — try widening the search.'
            : 'No registered vendors yet.'}
        </p>
      )}

      {filtered.length > 0 && (
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
                  border: `1px solid ${HAIRLINE}`,
                  borderRadius: 4,
                  background: PANEL,
                  textDecoration: 'none',
                  color: TEXT,
                }}
              >
                <div
                  style={{
                    width: 110,
                    height: 66,
                    flexShrink: 0,
                    borderRadius: 2,
                    border: `1px solid ${HAIRLINE}`,
                    background: '#0d0b0a',
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
                        fontFamily: SERIF,
                        fontSize: 24,
                        color: GOLD,
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
                      fontFamily: SERIF,
                      fontSize: 18,
                      letterSpacing: '0.06em',
                      color: TEXT,
                      marginBottom: 4,
                    }}
                  >
                    {v.name}
                  </div>
                  {location && (
                    <div style={{ ...noteStyle, fontSize: 13.5, lineHeight: 1.55 }}>
                      {location}
                    </div>
                  )}
                  {areaServed && (
                    <div style={{ ...noteStyle, fontSize: 13, lineHeight: 1.55 }}>
                      Serves: {areaServed}
                    </div>
                  )}
                  <div style={{ fontSize: 11, letterSpacing: '0.14em', color: MUTED, marginTop: 6 }}>
                    {v.inventoryCount} ITEM{v.inventoryCount === 1 ? '' : 'S'}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: SERIF,
                    fontSize: 12,
                    letterSpacing: '0.18em',
                    color: GOLD,
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
