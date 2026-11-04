/* global React, GG2, PhoneShell */
// V2.5 Advanced Intelligence — gap (inflation drill-down)
const { SF, ListGroup, ListRow } = window.GG2;
const { Phone, NavBar, TabBar } = window.PhoneShell;

// AI-04 · Personal inflation drill-down (item-level contributors)
function InflationDetail() {
  const items = [
    ['Eggs · dozen', 28, 4.49, 5.74, 'var(--sys-red)', 8],
    ['Olive oil · 1L', 18, 12.99, 15.32, 'var(--sys-red)', 4],
    ['Coffee · 12oz', 12, 14.99, 16.79, 'var(--sys-red)', 6],
    ['Butter · 1 lb', 9, 5.49, 5.99, 'var(--sys-orange)', 7],
    ['Bread · sourdough', 6, 5.49, 5.82, 'var(--sys-orange)', 12],
    ['Avocado', -3, 1.49, 1.45, 'var(--sys-green)', 24],
    ['Bananas', -8, 2.49, 2.29, 'var(--sys-green)', 18],
  ];
  const max = Math.max(...items.map(i => Math.abs(i[1])));
  return (
    <Phone label="AI-04 · Inflation detail">
      <NavBar left="Insights" title="Personal inflation" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>Your inflation · 12 months</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <span style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 32, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--sys-red)' }}>+6.2%</span>
            <span style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>vs CPI 4.1%</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 6, lineHeight: 1.4 }}>You're paying $24/mo more than a year ago for the same basket.</div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {[['All items', true], ['Drivers', false], ['Bargains', false]].map(([t, a]) => (
            <div key={t} style={{ padding: '5px 12px', borderRadius: 999, background: a ? 'var(--gg-tint-bg)' : 'var(--ios-fill-3)', color: a ? 'var(--gg-tint)' : 'var(--ios-label)', fontSize: 13, fontWeight: a ? 600 : 400 }}>{t}</div>
          ))}
        </div>

        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {items.map(([n, pct, was, now, c, freq], i) => (
            <div key={n} style={{ padding: '11px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{n}</div>
                  <div style={{ fontSize: 11, color: 'var(--ios-label-2)', fontVariantNumeric: 'tabular-nums' }}>${was.toFixed(2)} → ${now.toFixed(2)} · {freq} purchases</div>
                </div>
                <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 14, fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{pct > 0 ? '+' : ''}{pct}%</div>
              </div>
              <div style={{ height: 4, background: 'var(--ios-fill-3)', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--ios-fill-1)' }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, background: c, width: (Math.abs(pct) / max) * 50 + '%', left: pct > 0 ? '50%' : 'auto', right: pct < 0 ? '50%' : 'auto' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

function Row({ children }) { return <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>{children}</div>; }

window.AIGap = {
  SectionAIGap: () => <Row><InflationDetail /></Row>,
};
