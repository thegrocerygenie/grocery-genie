/* global React, GG2 */
const { Sheet2, Lbl, SF, ListGroup, ListRow } = window.GG2;

// iOS button hierarchy
function Btn({ role = 'filled', size = 'md', icon, children, destructive }) {
  const h = size === 'lg' ? 50 : size === 'sm' ? 34 : 44;
  let bg, fg, bd = 'transparent';
  if (destructive) {
    if (role === 'filled') { bg = 'var(--sys-red)'; fg = '#fff'; }
    else if (role === 'tinted') { bg = 'rgba(255,59,48,0.15)'; fg = 'var(--sys-red)'; }
    else { bg = 'transparent'; fg = 'var(--sys-red)'; }
  } else if (role === 'filled')   { bg = 'var(--gg-tint)'; fg = '#fff'; }
  else if (role === 'tinted')     { bg = 'var(--gg-tint-bg)'; fg = 'var(--gg-tint)'; }
  else if (role === 'gray')       { bg = 'var(--ios-fill-2)'; fg = 'var(--ios-label)'; }
  else /* plain */                { bg = 'transparent'; fg = 'var(--gg-tint)'; }
  return (
    <button style={{ height: h, padding: size === 'sm' ? '0 12px' : '0 18px', background: bg, color: fg, border: `1px solid ${bd}`, borderRadius: 12, fontFamily: 'var(--font-sf)', fontSize: size === 'sm' ? 14 : 17, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      {icon}{children}
    </button>
  );
}

function ComponentsV2() {
  return (
    <Sheet2 pad={36} bg="var(--ios-bg)">
      <Lbl hint="Buttons · lists · tab bar · all stock iOS">Components</Lbl>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-label-2)', marginBottom: 10 }}>BUTTONS — role × prominence</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn role="filled">Confirm & Save</Btn>
              <Btn role="tinted">Tinted</Btn>
              <Btn role="gray">Gray</Btn>
              <Btn role="plain">Plain</Btn>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn role="filled" destructive>Delete</Btn>
              <Btn role="tinted" destructive>Discard</Btn>
              <Btn role="plain" destructive>Cancel</Btn>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Btn size="lg" role="filled" icon={<SF.viewfinder size={18} />}>Scan Receipt</Btn>
              <Btn size="sm" role="tinted" icon={<SF.plus size={14} />}>Item</Btn>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-label-2)', margin: '22px 0 10px' }}>SEGMENTED CONTROL</div>
          <div style={{ display: 'inline-flex', background: 'var(--ios-fill-3)', padding: 2, borderRadius: 9, gap: 0 }}>
            {['Week', 'Month', 'Year'].map((t, i) => (
              <div key={t} style={{ padding: '6px 18px', borderRadius: 7, background: i === 1 ? 'var(--ios-bg-2)' : 'transparent', fontSize: 13, fontWeight: i === 1 ? 600 : 400, color: 'var(--ios-label)', boxShadow: i === 1 ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>{t}</div>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-label-2)', margin: '22px 0 10px' }}>FLOATING TAB BAR · iOS 18</div>
          <div style={{ background: 'var(--mat-chrome)', backdropFilter: 'blur(28px)', borderRadius: 999, padding: '8px 8px', display: 'inline-flex', gap: 4, boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)' }}>
            {[['Dashboard', SF.cart, true], ['Scan', SF.viewfinder, false], ['History', SF.clock, false]].map(([t, I, a]) => (
              <div key={t} style={{ padding: '8px 16px', borderRadius: 999, background: a ? 'var(--gg-tint-bg)' : 'transparent', display: 'flex', alignItems: 'center', gap: 6, color: a ? 'var(--gg-tint)' : 'var(--ios-label-2)' }}>
                <I size={18} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-label-2)', marginBottom: 10 }}>INSET GROUPED LIST · settings, review</div>
          <ListGroup header="Budget" footer="Amounts reset on the 1st of each month.">
            <ListRow icon={<SF.cart size={16} />} iconBg="var(--sys-green)" title="Overall" value="$400.00" accessory={<SF.chevron />} />
            <ListRow icon={<SF.bell size={16} />} iconBg="var(--sys-orange)" title="Alerts" detail="80% · 100% thresholds" accessory={<SF.chevron />} />
            <ListRow icon={<SF.clock size={16} />} iconBg="var(--sys-blue)" title="Start day" value="1st" accessory={<SF.chevron />} />
          </ListGroup>

          <div style={{ height: 16 }} />

          <ListGroup header="Receipt — Trader Joe's">
            <ListRow title="Store" value="Trader Joe's" />
            <ListRow title="Date" value="Apr 19, 2026" />
            <ListRow title="Total" value="$58.42" />
            <ListRow title="Category" value="Groceries" accessory={<SF.chevron />} />
          </ListGroup>
        </div>
      </div>
    </Sheet2>
  );
}

window.ComponentsV2 = ComponentsV2;
