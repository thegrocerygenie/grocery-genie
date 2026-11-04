/* global React, GG, GGCtl */
const { Sheet, ArtLabel, Icon } = window.GG;
const { Chip } = window.GGCtl;

// Domain patterns — the "grocery-genie specific" components
function PatternsBoard() {
  return (
    <Sheet pad={40}>
      <ArtLabel hint="Budget card · receipt row · scan viewfinder · category bar">Domain patterns</ArtLabel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <BudgetCard />
        <ReceiptRowStack />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24 }}>
        <Viewfinder />
        <CategoryBars />
      </div>

      <AlertBanners />
    </Sheet>
  );
}

function BudgetCard() {
  const pct = 61;
  return (
    <div>
      <ArtLabel>Budget progress card</ArtLabel>
      <div style={{ marginTop: 8, background: 'var(--gg-paper)', borderRadius: 20, padding: 22, boxShadow: 'var(--sh-card)', border: '1px solid rgba(23,26,20,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gg-ink-500)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>April · day 19 of 30</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, lineHeight: 1, letterSpacing: '-0.03em', color: 'var(--gg-ink-900)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              $157<span style={{ fontSize: 28, color: 'var(--gg-ink-500)' }}>.92</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--gg-ink-500)', marginTop: 4 }}>remaining of $400 · 11 days left</div>
          </div>
          <Chip tone="leaf">On track</Chip>
        </div>

        <div style={{ marginTop: 18, height: 12, borderRadius: 999, background: 'var(--gg-cream-100)', overflow: 'hidden', position: 'relative' }}>
          <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg, var(--gg-leaf-500), var(--gg-leaf-700))', borderRadius: 999 }} />
          <div style={{ position: 'absolute', left: '66%', top: -3, width: 2, height: 18, background: 'var(--gg-ink-300)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gg-ink-500)', marginTop: 6, letterSpacing: '0.1em' }}>
          <span>$242.08 SPENT · {pct}%</span>
          <span>PACE 66%</span>
        </div>
      </div>
    </div>
  );
}

function ReceiptRowStack() {
  const rows = [
    { store: 'Trader Joe\'s', date: 'Apr 19 · 12 items', total: '58.42', cat: 'Groceries', color: 'var(--cat-groceries)' },
    { store: 'Safeway', date: 'Apr 16 · 8 items', total: '42.11', cat: 'Groceries', color: 'var(--cat-groceries)' },
    { store: 'CVS', date: 'Apr 15 · 3 items · Pending sync', total: '14.80', cat: 'Personal', color: 'var(--cat-personal-care)', pending: true },
    { store: 'Whole Foods', date: 'Apr 12 · 22 items', total: '126.75', cat: 'Groceries', color: 'var(--cat-groceries)' },
  ];
  return (
    <div>
      <ArtLabel>Receipt row</ArtLabel>
      <div style={{ marginTop: 8, background: 'var(--gg-paper)', borderRadius: 16, border: '1px solid var(--gg-ink-100)', overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <div key={r.store} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--gg-ink-100)' }}>
            <div style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, background: r.color }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--gg-ink-900)' }}>{r.store}</span>
                <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--gg-ink-900)' }}>${r.total}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ fontSize: 12, color: r.pending ? 'var(--gg-warning-700)' : 'var(--gg-ink-500)' }}>{r.date}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gg-ink-500)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{r.cat}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Viewfinder() {
  return (
    <div>
      <ArtLabel>Scan viewfinder</ArtLabel>
      <div style={{ marginTop: 8, aspectRatio: '4 / 5', background: 'var(--gg-ink-900)', borderRadius: 20, position: 'relative', overflow: 'hidden' }}>
        {/* receipt placeholder */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '55%', height: '70%', background: 'var(--gg-cream-50)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 5, transform: 'rotate(-2deg)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--gg-ink-900)', textAlign: 'center' }}>TRADER JOE'S</div>
            {Array(6).fill(0).map((_, i) => (
              <div key={i} style={{ height: 4, background: 'var(--gg-ink-100)', width: [80, 65, 90, 70, 85, 60][i] + '%', borderRadius: 2 }} />
            ))}
          </div>
        </div>
        {/* corner brackets */}
        {[['tl', 16, 16], ['tr', 16, 'r'], ['bl', 'b', 16], ['br', 'b', 'r']].map(([k, y, x]) => (
          <div key={k} style={{
            position: 'absolute',
            top: y === 'b' ? 'auto' : y, bottom: y === 'b' ? 16 : 'auto',
            left: x === 'r' ? 'auto' : x, right: x === 'r' ? 16 : 'auto',
            width: 28, height: 28,
            borderTop: k[0] === 't' ? '2px solid var(--gg-saffron-500)' : 'none',
            borderBottom: k[0] === 'b' ? '2px solid var(--gg-saffron-500)' : 'none',
            borderLeft: k[1] === 'l' ? '2px solid var(--gg-saffron-500)' : 'none',
            borderRight: k[1] === 'r' ? '2px solid var(--gg-saffron-500)' : 'none',
            borderTopLeftRadius: k === 'tl' ? 6 : 0,
            borderTopRightRadius: k === 'tr' ? 6 : 0,
            borderBottomLeftRadius: k === 'bl' ? 6 : 0,
            borderBottomRightRadius: k === 'br' ? 6 : 0,
          }} />
        ))}
        {/* hint */}
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: 'rgba(23,26,20,0.6)', backdropFilter: 'blur(8px)', padding: '8px 14px', borderRadius: 999, color: 'var(--gg-cream-50)', fontSize: 12, fontWeight: 500 }}>
            Position receipt within the frame
          </div>
        </div>
        {/* capture ring */}
        <div style={{ position: 'absolute', bottom: -30, left: '50%', transform: 'translateX(-50%)', width: 68, height: 68, borderRadius: '50%', border: '3px solid var(--gg-cream-50)', padding: 4 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--gg-cream-50)' }} />
        </div>
      </div>
      <div style={{ height: 40 }} />
    </div>
  );
}

