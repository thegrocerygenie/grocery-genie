import { useEffect, useState, type CSSProperties } from 'react';
import Mock from './Mock';

// Hero: crumpled receipt -> categorized items -> budget ring fills a little. Loops.
// Under prefers-reduced-motion it shows the end state only.
const ITEMS: [string, string, string][] = [
  ['Chicken thighs', 'Groceries', '11.48'], ['Strawberries', 'Groceries', '4.99'], ['Greek yogurt', 'Groceries', '5.49'],
  ['Paper towels', 'Household', '8.99'], ['Dish soap', 'Household', '3.79'], ['Tortilla chips', 'Snacks & Treats', '4.29'],
  ['Cat litter', 'Pet', '9.17'],
];
const num: CSSProperties = { fontVariantNumeric: 'tabular-nums' };
const PHASE_MS = [2400, 1500, 1800, 3200];
const BUDGET = 210;
const R = 26;
const C = 2 * Math.PI * R;

export default function HeroMoment() {
  // Server render starts at phase 0 (camera view), matching the first client frame.
  const [p, setP] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setP(3);
      return;
    }
    let t: ReturnType<typeof setTimeout>;
    let i = 0;
    const step = () => {
      t = setTimeout(() => { i = (i + 1) % 4; setP(i); step(); }, PHASE_MS[i]);
    };
    step();
    return () => clearTimeout(t);
  }, []);

  const fill = p >= 2 ? 168.2 / BUDGET : 120 / BUDGET;

  return (
    <Mock label="">
        <div style={{ position: 'absolute', inset: '28px 0 0', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 24, height: 32, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transform: 'rotate(-4deg)', flex: 'none' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Trader Joe's</div>
              <div style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>Nov 21 · 7 items</div>
            </div>
            <div style={{ ...num, fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: 17 }}>$48.20</div>
          </div>
          <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: '2px 0' }}>
            {ITEMS.map(([n, c, pr], i) => {
              const delay = p >= 1 ? i * 0.12 : 0;
              return (
                <div
                  key={n}
                  style={{
                    padding: '7px 10px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                    opacity: p >= 1 ? 1 : 0, transform: p >= 1 ? 'none' : 'translateY(6px)',
                    transition: `opacity .35s ${delay}s, transform .35s ${delay}s`,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>{n}</span>
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 999, background: 'var(--gg-tint-bg)', color: 'var(--gg-tint)', fontWeight: 600, whiteSpace: 'nowrap' }}>{c}</span>
                  <span style={{ ...num, width: 30, textAlign: 'right' }}>{pr}</span>
                </div>
              );
            })}
          </div>
          <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 12, display: 'flex', alignItems: 'center', gap: 12, opacity: p >= 1 ? 1 : 0, transition: 'opacity .4s .8s' }}>
            <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)', flex: 'none' }} aria-hidden="true">
              <circle cx="32" cy="32" r={R} fill="none" stroke="var(--ios-separator)" strokeWidth="8" />
              <circle
                cx="32" cy="32" r={R} fill="none" stroke="var(--gg-tint)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${C * fill} ${C}`} style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.3,.7,.2,1)' }}
              />
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--ios-label-2)', whiteSpace: 'nowrap' }}>November budget</div>
              <div style={{ ...num, fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: 18 }}>{p >= 2 ? '$41.80' : '$90.00'} left</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ios-label-2)' }}>
                <span>9 days to go</span>
                <span style={{ ...num, fontSize: 10, fontWeight: 600, color: 'var(--gg-tint)', background: 'var(--gg-tint-bg)', padding: '2px 6px', borderRadius: 999, opacity: p >= 2 ? 1 : 0, transition: 'opacity .3s' }}>+$48.20</span>
              </div>
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', inset: '28px 0 0', background: '#0B0B0A', opacity: p === 0 ? 1 : 0, pointerEvents: 'none', transition: 'opacity .5s' }}>
          <div className="hm-receipt">
            <div style={{ textAlign: 'center', fontFamily: 'var(--font-sf)', fontWeight: 700, fontSize: 9, marginBottom: 7 }}>TRADER JOE'S</div>
            {ITEMS.map(([n, , pr]) => (
              <div key={n} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{n.toUpperCase().slice(0, 13)}</span><span>{pr}</span></div>
            ))}
            <div style={{ borderTop: '1px dashed #000', marginTop: 4, paddingTop: 3, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>TOTAL</span><span>48.20</span></div>
          </div>
          <div className="hm-frame"><span></span><span></span><span></span><span></span><i></i></div>
          <div style={{ position: 'absolute', bottom: 92, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 11 }}>Receipt found · hold steady</div>
          <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', width: 54, height: 54, borderRadius: 27, border: '3px solid #fff', display: 'grid', placeItems: 'center' }}>
            <div style={{ width: 42, height: 42, borderRadius: 21, background: '#fff' }} />
          </div>
        </div>
    </Mock>
  );
}
