/* global React, GG2, PhoneShell */
// V1.5 Household — gap screens
const { SF, ListGroup, ListRow } = window.GG2;
const { Phone, NavBar, TabBar } = window.PhoneShell;
const { BudgetRing } = window;

function Avatar({ initial, color, size = 32 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: size * 0.42, fontWeight: 600, flexShrink: 0 }}>
      {initial}
    </div>
  );
}

// HH · Accept invite (recipient side)
function AcceptInvite() {
  return (
    <Phone label="HH · Accept invite">
      <div style={{ flex: 1, padding: '40px 24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: -8, marginTop: 20 }}>
          <Avatar initial="E" color="var(--sys-purple)" size={56} />
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gg-tint-bg)', color: 'var(--gg-tint)', display: 'grid', placeItems: 'center', margin: '0 -8px', zIndex: 1, border: '3px solid var(--ios-bg)' }}>
            <SF.cart size={14} />
          </div>
          <Avatar initial="?" color="var(--ios-fill-1)" size={56} />
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Emma invited you</div>
          <div style={{ fontSize: 14, color: 'var(--ios-label-2)', marginTop: 6, lineHeight: 1.4, maxWidth: 240 }}>Join <strong style={{ color: 'var(--ios-label)' }}>Carter Household</strong> on Grocery Genie. You'll share a budget and price history.</div>
        </div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14, width: '100%', textAlign: 'left', marginTop: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your role</div>
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>Contributor</div>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)', marginTop: 2, lineHeight: 1.4 }}>You can scan, view shared data, and edit your own receipts.</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600 }}>Join household</button>
          <button style={{ height: 44, background: 'transparent', color: 'var(--ios-label-2)', border: 'none', fontSize: 15 }}>Decline</button>
        </div>
      </div>
    </Phone>
  );
}

// HH · Viewer-role dashboard (read-only)
function ViewerDashboard() {
  return (
    <Phone label="HH · Viewer">
      <div style={{ padding: '4px 16px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.36px' }}>Budget</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ios-label-2)', background: 'var(--ios-fill-3)', padding: '4px 8px', borderRadius: 6, letterSpacing: '0.04em' }}>VIEWER</div>
      </div>
      <div style={{ padding: '0 16px', flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <BudgetRing size={108} label="$284" sub="left · 11d" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>Carter Household · April</div>
            <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: 20, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>$516 / $800</div>
            <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 2 }}>Read-only · 3 contributors</div>
          </div>
        </div>
        <div style={{ background: 'rgba(0,122,255,0.08)', borderRadius: 12, padding: 12, fontSize: 12, color: 'var(--ios-label-2)', lineHeight: 1.4, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <SF.bell size={14} />
          <span>You can see how the household is doing but can't add receipts or change budgets. Ask Emma for Contributor access.</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 4px' }}>By Category</div>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {[['Groceries', 'var(--sys-green)', SF.cart, '$298', 65], ['Beverages', 'var(--sys-indigo)', SF.doc, '$72', 80], ['Household', 'var(--sys-blue)', SF.doc, '$58', 50]].map(([n, c, I, $, p], i) => (
            <div key={n} style={{ padding: '11px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: c, color: '#fff', display: 'grid', placeItems: 'center' }}><I size={14} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{n}</div>
                <div style={{ height: 3, background: 'var(--ios-fill-3)', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ width: p + '%', height: '100%', background: c }} />
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 600, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{$}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Tab bar with Scan greyed out */}
      <div style={{ position: 'absolute', bottom: 14, left: 12, right: 12, background: 'var(--mat-chrome)', backdropFilter: 'blur(28px)', borderRadius: 999, padding: 6, display: 'flex', justifyContent: 'space-around' }}>
        <div style={{ padding: '8px 14px', borderRadius: 999, background: 'var(--gg-tint-bg)', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gg-tint)' }}>
          <SF.cart size={16} /><span style={{ fontSize: 12, fontWeight: 600 }}>Budget</span>
        </div>
        <div style={{ padding: '8px 14px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ios-label-3)', opacity: 0.5 }}>
          <SF.viewfinder size={16} /><span style={{ fontSize: 12, fontWeight: 600 }}>Scan</span>
        </div>
        <div style={{ padding: '8px 14px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ios-label-2)' }}>
          <SF.clock size={16} /><span style={{ fontSize: 12, fontWeight: 600 }}>History</span>
        </div>
      </div>
    </Phone>
  );
}

// HH-02 · Remove member confirmation
function RemoveMember() {
  return (
    <Phone label="HH · Remove member">
      <NavBar left="Members" title="Lily Carter" right="" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Avatar initial="L" color="var(--sys-pink)" size={64} />
          <div style={{ fontSize: 17, fontWeight: 600 }}>Lily Carter</div>
          <div style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>Joined Apr 12 · Viewer</div>
        </div>
        <ListGroup>
          <ListRow title="Role" value="Viewer" accessory={<SF.chevron />} />
          <ListRow title="Receipts" value="2" />
          <ListRow title="Spent in April" value="$45" />
        </ListGroup>
        {/* Confirmation sheet */}
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', textAlign: 'center', borderBottom: '0.5px solid var(--ios-separator)' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Remove Lily from household?</div>
            <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 4, lineHeight: 1.4 }}>Their receipts stay attributed but they lose access to shared data.</div>
          </div>
          <div style={{ padding: '11px 16px', textAlign: 'center', color: 'var(--sys-red)', fontSize: 17, fontWeight: 500 }}>Remove member</div>
        </div>
        <button style={{ height: 50, background: 'var(--ios-bg-2)', color: 'var(--ios-label)', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600 }}>Cancel</button>
      </div>
    </Phone>
  );
}

// HH-03 · Budget split (household vs individual caps)
function BudgetSplit() {
  return (
    <Phone label="HH-03 · Budget split">
      <NavBar left="Cancel" title="Budgets" right="Save" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup header="Household-wide" footer="Shared cap. Everyone contributes; everyone sees progress.">
          <ListRow title="Monthly limit" value="$800.00" accessory={<SF.chevron />} />
          <ListRow title="Reset day" value="1st" accessory={<SF.chevron />} />
        </ListGroup>
        <ListGroup header="Per-member caps" footer="Optional. Each member can also have their own cap inside the household total.">
          <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar initial="E" color="var(--sys-purple)" size={32} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Emma · You</div>
              <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>Admin</div>
            </div>
            <span style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>$400</span>
            <SF.chevron />
          </div>
          <div style={{ height: 1, background: 'var(--ios-separator)', marginLeft: 14 }} />
          <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar initial="J" color="var(--sys-blue)" size={32} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>James</div>
              <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>Contributor</div>
            </div>
            <span style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>$300</span>
            <SF.chevron />
          </div>
          <div style={{ height: 1, background: 'var(--ios-separator)', marginLeft: 14 }} />
          <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar initial="L" color="var(--sys-pink)" size={32} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Lily</div>
              <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>Viewer</div>
            </div>
            <span style={{ fontSize: 15, color: 'var(--ios-label-3)' }}>None</span>
            <SF.chevron />
          </div>
        </ListGroup>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 12, padding: 12, fontSize: 12, color: 'var(--ios-label-2)', lineHeight: 1.4 }}>
          Sum of caps: $700 of $800 · $100 unallocated.
        </div>
      </div>
    </Phone>
  );
}

