/* global React, GG2, Roadmap */
// V3.0 — Advanced (LLM, semantic search, waste)
const { SF, ListGroup, ListRow } = window.GG2;
const { RPhone, RNav, RTabBar, ReleaseNote, PhoneRow } = window.Roadmap;

// AI-03 — LLM recipe variation
function RecipeRemix() {
  const subs = [
    { from: 'Buttermilk · 1 cup', to: 'Milk + lemon juice', impact: '−10 cal · neutral', accepted: true },
    { from: 'Maple syrup · 2 tbsp', to: 'Honey · 2 tbsp', impact: '+8 cal · sweeter', accepted: true },
    { from: 'Pecans · ½ cup', to: 'Walnuts · ½ cup', impact: '+15 cal · richer', accepted: null },
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav left="Recipe" title="Make it work" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <SF.sparkles size={14} />
            <span style={{ fontSize: 11, color: 'var(--gg-tint)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>AI · Substitution</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Banana oat pancakes</div>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 2 }}>Missing 3 ingredients. Here's how to make it from your pantry instead.</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {subs.map((s, i) => (
            <div key={i} style={{ background: 'var(--ios-bg-2)', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <span style={{ color: 'var(--ios-label-2)', textDecoration: 'line-through' }}>{s.from}</span>
                <SF.chevron size={12} />
                <span style={{ fontWeight: 600, flex: 1 }}>{s.to}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{s.impact}</span>
                {s.accepted === true ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--gg-tint)' }}>
                    <SF.check size={12} /> Accepted
                  </span>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={{ height: 28, padding: '0 12px', background: 'var(--gg-tint-bg)', color: 'var(--gg-tint)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Accept</button>
                    <button style={{ height: 28, padding: '0 12px', background: 'transparent', color: 'var(--ios-label-2)', border: 'none', borderRadius: 8, fontSize: 13 }}>Skip</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <SF.sparkles size={16} /> Generate modified recipe
        </button>
      </div>
    </div>
  );
}

// AI-06 — Semantic search
function SemanticSearch() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav left="Cancel" title="" right="" />
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ background: 'var(--ios-fill-3)', borderRadius: 10, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <SF.search size={15} />
          <span style={{ fontSize: 15, color: 'var(--ios-label)', flex: 1 }}>How much have I spent on coffee this year?</span>
          <span style={{ width: 2, height: 18, background: 'var(--gg-tint)', animation: 'blink 1s infinite' }} />
        </div>
      </div>

      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <SF.sparkles size={12} />
            <span style={{ fontSize: 11, color: 'var(--gg-tint)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Answer</span>
          </div>
          <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 32, fontWeight: 700, color: 'var(--ios-label)', fontVariantNumeric: 'tabular-nums' }}>$184.62</div>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 2 }}>Across 24 purchases · 4 stores · Jan – Apr 2026</div>
          <div style={{ height: 1, background: 'var(--ios-separator)', margin: '12px -14px' }} />
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)', lineHeight: 1.5 }}>
            That's 14% of your beverage spend. Mostly Trader Joe's whole bean ($89), plus 8 coffees at cafés.
          </div>
        </div>

        <ListGroup header="Top sources">
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-green)" title="Trader Joe's" detail="9 receipts · whole bean" value="$89.10" />
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-brown)" title="Blue Bottle" detail="6 receipts · drinks" value="$48.30" />
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-blue)" title="Costco" detail="2 receipts · 2lb bags" value="$31.98" />
        </ListGroup>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['What about tea?', 'Compare Q1 to Q2', 'By store'].map(t => (
            <div key={t} style={{ padding: '6px 12px', background: 'var(--gg-tint-bg)', color: 'var(--gg-tint)', fontSize: 13, fontWeight: 500, borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <SF.sparkles size={11} /> {t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// AI-04 — Food waste score
function WasteScore() {
  const weeks = [82, 78, 71, 75, 68, 73, 89, 84];
  const W = 252, H = 110, pad = 6;
  const max = 100;
  const barW = (W - pad * 2) / weeks.length - 4;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav title="Food waste" right="" left="" large />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>This week · use rate</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <span style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 44, fontWeight: 700, color: 'var(--gg-tint)', fontVariantNumeric: 'tabular-nums' }}>89%</span>
            <span style={{ fontSize: 13, color: 'var(--gg-tint)', fontWeight: 600 }}>+5 vs last week</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 2 }}>Better than 71% of households</div>

          <svg width={W} height={H} style={{ marginTop: 14, display: 'block' }}>
            {weeks.map((v, i) => {
              const x = pad + i * (barW + 4);
              const h = (v / max) * (H - 16);
              const isThis = i === weeks.length - 1;
              return (
                <g key={i}>
                  <rect x={x} y={H - 16} width={barW} height={12} fill="var(--ios-fill-3)" rx="2" />
                  <rect x={x} y={H - 16 - h} width={barW} height={h} fill={isThis ? 'var(--gg-tint)' : 'color-mix(in oklab, var(--gg-tint) 35%, white)'} rx="2" />
                </g>
              );
            })}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ios-label-2)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            <span>8w ago</span><span>this week</span>
          </div>
        </div>

        <ListGroup header="What changed this week">
          <ListRow icon={<SF.check size={14} />} iconBg="var(--sys-green)" title="14 items used" detail="of 16 purchased" />
          <ListRow icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12.5V20a2 2 0 002 2h10a2 2 0 002-2v-7.5M3 7h18M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" /></svg>}
                   iconBg="var(--sys-red)" title="2 items discarded" detail="lettuce, tomatoes" />
          <ListRow icon={<SF.sparkles size={14} />} iconBg="var(--gg-tint)" title="Recipe streak" detail="3 expiry-aware recipes cooked" value="🔥" />
        </ListGroup>

        <div style={{ background: 'rgba(31,122,74,0.08)', borderRadius: 12, padding: 12, fontSize: 12, color: 'var(--ios-label-2)', lineHeight: 1.45 }}>
          You've prevented an estimated <strong style={{ color: 'var(--gg-tint)' }}>$24 of food waste</strong> this month by cooking from the pantry.
        </div>
      </div>
    </div>
  );
}

// V3.0 — Taste profile
function TasteProfile() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav left="Settings" title="Taste profile" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <SF.sparkles size={12} />
            <span style={{ fontSize: 11, color: 'var(--gg-tint)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Learned from your scans</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>You cook Mediterranean and Mexican most</div>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 2, lineHeight: 1.45 }}>
            Recipes you actually finish lean herby and bright. We'll prioritize these.
          </div>
        </div>

        <div style={{ fontSize: 13, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 4px' }}>Cuisines · top 5</div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['Mediterranean', 38, 'var(--sys-blue)'],
            ['Mexican', 24, 'var(--sys-orange)'],
            ['Italian', 18, 'var(--sys-red)'],
            ['Asian', 12, 'var(--sys-green)'],
            ['American', 8, 'var(--ios-label-3)'],
          ].map(([n, p, c]) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 500, width: 110 }}>{n}</span>
              <div style={{ flex: 1, height: 6, background: 'var(--ios-fill-3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: p + '%', height: '100%', background: c }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--ios-label-2)', fontVariantNumeric: 'tabular-nums', width: 28, textAlign: 'right' }}>{p}%</span>
            </div>
          ))}
        </div>

        <ListGroup header="Preferences">
          <ListRow title="Avoid" detail="cilantro, blue cheese" accessory={<SF.chevron />} />
          <ListRow title="Love" detail="lemon, garlic, chili crisp" accessory={<SF.chevron />} />
          <ListRow title="Dietary" detail="None active" accessory={<SF.chevron />} />
        </ListGroup>
      </div>
    </div>
  );
}

function V30Screens() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ReleaseNote>
        <strong style={{ color: 'var(--ios-label)' }}>V3.0 · Advanced.</strong> Years of data feed the smart parts: ask receipts in plain language, generate recipes from what's actually in the pantry, see waste trending down week over week, and let the system learn your taste from what you actually cook.
      </ReleaseNote>
      <PhoneRow>
        <RPhone label="AI-03 · Recipe Remix"><RecipeRemix /></RPhone>
        <RPhone label="AI-06 · Semantic Search"><SemanticSearch /></RPhone>
        <RPhone label="AI-04 · Waste Score"><WasteScore /></RPhone>
        <RPhone label="V3 · Taste Profile"><TasteProfile /></RPhone>
      </PhoneRow>
    </div>
  );
}

window.V30Screens = V30Screens;