function CategoryBars() {
  const cats = [
    ['Groceries', 'var(--cat-groceries)', 82, 142, 175],
    ['Household', 'var(--cat-household)', 54, 27, 50],
    ['Personal care', 'var(--cat-personal-care)', 38, 19, 50],
    ['Beverages', 'var(--cat-beverages)', 110, 33, 30],
    ['Snacks & treats', 'var(--cat-snacks)', 64, 16, 25],
  ];
  return (
    <div>
      <ArtLabel>Category breakdown</ArtLabel>
      <div style={{ marginTop: 8, background: 'var(--gg-paper)', borderRadius: 16, padding: 18, border: '1px solid var(--gg-ink-100)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {cats.map(([name, color, pct, spent, budget]) => (
            <div key={name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gg-ink-900)' }}>{name}</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--gg-ink-500)', fontVariantNumeric: 'tabular-nums' }}>${spent} / ${budget}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--gg-cream-100)', overflow: 'hidden' }}>
                <div style={{ width: Math.min(pct, 100) + '%', height: '100%', background: pct > 100 ? 'var(--gg-danger-500)' : color, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AlertBanners() {
  return (
    <div>
      <ArtLabel hint="Tints match semantic palette · left accent bar removed intentionally">Alerts & status</ArtLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 8 }}>
        <Banner tone="success" title="Scanned" msg="12 items captured." icon={<Icon.Check size={16} />} />
        <Banner tone="warning" title="80% of April budget" msg="About $80 left for 11 days." icon={<Icon.Bell size={16} />} />
        <Banner tone="danger" title="Over budget" msg="Snacks exceeded by $14." icon={<Icon.ArrowUp size={14} />} />
      </div>
    </div>
  );
}

function Banner({ tone, title, msg, icon }) {
  const c = {
    success: ['var(--gg-success-100)', 'var(--gg-success-700)'],
    warning: ['var(--gg-warning-100)', 'var(--gg-warning-700)'],
    danger:  ['var(--gg-danger-100)',  'var(--gg-danger-700)'],
  }[tone];
  return (
    <div style={{ background: c[0], borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ color: c[1], marginTop: 1 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: c[1] }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--gg-ink-700)', marginTop: 2 }}>{msg}</div>
      </div>
    </div>
  );
}

window.PatternsBoard = PatternsBoard;
