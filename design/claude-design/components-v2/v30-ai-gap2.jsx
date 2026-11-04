/* global React, GG2, PhoneShell */
// V3.0 fill-in — feature 30 (predictive meal planning)
const { SF, ListGroup, ListRow } = window.GG2;
const { Phone, NavBar, TabBar } = window.PhoneShell;

// AI-30 · Predictive meal plan (auto-generated week from pantry + taste profile)
function PredictivePlan() {
  const meals = [
    { day: 'Mon', date: 21, name: 'Banana oat pancakes', why: 'Bananas peaking · loved 3×', match: 'Loved', c: 'var(--sys-green)' },
    { day: 'Tue', date: 22, name: 'Chicken Caesar bowl', why: 'Chicken expires Thu', match: 'Use it', c: 'var(--sys-red)' },
    { day: 'Wed', date: 23, name: 'Pasta primavera', why: 'Pantry-only, no shopping', match: 'Easy', c: 'var(--sys-blue)' },
    { day: 'Thu', date: 24, name: 'Shrimp & mango tacos', why: 'Tried last month · liked', match: 'New-ish', c: 'var(--sys-orange)' },
    { day: 'Fri', date: 25, name: 'Sheet-pan salmon', why: 'Friday rotation · cooked 8×', match: 'Routine', c: 'var(--ios-label-2)' },
    { day: 'Sat', date: 26, name: 'Margherita pizza night', why: 'Saturday pattern', match: 'Routine', c: 'var(--ios-label-2)' },
    { day: 'Sun', date: 27, name: 'Roast chicken + sides', why: 'Sets up Mon lunch', match: 'Strategic', c: 'var(--sys-purple)' },
  ];
  return (
    <Phone label="AI-30 · Predictive plan">
      <div style={{ background: 'linear-gradient(180deg, var(--gg-tint) 0%, color-mix(in oklab, var(--gg-tint) 80%, black) 100%)', color: '#fff', padding: '50px 16px 18px', flexShrink: 0 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85 }}>Suggested for the week of Apr 21</div>
        <div style={{ fontFamily: 'var(--font-instrument-serif), serif', fontSize: 28, lineHeight: 1.1, marginTop: 6 }}>A week your kitchen<br/>can already cook.</div>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 10, lineHeight: 1.4 }}>Built from your pantry, expiry order, and what you've loved. <strong>Only 4 items to buy.</strong></div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {meals.map(m => (
          <div key={m.day} style={{ background: 'var(--ios-bg-2)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.day}</div>
              <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 20, fontWeight: 600, lineHeight: 1, marginTop: 2 }}>{m.date}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ios-label-2)', marginTop: 2 }}>{m.why}</div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: m.c, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{m.match}</div>
          </div>
        ))}
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 12, padding: 14, marginTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Why these?</div>
          {[
            ['Pantry-first', '11 of 14 main ingredients already in your kitchen'],
            ['Expiry-aware', 'Chicken & bananas slot in before they turn'],
            ['Taste profile', 'Skips eggplant (3× discarded). Favors citrus.'],
            ['Routines kept', 'Friday salmon, Saturday pizza unchanged'],
          ].map(([t, d], i) => (
            <div key={t} style={{ display: 'flex', gap: 10, padding: '6px 0', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 500, width: 120, flexShrink: 0 }}>{t}</div>
              <div style={{ fontSize: 12, color: 'var(--ios-label-2)', flex: 1, lineHeight: 1.4 }}>{d}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button style={{ flex: 1, height: 46, background: 'var(--ios-fill-3)', color: 'var(--ios-label)', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600 }}>Shuffle</button>
          <button style={{ flex: 2, height: 46, background: 'var(--gg-tint)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600 }}>Accept · build list</button>
        </div>
      </div>
    </Phone>
  );
}

function Row({ children }) { return <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>{children}</div>; }

window.AI3Gap2 = {
  SectionAI3Gap2: () => <Row><PredictivePlan /></Row>,
};
