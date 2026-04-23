// ui.jsx — Shared UI primitives for the prototype.
// Avatar, Chip, Badge, SectionTitle, Divider, Button, PlaceholderImage, etc.

// Avatar — geometric initial-based, NOT cartoon illustrations.
function Avatar({ initial = '人', tone = 'rose', size = 56, ring = false }) {
  const theme = useTheme();
  const tones = {
    rose:   ['#F5D5CE', '#A8453A'],
    sage:   ['#D8E2D9', '#3A5043'],
    ocean:  ['#D6E0EA', '#3A5566'],
    indigo: ['#DCD9EB', '#464275'],
    plum:   ['#E8D5E0', '#6B3A52'],
    amber:  ['#F0DEC0', '#7A5020'],
    ink:    ['#DDD7D0', '#2A2420'],
  };
  const [bg, fg] = tones[tone] || tones.rose;
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: bg, color: fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: theme.displayFont, fontSize: size * 0.42, fontWeight: 500,
      flexShrink: 0,
      boxShadow: ring ? `0 0 0 2px ${theme.surface}, 0 0 0 3px ${theme.accent}` : 'none',
      letterSpacing: 0,
    }}>{initial}</div>
  );
}

function Chip({ children, variant = 'default', size = 'md' }) {
  const theme = useTheme();
  const palette = {
    default: { bg: theme.chip, fg: theme.chipInk },
    accent:  { bg: theme.accentSoft, fg: theme.accentDeep },
    ghost:   { bg: 'transparent', fg: theme.inkMuted, border: `1px solid ${theme.line}` },
    dark:    { bg: theme.ink, fg: theme.bg },
  }[variant];
  const dims = size === 'sm'
    ? { padding: '3px 8px', fontSize: 11 }
    : { padding: '5px 10px', fontSize: 12 };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      borderRadius: theme.radiusSm,
      background: palette.bg, color: palette.fg,
      border: palette.border || 'none',
      fontFamily: theme.bodyFont, fontWeight: 500,
      ...dims,
    }}>{children}</span>
  );
}

function Divider({ label, align = 'center' }) {
  const theme = useTheme();
  if (!label) return <div style={{ height: 1, background: theme.line, margin: '8px 0' }} />;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0',
      color: theme.inkFaint, fontSize: 11, fontFamily: theme.bodyFont,
      letterSpacing: 2,
    }}>
      {align !== 'left' && <div style={{ flex: 1, height: 1, background: theme.line }} />}
      <span>{label}</span>
      <div style={{ flex: 1, height: 1, background: theme.line }} />
    </div>
  );
}

function SectionTitle({ children, subtitle, icon }) {
  const theme = useTheme();
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        {icon && <span style={{ color: theme.accent, fontSize: 8 }}>●</span>}
        <h3 style={{
          margin: 0, fontFamily: theme.displayFont, fontSize: 17, fontWeight: 600,
          color: theme.ink, letterSpacing: 0.5,
        }}>{children}</h3>
        {subtitle && <span style={{
          fontSize: 11, color: theme.inkFaint, fontFamily: theme.bodyFont,
        }}>{subtitle}</span>}
      </div>
    </div>
  );
}

function Button({ children, variant = 'primary', size = 'md', onClick, icon, full = false, style = {} }) {
  const theme = useTheme();
  const variants = {
    primary: { bg: theme.accent, fg: theme.accentInk, border: 'none' },
    secondary: { bg: 'transparent', fg: theme.accent, border: `1px solid ${theme.accent}` },
    ghost: { bg: 'transparent', fg: theme.ink, border: `1px solid ${theme.line}` },
    dark: { bg: theme.ink, fg: theme.bg, border: 'none' },
    soft: { bg: theme.accentSoft, fg: theme.accentDeep, border: 'none' },
  }[variant];
  const dims = {
    sm: { padding: '8px 14px', fontSize: 13, radius: theme.radiusSm + 2 },
    md: { padding: '11px 20px', fontSize: 14, radius: theme.radius - 2 },
    lg: { padding: '15px 24px', fontSize: 15, radius: theme.radius },
  }[size];
  return (
    <button onClick={onClick} style={{
      width: full ? '100%' : undefined,
      background: variants.bg, color: variants.fg, border: variants.border,
      borderRadius: dims.radius, padding: dims.padding, fontSize: dims.fontSize,
      fontFamily: theme.bodyFont, fontWeight: 500, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      transition: 'transform 0.1s, opacity 0.15s', letterSpacing: 0.3,
      ...style,
    }}
    onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
    onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      {icon}
      {children}
    </button>
  );
}

