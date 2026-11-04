/* global React, GG2, Roadmap */
// V1.5 — Household Sharing
const { SF, ListGroup, ListRow } = window.GG2;
const { RPhone, RNav, RTabBar, ReleaseNote, PhoneRow } = window.Roadmap;
const { BudgetRing } = window;

// Avatar circle
function Avatar({ initial, color, size = 32 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: size * 0.42, fontWeight: 600, flexShrink: 0 }}>
      {initial}
    </div>
  );
}

// HH-01 — Invite members
function Invite() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav left="Cancel" title="Invite to household" right="Send" />
      <div style={{ flex: 1, padding: '8px 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--gg-tint-bg)', color: 'var(--gg-tint)', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-sf-rounded)' }}>SH</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Carter Household</div>
            <div style={{ fontSize: 13, color: 'var(--ios-label-2)' }}>2 of 5 members</div>
          </div>
        </div>

        <ListGroup header="Invite by email">
          <div style={{ padding: '11px 16px' }}>
            <input placeholder="name@example.com" style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit', background: 'transparent' }} />
          </div>
        </ListGroup>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ios-label-2)', fontSize: 12, padding: '0 8px' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--ios-separator)' }} />
          <span>OR</span>
          <div style={{ flex: 1, height: 1, background: 'var(--ios-separator)' }} />
        </div>

        <ListGroup footer="Link expires in 7 days · anyone with the link can join">
          <ListRow
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" /></svg>}
            iconBg="var(--sys-blue)"
            title="Copy invite link"
            detail="grocerygenie.app/j/4kp9"
            accessory={<SF.chevron />}
          />
          <ListRow
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" fill="#fff" /><rect x="6" y="6" width="3" height="3" /><rect x="11" y="6" width="3" height="3" /><rect x="15" y="6" width="3" height="3" /><rect x="6" y="11" width="3" height="3" /><rect x="11" y="15" width="3" height="3" /><rect x="6" y="15" width="3" height="3" /><rect x="15" y="11" width="3" height="3" /></svg>}
            iconBg="var(--ios-label)"
            title="Show QR code"
            accessory={<SF.chevron />}
          />
        </ListGroup>

        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>New member role</div>
          <div style={{ display: 'flex', background: 'var(--ios-fill-3)', padding: 2, borderRadius: 9 }}>
            {['Admin', 'Contributor', 'Viewer'].map((t, i) => (
              <div key={t} style={{ flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 7, background: i === 1 ? 'var(--ios-bg-2)' : 'transparent', fontSize: 13, fontWeight: i === 1 ? 600 : 400, boxShadow: i === 1 ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>{t}</div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ios-label-2)', marginTop: 8, lineHeight: 1.4 }}>
            Can scan, view shared data, and edit their own receipts.
          </div>
        </div>
      </div>
    </div>
  );
}

// HH-02 — Members & roles
function Members() {
  const members = [
    { name: 'Emma Carter', sub: 'You · joined Mar 1', role: 'Admin', color: 'var(--sys-purple)', initial: 'E' },
    { name: 'James Carter', sub: 'joined Mar 4', role: 'Contributor', color: 'var(--sys-blue)', initial: 'J' },
    { name: 'Lily Carter', sub: 'joined Apr 12', role: 'Viewer', color: 'var(--sys-pink)', initial: 'L' },
    { name: 'sam@…', sub: 'invited 2d ago', role: 'Pending', color: 'var(--ios-fill-1)', initial: 'S', pending: true },
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav left="Settings" title="Household" right="Edit" />
      <div style={{ flex: 1, padding: '0 16px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ListGroup header="Members · 3 of 5">
          {members.map(m => (
            <div key={m.name} style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar initial={m.initial} color={m.color} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: m.pending ? 'var(--ios-label-2)' : 'var(--ios-label)' }}>{m.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{m.sub}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: m.pending ? 'var(--sys-orange)' : 'var(--ios-label-2)', background: m.pending ? 'rgba(255,149,0,0.14)' : 'var(--ios-fill-3)', padding: '3px 8px', borderRadius: 6, letterSpacing: '0.02em' }}>{m.role}</span>
            </div>
          ))}
        </ListGroup>

        <button style={{ height: 44, background: 'var(--ios-bg-2)', border: 'none', borderRadius: 10, fontSize: 17, color: 'var(--gg-tint)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <SF.plus size={16} /> Invite member
        </button>

        <ListGroup header="Permissions" footer="Roles apply within this household only.">
          <ListRow title="Admin" detail="Manage members, set budgets" accessory={<SF.chevron />} />
          <ListRow title="Contributor" detail="Scan, view shared, edit own" accessory={<SF.chevron />} />
          <ListRow title="Viewer" detail="Read-only dashboards" accessory={<SF.chevron />} />
        </ListGroup>
      </div>
    </div>
  );
}

// HH-03 — Household dashboard with toggle
function HouseholdDashboard() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '4px 16px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: 'var(--font-sf)', fontSize: 28, fontWeight: 700, letterSpacing: '0.36px' }}>Budget</div>
        <div style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--ios-fill-3)', display: 'grid', placeItems: 'center' }}><SF.gear size={16} /></div>
      </div>

      <div style={{ padding: '0 16px 8px' }}>
        <div style={{ display: 'flex', background: 'var(--ios-fill-3)', padding: 2, borderRadius: 9 }}>
          {['My spending', 'Household'].map((t, i) => (
            <div key={t} style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 7, background: i === 1 ? 'var(--ios-bg-2)' : 'transparent', fontSize: 13, fontWeight: i === 1 ? 600 : 400, boxShadow: i === 1 ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>{t}</div>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 16px', flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <BudgetRing size={108} label="$284" sub="left · 11d" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>Carter Household · April</div>
            <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 700, fontSize: 20, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>$516 / $800</div>
            <div style={{ fontSize: 12, color: 'var(--gg-tint)', marginTop: 2 }}>3 contributors</div>
          </div>
        </div>

        <div style={{ fontSize: 13, color: 'var(--ios-label-2)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 4px' }}>By Member</div>

        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {[
            ['Emma', 'E', 'var(--sys-purple)', 12, 287, 70],
            ['James', 'J', 'var(--sys-blue)', 8, 184, 45],
            ['Lily', 'L', 'var(--sys-pink)', 2, 45, 11],
          ].map(([n, init, c, count, amt, pct], i) => (
            <div key={n} style={{ padding: '11px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar initial={init} color={c} size={28} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{n}</div>
                <div style={{ height: 3, background: 'var(--ios-fill-3)', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ width: pct + '%', height: '100%', background: c }} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-sf-rounded)', fontWeight: 600, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>${amt}</div>
                <div style={{ fontSize: 11, color: 'var(--ios-label-2)' }}>{count} receipts</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <RTabBar active="Budget" />
    </div>
  );
}

// HH — Receipt with member attribution
function ReceiptHistoryShared() {
  const items = [
    ['Costco', '$142.18', '2h ago', 'Emma', 'E', 'var(--sys-purple)'],
    ['Trader Joe\'s', '$58.42', 'Yesterday', 'James', 'J', 'var(--sys-blue)'],
    ['Whole Foods', '$73.91', 'Apr 17', 'Emma', 'E', 'var(--sys-purple)'],
    ['Safeway', '$31.40', 'Apr 16', 'James', 'J', 'var(--sys-blue)'],
    ['CVS', '$12.99', 'Apr 14', 'Emma', 'E', 'var(--sys-purple)'],
    ['Trader Joe\'s', '$45.20', 'Apr 12', 'James', 'J', 'var(--sys-blue)'],
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RNav title="History" right="" left="" large />
      <div style={{ padding: '0 16px 8px' }}>
        <div style={{ background: 'var(--ios-fill-3)', borderRadius: 10, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ios-label-2)' }}>
          <SF.search size={14} />
          <span style={{ fontSize: 14 }}>Search receipts</span>
        </div>
      </div>
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, overflow: 'auto' }}>
        {[
          ['All', true], ['Emma', false, 'var(--sys-purple)'], ['James', false, 'var(--sys-blue)'], ['Lily', false, 'var(--sys-pink)']
        ].map(([t, a, c]) => (
          <div key={t} style={{ padding: '5px 12px', borderRadius: 999, background: a ? 'var(--gg-tint-bg)' : 'var(--ios-fill-3)', color: a ? 'var(--gg-tint)' : 'var(--ios-label)', fontSize: 13, fontWeight: a ? 600 : 400, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            {c && <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />}
            {t}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, padding: '0 16px 90px', overflow: 'auto' }}>
        <div style={{ background: 'var(--ios-bg-2)', borderRadius: 14, overflow: 'hidden' }}>
          {items.map(([store, total, when, who, init, c], i) => (
            <div key={i} style={{ padding: '12px 14px', borderTop: i ? '0.5px solid var(--ios-separator)' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar initial={init} color={c} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{store}</div>
                <div style={{ fontSize: 12, color: 'var(--ios-label-2)' }}>{who} · {when}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{total}</div>
              <SF.chevron />
            </div>
          ))}
        </div>
      </div>
      <RTabBar active="History" />
    </div>
  );
}

function V15Screens() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ReleaseNote>
        <strong style={{ color: 'var(--ios-label)' }}>V1.5 · Household.</strong> One household, up to 5 members on Premium. Three roles control what each can see and do. The dashboard's familiar ring gets a "My / Household" toggle. Every receipt is now attributed to the member who scanned it.
      </ReleaseNote>
      <PhoneRow>
        <RPhone label="HH-01 · Invite"><Invite /></RPhone>
        <RPhone label="HH-02 · Members"><Members /></RPhone>
        <RPhone label="HH-03 · Household View"><HouseholdDashboard /></RPhone>
        <RPhone label="HH · Shared History"><ReceiptHistoryShared /></RPhone>
      </PhoneRow>
    </div>
  );
}

window.V15Screens = V15Screens;
