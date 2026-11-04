/* global React, GG2 */
const { Sheet2, Lbl, SF } = window.GG2;

function FoundationsV2() {
  return (
    <Sheet2 pad={36} bg="var(--ios-bg)">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Lbl>Foundations · v2 · iOS-native</Lbl>
          <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 34, fontWeight: 700, letterSpacing: '0.37px', marginTop: 4, color: 'var(--ios-label)' }}>
            Defer to the system.
          </div>
          <div style={{ fontSize: 15, color: 'var(--ios-label-2)', marginTop: 4, maxWidth: 540, lineHeight: 1.45 }}>
            SF for everything. The wordmark is the only place a serif appears. Materials, not shadows. iOS color roles, not custom hex.
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-wordmark)', fontSize: 30, color: 'var(--ios-label)', letterSpacing: '-0.02em' }}>Grocery Genie</div>
      </div>

      {/* Type — Dynamic Type roles */}
      <div>
        <Lbl hint="SF Pro · Dynamic Type roles · auto-scales with iOS Settings">Typography</Lbl>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, marginTop: 8, padding: '4px 16px' }}>
          {[
            ['Large Title', 34, 700, 'SF Pro · 41 line · 0.37 tracking'],
            ['Title 1', 28, 700, '34 line · 0.36 tracking'],
            ['Title 2', 22, 700, '28 line · 0.35 tracking'],
            ['Headline', 17, 600, '22 line · -0.41 tracking'],
            ['Body', 17, 400, '22 line · -0.41 tracking'],
            ['Callout', 16, 400, '21 line · -0.32 tracking'],
            ['Subheadline', 15, 400, '20 line · -0.24 tracking'],
            ['Footnote', 13, 400, '18 line · -0.08 tracking'],
            ['Caption 1', 12, 400, '16 line · 0 tracking'],
          ].map(([n, sz, w, det], i) => (
            <div key={n} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 240px', alignItems: 'baseline', gap: 16, padding: '10px 0', borderTop: i ? '1px solid var(--ios-separator)' : 'none' }}>
              <div style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>{n}</div>
              <div style={{ fontFamily: 'var(--font-sf)', fontSize: sz, fontWeight: w, color: 'var(--ios-label)' }}>$1,234.56</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ios-label-2)' }}>{det}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Money — SF Pro Rounded */}
      <div>
        <Lbl hint="SF Pro Rounded · tabular-nums · used only for money">Money</Lbl>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, padding: 24, marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 28 }}>
          <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: 64, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--ios-label)' }}>$157.92</div>
          <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 600, fontSize: 28, color: 'var(--ios-label-2)', fontVariantNumeric: 'tabular-nums' }}>$400.00</div>
        </div>
      </div>

      {/* Color — system roles */}
      <div>
        <Lbl hint="iOS color roles auto-adapt to dark mode and accessibility filters">Color · system roles</Lbl>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginTop: 8 }}>
          {[
            ['Tint', 'var(--gg-tint)', '#1F7A4A'],
            ['Red', 'var(--sys-red)', 'systemRed'],
            ['Orange', 'var(--sys-orange)', 'systemOrange'],
            ['Yellow', 'var(--sys-yellow)', 'systemYellow'],
            ['Green', 'var(--sys-green)', 'systemGreen'],
            ['Mint', 'var(--sys-mint)', 'systemMint'],
            ['Teal', 'var(--sys-teal)', 'systemTeal'],
            ['Cyan', 'var(--sys-cyan)', 'systemCyan'],
            ['Blue', 'var(--sys-blue)', 'systemBlue'],
            ['Indigo', 'var(--sys-indigo)', 'systemIndigo'],
            ['Purple', 'var(--sys-purple)', 'systemPurple'],
            ['Pink', 'var(--sys-pink)', 'systemPink'],
          ].map(([n, c, t]) => (
            <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ height: 56, borderRadius: 10, background: c }} />
              <div style={{ fontSize: 12, fontWeight: 600 }}>{n}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ios-label-2)' }}>{t}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 12, lineHeight: 1.5 }}>
          The brand tint (<span style={{ fontFamily: 'var(--font-mono)' }}>#1F7A4A</span>) replaces the green from v1 with a slightly more muted hue.
          Categories map directly to the iOS palette so they inherit dark mode and Increase Contrast for free.
        </div>
      </div>

      {/* Materials */}
      <div>
        <Lbl hint="Translucent overlays — replace shadows on chrome surfaces">Materials</Lbl>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 8 }}>
          {[
            ['Thin', 'var(--mat-thin)', 'Tab bar over content'],
            ['Regular', 'var(--mat-regular)', 'Sheet headers'],
            ['Thick', 'var(--mat-thick)', 'Toasts'],
            ['Chrome', 'var(--mat-chrome)', 'Floating tab bar'],
          ].map(([n, c, use]) => (
            <div key={n} style={{ position: 'relative', height: 96, borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(135deg, var(--sys-blue), var(--sys-purple))' }}>
              <div style={{ position: 'absolute', inset: '38% 8px 8px', background: c, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-label)' }}>{n}</div>
                <div style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>{use}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet2>
  );
}

window.FoundationsV2 = FoundationsV2;
