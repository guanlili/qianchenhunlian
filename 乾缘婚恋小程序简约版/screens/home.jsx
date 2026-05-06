// Screen: 每日推荐 — the home screen
// Matches functionality: 筛选 top bar, notification banner, quick-access tiles,
// 今日推荐/看看新人/错过的人 tabs, relation prompt, profile cards

function HomeScreen({ app }) {
  const { nav, profiles, state, setState } = app;
  const [tab, setTab] = React.useState('today');
  
  return (
    <div className="home-screen" style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
      {/* Red header with 筛选 + title */}
      <div style={{
        background: 'var(--headerGrad)',
        backgroundImage: 'var(--headerGrad), var(--headerOverlay)',
        padding: '0 0 18px', position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 4px' }}>
          <button onClick={() => nav.go('filter')} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 15, fontWeight: 500, padding: 6
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M3 5 h18 M6 12 h12 M10 19 h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
            筛选
          </button>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', letterSpacing: 1 }}>每日推荐</div>
          <div style={{ opacity: 0.001 }}><MPCapsule dark /></div>
        </div>
        
        {/* Notification banner */}
        <div style={{
          margin: '10px 14px 0', padding: '14px 14px', background: 'rgba(255,255,255,0.96)',
          borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 6px 18px rgba(100,20,20,0.12)'
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'var(--primarySoft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--primary)', fontFamily: '"Noto Serif SC", serif', fontWeight: 700, fontSize: 13, lineHeight: 1,
          }}>
            <div style={{ textAlign: 'center' }}>寻<br/>缘</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>您还未开启每日推荐通知</div>
            <div style={{ fontSize: 12, color: 'var(--inkMuted)', marginTop: 2 }}>开启后每日为您推送精准匹配</div>
          </div>
          <button style={{
            background: 'linear-gradient(90deg, #F4A23A, #ED7030)', color: '#fff',
            border: 'none', borderRadius: 100, padding: '8px 14px', fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap'
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 L14 8 L20 8 L15 12 L17 18 L12 14 L7 18 L9 12 L4 8 L10 8 Z"/></svg>
            去开启
          </button>
        </div>
      </div>
      
      {/* Quick tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 14px 0' }}>
        <QuickTile icon="eye" label="查看过我的" sub="0人查看过你" color="var(--primarySoft)" textColor="var(--primaryDeep)"/>
        <QuickTile icon="heart" label="收藏的人" sub="暂无收藏" color="#E8F0FA" textColor="#3A5B8A"/>
      </div>
      
      {/* Tab pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 14px 8px' }}>
        <button onClick={() => setTab('today')} style={pillStyle(tab === 'today')}>今日推荐</button>
        <button onClick={() => setTab('new')} style={pillStyle(tab === 'new')}>
          看看新人
          <span style={{
            position: 'absolute', top: -6, right: -6,
            background: 'linear-gradient(90deg, #F4A23A, #ED7030)', color: '#fff',
            fontSize: 10, padding: '1px 5px', borderRadius: 100, fontWeight: 600
          }}>新</span>
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setTab('missed')} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          color: 'var(--inkSoft)', fontSize: 12,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 21s-7-4.5-7-10a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5.5-7 10-7 10" stroke="var(--primary)" strokeWidth="1.8"/>
          </svg>
          <span>错过的人›</span>
        </button>
      </div>
      
      {/* Relation prompt card (only if not set) */}
      {!state.relation && (
        <RelationPrompt onSelect={(r) => setState({ ...state, relation: r })} />
      )}
      
      {/* Notification row for push toggle */}
      <div style={{
        margin: '0 14px 14px', padding: '12px 14px', background: 'var(--surface)',
        borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12,
        border: '1px solid var(--border)'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>未开启每日推荐通知</div>
          <div style={{ fontSize: 12, color: 'var(--inkMuted)', marginTop: 2 }}>每日上午10点更新</div>
        </div>
        <div style={{
          width: 44, height: 24, borderRadius: 100, background: '#E6DED0', position: 'relative',
        }}>
          <div style={{ position: 'absolute', left: 2, top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </div>
      </div>
      
      {/* Profile cards */}
      <div style={{ padding: '0 14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {profiles.map(p => <ProfileCard key={p.id} profile={p} onView={() => nav.go('detail', p.id)} onContact={() => nav.go('detail', p.id)}/>)}
      </div>
      
      {/* Floating action: 填写相亲资料 */}
      <div style={{
        position: 'absolute', right: 0, bottom: 86,
        background: 'linear-gradient(135deg, #F4A23A, #ED7030)',
        color: '#fff', padding: '10px 12px 10px 14px', fontSize: 12.5, fontWeight: 600,
        borderRadius: '100px 0 0 100px', boxShadow: '0 6px 16px rgba(237,112,48,0.4)',
        textAlign: 'center', lineHeight: 1.3, cursor: 'pointer', zIndex: 5,
      }} onClick={() => nav.go('profile-edit')}>
        填写相<br/>亲资料
      </div>
    </div>
  );
}

function pillStyle(active) {
  return {
    background: active ? 'var(--primary)' : 'var(--surface)',
    color: active ? '#fff' : 'var(--inkSoft)',
    border: active ? 'none' : '1px solid var(--border)',
    borderRadius: 100, padding: '8px 18px',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    position: 'relative', display: 'flex', alignItems: 'center', gap: 4
  };
}

function QuickTile({ icon, label, sub, color, textColor }) {
  const iconSvg = icon === 'eye' ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" stroke={textColor} strokeWidth="1.8"/>
      <circle cx="12" cy="12" r="3" fill={textColor}/>
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 21s-7-4.5-7-10a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5.5-7 10-7 10" stroke={textColor} strokeWidth="1.8"/>
    </svg>
  );
  return (
    <div style={{
      background: color, borderRadius: 14, padding: '14px 14px',
      display: 'flex', alignItems: 'center', gap: 12
    }}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {iconSvg}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: textColor }}>{label}</div>
        <div style={{ fontSize: 11.5, color: textColor, opacity: 0.7, marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
}

function RelationPrompt({ onSelect }) {
  return (
    <div style={{
      margin: '6px 14px 14px', padding: '20px 16px 22px',
      background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)',
      boxShadow: '0 4px 14px rgba(150,80,60,0.06)'
    }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', textAlign: 'center', fontFamily: '"Noto Serif SC", serif' }}>
        请问您和相亲者的关系是？
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--inkMuted)', textAlign: 'center', marginTop: 6 }}>填写后为你精准推荐</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
        {['父母','本人','朋友','亲戚'].map(r => (
          <button key={r} onClick={() => onSelect(r)} style={{
            background: 'var(--surface)', color: 'var(--primary)',
            border: '1.5px solid var(--primary)', borderRadius: 100,
            padding: '12px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer'
          }}>{r}</button>
        ))}
      </div>
    </div>
  );
}

function ProfileCard({ profile, onView, onContact }) {
  const p = profile;
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, padding: '14px 14px 12px',
      border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(150,80,60,0.04)',
      position: 'relative'
    }}>
      <div style={{
        position: 'absolute', top: 10, left: 10,
        fontSize: 11, color: 'var(--accent)', fontFamily: 'ui-monospace, monospace',
        background: 'var(--surfaceAlt)', padding: '2px 8px', borderRadius: 4,
      }}>寻缘号 {p.id}</div>
      <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Avatar gender={p.gender} size={60}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)', fontFamily: '"Noto Serif SC", serif' }}>
            {p.gender} · {p.year}年
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginTop: 8, fontSize: 13.5 }}>
            <InfoItem label="居住" value={p.location}/>
            <InfoItem label="户籍" value={p.origin}/>
            <InfoItem label="学历" value={p.edu}/>
            <InfoItem label="身高" value={p.height + 'cm'}/>
          </div>
        </div>
      </div>
      <div style={{
        background: 'var(--surfaceAlt)', borderRadius: 8, padding: '10px 12px', marginTop: 12,
        fontSize: 13, color: 'var(--inkSoft)', lineHeight: 1.55
      }}>
        <span style={{ color: 'var(--inkMuted)' }}>介绍：</span>
        {p.desc.length > 55 ? p.desc.slice(0, 55) + '...' : p.desc}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button onClick={onContact} style={{
          flex: 1, background: 'var(--surface)', color: 'var(--primary)',
          border: '1.5px solid var(--primary)', borderRadius: 100,
          padding: '10px 0', fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
        }}>联系对方</button>
        <button onClick={onView} style={{
          flex: 1, background: 'var(--primary)', color: '#fff',
          border: 'none', borderRadius: 100,
          padding: '10px 0', fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 4px 10px rgba(200,50,50,0.25)'
        }}>查看资料</button>
      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <span style={{ color: 'var(--inkMuted)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

Object.assign(window, { HomeScreen });
