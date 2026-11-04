/* global React, GG, GGCtl */
const { Sheet, ArtLabel, Icon, GGMark } = window.GG;
const { Chip } = window.GGCtl;

// iPhone mockup of 3 key screens to show the system in situ.
function ScreensBoard() {
  return (
    <Sheet pad={36} bg="var(--gg-cream-100)">
      <ArtLabel hint="System applied · Dashboard · Scan · Review">Screens in context</ArtLabel>
      <div style={{ display: 'flex', gap: 28, justifyContent: 'center', marginTop: 8 }}>
        <Phone><Dashboard /></Phone>
        <Phone><ScanScreen /></Phone>
        <Phone><ReviewScreen /></Phone>
      </div>
    </Sheet>
  );
}

function Phone({ children }) {
  return (
    <div style={{ width: 300, height: 620, borderRadius: 44, background: 'var(--gg-ink-900)', padding: 8, boxShadow: 'var(--sh-modal)' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 36, background: 'var(--gg-cream-50)', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* status bar */}
        <div style={{ height: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 22px 4px', fontSize: 12, fontWeight: 600, color: 'var(--gg-ink-900)' }}>
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px 16px 0', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--gg-ink-900)', letterSpacing: '-0.02em' }}>Budget Overview</div>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--gg-paper)', display: 'grid', placeItems: 'center', color: 'var(--gg-ink-700)' }}>
          <Icon.Bell size={18} />
        </div>
      </div>

      <div style={{ marginTop: 14, background: 'var(--gg-paper)', borderRadius: 18, padding: 16, boxShadow: 'var(--sh-card)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--gg-ink-500)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>April · day 19 of 30</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, lineHeight: 1, letterSpacing: '-0.03em', color: 'var(--gg-ink-900)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
          $157<span style={{ fontSize: 22, color: 'var(--gg-ink-500)' }}>.92</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--gg-ink-500)', marginTop: 2 }}>remaining · 11 days left</div>
        <div style={{ marginTop: 12, height: 8, background: 'var(--gg-cream-100)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: '61%', height: '100%', background: 'linear-gradient(90deg, var(--gg-leaf-500), var(--gg-leaf-700))' }} />
        </div>
      </div>

      <div style={{ marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--gg-ink-500)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>By Category</div>

      <div style={{ marginTop: 8, background: 'var(--gg-paper)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[['Groceries', 'var(--cat-groceries)', 82, 142], ['Household', 'var(--cat-household)', 54, 27], ['Beverages', 'var(--cat-beverages)', 110, 33]].map(([n, c, p, $]) => (
          <div key={n}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>{n}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--gg-ink-500)' }}>${$}</span>
            </div>
            <div style={{ height: 4, background: 'var(--gg-cream-100)', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}>
              <div style={{ width: Math.min(p, 100) + '%', height: '100%', background: p > 100 ? 'var(--gg-danger-500)' : c }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* tab bar */}
      <div style={{ margin: '12px -4px 10px', background: 'var(--gg-paper)', borderRadius: 20, boxShadow: 'var(--sh-card)', padding: '8px 14px', display: 'flex', justifyContent: 'space-between' }}>
        {[['Dashboard', Icon.Chart, true], ['Scan', Icon.Camera, false], ['History', Icon.Clock, false]].map(([t, I, a]) => (
          <div key={t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: a ? 'var(--gg-leaf-700)' : 'var(--gg-ink-500)', minWidth: 60 }}>
            <I size={20} />
            <span style={{ fontSize: 9, fontWeight: 600 }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScanScreen() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px 16px 0', overflow: 'hidden' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gg-ink-900)', letterSpacing: '-0.02em' }}>Scan Receipt</div>

      <div style={{ marginTop: 12, flex: 1, borderRadius: 20, background: 'var(--gg-ink-900)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '60%', height: '72%', background: 'var(--gg-cream-50)', borderRadius: 6, padding: 10, transform: 'rotate(-3deg)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, textAlign: 'center' }}>SAFEWAY</div>
            {Array(7).fill(0).map((_, i) => (
              <div key={i} style={{ height: 3, background: 'var(--gg-ink-100)', width: [80, 60, 90, 75, 55, 85, 70][i] + '%' }} />
            ))}
          </div>
        </div>
        {[['tl', 12, 12], ['tr', 12, 'r'], ['bl', 'b', 12], ['br', 'b', 'r']].map(([k, y, x]) => (
          <div key={k} style={{
            position: 'absolute',
            top: y === 'b' ? 'auto' : y, bottom: y === 'b' ? 12 : 'auto',
            left: x === 'r' ? 'auto' : x, right: x === 'r' ? 12 : 'auto',
            width: 22, height: 22,
            borderTop: k[0] === 't' ? '2px solid var(--gg-saffron-500)' : 'none',
            borderBottom: k[0] === 'b' ? '2px solid var(--gg-saffron-500)' : 'none',
            borderLeft: k[1] === 'l' ? '2px solid var(--gg-saffron-500)' : 'none',
            borderRight: k[1] === 'r' ? '2px solid var(--gg-saffron-500)' : 'none',
          }} />
        ))}
        <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: 'rgba(23,26,20,0.6)', backdropFilter: 'blur(8px)', padding: '6px 12px', borderRadius: 999, color: 'var(--gg-cream-50)', fontSize: 11 }}>
            Hold steady
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0 12px' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid var(--gg-ink-900)', padding: 4 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--gg-leaf-700)' }} />
        </div>
      </div>
    </div>
  );
}

function ReviewScreen() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px 16px 0', overflow: 'hidden' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gg-ink-900)', letterSpacing: '-0.02em' }}>Review Receipt</div>

      <div style={{ marginTop: 12, background: 'var(--gg-paper)', borderRadius: 14, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--gg-ink-500)' }}>Store</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Trader Joe's</span>
        </div>
        <div style={{ height: 1, background: 'var(--gg-ink-100)', margin: '10px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--gg-ink-500)' }}>Date</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Apr 19, 2026</span>
        </div>
        <div style={{ height: 1, background: 'var(--gg-ink-100)', margin: '10px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, color: 'var(--gg-ink-500)' }}>Total</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>$58.42</span>
        </div>
      </div>

      <div style={{ marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--gg-ink-500)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Items · 12</div>
      <div style={{ marginTop: 8, background: 'var(--gg-paper)', borderRadius: 14, padding: '4px 14px', flex: 1, overflow: 'hidden' }}>
        {[['Bananas', '2.49', null], ['Greek yogurt', '4.99', null], ['Olive oil', 'abc', 'low'], ['Sourdough', '5.50', null], ['Avocados', '6.00', null]].map(([n, p, low], i) => (
          <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--gg-ink-100)' : 'none' }}>
            <span style={{ fontSize: 13 }}>{n}</span>
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: low ? 'var(--gg-danger-500)' : 'var(--gg-ink-900)' }}>{low ? '⚠ ' : ''}${p}</span>
          </div>
        ))}
      </div>

      <div style={{ margin: '12px 0' }}>
        <div style={{ height: 48, borderRadius: 999, background: 'var(--gg-leaf-700)', color: 'var(--gg-cream-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, gap: 8 }}>
          <Icon.Check size={18} />
          Confirm & Save
        </div>
      </div>
    </div>
  );
}

window.ScreensBoard = ScreensBoard;
