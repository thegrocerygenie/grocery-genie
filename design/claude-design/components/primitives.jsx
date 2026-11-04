/* global React */
// Shared primitives used across artboards.

const { useState } = React;

// Swatch card — one color chip with name, hex, and token name.
function Swatch({ name, token, value, textOn = 'dark', size = 'md' }) {
  const h = size === 'lg' ? 104 : size === 'sm' ? 56 : 76;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: size === 'lg' ? 168 : 132 }}>
      <div
        style={{
          height: h,
          borderRadius: 12,
          background: value,
          border: '1px solid rgba(23,26,20,0.06)',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            bottom: 8,
            left: 10,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: textOn === 'dark' ? 'rgba(255,255,255,0.85)' : 'rgba(23,26,20,0.7)',
            letterSpacing: '0.02em',
          }}
        >
          {value.toUpperCase ? value.toUpperCase() : value}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gg-ink-900)' }}>{name}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gg-ink-500)' }}>{token}</div>
      </div>
    </div>
  );
}

// Label that appears above every artboard section (small caps mono)
function ArtLabel({ children, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--gg-ink-500)',
        }}
      >
        {children}
      </span>
      {hint && (
        <span style={{ fontSize: 12, color: 'var(--gg-ink-500)' }}>{hint}</span>
      )}
    </div>
  );
}

// A large artboard "sheet" — the white paper that tokens sit on
function Sheet({ children, pad = 32, bg = 'var(--gg-paper)', style = {} }) {
  return (
    <div
      className="gg-root"
      style={{
        background: bg,
        borderRadius: 0,
        padding: pad,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Vertical divider used between subsections
function VRule() {
  return <div style={{ width: 1, background: 'var(--gg-ink-100)', alignSelf: 'stretch' }} />;
}

// SVG icons used sparingly throughout the system (line style, 1.5 stroke)
const Icon = {
  Receipt: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  Sparkle: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
      <path d="M19 4l.6 1.4L21 6l-1.4.6L19 8l-.6-1.4L17 6l1.4-.6L19 4z" />
    </svg>
  ),
  Camera: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8a2 2 0 012-2h2.5l1.5-2h6l1.5 2H19a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Chart: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16" />
      <path d="M7 16V10M12 16V6M17 16v-4" />
    </svg>
  ),
  Clock: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  Bell: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15L6 16z" />
      <path d="M10 20a2 2 0 004 0" />
    </svg>
  ),
  Check: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  ),
  Plus: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Settings: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.3 1.82l.1.1a2 2 0 11-2.83 2.83l-.1-.1a1.65 1.65 0 00-1.82-.3 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.1A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.3l-.1.1a2 2 0 11-2.83-2.83l.1-.1A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.1A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.3-1.82l-.1-.1a2 2 0 112.83-2.83l.1.1A1.65 1.65 0 009 4.6c.55-.24.92-.78 1-1.38V3a2 2 0 014 0v.1c.08.6.45 1.14 1 1.38a1.65 1.65 0 001.82-.3l.1-.1a2 2 0 012.83 2.83l-.1.1A1.65 1.65 0 0019.4 9c.24.55.78.92 1.38 1H21a2 2 0 010 4h-.22c-.6.08-1.14.45-1.38 1z" />
    </svg>
  ),
  Search: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  ArrowUp: (p) => (
    <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  ),
};

// The Grocery Genie mark — a receipt with a sparkle.
function GGMark({ size = 40, tone = 'leaf' }) {
  const bg = tone === 'leaf' ? 'var(--gg-leaf-700)' : tone === 'ink' ? 'var(--gg-ink-900)' : 'var(--gg-cream-100)';
  const fg = tone === 'cream' ? 'var(--gg-ink-900)' : 'var(--gg-cream-50)';
  const sparkle = tone === 'cream' ? 'var(--gg-saffron-500)' : 'var(--gg-saffron-500)';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: 'block' }}>
      <rect x="0" y="0" width="48" height="48" rx="12" fill={bg} />
      {/* receipt */}
      <path
        d="M14 11h16v24l-3-1.6-2.5 1.6-2.5-1.6-2.5 1.6-2.5-1.6L14 35V11z"
        fill="none"
        stroke={fg}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M18 17h8M18 21h8M18 25h5" stroke={fg} strokeWidth="1.6" strokeLinecap="round" />
      {/* sparkle */}
      <path
        d="M33 14l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1 1-2.6z"
        fill={sparkle}
      />
    </svg>
  );
}

window.GG = { Swatch, ArtLabel, Sheet, VRule, Icon, GGMark };
