/* global React */
// Hero: crumpled receipt -> categorized items -> budget ring fills a little. Loops; static under reduced motion.
const HMk = window.MarketingMocks;
const HERO_ITEMS = [['Chicken thighs', 'Groceries', '11.48'], ['Strawberries', 'Groceries', '4.99'], ['Greek yogurt', 'Groceries', '5.49'], ['Paper towels', 'Household', '8.99'], ['Dish soap', 'Household', '3.79'], ['Tortilla chips', 'Snacks & Treats', '4.29'], ['Cat litter', 'Pet', '9.17']];
const hmNum = { fontVariantNumeric: 'tabular-nums' };

function HeroMoment() {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [p, setP] = React.useState(reduce ? 3 : 0);
  React.useEffect(() => {
    if (reduce) return;
    const dur = [2400, 1500, 1800, 3200];
    let t; let i = 0;
    const step = () => { t = setTimeout(() => { i = (i + 1) % 4; setP(i); step(); }, dur[i]); };
    step();
    return () => clearTimeout(t);
  }, []);
  const R = 26, C = 2 * Math.PI * R, fill = p >= 2 ? 168.2 / 210 : 120 / 210;
  return (
    <HMk.Mock label="">
      <div style={{ position: 'absolute', inset: '28px 0 0', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 24, height: 32, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transform: 'rotate(-4deg)', flex: 'none' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Trader Joe's</div>
            <div style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>Nov 21 · 7 items</div>
          </div>
          <div style={{ ...hmNum, fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: 17 }}>$48.20</div>
        </div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: '2px 0' }}>
          {HERO_ITEMS.map(([n, c, pr], i) => (
            <div key={n} style={{ padding: '7px 10px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, opacity: p >= 1 ? 1 : 0, transform: p >= 1 ? 'none' : 'translateY(6px)', transition: `opacity .35s ${p >= 1 ? i * 0.12 : 0}s, transform .35s ${p >= 1 ? i * 0.12 : 0}s` }}>
              <span style={{ flex: 1, minWidth: 0 }}>{n}</span>
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 999, background: 'var(--gg-tint-bg)', color: 'var(--gg-tint)', fontWeight: 600, whiteSpace: 'nowrap' }}>{c}</span>
              <span style={{ ...hmNum, width: 30, textAlign: 'right' }}>{pr}</span>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 12, display: 'flex', alignItems: 'center', gap: 12, opacity: p >= 1 ? 1 : 0, transition: 'opacity .4s .8s' }}>
          <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)', flex: 'none' }}>
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--ios-separator)" strokeWidth="8" />
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--gg-tint)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${C * fill} ${C}`} style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.3,.7,.2,1)' }} />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--ios-label-2)', whiteSpace: 'nowrap' }}>November budget</div>
            <div style={{ ...hmNum, fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: 18 }}>{p >= 2 ? '$41.80' : '$90.00'} left</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ios-label-2)' }}>
              <span>9 days to go</span>
              <span style={{ ...hmNum, fontSize: 10, fontWeight: 600, color: 'var(--gg-tint)', background: 'var(--gg-tint-bg)', padding: '2px 6px', borderRadius: 999, opacity: p >= 2 ? 1 : 0, transition: 'opacity .3s' }}>+$48.20</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', inset: '28px 0 0', background: '#0B0B0A', opacity: p === 0 ? 1 : 0, pointerEvents: 'none', transition: 'opacity .5s' }}>
        <div className="hm-receipt">
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-sf)', fontWeight: 700, fontSize: 9, marginBottom: 7 }}>TRADER JOE'S</div>
          {HERO_ITEMS.map(([n, , pr]) => (
            <div key={n} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{n.toUpperCase().slice(0, 13)}</span><span>{pr}</span></div>
          ))}
          <div style={{ borderTop: '1px dashed #000', marginTop: 4, paddingTop: 3, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>TOTAL</span><span>48.20</span></div>
        </div>
        <div className="hm-frame"><span></span><span></span><span></span><span></span><i></i></div>
        <div style={{ position: 'absolute', bottom: 92, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 11 }}>Receipt found · hold steady</div>
        <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', width: 54, height: 54, borderRadius: 27, border: '3px solid #fff', display: 'grid', placeItems: 'center' }}><div style={{ width: 42, height: 42, borderRadius: 21, background: '#fff' }} /></div>
      </div>
    </HMk.Mock>
  );
}

function MockLockAlert() {
  const card = { background: 'rgba(245,245,247,0.86)', color: '#111', borderRadius: 16, padding: '10px 12px', display: 'grid', gridTemplateColumns: '26px 1fr', gap: '2px 10px', fontFamily: 'var(--font-sf)' };
  const icon = (
    <div style={{ gridRow: 'span 2', width: 26, height: 26, borderRadius: 7, background: '#F8F6F1', display: 'grid', placeItems: 'center' }}>
      <svg width="18" height="18" viewBox="9 9 82 82"><path d="M74.5 29.4 A32 32 0 1 0 82 50" fill="none" stroke="#1F7A4A" strokeWidth="18" /><path d="M91 50 C80 36 61 36 46 53 C60 65 80 64 91 50 Z" fill="#34D17A" /></svg>
    </div>
  );
  return (
    <HMk.Mock label="Alerts before you overspend">
      <div style={{ position: 'absolute', inset: 0, background: '#1E3A2C', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '46px 12px 0', fontFamily: 'var(--font-sf)' }}>
        <div style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', width: 78, height: 22, background: '#000', borderRadius: 999 }} />
        <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.9 }}>Sunday, November 22</div>
        <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 72, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em', marginTop: 2 }}>9:41</div>
        <div style={{ marginTop: 'auto', marginBottom: 90, width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={card}>{icon}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555' }}><span style={{ fontWeight: 600, color: '#111' }}>Grocery Genie</span><span>now</span></div>
            <div style={{ fontSize: 12, lineHeight: 1.35 }}>Budget 80% reached. $42 remaining with 9 days left in this period.</div>
          </div>
          <div style={{ ...card, opacity: 0.85, transform: 'scale(.96)' }}>{icon}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555' }}><span style={{ fontWeight: 600, color: '#111' }}>Weekly summary</span><span>9:00 AM</span></div>
            <div style={{ fontSize: 12, lineHeight: 1.35 }}>$96 on groceries this week, $12 less than last week.</div>
          </div>
        </div>
      </div>
    </HMk.Mock>
  );
}

Object.assign(window.MarketingMocks, { HeroMoment, MockLockAlert });
