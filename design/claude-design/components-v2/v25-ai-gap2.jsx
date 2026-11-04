/* global React, GG2, PhoneShell */
// V2.5 fill-in — feature 24 (anomaly detection)
const { SF, ListGroup, ListRow } = window.GG2;
const { Phone, NavBar, TabBar } = window.PhoneShell;

// AI-24 · Anomaly detection
function Anomaly() {
  return (
    <Phone label="AI-24 · Anomaly">
      <NavBar left="Insights" title="Unusual receipt" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--sys-orange)', color: '#fff', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.9 }}>Heads up</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4, lineHeight: 1.3 }}>This receipt is 3.2× your typical Whole Foods trip.</div>
          <div style={{ fontSize: 13, opacity: 0.95, marginTop: 6, lineHeight: 1.4 }}>$248.40 vs $76 average · 47 items vs 12 typical. Worth a glance before saving.</div>
        </div>

        <ListGroup header="What's unusual">
          <ListRow icon={<SF.cart size={18} />} title="Item count" subtitle="47 items · 4× usual" right="High" rightColor="var(--sys-orange)" />
          <ListRow icon={<SF.sparkles size={18} />} title="New items" subtitle="14 you've never bought before" right="High" rightColor="var(--sys-orange)" />
          <ListRow icon={<SF.bell size={18} />} title="Categories" subtitle="Party supplies, balloons" right="Unusual" rightColor="var(--sys-orange)" />
          <ListRow icon={<SF.clock size={18} />} title="Day of week" subtitle="Saturday · matches your usual pattern" right="OK" rightColor="var(--sys-green)" />
        </ListGroup>

        <ListGroup header="Likely explanation">
          {[
            ['Hosting an event', 'Match: party supplies + 4× normal volume', true],
            ['OCR error', 'Some items duplicated', false],
            ['Wrong store assigned', 'Looks like a Costco trip', false],
            ['Just a big shop', 'Mark as normal', false],
          ].map(([t, d, sel], i) => (
            <div key={t} style={{ padding: '12px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 22, height: 22, borderRadius: 11, border: '2px solid ' + (sel ? 'var(--gg-tint)' : 'var(--ios-label-3)'), display: 'grid', placeItems: 'center' }}>
                {sel && <div style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--gg-tint)' }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: sel ? 600 : 500 }}>{t}</div>
                <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{d}</div>
              </div>
            </div>
          ))}
        </ListGroup>

        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ flex: 1, height: 44, background: 'var(--ios-fill-3)', color: 'var(--ios-label)', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600 }}>Review items</button>
          <button style={{ flex: 1, height: 44, background: 'var(--gg-tint)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600 }}>Save anyway</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ios-label-2)', textAlign: 'center', lineHeight: 1.4 }}>
          Marking "hosting an event" excludes this from your inflation &amp; restock baselines.
        </div>
      </div>
    </Phone>
  );
}

function Row({ children }) { return <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>{children}</div>; }

window.AIGap2 = {
  SectionAIGap2: () => <Row><Anomaly /></Row>,
};
