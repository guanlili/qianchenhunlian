// Avatar component — 3 styles based on gender
// default: gradient bubble with 寻缘 glyph
// cartoon: simple SVG face
// real: silhouette placeholder

function Avatar({ gender, size = 48, style = 'default' }) {
  const isMale = gender === '男';
  const avatarStyle = document.documentElement.getAttribute('data-avatar') || style;
  
  if (avatarStyle === 'cartoon') {
    const bg = isMale ? '#A8C4E0' : '#F4BCC4';
    const hair = isMale ? '#3E2A20' : '#5C3A28';
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        <svg viewBox="0 0 48 48" width={size} height={size}>
          {/* hair */}
          <path d={isMale ? 'M10 20 Q10 10 24 10 Q38 10 38 20 L38 24 L10 24 Z' : 'M8 22 Q8 8 24 8 Q40 8 40 22 L40 28 Q34 24 24 24 Q14 24 8 28 Z'} fill={hair}/>
          {/* face */}
          <circle cx="24" cy="26" r="11" fill="#FBE4D0"/>
          {/* eyes */}
          <circle cx="20" cy="26" r="1.3" fill="#1a1a1a"/>
          <circle cx="28" cy="26" r="1.3" fill="#1a1a1a"/>
          {/* mouth */}
          <path d="M21 31 Q24 33 27 31" stroke="#C05050" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          {/* body */}
          <path d="M10 48 Q10 38 24 38 Q38 38 38 48 Z" fill={isMale ? '#4A6A8A' : '#D47586'}/>
        </svg>
      </div>
    );
  }
  
  if (avatarStyle === 'real') {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: isMale ? 'linear-gradient(135deg, #8BA7C4, #4A6B8C)' : 'linear-gradient(135deg, #E8B7C0, #C07585)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid rgba(255,255,255,0.4)',
        position: 'relative', overflow: 'hidden',
      }}>
        <svg viewBox="0 0 48 48" width={size * 0.85} height={size * 0.85}>
          <circle cx="24" cy="18" r="8" fill="rgba(255,255,255,0.9)"/>
          <path d="M8 44 Q8 30 24 30 Q40 30 40 44 Z" fill="rgba(255,255,255,0.9)"/>
        </svg>
      </div>
    );
  }
  
  // default: brand glyph bubble
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: isMale
        ? 'linear-gradient(135deg, var(--primarySoft), var(--surfaceAlt))'
        : 'linear-gradient(135deg, var(--primarySoft), #FCE8E0)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1.5px solid var(--surface)',
      color: 'var(--primaryDeep)', fontWeight: 700,
      fontSize: size * 0.38,
      fontFamily: '"Noto Serif SC", "Songti SC", serif',
    }}>
      {isMale ? '缘' : '寻'}
    </div>
  );
}

Object.assign(window, { Avatar });
