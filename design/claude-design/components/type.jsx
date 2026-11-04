/* global React, GG */
const { Sheet, ArtLabel } = window.GG;

function TypeBoard() {
  return (
    <Sheet pad={40}>
      <div>
        <ArtLabel hint="Instrument Serif + Geist · pairing carries warmth through numbers">Typography</ArtLabel>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 96, fontWeight: 400, lineHeight: 0.95, color: 'var(--gg-ink-900)', letterSpacing: '-0.03em', marginTop: 12 }}>
          $142.08
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gg-ink-500)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>
          display · instrument serif · 96/92 · -3%
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 32, borderTop: '1px solid var(--gg-ink-100)', paddingTop: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Row label="display · serif 28/34 · 700" sample="Budget Overview" family="display" size={28} weight={600} />
          <Row label="section · sans 20/28 · 600" sample="By Category" size={20} weight={600} />
          <Row label="bodyBold · sans 16/24 · 600" sample="Trader Joe's" size={16} weight={600} />
          <Row label="body · sans 16/24 · 400" sample="Receipt scanned 2 minutes ago" size={16} weight={400} />
          <Row label="caption · sans 13/18 · 400" sample="Tap to edit · low confidence" size={13} weight={400} color="var(--gg-ink-500)" />
          <Row label="micro · mono 10 · 0.14em" sample="OVERALL · 61% OF $400" size={10} weight={500} mono letterSpacing="0.14em" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ArtLabel>Numerals · tabular</ArtLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', rowGap: 6, columnGap: 12, alignItems: 'baseline' }}>
            {[
              ['Large', 28, 700, 'var(--font-sans)'],
              ['Prominent', 20, 600, 'var(--font-sans)'],
              ['Body', 16, 600, 'var(--font-sans)'],
              ['Small', 13, 500, 'var(--font-sans)'],
              ['Hero', 48, 400, 'var(--font-display)'],
            ].map(([name, sz, w, f]) => (
              <React.Fragment key={name}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gg-ink-500)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{name}</div>
                <div style={{ fontFamily: f, fontSize: sz, fontWeight: w, fontVariantNumeric: 'tabular-nums', color: 'var(--gg-ink-900)', letterSpacing: f.includes('Instrument') ? '-0.02em' : 0 }}>
                  $1,234.56
                </div>
              </React.Fragment>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            <ArtLabel>Rules</ArtLabel>
            <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 13, lineHeight: 1.6, color: 'var(--gg-ink-700)' }}>
              <li>Money always uses <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>font-variant-numeric: tabular-nums</code>.</li>
              <li>Display serif is reserved for hero amounts and the wordmark.</li>
              <li>Minimum UI text size is 13pt; 12pt allowed only in monospace labels.</li>
              <li>Line-height ratio: 1.5 for body, 1.2 for display, 1 for numerals.</li>
            </ul>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function Row({ label, sample, size, weight, family, color, mono, letterSpacing }) {
  const fam = mono ? 'var(--font-mono)' : family === 'display' ? 'var(--font-display)' : 'var(--font-sans)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gg-ink-500)' }}>{label}</div>
      <div style={{ fontFamily: fam, fontSize: size, fontWeight: weight, color: color || 'var(--gg-ink-900)', letterSpacing: letterSpacing || (family === 'display' ? '-0.02em' : 0), textTransform: mono ? 'uppercase' : 'none' }}>
        {sample}
      </div>
    </div>
  );
}

window.TypeBoard = TypeBoard;
