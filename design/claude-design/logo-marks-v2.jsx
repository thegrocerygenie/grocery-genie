// Grocery Genie — Logo directions v2. All marks on a 100×100 grid, solid fills (no hairlines).
const GG = {
  ink: '#1B1A15', cream: '#F5EFE2', paper: '#FBF8F1',
  green: '#1F5E3B', tomato: '#E2553A', butter: '#F2C94C', leaf: '#5E9F5C',
  appGreen: '#1F7A4A', appLeaf: '#34D17A', appTint: '#DDEBE2',
};

function Svg({ size, children, viewBox = '0 0 100 100' }) {
  return <svg width={size} height={size} viewBox={viewBox} style={{ display: 'block', overflow: 'visible' }}>{children}</svg>;
}

// A — Leaf Drop: G whose crossbar is a leaf; the vein is a falling price line
function MarkLeafG({ size = 64, fg = GG.green, accent = GG.leaf, bg = GG.paper, tiny = false, crop = false }) {
  return (
    <Svg size={size} viewBox={crop ? '9 9 82 82' : '0 0 100 100'}>
      <path d="M74.5 29.4 A32 32 0 1 0 82 50" fill="none" stroke={fg} strokeWidth="18" />
      <path d="M91 50 C80 36 61 36 46 53 C60 65 80 64 91 50 Z" fill={accent} />
      {!tiny && <polyline points="52,47.5 60,50.5 66,48.5 76,55" fill="none" stroke={bg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />}
      {!tiny && <polyline points="71.5,55.6 76,55 75,50.8" fill="none" stroke={bg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />}
    </Svg>
  );
}

// B — Lamp Pot: a cooking pot in the silhouette of a genie lamp
function MarkLampPot({ size = 64, fg = GG.ink, accent = GG.tomato, tiny = false }) {
  return (
    <Svg size={size}>
      <path d="M20 58 H80 C80 75 67 86 50 86 C33 86 20 75 20 58 Z" fill={fg} />
      <path d="M27 53 C29 44 39 39 50 39 C61 39 71 44 73 53 Z" fill={fg} />
      <rect x="17" y="53.5" width="66" height="6" rx="3" fill={accent} />
      <circle cx="50" cy="34" r="4.5" fill={fg} />
      <path d="M22 63 C12 63 8 58 3 50 C12 52 18 55 24 58 Z" fill={fg} />
      <path d="M80 63 C92 61 94 77 79 77" fill="none" stroke={fg} strokeWidth="6" strokeLinecap="round" />
      <path d="M5 45 C1 35 10 25 19 28 C26 30 25 39 18 38" fill="none" stroke={accent} strokeWidth={tiny ? 6 : 4.5} strokeLinecap="round" />
      {!tiny && <path d="M84 12 Q85.5 20.5 94 22 Q85.5 23.5 84 32 Q82.5 23.5 74 22 Q82.5 20.5 84 12 Z" fill={accent} />}
    </Svg>
  );
}

// C — Market Sticker: the oval produce sticker. 4011 is the PLU code for bananas.
function MarkSticker({ size = 64, fg = GG.tomato, bg = GG.cream, tiny = false }) {
  return (
    <Svg size={size}>
      <g transform="rotate(-8 50 50)">
        <ellipse cx="50" cy="50" rx="47" ry="34" fill={fg} />
        <ellipse cx="50" cy="50" rx="41.5" ry="28.5" fill="none" stroke={bg} strokeWidth={tiny ? 3 : 1.4} />
        {tiny ? (
          <text x="50" y="66" textAnchor="middle" fontFamily="Gloock, serif" fontSize="44" fill={bg}>G</text>
        ) : (
          <>
            <text x="50" y="38.5" textAnchor="middle" fontFamily="'Familjen Grotesk', sans-serif" fontWeight="700" fontSize="6.4" letterSpacing="2.2" fill={bg}>GROCERY</text>
            <text x="50" y="61" textAnchor="middle" fontFamily="Gloock, serif" fontSize="23" fill={bg}>Genie</text>
            <text x="50" y="71.5" textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fontWeight="700" fontSize="5" letterSpacing="1" fill={bg}>PLU 4011</text>
          </>
        )}
      </g>
    </Svg>
  );
}

// D — Tag Apple: the stem is a tag eyelet; the tag's string ends as the leaf
function MarkTagApple({ size = 64, fg = GG.tomato, accent = GG.green, bg = GG.paper, tiny = false }) {
  return (
    <Svg size={size}>
      <path d="M50 32 C41 24 20 25 18 48 C16 70 32 90 44 88 C47 87.5 53 87.5 56 88 C68 90 84 70 82 48 C80 25 59 24 50 32 Z" fill={fg} />
      {!tiny && <circle cx="50" cy="43" r="9" fill="none" stroke={bg} strokeOpacity="0.4" strokeWidth="1.6" />}
      <circle cx="50" cy="43" r={tiny ? 7 : 5.5} fill={bg} />
      <path d="M50 43 C49 30 56 18 68 14" fill="none" stroke={accent} strokeWidth={tiny ? 5 : 3.2} strokeLinecap="round" />
      <path d="M68 14 C76 5 88 7 93 13 C86 21 75 21 68 14 Z" fill={accent} />
    </Svg>
  );
}

// E — Gigi: grocery-bag genie with a torn-receipt top edge and a sprout
function MarkGigi({ size = 64, fg = GG.butter, ink = GG.ink, accent = GG.leaf, cheek = GG.tomato, tiny = false }) {
  const zig = [22, 29, 36, 43, 50, 57, 64, 71, 78].map((x, i) => `${x},${i % 2 ? 38 : 44}`).join(' L');
  return (
    <Svg size={size}>
      {!tiny && <path d="M50 38 C50 31 50 27 50 22" stroke={accent} strokeWidth="3.2" strokeLinecap="round" fill="none" />}
      <path d={tiny ? 'M50 34 C42 22 30 22 28 28 C34 36 44 37 50 34 Z' : 'M50 27 C43 19 34 20 31 24 C37 31 45 31 50 27 Z'} fill={accent} />
      <path d={tiny ? 'M50 34 C56 20 70 18 74 24 C68 34 58 36 50 34 Z' : 'M50 23 C55 13 66 12 70 16 C64 24 56 26 50 23 Z'} fill={accent} />
      <path d={`M${zig} L80 84 Q80 90 74 90 L26 90 Q20 90 20 84 Z`} fill={fg} />
      {!tiny && <path d="M21.5 51 H78.5" stroke={ink} strokeOpacity="0.14" strokeWidth="2" />}
      <ellipse cx="40" cy="64" rx={tiny ? 4.5 : 3.2} ry={tiny ? 5.5 : 4.2} fill={ink} />
      <ellipse cx="60" cy="64" rx={tiny ? 4.5 : 3.2} ry={tiny ? 5.5 : 4.2} fill={ink} />
      {!tiny && <><circle cx="41" cy="62.6" r="1" fill="#fff" /><circle cx="61" cy="62.6" r="1" fill="#fff" /></>}
      <path d="M43 73 Q50 80 57 73" stroke={ink} strokeWidth={tiny ? 4.5 : 3} strokeLinecap="round" fill="none" />
      {!tiny && <><circle cx="33" cy="72" r="3.6" fill={cheek} opacity="0.45" /><circle cx="67" cy="72" r="3.6" fill={cheek} opacity="0.45" /></>}
      {!tiny && <path d="M84 20 Q85 26 91 27 Q85 28 84 34 Q83 28 77 27 Q83 26 84 20 Z" fill={cheek} />}
    </Svg>
  );
}

function AppIcon2({ children, bg, size = 112, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ width: size, height: size, borderRadius: size * 0.225, background: bg, display: 'grid', placeItems: 'center', boxShadow: '0 0 0 0.5px rgba(27,26,21,0.12), 0 12px 28px -10px rgba(27,26,21,0.35)', overflow: 'hidden' }}>{children}</div>
      {label && <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6E695D' }}>{label}</div>}
    </div>
  );
}

Object.assign(window, { GG, MarkLeafG, MarkLampPot, MarkSticker, MarkTagApple, MarkGigi, AppIcon2 });