// HH · Family paywall
function FamilyPaywall() {
  return (
    <Phone label="HH · Family paywall">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px 0', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--ios-fill-3)', display: 'grid', placeItems: 'center', color: 'var(--ios-label-2)' }}>×</div>
        </div>
        <div style={{ padding: '20px 24px 0', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <Avatar initial="E" color="var(--sys-purple)" size={44} />
            <div style={{ marginLeft: -8 }}><Avatar initial="J" color="var(--sys-blue)" size={44} /></div>
            <div style={{ marginLeft: -8 }}><Avatar initial="L" color="var(--sys-pink)" size={44} /></div>
            <div style={{ marginLeft: -8 }}><Avatar initial="+" color="var(--gg-tint)" size={44} /></div>
          </div>
          <div style={{ fontFamily: 'var(--font-wordmark)', fontSize: 28, letterSpacing: '-0.02em' }}>Family</div>
          <div style={{ fontSize: 14, color: 'var(--ios-label-2)', marginTop: 4, lineHeight: 1.4 }}>Share Grocery Genie with your household.</div>
        </div>
        <div style={{ flex: 1, padding: '20px 16px 0', overflow: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {[['Up to 5 members', SF.plus], ['Shared budgets & history', SF.cart], ['Three roles · Admin, Contributor, Viewer', SF.gear], ['Per-member caps', SF.doc], ['Everything in Premium', SF.bell]].map(([f, I]) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--gg-tint-bg)', color: 'var(--gg-tint)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><I size={12} /></div>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{f}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ background: 'var(--ios-bg-2)', borderRadius: 12, padding: 14, border: '2px solid var(--gg-tint)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: -8, right: 12, background: 'var(--gg-tint)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>BEST VALUE</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Yearly Family</div>
              <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>$59.99 <span style={{ fontSize: 12, color: 'var(--ios-label-2)', fontWeight: 500 }}>/yr</span></div>
              <div style={{ fontSize: 11, color: 'var(--ios-label-2)', marginTop: 2 }}>$1.00/month per person at 5 members</div>
            </div>
            <div style={{ background: 'var(--ios-bg-2)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Monthly Family</div>
              <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>$7.99 <span style={{ fontSize: 12, color: 'var(--ios-label-2)', fontWeight: 500 }}>/mo</span></div>
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 16px 16px' }}>
          <button style={{ height: 50, background: 'var(--gg-tint)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600, width: '100%' }}>Start 7-day free trial</button>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ios-label-2)', marginTop: 8 }}>Already Premium? Upgrade for $20/yr.</div>
        </div>
      </div>
    </Phone>
  );
}

function Row({ children }) { return <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>{children}</div>; }

window.HHGap = {
  SectionHHGap: () => <Row><AcceptInvite /><ViewerDashboard /><RemoveMember /><BudgetSplit /><FamilyPaywall /></Row>,
};
