// screens.jsx — All 7 screens for the 乾缘婚恋 prototype.
// Uses window.CANDIDATES, useTheme, and UI primitives.

// ─── Bottom Tab Bar ───────────────────────────────────────────
function TabBar({ active, onChange }) {
  const theme = useTheme();
  const tabs = [
    { key: 'home',    label: '每日推荐', icon: Icon.Home },
    { key: 'list',    label: '相亲资料', icon: Icon.Doc },
    { key: 'share',   label: '经验分享', icon: Icon.Book, live: true },
    { key: 'msg',     label: '消息',     icon: Icon.Chat },
    { key: 'me',      label: '我的',     icon: Icon.User },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: theme.navBg, backdropFilter: 'blur(20px)',
      borderTop: `0.5px solid ${theme.line}`,
      padding: '8px 4px 28px',
      display: 'flex', zIndex: 40,
    }}>
      {tabs.map(t => {
        const isActive = active === t.key;
        return (
          <button key={t.key} onClick={() => onChange(t.key)} style={{
            flex: 1, background: 'transparent', border: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 3, padding: '6px 0', cursor: 'pointer',
            color: isActive ? theme.navActive : theme.navIdle,
            fontFamily: theme.bodyFont, position: 'relative',
          }}>
            <div style={{ position: 'relative' }}>
              <t.icon size={22} filled={isActive} />
              {t.live && (
                <span style={{
                  position: 'absolute', top: -6, left: '100%', marginLeft: -4,
                  background: theme.accent, color: theme.accentInk,
                  fontSize: 9, padding: '1px 4px', borderRadius: 3,
                  fontWeight: 600, whiteSpace: 'nowrap',
                }}>直播</span>
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Top header ───────────────────────────────────────────────
function Header({ title, left, right, theme: t }) {
  const theme = useTheme();
  return (
    <div style={{
      paddingTop: 58, paddingBottom: 12, padding: '58px 16px 12px',
      background: theme.headerBg,
      display: 'flex', alignItems: 'center', gap: 12,
      borderBottom: `0.5px solid ${theme.line}`,
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div style={{ width: 60, display: 'flex', alignItems: 'center', gap: 4, color: theme.headerInk }}>
        {left}
      </div>
      <div style={{ flex: 1, textAlign: 'center', fontFamily: theme.displayFont,
        fontSize: 16, fontWeight: 600, color: theme.headerInk, letterSpacing: 2 }}>
        {title}
      </div>
      <div style={{ width: 60, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, color: theme.headerInk }}>
        {right}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SCREEN 1 — 每日推荐 (home / filter entry)
// ═════════════════════════════════════════════════════════════
function HomeScreen({ onStart, filterState, setFilterState }) {
  const theme = useTheme();
  const [gender, setGender] = React.useState(filterState.gender || '男');
  const [city, setCity] = React.useState(filterState.city || '北京-北京-请选择');
  const [year, setYear] = React.useState(filterState.year || '1987');
  const [cityOpen, setCityOpen] = React.useState(false);
  const [yearOpen, setYearOpen] = React.useState(false);

  const commit = (next) => setFilterState({ ...filterState, ...next });

  return (
    <div style={{
      padding: '0 0 100px', minHeight: '100%',
      background: theme.bg, color: theme.ink, fontFamily: theme.bodyFont,
    }}>
      {/* Hero */}
      <div style={{
        background: theme.gradient, padding: '32px 24px 40px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BrandMark size={26} />
          <Chip variant="ghost" size="sm">{theme.name}</Chip>
        </div>
        <h1 style={{
          margin: '28px 0 8px', fontFamily: theme.displayFont,
          fontSize: 30, fontWeight: 600, lineHeight: 1.2,
          color: theme.ink, letterSpacing: 2,
        }}>千里姻缘<br/>一线相牵</h1>
        <p style={{
          margin: 0, color: theme.inkMuted, fontSize: 13, lineHeight: 1.6,
          letterSpacing: 0.5,
        }}>为您精心挑选 · 今日推荐 12 位</p>
      </div>

      {/* Form */}
      <div style={{ padding: '24px 20px 0' }}>
        <SectionTitle icon subtitle="选定后不可随意修改">相亲者的性别</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
          {['女', '男'].map(g => {
            const sel = gender === g;
            return (
              <button key={g} onClick={() => { setGender(g); commit({ gender: g }); }}
                style={{
                  background: sel ? (g === '女' ? theme.accentSoft : theme.surfaceAlt) : theme.surface,
                  border: `1.5px solid ${sel ? theme.accent : theme.line}`,
                  borderRadius: theme.radius, padding: '18px 20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', position: 'relative',
                  transition: 'all 0.15s',
                }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 10,
                  background: sel ? theme.accent : 'transparent',
                  border: sel ? 'none' : `1.5px solid ${theme.line}`,
                  color: theme.accentInk, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>{sel && <Icon.Check size={10} />}</div>
                <span style={{
                  fontFamily: theme.displayFont, fontSize: 26, fontWeight: 600,
                  color: sel ? theme.accent : theme.inkMuted,
                }}>{g}</span>
                <span style={{ width: 20 }}>{/* spacer */}</span>
              </button>
            );
          })}
        </div>

        <SectionTitle icon>相亲者的居住地</SectionTitle>
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <button onClick={() => { setCityOpen(o => !o); setYearOpen(false); }} style={{
            width: '100%', background: theme.surface,
            border: `1px solid ${theme.line}`, borderRadius: theme.radius,
            padding: '14px 16px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', cursor: 'pointer',
            fontFamily: theme.bodyFont, fontSize: 14, color: theme.ink,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: theme.accent }}><Icon.Pin /></span>
              {city}
            </span>
            <Icon.Chevron dir={cityOpen ? 'up' : 'down'} />
          </button>
          {cityOpen && (
            <div style={{
              position: 'absolute', top: '105%', left: 0, right: 0, zIndex: 20,
              background: theme.surface, border: `1px solid ${theme.line}`,
              borderRadius: theme.radius, padding: 8,
              boxShadow: theme.shadow,
              maxHeight: 220, overflowY: 'auto',
            }}>
              {CITIES.map(c => (
                <div key={c} onClick={() => { setCity(c); setCityOpen(false); commit({ city: c }); }}
                  style={{ padding: '10px 12px', cursor: 'pointer', borderRadius: theme.radiusSm,
                    fontSize: 14, color: theme.ink,
                    background: city === c ? theme.accentSoft : 'transparent' }}>{c}</div>
              ))}
            </div>
          )}
        </div>

        <SectionTitle icon>相亲者的年龄</SectionTitle>
        <div style={{ position: 'relative', marginBottom: 36 }}>
          <button onClick={() => { setYearOpen(o => !o); setCityOpen(false); }} style={{
            width: '100%', background: theme.surface,
            border: `1px solid ${theme.line}`, borderRadius: theme.radius,
            padding: '14px 16px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', cursor: 'pointer',
            fontFamily: theme.bodyFont, fontSize: 14, color: theme.ink,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: theme.accent }}><Icon.Calendar /></span>
              {year}年
            </span>
            <Icon.Chevron dir={yearOpen ? 'up' : 'down'} />
          </button>
          {yearOpen && (
            <div style={{
              position: 'absolute', top: '105%', left: 0, right: 0, zIndex: 20,
              background: theme.surface, border: `1px solid ${theme.line}`,
              borderRadius: theme.radius, padding: 8, boxShadow: theme.shadow,
              maxHeight: 220, overflowY: 'auto',
            }}>
              {Array.from({length: 24}, (_, i) => 1975 + i).map(y => (
                <div key={y} onClick={() => { setYear(String(y)); setYearOpen(false); commit({ year: String(y) }); }}
                  style={{ padding: '10px 12px', cursor: 'pointer', borderRadius: theme.radiusSm,
                    fontSize: 14, color: theme.ink, fontFamily: theme.monoFont,
                    background: String(y) === year ? theme.accentSoft : 'transparent' }}>{y} 年</div>
              ))}
            </div>
          )}
        </div>

        <Button variant="primary" size="lg" full onClick={onStart}
          style={{ fontSize: 16, letterSpacing: 4 }}>
          开始寻缘 →
        </Button>
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12 }}>
          <a style={{ color: theme.accent, textDecoration: 'underline', cursor: 'pointer' }} onClick={onStart}>先去看看 &gt;&gt;</a>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginTop: 22, fontSize: 11, color: theme.inkMuted,
        }}>
          <span style={{
            width: 14, height: 14, borderRadius: 7, background: theme.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.accentInk,
          }}><Icon.Check size={8} /></span>
          填写资料即视为阅读并同意 <span style={{ color: theme.accent, textDecoration: 'underline' }}>服务及隐私条款</span>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SCREEN 2 — 相亲资料列表
// ═════════════════════════════════════════════════════════════
function ListScreen({ onOpenDetail, onOpenFilter, onOpenForm }) {
  const theme = useTheme();
  const [bannerDismissed, setBannerDismissed] = React.useState(false);

  return (
    <div style={{ minHeight: '100%', background: theme.bg, paddingBottom: 100,
      fontFamily: theme.bodyFont, color: theme.ink }}>
      <Header title="每日推荐"
        left={<button onClick={onOpenFilter} style={{ background: 'transparent', border: 'none', color: theme.headerInk, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: 4, fontSize: 13 }}>
          <Icon.Filter /> 筛选
        </button>}
      />

      {/* Floating side-tab "填写相亲资料" */}
      <button onClick={onOpenForm} style={{
        position: 'absolute', right: 0, top: 280, zIndex: 5,
        background: theme.accent, color: theme.accentInk,
        border: 'none', cursor: 'pointer',
        borderRadius: `${theme.radius}px 0 0 ${theme.radius}px`,
        padding: '14px 10px', fontSize: 11, writingMode: 'vertical-rl',
        fontFamily: theme.bodyFont, letterSpacing: 3, fontWeight: 500,
        boxShadow: theme.shadow,
      }}>填写相亲资料</button>

      <div style={{ padding: '14px 16px' }}>
        {CANDIDATES.map((c) => (
          <CandidateCard key={c.id} candidate={c} onOpen={() => onOpenDetail(c.id)} />
        ))}
      </div>

      {!bannerDismissed && (
        <div style={{
          position: 'absolute', bottom: 84, left: 12, right: 12,
          background: theme.ink, color: theme.bg,
          borderRadius: theme.radius, padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 35,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: theme.radiusSm,
            background: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon.Doc size={20} filled />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>您未登记相亲资料</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>登记后，为您精准推荐对象</div>
          </div>
          <button onClick={onOpenForm} style={{
            background: theme.bg, color: theme.ink, border: 'none',
            borderRadius: 999, padding: '7px 14px', fontSize: 12,
            fontFamily: theme.bodyFont, fontWeight: 500, cursor: 'pointer',
          }}>去登记</button>
          <button onClick={() => setBannerDismissed(true)} style={{
            background: 'transparent', border: 'none', color: theme.bg, opacity: 0.5,
            cursor: 'pointer', padding: 4,
          }}><Icon.X /></button>
        </div>
      )}
    </div>
  );
}

function CandidateCard({ candidate, onOpen }) {
  const theme = useTheme();
  const c = candidate;
  return (
    <div style={{
      background: theme.surface, borderRadius: theme.radiusLg,
      padding: '16px 18px 18px', marginBottom: 14,
      boxShadow: theme.shadow, border: `1px solid ${theme.line}`,
      position: 'relative',
    }}>
      {/* ID tag */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <span style={{
          fontFamily: theme.monoFont, fontSize: 11, color: theme.inkMuted,
          letterSpacing: 0.5,
        }}>寻缘号 · {c.id}</span>
        <span style={{ fontSize: 10, color: theme.inkFaint }}>{c.posted}</span>
      </div>

      {/* Main row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        <Avatar initial={c.initial} tone={c.avatarTone} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{
              fontFamily: theme.displayFont, fontSize: 22, fontWeight: 600,
              color: theme.accent,
            }}>{c.gender}</span>
            <span style={{ color: theme.inkFaint, fontSize: 14 }}>·</span>
            <span style={{
              fontFamily: theme.monoFont, fontSize: 16, fontWeight: 500,
              color: theme.ink,
            }}>{c.year}年</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: theme.inkMuted,
              display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ color: theme.accent }}><Icon.Fire size={12} /></span>{c.hot}
            </span>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px',
            fontSize: 12, color: theme.ink,
          }}>
            <Row label="居住" value={c.residence} theme={theme} />
            <Row label="户籍" value={c.hometown} theme={theme} />
            <Row label="学历" value={c.education} theme={theme} />
            <Row label="身高" value={`${c.height}cm`} theme={theme} />
          </div>
        </div>
      </div>

      {/* Intro */}
      <div style={{
        background: theme.surfaceAlt, borderRadius: theme.radiusSm,
        padding: '10px 12px', fontSize: 12, lineHeight: 1.6,
        color: theme.inkMuted, marginBottom: 14,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        <span style={{ color: theme.ink, fontWeight: 500 }}>介绍</span>　{c.intro}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="secondary" size="sm" style={{ flex: 1 }}>联系对方</Button>
        <Button variant="primary" size="sm" style={{ flex: 1 }} onClick={onOpen}>查看资料</Button>
      </div>
    </div>
  );
}

function Row({ label, value, theme }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{ color: theme.inkMuted, fontSize: 11, flexShrink: 0, letterSpacing: 2 }}>{label}</span>
      <span style={{ color: theme.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SCREEN 3 — 资料详情
// ═════════════════════════════════════════════════════════════
function DetailScreen({ candidateId, onBack, onHome }) {
  const theme = useTheme();
  const c = CANDIDATES.find(x => x.id === candidateId) || CANDIDATES[0];
  const [starred, setStarred] = React.useState(false);
  const [unlocked, setUnlocked] = React.useState(false);
  const [contactOpen, setContactOpen] = React.useState(false);
  const [toastVisible, setToastVisible] = React.useState(true);

  return (
    <div style={{ minHeight: '100%', background: theme.bg, paddingBottom: 150,
      fontFamily: theme.bodyFont, color: theme.ink }}>
      <Header title="相亲资料"
        left={
          <React.Fragment>
            <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: theme.headerInk, cursor: 'pointer', padding: 2 }}>
              <Icon.Chevron dir="left" size={16} />
            </button>
            <button onClick={onHome} style={{ background: 'transparent', border: 'none', color: theme.headerInk, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 13 }}>
              <Icon.Home size={14} /> 回首页
            </button>
          </React.Fragment>
        }
      />

      {/* Profile head */}
      <div style={{ padding: '18px 20px 22px', background: theme.surface, borderBottom: `1px solid ${theme.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar initial={c.initial} tone={c.avatarTone} size={58} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: theme.monoFont, fontSize: 13, color: theme.ink, letterSpacing: 0.5 }}>
              寻缘号 {c.id}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, fontSize: 11, color: theme.inkMuted }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon.Heart size={12} filled/> {c.likes}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: theme.accent }}><Icon.Fire size={12} /></span>{c.hot}
              </span>
            </div>
          </div>
          <Chip variant="accent" size="sm"><Icon.Share /> &nbsp;转发</Chip>
        </div>

        {/* Action row */}
        <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center' }}>
          <button onClick={() => setStarred(s => !s)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 2, color: starred ? theme.accent : theme.inkMuted, padding: 4,
          }}>
            <Icon.Star size={20} filled={starred} />
            <span style={{ fontSize: 10 }}>收藏</span>
          </button>
          <Button variant={unlocked ? "soft" : "secondary"} size="md" style={{ flex: 1 }}
            onClick={() => setUnlocked(true)}
            icon={<Icon.Lock />}>
            {unlocked ? '已解锁' : '解锁对方'}
          </Button>
          <Button variant="primary" size="md" style={{ flex: 1.2 }} icon={<Icon.Message size={15}/>}>
            发消息
          </Button>
        </div>
      </div>

      {/* Basic facts */}
      <div style={{ padding: '20px', background: theme.surface, marginTop: 10 }}>
        <FactGrid
          rows={[
            ['年份', `${c.year}`, '性别', c.gender],
            ['学历', c.education, '身高', `${c.height}cm`],
            ['户籍', c.hometown, '', ''],
            ['居住', c.residence, '', ''],
            ['职业', c.occupation, '', ''],
          ]}
        />
      </div>

      {/* 更多详情 */}
      <div style={{ padding: '20px', background: theme.surface, marginTop: 10 }}>
        <SectionTitle icon>更多详情</SectionTitle>
        <FactGrid
          rows={[
            ['家乡', c.hometown, '', ''],
            ['年收入', c.income, '婚姻', c.marriage],
            ['是否有房', c.housing, '', ''],
            ['体型', c.body, '', ''],
          ]}
        />
        <div style={{
          background: theme.surfaceAlt, borderRadius: theme.radiusSm,
          padding: '14px 16px', marginTop: 14, fontSize: 13, lineHeight: 1.8,
          color: theme.inkMuted,
        }}>{c.intro}</div>
      </div>

      {/* 择偶要求 */}
      <div style={{ padding: '20px 20px 40px', background: theme.surface, marginTop: 10 }}>
        <SectionTitle icon>择偶要求</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {[
            ['年份', c.requirements.yearRange],
            ['年收入', c.requirements.income],
            ['身高', c.requirements.height],
            ['婚房', c.requirements.housing],
            ['学历要求', c.requirements.education],
            ['婚姻要求', c.requirements.marriage],
            ['户籍地要求', c.requirements.hometown],
            ['居住地要求', c.requirements.residence],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 16, fontSize: 13 }}>
              <span style={{ color: theme.inkMuted, width: 84, letterSpacing: 1 }}>{k}</span>
              <span style={{ color: theme.ink, fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Floating "生成我的资料" */}
      <div style={{
        position: 'absolute', right: 16, top: 320, zIndex: 5,
        width: 56, height: 56, borderRadius: 28,
        background: theme.warn, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: theme.bodyFont, fontSize: 11, lineHeight: 1.2, textAlign: 'center',
        boxShadow: '0 6px 18px rgba(199,122,58,0.35)', cursor: 'pointer',
        fontWeight: 500,
      }}>生成<br/>我的<br/>资料</div>

      {/* Urgency toast */}
      {toastVisible && (
        <div style={{
          position: 'absolute', bottom: 140, left: 16, right: 16, zIndex: 30,
          background: 'rgba(20,17,16,0.88)', color: theme.bg,
          borderRadius: theme.radius, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 12, lineHeight: 1.5, backdropFilter: 'blur(10px)',
        }}>
          <span style={{ flex: 1 }}>觉得合适请尽快查看，明天将无法看到对方资料</span>
          <button onClick={() => setToastVisible(false)} style={{
            background: 'transparent', border: 'none', color: theme.bg, opacity: 0.7,
            cursor: 'pointer', padding: 4,
          }}><Icon.X /></button>
        </div>
      )}

      {/* Sticky bottom action */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 35,
        background: theme.surface, padding: '12px 16px 30px',
        borderTop: `0.5px solid ${theme.line}`,
        display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <button onClick={onHome} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          color: theme.inkMuted, fontSize: 10, gap: 2,
        }}>
          <Icon.Home size={22} />
          <span>回首页</span>
        </button>
        <Button variant="secondary" size="md" style={{ flex: 1 }} icon={<Icon.Message size={14}/>}>发消息</Button>
        <Button variant="primary" size="md" style={{ flex: 1.2 }}
          onClick={() => setContactOpen(true)}>查看联系方式</Button>
      </div>

      {contactOpen && (
        <ContactSheet candidate={c} onClose={() => setContactOpen(false)} />
      )}
    </div>
  );
}

function FactGrid({ rows }) {
  const theme = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
          {[[r[0], r[1]], [r[2], r[3]]].map(([k, v], j) => (
            k ? (
              <div key={j} style={{ display: 'flex', gap: 12 }}>
                <span style={{ color: theme.inkMuted, letterSpacing: 2, minWidth: 48 }}>{k}</span>
                <span style={{ color: theme.ink, fontWeight: 500 }}>{v}</span>
              </div>
            ) : <div key={j} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ContactSheet({ candidate, onClose }) {
  const theme = useTheme();
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: theme.surface,
        borderRadius: `${theme.radiusLg}px ${theme.radiusLg}px 0 0`,
        padding: '24px 20px 40px',
      }}>
        <div style={{ width: 36, height: 4, background: theme.line, borderRadius: 2, margin: '0 auto 18px' }} />
        <h3 style={{ margin: 0, fontFamily: theme.displayFont, fontSize: 18, textAlign: 'center', letterSpacing: 2 }}>解锁联系方式</h3>
        <p style={{ textAlign: 'center', color: theme.inkMuted, fontSize: 12, marginTop: 6 }}>
          寻缘号 {candidate.id} · 本次操作将消耗 <b style={{ color: theme.accent }}>1 次解锁</b>
        </p>
        <div style={{
          margin: '20px 0 14px', padding: '18px 20px',
          background: theme.surfaceAlt, borderRadius: theme.radius,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <Avatar initial={candidate.initial} tone={candidate.avatarTone} size={48} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: theme.ink, fontWeight: 500 }}>{candidate.gender} · {candidate.year}年 · {candidate.height}cm</div>
            <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 3 }}>{candidate.residence} · {candidate.occupation}</div>
          </div>
        </div>
        <Button variant="primary" size="lg" full onClick={onClose}>确认解锁</Button>
        <Button variant="ghost" size="md" full onClick={onClose} style={{ marginTop: 10 }}>暂不解锁</Button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SCREEN 4 — 筛选
// ═════════════════════════════════════════════════════════════
function FilterScreen({ onClose }) {
  const theme = useTheme();
  const [gender, setGender] = React.useState('男');
  const [ageRange, setAgeRange] = React.useState([25, 40]);
  const [heightRange, setHeightRange] = React.useState([160, 185]);
  const [education, setEducation] = React.useState(['本科']);
  const [marriage, setMarriage] = React.useState('未婚');
  const [housing, setHousing] = React.useState('不限');
  const [cities, setCities] = React.useState(['北京']);

  const toggleList = (list, setList, val) => {
    if (list.includes(val)) setList(list.filter(x => x !== val));
    else setList([...list, val]);
  };

  return (
    <div style={{ minHeight: '100%', background: theme.bg, paddingBottom: 120,
      fontFamily: theme.bodyFont, color: theme.ink }}>
      <Header title="筛选条件"
        left={<button onClick={onClose} style={{ background: 'transparent', border: 'none', color: theme.headerInk, cursor: 'pointer', padding: 2 }}><Icon.Chevron dir="left" size={16}/></button>}
        right={<button style={{ background: 'transparent', border: 'none', color: theme.inkMuted, cursor: 'pointer', fontSize: 13 }}>重置</button>}
      />

      <div style={{ padding: '22px 20px 0' }}>
        <SectionTitle icon>相亲者性别</SectionTitle>
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          {['男', '女', '不限'].map(g => (
            <button key={g} onClick={() => setGender(g)} style={{
              flex: 1, padding: '12px 0', borderRadius: theme.radius,
              border: `1.5px solid ${gender === g ? theme.accent : theme.line}`,
              background: gender === g ? theme.accentSoft : theme.surface,
              color: gender === g ? theme.accent : theme.ink,
              fontFamily: theme.displayFont, fontSize: 15, fontWeight: 500, cursor: 'pointer',
            }}>{g}</button>
          ))}
        </div>

        <SectionTitle icon subtitle={`${ageRange[0]} - ${ageRange[1]} 岁`}>年龄范围</SectionTitle>
        <RangeSlider value={ageRange} onChange={setAgeRange} min={22} max={60} />

        <div style={{ height: 28 }} />

        <SectionTitle icon subtitle={`${heightRange[0]} - ${heightRange[1]} cm`}>身高范围</SectionTitle>
        <RangeSlider value={heightRange} onChange={setHeightRange} min={150} max={200} />

        <div style={{ height: 28 }} />

        <SectionTitle icon>学历</SectionTitle>
        <ChipGroup options={['小学/初中', '中专/高中', '大专', '本科', '硕士', '博士']}
          values={education} onToggle={(v) => toggleList(education, setEducation, v)} multi />

        <SectionTitle icon>婚姻状况</SectionTitle>
        <ChipGroup options={['未婚', '离异未育', '离异已育', '丧偶', '不限']}
          values={[marriage]} onToggle={(v) => setMarriage(v)} />

        <SectionTitle icon>住房情况</SectionTitle>
        <ChipGroup options={['有婚房', '无婚房', '可商量', '不限']}
          values={[housing]} onToggle={(v) => setHousing(v)} />

        <SectionTitle icon subtitle={`已选 ${cities.length} 个`}>居住城市</SectionTitle>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {CITIES.slice(0, 10).map(city => {
            const sel = cities.includes(city);
            return (
              <button key={city} onClick={() => toggleList(cities, setCities, city)} style={{
                padding: '8px 14px', borderRadius: theme.radiusSm,
                border: `1px solid ${sel ? theme.accent : theme.line}`,
                background: sel ? theme.accent : theme.surface,
                color: sel ? theme.accentInk : theme.ink,
                fontSize: 12, cursor: 'pointer',
              }}>{city}</button>
            );
          })}
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: theme.surface, borderTop: `0.5px solid ${theme.line}`,
        padding: '14px 16px 30px', display: 'flex', gap: 10,
      }}>
        <Button variant="ghost" size="lg" style={{ flex: 1 }} onClick={onClose}>取消</Button>
        <Button variant="primary" size="lg" style={{ flex: 2 }} onClick={onClose}>查看 128 位符合</Button>
      </div>
    </div>
  );
}

function RangeSlider({ value, onChange, min, max }) {
  const theme = useTheme();
  const [lo, hi] = value;
  const pctLo = ((lo - min) / (max - min)) * 100;
  const pctHi = ((hi - min) / (max - min)) * 100;
  const dragging = React.useRef(null);

  const onTrackClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width);
    const val = Math.round(min + pct * (max - min));
    const closerToLo = Math.abs(val - lo) < Math.abs(val - hi);
    if (closerToLo) onChange([Math.max(min, Math.min(val, hi - 1)), hi]);
    else onChange([lo, Math.min(max, Math.max(val, lo + 1))]);
  };

  return (
    <div style={{ padding: '12px 0' }}>
      <div onClick={onTrackClick} style={{
        height: 4, background: theme.surfaceAlt, borderRadius: 2,
        position: 'relative', cursor: 'pointer',
      }}>
        <div style={{
          position: 'absolute', left: `${pctLo}%`, right: `${100 - pctHi}%`,
          top: 0, bottom: 0, background: theme.accent, borderRadius: 2,
        }} />
        {[[pctLo, lo], [pctHi, hi]].map(([pct, v], i) => (
          <div key={i} style={{
            position: 'absolute', left: `${pct}%`, top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 20, height: 20, borderRadius: 10,
            background: theme.surface, border: `2px solid ${theme.accent}`,
            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: theme.inkMuted, fontFamily: theme.monoFont }}>
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

function ChipGroup({ options, values, onToggle, multi }) {
  const theme = useTheme();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
      {options.map(opt => {
        const sel = values.includes(opt);
        return (
          <button key={opt} onClick={() => onToggle(opt)} style={{
            padding: '8px 14px', borderRadius: theme.radiusSm,
            border: `1px solid ${sel ? theme.accent : theme.line}`,
            background: sel ? theme.accentSoft : theme.surface,
            color: sel ? theme.accentDeep : theme.ink,
            fontSize: 12, cursor: 'pointer',
            fontWeight: sel ? 500 : 400,
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

Object.assign(window, { TabBar, Header, HomeScreen, ListScreen, DetailScreen, FilterScreen });
