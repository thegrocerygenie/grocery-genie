/* global React, GG2, PhoneShell */
// V2.0 fill-ins — features 11, 12, 14
const { SF, ListGroup, ListRow } = window.GG2;
const { Phone, NavBar, TabBar } = window.PhoneShell;

// MP-11 · Receipt → pantry import confirmation
function PantryImport() {
  const items = [
    ['Whole milk · 1 gal', 'Dairy', 7, true, 'var(--sys-blue)'],
    ['Eggs · dozen', 'Dairy', 28, true, 'var(--sys-blue)'],
    ['Chicken breast · 2 lb', 'Meat', 3, true, 'var(--sys-red)'],
    ['Romaine · 2 heads', 'Produce', 5, true, 'var(--sys-green)'],
    ['Olive oil · 1L', 'Pantry staples', 365, true, 'var(--sys-orange)'],
    ['Sourdough loaf', 'Bakery', 4, true, 'var(--sys-brown)'],
    ['Sparkling water · 12pk', 'Beverages — skip pantry', 0, false, 'var(--ios-label-3)'],
  ];
  return (
    <Phone label="MP-11 · Pantry import">
      <NavBar left="Cancel" title="Add to pantry" right="Add 6" />
      <div style={{ padding: '8px 16px', fontSize: 13, color: 'var(--ios-label-2)' }}>From Trader Joe's · Apr 19. Tap to exclude. We'll skip non-perishables you've never tracked.</div>
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {items.map(([n, c, days, on, col], i) => (
            <div key={n} style={{ padding: '12px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 12, opacity: on ? 1 : 0.5 }}>
              <div style={{ width: 22, height: 22, borderRadius: 11, background: on ? col : 'transparent', border: on ? 'none' : '1.5px solid var(--ios-label-3)', display: 'grid', placeItems: 'center' }}>
                {on && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{n}</div>
                <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{c}{on && ` · expires in ${days < 30 ? days + 'd' : Math.round(days/30) + 'mo'}`}</div>
              </div>
              {on && <span style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>edit</span>}
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--gg-tint-bg)', borderRadius: 12, padding: 12, fontSize: 12, color: 'var(--ios-label-2)', lineHeight: 1.45 }}>
          <strong style={{ color: 'var(--gg-tint)' }}>Always import dairy &amp; produce</strong> — toggle in Settings → Pantry to skip this confirmation for trusted categories.
        </div>
      </div>
    </Phone>
  );
}

// MP-12 · Shelf-life confidence + correction
function ShelfLife() {
  const learning = [
    ['Olive oil', '12 months', 'Default', 'var(--ios-label-3)'],
    ['Whole milk', '7 days', 'You: 5d', 'var(--sys-green)'],
    ['Bananas', '5 days', 'You: 4d', 'var(--sys-green)'],
    ['Sourdough', '4 days', 'Default', 'var(--ios-label-3)'],
    ['Chicken breast', '2 days', 'You: 3d', 'var(--sys-green)'],
  ];
  return (
    <Phone label="MP-12 · Shelf-life">
      <NavBar left="Whole milk" title="Shelf life" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>How long does this last in your fridge?</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <span style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 40, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>5</span>
            <span style={{ fontSize: 16, color: 'var(--ios-label-2)' }}>days from purchase</span>
          </div>
          <div style={{ height: 8, background: 'var(--ios-fill-3)', borderRadius: 4, marginTop: 14, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '36%', background: 'var(--gg-tint)', borderRadius: 4 }} />
            <div style={{ position: 'absolute', left: '36%', top: -3, width: 14, height: 14, borderRadius: 7, background: '#fff', border: '2px solid var(--gg-tint)', transform: 'translateX(-7px)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ios-label-2)', marginTop: 6 }}>
            <span>1d</span><span>7d</span><span>14d</span>
          </div>
          <div style={{ marginTop: 12, padding: 10, background: 'var(--gg-tint-bg)', borderRadius: 8, fontSize: 12, color: 'var(--ios-label-2)', lineHeight: 1.4 }}>
            Default for whole milk is <strong style={{ color: 'var(--ios-label)' }}>7 days</strong>. You usually finish yours in 5 — your value is used.
          </div>
        </div>

        <ListGroup header="Learning from your pantry">
          {learning.map(([n, def, status, c], i) => (
            <div key={n} style={{ padding: '11px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14 }}>{n}</div>
                <div style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>Catalog default · {def}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: c }}>{status}</span>
            </div>
          ))}
        </ListGroup>

        <div style={{ fontSize: 12, color: 'var(--ios-label-2)', textAlign: 'center', lineHeight: 1.4, padding: '0 8px' }}>
          When you mark items "discarded" before they expire, we shorten the default. Marking "still good" past expiry extends it.
        </div>
      </div>
    </Phone>
  );
}

// MP-14 · Weekly meal planner
function WeekPlanner() {
  const days = [
    { d: 'Mon', date: 21, meals: [['Breakfast', 'Banana oat pancakes', 'var(--sys-orange)'], ['Dinner', 'Chicken Caesar', 'var(--sys-green)']] },
    { d: 'Tue', date: 22, meals: [['Dinner', 'Pasta primavera', 'var(--sys-green)']] },
    { d: 'Wed', date: 23, meals: [['Dinner', 'Shrimp tacos', 'var(--sys-blue)']] },
    { d: 'Thu', date: 24, meals: [] },
    { d: 'Fri', date: 25, meals: [['Dinner', 'Pizza night', 'var(--sys-red)']] },
    { d: 'Sat', date: 26, meals: [['Brunch', 'Eggs benedict', 'var(--sys-orange)']] },
    { d: 'Sun', date: 27, meals: [['Dinner', 'Roast chicken', 'var(--sys-green)']] },
  ];
  return (
    <Phone label="MP-14 · Week planner">
      <NavBar large title="This week" right="+" />
      <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>Apr 21 – 27 · 6 planned</span>
        <span style={{ fontSize: 13, color: 'var(--gg-tint)', fontWeight: 600 }}>Auto-fill</span>
      </div>
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {days.map(d => (
          <div key={d.d} style={{ background: 'var(--ios-bg-2)', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 12 }}>
            <div style={{ width: 36, textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d.d}</div>
              <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 22, fontWeight: 600, lineHeight: 1, marginTop: 2 }}>{d.date}</div>
            </div>
            <div style={{ flex: 1, minHeight: 36, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
              {d.meals.length === 0 && <div style={{ fontSize: 13, color: 'var(--ios-label-3)' }}>+ Add a meal</div>}
              {d.meals.map(([slot, name, c], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 3, height: 16, background: c, borderRadius: 2 }} />
                  <span style={{ fontSize: 11, color: 'var(--ios-label-2)', width: 64 }}>{slot}</span>
                  <span style={{ fontSize: 14, flex: 1 }}>{name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ background: 'var(--gg-tint-bg)', borderRadius: 12, padding: 12, fontSize: 12, color: 'var(--ios-label-2)', lineHeight: 1.45, marginTop: 4 }}>
          Plans build the smart shopping list for what's missing. <strong style={{ color: 'var(--gg-tint)' }}>4 ingredients needed</strong> for this week.
        </div>
      </div>
    </Phone>
  );
}

function Row({ children }) { return <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>{children}</div>; }

window.MPGap2 = {
  SectionMPGap2: () => <Row><PantryImport /><ShelfLife /><WeekPlanner /></Row>,
};
