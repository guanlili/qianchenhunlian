// Screen: 相亲资料详情 — 查看对方资料页

function DetailScreen({ app, profileId }) {
  const { nav, profiles } = app;
  const idx = profiles.findIndex(p => p.id === profileId);
  const p = profiles[idx] || profiles[0];
  const [showBanner, setShowBanner] = React.useState(true);
  const [unlocked, setUnlocked] = React.useState(false);
  
  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Red header */}
      <div style={{ background: 'var(--primary)', paddingBottom: 16 }}>
        <MPHeader subtitle="相亲资料" onBack={() => nav.back()} onHome={() => nav.go('home')}/>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 90 }}>
        {/* Main profile card */}
        <div style={{
          background: 'var(--surface)', padding: '20px 18px', marginTop: -8,
          borderRadius: '20px 20px 0 0', position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar gender={p.gender} size={60}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, color: 'var(--inkSoft)', fontFamily: 'ui-monospace, monospace' }}>寻缘号 {p.id}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, color: 'var(--inkSoft)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#F4A23A"><path d="M12 2 L14.5 8 L21 9 L16 13.5 L17.5 20 L12 16.5 L6.5 20 L8 13.5 L3 9 L9.5 8 Z"/></svg>
                  {p.likes}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, color: 'var(--inkSoft)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--primary)"><path d="M12 2 C8 6 6 9 6 13 a6 6 0 0 0 12 0 c0-2-1-4-2-5 c-1 3-3 4-4 2 c0-4 2-5 0-8z"/></svg>
                  {p.hot}
                </span>
              </div>
            </div>
            <button style={{
              background: 'var(--primarySoft)', color: 'var(--primary)',
              border: 'none', padding: '6px 12px', borderRadius: 100,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M10 5 L10 9 C3 9 2 14 2 18 C4 14 6 13 10 13 L10 17 L18 11 Z"/></svg>
              转发资料
            </button>
          </div>
          
          {/* Action row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
            <button style={actionBtn()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.8"><path d="M12 3 L15 10 L22 11 L17 15 L18 22 L12 18 L6 22 L7 15 L2 11 L9 10 Z"/></svg>
              <span style={{ fontSize: 11.5, color: 'var(--inkSoft)' }}>收藏</span>
            </button>
            <button onClick={() => setUnlocked(true)} style={{
              flex: 1, background: 'var(--surface)', color: 'var(--primary)',
              border: '1.5px solid var(--primary)', borderRadius: 100, padding: '10px 0',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 10 V7 a6 6 0 0 1 12 0 M5 10 h14 v12 h-14 z"/></svg>
              {unlocked ? '已解锁' : '解锁对方'}
            </button>
            <button style={{
              flex: 1.2, background: 'var(--primary)', color: '#fff',
              border: 'none', borderRadius: 100, padding: '10px 0',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: '0 6px 16px rgba(200,50,50,0.3)'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4 L4 4 L4 17 L7 17 L7 20 L11 17 L20 17 Z"/></svg>
              查看联系方式
            </button>
          </div>
        </div>
        
        {/* Basic info block */}
        <InfoBlock>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
            <InfoRow label="年 份" value={p.year + '年'}/>
            <InfoRow label="性 别" value={p.gender}/>
            <InfoRow label="学 历" value={p.edu}/>
            <InfoRow label="身 高" value={p.height + 'cm'}/>
            <InfoRow label="户 籍" value={p.origin}/>
            <InfoRow label="居 住" value={p.location}/>
            <InfoRow label="职 业" value={p.job} span/>
          </div>
        </InfoBlock>
        
        {/* More details */}
        <SectionTitle>更多详情</SectionTitle>
        <InfoBlock>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
            <InfoRow label="家 乡" value={p.hometown}/>
            <InfoRow label="婚 姻" value={p.marriage}/>
            <InfoRow label="年收入" value={p.income}/>
            <InfoRow label="是否有房" value={p.hasHouse}/>
            <InfoRow label="体 型" value={p.bodyType}/>
          </div>
          <div style={{
            background: 'var(--surfaceAlt)', borderRadius: 8, padding: '12px 14px', marginTop: 14,
            fontSize: 13.5, color: 'var(--inkSoft)', lineHeight: 1.7,
          }}>{p.desc}</div>
        </InfoBlock>
        
        {/* Partner preference */}
        <SectionTitle>择偶要求</SectionTitle>
        <InfoBlock>
          <PrefRow label="年 份" value={p.wants.year + '年'}/>
          <PrefRow label="年收入" value={p.wants.income}/>
          <PrefRow label="身 高" value={p.wants.height + 'cm'}/>
          <PrefRow label="婚 房" value={p.wants.house}/>
          <PrefRow label="学历要求" value={p.wants.edu}/>
          <PrefRow label="婚姻要求" value={p.wants.marriage}/>
          <PrefRow label="户籍地要求" value={p.wants.origin}/>
          <PrefRow label="居住地要求" value={p.wants.location}/>
        </InfoBlock>
        
        <div style={{ height: 30 }}/>
      </div>
      
      {/* Generate my profile floating button */}
      <div style={{
        position: 'absolute', right: 0, top: 300,
        background: 'linear-gradient(135deg, #F4A23A, #ED7030)', color: '#fff',
        padding: '10px 12px', fontSize: 12, fontWeight: 600,
        borderRadius: '100px 0 0 100px', boxShadow: '0 4px 12px rgba(237,112,48,0.3)',
        textAlign: 'center', lineHeight: 1.3, cursor: 'pointer',
      }} onClick={() => nav.go('profile-edit')}>
        生成我<br/>的资料
      </div>
      
      {/* Ephemeral "expires tomorrow" toast */}
      {showBanner && (
        <div style={{
          position: 'absolute', left: 14, right: 14, bottom: 140,
          background: 'rgba(40,25,20,0.88)', color: '#fff', padding: '12px 16px',
          borderRadius: 10, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 10,
          backdropFilter: 'blur(4px)'
        }}>
          <span style={{ flex: 1, lineHeight: 1.5 }}>觉得合适请尽快查看，明天将无法看到对方资料</span>
          <button onClick={() => setShowBanner(false)} style={{ background: 'none', border: 'none', color: '#fff', opacity: 0.7, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
      )}
      
      {/* Bottom sticky actions */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 50,
        background: 'var(--surface)', padding: '10px 14px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderTop: '1px solid var(--border)',
      }}>
        <button onClick={() => nav.go('home')} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--primary)"><path d="M12 3 L3 11 h3 v9 h5 v-6 h2 v6 h5 v-9 h3 Z"/></svg>
          <span style={{ fontSize: 11, color: 'var(--ink)' }}>回首页</span>
        </button>
        <button style={{
          flex: 1, background: 'var(--surface)', color: 'var(--primary)',
          border: '1.5px solid var(--primary)', borderRadius: 100, padding: '11px 0',
          fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5 h18 v13 h-10 l-4 3 v-3 h-4 z"/></svg>
          发消息
        </button>
        <button style={{
          flex: 1.3, background: 'var(--primary)', color: '#fff',
          border: 'none', borderRadius: 100, padding: '11px 0',
          fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          boxShadow: '0 6px 16px rgba(200,50,50,0.3)'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 15 l-3-3 l-4 1 c-3-1-5-3-6-6 l1-4 l-3-3 c-2 1-3 3-3 5 c0 9 7 16 16 16 c2 0 4-1 5-3 z"/></svg>
          查看联系方式
        </button>
      </div>
      
      {/* Prev/Next bar */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: 50, background: '#D8D8D8', display: 'flex', alignItems: 'center',
        fontSize: 14, fontWeight: 600, color: 'var(--inkSoft)',
      }}>
        <button onClick={() => { if (idx > 0) nav.go('detail', profiles[idx-1].id); }} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 'inherit'
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="12" r="10"/><path d="M14 8 L10 12 L14 16" stroke="#999" strokeWidth="2" fill="none"/></svg>
          上一个
        </button>
        <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.15)' }}/>
        <button onClick={() => { if (idx < profiles.length-1) nav.go('detail', profiles[idx+1].id); }} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 'inherit'
        }}>
          下一个
          <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--primary)"><circle cx="12" cy="12" r="10"/><path d="M10 8 L14 12 L10 16" stroke="#fff" strokeWidth="2" fill="none"/></svg>
        </button>
      </div>
    </div>
  );
}

function actionBtn() {
  return {
    background: 'none', border: 'none', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 4px'
  };
}

function SectionTitle({ children }) {
  return (
    <div style={{ padding: '18px 18px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 3, height: 16, background: 'var(--primary)', borderRadius: 2 }}/>
      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{children}</span>
    </div>
  );
}

function InfoBlock({ children }) {
  return (
    <div style={{ background: 'var(--surface)', margin: '0 14px', borderRadius: 12, padding: '16px 18px', border: '1px solid var(--border)' }}>
      {children}
    </div>
  );
}

function InfoRow({ label, value, span }) {
  return (
    <div style={{ display: 'flex', gap: 10, gridColumn: span ? '1 / -1' : 'auto' }}>
      <span style={{ color: 'var(--inkMuted)', fontSize: 14, letterSpacing: 2, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--ink)', fontSize: 14.5, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function PrefRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', fontSize: 14.5 }}>
      <span style={{ color: 'var(--inkMuted)', letterSpacing: 1, width: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

Object.assign(window, { DetailScreen });
