/* global React, GG2 */
const { SF, ListGroup, ListRow } = window.GG2;
const { BudgetRing } = window;

// Reusable phone shell
function Phone({ children, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <div style={{ width: 300, height: 620, borderRadius: 44, background: '#000', padding: 6, boxShadow: '0 12px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 38, background: 'var(--ios-bg)', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sf)' }}>
          <StatusBar />
          {children}
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ios-label-2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

function StatusBar() {
  return (
    <div style={{ height: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 22px 4px', fontSize: 13, fontWeight: 600, color: 'var(--ios-label)' }}>
      <span>9:41</span>
      <span style={{ fontFamily: 'var(--font-mono)' }}>●●●●</span>
    </div>
  );
}

function NavBar({ left, title, right, large }) {
  return (
    <div style={{ padding: large ? '4px 16px 0' : '4px 16px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 32 }}>
        <span style={{ fontSize: 15, color: 'var(--gg-tint)' }}>{left}</span>
        {!large && <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>}
        <span style={{ fontSize: 15, color: 'var(--gg-tint)', fontWeight: 600 }}>{right}</span>
      </div>
      {large && <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.36px', marginTop: 4 }}>{title}</div>}
    </div>
  );
}

function TabBar({ active }) {
  const tabs = [['Budget', SF.cart], ['Scan', SF.viewfinder], ['History', SF.clock]];
  return (
    <div style={{ position: 'absolute', bottom: 14, left: 12, right: 12, background: 'var(--mat-chrome)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', borderRadius: 999, padding: 6, display: 'flex', justifyContent: 'space-around', boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)' }}>
      {tabs.map(([t, I]) => {
        const a = t === active;
        return (
          <div key={t} style={{ padding: '8px 14px', borderRadius: 999, background: a ? 'var(--gg-tint-bg)' : 'transparent', display: 'flex', alignItems: 'center', gap: 6, color: a ? 'var(--gg-tint)' : 'var(--ios-label-2)' }}>
            <I size={16} /><span style={{ fontSize: 12, fontWeight: 600 }}>{t}</span>
          </div>
        );
      })}
    </div>
  );
}

window.PhoneShell = { Phone, NavBar, TabBar };
