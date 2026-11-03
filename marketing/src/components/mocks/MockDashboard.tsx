import type { CSSProperties } from 'react';
import Mock from './Mock';

const card: CSSProperties = { background: 'var(--ios-bg-2)', borderRadius: 14 };
const sub: CSSProperties = { fontSize: 11, color: 'var(--ios-label-2)' };
const big: CSSProperties = { fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' };
const num: CSSProperties = { fontVariantNumeric: 'tabular-nums' };

function Bar({ name, spent, limit }: { name: string; spent: number; limit: number }) {
  const over = spent > limit;
  return (
    <div style={{ padding: '5px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span>{name}</span>
        <span style={{ ...num, color: over ? 'var(--sys-red)' : 'var(--ios-label-2)' }}>${spent} / ${limit}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--ios-separator)' }}>
        <div style={{ width: `${Math.min(100, (spent / limit) * 100)}%`, height: '100%', borderRadius: 2, background: over ? 'var(--sys-red)' : 'var(--gg-tint)' }} />
      </div>
    </div>
  );
}

const TREND: [string, number][] = [['Sep', 196], ['Oct', 184], ['Nov', 168]];
const TOP: [string, string][] = [['Eggs, dozen', '$22.96'], ['Organic milk', '$17.96'], ['Sparkling water', '$11.96']];

export default function MockDashboard() {
  return (
    <Mock label="See where it all went">
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div>
            <div style={sub}>November so far</div>
            <div style={{ ...big, fontSize: 26, marginTop: 2 }}>$168</div>
            <div style={{ fontSize: 10.5, color: 'var(--gg-tint)', fontWeight: 600 }}>$16 less than October</div>
            <div style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 600, color: 'var(--gg-tint)', background: 'var(--gg-tint-bg)', padding: '3px 8px', borderRadius: 999 }}>On pace · 5% under</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 54 }}>
            {TREND.map(([m, v], i) => (
              <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 16, height: (v / 200) * 40, borderRadius: 3, background: i === 2 ? 'var(--gg-tint)' : 'var(--ios-label-3)', opacity: i === 2 ? 1 : 0.5 }} />
                <span style={{ fontSize: 8.5, color: 'var(--ios-label-2)' }}>{m}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={sub}>By category</div>
        <div style={{ ...card, padding: '6px 12px' }}>
          <Bar name="Groceries" spent={112} limit={130} />
          <Bar name="Household" spent={24} limit={30} />
          <Bar name="Beverages" spent={19} limit={15} />
        </div>
        <div style={{ ...sub, display: 'flex', justifyContent: 'space-between' }}><span>Top 10 items</span><span style={{ color: 'var(--gg-tint)' }}>See all</span></div>
        <div style={{ ...card, padding: '4px 12px' }}>
          {TOP.map(([n, a], i) => (
            <div key={n} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '6px 0', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <span style={{ color: 'var(--ios-label-2)', width: 10 }}>{i + 1}</span>
              <span style={{ flex: 1 }}>{n}</span>
              <span style={{ ...num, fontWeight: 600 }}>{a}</span>
            </div>
          ))}
        </div>
      </div>
    </Mock>
  );
}
