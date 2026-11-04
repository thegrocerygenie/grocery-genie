/* global React, GG */
// Brand artboard — mark, wordmark, voice
const { Sheet, ArtLabel, GGMark } = window.GG;

function BrandBoard() {
  return (
    <Sheet pad={40} bg="var(--gg-cream-50)">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <ArtLabel>Brand · 01</ArtLabel>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 400, margin: '4px 0 0', letterSpacing: '-0.02em', color: 'var(--gg-ink-900)' }}>
            Grocery Genie
          </h1>
          <p style={{ fontSize: 15, color: 'var(--gg-ink-500)', maxWidth: 520, marginTop: 10, lineHeight: 1.5 }}>
            Scan a receipt, watch your grocery budget take shape. A quietly magical
            companion for the weekly shop.
          </p>
        </div>
        <GGMark size={80} />
      </div>

      {/* Wordmark lockups */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: 'var(--gg-paper)', borderRadius: 16, padding: 28, display: 'flex', alignItems: 'center', gap: 18, border: '1px solid var(--gg-ink-100)' }}>
          <GGMark size={56} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: 1, color: 'var(--gg-ink-900)', letterSpacing: '-0.02em' }}>Grocery Genie</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gg-leaf-700)', marginTop: 6 }}>receipt · budget · delight</div>
          </div>
        </div>
        <div style={{ background: 'var(--gg-leaf-700)', borderRadius: 16, padding: 28, display: 'flex', alignItems: 'center', gap: 18 }}>
          <GGMark size={56} tone="cream" />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: 1, color: 'var(--gg-cream-50)', letterSpacing: '-0.02em' }}>Grocery Genie</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gg-saffron-200)', marginTop: 6 }}>on leaf</div>
          </div>
        </div>
      </div>

      {/* Mark variants */}
      <div>
        <ArtLabel hint="App icon · notification · monochrome">Mark variants</ArtLabel>
        <div style={{ display: 'flex', gap: 18, marginTop: 12, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <GGMark size={96} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gg-ink-500)' }}>primary · 96</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <GGMark size={64} tone="ink" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gg-ink-500)' }}>ink · 64</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <GGMark size={48} tone="cream" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gg-ink-500)' }}>cream · 48</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <GGMark size={32} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gg-ink-500)' }}>tab · 32</span>
          </div>
        </div>
      </div>

      {/* Voice */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <ArtLabel>Voice</ArtLabel>
          <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Warm, not chirpy.', 'We speak like a helpful neighbor, not a mascot.'],
              ['Numbers lead.', 'Show the spend first; commentary second.'],
              ['Small magic.', 'A sparkle earns its place — never decoration.'],
              ['Never shame.', 'Over budget is information, not a verdict.'],
            ].map(([t, d]) => (
              <li key={t} style={{ display: 'flex', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gg-leaf-700)', lineHeight: 1 }}>·</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gg-ink-900)' }}>{t}</div>
                  <div style={{ fontSize: 13, color: 'var(--gg-ink-500)' }}>{d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <ArtLabel>Copy samples</ArtLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <Quote good text="$142 left — about $23 a day for the rest of the week." />
            <Quote text="Amazing! You're crushing your budget 🎉" bad />
            <Quote good text="Snapped. Three items need a quick check." />
            <Quote text="Oops! Something went wrong uploading your receipt 😓" bad />
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function Quote({ text, good, bad }) {
  return (
    <div style={{ border: '1px solid var(--gg-ink-100)', borderRadius: 12, padding: '10px 14px', background: 'var(--gg-paper)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: good ? 'var(--gg-leaf-700)' : 'var(--gg-danger-500)', marginTop: 3, letterSpacing: '0.1em' }}>{good ? 'DO' : 'DON\'T'}</span>
      <span style={{ fontSize: 14, color: 'var(--gg-ink-900)' }}>{text}</span>
    </div>
  );
}

window.BrandBoard = BrandBoard;
