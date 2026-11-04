/* global React, GG */
const { Sheet, ArtLabel } = window.GG;

function SpacingBoard() {
  const steps = [
    ['xs', 4], ['sm', 8], ['md', 12], ['base', 16],
    ['lg', 20], ['xl', 24], ['2xl', 32], ['3xl', 48],
  ];
  const radii = [['sm', 6], ['md', 12], ['lg', 16], ['xl', 22], ['full', 9999]];
  return (
    <Sheet pad={40}>
      <ArtLabel hint="4pt base · touch target 44pt min">Spacing · radius · shadow</ArtLabel>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 32 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gg-ink-700)', marginBottom: 12 }}>Spacing scale</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {steps.map(([name, px]) => (
              <div key={name} style={{ display: 'grid', gridTemplateColumns: '60px 50px 1fr', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gg-ink-500)' }}>{name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--gg-ink-900)', fontWeight: 600 }}>{px}px</span>
                <div style={{ height: 16, background: 'var(--gg-leaf-100)', borderLeft: '2px solid var(--gg-leaf-700)', borderRadius: 2, width: px * 2.2 + 'px' }} />
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gg-ink-700)', marginBottom: 12 }}>Radius</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {radii.map(([name, px]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 56, height: 56, background: 'var(--gg-cream-100)', border: '1px solid var(--gg-ink-100)', borderRadius: px }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gg-ink-900)' }}>{name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gg-ink-500)' }}>{px === 9999 ? 'pill' : px + 'px'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gg-ink-700)', marginBottom: 12 }}>Elevation</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ElevDemo name="Card" css="0 2px 8px rgba(23,26,20,0.08)" hint="Resting" />
            <ElevDemo name="Elevated" css="0 4px 12px rgba(23,26,20,0.12)" hint="Hover · pressed" />
            <ElevDemo name="Modal" css="0 12px 32px rgba(23,26,20,0.18)" hint="Sheet · dialog" />
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--gg-ink-100)', paddingTop: 24, marginTop: 8 }}>
        <ArtLabel hint="Applied to a receipt card — 16/12/8 rhythm">Layout sample</ArtLabel>
        <div style={{ background: 'var(--gg-paper)', borderRadius: 16, padding: 16, marginTop: 10, boxShadow: 'var(--sh-card)', border: '1px solid rgba(23,26,20,0.04)', maxWidth: 420 }}>
          <Guide py={16} px={16}>
            <Guide py={0} px={0} inner>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--gg-ink-900)' }}>Trader Joe's</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--gg-ink-900)', fontVariantNumeric: 'tabular-nums' }}>$58.42</div>
              </div>
              <div style={{ height: 8 }} />
              <div style={{ fontSize: 13, color: 'var(--gg-ink-500)' }}>April 19 · 12 items</div>
            </Guide>
          </Guide>
        </div>
      </div>
    </Sheet>
  );
}

function Guide({ children, py, px, inner }) {
  return (
    <div style={{ position: 'relative', padding: `${py}px ${px}px`, outline: inner ? 'none' : '1px dashed rgba(45,122,79,0.3)', borderRadius: 8 }}>
      {!inner && (
        <span style={{ position: 'absolute', top: -8, left: 8, background: 'var(--gg-paper)', padding: '0 4px', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--gg-leaf-700)', letterSpacing: '0.1em' }}>
          PAD · {px}
        </span>
      )}
      {children}
    </div>
  );
}

function ElevDemo({ name, css, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 56, height: 56, background: 'var(--gg-paper)', borderRadius: 12, boxShadow: css }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gg-ink-500)' }}>{hint}</div>
      </div>
    </div>
  );
}

window.SpacingBoard = SpacingBoard;
