/* global React, GG2, PhoneShell */
// V1.1 Price Intelligence — gap screens (manual link/unlink/split, mute, custom cats, export, 12mo trend, paywall)
const { SF, ListGroup, ListRow } = window.GG2;
const { Phone, NavBar, TabBar } = window.PhoneShell;

// PI-02 · Manual link sheet
function ManualLink() {
  return (
    <Phone label="PI-02 · Manual link">
      <NavBar left="Cancel" title="Link items" right="Link" />
      <div style={{ padding: '8px 16px', fontSize: 13, color: 'var(--ios-label-2)' }}>Pick an existing item to merge "Olive oil 1L" into.</div>
      <div style={{ padding: '0 16px 8px' }}>
        <div style={{ background: 'var(--ios-fill-3)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ios-label-2)' }}>
          <SF.search size={14} /><span style={{ fontSize: 14 }}>Search items</span>
        </div>
      </div>
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto' }}>
        <ListGroup header="Suggested">
          {[['Olive oil', '14 purchases', '$13.99 avg', true], ['Olive oil · extra virgin', '4 purchases', '$15.49 avg', false]].map(([n, s, p, sel]) => (
            <div key={n} style={{ padding: '11px 14px', borderTop: sel ? 'none' : '0.5px solid var(--ios-separator)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', border: sel ? '6px solid var(--gg-tint)' : '1.5px solid var(--ios-fill-1)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{n}</div>
                <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{s} · {p}</div>
              </div>
            </div>
          ))}
        </ListGroup>
        <div style={{ marginTop: 12 }}>
          <ListGroup header="All items">
            {['Cooking oil', 'Vegetable oil', 'Sesame oil', 'Coconut oil'].map((n, i) => (
              <div key={n} style={{ padding: '11px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--ios-fill-1)' }} />
                <span style={{ fontSize: 15 }}>{n}</span>
              </div>
            ))}
          </ListGroup>
        </div>
      </div>
    </Phone>
  );
}

// PI-02 · Split mismatched item
function SplitItem() {
  return (
    <Phone label="PI-02 · Split">
      <NavBar left="Cancel" title="Split into 2 items" right="Save" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'rgba(255,149,0,0.10)', borderRadius: 12, padding: 12, fontSize: 13, color: 'var(--ios-label-2)', lineHeight: 1.4 }}>
          We grouped these as one item but the unit price varies a lot. Split if these are different products.
        </div>
        <ListGroup header="Original">
          <ListRow title="Olive oil" detail="14 purchases · $13.99 avg" accessory={<SF.chevron />} />
        </ListGroup>
        <div style={{ fontSize: 13, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 4px' }}>Split into</div>
        <ListGroup>
          <div style={{ padding: '11px 14px' }}>
            <input defaultValue="Olive oil · 1L" style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', background: 'transparent' }} />
            <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 2 }}>9 purchases · $11.49 avg</div>
          </div>
          <div style={{ height: 1, background: 'var(--ios-separator)', marginLeft: 14 }} />
          <div style={{ padding: '11px 14px' }}>
            <input defaultValue="Olive oil · 3L" style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', background: 'transparent' }} />
            <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 2 }}>5 purchases · $24.99 avg</div>
          </div>
        </ListGroup>
        <button style={{ height: 44, background: 'var(--ios-bg-2)', border: 'none', borderRadius: 10, fontSize: 15, color: 'var(--gg-tint)', fontWeight: 600 }}>+ Add another split</button>
      </div>
    </Phone>
  );
}

// PI-03 · Per-item alert mute
function AlertMute() {
  return (
    <Phone label="PI-03 · Mute alerts">
      <NavBar left="Avocado" title="Alerts" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup header="Item-level">
          <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Mute price alerts</div>
              <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>For Avocado across all stores</div>
            </div>
            <Toggle on={true} />
          </div>
          <div style={{ height: 1, background: 'var(--ios-separator)', marginLeft: 14 }} />
          <ListRow title="Mute until" value="Forever" accessory={<SF.chevron />} />
        </ListGroup>

        <ListGroup header="Per store">
          {[["Trader Joe's", true], ['Whole Foods', false], ['Safeway', true], ['Costco', false]].map(([n, on]) => (
            <div key={n} style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: n === "Trader Joe's" ? 'none' : '0.5px solid var(--ios-separator)' }}>
              <span style={{ fontSize: 15 }}>{n}</span>
              <Toggle on={!on} />
            </div>
          ))}
        </ListGroup>
        <div style={{ fontSize: 12, color: 'var(--ios-label-2)', padding: '0 8px', lineHeight: 1.4 }}>You'll still see price changes in the item detail — just no notifications.</div>
      </div>
    </Phone>
  );
}

