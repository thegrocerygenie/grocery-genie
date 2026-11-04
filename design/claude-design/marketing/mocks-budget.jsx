/* global React */
// MVP mocks: review & approve, budget, dashboard. Categories match the app's 8.
const BM = window.MarketingMocks;
const bmCard = { background: 'var(--ios-bg-2)', borderRadius: 14 };
const bmSub = { fontSize: 11, color: 'var(--ios-label-2)' };
const bmBig = { fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' };
const bmNum = { fontVariantNumeric: 'tabular-nums' };

function BmBar({ name, spent, limit }) {
  const over = spent > limit;
  return (
    <div style={{ padding: '5px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span>{name}</span><span style={{ ...bmNum, color: over ? 'var(--sys-red)' : 'var(--ios-label-2)' }}>${spent} / ${limit}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--ios-separator)' }}>
        <div style={{ width: `${Math.min(100, (spent / limit) * 100)}%`, height: '100%', borderRadius: 2, background: over ? 'var(--sys-red)' : 'var(--gg-tint)' }} />
      </div>
    </div>
  );
}

function MockReview() {
  const items = [['Organic milk', 'Groceries', '4.49'], ['Eggs, dozen', 'Groceries', '5.74'], ['Paper towels', 'Household', '6.99'], ['Sparkling water ×2', 'Beverages', '5.98', true], ['Dark chocolate', 'Snacks & Treats', '3.49'], ['Shampoo', 'Personal Care', '7.99'], ['Dog treats', 'Pet', '4.29']];
  return (
    <BM.Mock label="Check and approve">
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, height: 'calc(100% - 28px)' }}>
        <div>
          <div style={bmSub}>Review receipt</div>
          <div style={{ ...bmBig, fontSize: 20, marginTop: 2 }}>Trader Joe's</div>
          <div style={bmSub}>Nov 1 · 7 items</div>
        </div>
        <div style={{ ...bmCard, padding: '2px 0' }}>
          {items.map(([n, c, p, unsure], i) => (
            <div key={n} style={{ padding: '7px 10px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, background: unsure ? 'color-mix(in oklab, var(--sys-orange) 14%, transparent)' : 'transparent' }}>
              <span style={{ flex: 1, minWidth: 0 }}>{n}</span>
              <span style={{ fontSize: 8.5, padding: '2px 6px', borderRadius: 999, background: 'var(--gg-tint-bg)', color: 'var(--gg-tint)', fontWeight: 600, whiteSpace: 'nowrap' }}>{c}</span>
              <span style={{ ...bmNum, width: 28, textAlign: 'right', fontWeight: unsure ? 700 : 400 }}>{p}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: 'var(--sys-orange)', padding: '0 4px', fontWeight: 600 }}>1 item to double-check</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, padding: '0 4px', color: 'var(--ios-label-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tax</span><span style={bmNum}>$1.42</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: 'var(--ios-label)' }}><span>Total</span><span style={bmNum}>$40.39</span></div>
        </div>
        <div style={{ marginTop: 'auto', marginBottom: 14, background: 'var(--gg-tint)', color: '#fff', borderRadius: 12, padding: '11px 0', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>Confirm receipt</div>
      </div>
    </BM.Mock>
  );
}

function MockBudget() {
  const C = 2 * Math.PI * 54, pct = 168 / 210;
  return (
    <BM.Mock label="Stay on budget">
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={bmSub}>November budget</div>
        <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto' }}>
          <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="70" cy="70" r="54" fill="none" stroke="var(--ios-bg-2)" strokeWidth="14" />
            <circle cx="70" cy="70" r="54" fill="none" stroke="var(--gg-tint)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            <div><div style={{ ...bmBig, fontSize: 26 }}>$42</div><div style={bmSub}>left · 9 days</div></div>
          </div>
        </div>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4, marginTop: -4 }}>
          <div style={bmSub}>$168 of $210 spent</div>
          <div style={{ alignSelf: 'center', fontSize: 10.5, fontWeight: 600, color: 'var(--sys-orange)', background: 'color-mix(in oklab, var(--sys-orange) 14%, transparent)', padding: '3px 10px', borderRadius: 999 }}>Ahead of pace · 14% over</div>
        </div>
        <div style={{ ...bmCard, padding: '6px 12px' }}>
          <BmBar name="Groceries" spent={112} limit={130} />
          <BmBar name="Household" spent={24} limit={30} />
          <BmBar name="Beverages" spent={19} limit={15} />
          <BmBar name="Snacks & Treats" spent={13} limit={20} />
        </div>
      </div>
    </BM.Mock>
  );
}

function MockDashboard() {
  const trend = [['Sep', 196], ['Oct', 184], ['Nov', 168]];
  return (
    <BM.Mock label="See where it all went">
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div>
            <div style={bmSub}>November so far</div>
            <div style={{ ...bmBig, fontSize: 26, marginTop: 2 }}>$168</div>
            <div style={{ fontSize: 10.5, color: 'var(--gg-tint)', fontWeight: 600 }}>$16 less than October</div>
            <div style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 600, color: 'var(--gg-tint)', background: 'var(--gg-tint-bg)', padding: '3px 8px', borderRadius: 999 }}>On pace · 5% under</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 54 }}>
            {trend.map(([m, v], i) => (
              <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 16, height: (v / 200) * 40, borderRadius: 3, background: i === 2 ? 'var(--gg-tint)' : 'var(--ios-label-3)', opacity: i === 2 ? 1 : 0.5 }} />
                <span style={{ fontSize: 8.5, color: 'var(--ios-label-2)' }}>{m}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={bmSub}>By category</div>
        <div style={{ ...bmCard, padding: '6px 12px' }}>
          <BmBar name="Groceries" spent={112} limit={130} />
          <BmBar name="Household" spent={24} limit={30} />
          <BmBar name="Beverages" spent={19} limit={15} />
        </div>
        <div style={{ ...bmSub, display: 'flex', justifyContent: 'space-between' }}><span>Top 10 items</span><span style={{ color: 'var(--gg-tint)' }}>See all</span></div>
        <div style={{ ...bmCard, padding: '4px 12px' }}>
          {[['Eggs, dozen', '$22.96'], ['Organic milk', '$17.96'], ['Sparkling water', '$11.96']].map(([n, a], i) => (
            <div key={n} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '6px 0', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <span style={{ color: 'var(--ios-label-2)', width: 10 }}>{i + 1}</span>
              <span style={{ flex: 1 }}>{n}</span>
              <span style={{ ...bmNum, fontWeight: 600 }}>{a}</span>
            </div>
          ))}
        </div>
      </div>
    </BM.Mock>
  );
}

Object.assign(window.MarketingMocks, { MockReview, MockBudget, MockDashboard });
