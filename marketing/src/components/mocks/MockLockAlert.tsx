import type { CSSProperties } from 'react';
import Mock from './Mock';

const card: CSSProperties = {
  background: 'rgba(245,245,247,0.86)', color: '#111', borderRadius: 16, padding: '10px 12px',
  display: 'grid', gridTemplateColumns: '26px 1fr', gap: '2px 10px', fontFamily: 'var(--font-sf)',
};

function AppIcon() {
  return (
    <div style={{ gridRow: 'span 2', width: 26, height: 26, borderRadius: 7, background: '#F8F6F1', display: 'grid', placeItems: 'center' }}>
      <svg width="18" height="18" viewBox="9 9 82 82" aria-hidden="true">
        <path d="M74.5 29.4 A32 32 0 1 0 82 50" fill="none" stroke="#1F7A4A" strokeWidth="18" />
        <path d="M91 50 C80 36 61 36 46 53 C60 65 80 64 91 50 Z" fill="#34D17A" />
      </svg>
    </div>
  );
}

function Notification({ title, time, body, style }: { title: string; time: string; body: string; style?: CSSProperties }) {
  return (
    <div style={{ ...card, ...style }}>
      <AppIcon />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555' }}>
        <span style={{ fontWeight: 600, color: '#111' }}>{title}</span><span>{time}</span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.35 }}>{body}</div>
    </div>
  );
}

export default function MockLockAlert() {
  return (
    <Mock label="Alerts before you overspend">
      <div style={{ position: 'absolute', inset: 0, background: '#1E3A2C', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '46px 12px 0', fontFamily: 'var(--font-sf)' }}>
        <div style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', width: 78, height: 22, background: '#000', borderRadius: 999 }} />
        <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.9 }}>Sunday, November 22</div>
        <div style={{ fontFamily: 'var(--font-sf-rounded)', fontSize: 72, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em', marginTop: 2 }}>9:41</div>
        <div style={{ marginTop: 'auto', marginBottom: 90, width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Notification title="Grocery Genie" time="now" body="Budget 80% reached. $42 remaining with 9 days left in this period." />
          <Notification title="Weekly summary" time="9:00 AM" body="$96 on groceries this week, $12 less than last week." style={{ opacity: 0.85, transform: 'scale(.96)' }} />
        </div>
      </div>
    </Mock>
  );
}
