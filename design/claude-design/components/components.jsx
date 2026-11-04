/* global React, GG */
const { Sheet, ArtLabel, Icon } = window.GG;

// Reusable Button
function Btn({ variant = 'primary', size = 'md', icon, children, disabled }) {
  const h = size === 'lg' ? 52 : size === 'sm' ? 36 : 44;
  const styles = {
    primary:  { bg: 'var(--gg-leaf-700)', fg: 'var(--gg-cream-50)', bd: 'transparent' },
    secondary:{ bg: 'var(--gg-paper)',    fg: 'var(--gg-ink-900)',  bd: 'var(--gg-ink-100)' },
    ghost:    { bg: 'transparent',        fg: 'var(--gg-leaf-700)', bd: 'transparent' },
    danger:   { bg: 'var(--gg-danger-500)',fg: '#fff',              bd: 'transparent' },
  }[variant];
  return (
    <button
      disabled={disabled}
      style={{
        height: h, minWidth: h,
        padding: size === 'sm' ? '0 12px' : '0 18px',
        background: disabled ? 'var(--gg-ink-100)' : styles.bg,
        color: disabled ? 'var(--gg-ink-300)' : styles.fg,
        border: `1px solid ${styles.bd}`,
        borderRadius: 999,
        fontFamily: 'var(--font-sans)',
        fontSize: size === 'sm' ? 13 : 15,
        fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function Input({ label, value, placeholder, money, error, helper }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gg-ink-700)' }}>{label}</label>}
      <div style={{ position: 'relative', height: 48, display: 'flex', alignItems: 'center', borderRadius: 12, background: 'var(--gg-paper)', border: `1px solid ${error ? 'var(--gg-danger-500)' : 'var(--gg-ink-100)'}`, padding: '0 14px' }}>
        {money && <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--gg-ink-500)', marginRight: 6 }}>$</span>}
        <input
          readOnly
          value={value || ''}
          placeholder={placeholder}
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: money ? 20 : 15, fontFamily: money ? 'var(--font-display)' : 'var(--font-sans)', fontVariantNumeric: 'tabular-nums', background: 'transparent', color: 'var(--gg-ink-900)' }}
        />
      </div>
      {(helper || error) && <span style={{ fontSize: 12, color: error ? 'var(--gg-danger-500)' : 'var(--gg-ink-500)' }}>{error || helper}</span>}
    </div>
  );
}

function Chip({ children, tone = 'default', icon, selected }) {
  const palette = {
    default: { bg: 'var(--gg-cream-100)', fg: 'var(--gg-ink-900)', bd: 'transparent' },
    leaf:    { bg: 'var(--gg-leaf-100)',  fg: 'var(--gg-leaf-900)', bd: 'transparent' },
    saffron: { bg: 'var(--gg-saffron-100)',fg: 'var(--gg-saffron-700)', bd: 'transparent' },
    danger:  { bg: 'var(--gg-danger-100)', fg: 'var(--gg-danger-700)', bd: 'transparent' },
  }[tone];
  const s = selected ? { bg: 'var(--gg-ink-900)', fg: 'var(--gg-cream-50)', bd: 'transparent' } : palette;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: 999, background: s.bg, color: s.fg, fontSize: 12, fontWeight: 600, border: `1px solid ${s.bd}` }}>
      {icon}
      {children}
    </span>
  );
}

function ComponentsBoard() {
  return (
    <Sheet pad={40}>
      <ArtLabel hint="Buttons · inputs · chips · tabs · toggles">Components</ArtLabel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Buttons</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Btn>Save Budget</Btn>
              <Btn variant="secondary">Cancel</Btn>
              <Btn variant="ghost">Skip</Btn>
              <Btn variant="danger">Delete</Btn>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Btn size="lg" icon={<Icon.Camera size={18} />}>Scan Receipt</Btn>
              <Btn size="sm" variant="secondary" icon={<Icon.Plus size={14} />}>Add item</Btn>
              <Btn disabled>Saving…</Btn>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 10px' }}>Inputs</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 340 }}>
            <Input label="Overall monthly budget" value="400.00" money />
            <Input label="Store name" value="Trader Joe's" />
            <Input label="Total" value="ab c" money error="Low confidence · tap to verify" />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Chips</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Chip>Groceries</Chip>
            <Chip tone="leaf">On track</Chip>
            <Chip tone="saffron" icon={<Icon.Sparkle size={12} />}>Under budget</Chip>
            <Chip tone="danger">Over 100%</Chip>
            <Chip selected>This week</Chip>
            <Chip>This month</Chip>
            <Chip>All</Chip>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 10px' }}>Segmented · tabs</div>
          <div style={{ display: 'inline-flex', background: 'var(--gg-cream-100)', padding: 4, borderRadius: 999, gap: 2 }}>
            {['Week', 'Month', 'Year'].map((t, i) => (
              <div key={t} style={{ padding: '8px 18px', borderRadius: 999, background: i === 1 ? 'var(--gg-paper)' : 'transparent', fontSize: 13, fontWeight: 600, color: 'var(--gg-ink-900)', boxShadow: i === 1 ? 'var(--sh-card)' : 'none' }}>{t}</div>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 10px' }}>Toggle · switch</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Toggle on label="80% threshold" />
            <Toggle label="100% threshold" />
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 10px' }}>Tab bar · iOS</div>
          <div style={{ background: 'var(--gg-paper)', borderRadius: 20, boxShadow: 'var(--sh-card)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', maxWidth: 340 }}>
            {[
              ['Dashboard', Icon.Chart, true],
              ['Scan', Icon.Camera, false],
              ['History', Icon.Clock, false],
            ].map(([t, I, active]) => (
              <div key={t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: active ? 'var(--gg-leaf-700)' : 'var(--gg-ink-500)' }}>
                <I size={22} />
                <span style={{ fontSize: 10, fontWeight: 600 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function Toggle({ on, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 44, height: 26, borderRadius: 999, background: on ? 'var(--gg-leaf-700)' : 'var(--gg-ink-100)', padding: 2, display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: 'var(--sh-card)' }} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--gg-ink-900)' }}>{label}</span>
    </div>
  );
}

window.ComponentsBoard = ComponentsBoard;
window.GGCtl = { Btn, Input, Chip, Toggle };
