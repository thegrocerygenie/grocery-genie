const C = window.GG;

const DIRS = [
  {
    id: 'leaf', kicker: 'Direction A · Selected', title: 'Leaf Drop', font: "'Bricolage Grotesque', sans-serif",
    desc: "A heavy G whose crossbar grows into a leaf. The leaf's vein is a falling price line. Fresh food and smarter prices in one shape.",
    hidden: 'The vein is a price chart trending down.',
    risk: 'The chart detail drops out below 32px; the G and leaf still hold. Colors: app green #1F7A4A + the app\'s dark-mode green #34D17A only.',
    Mark: window.MarkLeafG,
    lockup: { size: 44, gap: 12, nudge: 3, crop: true },
    word: (dark) => <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 40, letterSpacing: '-0.04em', color: dark ? C.cream : C.ink }}>grocery<span style={{ color: dark ? C.appLeaf : C.appGreen }}>genie</span></span>,
    light: { fg: C.appGreen, accent: C.appLeaf, bg: C.paper }, dark: { fg: C.cream, accent: C.appLeaf, bg: C.ink },
    tiles: [
      { label: 'Green', bg: C.appGreen, p: { fg: C.cream, accent: C.appLeaf, bg: C.appGreen } },
      { label: 'Paper', bg: C.paper, p: { fg: C.appGreen, accent: C.appLeaf, bg: C.paper } },
      { label: 'Ink', bg: C.ink, p: { fg: C.cream, accent: C.appLeaf, bg: C.ink } },
      { label: 'Tint', bg: C.appTint, p: { fg: C.appGreen, accent: C.appLeaf, bg: C.appTint } },
    ],
  },
  {
    id: 'pot', kicker: 'Direction B', title: 'Lamp Pot', font: "'Young Serif', serif",
    desc: "A cooking pot drawn in the silhouette of a genie lamp: spout, handle, lid and a curl of steam. A warm home kitchen with the name's magic hidden in plain sight.",
    hidden: 'Pot or lamp? Both. The steam curls like a wish.',
    risk: 'The most detailed mark; relies on the simplified version at 16px.',
    Mark: window.MarkLampPot,
    word: (dark) => <span style={{ fontFamily: "'Young Serif'", fontSize: 38, letterSpacing: '-0.01em', color: dark ? C.cream : C.ink }}>Grocery <span style={{ color: dark ? C.butter : C.tomato }}>Genie</span></span>,
    light: { fg: C.ink, accent: C.tomato }, dark: { fg: C.cream, accent: C.butter },
    tiles: [
      { label: 'Green', bg: C.green, p: { fg: C.cream, accent: C.butter } },
      { label: 'Paper', bg: C.paper, p: { fg: C.ink, accent: C.tomato } },
      { label: 'Ink', bg: C.ink, p: { fg: C.cream, accent: C.tomato } },
      { label: 'Tomato', bg: C.tomato, p: { fg: C.cream, accent: C.butter } },
    ],
  },
  {
    id: 'sticker', kicker: 'Direction C', title: 'Market Sticker', font: 'Gloock, serif',
    desc: 'The oval produce sticker everyone peels off a banana, carrying the wordmark. The most nostalgic direction, and it extends naturally to packaging, merch and in-app badges.',
    hidden: '4011 is the real PLU code for bananas.',
    risk: 'Leans on type; small sizes switch to a single G.',
    Mark: window.MarkSticker,
    word: (dark) => <span style={{ fontFamily: 'Gloock', fontSize: 40, letterSpacing: '-0.01em', color: dark ? C.cream : C.ink }}>Grocery Genie</span>,
    light: { fg: C.tomato, bg: C.cream }, dark: { fg: C.butter, bg: C.ink },
    tiles: [
      { label: 'Green', bg: C.green, p: { fg: C.butter, bg: C.green } },
      { label: 'Paper', bg: C.paper, p: { fg: C.tomato, bg: C.cream } },
      { label: 'Ink', bg: C.ink, p: { fg: C.tomato, bg: C.cream } },
      { label: 'Butter', bg: C.butter, p: { fg: C.green, bg: C.cream } },
    ],
  },
  {
    id: 'apple', kicker: 'Direction D', title: 'Tag Apple', font: "'Familjen Grotesk', sans-serif",
    desc: "An apple that is also a price tag: the stem is the tag's eyelet and the string ends as the leaf. Reads instantly as fresh food plus price.",
    hidden: 'The leaf is the end of the tag string.',
    risk: 'Apple marks are a crowded space; the eyelet is what makes this one ours.',
    Mark: window.MarkTagApple,
    word: (dark) => <span style={{ fontFamily: "'Familjen Grotesk'", fontWeight: 700, fontSize: 38, letterSpacing: '-0.03em', color: dark ? C.cream : C.ink }}>Grocery Genie</span>,
    light: { fg: C.tomato, accent: C.green, bg: C.paper }, dark: { fg: C.tomato, accent: C.leaf, bg: C.ink },
    tiles: [
      { label: 'Green', bg: C.green, p: { fg: C.cream, accent: C.butter, bg: C.green } },
      { label: 'Paper', bg: C.paper, p: { fg: C.tomato, accent: C.green, bg: C.paper } },
      { label: 'Ink', bg: C.ink, p: { fg: C.tomato, accent: C.leaf, bg: C.ink } },
      { label: 'Tomato', bg: C.tomato, p: { fg: C.cream, accent: C.green, bg: C.tomato } },
    ],
  },
  {
    id: 'gigi', kicker: 'Direction E', title: 'Gigi (mascot)', font: 'Fredoka, sans-serif',
    desc: 'A grocery-bag genie with a sprout on top. A friendly character for onboarding, empty states and notifications, paired with a rounded wordmark.',
    hidden: "The bag's top edge is a torn receipt.",
    risk: 'Playful pulls away from premium; strongest alongside a quieter primary mark.',
    Mark: window.MarkGigi,
    word: (dark) => <span style={{ fontFamily: 'Fredoka', fontWeight: 600, fontSize: 40, letterSpacing: '-0.02em', color: dark ? C.cream : C.green }}>grocery genie</span>,
    light: { fg: C.butter, ink: C.ink, accent: C.leaf }, dark: { fg: C.butter, ink: C.ink, accent: C.leaf },
    tiles: [
      { label: 'Green', bg: C.green, p: { fg: C.butter, accent: C.leaf } },
      { label: 'Paper', bg: C.paper, p: { fg: C.butter, accent: C.green } },
      { label: 'Ink', bg: C.ink, p: { fg: C.butter, accent: C.leaf } },
      { label: 'Tomato', bg: C.tomato, p: { fg: C.butter, accent: C.green, cheek: C.cream } },
    ],
  },
];