// PI · Custom categories (Premium)
function CustomCategories() {
  const cats = [
    ['Groceries', 'var(--sys-green)', SF.cart, true, false],
    ['Household', 'var(--sys-blue)', SF.doc, true, false],
    ['Beverages', 'var(--sys-indigo)', SF.doc, true, false],
    ['Snacks', 'var(--sys-orange)', SF.doc, true, false],
    ['Pet', 'var(--sys-teal)', SF.doc, true, false],
    ['Wellness', 'var(--sys-pink)', SF.doc, false, true],
    ['Date night', 'var(--sys-purple)', SF.doc, false, true],
  ];
  return (
    <Phone label="PI · Custom cats">
      <NavBar left="Settings" title="Categories" right="Edit" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup header="Built-in">
          {cats.filter(c => c[3]).map(([n, c, I]) => (
            <ListRow key={n} icon={<I size={14} />} iconBg={c} title={n} accessory={<SF.chevron />} />
          ))}
        </ListGroup>
        <ListGroup header="Custom" footer="Custom categories require Premium.">
          {cats.filter(c => c[4]).map(([n, c, I]) => (
            <div key={n} style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, borderTop: n === 'Wellness' ? 'none' : '0.5px solid var(--ios-separator)' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: c, color: '#fff', display: 'grid', placeItems: 'center' }}><I size={14} /></div>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{n}</span>
              <SF.chevron />
            </div>
          ))}
          <div style={{ height: 1, background: 'var(--ios-separator)', marginLeft: 14 }} />
          <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--gg-tint-bg)', color: 'var(--gg-tint)', display: 'grid', placeItems: 'center' }}><SF.plus size={14} /></div>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--gg-tint)' }}>New category</span>
          </div>
        </ListGroup>
      </div>
    </Phone>
  );
}

// PI · Data export (Premium)
function DataExport() {
  return (
    <Phone label="PI · Export">
      <NavBar left="Settings" title="Export data" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--gg-tint-bg)', borderRadius: 12, padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--gg-tint)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}><SF.doc size={14} /></div>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)', lineHeight: 1.4 }}>Export everything Grocery Genie has on you. Yours forever.</div>
        </div>
        <ListGroup header="Range">
          <ListRow title="Period" value="Last 12 months" accessory={<SF.chevron />} />
          <ListRow title="From" value="Apr 2025" accessory={<SF.chevron />} />
          <ListRow title="To" value="Apr 2026" accessory={<SF.chevron />} />
        </ListGroup>
        <ListGroup header="Format">
          {[['CSV', 'Spreadsheet-ready', true], ['JSON', 'For developers', false], ['PDF report', 'Formatted summary', false]].map(([n, sub, sel], i) => (
            <div key={n} style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', border: sel ? '6px solid var(--gg-tint)' : '1.5px solid var(--ios-fill-1)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{n}</div>
                <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{sub}</div>
              </div>
            </div>
          ))}
        </ListGroup>
        <ListGroup header="Includes">
          <ToggleRow title="Receipts & line items" on={true} />
          <ToggleRow title="Price history" on={true} />
          <ToggleRow title="Categories & budgets" on={true} />
          <ToggleRow title="Receipt images" on={false} />
        </ListGroup>
        <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600, marginTop: 4 }}>Export 1,247 receipts</button>
      </div>
    </Phone>
  );
}

