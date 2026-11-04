/* global React */
// Small marketing-site phone mockups — drawn inline, not full UI fidelity.
// Goal: communicate the *shape* of each capability quickly at small sizes.

const { useEffect, useRef, useState } = React;

// Shell with realistic iPhone dimensions, scaled down for marketing tile use
function Mock({ children, label, height = 520 }) {
  return (
    <div className="mock" style={{ width: 260, height, position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: '#1C1C1E',
        borderRadius: 36,
        padding: 4,
        boxShadow: '0 30px 60px -20px rgba(21,20,15,0.35), 0 0 0 0.5px rgba(255,255,255,0.4) inset',
      }}>
        <div style={{
          width: '100%', height: '100%',
          background: 'var(--ios-bg)',
          borderRadius: 32,
          overflow: 'hidden',
          position: 'relative',
          fontFamily: 'var(--font-sf)',
          color: 'var(--ios-label)',
        }}>
          {/* Status bar */}
          <div style={{ height: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 18px 4px', fontSize: 11, fontWeight: 600 }}>
            <span>9:41</span>
            <span style={{ display: 'inline-block', width: 24, height: 8, background: 'currentColor', opacity: 0.4, borderRadius: 2 }} />
          </div>
          {/* Dynamic island */}
          <div style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', width: 78, height: 22, background: '#000', borderRadius: 999 }} />
          {children}
        </div>
      </div>
      {label && <div className="mock-label">{label}</div>}
    </div>
  );
}

// 1. Receipt scan / OCR
function MockScan() {
  return (
    <Mock label="Scan a receipt">
      <div style={{ position: 'absolute', inset: '28px 0 0', background: '#0a0a0a' }}>
        {/* receipt */}
        <div style={{
          position: 'absolute', left: '50%', top: 60, transform: 'translateX(-50%) rotate(-2deg)',
          width: 150, padding: '12px 12px 16px', background: '#fff', color: '#000',
          fontFamily: 'var(--font-mono)', fontSize: 7, lineHeight: 1.6,
          boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
        }}>
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-sf)', fontWeight: 700, fontSize: 9, marginBottom: 8 }}>TRADER JOE'S</div>
          {[
            ['ORG MILK', '4.49'], ['EGGS DZ', '5.74'], ['ROMAINE 2', '3.98'],
            ['CHKN BRST', '11.20'], ['OLIVE OIL', '15.32'], ['BANANAS', '2.29'],
            ['SOURDOUGH', '5.49'], ['AVOCADO 3', '4.47'],
          ].map(([n, p]) => (
            <div key={n} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{n}</span><span>{p}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px dashed #000', marginTop: 4, paddingTop: 3, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
            <span>TOTAL</span><span>52.98</span>
          </div>
        </div>
        {/* scan corners */}
        {[[20, 50], [240, 50, true], [20, 360, false, true], [240, 360, true, true]].map(([x, y, r, b], i) => (
          <div key={i} style={{ position: 'absolute', left: x === 20 ? 20 : 'auto', right: x === 240 ? 20 : 'auto', top: y === 50 ? 50 : 'auto', bottom: y === 360 ? 60 : 'auto', width: 22, height: 22,
            borderTop: !b ? '2px solid var(--gg-tint)' : 'none',
            borderBottom: b ? '2px solid var(--gg-tint)' : 'none',
            borderLeft: !r ? '2px solid var(--gg-tint)' : 'none',
            borderRight: r ? '2px solid var(--gg-tint)' : 'none',
          }} />
        ))}
        {/* shutter */}
        <div style={{ position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', width: 56, height: 56, borderRadius: 28, border: '3px solid #fff', display: 'grid', placeItems: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: '#fff' }} />
        </div>
        <div style={{ position: 'absolute', bottom: 100, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 11 }}>Hold steady — receipt detected</div>
      </div>
    </Mock>
  );
}

// 2. Price history per item
function MockPrices() {
  const W = 220, H = 90;
  const series = [3.49, 3.49, 3.79, 3.79, 3.99, 4.29, 4.29, 4.49, 4.79, 4.99];
  const min = Math.min(...series), max = Math.max(...series);
  const path = series.map((v, i) => {
    const x = 4 + (i / (series.length - 1)) * (W - 8);
    const y = H - 8 - ((v - min) / (max - min)) * (H - 16);
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <Mock label="Track every price">
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>Olive oil · 1L</div>
          <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>$15.32</div>
          <div style={{ fontSize: 11, color: 'var(--sys-red)', marginTop: 2 }}>↑ 43% in 12 months</div>
        </div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 12 }}>
          <svg width={W} height={H}>
            <path d={path} fill="none" stroke="var(--gg-tint)" strokeWidth="2" />
            {series.map((v, i) => {
              const x = 4 + (i / (series.length - 1)) * (W - 8);
              const y = H - 8 - ((v - min) / (max - min)) * (H - 16);
              return <circle key={i} cx={x} cy={y} r={i === series.length - 1 ? 3 : 1.5} fill="var(--gg-tint)" />;
            })}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--ios-label-2)', marginTop: 4 }}>
            <span>May '24</span><span>Apr '25</span>
          </div>
        </div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 10, fontSize: 11, color: 'var(--ios-label-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span>Trader Joe's</span><span style={{ color: 'var(--gg-tint)', fontWeight: 600 }}>$13.99</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span>Whole Foods</span><span>$15.99</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span>Safeway</span><span>$16.49</span>
          </div>
        </div>
      </div>
    </Mock>
  );
}

// 3. Pantry — recipe match
function MockPantry() {
  const items = [
    ['Bananas', '4 days', 'var(--sys-orange)'],
    ['Chicken breast', '2 days', 'var(--sys-red)'],
    ['Romaine', '5 days', 'var(--sys-orange)'],
    ['Sourdough', '3 days', 'var(--sys-red)'],
    ['Eggs', '3 weeks', 'var(--sys-green)'],
    ['Olive oil', '12 months', 'var(--sys-green)'],
  ];
  return (
    <Mock label="See what's in your kitchen">
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>Pantry</div>
          <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 22, fontWeight: 700 }}>32 items</div>
        </div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: '4px 0' }}>
          {items.map(([n, d, c], i) => (
            <div key={n} style={{ padding: '8px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: c }} />
              <span style={{ fontSize: 12, flex: 1 }}>{n}</span>
              <span style={{ fontSize: 10, color: 'var(--ios-label-2)' }}>{d}</span>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--gg-tint-bg)', color: 'var(--gg-tint)', padding: '10px 12px', borderRadius: 10, fontSize: 11 }}>
          <div style={{ fontWeight: 600 }}>Cook tonight</div>
          <div style={{ marginTop: 2, opacity: 0.85 }}>Chicken Caesar uses 4 expiring items</div>
        </div>
      </div>
    </Mock>
  );
}

// 4. Personal inflation
function MockInflation() {
  const months = [0, 1.2, 2.1, 2.8, 3.4, 3.9, 4.5, 5.1, 5.4, 5.9, 6.0, 6.2];
  const W = 220, H = 86;
  const max = 7;
  return (
    <Mock label="Your personal inflation">
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>Your inflation · 12 months</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
            <span style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 30, fontWeight: 700, color: 'var(--sys-red)' }}>+6.2%</span>
            <span style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>vs CPI 4.1%</span>
          </div>
        </div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: '12px 8px' }}>
          <svg width={W} height={H}>
            {months.map((v, i) => {
              const x = 6 + (i / (months.length - 1)) * (W - 12);
              const y = H - 4 - (v / max) * (H - 12);
              return <circle key={i} cx={x} cy={y} r={i === months.length - 1 ? 3 : 1.5} fill={i === months.length - 1 ? 'var(--sys-red)' : 'var(--ios-label-2)'} />;
            })}
            <path d={months.map((v, i) => {
              const x = 6 + (i / (months.length - 1)) * (W - 12);
              const y = H - 4 - (v / max) * (H - 12);
              return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ')} fill="none" stroke="var(--sys-red)" strokeWidth="1.5" strokeOpacity="0.6" />
          </svg>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>Top contributors</div>
        {[['Eggs', '+28%', 'var(--sys-red)'], ['Olive oil', '+18%', 'var(--sys-red)'], ['Bananas', '−8%', 'var(--sys-green)']].map(([n, p, c]) => (
          <div key={n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span>{n}</span>
            <span style={{ color: c, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p}</span>
          </div>
        ))}
      </div>
    </Mock>
  );
}

// 5. Recipe remix / substitution
function MockRecipe() {
  return (
    <Mock label="Recipes that fit your kitchen">
      <div style={{ height: 86, background: 'linear-gradient(135deg, var(--sys-green) 0%, color-mix(in oklab, var(--sys-green) 50%, white) 100%)', position: 'relative' }}>
        <div style={{ position: 'absolute', bottom: 8, left: 14, color: '#fff' }}>
          <div style={{ fontSize: 10, opacity: 0.85 }}>25 min · serves 2</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Banana oat pancakes</div>
        </div>
      </div>
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ingredients</div>
        {[
          ['Bananas', 'In pantry', 'var(--sys-green)'],
          ['Oats', 'In pantry', 'var(--sys-green)'],
          ['Eggs', 'In pantry', 'var(--sys-green)'],
          ['Buttermilk', 'Use milk + lemon', 'var(--gg-tint)', true],
          ['Maple syrup', 'In pantry', 'var(--sys-green)'],
        ].map(([n, s, c, sub]) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: sub ? 'var(--gg-tint-bg)' : 'transparent', border: sub ? '1px solid var(--gg-tint)' : '1px solid var(--ios-label-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {!sub && <span style={{ color: c, fontSize: 9, fontWeight: 700 }}>✓</span>}
            </div>
            <span style={{ flex: 1, textDecoration: sub ? 'line-through' : 'none', color: sub ? 'var(--ios-label-3)' : 'var(--ios-label)' }}>{n}</span>
            <span style={{ fontSize: 9, color: c, fontWeight: 600 }}>{s}</span>
          </div>
        ))}
        <div style={{ background: 'var(--gg-tint-bg)', color: 'var(--gg-tint)', padding: '8px 10px', borderRadius: 8, fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
          <strong>Smart swap:</strong> milk + 1 tbsp lemon juice mimics buttermilk. Saves a trip.
        </div>
      </div>
    </Mock>
  );
}

window.MarketingMocks = { Mock, MockScan, MockPrices, MockPantry, MockInflation, MockRecipe };
