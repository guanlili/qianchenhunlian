// Screen: 我的资料 — 用户自己的主页
// 数据完善度, 我的资料, 择偶要求 sections

function MyScreen({ app }) {
  const { nav, state } = app;
  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--primary)', paddingBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 10px' }}>
          <div style={{ width: 80 }}/>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', letterSpacing: 1 }}>相亲资料</div>
          <MPCapsule dark/>
        </div>
        
        {/* Official account banner */}
        <div style={{
          margin: '0 14px', padding: '10px 12px', background: 'rgba(255,255,255,0.96)',
          borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', background: '#F4A23A',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            fontSize: 14, fontWeight: 700, flexShrink: 0
          }}>!</div>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--inkSoft)' }}>关注公众号，可及时接收意向提醒</span>
          <button style={{
            background: 'linear-gradient(90deg, #F4A23A, #ED7030)', color: '#fff',
            border: 'none', borderRadius: 100, padding: '6px 12px', fontSize: 12.5, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer'
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 L14 8 L20 8 L15 12 L17 18 L12 14 L7 18 L9 12 L4 8 L10 8 Z"/></svg>
            立即关注
          </button>
        </div>
      </div>
      
      {/* Profile header card */}
      <div style={{
        margin: '-12px 14px 14px', background: 'var(--surface)', borderRadius: 14,
        padding: '18px 16px', border: '1px solid var(--border)',
        boxShadow: '0 4px 14px rgba(150,80,60,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <Avatar gender="男" size={60}/>
            <div style={{
              position: 'absolute', bottom: -4, left: -4, right: -4,
              background: 'var(--primarySoft)', color: 'var(--primary)',
              fontSize: 10, padding: '2px 0', borderRadius: 100, textAlign: 'center', fontWeight: 600
            }}>审核中</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, color: 'var(--ink)', fontWeight: 600 }}>寻缘号 53652255</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
              <Stat num="0" label="点赞"/>
              <Stat num="89" label="人气值"/>
              <Stat num="0" label="看过我"/>
            </div>
          </div>
        </div>
        
        {/* Feature tiles */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, position: 'relative' }}>
          <div style={{
            position: 'absolute', left: -10, top: -20,
            background: 'var(--primary)', color: '#fff',
            fontSize: 10.5, padding: '3px 9px', borderRadius: 100, fontWeight: 600
          }}>享更多资源</div>
          <FeatureTile icon="✦" label="真诚相亲" sub="未认证"/>
          <FeatureTile icon="⇡" label="优先推荐" sub="未开启" dot/>
          <FeatureTile icon="69%" label="资料完善度" sub="去修改 ›" highlight ring/>
        </div>
        
        <div style={{
          margin: '16px -16px -4px', padding: '10px 16px', background: 'var(--primarySoft)',
          display: 'flex', alignItems: 'center', gap: 8, borderRadius: '0 0 14px 14px'
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%', background: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            fontSize: 12, fontWeight: 700, flexShrink: 0
          }}>!</div>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--inkSoft)' }}>有嘉宾想了解您的家乡在哪，<span style={{ color: 'var(--primary)', fontWeight: 600 }}>去填写 ›</span></span>
        </div>
      </div>
      
      {/* My profile */}
      <div style={{ margin: '0 14px 14px', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--primary)"><path d="M5 3 h14 v18 l-7-4 l-7 4 z"/></svg>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>我的资料</span>
            <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--primarySoft)', color: 'var(--primary)', borderRadius: 4, fontWeight: 600 }}>审核中</span>
          </div>
          <button onClick={() => nav.go('profile-edit')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>编辑资料 ›</button>
        </div>
        <div style={{ padding: '12px 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', fontSize: 14 }}>
          <InfoRow label="性 别" value="男"/>
          <InfoRow label="年 份" value="1987年"/>
          <InfoRow label="身 高" value="161cm"/>
          <InfoRow label="学 历" value="大专"/>
          <InfoRow label="户籍地" value="淄博桓台县"/>
          <InfoRow label="居住地" value="北京东城区"/>
          <InfoRow label="家 乡" value="未填写"/>
          <InfoRow label="婚 姻" value="未婚"/>
          <InfoRow label="年收入" value="5-7万"/>
          <InfoRow label="是否有房" value="有婚房"/>
          <InfoRow label="是否有车" value="未填写"/>
          <InfoRow label="体 型" value="未填写"/>
        </div>
        <div style={{
          margin: '0 16px 14px', padding: '12px 14px', background: 'var(--primarySoft)',
          borderRadius: 8, fontSize: 13.5, color: 'var(--inkSoft)', lineHeight: 1.65
        }}>
          我性格幽默、有上进心。想找一个收入稳定的女性。欢迎有诚意的女方联系我们，希望我们能在这里找到缘分，谢谢！
        </div>
      </div>
      
      {/* Partner preferences */}
      <div style={{ margin: '0 14px 14px', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--primary)"><path d="M12 21 s-7-4.5-7-10 a5 5 0 0 1 9-3 a5 5 0 0 1 9 3 c0 5.5-7 10-7 10z"/></svg>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>择偶要求</span>
          </div>
          <button onClick={() => nav.go('criteria-edit')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>编辑资料 ›</button>
        </div>
        <div style={{ marginTop: 10 }}>
          <PrefRow label="年 份" value="1987年-1992年"/>
          <PrefRow label="身 高" value="140cm-156cm"/>
          <PrefRow label="年收入" value="30-50万"/>
          <PrefRow label="是否有房" value="有购房计划"/>
          <PrefRow label="学历要求" value="小学/初中 至 大专"/>
          <PrefRow label="婚姻要求" value="不限"/>
          <PrefRow label="户籍地要求" value="北京-北京-东城区"/>
        </div>
      </div>
      
      {/* Bottom sticky */}
      <div style={{ padding: '0 14px 20px', display: 'flex', gap: 10 }}>
        <button onClick={() => nav.go('profile-edit')} style={{
          flex: 1, background: 'var(--surface)', color: 'var(--primary)',
          border: '1.5px solid var(--primary)', borderRadius: 100, padding: '12px 0',
          fontSize: 14.5, fontWeight: 600, cursor: 'pointer'
        }}>修改资料</button>
        <button style={{
          flex: 1.5, background: 'var(--primary)', color: '#fff',
          border: 'none', borderRadius: 100, padding: '12px 0',
          fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 6px 16px rgba(200,50,50,0.3)'
        }}>分享到群或好友 ›</button>
      </div>
    </div>
  );
}

function Stat({ num, label }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', fontFamily: '"Noto Serif SC", serif' }}>{num}</div>
      <div style={{ fontSize: 12, color: 'var(--inkMuted)' }}>{label}</div>
    </div>
  );
}

function FeatureTile({ icon, label, sub, dot, highlight, ring }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
      {dot && <div style={{ position: 'absolute', top: 2, right: '30%', width: 6, height: 6, background: 'var(--primary)', borderRadius: '50%' }}/>}
      <div style={{
        width: 46, height: 46, margin: '0 auto',
        borderRadius: '50%',
        background: ring ? 'conic-gradient(var(--primary) 0 69%, var(--border) 69% 100%)' : 'var(--primarySoft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: highlight ? 14 : 20, fontWeight: 700, color: 'var(--primary)',
        position: 'relative'
      }}>
        {ring && <div style={{ position: 'absolute', inset: 4, background: 'var(--surface)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{icon}</div>}
        {!ring && icon}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginTop: 6 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--inkMuted)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

Object.assign(window, { MyScreen });
