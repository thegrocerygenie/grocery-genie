import Mock from './Mock';

const LINES: [string, string][] = [
  ['ORG MILK', '4.49'], ['EGGS DZ', '5.74'], ['ROMAINE 2', '3.98'], ['CHKN BRST', '11.20'],
  ['OLIVE OIL', '15.32'], ['BANANAS', '2.29'], ['SOURDOUGH', '5.49'], ['AVOCADO 3', '4.47'],
];

const corner = (pos: React.CSSProperties, sides: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean }): React.CSSProperties => ({
  position: 'absolute',
  width: 22,
  height: 22,
  ...pos,
  borderTop: sides.top ? '2px solid var(--gg-tint)' : 'none',
  borderBottom: sides.bottom ? '2px solid var(--gg-tint)' : 'none',
  borderLeft: sides.left ? '2px solid var(--gg-tint)' : 'none',
  borderRight: sides.right ? '2px solid var(--gg-tint)' : 'none',
});

export default function MockScan() {
  return (
    <Mock label="Scan a receipt">
      <div style={{ position: 'absolute', inset: '28px 0 0', background: '#0a0a0a' }}>
        <div
          style={{
            position: 'absolute', left: '50%', top: 60, transform: 'translateX(-50%) rotate(-2deg)',
            width: 150, padding: '12px 12px 16px', background: '#fff', color: '#000',
            fontFamily: 'var(--font-mono)', fontSize: 7, lineHeight: 1.6, boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-sf)', fontWeight: 700, fontSize: 9, marginBottom: 8 }}>TRADER JOE'S</div>
          {LINES.map(([n, p]) => (
            <div key={n} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{n}</span><span>{p}</span></div>
          ))}
          <div style={{ borderTop: '1px dashed #000', marginTop: 4, paddingTop: 3, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
            <span>TOTAL</span><span>52.98</span>
          </div>
        </div>
        <div style={corner({ left: 20, top: 50 }, { top: true, left: true })} />
        <div style={corner({ right: 20, top: 50 }, { top: true, right: true })} />
        <div style={corner({ left: 20, bottom: 60 }, { bottom: true, left: true })} />
        <div style={corner({ right: 20, bottom: 60 }, { bottom: true, right: true })} />
        <div style={{ position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', width: 56, height: 56, borderRadius: 28, border: '3px solid #fff', display: 'grid', placeItems: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: '#fff' }} />
        </div>
        <div style={{ position: 'absolute', bottom: 100, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 11 }}>Hold steady — receipt detected</div>
      </div>
    </Mock>
  );
}
