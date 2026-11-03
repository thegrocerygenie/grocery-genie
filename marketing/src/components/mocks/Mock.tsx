import type { ReactNode } from 'react';

// iPhone shell, scaled down for marketing tiles. Drawn inline, not full UI fidelity.
export default function Mock({ children, label, height = 520 }: { children: ReactNode; label?: string; height?: number }) {
  return (
    <div className="mock" style={{ width: 260, height, position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#1C1C1E',
          borderRadius: 36,
          padding: 4,
          boxShadow: '0 30px 60px -20px rgba(21,20,15,0.35), 0 0 0 0.5px rgba(255,255,255,0.4) inset',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'var(--ios-bg)',
            borderRadius: 32,
            overflow: 'hidden',
            position: 'relative',
            fontFamily: 'var(--font-sf)',
            color: 'var(--ios-label)',
          }}
        >
          <div style={{ height: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 18px 4px', fontSize: 11, fontWeight: 600 }}>
            <span>9:41</span>
            <span style={{ display: 'inline-block', width: 24, height: 8, background: 'currentColor', opacity: 0.4, borderRadius: 2 }} />
          </div>
          <div style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', width: 78, height: 22, background: '#000', borderRadius: 999 }} />
          {children}
        </div>
      </div>
      {label && <div className="mock-label">{label}</div>}
    </div>
  );
}
