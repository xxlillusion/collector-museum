import { MOCK_CARDS, MOCK_SETTINGS, MOCK_PLANS, MOCK_STATS } from '../mock';

// ARCHIVED PROTOTYPE — not wired into the app. Kept from the 2026-07 UI Lab
// round as a possible future direction ("Dashboard" style: persistent left
// sidebar nav, neutral dark grays, indigo accent, admin-app content panes).
// The hover classes (proto-lift / proto-nav-item / proto-row) came from the
// deleted UiPrototypes shell; re-add them if this is ever revived.

const ACCENT = '#6366f1';
const BG = '#0f1115';
const PANEL = '#16181d';
const BORDER = '#23262d';
const TEXT = '#e5e7eb';
const MUTED = '#8b909a';
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const NAV = [
  { icon: '▦', label: 'Collection', active: true },
  { icon: '⊞', label: 'Vendor View', active: false },
  { icon: '▭', label: 'Banner', active: false },
  { icon: '⚙', label: 'Environment', active: false },
];

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '13px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function SidebarDashboard() {
  return (
    <div style={{ display: 'flex', height: '100%', background: BG, color: TEXT, fontFamily: FONT }}>
      {/* Sidebar */}
      <aside style={{ width: '220px', flexShrink: 0, borderRight: `1px solid ${BORDER}`, padding: '20px 12px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '4px 12px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: ACCENT, display: 'grid', placeItems: 'center', fontSize: '15px' }}>🃏</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>Vendor Museum</div>
            <div style={{ fontSize: '11px', color: MUTED }}>Collector suite</div>
          </div>
        </div>
        {NAV.map((item) => (
          <div
            key={item.label}
            className="proto-nav-item"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px', borderRadius: '8px', fontSize: '13.5px', cursor: 'pointer',
              background: item.active ? 'rgba(99,102,241,0.14)' : 'transparent',
              color: item.active ? '#c7c9ff' : MUTED,
              fontWeight: item.active ? 600 : 400,
              marginBottom: '2px',
            }}
          >
            <span style={{ fontSize: '15px' }}>{item.icon}</span> {item.label}
          </div>
        ))}
        <div style={{ marginTop: 'auto', padding: '12px', fontSize: '11.5px', color: MUTED, borderTop: `1px solid ${BORDER}` }}>
          Everything stays in your browser — no account, no cloud.
        </div>
      </aside>

      {/* Main pane */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 36px 130px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>Collection</h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: MUTED }}>Manage the cards hanging in your gallery.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT, borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontFamily: FONT, cursor: 'pointer' }}>
              Walk card show
            </button>
            <button style={{ background: ACCENT, border: 'none', color: 'white', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}>
              Enter Museum →
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
          {MOCK_STATS.map((s) => (
            <div key={s.label} style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
              <div style={{ fontSize: '12px', color: MUTED, marginBottom: '6px' }}>{s.label}</div>
              <div style={{ fontSize: '22px', fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
        </div>

        <Panel title="Add cards">
          <div style={{ border: `1.5px dashed ${BORDER}`, borderRadius: '10px', padding: '28px', textAlign: 'center', cursor: 'pointer' }}>
            <div style={{ fontSize: '14px', marginBottom: '4px' }}>Drop card images here</div>
            <div style={{ fontSize: '12px', color: MUTED }}>or click to browse — PNG, JPG, WebP</div>
          </div>
        </Panel>

        <Panel title="Your cards · 9">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '12px' }}>
            {MOCK_CARDS.map((c) => (
              <div key={c.name}>
                <div style={{ aspectRatio: '2.5/3.5', borderRadius: '8px', background: c.gradient, border: `1px solid ${BORDER}` }} />
                <div style={{ fontSize: '11.5px', color: MUTED, marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
              </div>
            ))}
          </div>
        </Panel>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Panel title="Environment">
            {MOCK_SETTINGS.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BORDER}` }}>
                <div>
                  <div style={{ fontSize: '13.5px' }}>{s.label}</div>
                  <div style={{ fontSize: '11.5px', color: MUTED }}>{s.hint}</div>
                </div>
                {s.kind === 'toggle' ? (
                  <div style={{ width: '36px', height: '20px', borderRadius: '999px', background: s.value ? ACCENT : BORDER, position: 'relative', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: '2px', left: s.value ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white' }} />
                  </div>
                ) : (
                  <div style={{ width: '110px', height: '4px', borderRadius: '2px', background: BORDER, position: 'relative', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, width: `${(s.value as number) * 100}%`, background: ACCENT, borderRadius: '2px' }} />
                    <div style={{ position: 'absolute', top: '-5px', left: `calc(${(s.value as number) * 100}% - 7px)`, width: '14px', height: '14px', borderRadius: '50%', background: 'white' }} />
                  </div>
                )}
              </div>
            ))}
          </Panel>

          <Panel title="Saved floor plans">
            {MOCK_PLANS.map((p) => (
              <div key={p.name} className="proto-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 10px', borderRadius: '8px', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontSize: '13.5px' }}>{p.name}</div>
                  <div style={{ fontSize: '11.5px', color: MUTED }}>{p.detail}</div>
                </div>
                <span style={{ color: ACCENT, fontSize: '13px' }}>Load →</span>
              </div>
            ))}
            <div style={{ marginTop: '10px', border: `1.5px dashed ${BORDER}`, borderRadius: '8px', padding: '14px', textAlign: 'center', fontSize: '12.5px', color: MUTED, cursor: 'pointer' }}>
              + Upload a new floor plan
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
}
