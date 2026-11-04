/* global React, GG2, PhoneShell */
// V1 — MVP gap-filler screens (BC, RC items not in mvp-screens.jsx + cross-cutting)
const { SF, ListGroup, ListRow } = window.GG2;
const { Phone, NavBar, TabBar } = window.PhoneShell;

// BC-05 · Category correction sheet (tap item → pick category)
function CategoryPicker() {
  const cats = [
    ['Groceries', 'var(--sys-green)', SF.cart, true],
    ['Household', 'var(--sys-blue)', SF.doc, false],
    ['Personal Care', 'var(--sys-pink)', SF.doc, false],
    ['Beverages', 'var(--sys-indigo)', SF.doc, false],
    ['Snacks & Treats', 'var(--sys-orange)', SF.doc, false],
    ['Baby & Kids', 'var(--sys-yellow)', SF.doc, false],
    ['Pet', 'var(--sys-teal)', SF.doc, false],
    ['Other', 'var(--sys-gray)', SF.doc, false],
  ];
  return (
    <Phone label="BC-05 · Category">
      <NavBar left="Cancel" title="Category" right="Done" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Item</div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Olive oil · 1L</div>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 2 }}>This change applies to all past and future receipts.</div>
        </div>
        <ListGroup>
          {cats.map(([n, c, I, sel]) => (
            <div key={n} style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, borderTop: n === 'Groceries' ? 'none' : '0.5px solid var(--ios-separator)' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: c, color: '#fff', display: 'grid', placeItems: 'center' }}><I size={14} /></div>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{n}</span>
              {sel && <SF.check size={18} />}
            </div>
          ))}
        </ListGroup>
      </div>
    </Phone>
  );
}

