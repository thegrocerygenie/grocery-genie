/* global React, GG2, PhoneShell */
const { SF, ListGroup, ListRow } = window.GG2;
const { BudgetRing } = window;
const { Phone, NavBar, TabBar } = window.PhoneShell;

// ─── Onboarding flow ─────────────────────────────────────
function OnbWelcome() {
  return (
    <Phone label="01 · Welcome">
      <div style={{ flex: 1, padding: '40px 28px 100px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 20 }}>
        <div style={{ width: 88, height: 88, borderRadius: 22, background: 'var(--gg-tint)', display: 'grid', placeItems: 'center', color: '#fff', boxShadow: '0 12px 28px rgba(31,122,74,0.25)' }}>
          <SF.cart size={44} />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-wordmark)', fontSize: 38, letterSpacing: '-0.02em' }}>Grocery Genie</div>
          <div style={{ fontSize: 15, color: 'var(--ios-label-2)', marginTop: 6, lineHeight: 1.4 }}>Snap a receipt, watch your grocery budget take shape.</div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 28, left: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PrimaryButton>Get Started</PrimaryButton>
        <button style={{ background: 'transparent', border: 'none', color: 'var(--gg-tint)', fontSize: 15, fontWeight: 500, height: 36 }}>I already have an account</button>
      </div>
    </Phone>
  );
}

function OnbBudget() {
  return (
    <Phone label="02 · Set first budget">
      <NavBar left="Back" title="Set Budget" right="Skip" />
      <div style={{ padding: '0 16px', flex: 1, overflow: 'hidden' }}>
        <div style={{ fontSize: 13, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '8px 16px 6px' }}>Monthly Budget</div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, padding: '20px 16px' }}>
          <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 48, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', textAlign: 'center', color: 'var(--ios-label)' }}>$400<span style={{ color: 'var(--ios-label-3)' }}>.00</span></div>
        </div>
        <Numpad />
      </div>
      <div style={{ position: 'absolute', bottom: 28, left: 16, right: 16 }}>
        <PrimaryButton>Continue</PrimaryButton>
      </div>
    </Phone>
  );
}

