// Logo marks for Grocery Genie
// All marks built to read at 16px (favicon). Hairlines = 1.5 at 24, 2 at 48+.

const Ink = '#15140F';
const Accent = '#1F7A4A';
const Paper = '#F0EEE9';

// ============================================================
// DIRECTION A — RECEIPT
// Folded thermal-paper receipt with torn bottom edge,
// a fold line and a tiny barcode where line items would sit.
// ============================================================

function MarkReceipt({ size = 64, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Receipt body — slight fold/skew on top */}
      <path
        d="M14 8 L46 6 L48 50 L44 48 L40 52 L36 48 L32 52 L28 48 L24 52 L20 48 L16 52 L12 48 Z"
        fill={Paper}
        stroke={color}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Fold line */}
      <path d="M16 18 L46 16" stroke={color} strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" />
      {/* Barcode (the "items") */}
      <g stroke={accent} strokeWidth="1.6" strokeLinecap="round">
        <line x1="20" y1="26" x2="20" y2="38" />
        <line x1="23.5" y1="26" x2="23.5" y2="38" />
        <line x1="27" y1="26" x2="27" y2="38" />
        <line x1="32" y1="26" x2="32" y2="38" />
        <line x1="35.5" y1="26" x2="35.5" y2="38" />
        <line x1="40" y1="26" x2="40" y2="38" />
      </g>
    </svg>
  );
}

// 16px-optimized variant — simplified to read clean at favicon size
function MarkReceiptTiny({ size = 16, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 2 L12 1.5 L12.5 13 L11 12 L9.5 13.5 L8 12 L6.5 13.5 L5 12 L3 13 Z"
        fill={Paper}
        stroke={color}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <g stroke={accent} strokeWidth="0.8" strokeLinecap="round">
        <line x1="5" y1="6" x2="5" y2="9.5" />
        <line x1="6.5" y1="6" x2="6.5" y2="9.5" />
        <line x1="8" y1="6" x2="8" y2="9.5" />
        <line x1="10" y1="6" x2="10" y2="9.5" />
      </g>
    </svg>
  );
}

// ============================================================
// DIRECTION B — PANTRY
// Three apothecary jars on a shelf rule, decreasing scale.
// ============================================================

function MarkPantry({ size = 64, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      {/* Shelf */}
      <line x1="6" y1="50" x2="58" y2="50" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Jar 1 — tall */}
      <g>
        <rect x="10" y="12" width="14" height="4" rx="0.5" stroke={color} strokeWidth="2" fill={Paper} />
        <path d="M12 16 L12 50 L22 50 L22 16" stroke={color} strokeWidth="2" fill={Paper} strokeLinejoin="round" />
        {/* fill level */}
        <rect x="13.5" y="34" width="7" height="14.5" fill={accent} opacity="0.85" />
      </g>
      {/* Jar 2 — medium */}
      <g>
        <rect x="27" y="22" width="12" height="3.5" rx="0.5" stroke={color} strokeWidth="2" fill={Paper} />
        <path d="M28.5 25.5 L28.5 50 L37.5 50 L37.5 25.5" stroke={color} strokeWidth="2" fill={Paper} strokeLinejoin="round" />
        <rect x="30" y="38" width="6" height="10.5" fill={accent} opacity="0.85" />
      </g>
      {/* Jar 3 — short */}
      <g>
        <rect x="42" y="32" width="11" height="3.5" rx="0.5" stroke={color} strokeWidth="2" fill={Paper} />
        <path d="M43.5 35.5 L43.5 50 L51.5 50 L51.5 35.5" stroke={color} strokeWidth="2" fill={Paper} strokeLinejoin="round" />
        <rect x="45" y="42" width="5" height="6.5" fill={accent} opacity="0.85" />
      </g>
    </svg>
  );
}

