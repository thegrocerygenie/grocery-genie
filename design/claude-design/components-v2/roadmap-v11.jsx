/* global React, GG2, Roadmap */
// V1.1 — Price Intelligence
const { SF, ListGroup, ListRow } = window.GG2;
const { RPhone, RNav, RTabBar, ReleaseNote, PhoneRow, Spark } = window.Roadmap;

// PI-01 — Item detail with price history
function ItemDetail() {
  const series = [3.49, 3.49, 3.79, 3.79, 3.99, 4.29, 4.29, 4.49, 4.79, 4.99];
  const W = 252, H = 120;
  const min = Math.min(...series), max = Math.max(...series);
  const pad = 8;
  const pts = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (v - min) / (max - min)) * (H - pad * 2);
    return [x, y];
  });
  const line = pts.map(p => p.join(',')).join(' ');
  const area = `${pad},${H} ${line} ${W - pad},${H}`;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav left="Items" title="Avocado" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>Avg · 30d</span>
            <span style={{ fontSize: 12, color: 'var(--sys-red)', fontWeight: 600 }}>+18%</span>
          </div>
          <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>$4.79<span style={{ fontSize: 13, color: 'var(--ios-label-2)', fontWeight: 400, marginLeft: 4 }}>/ ea</span></div>
          <svg width={W} height={H} style={{ marginTop: 10, display: 'block' }}>
            <defs>
              <linearGradient id="grad-pi" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--gg-tint)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--gg-tint)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={area} fill="url(#grad-pi)" />
            <polyline points={line} fill="none" stroke="var(--gg-tint)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p, i) => i === pts.length - 1 && <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--gg-tint)" />)}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ios-label-2)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span>
          </div>
        </div>

        <div style={{ display: 'inline-flex', background: 'var(--ios-fill-3)', padding: 2, borderRadius: 9, gap: 0, alignSelf: 'center' }}>
          {['1M', '3M', '6M', '1Y', 'All'].map((t, i) => (
            <div key={t} style={{ padding: '5px 12px', borderRadius: 7, background: i === 1 ? 'var(--ios-bg-2)' : 'transparent', fontSize: 12, fontWeight: i === 1 ? 600 : 400, color: 'var(--ios-label)' }}>{t}</div>
          ))}
        </div>

        <ListGroup header="By Store">
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-green)" title="Trader Joe's" detail="3 purchases" value="$3.99" />
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-orange)" title="Whole Foods" detail="5 purchases" value="$4.99" />
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-blue)" title="Safeway" detail="2 purchases" value="$5.49" />
        </ListGroup>
      </div>
    </div>
  );
}

// PI-02 — Match confirmation
function MatchConfirm() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav left="Cancel" title="Same item?" right="Skip" />
      <div style={{ flex: 1, padding: '8px 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 14, color: 'var(--ios-label-2)', textAlign: 'center', padding: '4px 8px' }}>
          We think these are the same product. Confirm to merge price history.
        </div>

        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>From today's receipt</div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>BNLS CHKN BRST 2LB</div>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 2 }}>Costco · Apr 19</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, color: 'var(--ios-label-2)', fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--ios-separator)' }} />
          <span>72% match</span>
          <div style={{ flex: 1, height: 1, background: 'var(--ios-separator)' }} />
        </div>

        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Existing item</div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Chicken breast, boneless</div>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 2 }}>14 purchases · 3 stores</div>
          <div style={{ height: 1, background: 'var(--ios-separator)', margin: '10px -14px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--ios-label-2)' }}>Avg unit price</span>
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>$8.99 / lb</span>
          </div>
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600 }}>Yes, merge</button>
          <button style={{ height: 50, background: 'var(--ios-fill-2)', color: 'var(--ios-label)', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600 }}>Keep as separate item</button>
        </div>
      </div>
    </div>
  );
}

