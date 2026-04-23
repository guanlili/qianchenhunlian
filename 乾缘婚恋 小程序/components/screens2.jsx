// screens2.jsx — Remaining screens: form, messages, experience share, me.

// ═════════════════════════════════════════════════════════════
// SCREEN 5 — 填写我的资料
// ═════════════════════════════════════════════════════════════
function FormScreen({ onClose, onSave }) {
  const theme = useTheme();
  const [form, setForm] = React.useState({
    nickname: '寻缘号 53366922',
    income: '5-7万',
    marriage: '其他',
    housing: '无婚房',
    intro: '',
  });
  const [photos, setPhotos] = React.useState([null, null, null]);

  // Completion calc
  const filled = [
    form.nickname, form.income, form.marriage, form.housing, form.intro,
    photos[0], photos[1], photos[2],
  ].filter(Boolean).length;
  const pct = Math.round((filled / 8) * 100);

  const update = (k, v) => setForm({ ...form, [k]: v });

  return (
    <div style={{ minHeight: '100%', background: theme.bg, paddingBottom: 110,
      fontFamily: theme.bodyFont, color: theme.ink }}>
      <Header title="更多详情"
        left={<button onClick={onClose} style={{ background: 'transparent', border: 'none', color: theme.headerInk, cursor: 'pointer', padding: 2 }}><Icon.Chevron dir="left" size={16}/></button>}
      />

      {/* Hero with completion */}
      <div style={{
        background: theme.gradient, padding: '24px 22px 28px',
        borderBottom: `1px solid ${theme.line}`,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: theme.radiusSm,
          background: 'rgba(255,255,255,0.6)',
          fontSize: 11, color: theme.inkMuted, marginBottom: 12,
        }}>
          <span style={{ color: theme.accent }}>●</span> 选填信息
        </div>
        <h2 style={{
          margin: '0 0 18px', fontFamily: theme.displayFont,
          fontSize: 22, fontWeight: 600, letterSpacing: 2,
        }}>资料完善度</h2>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: theme.inkMuted,
        }}>
          <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.7)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%', background: theme.accent,
              transition: 'width 0.3s',
            }} />
          </div>
          <span style={{
            fontFamily: theme.monoFont, fontSize: 15, fontWeight: 600, color: theme.accent,
            minWidth: 38, textAlign: 'right',
          }}>{pct}%</span>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: theme.inkMuted }}>
          完善度越高，相亲成功率越高
        </p>
      </div>

      {/* Fields */}
      <div style={{ padding: '8px 16px' }}>
        <div style={{
          background: theme.surface, borderRadius: theme.radius,
          border: `1px solid ${theme.line}`, overflow: 'hidden', marginTop: 12,
        }}>
          <FormRow label="相亲者昵称" required>
            <span style={{ color: theme.inkMuted, fontFamily: theme.monoFont, fontSize: 13 }}>{form.nickname}</span>
          </FormRow>
          <FormRow label="年收入" onClick={() => update('income', form.income)}>
            <span style={{ color: theme.ink, fontSize: 13, marginRight: 4 }}>{form.income}</span>
            <Icon.Chevron size={12} />
          </FormRow>
          <FormRow label="婚姻状况" onClick={() => update('marriage', form.marriage)}>
            <span style={{ color: theme.ink, fontSize: 13, marginRight: 4 }}>{form.marriage}</span>
            <Icon.Chevron size={12} />
          </FormRow>
          <FormRow label="是否有房" onClick={() => update('housing', form.housing)}>
            <span style={{ color: theme.ink, fontSize: 13, marginRight: 4 }}>{form.housing}</span>
            <Icon.Chevron size={12} />
          </FormRow>
          <FormRow label="相亲描述" last align="top">
            <textarea
              value={form.intro}
              onChange={(e) => update('intro', e.target.value)}
              placeholder="补充相亲信息，增大成功率，让对方更了解相亲者。例：毕业院校、籍贯、兴趣爱好等。（注意：此处不要留联系方式，否则会导致资料审核不通过。）"
              style={{
                width: '100%', minHeight: 100, padding: 0, border: 'none',
                outline: 'none', resize: 'none', background: 'transparent',
                fontFamily: theme.bodyFont, fontSize: 13, color: theme.ink,
                lineHeight: 1.7,
              }}
            />
          </FormRow>
        </div>

        {/* Photos */}
        <div style={{
          background: theme.surface, borderRadius: theme.radius,
          border: `1px solid ${theme.line}`, marginTop: 14, padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>照片 <span style={{ color: theme.inkFaint, fontSize: 11, marginLeft: 4 }}>第一张将默认为头像</span></span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {photos.map((p, i) => (
              <button key={i}
                onClick={() => {
                  const next = [...photos];
                  next[i] = next[i] ? null : '填';
                  setPhotos(next);
                }}
                style={{
                  aspectRatio: '1', borderRadius: theme.radiusSm,
                  background: p ? theme.surfaceAlt : 'transparent',
                  border: `1.5px dashed ${p ? 'transparent' : theme.line}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: theme.inkFaint, cursor: 'pointer', fontFamily: theme.monoFont,
                  fontSize: 10, padding: 4,
                }}>
                {p ? (
                  <div style={{
                    width: '100%', height: '100%', borderRadius: theme.radiusSm - 2,
                    background: `repeating-linear-gradient(135deg, ${theme.accentSoft} 0 6px, ${theme.surfaceAlt} 6px 12px)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: theme.accent,
                  }}><Icon.Check size={18}/></div>
                ) : (
                  <React.Fragment>
                    <span style={{ fontSize: 24, color: theme.inkFaint, fontFamily: theme.bodyFont, marginRight: 2 }}>+</span>
                    照片 {i+1}
                  </React.Fragment>
                )}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: theme.inkMuted, lineHeight: 1.6 }}>
            照片越清晰，匹配效率更高。系统将对照片进行审核，不合规照片不予通过。
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: theme.surface, borderTop: `0.5px solid ${theme.line}`,
        padding: '12px 16px 30px', display: 'flex', gap: 10,
      }}>
        <Button variant="ghost" size="lg" style={{ flex: 1 }} onClick={onClose}>暂不填写</Button>
        <Button variant="primary" size="lg" style={{ flex: 1.5 }} onClick={onSave}>保存</Button>
      </div>
    </div>
  );
}

