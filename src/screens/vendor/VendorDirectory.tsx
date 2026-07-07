import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import PageShell from '../PageShell';
import { isSupabaseConfigured } from '../../lib/supabase';
import { listRegisteredVendors } from '../../lib/publicVendors';
import type { RegisteredVendorSummary } from '../../lib/publicVendors';
import { COUNTRIES, regionOptions, formatLocation } from '../../lib/locations';
import { filterSelectStyle, filterLabelStyle } from '../shows/ShowDirectory';

const MUTED = '#9a8f7d';
const SERIF = "Georgia, 'Times New Roman', serif";

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
    <PageShell title="Vendor Directory">
      {!isSupabaseConfigured && (
        <p style={noteStyle}>
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

      {isSupabaseConfigured && vendors === null && <p style={noteStyle}>Loading vendors…</p>}

      {isSupabaseConfigured && vendors !== null && filtered.length === 0 && (
        <p style={noteStyle}>
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
                style={{
                  display: 'flex',
                  gap: 18,
                  alignItems: 'center',
                  padding: '16px 18px',
                  border: '1px solid #3a352c',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.025)',
                  textDecoration: 'none',
                  color: '#e8e0d0',
                }}
              >
                <div
                  style={{
                    width: 110,
                    height: 66,
                    flexShrink: 0,
                    borderRadius: 6,
                    border: '1px solid #4a4436',
                    background: '#0d0b09',
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
                        color: '#5c5546',
                      }}
                    >
                      {v.name.trim().charAt(0).toUpperCase() || '·'}
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 19, color: '#f0e6ce', marginBottom: 3 }}>{v.name}</div>
                  {location && (
                    <div style={{ fontSize: 13.5, color: '#b7ad98' }}>{location}</div>
                  )}
                  {areaServed && (
                    <div style={{ fontSize: 13, color: MUTED, fontStyle: 'italic', marginTop: 2 }}>
                      Serves: {areaServed}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: '#8a816d', marginTop: 4 }}>
                    {v.inventoryCount} item{v.inventoryCount === 1 ? '' : 's'}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

const noteStyle: React.CSSProperties = {
  fontSize: 17,
  lineHeight: 1.7,
  color: '#b7ad98',
  fontStyle: 'italic',
};
