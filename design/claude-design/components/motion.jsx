/* global React, GG */
const { Sheet, ArtLabel } = window.GG;

function MotionBoard() {
  return (
    <Sheet pad={40}>
      <ArtLabel hint="Spring-based · short · purposeful">Motion · haptics</ArtLabel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Durations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['instant', 80, 'Press feedback · haptic tick'],
              ['quick', 160, 'Chip toggle · tab switch'],
              ['standard', 260, 'Card enter · sheet open'],
              ['deliberate', 420, 'Budget ring fill · scan success'],
            ].map(([n, ms, use]) => (
              <div key={n} style={{ display: 'grid', gridTemplateColumns: '100px 60px 1fr 140px', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{n}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--gg-leaf-700)' }}>{ms}ms</span>
                <div style={{ height: 8, background: 'var(--gg-cream-100)', borderRadius: 999, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'var(--gg-leaf-700)', borderRadius: 999, transformOrigin: 'left', animation: `fill-${ms} ${ms * 6}ms ease-in-out infinite` }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--gg-ink-500)' }}>{use}</span>
              </div>
            ))}
          </div>

          <style>{`
            @keyframes fill-80 { 0%, 100% { transform: scaleX(0) } 50% { transform: scaleX(1) } }
            @keyframes fill-160 { 0%, 100% { transform: scaleX(0) } 50% { transform: scaleX(1) } }
            @keyframes fill-260 { 0%, 100% { transform: scaleX(0) } 50% { transform: scaleX(1) } }
            @keyframes fill-420 { 0%, 100% { transform: scaleX(0) } 50% { transform: scaleX(1) } }
          `}</style>

          <div style={{ fontSize: 13, fontWeight: 600, margin: '22px 0 10px' }}>Curves</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            <div>standard · cubic-bezier(0.2, 0.8, 0.2, 1)</div>
            <div>emphatic · spring(stiffness 180, damping 22)</div>
            <div>exit · cubic-bezier(0.4, 0, 1, 1)</div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Haptics</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Selection', 'Tab · chip · segment', 'Haptics.selectionAsync()'],
              ['Light', 'Value changed · toggle', 'ImpactFeedbackStyle.Light'],
              ['Medium', 'Capture shutter', 'ImpactFeedbackStyle.Medium'],
              ['Success', 'Receipt saved · budget hit', 'NotificationFeedbackType.Success'],
              ['Warning', '80% threshold crossed', 'NotificationFeedbackType.Warning'],
              ['Error', 'Low-confidence fail · sync error', 'NotificationFeedbackType.Error'],
            ].map(([k, when, api]) => (
              <div key={k} style={{ background: 'var(--gg-cream-50)', borderRadius: 10, padding: '10px 12px', border: '1px solid var(--gg-ink-100)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{k}</span>
                  <span style={{ fontSize: 12, color: 'var(--gg-ink-500)' }}>{when}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gg-leaf-700)', marginTop: 3 }}>{api}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--gg-ink-100)', paddingTop: 20 }}>
        <ArtLabel>Signature moment · budget ring</ArtLabel>
        <div style={{ fontSize: 13, color: 'var(--gg-ink-500)', marginTop: 4, maxWidth: 640, lineHeight: 1.55 }}>
          After a receipt is confirmed, the budget ring fills from its previous value to the new value over 420ms
          (spring). A single saffron sparkle blooms once near the ring tip and fades at 180ms. Never plays twice in a session —
          the magic is rare.
        </div>
      </div>
    </Sheet>
  );
}

window.MotionBoard = MotionBoard;
