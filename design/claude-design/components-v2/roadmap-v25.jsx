/* global React, GG2, Roadmap */
// V2.5 — Advanced Intelligence (community phase)
const { SF, ListGroup, ListRow } = window.GG2;
const { RPhone, RNav, RTabBar, ReleaseNote, PhoneRow } = window.Roadmap;

// AI-01 — Basket comparison
function BasketCompare() {
  const stores = [
    { name: "Trader Joe's", total: 184.20, save: 0, color: 'var(--sys-green)', cheapest: true },
    { name: 'Costco', total: 192.40, save: 8.20, color: 'var(--sys-red)' },
    { name: 'Safeway', total: 214.80, save: 30.60, color: 'var(--sys-blue)' },
    { name: 'Whole Foods', total: 248.10, save: 63.90, color: 'var(--sys-orange)' },
  ];
  const max = Math.max(...stores.map(s => s.total));
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav left="Insights" title="Your basket" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>Typical weekly basket · 24 items</div>
          <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 28, fontWeight: 700, marginTop: 2, color: 'var(--gg-tint)', fontVariantNumeric: 'tabular-nums' }}>Save up to $63.90</div>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 2 }}>Trader Joe's vs. Whole Foods</div>
        </div>

        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {stores.map((s, i) => (
            <div key={s.name} style={{ padding: '12px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: s.color }} />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</span>
                  {s.cheapest && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gg-tint)', background: 'var(--gg-tint-bg)', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.04em' }}>BEST</span>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 17, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${s.total.toFixed(2)}</div>
                  {s.save > 0 && <div style={{ fontSize: 11, color: 'var(--sys-red)', fontVariantNumeric: 'tabular-nums' }}>+${s.save.toFixed(2)}</div>}
                </div>
              </div>
              <div style={{ height: 4, background: 'var(--ios-fill-3)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: (s.total / max) * 100 + '%', height: '100%', background: s.color }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: 'var(--ios-label-2)', textAlign: 'center', padding: '0 24px', lineHeight: 1.4 }}>
          Based on items you bought in 3+ of your last 5 trips, priced with each store's most recent recorded prices.
        </div>
      </div>
    </div>
  );
}

// AI-02 — Personal inflation index
function Inflation() {
  const months = [
    { m: 'Nov', v: 0 }, { m: 'Dec', v: 1.2 }, { m: 'Jan', v: 2.1 },
    { m: 'Feb', v: 3.4 }, { m: 'Mar', v: 4.1 }, { m: 'Apr', v: 5.8 },
  ];
  const cpi = [{m:'Nov',v:0},{m:'Dec',v:0.4},{m:'Jan',v:1.1},{m:'Feb',v:1.6},{m:'Mar',v:2.0},{m:'Apr',v:2.4}];
  const W = 252, H = 130, pad = 10;
  const max = 6, min = 0;
  const toPts = (arr) => arr.map((d, i) => [pad + (i / (arr.length - 1)) * (W - pad * 2), pad + (1 - (d.v - min) / (max - min)) * (H - pad * 2)]);
  const meLine = toPts(months).map(p => p.join(',')).join(' ');
  const cpiLine = toPts(cpi).map(p => p.join(',')).join(' ');
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav left="Insights" title="My inflation" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>Past 6 months · weighted by spend</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <span style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 36, fontWeight: 700, color: 'var(--sys-red)', fontVariantNumeric: 'tabular-nums' }}>+5.8%</span>
            <span style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>YoY</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 2 }}>vs. national CPI grocery: +2.4%</div>
          <svg width={W} height={H} style={{ marginTop: 12, display: 'block' }}>
            <polyline points={cpiLine} fill="none" stroke="var(--ios-label-3)" strokeWidth="1.5" strokeDasharray="3 3" strokeLinecap="round" />
            <polyline points={meLine} fill="none" stroke="var(--sys-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ios-label-2)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            {months.map(m => <span key={m.m}>{m.m}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 12, height: 2, background: 'var(--sys-red)' }} /><span>You</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 12, height: 2, background: 'var(--ios-label-3)', borderTop: '1px dashed' }} /><span style={{ color: 'var(--ios-label-2)' }}>National CPI</span></div>
          </div>
        </div>

        <ListGroup header="Top contributors">
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-yellow)" title="Eggs · dozen" detail="14% of basket spend" value="+22%" />
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-orange)" title="Ground beef" detail="9% of basket spend" value="+18%" />
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-green)" title="Avocado" detail="6% of basket spend" value="+14%" />
        </ListGroup>
      </div>
    </div>
  );
}

