// Theme tokens for 乾缘婚恋 — 3 aesthetic directions
// Each variation is a complete color system

window.THEMES = {
  // Warm cinnabar — primary/main direction. Trustworthy, traditional-meets-modern.
  cinnabar: {
    name: '温润红喜',
    bg: '#FBF6EE',
    surface: '#FFFFFF',
    surfaceAlt: '#F7EFE3',
    primary: '#C93434',
    primaryDeep: '#A82626',
    primarySoft: '#F9E5E0',
    accent: '#C9A24C',
    ink: '#1F1A17',
    inkSoft: '#5A4F47',
    inkMuted: '#9A8E84',
    border: '#E9DFD0',
    headerGrad: 'linear-gradient(135deg, #C93434 0%, #8F1F1F 50%, #5A0E0E 100%)',
    headerOverlay: 'radial-gradient(circle at 75% 30%, rgba(255,200,130,0.3), transparent 50%), radial-gradient(circle at 25% 70%, rgba(255,100,100,0.2), transparent 50%)',
  },
  // Soft jade-pink — younger, softer, more modern
  pink: {
    name: '暖玉柔粉',
    bg: '#FDF7F5',
    surface: '#FFFFFF',
    surfaceAlt: '#FBEDEA',
    primary: '#E06B7A',
    primaryDeep: '#C04E5E',
    primarySoft: '#FBE2E6',
    accent: '#7FB8A8',
    ink: '#2B1F22',
    inkSoft: '#6A5159',
    inkMuted: '#A7918E',
    border: '#F0E1DE',
    headerGrad: 'linear-gradient(135deg, #F4A9B5 0%, #E06B7A 55%, #B84858 100%)',
    headerOverlay: 'radial-gradient(circle at 80% 20%, rgba(255,245,220,0.4), transparent 55%)',
  },
  // Deep gold classical — premium, 门当户对, parent-skewing
  gold: {
    name: '深金典雅',
    bg: '#F5EFDF',
    surface: '#FFFDF6',
    surfaceAlt: '#EDE2C8',
    primary: '#8B2828',
    primaryDeep: '#5E1414',
    primarySoft: '#EDDCD5',
    accent: '#B08934',
    ink: '#1A1410',
    inkSoft: '#4B3E30',
    inkMuted: '#948170',
    border: '#D9C9A8',
    headerGrad: 'linear-gradient(135deg, #4A1010 0%, #2A0808 100%)',
    headerOverlay: 'radial-gradient(circle at 70% 40%, rgba(176,137,52,0.45), transparent 55%)',
  }
};

window.applyTheme = function(themeKey, fontSize, avatarStyle) {
  const t = window.THEMES[themeKey] || window.THEMES.cinnabar;
  const r = document.documentElement;
  Object.entries(t).forEach(([k, v]) => {
    if (typeof v === 'string') r.style.setProperty('--' + k, v);
  });
  r.style.setProperty('--font-scale', String(fontSize || 1));
  r.setAttribute('data-theme', themeKey);
  r.setAttribute('data-avatar', avatarStyle || 'default');
};
