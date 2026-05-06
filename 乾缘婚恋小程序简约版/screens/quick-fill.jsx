// Screen: 快速填写 — 3-step question wizard

function QuickFillScreen({ app }) {
  const { nav, state, setState } = app;
  const [step, setStep] = React.useState(1);
  const [sel, setSel] = React.useState({ 1: [], 2: ['有上进心'], 3: ['收入稳定'] });
  const D = window.APP_DATA;
  
  const questions = [
    { step: 1, title: '您的特点？', options: D.traits.slice(0,6), hint: '点击选择最符合的两个' },
    { step: 2, title: '您的相亲优势？', options: D.advantages.slice(0,6), hint: '点击选择最符合的两个' },
    { step: 3, title: '您对女方的要求？', options: D.requirements.slice(0,6), hint: '点击选择最符合的两个' },
  ];
  const cur = questions[step-1];
  
  const toggle = (o) => {
    const arr = sel[step] || [];
    const next = arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o].slice(-2);
    setSel({ ...sel, [step]: next });
  };
  
  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ padding: '4px 12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => step > 1 ? setStep(step-1) : nav.back()} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer' }}>
            <svg width="11" height="18" viewBox="0 0 11 18"><path d="M10,1 L2,9 L10,17" stroke="var(--ink)" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
          </button>
          <div style={{ flex: 1 }}/>
          <MPCapsule/>
        </div>
      </div>
      
      <div style={{ padding: '4px 22px 30px', overflow: 'auto', flex: 1 }}>
        <div style={{ fontSize: 21, fontWeight: 700, color: 'var(--ink)', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.4 }}>
          回答3个问题 快速帮您填写
        </div>
        
        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 22, padding: '0 10px' }}>
          {[1,2,3].map((s, i) => (
            <React.Fragment key={s}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 70 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: s === step ? 'var(--primary)' : s < step ? '#F4B3A0' : 'var(--surfaceAlt)',
                  color: s <= step ? '#fff' : 'var(--inkMuted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: s < step ? 16 : 14, fontWeight: 700,
                  border: s === step ? '3px solid var(--primarySoft)' : 'none',
                }}>
                  {s < step ? '✓' : s}
                </div>
                <div style={{ fontSize: 12.5, color: s === step ? 'var(--ink)' : 'var(--inkMuted)', fontWeight: s === step ? 600 : 400 }}>
                  {s === 1 ? '相亲特点' : s === 2 ? '相亲优势' : '对女方要求'}
                </div>
              </div>
              {i < 2 && <div style={{ flex: 1, height: 2, background: s < step ? '#F4B3A0' : 'var(--border)', marginTop: -16 }}/>}
            </React.Fragment>
          ))}
        </div>
        
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{step}.{cur.title}</div>
            <button style={{ background: 'none', border: 'none', color: '#3A7BC8', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>↻ 换一批</button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--inkMuted)', marginTop: 6 }}>{cur.hint}</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 22 }}>
            {cur.options.map(o => {
              const active = (sel[step] || []).includes(o);
              return (
                <button key={o} onClick={() => toggle(o)} style={{
                  padding: '18px 0', borderRadius: 8,
                  background: active ? 'var(--primary)' : 'var(--surfaceAlt)',
                  color: active ? '#fff' : 'var(--ink)',
                  border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                  boxShadow: active ? '0 4px 12px rgba(200,50,50,0.25)' : 'none'
                }}>{o}</button>
              );
            })}
          </div>
        </div>
      </div>
      
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 18px',
        background: 'var(--surface)', display: 'flex', gap: 12
      }}>
        {step > 1 && <button onClick={() => setStep(step-1)} style={{
          flex: 1, padding: '14px 0', background: 'var(--surface)', color: 'var(--ink)',
          border: '1.5px solid var(--border)', borderRadius: 100,
          fontSize: 15, fontWeight: 600, cursor: 'pointer'
        }}>上一步</button>}
        <button onClick={() => {
          if (step < 3) setStep(step+1);
          else { setState({ ...state, quickFillDone: true }); nav.back(); }
        }} style={{
          flex: step > 1 ? 1.4 : 1, padding: '14px 0',
          background: 'linear-gradient(90deg, #F4A23A, #ED7030)',
          color: '#fff', border: 'none', borderRadius: 100,
          fontSize: 16, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 6px 16px rgba(237,112,48,0.35)'
        }}>{step < 3 ? '下一步' : '完 成'}</button>
      </div>
    </div>
  );
}

Object.assign(window, { QuickFillScreen });
