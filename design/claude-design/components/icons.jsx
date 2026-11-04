/* global React, GG */
const { Sheet, ArtLabel, Icon } = window.GG;

function IconBoard() {
  const icons = [
    ['Receipt', Icon.Receipt], ['Sparkle', Icon.Sparkle], ['Camera', Icon.Camera],
    ['Chart', Icon.Chart], ['Clock', Icon.Clock], ['Bell', Icon.Bell],
    ['Check', Icon.Check], ['Plus', Icon.Plus], ['Settings', Icon.Settings],
    ['Search', Icon.Search],
  ];
  return (
    <Sheet pad={40}>
      <ArtLabel hint="Line style · 1.5 stroke · 24px grid · rounded caps">Iconography</ArtLabel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginTop: 4 }}>
        {icons.map(([name, I]) => (
          <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 14, background: 'var(--gg-paper)', border: '1px solid var(--gg-ink-100)', borderRadius: 12 }}>
            <div style={{ color: 'var(--gg-ink-900)' }}><I size={28} /></div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gg-ink-900)' }}>{name}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderTop: '1px solid var(--gg-ink-100)', paddingTop: 20 }}>
        <div>
          <ArtLabel>Sizes</ArtLabel>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, marginTop: 8 }}>
            {[16, 20, 24, 32].map(s => (
              <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Icon.Receipt size={s} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gg-ink-500)' }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <ArtLabel>Illustration — placeholder policy</ArtLabel>
          <div style={{ marginTop: 8, background: 'repeating-linear-gradient(135deg, var(--gg-cream-100) 0 6px, var(--gg-cream-50) 6px 12px)', border: '1px dashed var(--gg-ink-300)', borderRadius: 12, padding: '20px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gg-ink-500)', letterSpacing: '0.05em' }}>
            {'// empty-state illustration · commission or license · no ai slop'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--gg-ink-500)', marginTop: 8, lineHeight: 1.5 }}>
            Empty states use a single printed-line sketch of fruit, a basket, or a receipt. Stroke: 1.5 on cream.
            Never fill with AI-generated art.
          </div>
        </div>
      </div>
    </Sheet>
  );
}

window.IconBoard = IconBoard;