function OnbCamera() {
  return (
    <Phone label="03 · Camera permission">
      <div style={{ flex: 1, padding: '40px 28px 110px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--ios-fill-3)', color: 'var(--gg-tint)', display: 'grid', placeItems: 'center' }}><SF.camera size={32} /></div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Allow Camera Access</div>
        <div style={{ fontSize: 15, color: 'var(--ios-label-2)', lineHeight: 1.45 }}>Grocery Genie uses the camera only to scan receipts. Photos are processed on-device.</div>
      </div>
      <div style={{ position: 'absolute', bottom: 28, left: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PrimaryButton>Continue</PrimaryButton>
        <button style={{ background: 'transparent', border: 'none', color: 'var(--gg-tint)', fontSize: 15, height: 36 }}>Not now</button>
      </div>
    </Phone>
  );
}

// ─── Dashboard variants ──────────────────────────────────
function DashEmpty() {
  return (
    <Phone label="04 · Dashboard · empty">
      <NavBar large title="Budget" right="" />
      <div style={{ padding: '0 16px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--ios-fill-3)', color: 'var(--ios-label-2)', display: 'grid', placeItems: 'center' }}><SF.viewfinder size={28} /></div>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Scan your first receipt</div>
        <div style={{ fontSize: 14, color: 'var(--ios-label-2)', maxWidth: 240, lineHeight: 1.45 }}>Your budget will fill in as you snap receipts.</div>
        <button style={{ marginTop: 8, height: 44, padding: '0 20px', background: 'var(--gg-tint)', color: '#fff', borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <SF.viewfinder size={16} /> Scan Receipt
        </button>
      </div>
      <TabBar active="Budget" />
    </Phone>
  );
}

function DashFilled() {
  return (
    <Phone label="05 · Dashboard · on track">
      <NavBar large title="Budget" right="" />
      <div style={{ padding: '0 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <BudgetRing size={108} label="$157" sub="left · 11d" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>April · day 19</div>
            <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: 20, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>$242 / $400</div>
            <div style={{ fontSize: 12, color: 'var(--gg-tint)', marginTop: 2 }}>On pace · 5% under</div>
          </div>
        </div>
        <SectionLabel>By Category</SectionLabel>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {[['Groceries', 'var(--sys-green)', SF.cart, '$142', 82], ['Beverages', 'var(--sys-indigo)', SF.doc, '$33', 110], ['Household', 'var(--sys-blue)', SF.doc, '$27', 54]].map(([n, c, I, $, p], i) => (
            <CatRow key={n} n={n} c={c} I={I} amt={$} p={p} sep={i > 0} />
          ))}
        </div>
      </div>
      <TabBar active="Budget" />
    </Phone>
  );
}

function DashOver() {
  return (
    <Phone label="06 · Dashboard · over budget">
      <NavBar large title="Budget" right="" />
      <div style={{ padding: '0 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <BudgetRingOver />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>April · day 28</div>
            <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: 20, marginTop: 2, fontVariantNumeric: 'tabular-nums', color: 'var(--sys-red)' }}>$432 / $400</div>
            <div style={{ fontSize: 12, color: 'var(--sys-red)', marginTop: 2 }}>Over by $32 · 2 days left</div>
          </div>
        </div>
        <div style={{ background: 'rgba(255,59,48,0.12)', borderRadius: 12, padding: 12, fontSize: 13, color: 'var(--sys-red)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <SF.bell size={16} />
          <span>Snacks & Beverages crossed their caps. Adjust limits or pause alerts.</span>
        </div>
        <SectionLabel>By Category</SectionLabel>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {[['Groceries', 'var(--sys-green)', SF.cart, '$214', 95], ['Beverages', 'var(--sys-indigo)', SF.doc, '$58', 145], ['Snacks', 'var(--sys-orange)', SF.doc, '$39', 110]].map(([n, c, I, $, p], i) => (
            <CatRow key={n} n={n} c={c} I={I} amt={$} p={p} sep={i > 0} />
          ))}
        </div>
      </div>
      <TabBar active="Budget" />
    </Phone>
  );
}

// ─── Scan flow ───────────────────────────────────────────
function ScanCapture() {
  return (
    <Phone label="07 · Scan · capture">
      <ScanBg detected />
      <div style={{ position: 'absolute', top: 44, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(20px)', padding: '7px 14px', borderRadius: 999, color: '#fff', fontSize: 13, fontWeight: 500 }}>Receipt detected</div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#fff', fontSize: 15 }}>Cancel</span>
        <div style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid #fff', padding: 4 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff' }} />
        </div>
        <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>Auto</span>
      </div>
    </Phone>
  );
}

function ScanProcessing() {
  return (
    <Phone label="08 · Scan · processing">
      <ScanBg blur />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(20px)', display: 'grid', placeItems: 'center' }}>
          <Spinner big />
        </div>
        <div style={{ color: '#fff', fontSize: 17, fontWeight: 600 }}>Reading receipt…</div>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Trader Joe's · 12 items</div>
      </div>
    </Phone>
  );
}

function ScanError() {
  return (
    <Phone label="09 · Scan · low quality">
      <ScanBg blur />
      <div style={{ position: 'absolute', top: 44, left: 16, right: 16, display: 'flex', justifyContent: 'center' }}>
        <div style={{ background: 'rgba(255,149,0,0.95)', padding: '8px 14px', borderRadius: 12, color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
          <SF.bell size={14} /> Image looks blurry — hold steady
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#fff', fontSize: 15 }}>Cancel</span>
        <div style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid #fff', padding: 4 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff' }} />
        </div>
        <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>Auto</span>
      </div>
    </Phone>
  );
}

// ─── Review ──────────────────────────────────────────────
function ReviewScreen() {
  return (
    <Phone label="10 · Review">
      <NavBar left="Cancel" title="Review" right="Save" />
      <div style={{ flex: 1, padding: '0 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup>
          <ListRow title="Store" value="Trader Joe's" accessory={<SF.chevron />} />
          <ListRow title="Date" value="Apr 24, 2026" accessory={<SF.chevron />} />
          <ListRow title="Total" value="$58.42" />
          <ListRow title="Category" value="Groceries" accessory={<SF.chevron />} />
        </ListGroup>
        <SectionLabel>Items · 12</SectionLabel>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, overflow: 'hidden' }}>
          {[['Bananas', '2.49', false], ['Greek yogurt', '4.99', false], ['Olive oil', '—', true], ['Sourdough', '5.50', false], ['Avocados', '6.00', false]].map(([n, p, low], i) => (
            <div key={n} style={{ padding: '11px 16px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15 }}>{n}</span>
              <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: low ? 'var(--sys-orange)' : 'var(--ios-label)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {low && <span style={{ fontSize: 11, fontWeight: 500 }}>verify</span>}${p}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

function ReviewEdit() {
  return (
    <Phone label="11 · Review · edit field">
      <NavBar left="Cancel" title="Edit Item" right="Done" />
      <div style={{ flex: 1, padding: '0 16px' }}>
        <ListGroup header="Item">
          <ListRow title="Name" value="Olive oil" />
          <ListRow title="Price" value="$" accessory={<span style={{ fontSize: 17, color: 'var(--ios-label-3)' }}>—</span>} />
          <ListRow title="Category" value="Groceries" accessory={<SF.chevron />} />
        </ListGroup>
        <Numpad />
      </div>
    </Phone>
  );
}

// ─── History ─────────────────────────────────────────────
function HistoryScreen() {
  return (
    <Phone label="12 · History">
      <NavBar large title="History" right="" />
      <div style={{ padding: '0 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
        <SearchField />
        <Segmented options={['Week', 'Month', 'All']} active={1} />
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 10, overflow: 'hidden' }}>
          {[
            ['Trader Joe\'s', 'Apr 24 · 12 items', '58.42', 'var(--sys-green)', SF.cart, false],
            ['Safeway', 'Apr 22 · 8 items', '42.11', 'var(--sys-green)', SF.cart, false],
            ['CVS', 'Apr 21 · Pending sync', '14.80', 'var(--sys-pink)', SF.doc, true],
            ['Whole Foods', 'Apr 18 · 22 items', '126.75', 'var(--sys-green)', SF.cart, false],
            ['Target', 'Apr 14 · 6 items', '38.20', 'var(--sys-blue)', SF.doc, false],
          ].map(([s, sub, t, c, I, pend], i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: c, color: '#fff', display: 'grid', placeItems: 'center' }}><I size={14} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{s}</div>
                <div style={{ fontSize: 12, color: pend ? 'var(--sys-orange)' : 'var(--ios-label-2)' }}>{sub}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 600, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>${t}</div>
              <SF.chevron />
            </div>
          ))}
        </div>
      </div>
      <TabBar active="History" />
    </Phone>
  );
}

function HistoryEmpty() {
  return (
    <Phone label="13 · History · empty">
      <NavBar large title="History" right="" />
      <div style={{ padding: '0 16px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--ios-fill-3)', color: 'var(--ios-label-2)', display: 'grid', placeItems: 'center' }}><SF.clock size={26} /></div>
        <div style={{ fontSize: 17, fontWeight: 600 }}>No receipts yet</div>
        <div style={{ fontSize: 13, color: 'var(--ios-label-2)', maxWidth: 220, lineHeight: 1.45 }}>Scanned receipts appear here, sorted by date.</div>
      </div>
      <TabBar active="History" />
    </Phone>
  );
}

// ─── Settings ────────────────────────────────────────────
function BudgetSettings() {
  return (
    <Phone label="14 · Budget Settings">
      <NavBar left="Cancel" title="Budget" right="Save" />
      <div style={{ flex: 1, padding: '0 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup header="Overall" footer="Resets on the 1st of each month.">
          <ListRow title="Monthly limit" value="$400.00" accessory={<SF.chevron />} />
          <ListRow title="Start day" value="1st" accessory={<SF.chevron />} />
        </ListGroup>
        <ListGroup header="Per-category limits">
          {[['Groceries', '$175', 'var(--sys-green)', SF.cart], ['Household', '$50', 'var(--sys-blue)', SF.doc], ['Beverages', '$30', 'var(--sys-indigo)', SF.doc], ['Snacks', '$25', 'var(--sys-orange)', SF.doc]].map(([n, v, c, I]) => (
            <ListRow key={n} icon={<I size={14} />} iconBg={c} title={n} value={v} accessory={<SF.chevron />} />
          ))}
        </ListGroup>
      </div>
    </Phone>
  );
}

function NotificationSettings() {
  return (
    <Phone label="15 · Notifications">
      <NavBar left="Back" title="Alerts" right="" />
      <div style={{ flex: 1, padding: '0 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup header="Budget alerts" footer="We'll send a quiet notification once per threshold per month.">
          <ToggleRow title="50% of budget" on={false} />
          <ToggleRow title="80% of budget" on={true} />
          <ToggleRow title="100% of budget" on={true} />
        </ListGroup>
        <ListGroup header="Weekly summary">
          <ToggleRow title="Send weekly summary" on={true} />
          <ListRow title="Day" value="Sunday" accessory={<SF.chevron />} />
        </ListGroup>
      </div>
    </Phone>
  );
}

function PermissionDenied() {
  return (
    <Phone label="16 · Permission denied">
      <div style={{ flex: 1, padding: '32px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14 }}>
        <div style={{ width: 60, height: 60, borderRadius: 14, background: 'rgba(255,59,48,0.12)', color: 'var(--sys-red)', display: 'grid', placeItems: 'center' }}><SF.camera size={28} /></div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Camera access is off</div>
        <div style={{ fontSize: 14, color: 'var(--ios-label-2)', lineHeight: 1.45, maxWidth: 240 }}>To scan receipts, enable Camera in Settings → Grocery Genie.</div>
        <button style={{ marginTop: 10, height: 44, padding: '0 22px', background: 'var(--gg-tint)', color: '#fff', borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 600 }}>Open Settings</button>
      </div>
    </Phone>
  );
}

// ─── Tiny shared bits ────────────────────────────────────
function PrimaryButton({ children }) {
  return <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', borderRadius: 12, border: 'none', fontSize: 17, fontWeight: 600, width: '100%' }}>{children}</button>;
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 13, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 16px 0' }}>{children}</div>;
}
function CatRow({ n, c, I, amt, p, sep }) {
  return (
    <div style={{ padding: '11px 14px', borderTop: sep ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: c, color: '#fff', display: 'grid', placeItems: 'center' }}><I size={14} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{n}</div>
        <div style={{ height: 3, background: 'var(--ios-fill-3)', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}>
          <div style={{ width: Math.min(p, 100) + '%', height: '100%', background: p > 100 ? 'var(--sys-red)' : c }} />
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 600, fontSize: 15, fontVariantNumeric: 'tabular-nums', color: p > 100 ? 'var(--sys-red)' : 'var(--ios-label)' }}>{amt}</div>
    </div>
  );
}
function Numpad() {
  const keys = [['1','2','3'],['4','5','6'],['7','8','9'],['.','0','⌫']];
  return (
    <div style={{ marginTop: 'auto', padding: '12px 0' }}>
      {keys.map((row, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
          {row.map(k => (
            <div key={k} style={{ height: 44, background: 'var(--ios-bg-2)', borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 400 }}>{k}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
function SearchField() {
  return (
    <div style={{ background: 'var(--ios-fill-3)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ios-label-2)' }}>
      <SF.search size={14} />
      <span style={{ fontSize: 15 }}>Search by store</span>
    </div>
  );
}
function Segmented({ options, active }) {
  return (
    <div style={{ display: 'flex', background: 'var(--ios-fill-3)', padding: 2, borderRadius: 9 }}>
      {options.map((o, i) => (
        <div key={o} style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 7, background: i === active ? 'var(--ios-bg-2)' : 'transparent', fontSize: 13, fontWeight: i === active ? 600 : 400, boxShadow: i === active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>{o}</div>
      ))}
    </div>
  );
}
function ToggleRow({ title, on }) {
  return (
    <div style={{ padding: '11px 16px', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 17 }}>{title}</span>
      <div style={{ width: 51, height: 31, borderRadius: 999, background: on ? 'var(--sys-green)' : 'var(--ios-fill-1)', padding: 2, display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
        <div style={{ width: 27, height: 27, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }} />
      </div>
    </div>
  );
}
function ScanBg({ detected, blur }) {
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: '#0a0a0a' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: blur ? 'blur(4px)' : 'none' }}>
        <div style={{ width: '64%', height: '70%', background: '#FBF8F2', borderRadius: 4, padding: 12, transform: 'rotate(-2deg)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', color: '#000' }}>TRADER JOE'S</div>
          {Array(8).fill(0).map((_, i) => <div key={i} style={{ height: 3, background: 'rgba(0,0,0,0.15)', width: [80, 65, 90, 75, 85, 60, 88, 70][i] + '%' }} />)}
        </div>
      </div>
      {detected && [['tl', 14, 14], ['tr', 14, 'r'], ['bl', 'b', 14], ['br', 'b', 'r']].map(([k, y, x]) => (
        <div key={k} style={{ position: 'absolute', top: y === 'b' ? 'auto' : y, bottom: y === 'b' ? 80 : 'auto', left: x === 'r' ? 'auto' : x, right: x === 'r' ? 14 : 'auto', width: 24, height: 24, borderTop: k[0] === 't' ? '2px solid #fff' : 'none', borderBottom: k[0] === 'b' ? '2px solid #fff' : 'none', borderLeft: k[1] === 'l' ? '2px solid #fff' : 'none', borderRight: k[1] === 'r' ? '2px solid #fff' : 'none' }} />
      ))}
    </>
  );
}
function Spinner({ big }) {
  const s = big ? 28 : 14;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{ animation: 'gg-spin 1s linear infinite' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <style>{`@keyframes gg-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
function BudgetRingOver() {
  return (
    <div style={{ position: 'relative', width: 108, height: 108 }}>
      <svg width={108} height={108} viewBox="0 0 108 108" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={54} cy={54} r={40} fill="none" stroke="var(--ios-fill-3)" strokeWidth="14" />
        <circle cx={54} cy={54} r={40} fill="none" stroke="var(--sys-red)" strokeWidth="14" strokeDasharray={2 * Math.PI * 40} strokeDashoffset={0} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: 18, color: 'var(--sys-red)', fontVariantNumeric: 'tabular-nums' }}>108%</div>
        <div style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>April</div>
      </div>
    </div>
  );
}

// ─── Section grid wrappers ───────────────────────────────
function Row({ children }) {
  return <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'flex-start' }}>{children}</div>;
}

function SectionOnboarding() {
  return <Row><OnbWelcome /><OnbBudget /><OnbCamera /></Row>;
}
function SectionDashboard() {
  return <Row><DashEmpty /><DashFilled /><DashOver /></Row>;
}
function SectionScan() {
  return <Row><ScanCapture /><ScanProcessing /><ScanError /><PermissionDenied /></Row>;
}
function SectionReview() {
  return <Row><ReviewScreen /><ReviewEdit /></Row>;
}
function SectionHistory() {
  return <Row><HistoryScreen /><HistoryEmpty /></Row>;
}
function SectionSettings() {
  return <Row><BudgetSettings /><NotificationSettings /></Row>;
}

window.MVPScreens = {
  SectionOnboarding, SectionDashboard, SectionScan,
  SectionReview, SectionHistory, SectionSettings,
};
