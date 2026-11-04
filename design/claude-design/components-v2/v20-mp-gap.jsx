/* global React, GG2, PhoneShell */
// V2.0 Meal Planner — gap screens
const { SF, ListGroup, ListRow } = window.GG2;
const { Phone, NavBar, TabBar } = window.PhoneShell;

// MP-01 · Ingredient classification correction
function IngredientFix() {
  return (
    <Phone label="MP-01 · Ingredient fix">
      <NavBar left="Cancel" title="What is this?" right="Save" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>From your receipt</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, marginTop: 4 }}>BNLS CHKN BRST 2LB</div>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 6 }}>We guessed: <strong style={{ color: 'var(--ios-label)' }}>Chicken thigh</strong></div>
        </div>
        <div style={{ padding: '0 8px' }}>
          <div style={{ background: 'var(--ios-fill-3)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <SF.search size={14} color="var(--ios-label-2)" />
            <input defaultValue="chicken breast" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontFamily: 'inherit' }} />
          </div>
        </div>
        <ListGroup header="Suggestions">
          {[['Chicken breast, boneless', 'Poultry · 4–5 days fresh', true], ['Chicken breast, bone-in', 'Poultry · 3–4 days fresh', false], ['Chicken thigh', 'Poultry · 3–4 days fresh', false]].map(([n, sub, sel], i) => (
            <div key={n} style={{ padding: '11px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', border: sel ? '6px solid var(--gg-tint)' : '1.5px solid var(--ios-fill-1)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{n}</div>
                <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{sub}</div>
              </div>
            </div>
          ))}
        </ListGroup>
        <ListGroup>
          <ToggleRow title="Apply to past 'BNLS CHKN BRST' lines" on={true} />
          <ToggleRow title="Remember for future receipts" on={true} />
        </ListGroup>
      </div>
    </Phone>
  );
}