// AI-05 — Restock reminders
function Restock() {
  const items = [
    ['Milk · 2L', 'every 8 days', 'Today', 'now', 'var(--sys-red)'],
    ['Bread', 'every 6 days', 'in 1 day', 'soon', 'var(--sys-orange)'],
    ['Eggs · dozen', 'every 12 days', 'in 4 days', 'ok', 'var(--ios-label-2)'],
    ['Coffee beans', 'every 18 days', 'in 11 days', 'ok', 'var(--ios-label-2)'],
    ['Olive oil', 'every 60 days', 'in 32 days', 'ok', 'var(--ios-label-2)'],
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav title="Restock" right="" left="" large />
      <div style={{ padding: '0 16px 8px', fontSize: 13, color: 'var(--ios-label-2)' }}>
        Detected from your purchase patterns. Toggle reminders per item.
      </div>
      <div style={{ flex: 1, padding: '0 16px 90px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {items.map(([n, freq, due, state, c], i) => (
            <div key={n} style={{ padding: '12px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: state === 'ok' ? 'var(--ios-fill-3)' : c, color: state === 'ok' ? 'var(--ios-label-2)' : '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <SF.cart size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{n}</div>
                <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{freq}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: c, fontVariantNumeric: 'tabular-nums' }}>{due}</div>
                <div style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>{state === 'now' ? 'restock now' : state === 'soon' ? 'remind soon' : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <RTabBar active="Budget" />
    </div>
  );
}

// Community pricing — opt-in
function Community() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav left="Settings" title="Community prices" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--gg-tint)', color: '#fff', display: 'grid', placeItems: 'center' }}>
              <SF.sparkles size={16} />
            </div>
            <span style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>Contribute anonymously</span>
            <div style={{ width: 51, height: 31, borderRadius: 16, background: 'var(--gg-tint)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 2, right: 2, width: 27, height: 27, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 10, lineHeight: 1.45 }}>
            Share price observations stripped of your identity. In return, see community prices for items you haven't bought yet.
          </div>
        </div>

        <ListGroup header="Sample community data · Bay Area">
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-green)" title="Avocado · ea" detail="median across 247 receipts" value="$1.49" />
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-orange)" title="Eggs · dozen" detail="median across 412 receipts" value="$5.29" />
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-blue)" title="Whole milk · gal" detail="median across 189 receipts" value="$4.89" />
        </ListGroup>

        <div style={{ background: 'rgba(0,122,255,0.08)', borderRadius: 12, padding: 12, display: 'flex', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--sys-blue)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)', lineHeight: 1.45 }}>
            <strong style={{ color: 'var(--ios-label)' }}>What's shared:</strong> item, store, price, date, ZIP3.<br />
            <strong style={{ color: 'var(--ios-label)' }}>What's not:</strong> your name, full address, household, individual receipts, or purchase history.
          </div>
        </div>
      </div>
    </div>
  );
}

function V25Screens() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ReleaseNote>
        <strong style={{ color: 'var(--ios-label)' }}>V2.5 · Advanced Intelligence.</strong> The data accumulated since V1.1 starts answering harder questions: which store wins on the whole basket, how prices changed for *you* specifically, when staples need restocking, and how your prices compare to anonymized neighbors who opt in.
      </ReleaseNote>
      <PhoneRow>
        <RPhone label="AI-01 · Basket Compare"><BasketCompare /></RPhone>
        <RPhone label="AI-02 · My Inflation"><Inflation /></RPhone>
        <RPhone label="AI-05 · Restock"><Restock /></RPhone>
        <RPhone label="Community · Opt-in"><Community /></RPhone>
      </PhoneRow>
    </div>
  );
}

window.V25Screens = V25Screens;
