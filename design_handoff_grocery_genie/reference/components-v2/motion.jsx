/* global React, GG2 */
const { Sheet2, Lbl } = window.GG2;

function MotionV2() {
  return (
    <Sheet2 pad={36} bg="var(--ios-bg)">
      <Lbl hint="iOS spring physics · haptic-led · Reduce Motion respected">Motion · haptics · accessibility</Lbl>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-label-2)', marginBottom: 10 }}>iOS CURVES</div>
          <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, padding: '4px 16px' }}>
            {[
              ['linear', '.linear', 'Indeterminate progress only'],
              ['easeInOut', '.easeInOut(0.2s)', 'Sheet present · dismiss'],
              ['standard spring', 'response 0.4 · damping 0.8', 'Tab switch · row tap'],
              ['ring spring', 'response 0.6 · damping 0.7', 'Budget ring fill — same as Activity'],
              ['interactive', '.interactiveSpring()', 'Drag-driven gestures'],
            ].map(([n, v, use], i) => (
              <div key={n} style={{ padding: '10px 0', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{n}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ios-label-2)' }}>{v}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 2 }}>{use}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-label-2)', marginBottom: 10 }}>HAPTIC-LED CONFIRMATION</div>
          <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, padding: '4px 16px' }}>
            {[
              ['Selection', 'Tab · segment · chip', 'UISelectionFeedbackGenerator'],
              ['Light impact', 'Toggle · pull-to-refresh', '.impactOccurred(.light)'],
              ['Medium impact', 'Capture shutter', '.impactOccurred(.medium)'],
              ['Success', 'Receipt saved · ring fills', '.notificationOccurred(.success)'],
              ['Warning', '80% threshold crossed', '.notificationOccurred(.warning)'],
              ['Error', 'Low-confidence · sync fail', '.notificationOccurred(.error)'],
            ].map(([k, when, api], i) => (
              <div key={k} style={{ padding: '10px 0', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{k}</span>
                  <span style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{when}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gg-tint)', marginTop: 2 }}>{api}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 10, lineHeight: 1.5 }}>
            <b>Rule:</b> haptic fires <i>before</i> the visual confirmation, never after. Apple research is consistent — haptic-first feels faster.
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-label-2)', marginBottom: 10 }}>ACCESSIBILITY · non-negotiable</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            ['Dynamic Type', 'Every text role uses iOS roles. Test up to AX5.'],
            ['Reduce Motion', 'Ring fills as a fade, not a spring. Live Activity replaces with text.'],
            ['Increase Contrast', 'Tint shifts to #195F3A. Separators thicken to 1pt.'],
            ['VoiceOver', 'Categories announce as "Groceries, $142, 82 percent of $175 budget."'],
            ['Reduce Transparency', 'Materials drop to opaque var(--ios-bg-2).'],
            ['Smart Invert', 'Receipt photos excluded from invert via .accessibilityIgnoresInvertColors.'],
          ].map(([n, d]) => (
            <div key={n} style={{ background: 'var(--ios-bg-2)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{n}</div>
              <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 4, lineHeight: 1.45 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-label-2)', marginBottom: 10 }}>WHAT GOT CUT — and why</div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, padding: '4px 16px' }}>
          {[
            ['Saffron sparkle "magic"', 'The magic is capture speed, not glitter.'],
            ['Custom shadows', 'Replaced by iOS materials.'],
            ['Custom 10-icon set', 'SF Symbols — free, weight-matched, accessible, dark-mode-aware.'],
            ['Pill-shaped buttons everywhere', 'Pills are for chips. Primary actions use 12pt continuous corners.'],
            ['Colored left accent bar on rows', 'Replaced with Wallet-style 32pt category circle.'],
            ['Horizontal budget bar', 'Replaced with Activity-style ring — same shape on Watch, widget, Dynamic Island.'],
            ['Instrument Serif in UI', 'Wordmark only. Launch and onboarding, then it disappears.'],
            ['Custom yellow scan brackets', 'VisionKit handles edge detection — white brackets when needed.'],
          ].map(([n, why], i) => (
            <div key={n} style={{ padding: '10px 0', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--sys-red)' }}>−  {n}</span>
              <span style={{ fontSize: 13, color: 'var(--ios-label-2)', textAlign: 'right', flex: 1 }}>{why}</span>
            </div>
          ))}
        </div>
      </div>
    </Sheet2>
  );
}

window.MotionV2 = MotionV2;
