// Logo Lab — places each direction on the design canvas
// One DCSection per direction, with artboards for: large mark,
// horizontal lockup (light + dark), app icon, favicon row.

const DIRECTIONS = [
  {
    id: 'receipt',
    label: 'Receipt',
    kicker: 'Direction A',
    title: 'Receipt',
    desc: 'A folded thermal-paper receipt with a torn edge, anchored by a small barcode. Reads as the literal artifact your camera roll is full of — the input the product turns into intelligence.',
    Mark: window.MarkReceipt,
    MarkTiny: window.MarkReceiptTiny,
  },
  {
    id: 'pantry',
    label: 'Pantry',
    kicker: 'Direction B',
    title: 'Pantry',
    desc: 'Three apothecary jars on a shelf, each filled to a different level. Domestic, calm, and quietly metaphorical — the product knows what is on the shelf and how much is left.',
    Mark: window.MarkPantry,
    MarkTiny: window.MarkPantryTiny,
  },
  {
    id: 'genie',
    label: 'Genie',
    kicker: 'Direction C',
    title: 'Genie',
    desc: 'An oil lamp with a single curl of smoke that resolves into a G. Most playful, most ownable, and the only direction that earns the name. Skews more brand than product.',
    Mark: window.MarkGenie,
    MarkTiny: window.MarkGenieTiny,
  },
  {
    id: 'bag',
    label: 'Bag',
    kicker: 'Direction D',
    title: 'Bag',
    desc: 'A paper grocery bag with a folded top edge and a small leaf peeking out. Universally legible — everyone recognizes a grocery bag — at the cost of being a slightly tired metaphor.',
    Mark: window.MarkBag,
    MarkTiny: window.MarkBagTiny,
  },
  {
    id: 'sprout',
    label: 'Sprout',
    kicker: 'Direction E',
    title: 'Sprout',
    desc: 'A small sprout inside a soft circle. Leans into the freshness and waste-prevention story, less into receipts. Reads as warm and sustainable; risks looking like a meal-kit brand.',
    Mark: window.MarkSprout,
    MarkTiny: window.MarkSproutTiny,
  },
  {
    id: 'monogram',
    label: 'GG Monogram',
    kicker: 'Direction F',
    title: 'GG Monogram',
    desc: 'Two interlocking serif G\u2019s — one upright ink, one italic accent. Pure type, no object. Most editorial and most timeless; carries no product-specific meaning, so the wordmark has to do the work.',
    Mark: window.MarkMonogram,
    MarkTiny: window.MarkMonogramTiny,
  },
  {
    id: 'tag',
    label: 'Price Tag',
    kicker: 'Direction G',
    title: 'Price Tag',
    desc: 'A tied price tag with a hairline rule and a small serif G as the value. Speaks directly to the price-tracking core feature; reads as commerce-y, retail-adjacent, and quietly editorial.',
    Mark: window.MarkTag,
    MarkTiny: window.MarkTagTiny,
  },
];

function DirectionSection({ dir }) {
  const { id, label, kicker, title, desc, Mark, MarkTiny } = dir;

  return (
    <window.DCSection id={`dir-${id}`} title={`${kicker} — ${title}`}>
      {/* Large mark */}
      <window.DCArtboard id={`${id}-mark`} label="Symbol" width={360} height={360}>
        <div style={{ width: '100%', height: '100%', background: 'var(--paper-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 }}>
          <Mark size={200} />
          <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{title}</div>
        </div>
      </window.DCArtboard>

      {/* Description card */}
      <window.DCArtboard id={`${id}-desc`} label="Notes" width={400} height={360}>
        <div style={{ width: '100%', height: '100%', background: 'var(--paper)', padding: 32, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)' }}>{kicker}</div>
          <div className="serif" style={{ fontSize: 40, lineHeight: 1.05, letterSpacing: '-0.01em' }}>{title}</div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 }}>{desc}</p>
          <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>Wordmark: Instrument Serif</div>
        </div>
      </window.DCArtboard>

      {/* Horizontal lockup — light */}
      <window.DCArtboard id={`${id}-lockup-light`} label="Lockup · Light" width={560} height={200}>
        <div style={{ width: '100%', height: '100%', background: 'var(--paper-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <window.Lockup Mark={Mark} size={42} />
        </div>
      </window.DCArtboard>

      {/* Horizontal lockup — dark */}
      <window.DCArtboard id={`${id}-lockup-dark`} label="Lockup · Dark" width={560} height={200}>
        <div style={{ width: '100%', height: '100%', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <window.Lockup Mark={Mark} size={42} dark color="#F0EEE9" />
        </div>
      </window.DCArtboard>

      {/* App icons row */}
      <window.DCArtboard id={`${id}-app-icons`} label="App icon" width={760} height={220}>
        <div style={{ width: '100%', height: '100%', background: 'var(--paper-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
          <window.AppIcon Mark={Mark} bg="#F0EEE9" />
          <window.AppIcon Mark={Mark} bg="#FAF6EC" />
          <window.AppIcon Mark={Mark} bg="#15140F" color="#F0EEE9" accent="#3DB87A" />
          <window.AppIcon Mark={Mark} bg="#1F7A4A" color="#F0EEE9" accent="#F0EEE9" />
        </div>
      </window.DCArtboard>

      {/* Favicon row — actual sizes */}
      <window.DCArtboard id={`${id}-favicon`} label="Favicon · 32 / 24 / 16 px" width={400} height={220}>
        <div style={{ width: '100%', height: '100%', background: 'var(--paper-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#fff', padding: 6, borderRadius: 4, border: '0.5px solid var(--rule)' }}>
              <MarkTiny size={32} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>32 PX</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#fff', padding: 6, borderRadius: 4, border: '0.5px solid var(--rule)' }}>
              <MarkTiny size={24} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>24 PX</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#fff', padding: 6, borderRadius: 4, border: '0.5px solid var(--rule)' }}>
              <MarkTiny size={16} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>16 PX</div>
          </div>
        </div>
      </window.DCArtboard>
    </window.DCSection>
  );
}

function LogoLab() {
  return (
    <window.DesignCanvas>
      {DIRECTIONS.map(dir => <DirectionSection key={dir.id} dir={dir} />)}
    </window.DesignCanvas>
  );
}

const root = document.getElementById('canvas-root');
if (root) {
  ReactDOM.createRoot(root).render(<LogoLab />);
}
