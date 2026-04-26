/* global React, GG2 */
const { Sheet2, Lbl, SF } = window.GG2;

// Apple-style ring — same physics as Activity rings
function BudgetRing({ size = 200, pct = 61, label = '$157.92', sub = 'remaining' }) {
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(pct, 100) / 100);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--ios-fill-3)" strokeWidth="14" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--gg-tint)" strokeWidth="14" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: size > 180 ? 32 : 22, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--ios-label)' }}>{label}</div>
        <div style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>{sub}</div>
      </div>
    </div>
  );
}

function PatternsV2() {
  return (
    <Sheet2 pad={36} bg="var(--ios-bg)">
      <Lbl hint="Activity-style ring · Wallet-style rows · VisionKit scan">Domain patterns</Lbl>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24 }}>
        {/* Budget — ring replaces v1 horizontal bar */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-label-2)', marginBottom: 10 }}>BUDGET RING · April · day 19</div>
          <div style={{ background: 'var(--ios-bg-2)', borderRadius: 16, padding: 24, display: 'flex', alignItems: 'center', gap: 24 }}>
            <BudgetRing />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
              <Stat label="Spent" value="$242.08" />
              <Stat label="Pace" value="66%" hint="Day 19 of 30" />
              <Stat label="Days left" value="11" />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 10, lineHeight: 1.5 }}>
            Same ring rendered on Lock Screen widget, Dynamic Island, and Apple Watch — one signature shape across the system.
          </div>
        </div>

        {/* Receipt rows — Wallet style */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-label-2)', marginBottom: 10 }}>RECEIPT ROWS · Wallet-style category circles</div>
          <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, overflow: 'hidden' }}>
            {[
              ['Trader Joe\'s', 'Apr 19 · 12 items', '58.42', 'var(--sys-green)', SF.cart],
              ['Safeway', 'Apr 16 · 8 items', '42.11', 'var(--sys-green)', SF.cart],
              ['CVS', 'Apr 15 · Pending sync', '14.80', 'var(--sys-pink)', SF.doc],
              ['Whole Foods', 'Apr 12 · 22 items', '126.75', 'var(--sys-green)', SF.cart],
            ].map(([store, sub, total, color, I], i) => (
              <div key={store} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: color, color: '#fff', display: 'grid', placeItems: 'center' }}>
                  <I size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ios-label)' }}>{store}</div>
                  <div style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>{sub}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 600, fontSize: 17, fontVariantNumeric: 'tabular-nums', color: 'var(--ios-label)' }}>${total}</div>
                <div style={{ color: 'var(--ios-label-3)', marginLeft: 4 }}><SF.chevron /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Activity / Dynamic Island */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-label-2)', marginBottom: 10 }}>LIVE ACTIVITY · Dynamic Island during OCR</div>
        <div style={{ background: '#000', borderRadius: 22, padding: '40px 32px', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          {/* compact */}
          <div style={{ background: '#000', border: '1px solid #1a1a1a', borderRadius: 999, padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: 10, color: '#fff', fontSize: 13, minWidth: 280 }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--gg-tint)', display: 'grid', placeItems: 'center' }}><SF.viewfinder size={11} /></div>
            <span style={{ flex: 1 }}>Reading Trader Joe's…</span>
            <Spinner />
          </div>
          {/* expanded */}
          <div style={{ background: '#0a0a0a', borderRadius: 28, padding: 16, color: '#fff', minWidth: 320 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Scanning · 12 items</div>
              <div style={{ fontSize: 13, color: 'var(--sys-mint)' }}>Trader Joe's</div>
            </div>
            <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 32, fontWeight: 700, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>$58.42</div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 999, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: '72%', height: '100%', background: 'var(--gg-tint)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Widgets */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-label-2)', marginBottom: 10 }}>WIDGETS · home, lock, watch</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Home small */}
          <WidgetTile w={158} h={158}>
            <BudgetRing size={120} label="$157" sub="left · 11d" />
          </WidgetTile>
          {/* Home medium */}
          <WidgetTile w={338} h={158}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', height: '100%' }}>
              <BudgetRing size={120} label="$157" sub="left" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>April · day 19</div>
                <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: 22, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>61%</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {[['Groceries', '$142'], ['Beverages', '$33'], ['Household', '$27']].map(([n, $]) => (
                    <div key={n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--ios-label-2)' }}>{n}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{$}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </WidgetTile>
          {/* Accessory rectangular (Lock Screen) */}
          <WidgetTile w={172} h={76} dark>
            <div style={{ color: '#fff', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>April · 11 left</div>
              <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>$157.92</div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.25)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: '61%', height: '100%', background: '#fff' }} />
              </div>
            </div>
          </WidgetTile>
          {/* Watch complication */}
          <WidgetTile w={88} h={88} round>
            <BudgetRing size={76} label="$158" sub="" />
          </WidgetTile>
        </div>
      </div>
    </Sheet2>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: 22, fontVariantNumeric: 'tabular-nums', color: 'var(--ios-label)' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--ios-label-3)' }}>{hint}</div>}
    </div>
  );
}

function WidgetTile({ children, w, h, dark, round }) {
  return (
    <div style={{ width: w, height: h, background: dark ? '#1c1c1e' : 'var(--ios-bg-2)', borderRadius: round ? '50%' : 22, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: 'gg-spin 1s linear infinite' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <style>{`@keyframes gg-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

window.PatternsV2 = PatternsV2;
window.BudgetRing = BudgetRing;