// PI-03 — Price alert (notification + in-app card)
function PriceAlert() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ios-bg)' }}>
      <RNav title="Price alerts" right="" left="" large />
      <div style={{ flex: 1, padding: '8px 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup header="This week">
          <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--sys-red)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l5-5 5 5M7 7l5 5 5-5" /></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Eggs · dozen</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--sys-red)', fontVariantNumeric: 'tabular-nums' }}>+22%</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 2 }}>Safeway · was $4.49 avg, now $5.49</div>
              <Spark data={[4.49, 4.49, 4.79, 4.49, 4.99, 5.49]} w={120} h={20} color="var(--sys-red)" />
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--ios-separator)', marginLeft: 60 }} />
          <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--sys-green)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7l5 5 5-5M7 17l5-5 5 5" /></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Olive oil · 1L</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--sys-green)', fontVariantNumeric: 'tabular-nums' }}>−14%</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 2 }}>Costco · stock-up worth it</div>
              <Spark data={[14.99, 14.99, 15.49, 14.49, 13.99, 12.99]} w={120} h={20} color="var(--sys-green)" />
            </div>
          </div>
        </ListGroup>

        <ListGroup header="Settings" footer="Cooldown: 7 days · alerts at ≥10% change">
          <ListRow icon={<SF.bell size={14} />} iconBg="var(--sys-orange)" title="Threshold" value="10%" accessory={<SF.chevron />} />
          <ListRow icon={<SF.clock size={14} />} iconBg="var(--sys-blue)" title="Cooldown" value="7 days" accessory={<SF.chevron />} />
        </ListGroup>
      </div>
      <RTabBar active="Budget" />
    </div>
  );
}

// PI-04 — Cross-store comparison
function CrossStore() {
  const stores = [
    { name: "Trader Joe's", color: 'var(--sys-green)', last: 3.99, avg: 4.12, n: 8, cheapest: true },
    { name: 'Costco', color: 'var(--sys-red)', last: 4.49, avg: 4.39, n: 5 },
    { name: 'Safeway', color: 'var(--sys-blue)', last: 5.49, avg: 5.12, n: 4 },
    { name: 'Whole Foods', color: 'var(--sys-orange)', last: 5.99, avg: 5.79, n: 6 },
  ];
  const max = Math.max(...stores.map(s => s.last));
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav left="Avocado" title="Compare stores" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>Save by switching</div>
          <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 28, fontWeight: 700, marginTop: 2, color: 'var(--gg-tint)', fontVariantNumeric: 'tabular-nums' }}>$2.00 / unit</div>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 2 }}>Trader Joe's vs. Whole Foods</div>
        </div>

        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {stores.map((s, i) => (
            <div key={s.name} style={{ padding: '12px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: s.color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {s.name}
                    {s.cheapest && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gg-tint)', background: 'var(--gg-tint-bg)', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.04em' }}>CHEAPEST</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{s.n} purchases · avg ${s.avg}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 17, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${s.last}</div>
              </div>
              <div style={{ height: 4, background: 'var(--ios-fill-3)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: (s.last / max) * 100 + '%', height: '100%', background: s.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function V11Screens() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ReleaseNote>
        <strong style={{ color: 'var(--ios-label)' }}>V1.1 · Price Intelligence.</strong> Receipts already scanned for budgets now feed price history. Item matching is hybrid (vector + fuzzy) — high-confidence merges silently, medium-confidence asks. Alerts at ≥10% change with a 7-day cooldown.
      </ReleaseNote>
      <PhoneRow>
        <RPhone label="PI-01 · Item Detail"><ItemDetail /></RPhone>
        <RPhone label="PI-02 · Match Confirm"><MatchConfirm /></RPhone>
        <RPhone label="PI-03 · Alerts"><PriceAlert /></RPhone>
        <RPhone label="PI-04 · Cross-Store"><CrossStore /></RPhone>
      </PhoneRow>
    </div>
  );
}

window.V11Screens = V11Screens;
