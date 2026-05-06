// MiniProgram chrome — WeChat mini-program status bar + capsule button + nav bar
// Matches the visual language users expect from a 小程序

const mp_chromeStyles = {
  statusBar: {
    height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', fontSize: 15, fontWeight: 600,
    color: 'var(--ink)', background: 'transparent',
    position: 'relative', zIndex: 20,
    fontFamily: '-apple-system, system-ui, sans-serif',
  },
  statusBarDark: { color: '#fff' },
  capsule: {
    display: 'flex', alignItems: 'center', gap: 1,
    background: 'rgba(255,255,255,0.6)', borderRadius: 100,
    padding: '6px 4px', border: '0.5px solid rgba(0,0,0,0.08)',
    backdropFilter: 'blur(8px)',
  },
  capsuleDark: {
    background: 'rgba(0,0,0,0.25)', border: '0.5px solid rgba(255,255,255,0.2)',
  }
};

function MPStatusBar({ dark = false }) {
  return (
    <div style={{ ...mp_chromeStyles.statusBar, ...(dark ? mp_chromeStyles.statusBarDark : {}) }}>
      <span>13:18</span>
      <div style={{ position: 'absolute', left: '50%', top: 10, transform: 'translateX(-50%)',
        width: 22, height: 22, borderRadius: '50%', background: '#1a1a1a' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 500 }}>
        <span style={{ fontSize: 10, fontWeight: 700 }}>HD</span>
        {/* signal */}
        <svg width="16" height="11" viewBox="0 0 16 11"><path d="M1,9 h2 v2 h-2 z M5,6 h2 v5 h-2 z M9,3 h2 v8 h-2 z M13,0 h2 v11 h-2 z" fill={dark ? '#fff' : 'currentColor'}/></svg>
        {/* wifi */}
        <svg width="14" height="11" viewBox="0 0 14 11"><path d="M7,11 L9,8 L5,8 Z M7,6 C9,6 10.5,7 12,8.5 L13.5,7 C11.5,5 9.5,4 7,4 C4.5,4 2.5,5 0.5,7 L2,8.5 C3.5,7 5,6 7,6 Z" fill={dark ? '#fff' : 'currentColor'}/></svg>
        {/* battery */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 22, height: 10, border: `1px solid ${dark ? '#fff' : 'currentColor'}`, borderRadius: 2, padding: 1, opacity: 0.9 }}>
            <div style={{ width: '85%', height: '100%', background: dark ? '#fff' : 'currentColor', borderRadius: 1 }} />
          </div>
          <div style={{ width: 1.5, height: 4, background: dark ? '#fff' : 'currentColor', borderRadius: 1, marginLeft: 1 }} />
        </div>
      </div>
    </div>
  );
}

function MPCapsule({ dark = false }) {
  return (
    <div style={{ ...mp_chromeStyles.capsule, ...(dark ? mp_chromeStyles.capsuleDark : {}) }}>
      <div style={{ width: 38, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 3, height: 3, borderRadius: '50%', background: dark ? '#fff' : '#333', margin: '0 1.5px' }} />
        <div style={{ width: 3, height: 3, borderRadius: '50%', background: dark ? '#fff' : '#333', margin: '0 1.5px' }} />
        <div style={{ width: 3, height: 3, borderRadius: '50%', background: dark ? '#fff' : '#333', margin: '0 1.5px' }} />
      </div>
      <div style={{ width: 1, height: 14, background: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)' }} />
      <div style={{ width: 38, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', border: `1.5px solid ${dark ? '#fff' : '#333'}`, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 3, borderRadius: '50%', background: dark ? '#fff' : '#333' }} />
        </div>
      </div>
    </div>
  );
}

// The red nav header seen in the screenshots: back, home icon, page title, capsule button
function MPHeader({ title, showHome = true, showBack = true, subtitle, onBack, onHome, dark = true, transparent = false }) {
  const fg = dark ? '#fff' : 'var(--ink)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px 10px 14px',
      color: fg, position: 'relative', zIndex: 15,
    }}>
      {showBack && (
        <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: fg, display: 'flex' }}>
          <svg width="11" height="18" viewBox="0 0 11 18"><path d="M10,1 L2,9 L10,17" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      )}
      {showHome && (
        <button onClick={onHome} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: fg, display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 3 L3 11 h3 v9 h5 v-6 h2 v6 h5 v-9 h3 Z" fill="currentColor"/></svg>
          <span style={{ fontSize: 15, fontWeight: 500 }}>回首页</span>
        </button>
      )}
      {subtitle && <span style={{ fontSize: 15, fontWeight: 500, opacity: 0.92 }}>{subtitle}</span>}
      <div style={{ flex: 1 }} />
      <MPCapsule dark={dark} />
    </div>
  );
}

// Bottom gesture nav bar for Android
function MPNavBar({ dark = false }) {
  const c = dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.65)';
  return (
    <div style={{
      height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      background: 'transparent', flexShrink: 0
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24"><path d="M3 18 L21 18 M3 12 L21 12 M3 6 L21 6" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>
      <svg width="14" height="14" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" stroke={c} strokeWidth="2" fill="none"/></svg>
      <svg width="14" height="14" viewBox="0 0 24 24"><path d="M19 5 L5 12 L19 19 Z" stroke={c} strokeWidth="2" fill="none" strokeLinejoin="round"/></svg>
    </div>
  );
}

// Full Android phone frame with mini-program status bar
function Phone({ children, tabBar = null, width = 412, height = 892 }) {
  return (
    <div style={{
      width, height, borderRadius: 36, overflow: 'hidden',
      background: 'var(--bg)', border: '10px solid #1a1a1a',
      boxShadow: '0 30px 80px rgba(40,20,10,0.25), 0 10px 30px rgba(40,20,10,0.15)',
      display: 'flex', flexDirection: 'column', position: 'relative',
      fontFamily: '"PingFang SC", "Microsoft YaHei", -apple-system, system-ui, sans-serif',
    }}>
      <MPStatusBar />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {children}
      </div>
      {tabBar}
      <MPNavBar />
    </div>
  );
}

Object.assign(window, { MPStatusBar, MPCapsule, MPHeader, MPNavBar, Phone });