function PlaceholderImage({ width = '100%', height = 120, label = 'image', tone }) {
  const theme = useTheme();
  const stripe = tone === 'accent' ? theme.accentSoft : theme.surfaceAlt;
  return (
    <div style={{
      width, height, borderRadius: theme.radiusSm,
      background: `repeating-linear-gradient(135deg, ${stripe} 0 8px, transparent 8px 16px), ${theme.surfaceAlt}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: theme.monoFont, fontSize: 10, color: theme.inkFaint,
      letterSpacing: 1, textTransform: 'uppercase',
    }}>{label}</div>
  );
}

// Decorative brand mark — 乾缘 logotype (no cartoon SVG, just typographic)
function BrandMark({ size = 28, inline = false }) {
  const theme = useTheme();
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: size, height: size, borderRadius: size / 2,
        background: theme.accent, color: theme.accentInk,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: theme.displayFont, fontSize: size * 0.55, fontWeight: 500,
      }}>缘</div>
      {!inline && (
        <span style={{
          fontFamily: theme.displayFont, fontSize: size * 0.6, fontWeight: 600,
          color: theme.ink, letterSpacing: 2,
        }}>乾缘</span>
      )}
    </div>
  );
}

// Icons — simple line SVGs, 20x20 viewbox, inherit currentColor
const Icon = {
  Heart: ({ filled, size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M10 17s-7-4.5-7-9.5A3.5 3.5 0 0110 5a3.5 3.5 0 017 2.5c0 5-7 9.5-7 9.5z" />
    </svg>
  ),
  Fire: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M10 2c1 3 3 4 3 7a3 3 0 01-6 0c0-1.5.5-2.5.5-2.5S8 8.5 8 10c-1-1-1.5-2.5-1.5-4C6.5 4 7.5 2.5 10 2z"/>
    </svg>
  ),
  Star: ({ filled, size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M10 2.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4L10 14.9l-4.8 2.5.9-5.4L2.2 8.2l5.4-.8L10 2.5z"/>
    </svg>
  ),
  Message: ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5a2 2 0 012-2h10a2 2 0 012 2v7a2 2 0 01-2 2H8l-4 3v-3H5a2 2 0 01-2-2V5z"/>
    </svg>
  ),
  Chevron: ({ dir = 'right', size = 14 }) => {
    const paths = { right: 'M7 4l5 5-5 5', left: 'M12 4l-5 5 5 5', down: 'M4 7l5 5 5-5', up: 'M4 12l5-5 5 5' };
    return (
      <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[dir]}/>
      </svg>
    );
  },
  Filter: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 5h14M6 10h8M9 15h2"/>
    </svg>
  ),
  Search: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/>
    </svg>
  ),
  Home: ({ size = 18, filled }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M3 9l7-6 7 6v8a1 1 0 01-1 1h-4v-5H8v5H4a1 1 0 01-1-1V9z"/>
    </svg>
  ),
  Doc: ({ size = 18, filled }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M5 2h7l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z"/>
      <path d="M12 2v4h4" fill="none"/>
    </svg>
  ),
  Chat: ({ size = 18, filled }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M3 5a2 2 0 012-2h10a2 2 0 012 2v7a2 2 0 01-2 2H8l-4 3v-3H5a2 2 0 01-2-2V5z"/>
    </svg>
  ),
  User: ({ size = 18, filled }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="7" r="3.5"/><path d="M3 17c1.5-3.5 4-5 7-5s5.5 1.5 7 5" strokeLinecap="round"/>
    </svg>
  ),
  Book: ({ size = 18, filled }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M4 3h5a3 3 0 013 3v11a2 2 0 00-2-2H4V3zM16 3h-5a3 3 0 00-3 3v11a2 2 0 012-2h6V3z"/>
    </svg>
  ),
  Pin: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M8 2a4 4 0 014 4c0 3-4 8-4 8s-4-5-4-8a4 4 0 014-4z"/><circle cx="8" cy="6" r="1.3" fill="currentColor"/>
    </svg>
  ),
  Calendar: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M5 2v3M11 2v3M2.5 7h11"/>
    </svg>
  ),
  Check: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6.5L5 9.5l5-6"/>
    </svg>
  ),
  X: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8"/>
    </svg>
  ),
  Share: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <circle cx="4" cy="8" r="1.5"/><circle cx="12" cy="4" r="1.5"/><circle cx="12" cy="12" r="1.5"/>
      <path d="M5.3 7.3l5.4-2.6M5.3 8.7l5.4 2.6"/>
    </svg>
  ),
  Lock: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <rect x="3.5" y="7" width="9" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>
    </svg>
  ),
};

Object.assign(window, { Avatar, Chip, Divider, SectionTitle, Button, PlaceholderImage, BrandMark, Icon });
