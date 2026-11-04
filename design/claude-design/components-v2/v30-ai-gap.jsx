/* global React, GG2, PhoneShell */
// V3.0 — substitution feedback gap
const { SF, ListGroup, ListRow } = window.GG2;
const { Phone, NavBar, TabBar } = window.PhoneShell;

// AI-03 · Substitution rating
function SubFeedback() {
  return (
    <Phone label="AI-03 · Sub feedback">
      <NavBar left="Recipes" title="How was the swap?" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Banana oat pancakes · cooked Apr 18</div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>Buttermilk · 1 cup</div>
              <div style={{ fontSize: 12, color: 'var(--gg-tint)', fontWeight: 600, marginTop: 2 }}>↓ replaced with</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>Milk + lemon juice</div>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: '18px 14px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, textAlign: 'center', marginBottom: 16 }}>How did it turn out?</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            {[
              { label: 'Worse', emoji: '😕', sel: false },
              { label: 'Same', emoji: '😐', sel: true },
              { label: 'Better', emoji: '😋', sel: false },
            ].map(o => (
              <div key={o.label} style={{ flex: 1, padding: '14px 8px', background: o.sel ? 'var(--gg-tint-bg)' : 'var(--ios-fill-3)', border: o.sel ? '2px solid var(--gg-tint)' : '2px solid transparent', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 26 }}>{o.emoji}</span>
                <span style={{ fontSize: 12, fontWeight: o.sel ? 600 : 500, color: o.sel ? 'var(--gg-tint)' : 'var(--ios-label)' }}>{o.label}</span>
              </div>
            ))}
          </div>
        </div>

        <ListGroup header="Note (optional)">
          <div style={{ padding: '11px 14px' }}>
            <textarea defaultValue="Worked great. Wouldn't notice the difference." style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, fontFamily: 'inherit', background: 'transparent', minHeight: 60, resize: 'none', lineHeight: 1.4, color: 'var(--ios-label)' }} />
          </div>
        </ListGroup>

        <div style={{ background: 'var(--gg-tint-bg)', borderRadius: 12, padding: 12, fontSize: 12, color: 'var(--ios-label-2)', lineHeight: 1.4 }}>
          We'll suggest this substitution to others who have <strong style={{ color: 'var(--gg-tint)' }}>milk + lemon</strong> but not <strong style={{ color: 'var(--gg-tint)' }}>buttermilk</strong> in their pantry.
        </div>

        <div style={{ flex: 1 }} />
        <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600 }}>Submit</button>
      </div>
    </Phone>
  );
}

// History of past swaps (to show this is a system, not just one-off)
function SubHistory() {
  const subs = [
    { from: 'Buttermilk', to: 'Milk + lemon', recipe: 'Banana pancakes', rating: 'better', accepted: 8, c: 'var(--sys-green)' },
    { from: 'Heavy cream', to: 'Whole milk + butter', recipe: 'Pasta sauce', rating: 'same', accepted: 12, c: 'var(--sys-blue)' },
    { from: 'Sour cream', to: 'Greek yogurt', recipe: 'Tacos', rating: 'better', accepted: 18, c: 'var(--sys-green)' },
    { from: 'Self-rising flour', to: 'AP flour + baking powder', recipe: 'Muffins', rating: 'worse', accepted: 3, c: 'var(--sys-red)' },
    { from: 'Brown sugar', to: 'White sugar + molasses', recipe: 'Cookies', rating: 'same', accepted: 5, c: 'var(--sys-blue)' },
  ];
  return (
    <Phone label="AI-03 · Sub history">
      <NavBar large title="Substitutions" right="" />
      <div style={{ padding: '0 16px 8px', fontSize: 13, color: 'var(--ios-label-2)' }}>Swaps you've tried · helps us suggest better ones</div>
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto' }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {subs.map((s, i) => (
            <div key={i} style={{ padding: '12px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{s.from} → {s.to}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: s.c, textTransform: 'uppercase', letterSpacing: '0.04em', marginLeft: 'auto' }}>{s.rating}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{s.recipe} · used {s.accepted} times</div>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 12, marginTop: 14, padding: 12, fontSize: 13, color: 'var(--ios-label-2)', lineHeight: 1.45 }}>
          <strong style={{ color: 'var(--ios-label)' }}>"Worse" feedback</strong> retires that substitution from your future suggestions and lowers it in the global pool.
        </div>
      </div>
    </Phone>
  );
}

function Row({ children }) { return <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>{children}</div>; }

window.AI3Gap = {
  SectionAI3Gap: () => <Row><SubFeedback /><SubHistory /></Row>,
};