function MarkPantryTiny({ size = 16, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none">
      <line x1="1.5" y1="13" x2="14.5" y2="13" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <rect x="2.5" y="3" width="3.5" height="10" stroke={color} strokeWidth="1" fill={Paper} />
      <rect x="3" y="8" width="2.5" height="5" fill={accent} />
      <rect x="6.5" y="6" width="3" height="7" stroke={color} strokeWidth="1" fill={Paper} />
      <rect x="7" y="9.5" width="2" height="3.5" fill={accent} />
      <rect x="10" y="8.5" width="3.5" height="4.5" stroke={color} strokeWidth="1" fill={Paper} />
      <rect x="10.5" y="11" width="2.5" height="2" fill={accent} />
    </svg>
  );
}

// ============================================================
// DIRECTION C — GENIE
// Oil lamp with curl of smoke rising, with a wisp suggesting "G".
// ============================================================

function MarkGenie({ size = 64, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      {/* Lamp base — classic oil-lamp silhouette */}
      <path
        d="M16 46 Q14 40 22 38 L42 38 Q50 38 50 44 L52 44 Q54 44 54 46 L54 48 Q54 50 52 50 L14 50 Q12 50 12 48 L12 46 Q12 44 14 44 Z"
        fill={color}
      />
      {/* Spout */}
      <path d="M50 42 L58 40 L56 44 Z" fill={color} />
      {/* Lamp top knob */}
      <circle cx="32" cy="36" r="2" fill={color} />
      {/* Smoke curl — rising into a 'G' shape */}
      <path
        d="M32 32 Q26 26 30 20 Q36 14 42 18 Q46 22 42 26 L38 26"
        stroke={accent}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function MarkGenieTiny({ size = 16, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none">
      <path
        d="M3 12 Q2.5 10.5 5 10 L11 10 Q13 10 13 11.5 L13.5 11.5 Q14 11.5 14 12 L14 12.5 Q14 13 13.5 13 L2.5 13 Q2 13 2 12.5 L2 12 Q2 11.5 2.5 11.5 Z"
        fill={color}
      />
      <path d="M13 11 L15 10.5 L14.5 12 Z" fill={color} />
      <path
        d="M8 9 Q6 7 7.5 5 Q9.5 3.5 11 5 Q12 6.5 10.5 7.5 L9.5 7.5"
        stroke={accent}
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

// ============================================================
// LOCKUPS
// ============================================================

function Lockup({ Mark, size = 36, color = Ink, accent = Accent, dark = false }) {
  const wordColor = dark ? Paper : color;
  const emColor = dark ? 'rgba(240,238,233,0.6)' : '#5A554A';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.4 }}>
      <Mark size={size * 1.4} color={color} accent={accent} />
      <span
        className="serif"
        style={{
          fontSize: size,
          lineHeight: 1,
          letterSpacing: '-0.01em',
          color: wordColor,
        }}
      >
        Grocery <em style={{ fontStyle: 'italic', color: emColor }}>Genie</em>
      </span>
    </span>
  );
}

// ============================================================
// APP ICON — rounded-square tile
// ============================================================

function AppIcon({ Mark, bg = Paper, color = Ink, accent = Accent, size = 120, radius = 26 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset, 0 12px 32px -8px rgba(21,20,15,0.25)',
        border: '0.5px solid rgba(21,20,15,0.06)',
      }}
    >
      <Mark size={size * 0.55} color={color} accent={accent} />
    </div>
  );
}

// ============================================================
// DIRECTION D — BAG
// Paper grocery bag with folded top edge, handle suggested by a notch.
// ============================================================