// BC-04 #3 · Top items by spend
function TopItems() {
  const items = [
    ['Chicken breast', '8 trips', 87.42, 'var(--sys-green)'],
    ['Avocado', '12 trips', 58.20, 'var(--sys-green)'],
    ['Greek yogurt', '6 trips', 42.94, 'var(--sys-green)'],
    ['Cold brew', '5 trips', 39.95, 'var(--sys-indigo)'],
    ['Sourdough', '4 trips', 22.00, 'var(--sys-green)'],
    ['Olive oil', '2 trips', 19.98, 'var(--sys-green)'],
    ['Detergent', '2 trips', 17.40, 'var(--sys-blue)'],
    ['Bananas', '8 trips', 14.92, 'var(--sys-green)'],
  ];
  const max = Math.max(...items.map(i => i[2]));
  return (
    <Phone label="BC-04 · Top items">
      <NavBar large title="Top items" right="" />
      <div style={{ padding: '0 16px 8px', fontSize: 13, color: 'var(--ios-label-2)' }}>April · ranked by total spend</div>
      <div style={{ flex: 1, padding: '0 16px 90px', overflow: 'auto' }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {items.map(([n, trips, amt, c], i) => (
            <div key={n} style={{ padding: '11px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ios-label-2)', width: 18 }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{n}</div>
                  <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{trips}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${amt.toFixed(2)}</div>
              </div>
              <div style={{ height: 3, background: 'var(--ios-fill-3)', borderRadius: 2, overflow: 'hidden', marginLeft: 28 }}>
                <div style={{ width: (amt / max) * 100 + '%', height: '100%', background: c }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <TabBar active="Budget" />
    </Phone>
  );
}

// BC-04 #4 · 3-month trend
function Trend() {
  const months = [
    { m: 'Feb', total: 412, cats: [{ c: 'var(--sys-green)', v: 268 }, { c: 'var(--sys-indigo)', v: 58 }, { c: 'var(--sys-blue)', v: 42 }, { c: 'var(--sys-orange)', v: 44 }] },
    { m: 'Mar', total: 387, cats: [{ c: 'var(--sys-green)', v: 245 }, { c: 'var(--sys-indigo)', v: 62 }, { c: 'var(--sys-blue)', v: 38 }, { c: 'var(--sys-orange)', v: 42 }] },
    { m: 'Apr', total: 242, cats: [{ c: 'var(--sys-green)', v: 142 }, { c: 'var(--sys-indigo)', v: 33 }, { c: 'var(--sys-blue)', v: 27 }, { c: 'var(--sys-orange)', v: 40 }] },
  ];
  const max = 500;
  return (
    <Phone label="BC-04 · 3-month trend">
      <NavBar large title="Trend" right="" />
      <div style={{ flex: 1, padding: '0 16px 90px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>3-month average</div>
          <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>$347 <span style={{ fontSize: 13, color: 'var(--gg-tint)', fontWeight: 600 }}>−13% vs prior</span></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, marginTop: 18, height: 140 }}>
            {months.map(m => {
              const h = (m.total / max) * 130;
              let acc = 0;
              return (
                <div key={m.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-sf-rounded)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${m.total}</div>
                  <div style={{ width: 36, height: h, background: 'var(--ios-fill-3)', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse', position: 'relative' }}>
                    {m.cats.map((c, i) => {
                      const segH = (c.v / m.total) * h;
                      acc += c.v;
                      return <div key={i} style={{ height: segH, background: c.c }} />;
                    })}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{m.m}</div>
                </div>
              );
            })}
          </div>
        </div>
        <ListGroup header="Legend">
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-green)" title="Groceries" value="$218 avg" />
          <ListRow icon={<SF.doc size={14} />} iconBg="var(--sys-indigo)" title="Beverages" value="$51 avg" />
          <ListRow icon={<SF.doc size={14} />} iconBg="var(--sys-blue)" title="Household" value="$36 avg" />
          <ListRow icon={<SF.doc size={14} />} iconBg="var(--sys-orange)" title="Snacks" value="$42 avg" />
        </ListGroup>
      </div>
      <TabBar active="Budget" />
    </Phone>
  );
}

// RC-04 #3 · Receipt detail (tap from history)
function ReceiptDetail() {
  return (
    <Phone label="RC-04 · Receipt detail">
      <NavBar left="History" title="Trader Joe's" right="Edit" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#FBF8F2', borderRadius: 12, padding: 16, alignSelf: 'center', width: '78%', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', color: '#000', letterSpacing: '0.04em' }}>TRADER JOE'S</div>
          <div style={{ fontSize: 9, textAlign: 'center', color: 'rgba(0,0,0,0.5)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>1245 Castro · 04/19/26 · 3:42PM</div>
          <div style={{ height: 1, borderTop: '1px dashed rgba(0,0,0,0.3)', margin: '8px 0' }} />
          {Array(7).fill(0).map((_, i) => (
            <div key={i} style={{ height: 3, background: 'rgba(0,0,0,0.18)', width: [80, 65, 90, 75, 85, 60, 88][i] + '%', marginBottom: 4 }} />
          ))}
        </div>
        <ListGroup>
          <ListRow title="Store" value="Trader Joe's" />
          <ListRow title="Date" value="Apr 19, 2026" />
          <ListRow title="Total" value="$58.42" />
          <ListRow title="Category" value="Groceries" accessory={<SF.chevron />} />
          <ListRow title="Subtotal · Tax" value="$54.32 · $4.10" />
        </ListGroup>
        <div style={{ fontSize: 13, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 4px' }}>Items · 12</div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {[['Bananas', '2.49'], ['Greek yogurt', '4.99'], ['Olive oil', '14.99'], ['Sourdough', '5.50'], ['Avocados', '6.00'], ['Cold brew', '5.99']].map(([n, p], i) => (
            <div key={n} style={{ padding: '10px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14 }}>{n}</span>
              <span style={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>${p}</span>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

// BC-03 / BC-06 · Push notifications (lock screen style)
function PushNotifs() {
  return (
    <Phone label="BC-03 · BC-06 · Push">
      <div style={{ flex: 1, background: 'linear-gradient(180deg, #5a6478 0%, #2a3140 100%)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ textAlign: 'center', padding: '40px 0 0', color: '#fff' }}>
          <div style={{ fontSize: 17, fontWeight: 500, opacity: 0.9 }}>Sunday, April 19</div>
          <div style={{ fontSize: 84, fontWeight: 200, lineHeight: 1, fontFamily: 'var(--font-sf-rounded)', letterSpacing: '-0.02em' }}>9:41</div>
        </div>
        <div style={{ position: 'absolute', bottom: 28, left: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', borderRadius: 16, padding: 12, display: 'flex', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--gg-tint)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}><SF.cart size={18} /></div>
            <div style={{ flex: 1, color: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Grocery Genie · Weekly</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>9:00am</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>You spent $187 this week</div>
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 1, lineHeight: 1.35 }}>$13 under budget · 12% less than last week. Top: Groceries.</div>
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(28px)', borderRadius: 16, padding: 12, display: 'flex', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--sys-orange)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}><SF.bell size={18} /></div>
            <div style={{ flex: 1, color: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Grocery Genie</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>2h ago</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>80% of budget used · 11 days left</div>
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 1 }}>$78 remaining of $400.</div>
            </div>
          </div>
          <div style={{ background: 'rgba(255,59,48,0.92)', backdropFilter: 'blur(28px)', borderRadius: 16, padding: 12, display: 'flex', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.25)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}><SF.bell size={18} /></div>
            <div style={{ flex: 1, color: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Grocery Genie</span>
                <span style={{ fontSize: 12, opacity: 0.85 }}>yesterday</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>Over budget by $32</div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 1 }}>2 days remaining in April.</div>
            </div>
          </div>
        </div>
      </div>
    </Phone>
  );
}

// RC · Manual entry fallback
function ManualEntry() {
  return (
    <Phone label="RC · Manual entry">
      <NavBar left="Cancel" title="Manual entry" right="Save" />
      <div style={{ padding: '8px 16px', fontSize: 13, color: 'var(--ios-label-2)' }}>Couldn't read this receipt. Enter what you can.</div>
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup>
          <div style={{ padding: '11px 16px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, color: 'var(--ios-label-2)' }}>Store</span>
            <span style={{ fontSize: 15, color: 'var(--gg-tint)' }}>Tap to add</span>
          </div>
          <div style={{ height: 1, background: 'var(--ios-separator)', marginLeft: 16 }} />
          <div style={{ padding: '11px 16px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, color: 'var(--ios-label-2)' }}>Date</span>
            <span style={{ fontSize: 15 }}>Today</span>
          </div>
          <div style={{ height: 1, background: 'var(--ios-separator)', marginLeft: 16 }} />
          <div style={{ padding: '11px 16px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, color: 'var(--ios-label-2)' }}>Total</span>
            <span style={{ fontSize: 15 }}>$0.00</span>
          </div>
        </ListGroup>
        <button style={{ height: 44, background: 'var(--ios-bg-2)', border: 'none', borderRadius: 10, fontSize: 15, color: 'var(--gg-tint)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <SF.plus size={14} /> Add line item
        </button>
        <div style={{ background: 'rgba(0,122,255,0.08)', borderRadius: 12, padding: 12, fontSize: 12, color: 'var(--ios-label-2)', lineHeight: 1.45 }}>
          You can also retake the photo with better lighting. Manual receipts work like scanned ones.
        </div>
      </div>
    </Phone>
  );
}

// RC-03 · Library upload picker sheet
function LibraryPicker() {
  return (
    <Phone label="RC-03 · Library">
      <NavBar large title="History" right="" />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ padding: '0 16px', opacity: 0.45 }}>
          <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, height: 60, marginBottom: 8 }} />
          <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, height: 60, marginBottom: 8 }} />
          <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, height: 60 }} />
        </div>
        {/* action sheet */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8 }}>
          <div style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(24px)', borderRadius: 14, overflow: 'hidden' }}>
            {[['Take Photo', SF.camera], ['Choose from Library', null], ['Choose Files', SF.doc], ['Manual Entry', SF.plus]].map(([t, I], i) => (
              <div key={t} style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
                <span style={{ fontSize: 17, color: 'var(--gg-tint)' }}>{t}</span>
                {I && <I size={18} />}
                {!I && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gg-tint)" strokeWidth="1.7"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M3 17l5-4 4 3 5-5 4 4" /></svg>}
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(24px)', borderRadius: 14, marginTop: 8, padding: '14px 18px', textAlign: 'center' }}>
            <span style={{ fontSize: 17, color: 'var(--gg-tint)', fontWeight: 600 }}>Cancel</span>
          </div>
        </div>
      </div>
    </Phone>
  );
}

// RC · High-value review banner (mandatory review at $100/$500 thresholds)
function HighValueReview() {
  return (
    <Phone label="RC · High-value review">
      <NavBar left="Cancel" title="Review" right="Save" />
      <div style={{ padding: '0 16px 8px' }}>
        <div style={{ background: 'rgba(255,149,0,0.12)', borderRadius: 10, padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--sys-orange)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Confirm before saving</div>
            <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 2 }}>This receipt is over $500 and one item is over $100. Please verify totals.</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup>
          <ListRow title="Store" value="Costco" accessory={<SF.chevron />} />
          <ListRow title="Total" value="$542.18" />
        </ListGroup>
        <div style={{ fontSize: 13, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 4px' }}>Items · 28</div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {[['Beef tenderloin', '124.50', true], ['Salmon · 4lb', '54.99', false], ['Olive oil · 3L', '24.99', false], ['Eggs · 24ct', '12.49', false]].map(([n, p, hi], i) => (
            <div key={n} style={{ padding: '10px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14 }}>{n}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: hi ? 'var(--sys-orange)' : 'var(--ios-label)' }}>
                {hi && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--sys-orange)', background: 'rgba(255,149,0,0.15)', padding: '2px 5px', borderRadius: 4 }}>VERIFY</span>}
                ${p}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

// Settings hub (root)
function SettingsHub() {
  return (
    <Phone label="Settings · root">
      <NavBar large title="Settings" right="Done" left="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--sys-purple)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-sf-rounded)' }}>S</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Sarah Chen</div>
            <div style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>sarah@example.com · Free</div>
          </div>
          <SF.chevron />
        </div>

        <ListGroup header="Spending">
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-green)" title="Budgets" detail="$400/mo · 4 caps" accessory={<SF.chevron />} />
          <ListRow icon={<SF.bell size={14} />} iconBg="var(--sys-orange)" title="Notifications" detail="80% · 100% · weekly" accessory={<SF.chevron />} />
        </ListGroup>

        <ListGroup header="Receipts">
          <ListRow icon={<SF.viewfinder size={14} />} iconBg="var(--sys-blue)" title="Camera quality" value="Auto" accessory={<SF.chevron />} />
          <ListRow icon={<SF.doc size={14} />} iconBg="var(--sys-indigo)" title="Language" value="English" accessory={<SF.chevron />} />
          <ListRow icon={<SF.clock size={14} />} iconBg="var(--sys-teal)" title="History retention" value="Forever" accessory={<SF.chevron />} />
        </ListGroup>

        <ListGroup header="Account">
          <ListRow title="Privacy" accessory={<SF.chevron />} />
          <ListRow title="Help & feedback" accessory={<SF.chevron />} />
          <ListRow title="About" detail="v1.0.0" accessory={<SF.chevron />} />
        </ListGroup>

        <button style={{ height: 44, background: 'var(--ios-bg-2)', border: 'none', borderRadius: 10, fontSize: 17, color: 'var(--sys-red)', fontWeight: 500 }}>Sign out</button>
      </div>
    </Phone>
  );
}

// Auth · sign in
function SignIn() {
  return (
    <Phone label="02b · Sign in (returning)">
      <div style={{ flex: 1, padding: '40px 28px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <div style={{ fontFamily: 'var(--font-wordmark)', fontSize: 32, letterSpacing: '-0.02em' }}>Welcome back</div>
          <div style={{ fontSize: 14, color: 'var(--ios-label-2)', marginTop: 4 }}>Sign in to sync your receipts.</div>
        </div>
        <ListGroup>
          <div style={{ padding: '13px 16px' }}>
            <input placeholder="Email" style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit', background: 'transparent' }} />
          </div>
          <div style={{ height: 1, background: 'var(--ios-separator)', marginLeft: 16 }} />
          <div style={{ padding: '13px 16px' }}>
            <input type="password" placeholder="Password" style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit', background: 'transparent' }} />
          </div>
        </ListGroup>
        <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', borderRadius: 12, border: 'none', fontSize: 17, fontWeight: 600 }}>Sign in</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ios-label-2)', fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--ios-separator)' }} />or<div style={{ flex: 1, height: 1, background: 'var(--ios-separator)' }} />
        </div>
        <button style={{ height: 50, background: '#000', color: '#fff', borderRadius: 12, border: 'none', fontSize: 17, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
           Continue with Apple
        </button>
        <div style={{ textAlign: 'right', marginTop: -6 }}>
          <span style={{ fontSize: 13, color: 'var(--gg-tint)', fontWeight: 500 }}>Forgot password?</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ios-label-2)' }}>
          New here? <span style={{ color: 'var(--gg-tint)', fontWeight: 600 }}>Create account</span>
        </div>
      </div>
    </Phone>
  );
}

// Auth · sign up
function SignUp() {
  return (
    <Phone label="02 · Sign up">
      <NavBar left="Back" title="" right="" />
      <div style={{ flex: 1, padding: '8px 28px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <div style={{ fontFamily: 'var(--font-wordmark)', fontSize: 32, letterSpacing: '-0.02em' }}>Create account</div>
          <div style={{ fontSize: 14, color: 'var(--ios-label-2)', marginTop: 4, lineHeight: 1.4 }}>Save your budget across devices and back up your receipts.</div>
        </div>

        <button style={{ height: 50, background: '#000', color: '#fff', borderRadius: 12, border: 'none', fontSize: 17, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
           Continue with Apple
        </button>
        <button style={{ height: 50, background: 'var(--ios-bg-2)', color: 'var(--ios-label)', borderRadius: 12, border: '0.5px solid var(--ios-separator)', fontSize: 17, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.92v2.33A9 9 0 009 18z"/><path fill="#FBBC05" d="M3.97 10.71A5.4 5.4 0 013.68 9c0-.6.1-1.18.29-1.71V4.96H.92A9 9 0 000 9c0 1.45.35 2.83.92 4.04l3.05-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 009 0 9 9 0 00.92 4.96l3.05 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
          Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ios-label-2)', fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--ios-separator)' }} />or sign up with email<div style={{ flex: 1, height: 1, background: 'var(--ios-separator)' }} />
        </div>

        <ListGroup>
          <div style={{ padding: '13px 16px' }}>
            <input placeholder="Email" style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit', background: 'transparent' }} />
          </div>
          <div style={{ height: 1, background: 'var(--ios-separator)', marginLeft: 16 }} />
          <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <input type="password" placeholder="Password · 8+ characters" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit', background: 'transparent' }} />
            <SF.eye size={16} />
          </div>
        </ListGroup>

        <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', borderRadius: 12, border: 'none', fontSize: 17, fontWeight: 600 }}>Create account</button>

        <div style={{ fontSize: 11, color: 'var(--ios-label-2)', textAlign: 'center', lineHeight: 1.45 }}>
          By continuing you agree to the <span style={{ color: 'var(--gg-tint)' }}>Terms</span> and <span style={{ color: 'var(--gg-tint)' }}>Privacy Policy</span>.
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ios-label-2)' }}>
          Already have an account? <span style={{ color: 'var(--gg-tint)', fontWeight: 600 }}>Sign in</span>
        </div>
      </div>
    </Phone>
  );
}

// Auth · forgot password
function ForgotPassword() {
  return (
    <Phone label="Recovery · forgot password">
      <NavBar left="Back" title="" right="" />
      <div style={{ flex: 1, padding: '8px 28px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <div style={{ width: 60, height: 60, borderRadius: 14, background: 'var(--ios-fill-3)', color: 'var(--gg-tint)', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
            <SF.envelope size={28} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Reset password</div>
          <div style={{ fontSize: 14, color: 'var(--ios-label-2)', marginTop: 6, lineHeight: 1.45 }}>Enter your email and we'll send a link to reset your password.</div>
        </div>
        <ListGroup>
          <div style={{ padding: '13px 16px' }}>
            <input placeholder="Email" defaultValue="alex@example.com" style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit', background: 'transparent' }} />
          </div>
        </ListGroup>
        <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', borderRadius: 12, border: 'none', fontSize: 17, fontWeight: 600 }}>Send reset link</button>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ios-label-2)' }}>
          Remembered it? <span style={{ color: 'var(--gg-tint)', fontWeight: 600 }}>Back to sign in</span>
        </div>
      </div>
    </Phone>
  );
}

// Auth · check your email (post sign-up / forgot password confirmation)
function VerifyEmail() {
  return (
    <Phone label="03 · Verify email">
      <div style={{ flex: 1, padding: '40px 28px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--gg-tint)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 12px 28px rgba(31,122,74,0.25)' }}>
          <SF.envelope size={34} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Check your email</div>
        <div style={{ fontSize: 14, color: 'var(--ios-label-2)', lineHeight: 1.5, maxWidth: 260 }}>
          We sent a verification link to<br/>
          <span style={{ color: 'var(--ios-label)', fontWeight: 600 }}>alex@example.com</span>.<br/>
          Tap the link to finish setting up your account.
        </div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--ios-label-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <SF.clock size={13} /> Resend available in <span style={{ color: 'var(--ios-label)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>0:42</span>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 28, left: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', borderRadius: 12, border: 'none', fontSize: 17, fontWeight: 600 }}>Open Mail</button>
        <button style={{ background: 'transparent', border: 'none', color: 'var(--gg-tint)', fontSize: 15, height: 36 }}>Use a different email</button>
      </div>
    </Phone>
  );
}

// Auth · sign-in failed (wrong password)
function SignInError() {
  return (
    <Phone label="Recovery · sign-in error">
      <div style={{ flex: 1, padding: '40px 28px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <div style={{ fontFamily: 'var(--font-wordmark)', fontSize: 32, letterSpacing: '-0.02em' }}>Welcome back</div>
          <div style={{ fontSize: 14, color: 'var(--ios-label-2)', marginTop: 4 }}>Sign in to sync your receipts.</div>
        </div>
        <div style={{ background: 'rgba(255,59,48,0.12)', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--sys-red)' }}>
          <SF.bell size={14} />
          <span>Email or password is incorrect. <span style={{ fontWeight: 600, textDecoration: 'underline' }}>Reset password</span></span>
        </div>
        <ListGroup>
          <div style={{ padding: '13px 16px' }}>
            <input placeholder="Email" defaultValue="alex@example.com" style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit', background: 'transparent' }} />
          </div>
          <div style={{ height: 1, background: 'var(--sys-red)', marginLeft: 16, opacity: 0.4 }} />
          <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <input type="password" placeholder="Password" defaultValue="••••••••" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit', background: 'transparent', color: 'var(--sys-red)' }} />
            <SF.eye size={16} />
          </div>
        </ListGroup>
        <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', borderRadius: 12, border: 'none', fontSize: 17, fontWeight: 600 }}>Sign in</button>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ios-label-2)' }}>
          New here? <span style={{ color: 'var(--gg-tint)', fontWeight: 600 }}>Create account</span>
        </div>
      </div>
    </Phone>
  );
}

// Offline · sync queue
function OfflineSync() {
  return (
    <Phone label="Offline · sync queue">
      <NavBar large title="History" right="" />
      <div style={{ padding: '0 16px 8px' }}>
        <div style={{ background: 'rgba(255,149,0,0.12)', borderRadius: 10, padding: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--sys-orange)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M3 12a9 9 0 0118 0M21 12a9 9 0 01-18 0M3 12l3 3M3 12l-3 3" /></svg>
          </div>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--ios-label)' }}>Offline · 2 receipts queued</div>
          <span style={{ fontSize: 12, color: 'var(--sys-orange)', fontWeight: 600 }}>Will sync</span>
        </div>
      </div>
      <div style={{ flex: 1, padding: '0 16px 90px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup header="Pending">
          <ListRow icon={<SF.clock size={14} />} iconBg="var(--sys-orange)" title="Trader Joe's" detail="Captured 2h ago · waiting for connection" />
          <ListRow icon={<SF.clock size={14} />} iconBg="var(--sys-orange)" title="CVS" detail="Captured 5h ago · waiting for connection" />
        </ListGroup>
        <ListGroup header="Synced">
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-green)" title="Whole Foods" value="$73.91" detail="Apr 17" />
          <ListRow icon={<SF.cart size={14} />} iconBg="var(--sys-green)" title="Safeway" value="$31.40" detail="Apr 16" />
        </ListGroup>
      </div>
      <TabBar active="History" />
    </Phone>
  );
}

// Language settings (international receipts — RC-05)
function LanguageSettings() {
  const langs = [
    ['English', 'auto', true],
    ['French', 'Français', false],
    ['Spanish', 'Español', false],
    ['German', 'Deutsch', false],
    ['Serbian', 'Српски', false],
    ['Mandarin', '中文', false],
  ];
  return (
    <Phone label="RC-05 · Language">
      <NavBar left="Settings" title="Language" right="" />
      <div style={{ padding: '8px 16px', fontSize: 13, color: 'var(--ios-label-2)' }}>Receipts in any selected language are processed automatically.</div>
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto' }}>
        <ListGroup footer="Decimal separators (commas vs. periods) are detected from the receipt itself.">
          {langs.map(([n, native, on], i) => (
            <div key={n} style={{ padding: '11px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{n}</div>
                <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{native}</div>
              </div>
              <div style={{ width: 51, height: 31, borderRadius: 999, background: on ? 'var(--gg-tint)' : 'var(--ios-fill-1)', padding: 2, display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
                <div style={{ width: 27, height: 27, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }} />
              </div>
            </div>
          ))}
        </ListGroup>
      </div>
    </Phone>
  );
}

function Row({ children }) {
  return <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'flex-start' }}>{children}</div>;
}

// Composed flow components for V1 Screens canvas
function OnboardingFlow() {
  const M = window.MVPScreens;
  return (
    <Row>
      <M.OnbWelcome />
      <SignUp />
      <VerifyEmail />
      <M.OnbBudget />
      <M.OnbCamera />
    </Row>
  );
}

function AuthAlternates() {
  return (
    <Row>
      <SignIn />
      <ForgotPassword />
      <SignInError />
    </Row>
  );
}

window.OnboardingFlow = OnboardingFlow;
window.AuthAlternates = AuthAlternates;

window.MVPGap = {
  SectionMVPGap: () => <Row>
    <CategoryPicker /><TopItems /><Trend /><ReceiptDetail /><PushNotifs /><ManualEntry /><LibraryPicker /><HighValueReview />
  </Row>,
  SectionAuth: () => <Row>
    <SignIn /><SignUp /><ForgotPassword /><VerifyEmail /><SignInError />
  </Row>,
  SignUp, SignIn, ForgotPassword, VerifyEmail, SignInError,
  SectionCrossCutting: () => <Row>
    <SettingsHub /><OfflineSync /><LanguageSettings />
  </Row>,
};
