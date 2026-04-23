// theme.jsx — Design token system for 乾缘婚恋 prototype.
// Three themes, exposed via useTheme(). Each theme defines surfaces, type,
// accents, and radius. CRITICAL: avoid generic `styles` var collisions.

const THEMES = {
  dawn: {
    key: 'dawn',
    name: '晨色',
    description: '柔和珊瑚 · 奶白',
    // Soft coral + cream — warm, modern
    bg:        '#FBF6F1',       // app bg
    surface:   '#FFFFFF',       // cards
    surfaceAlt:'#F4EEE7',       // inset fields
    ink:       '#2A2420',       // primary text
    inkMuted:  '#7A6F66',       // secondary text
    inkFaint:  '#B6ABA1',       // tertiary
    line:      'rgba(42,36,32,0.08)',
    accent:    '#D96B5E',       // coral — primary CTA
    accentInk: '#FFFFFF',
    accentSoft:'#FBE4DF',
    accentDeep:'#A8453A',
    secondary: '#7A8A6B',       // sage for non-primary accents
    warn:      '#C77A3A',
    badge:     '#2A2420',
    chip:      '#F0E6DB',
    chipInk:   '#5A4A3A',
    gradient:  'linear-gradient(180deg, #FFE8DF 0%, #FBF6F1 100%)',
    headerBg:  '#FBF6F1',
    headerInk: '#2A2420',
    navBg:     'rgba(255,255,255,0.92)',
    navActive: '#D96B5E',
    navIdle:   '#7A6F66',
    radius:    18,
    radiusSm:  10,
    radiusLg:  24,
    shadow:    '0 1px 2px rgba(42,36,32,0.04), 0 8px 24px rgba(42,36,32,0.04)',
    displayFont: '"Noto Serif SC", "Songti SC", serif',
    bodyFont:    '"Noto Sans SC", "PingFang SC", system-ui, sans-serif',
    monoFont:    '"DM Mono", ui-monospace, monospace',
  },
  ink: {
    key: 'ink',
    name: '墨白',
    description: '近黑白 · 单点朱红',
    // Editorial near-monochrome + single crimson
    bg:        '#F7F5F2',
    surface:   '#FFFFFF',
    surfaceAlt:'#EEEAE4',
    ink:       '#141110',
    inkMuted:  '#6B6661',
    inkFaint:  '#A8A29A',
    line:      'rgba(20,17,16,0.10)',
    accent:    '#B33A32',       // crimson accent (single-use)
    accentInk: '#FFFFFF',
    accentSoft:'#F2DBD9',
    accentDeep:'#7A231D',
    secondary: '#141110',
    warn:      '#A67232',
    badge:     '#141110',
    chip:      '#EEEAE4',
    chipInk:   '#3A3532',
    gradient:  'linear-gradient(180deg, #EEEAE4 0%, #F7F5F2 100%)',
    headerBg:  '#F7F5F2',
    headerInk: '#141110',
    navBg:     'rgba(255,255,255,0.94)',
    navActive: '#141110',
    navIdle:   '#A8A29A',
    radius:    4,
    radiusSm:  2,
    radiusLg:  8,
    shadow:    '0 1px 2px rgba(20,17,16,0.05), 0 6px 20px rgba(20,17,16,0.04)',
    displayFont: '"Noto Serif SC", "Songti SC", serif',
    bodyFont:    '"Noto Sans SC", "PingFang SC", system-ui, sans-serif',
    monoFont:    '"DM Mono", ui-monospace, monospace',
  },
  jade: {
    key: 'jade',
    name: '青禾',
    description: '青瓷绿 · 赤陶',
    // Muted jade + terracotta — tea-house sensibility
    bg:        '#F2F1EB',
    surface:   '#FBFAF5',
    surfaceAlt:'#E8E7DF',
    ink:       '#1F2620',
    inkMuted:  '#6B726B',
    inkFaint:  '#A8AFA5',
    line:      'rgba(31,38,32,0.10)',
    accent:    '#5E7A66',       // jade green — primary
    accentInk: '#FBFAF5',
    accentSoft:'#D8E2D9',
    accentDeep:'#3A5043',
    secondary: '#B35A3E',       // terracotta
    warn:      '#B35A3E',
    badge:     '#3A5043',
    chip:      '#E2E4DB',
    chipInk:   '#3A5043',
    gradient:  'linear-gradient(180deg, #DFE5DB 0%, #F2F1EB 100%)',
    headerBg:  '#F2F1EB',
    headerInk: '#1F2620',
    navBg:     'rgba(251,250,245,0.94)',
    navActive: '#3A5043',
    navIdle:   '#6B726B',
    radius:    12,
    radiusSm:  6,
    radiusLg:  18,
    shadow:    '0 1px 2px rgba(31,38,32,0.04), 0 6px 20px rgba(31,38,32,0.04)',
    displayFont: '"Noto Serif SC", "Songti SC", serif',
    bodyFont:    '"Noto Sans SC", "PingFang SC", system-ui, sans-serif',
    monoFont:    '"DM Mono", ui-monospace, monospace',
  },
};

const ThemeContext = React.createContext(THEMES.dawn);
const useTheme = () => React.useContext(ThemeContext);

Object.assign(window, { THEMES, ThemeContext, useTheme });