const lab = {
  board: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cap: { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6E695D' },
};

function Direction({ d }) {
  const { Mark } = d;
  const lk = d.lockup || { size: 64, gap: 16, nudge: 0, crop: false };
  return (
    <DCSection id={`v2-${d.id}`} title={`${d.kicker} — ${d.title}`}>
      <DCArtboard id="symbol" label="Symbol" width={360} height={360}>
        <div style={{ ...lab.board, background: C.paper }}><Mark size={220} {...d.light} /></div>
      </DCArtboard>
      <DCArtboard id="notes" label="Notes" width={400} height={360}>
        <div style={{ width: '100%', height: '100%', background: '#F2EEE4', padding: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...lab.cap, color: C.green, fontWeight: 600 }}>{d.kicker}</div>
          <div style={{ fontFamily: d.font, fontSize: 36, lineHeight: 1.05, color: C.ink }}>{d.title}</div>
          <p style={{ fontSize: 15, lineHeight: 1.5, color: '#4F4B41', margin: 0 }}>{d.desc}</p>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: C.ink, margin: 0 }}><strong>Hidden detail:</strong> {d.hidden}</p>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#4F4B41', margin: 0 }}><strong style={{ color: C.ink }}>Risk:</strong> {d.risk}</p>
          <div style={{ ...lab.cap, marginTop: 'auto' }}>Wordmark: {d.font.split(',')[0].replace(/'/g, '')}</div>
        </div>
      </DCArtboard>
      <DCArtboard id="lockup-light" label="Lockup · Light" width={600} height={200}>
        <div style={{ ...lab.board, background: C.paper, gap: lk.gap }}><div style={{ position: 'relative', top: lk.nudge }}><Mark size={lk.size} crop={lk.crop} {...d.light} /></div>{d.word(false)}</div>
      </DCArtboard>
      <DCArtboard id="lockup-dark" label="Lockup · Dark" width={600} height={200}>
        <div style={{ ...lab.board, background: C.ink, gap: lk.gap }}><div style={{ position: 'relative', top: lk.nudge }}><Mark size={lk.size} crop={lk.crop} {...d.dark} /></div>{d.word(true)}</div>
      </DCArtboard>
      <DCArtboard id="icons" label="App icon · 4 tiles" width={680} height={240}>
        <div style={{ ...lab.board, background: '#F2EEE4', gap: 36 }}>
          {d.tiles.map((t) => <AppIcon2 key={t.label} bg={t.bg} label={t.label}><Mark size={76} {...t.p} /></AppIcon2>)}
        </div>
      </DCArtboard>
      <DCArtboard id="small" label="Small sizes · 48 / 32 / 16" width={420} height={240}>
        <div style={{ ...lab.board, background: C.paper, gap: 32, flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28 }}>
            {[48, 32, 16].map((s) => (
              <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Mark size={s} {...d.light} tiny={s < 32} />
                <span style={lab.cap}>{s}px</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#fff', borderRadius: '8px 8px 0 0', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.12)', fontSize: 12, color: C.ink, fontFamily: 'system-ui' }}>
            <Mark size={16} {...d.light} tiny /> Grocery Genie — Early access
          </div>
        </div>
      </DCArtboard>
    </DCSection>
  );
}

function Swatch({ c, n }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ width: 92, height: 92, borderRadius: 8, background: c, boxShadow: '0 0 0 0.5px rgba(0,0,0,0.12)' }} />
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{n}</div>
      <div style={{ fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', color: '#6E695D' }}>{c}</div>
    </div>
  );
}

function Intro() {
  return (
    <DCSection id="v2-intro" title="Logo Lab v2 — Market palette">
      <DCArtboard id="palette" label="Palette" width={760} height={360}>
        <div style={{ width: '100%', height: '100%', background: C.paper, padding: 36, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div>
            <div style={{ fontFamily: 'Gloock', fontSize: 40, color: C.ink, lineHeight: 1 }}>Market palette</div>
            <p style={{ fontSize: 15, color: '#4F4B41', margin: '10px 0 0', maxWidth: 560, lineHeight: 1.5 }}>A deeper market green with tomato and butter, inspired by old grocery-store signage. The app's #1F7A4A can stay the in-app CTA color.</p>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <Swatch c={C.green} n="Market green" /><Swatch c={C.leaf} n="Leaf" /><Swatch c={C.tomato} n="Tomato" /><Swatch c={C.butter} n="Butter" /><Swatch c={C.cream} n="Cream" /><Swatch c={C.ink} n="Ink" />
          </div>
        </div>
      </DCArtboard>
      <DCArtboard id="refs" label="From your references" width={520} height={360}>
        <div style={{ width: '100%', height: '100%', background: '#F2EEE4', padding: 36, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 15, lineHeight: 1.5, color: '#4F4B41' }}>
          <div style={{ ...lab.cap, color: C.green, fontWeight: 600 }}>What I kept</div>
          <div>Objects hidden inside a simpler shape, bold solid fills, a strong green with warm produce colors.</div>
          <div style={{ ...lab.cap, color: C.tomato, fontWeight: 600, marginTop: 8 }}>What I left out</div>
          <div>Multi-color fruit piles, gradients and thin outlines. They blur at app-icon size and read as stock.</div>
        </div>
      </DCArtboard>
      <DCArtboard id="compare" label="All five · home screen size" width={680} height={360}>
        <div style={{ width: '100%', height: '100%', background: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 34 }}>
          {DIRS.map((d) => {
            const t = d.tiles[1];
            return (
              <div key={d.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <AppIcon2 bg={t.bg} size={76}><d.Mark size={52} {...t.p} /></AppIcon2>
                <span style={{ fontSize: 12, color: C.cream, fontFamily: 'system-ui' }}>{d.title.split(' (')[0]}</span>
              </div>
            );
          })}
        </div>
      </DCArtboard>
    </DCSection>
  );
}

function LabV2() {
  return (
    <DesignCanvas>
      {Intro()}
      {DIRS.map((d) => React.cloneElement(Direction({ d }), { key: d.id }))}
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('canvas-root')).render(<LabV2 />);
