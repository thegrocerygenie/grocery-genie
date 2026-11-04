/* global React, GG2, Roadmap */
// V2.0 — Meal Planner
const { SF, ListGroup, ListRow } = window.GG2;
const { RPhone, RNav, RTabBar, ReleaseNote, PhoneRow } = window.Roadmap;

// MP-02 — Virtual pantry
function Pantry() {
  const groups = [
    { header: 'Use soon · 1–3 days', state: 'amber', items: [
      ['Bananas', '4', 'in 1 day', 'var(--sys-orange)'],
      ['Spinach', '1 bag', 'in 2 days', 'var(--sys-orange)'],
      ['Greek yogurt', '500g', 'in 3 days', 'var(--sys-orange)'],
    ]},
    { header: 'Fresh', state: 'green', items: [
      ['Chicken breast', '2 lbs', '5 days', 'var(--sys-green)'],
      ['Avocados', '3', '5 days', 'var(--sys-green)'],
      ['Eggs', '12', '14 days', 'var(--sys-green)'],
      ['Olive oil', '1L', '6 mo', 'var(--sys-green)'],
    ]},
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav title="Pantry" right="Edit" left="" large />
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, overflow: 'auto' }}>
        {[['All', 28, true], ['Produce', 8], ['Dairy', 4], ['Meat', 3], ['Pantry', 13]].map(([t, n, a]) => (
          <div key={t} style={{ padding: '5px 12px', borderRadius: 999, background: a ? 'var(--gg-tint-bg)' : 'var(--ios-fill-3)', color: a ? 'var(--gg-tint)' : 'var(--ios-label)', fontSize: 13, fontWeight: a ? 600 : 400, whiteSpace: 'nowrap' }}>{t} · {n}</div>
        ))}
      </div>
      <div style={{ flex: 1, padding: '0 16px 90px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {groups.map(g => (
          <div key={g.header}>
            <div style={{ fontSize: 13, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 4px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.state === 'amber' ? 'var(--sys-orange)' : 'var(--sys-green)' }} />
              {g.header}
            </div>
            <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
              {g.items.map(([n, q, e, c], i) => (
                <div key={n} style={{ padding: '11px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 4, height: 28, borderRadius: 2, background: c }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{n}</div>
                    <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{q}</div>
                  </div>
                  <div style={{ fontSize: 12, color: g.state === 'amber' ? 'var(--sys-orange)' : 'var(--ios-label-2)', fontWeight: 500 }}>{e}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <RTabBar active="Budget" />
    </div>
  );
}

// MP-03 — Recipe suggestions
function Recipes() {
  const recipes = [
    { name: 'Chicken Caesar Bowl', time: '25 min', match: 100, missing: 0, accent: 'var(--sys-green)', desc: 'Uses chicken breast, romaine, parmesan', img: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80&auto=format&fit=crop' },
    { name: 'Avocado toast w/ egg', time: '10 min', match: 100, missing: 0, accent: 'var(--sys-green)', desc: 'Uses avocado, sourdough, eggs', img: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&q=80&auto=format&fit=crop' },
    { name: 'Banana oat pancakes', time: '20 min', match: 86, missing: 1, accent: 'var(--sys-orange)', desc: 'Missing: maple syrup', img: 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?w=600&q=80&auto=format&fit=crop' },
    { name: 'Spinach feta wrap', time: '15 min', match: 75, missing: 2, accent: 'var(--sys-orange)', desc: 'Missing: feta, tortillas', img: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=80&auto=format&fit=crop' },
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav title="Recipes" right="" left="" large />
      <div style={{ padding: '0 16px 8px' }}>
        <div style={{ background: 'rgba(255,149,0,0.10)', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--sys-orange)', color: '#fff', display: 'grid', placeItems: 'center' }}>
            <SF.clock size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Use bananas soon</div>
            <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>2 recipes use them</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, overflow: 'auto' }}>
        {[['Full match · 8', true], ['Missing 1–2', false], ['Quick · ≤20m', false]].map(([t, a]) => (
          <div key={t} style={{ padding: '5px 12px', borderRadius: 999, background: a ? 'var(--gg-tint-bg)' : 'var(--ios-fill-3)', color: a ? 'var(--gg-tint)' : 'var(--ios-label)', fontSize: 13, fontWeight: a ? 600 : 400, whiteSpace: 'nowrap' }}>{t}</div>
        ))}
      </div>
      <div style={{ flex: 1, padding: '0 16px 90px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {recipes.map(r => (
          <div key={r.name} style={{ background: 'var(--ios-bg-2)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ height: 90, backgroundImage: `url(${r.img})`, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'flex-end', padding: 10, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.35) 100%)` }} />
              <span style={{ background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(10px)', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: r.accent, fontVariantNumeric: 'tabular-nums', position: 'relative' }}>
                {r.match}% match
              </span>
              <span style={{ position: 'absolute', top: 10, right: 10, color: '#fff', fontSize: 11, fontWeight: 500, background: 'rgba(0,0,0,0.45)', padding: '3px 7px', borderRadius: 999, backdropFilter: 'blur(8px)' }}>{r.time}</span>
            </div>
            <div style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 2 }}>{r.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <RTabBar active="Budget" />
    </div>
  );
}

// MP-04 — Expiry notification (lock screen style)
function ExpiryNotif() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #2a3540 0%, #1a2330 100%)', position: 'relative', overflow: 'hidden' }}>
      {/* time */}
      <div style={{ textAlign: 'center', padding: '40px 0 0', color: '#fff' }}>
        <div style={{ fontSize: 17, fontWeight: 500, opacity: 0.9 }}>Sunday, April 19</div>
        <div style={{ fontSize: 84, fontWeight: 200, lineHeight: 1, fontFamily: 'var(--font-sf-rounded)', letterSpacing: '-0.02em' }}>9:41</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ padding: '0 12px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', borderRadius: 16, padding: 12, display: 'flex', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--gg-tint)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <SF.sparkles size={18} />
          </div>
          <div style={{ flex: 1, color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Grocery Genie</span>
              <span style={{ fontSize: 12, opacity: 0.7 }}>now</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>3 items use soon</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 1, lineHeight: 1.35 }}>
              Bananas, spinach, yogurt. Try <em style={{ fontStyle: 'italic' }}>Banana oat pancakes</em> or <em style={{ fontStyle: 'italic' }}>Spinach feta wrap</em>.
            </div>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(28px)', borderRadius: 16, padding: 10, display: 'flex', gap: 10, color: '#fff' }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--sys-orange)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <SF.bell size={14} />
          </div>
          <div style={{ flex: 1, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>Weekly summary</span>
              <span style={{ opacity: 0.7 }}>9:00 am</span>
            </div>
            <div style={{ opacity: 0.8, marginTop: 1 }}>You spent $187 this week — under budget by $13.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// MP-05 — Smart shopping list
function ShoppingList() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav left="Recipes" title="Shopping list" right="Share" />
      <div style={{ padding: '0 16px 10px' }}>
        <div style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>From 3 recipes · 7 items needed</div>
      </div>
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup header="Produce">
          {[['Tortillas', '1 pack', false], ['Feta cheese', '200g', true], ['Maple syrup', '1 bottle', false]].map(([n, q, checked]) => (
            <div key={n} style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', border: checked ? 'none' : '1.6px solid var(--ios-fill-1)', background: checked ? 'var(--gg-tint)' : 'transparent', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {checked && <SF.check size={14} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 500, textDecoration: checked ? 'line-through' : 'none', color: checked ? 'var(--ios-label-2)' : 'var(--ios-label)' }}>{n}</div>
                <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{q}</div>
              </div>
            </div>
          )).reduce((acc, el, i) => i ? [...acc, <div key={'s' + i} style={{ height: 1, background: 'var(--ios-separator)', marginLeft: 48 }} />, el] : [el], [])}
        </ListGroup>

        <ListGroup header="Already in your pantry · auto-excluded">
          {[['Chicken breast', '2 lbs'], ['Spinach', '1 bag'], ['Olive oil', '1L'], ['Eggs', '6']].map(([n, q]) => (
            <div key={n} style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.55 }}>
              <SF.check size={14} />
              <span style={{ flex: 1, fontSize: 14, color: 'var(--ios-label-2)' }}>{n}</span>
              <span style={{ fontSize: 12, color: 'var(--ios-label-3)' }}>{q}</span>
            </div>
          )).reduce((acc, el, i) => i ? [...acc, <div key={'p' + i} style={{ height: 1, background: 'var(--ios-separator)', marginLeft: 38 }} />, el] : [el], [])}
        </ListGroup>

        <button style={{ height: 44, background: 'var(--ios-bg-2)', border: 'none', borderRadius: 10, fontSize: 15, color: 'var(--gg-tint)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <SF.plus size={14} /> Add item
        </button>
      </div>
    </div>
  );
}

function V20Screens() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ReleaseNote>
        <strong style={{ color: 'var(--ios-label)' }}>V2.0 · Meal Planner.</strong> Receipt items become a virtual pantry with shelf-life tracking. Recipes match against what's actually in the kitchen, prioritizing items about to expire. Push notifications nudge before food wastes.
      </ReleaseNote>
      <PhoneRow>
        <RPhone label="MP-02 · Pantry"><Pantry /></RPhone>
        <RPhone label="MP-03 · Recipes"><Recipes /></RPhone>
        <RPhone label="MP-04 · Expiry Push"><ExpiryNotif /></RPhone>
        <RPhone label="MP-05 · Shopping List"><ShoppingList /></RPhone>
      </PhoneRow>
    </div>
  );
}

window.V20Screens = V20Screens;
