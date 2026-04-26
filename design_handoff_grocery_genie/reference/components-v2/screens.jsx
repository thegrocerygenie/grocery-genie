/* global React, GG2 */
const { Sheet2, Lbl, SF, ListGroup, ListRow } = window.GG2;
const { BudgetRing } = window;

function ScreensV2() {
  return (
    <Sheet2 pad={32} bg="#E5E5EA">
      <Lbl hint="Stock iOS · Dynamic Type · materials · system tab bar">Screens · v2</Lbl>
      <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
        <Phone><Dashboard /></Phone>
        <Phone><Scan /></Phone>
        <Phone><Review /></Phone>
      </div>
    </Sheet2>
  );
}

function Phone({ children }) {
  return (
    <div style={{ width: 300, height: 620, borderRadius: 44, background: '#000', padding: 6, boxShadow: '0 12px 32px rgba(0,0,0,0.18)' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 38, background: 'var(--ios-bg)', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 22px 4px', fontSize: 13, fontWeight: 600, color: 'var(--ios-label)' }}>
          <span>9:41</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>●●●●</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '4px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: 'var(--font-sf)', fontSize: 28, fontWeight: 700, letterSpacing: '0.36px' }}>Budget</div>
        <div style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--ios-fill-3)', display: 'grid', placeItems: 'center' }}><SF.gear size={16} /></div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'auto' }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
          <BudgetRing size={120} label="$157" sub="left · 11d" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>April · day 19</div>
            <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: 22, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>$242 / $400</div>
            <div style={{ fontSize: 12, color: 'var(--gg-tint)', marginTop: 2 }}>On pace · 5% under</div>
          </div>
        </div>

        <div style={{ fontSize: 13, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 16px 4px 4px' }}>By Category</div>

        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {[['Groceries', 'var(--sys-green)', SF.cart, '$142', 82], ['Beverages', 'var(--sys-indigo)', SF.doc, '$33', 110], ['Household', 'var(--sys-blue)', SF.doc, '$27', 54]].map(([n, c, I, $, p], i) => (
            <div key={n} style={{ padding: '11px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: c, color: '#fff', display: 'grid', placeItems: 'center' }}><I size={14} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{n}</div>
                <div style={{ height: 3, background: 'var(--ios-fill-3)', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ width: Math.min(p, 100) + '%', height: '100%', background: p > 100 ? 'var(--sys-red)' : c }} />
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 600, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{$}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 14, left: 12, right: 12, background: 'var(--mat-chrome)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', borderRadius: 999, padding: 6, display: 'flex', justifyContent: 'space-around', boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)' }}>
        {[['Budget', SF.cart, true], ['Scan', SF.viewfinder, false], ['History', SF.clock, false]].map(([t, I, a]) => (
          <div key={t} style={{ padding: '8px 14px', borderRadius: 999, background: a ? 'var(--gg-tint-bg)' : 'transparent', display: 'flex', alignItems: 'center', gap: 6, color: a ? 'var(--gg-tint)' : 'var(--ios-label-2)' }}>
            <I size={16} /><span style={{ fontSize: 12, fontWeight: 600 }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Scan() {
  return (
    <div style={{ flex: 1, background: '#0a0a0a', position: 'relative', overflow: 'hidden' }}>
      {/* receipt */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '64%', height: '70%', background: '#FBF8F2', borderRadius: 4, padding: 12, transform: 'rotate(-2deg)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', color: '#000' }}>TRADER JOE'S</div>
          {Array(8).fill(0).map((_, i) => (
            <div key={i} style={{ height: 3, background: 'rgba(0,0,0,0.15)', width: [80, 65, 90, 75, 85, 60, 88, 70][i] + '%' }} />
          ))}
        </div>
      </div>
      {/* VisionKit corner brackets — white, not yellow */}
      {[['tl', 14, 14], ['tr', 14, 'r'], ['bl', 'b', 14], ['br', 'b', 'r']].map(([k, y, x]) => (
        <div key={k} style={{
          position: 'absolute',
          top: y === 'b' ? 'auto' : y, bottom: y === 'b' ? 80 : 'auto',
          left: x === 'r' ? 'auto' : x, right: x === 'r' ? 14 : 'auto',
          width: 24, height: 24,
          borderTop: k[0] === 't' ? '2px solid #fff' : 'none',
          borderBottom: k[0] === 'b' ? '2px solid #fff' : 'none',
          borderLeft: k[1] === 'l' ? '2px solid #fff' : 'none',
          borderRight: k[1] === 'r' ? '2px solid #fff' : 'none',
        }} />
      ))}
      {/* glass status pill */}
      <div style={{ position: 'absolute', top: 44, left: '50%', transform: 'translateX(-50%)' }}>
        <div style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '7px 14px', borderRadius: 999, color: '#fff', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          Receipt detected
        </div>
      </div>
      {/* bottom controls */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#fff', fontSize: 15 }}>Cancel</span>
        <div style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid #fff', padding: 4 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff' }} />
        </div>
        <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>Auto</span>
      </div>
    </div>
  );
}

function Review() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '4px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, color: 'var(--gg-tint)' }}>Cancel</span>
        <span style={{ fontSize: 17, fontWeight: 600 }}>Review</span>
        <span style={{ fontSize: 15, color: 'var(--gg-tint)', fontWeight: 600 }}>Save</span>
      </div>

      <div style={{ flex: 1, padding: '0 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup>
          <ListRow title="Store" value="Trader Joe's" accessory={<SF.chevron />} />
          <ListRow title="Date" value="Apr 19, 2026" accessory={<SF.chevron />} />
          <ListRow title="Total" value="$58.42" />
          <ListRow title="Category" value="Groceries" accessory={<SF.chevron />} />
        </ListGroup>

        <div style={{ fontSize: 13, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 16px' }}>Items · 12</div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, overflow: 'hidden' }}>
          {[['Bananas', '2.49', null], ['Greek yogurt', '4.99', null], ['Olive oil', '—', 'low'], ['Sourdough', '5.50', null], ['Avocados', '6.00', null]].map(([n, p, low], i) => (
            <div key={n} style={{ padding: '11px 16px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15 }}>{n}</span>
              <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: low ? 'var(--sys-orange)' : 'var(--ios-label)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {low && <span style={{ fontSize: 11 }}>verify</span>}
                ${p}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.ScreensV2 = ScreensV2;
