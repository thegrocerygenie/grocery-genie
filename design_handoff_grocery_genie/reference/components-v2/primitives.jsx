/* global React */
// v2 primitives — SF Symbols-style icons, iOS list rows, materials.

// SF Symbols-equivalents — same metric weights as system text
const SF = {
  cart: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h2.5l2.4 11.2a2 2 0 002 1.6h7.6a2 2 0 002-1.6L21 8H7" />
      <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="17" cy="20" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),
  doc: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h9l4 4v14H6V3z" />
      <path d="M15 3v4h4M9 12h6M9 16h4" />
    </svg>
  ),
  camera: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="14" rx="3" />
      <path d="M8 6l1.5-2h5L16 6" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
  viewfinder: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V5a1 1 0 011-1h3M20 8V5a1 1 0 00-1-1h-3M4 16v3a1 1 0 001 1h3M20 16v3a1 1 0 01-1 1h-3" />
      <rect x="8" y="9" width="8" height="6" rx="1" />
    </svg>
  ),
  clock: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  ),
  bell: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15L6 16z" />
      <path d="M10 20a2 2 0 004 0" />
    </svg>
  ),
  gear: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3M12 19v3M22 12h-3M5 12H2M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7L5.6 5.6" />
    </svg>
  ),
  sparkles: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 3l1.6 4.4L17 9l-4.4 1.6L11 15l-1.6-4.4L5 9l4.4-1.6L11 3z" />
      <path d="M18 14l.7 1.8 1.8.7-1.8.7L18 19l-.7-1.8-1.8-.7 1.8-.7L18 14z" />
    </svg>
  ),
  chevron: (p) => (
    <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  check: (p) => (
    <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  ),
  plus: (p) => (
    <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  search: (p) => (
    <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  watch: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="6" width="12" height="12" rx="3" />
      <path d="M9 6l.5-3h5l.5 3M9 18l.5 3h5l.5-3" />
    </svg>
  ),
};

function Sheet2({ children, pad = 32, bg = 'var(--ios-bg-2)', style = {} }) {
  return (
    <div className="gg-root" style={{ background: bg, padding: pad, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 24, ...style }}>
      {children}
    </div>
  );
}

function Lbl({ children, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ios-label-2)' }}>{children}</span>
      {hint && <span style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{hint}</span>}
    </div>
  );
}

// iOS inset-grouped list
function ListGroup({ header, footer, children }) {
  const items = React.Children.toArray(children);
  return (
    <div>
      {header && <div style={{ fontSize: 13, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 16px 6px' }}>{header}</div>}
      <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, overflow: 'hidden' }}>
        {items.map((c, i) => (
          <React.Fragment key={i}>
            {c}
            {i < items.length - 1 && <div style={{ height: 1, background: 'var(--ios-separator)', marginLeft: 16 }} />}
          </React.Fragment>
        ))}
      </div>
      {footer && <div style={{ fontSize: 13, color: 'var(--ios-label-2)', padding: '6px 16px' }}>{footer}</div>}
    </div>
  );
}

function ListRow({ icon, iconBg, title, value, detail, accessory }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', minHeight: 44 }}>
      {icon && (
        <div style={{ width: 28, height: 28, borderRadius: 7, background: iconBg || 'var(--ios-fill-3)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, color: 'var(--ios-label)' }}>{title}</div>
        {detail && <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 1 }}>{detail}</div>}
      </div>
      {value && <div style={{ fontSize: 17, color: 'var(--ios-label-2)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>}
      {accessory && <div style={{ color: 'var(--ios-label-3)' }}>{accessory}</div>}
    </div>
  );
}

window.GG2 = { SF, Sheet2, Lbl, ListGroup, ListRow };