// PI · 12-month trend (V1.1 upgrade from MVP 3-month)
function Trend12() {
  const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
  const data = [368, 384, 401, 422, 388, 376, 430, 512, 398, 412, 387, 242];
  const max = Math.max(...data);
  return (
    <Phone label="PI · 12-month trend">
      <NavBar large title="Trend" right="" />
      <div style={{ flex: 1, padding: '0 16px 90px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>12-month average</div>
          <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>$393<span style={{ fontSize: 13, color: 'var(--gg-tint)', marginLeft: 6 }}>−4.8% YoY</span></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginTop: 14, height: 110 }}>
            {data.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', height: (v / max) * 95, background: i === data.length - 1 ? 'var(--gg-tint)' : 'var(--ios-fill-2)', borderRadius: 3 }} />
                <div style={{ fontSize: 9, color: 'var(--ios-label-2)', fontFamily: 'var(--font-mono)' }}>{months[i][0]}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'inline-flex', background: 'var(--ios-fill-3)', padding: 2, borderRadius: 9, alignSelf: 'center' }}>
          {['1M', '3M', '6M', '1Y', 'All'].map((t, i) => (
            <div key={t} style={{ padding: '5px 12px', borderRadius: 7, background: i === 3 ? 'var(--ios-bg-2)' : 'transparent', fontSize: 12, fontWeight: i === 3 ? 600 : 400 }}>{t}</div>
          ))}
        </div>
        <ListGroup header="Highlights">
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-red)" title="Highest" detail="December" value="$512" />
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-green)" title="Lowest" detail="April · in progress" value="$242" />
          <ListRow icon={<SF.clock size={14} />} iconBg="var(--sys-blue)" title="Trend" detail="Steady, dipping in Apr" value="−4.8%" />
        </ListGroup>
      </div>
      <TabBar active="Budget" />
    </Phone>
  );
}

// Paywall · Premium
function PremiumPaywall() {
  const features = [
    ['Cross-store comparison', SF.cart],
    ['Custom categories', SF.doc],
    ['Data export · CSV/JSON/PDF', SF.doc],
    ['12-month trends', SF.clock],
    ['Per-item & per-store mute', SF.bell],
    ['Priority OCR processing', SF.viewfinder],
  ];
  return (
    <Phone label="PI · Paywall">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px 0', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--ios-fill-3)', display: 'grid', placeItems: 'center', color: 'var(--ios-label-2)' }}>×</div>
        </div>
        <div style={{ padding: '20px 24px 0', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, var(--gg-tint), #2fa46a)', color: '#fff', display: 'grid', placeItems: 'center', margin: '0 auto 12px', boxShadow: '0 8px 20px rgba(31,122,74,0.25)' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" /></svg>
          </div>
          <div style={{ fontFamily: 'var(--font-wordmark)', fontSize: 30, letterSpacing: '-0.02em' }}>Premium</div>
          <div style={{ fontSize: 14, color: 'var(--ios-label-2)', marginTop: 4, lineHeight: 1.4 }}>Unlock the full power of your receipts.</div>
        </div>
        <div style={{ flex: 1, padding: '20px 16px 0', overflow: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {features.map(([f, I]) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--gg-tint-bg)', color: 'var(--gg-tint)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><I size={12} /></div>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{f}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ background: 'var(--ios-bg-2)', borderRadius: 12, padding: 14, border: '2px solid var(--gg-tint)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: -8, right: 12, background: 'var(--gg-tint)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, letterSpacing: '0.04em' }}>SAVE 33%</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Yearly</div>
              <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>$39.99 <span style={{ fontSize: 12, color: 'var(--ios-label-2)', fontWeight: 500 }}>/yr · $3.33/mo</span></div>
            </div>
            <div style={{ background: 'var(--ios-bg-2)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Monthly</div>
              <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>$4.99 <span style={{ fontSize: 12, color: 'var(--ios-label-2)', fontWeight: 500 }}>/mo</span></div>
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 16px 16px' }}>
          <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600, width: '100%' }}>Start 7-day free trial</button>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ios-label-2)', marginTop: 8 }}>Cancel anytime · Restore purchase</div>
        </div>
      </div>
    </Phone>
  );
}

function Toggle({ on }) {
  return (
    <div style={{ width: 51, height: 31, borderRadius: 999, background: on ? 'var(--gg-tint)' : 'var(--ios-fill-1)', padding: 2, display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
      <div style={{ width: 27, height: 27, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }} />
    </div>
  );
}
function ToggleRow({ title, on }) {
  return (
    <div style={{ padding: '11px 16px', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 15 }}>{title}</span><Toggle on={on} />
    </div>
  );
}
function Row({ children }) { return <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>{children}</div>; }

window.PIGap = {
  SectionPIGap: () => <Row><ManualLink /><SplitItem /><AlertMute /><CustomCategories /><DataExport /><Trend12 /><PremiumPaywall /></Row>,
};
