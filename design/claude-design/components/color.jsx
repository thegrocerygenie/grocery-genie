/* global React, GG */
const { Sheet, ArtLabel, Swatch } = window.GG;

function ColorBoard() {
  return (
    <Sheet pad={40}>
      <div>
        <ArtLabel hint="Warm cream surfaces + a single grocery-green primary">Color</ArtLabel>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gg-ink-700)', marginBottom: 10 }}>Neutrals</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Swatch name="Cream 50" token="--gg-cream-50" value="#FBF8F2" textOn="light" />
          <Swatch name="Cream 100" token="--gg-cream-100" value="#F5F1E7" textOn="light" />
          <Swatch name="Cream 200" token="--gg-cream-200" value="#ECE5D3" textOn="light" />
          <Swatch name="Paper" token="--gg-paper" value="#FFFFFF" textOn="light" />
          <Swatch name="Ink 100" token="--gg-ink-100" value="#E5E2D6" textOn="light" />
          <Swatch name="Ink 300" token="--gg-ink-300" value="#A8ADA0" textOn="light" />
          <Swatch name="Ink 500" token="--gg-ink-500" value="#6B7261" />
          <Swatch name="Ink 700" token="--gg-ink-700" value="#3A3F34" />
          <Swatch name="Ink 900" token="--gg-ink-900" value="#171A14" />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gg-ink-700)', marginBottom: 10 }}>Primary · Leaf</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Swatch name="Leaf 100" token="--gg-leaf-100" value="#E8F5EE" textOn="light" />
          <Swatch name="Leaf 200" token="--gg-leaf-200" value="#C8E4D3" textOn="light" />
          <Swatch name="Leaf 500" token="--gg-leaf-500" value="#4CA677" />
          <Swatch name="Leaf 700" token="--gg-leaf-700" value="#2D7A4F" size="lg" />
          <Swatch name="Leaf 900" token="--gg-leaf-900" value="#1B4A30" />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gg-ink-700)', marginBottom: 10 }}>Accent · Saffron <span style={{ fontWeight: 400, color: 'var(--gg-ink-500)' }}>— sparkles, highlights, earned moments only</span></div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Swatch name="Saffron 100" token="--gg-saffron-100" value="#FEF6E0" textOn="light" />
          <Swatch name="Saffron 200" token="--gg-saffron-200" value="#FCE3A7" textOn="light" />
          <Swatch name="Saffron 500" token="--gg-saffron-500" value="#F2A71F" textOn="light" />
          <Swatch name="Saffron 700" token="--gg-saffron-700" value="#C8870B" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gg-ink-700)', marginBottom: 10 }}>Semantic</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Swatch name="Success" token="--gg-success-500" value="#34A853" size="sm" />
            <Swatch name="Success tint" token="--gg-success-100" value="#E6F4EA" size="sm" textOn="light" />
            <Swatch name="Warning" token="--gg-warning-500" value="#F9AB00" size="sm" textOn="light" />
            <Swatch name="Warning tint" token="--gg-warning-100" value="#FEF7E0" size="sm" textOn="light" />
            <Swatch name="Danger" token="--gg-danger-500" value="#EA4335" size="sm" />
            <Swatch name="Danger tint" token="--gg-danger-100" value="#FCE8E6" size="sm" textOn="light" />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gg-ink-700)', marginBottom: 10 }}>Category · 8 slots · OKLCH L 0.72 · C 0.09</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              ['Groceries', '--cat-groceries'],
              ['Household', '--cat-household'],
              ['Personal', '--cat-personal-care'],
              ['Beverages', '--cat-beverages'],
              ['Snacks', '--cat-snacks'],
              ['Baby & Kids', '--cat-baby-kids'],
              ['Pet', '--cat-pet'],
              ['Other', '--cat-other'],
            ].map(([name, token]) => (
              <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ height: 44, borderRadius: 10, background: `var(${token})`, border: '1px solid rgba(23,26,20,0.06)' }} />
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gg-ink-900)' }}>{name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--gg-ink-500)' }}>{token}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contrast table */}
      <div>
        <ArtLabel>Contrast · WCAG AA on cream surfaces</ArtLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
          {[
            { bg: 'var(--gg-cream-50)', fg: 'var(--gg-ink-900)', ratio: '15.2', label: 'ink-900 / cream-50' },
            { bg: 'var(--gg-cream-50)', fg: 'var(--gg-ink-500)', ratio: '4.8', label: 'ink-500 / cream-50' },
            { bg: 'var(--gg-leaf-700)', fg: '#FBF8F2', ratio: '5.6', label: 'cream / leaf-700' },
            { bg: 'var(--gg-cream-50)', fg: 'var(--gg-leaf-700)', ratio: '4.9', label: 'leaf-700 / cream-50' },
          ].map((c) => (
            <div key={c.label} style={{ background: c.bg, color: c.fg, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(23,26,20,0.06)' }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>Aa {c.ratio}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.75, marginTop: 4 }}>{c.label}</div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

window.ColorBoard = ColorBoard;