// MP-03 · Recipe detail (ingredients, steps, mark as cooked)
function RecipeDetail() {
  const ingredients = [
    ['Chicken breast', '2 lb', true],
    ['Romaine', '2 heads', true],
    ['Parmesan', '1/2 cup', true],
    ['Caesar dressing', '1/3 cup', true],
    ['Croutons', '1 cup', false],
    ['Lemon', '1', true],
  ];
  return (
    <Phone label="MP-03 · Recipe detail">
      <div style={{ height: 140, backgroundImage: 'url(https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80&auto=format&fit=crop)', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.5) 100%)' }} />
        <div style={{ position: 'absolute', top: 14, left: 12, padding: '6px 10px', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', borderRadius: 999, color: '#fff', fontSize: 13 }}>← Recipes</div>
        <div style={{ position: 'absolute', top: 14, right: 12, padding: '6px 10px', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', borderRadius: 999, color: '#fff', fontSize: 13 }}>♡ Save</div>
        <div style={{ position: 'absolute', bottom: 12, left: 14, color: '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', opacity: 0.95 }}>FROM YOUR PANTRY · 100% MATCH</div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '14px 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Chicken Caesar Bowl</div>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 4, display: 'flex', gap: 12 }}>
            <span>⏱ 25 min</span><span>🔥 480 cal</span><span>👤 2 servings</span>
          </div>
        </div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 12, padding: 12, fontSize: 13, color: 'var(--ios-label-2)', lineHeight: 1.4 }}>
          Uses <strong style={{ color: 'var(--gg-tint)' }}>chicken breast</strong> from your pantry — expires in 5 days.
        </div>
        <ListGroup header="Ingredients · 5 of 6 in pantry">
          {ingredients.map(([n, q, have], i) => (
            <div key={n} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: have ? 'var(--gg-tint)' : 'var(--ios-fill-2)', color: have ? '#fff' : 'var(--ios-label-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {have ? <SF.check size={11} /> : <SF.plus size={10} />}
              </div>
              <span style={{ flex: 1, fontSize: 14, color: have ? 'var(--ios-label)' : 'var(--ios-label-2)' }}>{n}</span>
              <span style={{ fontSize: 12, color: 'var(--ios-label-2)', fontVariantNumeric: 'tabular-nums' }}>{q}</span>
            </div>
          ))}
        </ListGroup>
        <ListGroup header="Steps">
          {['Season chicken; sear 4 min/side until 165°F.', 'Slice romaine. Toss with dressing & parmesan.', 'Slice chicken, top salad with croutons & lemon.'].map((s, i) => (
            <div key={i} style={{ padding: '11px 14px', display: 'flex', gap: 10, borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--gg-tint-bg)', color: 'var(--gg-tint)', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{i + 1}</div>
              <span style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>{s}</span>
            </div>
          ))}
        </ListGroup>
        <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <SF.check size={16} /> Mark as cooked
        </button>
        <div style={{ fontSize: 12, color: 'var(--ios-label-2)', textAlign: 'center', marginTop: -4 }}>Deducts ingredients from your pantry.</div>
      </div>
    </Phone>
  );
}

// MP-02 · Mark as used / partial / discarded
function PantryItemSheet() {
  return (
    <Phone label="MP-02 · Item action">
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* dimmed pantry behind */}
        <div style={{ padding: '0 16px', opacity: 0.5 }}>
          <div style={{ fontSize: 28, fontWeight: 700, padding: '4px 4px 12px' }}>Pantry</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sys-orange)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 4px 6px' }}>Use soon</div>
          <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
            {[
              ['Bananas', '4 left', '1 day', 'var(--sys-orange)', SF.cart, true],
              ['Spinach', '1 bag', '2 days', 'var(--sys-orange)', SF.cart, false],
              ['Greek yogurt', '500g', '3 days', 'var(--sys-orange)', SF.cart, false],
            ].map(([n, q, d, c, I, sel], i) => (
              <div key={n} style={{ padding: '10px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 10, background: sel ? 'var(--ios-fill-3)' : 'transparent' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: c, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}><I size={13} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{n}</div>
                  <div style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>{q}</div>
                </div>
                <span style={{ fontSize: 11, color: c, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{d}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 4px 6px' }}>Fresh</div>
          <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, overflow: 'hidden' }}>
            {[
              ['Chicken breast', '2 lb', '5 days'],
              ['Sourdough', '1 loaf', '4 days'],
            ].map(([n, q, d], i) => (
              <div key={n} style={{ padding: '10px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--sys-green)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}><SF.cart size={13} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{n}</div>
                  <div style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>{q}</div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--ios-label-2)', fontVariantNumeric: 'tabular-nums' }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
        {/* dim overlay so the sheet pops */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8 }}>
          <div style={{ background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(24px)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', textAlign: 'center', borderBottom: '0.5px solid var(--ios-separator)' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Bananas · 4 left</div>
              <div style={{ fontSize: 12, color: 'var(--sys-orange)', marginTop: 2 }}>Use within 1 day</div>
            </div>
            {[
              ['Used all', SF.check, 'var(--gg-tint)'],
              ['Used some', null, 'var(--gg-tint)'],
              ['Discarded', null, 'var(--sys-red)'],
            ].map(([t, I, c], i) => (
              <div key={t} style={{ padding: '14px 18px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 17, color: c, fontWeight: t === 'Used all' ? 600 : 400 }}>{t}</span>
                {I && <I size={16} color={c} />}
                {!I && t === 'Used some' && <span style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>Set quantity →</span>}
                {!I && t === 'Discarded' && <span style={{ fontSize: 11, color: 'var(--sys-red)', background: 'rgba(255,59,48,0.10)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>WASTE</span>}
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(24px)', borderRadius: 14, marginTop: 8, padding: '14px 18px', textAlign: 'center' }}>
            <span style={{ fontSize: 17, color: 'var(--gg-tint)', fontWeight: 600 }}>Cancel</span>
          </div>
        </div>
      </div>
    </Phone>
  );
}

// MP-03 · Dietary filter sheet
function DietaryFilters() {
  return (
    <Phone label="MP-03 · Diet filters">
      <NavBar left="Cancel" title="Filters" right="Apply" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup header="Diet" footer="Recipes that conflict with your selection are hidden.">
          {[['Vegetarian', false], ['Vegan', false], ['Pescatarian', false], ['Keto', false], ['Paleo', false]].map(([n, on], i) => (
            <div key={n} style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <span style={{ fontSize: 15 }}>{n}</span>
              <Toggle on={on} />
            </div>
          ))}
        </ListGroup>
        <ListGroup header="Allergens to avoid">
          {[['Gluten', true], ['Dairy', false], ['Nuts', true], ['Shellfish', false], ['Eggs', false], ['Soy', false]].map(([n, on], i) => (
            <div key={n} style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <span style={{ fontSize: 15 }}>{n}</span>
              <Toggle on={on} />
            </div>
          ))}
        </ListGroup>
        <ListGroup header="Quick filters">
          <ListRow title="Max time" value="≤ 30 min" accessory={<SF.chevron />} />
          <ListRow title="Difficulty" value="Any" accessory={<SF.chevron />} />
          <ListRow title="Min match" value="80%" accessory={<SF.chevron />} />
        </ListGroup>
      </div>
    </Phone>
  );
}

// MP · Pantry duplicate detection
function PantryDup() {
  return (
    <Phone label="MP · Duplicate?">
      <NavBar left="Skip" title="Duplicate?" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>You already have</div>
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>Chicken breast · 1.5 lb</div>
          <div style={{ fontSize: 12, color: 'var(--sys-green)', marginTop: 2 }}>Fresh · 4 days left</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ios-label-2)', fontSize: 12, gap: 6 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--ios-separator)' }} />
          <span>+ from today's receipt</span>
          <div style={{ flex: 1, height: 1, background: 'var(--ios-separator)' }} />
        </div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>Just bought</div>
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>Chicken breast · 2 lb</div>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 2 }}>Costco · today</div>
        </div>
        <div style={{ background: 'var(--gg-tint-bg)', borderRadius: 12, padding: 12, fontSize: 13, color: 'var(--ios-label-2)', lineHeight: 1.4 }}>
          Combine to track <strong style={{ color: 'var(--gg-tint)' }}>3.5 lb total</strong>. Each batch keeps its own expiry.
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600 }}>Combine</button>
          <button style={{ height: 50, background: 'var(--ios-bg-2)', color: 'var(--ios-label)', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600 }}>Keep separate</button>
        </div>
      </div>
    </Phone>
  );
}

function Toggle({ on }) {
  return (
    <div style={{ width: 51, height: 31, borderRadius: 999, background: on ? 'var(--gg-tint)' : 'var(--ios-fill-1)', padding: 2, display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
      <div style={{ width: 27, height: 27, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }} />
    </div>
  );
}
function ToggleRow({ title, on }) {
  return (
    <div style={{ padding: '11px 16px', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 15 }}>{title}</span><Toggle on={on} />
    </div>
  );
}
function Row({ children }) { return <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>{children}</div>; }

window.MPGap = {
  SectionMPGap: () => <Row><IngredientFix /><RecipeDetail /><PantryItemSheet /><DietaryFilters /><PantryDup /></Row>,
};