function FormRow({ label, required, children, onClick, last, align = 'center' }) {
  const theme = useTheme();
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: align === 'top' ? 'flex-start' : 'center',
      padding: '16px 18px', borderBottom: last ? 'none' : `0.5px solid ${theme.line}`,
      cursor: onClick ? 'pointer' : 'default',
      flexDirection: align === 'top' ? 'column' : 'row',
      gap: align === 'top' ? 10 : 0,
    }}>
      <span style={{
        flexShrink: 0, fontSize: 13, color: theme.ink, fontWeight: 500, letterSpacing: 1,
        width: align === 'top' ? 'auto' : 110,
      }}>
        {label}{required && <span style={{ color: theme.accent, marginLeft: 2 }}>*</span>}
      </span>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: align === 'top' ? 'flex-start' : 'flex-end',
        gap: 4, color: theme.inkMuted, width: align === 'top' ? '100%' : 'auto',
      }}>{children}</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SCREEN 6 — 消息
// ═════════════════════════════════════════════════════════════
function MessagesScreen({ onOpenChat }) {
  const theme = useTheme();
  return (
    <div style={{ minHeight: '100%', background: theme.bg, paddingBottom: 100,
      fontFamily: theme.bodyFont, color: theme.ink }}>
      <Header title="消息" right={<Icon.Search size={16}/>} />
      <div style={{ padding: '10px 0' }}>
        {MESSAGES.map(m => (
          <div key={m.id} onClick={() => onOpenChat(m)} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', cursor: 'pointer',
            borderBottom: `0.5px solid ${theme.line}`, background: theme.surface,
          }}>
            <div style={{ position: 'relative' }}>
              <Avatar initial={m.initial} tone={m.tone} size={48} />
              {m.unread > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: theme.accent, color: theme.accentInk,
                  fontSize: 10, fontWeight: 600,
                  minWidth: 18, height: 18, borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px', border: `2px solid ${theme.surface}`,
                }}>{m.unread}</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: theme.ink }}>{m.name}</span>
                {m.official && <Chip variant="accent" size="sm">官方</Chip>}
              </div>
              <div style={{
                fontSize: 12, color: theme.inkMuted, marginTop: 3,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{m.preview}</div>
            </div>
            <span style={{ fontSize: 11, color: theme.inkFaint }}>{m.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Chat
function ChatScreen({ msg, onBack }) {
  const theme = useTheme();
  const [input, setInput] = React.useState('');
  const [thread, setThread] = React.useState([
    { who: 'them', text: msg.preview, time: msg.time },
    { who: 'me', text: '您好，谢谢您的关注！', time: '刚刚' },
    { who: 'them', text: '方便的话我们加个微信？我是孩子的父亲。', time: '刚刚' },
  ]);

  const send = () => {
    if (!input.trim()) return;
    setThread([...thread, { who: 'me', text: input, time: '刚刚' }]);
    setInput('');
  };

  return (
    <div style={{ minHeight: '100%', background: theme.bg, paddingBottom: 80,
      fontFamily: theme.bodyFont, color: theme.ink, display: 'flex', flexDirection: 'column' }}>
      <Header title={msg.name}
        left={<button onClick={onBack} style={{ background: 'transparent', border: 'none', color: theme.headerInk, cursor: 'pointer', padding: 2 }}><Icon.Chevron dir="left" size={16}/></button>}
      />
      <div style={{ flex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', fontSize: 10, color: theme.inkFaint, margin: '4px 0 12px' }}>温馨提示：请勿在聊天中发送诈骗信息</div>
        {thread.map((t, i) => (
          <div key={i} style={{
            display: 'flex', gap: 8, alignItems: 'flex-end',
            flexDirection: t.who === 'me' ? 'row-reverse' : 'row',
          }}>
            {t.who === 'them'
              ? <Avatar initial={msg.initial} tone={msg.tone} size={34} />
              : <Avatar initial="我" tone="ink" size={34} />}
            <div style={{
              maxWidth: '70%',
              background: t.who === 'me' ? theme.accent : theme.surface,
              color: t.who === 'me' ? theme.accentInk : theme.ink,
              borderRadius: theme.radius,
              padding: '10px 14px', fontSize: 13, lineHeight: 1.6,
              border: t.who === 'them' ? `1px solid ${theme.line}` : 'none',
            }}>{t.text}</div>
          </div>
        ))}
      </div>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: theme.surface, borderTop: `0.5px solid ${theme.line}`,
        padding: '10px 12px 28px', display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="请输入..."
          style={{
            flex: 1, border: `1px solid ${theme.line}`, borderRadius: theme.radius,
            padding: '10px 14px', fontSize: 13, outline: 'none',
            background: theme.bg, color: theme.ink, fontFamily: theme.bodyFont,
          }} />
        <Button variant="primary" size="md" onClick={send}>发送</Button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SCREEN 7 — 经验分享
// ═════════════════════════════════════════════════════════════
function ShareScreen() {
  const theme = useTheme();
  return (
    <div style={{ minHeight: '100%', background: theme.bg, paddingBottom: 100,
      fontFamily: theme.bodyFont, color: theme.ink }}>
      <Header title="经验分享" right={<Icon.Search size={16}/>} />

      {/* Live card */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          background: theme.ink, color: theme.bg, borderRadius: theme.radiusLg,
          padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 12, right: 14,
            background: theme.accent, color: theme.accentInk,
            fontSize: 10, padding: '3px 8px', borderRadius: 10, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4,
          }}><span style={{ width: 5, height: 5, borderRadius: 3, background: '#fff' }}/> 直播中</div>
          <Avatar initial="红" tone="rose" size={52} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: theme.displayFont, letterSpacing: 1 }}>红娘说 · 第 42 期</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>怎样分辨真心的相亲对象</div>
            <div style={{ fontSize: 10, opacity: 0.5, marginTop: 6, fontFamily: theme.monoFont }}>2,184 人在看</div>
          </div>
          <Button variant="primary" size="sm">进入</Button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 20, padding: '18px 20px 6px', fontSize: 13,
        borderBottom: `0.5px solid ${theme.line}`, marginTop: 8,
      }}>
        {['精选', '热门', '父母视角', '亲历', '问答'].map((t, i) => (
          <span key={t} style={{
            fontWeight: i === 0 ? 600 : 400,
            color: i === 0 ? theme.ink : theme.inkMuted,
            fontFamily: i === 0 ? theme.displayFont : theme.bodyFont,
            paddingBottom: 10, position: 'relative', cursor: 'pointer',
            letterSpacing: i === 0 ? 2 : 0.5,
          }}>{t}
            {i === 0 && <span style={{ position: 'absolute', bottom: -1, left: 0, right: 0, height: 2, background: theme.accent }}/>}
          </span>
        ))}
      </div>

      {/* Cards */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {EXPERIENCES.map((e, i) => (
          <article key={e.id} style={{
            background: theme.surface, borderRadius: theme.radius,
            padding: '18px 18px', border: `1px solid ${theme.line}`, boxShadow: theme.shadow,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Chip variant="accent" size="sm">{e.tag}</Chip>
              <span style={{ fontSize: 11, color: theme.inkMuted }}>{e.author}</span>
            </div>
            <h3 style={{
              margin: '0 0 8px', fontFamily: theme.displayFont,
              fontSize: 17, fontWeight: 600, lineHeight: 1.4, color: theme.ink,
              letterSpacing: 0.5,
            }}>{e.title}</h3>
            <p style={{
              margin: 0, fontSize: 13, lineHeight: 1.7, color: theme.inkMuted,
            }}>{e.excerpt}</p>
            <div style={{
              display: 'flex', gap: 14, marginTop: 14, fontSize: 11, color: theme.inkMuted,
              alignItems: 'center',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon.Heart size={13}/> {e.likes}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon.Message size={13}/> {e.replies}</span>
              <span style={{ marginLeft: 'auto', color: theme.accent, cursor: 'pointer' }}>阅读全文 →</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SCREEN 8 — 我的 (bonus)
// ═════════════════════════════════════════════════════════════
function MeScreen({ onOpenForm }) {
  const theme = useTheme();
  const stats = [
    ['我的收藏', 12], ['我解锁的', 3], ['查看我的', 47], ['等待回复', 5],
  ];
  const actions = [
    ['我的资料', Icon.Doc, onOpenForm],
    ['会员中心', Icon.Star, null],
    ['实名认证', Icon.Check, null],
    ['帮助反馈', Icon.Message, null],
    ['设置', Icon.User, null],
  ];
  return (
    <div style={{ minHeight: '100%', background: theme.bg, paddingBottom: 100,
      fontFamily: theme.bodyFont, color: theme.ink }}>
      <div style={{ background: theme.gradient, padding: '58px 20px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar initial="您" tone="ink" size={64} ring />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: theme.displayFont, fontSize: 19, fontWeight: 600, letterSpacing: 2 }}>寻缘号 53366922</div>
            <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Chip variant="default" size="sm">普通会员</Chip>
              <Chip variant="accent" size="sm"><Icon.Check size={10}/>&nbsp;已认证</Chip>
            </div>
          </div>
        </div>
        <div style={{
          marginTop: 22, background: 'rgba(255,255,255,0.6)',
          borderRadius: theme.radius, padding: '14px 4px',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          backdropFilter: 'blur(10px)',
        }}>
          {stats.map(([l, n]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: theme.monoFont, fontSize: 20, fontWeight: 600, color: theme.ink }}>{n}</div>
              <div style={{ fontSize: 10, color: theme.inkMuted, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          background: theme.accent, color: theme.accentInk, borderRadius: theme.radius,
          padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: theme.displayFont, fontSize: 16, fontWeight: 600, letterSpacing: 2 }}>升级会员</div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>解锁无限次联系 · 专属红娘服务</div>
          </div>
          <Button variant="dark" size="sm" style={{ background: 'rgba(0,0,0,0.3)' }}>立即升级</Button>
        </div>
        <div style={{
          background: theme.surface, borderRadius: theme.radius,
          border: `1px solid ${theme.line}`, overflow: 'hidden',
        }}>
          {actions.map(([label, IconC, click], i) => (
            <div key={label} onClick={click || undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '16px 18px', cursor: click ? 'pointer' : 'default',
                borderBottom: i < actions.length - 1 ? `0.5px solid ${theme.line}` : 'none',
              }}>
              <div style={{ color: theme.accent }}><IconC size={18} /></div>
              <span style={{ flex: 1, fontSize: 14, color: theme.ink }}>{label}</span>
              <span style={{ color: theme.inkFaint }}><Icon.Chevron size={12}/></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { FormScreen, MessagesScreen, ChatScreen, ShareScreen, MeScreen });