function MarkBag({ size = 64, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      {/* Folded top flap */}
      <path d="M14 14 L50 14 L48 20 L16 20 Z" fill={color} opacity="0.9" />
      {/* Bag body */}
      <path
        d="M16 20 L48 20 L50 54 L14 54 Z"
        fill={Paper}
        stroke={color}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Handle cutout */}
      <path d="M26 14 Q26 8 32 8 Q38 8 38 14" stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      {/* Accent — celery/leaf peeking out */}
      <path d="M30 20 Q30 26 34 28 Q38 26 38 20" stroke={accent} strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function MarkBagTiny({ size = 16, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none">
      <path d="M3.5 4 L12.5 4 L12 5.5 L4 5.5 Z" fill={color} />
      <path d="M4 5.5 L12 5.5 L12.5 14 L3.5 14 Z" fill={Paper} stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M6.5 4 Q6.5 2 8 2 Q9.5 2 9.5 4" stroke={color} strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <path d="M7.5 5.5 Q7.5 7 8.5 7.5 Q9.5 7 9.5 5.5" stroke={accent} strokeWidth="1" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ============================================================
// DIRECTION E — SPROUT
// A small sprout in a circle — fresh produce, waste prevention angle.
// ============================================================

function MarkSprout({ size = 64, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      {/* Circle frame */}
      <circle cx="32" cy="32" r="26" stroke={color} strokeWidth="2.2" fill={Paper} />
      {/* Soil line */}
      <line x1="14" y1="44" x2="50" y2="44" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      {/* Stem */}
      <path d="M32 44 L32 26" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      {/* Left leaf */}
      <path d="M32 32 Q22 30 22 22 Q30 22 32 30" fill={accent} />
      {/* Right leaf */}
      <path d="M32 28 Q42 26 44 18 Q34 18 32 26" fill={accent} opacity="0.85" />
    </svg>
  );
}

function MarkSproutTiny({ size = 16, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.1" fill={Paper} />
      <line x1="8" y1="11.5" x2="8" y2="6.5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      <path d="M8 8 Q5.5 7.5 5.5 5 Q7.5 5 8 7" fill={accent} />
      <path d="M8 7 Q10.5 6.5 10.5 4 Q8.5 4 8 6" fill={accent} opacity="0.85" />
    </svg>
  );
}

// ============================================================
// DIRECTION F — GG MONOGRAM
// Interlocking serif G's. Pure type, no object.
// ============================================================

function MarkMonogram({ size = 64, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      {/* Back G — accent */}
      <text x="6" y="50" fontFamily="Instrument Serif, Georgia, serif" fontSize="56" fill={accent} fontStyle="italic">G</text>
      {/* Front G — ink, slightly offset */}
      <text x="22" y="50" fontFamily="Instrument Serif, Georgia, serif" fontSize="56" fill={color}>G</text>
    </svg>
  );
}

function MarkMonogramTiny({ size = 16, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none">
      <text x="0.5" y="13.5" fontFamily="Instrument Serif, Georgia, serif" fontSize="14" fill={accent} fontStyle="italic">G</text>
      <text x="5.5" y="13.5" fontFamily="Instrument Serif, Georgia, serif" fontSize="14" fill={color}>G</text>
    </svg>
  );
}

// ============================================================
// DIRECTION G — TAG
// Price tag with string hole, a hairline rule, and a tiny serif G.
// ============================================================

function MarkTag({ size = 64, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      {/* Tag body — angled rectangle with notched corner */}
      <path
        d="M22 10 L52 10 L52 50 L22 50 L8 32 Z"
        fill={Paper}
        stroke={color}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* String hole */}
      <circle cx="18" cy="32" r="2.5" fill={color} />
      {/* Hairline rule */}
      <line x1="28" y1="26" x2="46" y2="26" stroke={color} strokeWidth="1" opacity="0.4" />
      {/* Serif G as the tag content */}
      <text x="29" y="44" fontFamily="Instrument Serif, Georgia, serif" fontSize="22" fill={accent}>G</text>
    </svg>
  );
}

function MarkTagTiny({ size = 16, color = Ink, accent = Accent }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none">
      <path d="M5.5 2.5 L13 2.5 L13 13 L5.5 13 L2 8 Z" fill={Paper} stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx="4.5" cy="8" r="0.8" fill={color} />
      <text x="6.5" y="12" fontFamily="Instrument Serif, Georgia, serif" fontSize="7" fill={accent}>G</text>
    </svg>
  );
}

Object.assign(window, {
  MarkReceipt, MarkReceiptTiny,
  MarkPantry, MarkPantryTiny,
  MarkGenie, MarkGenieTiny,
  MarkBag, MarkBagTiny,
  MarkSprout, MarkSproutTiny,
  MarkMonogram, MarkMonogramTiny,
  MarkTag, MarkTagTiny,
  Lockup, AppIcon,
  Ink, Accent, Paper,
});
