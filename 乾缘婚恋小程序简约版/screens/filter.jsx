// Screen: 筛选 8-step wizard

function FilterScreen({ app }) {
  const { nav } = app;
  const [step, setStep] = React.useState(4);
  const [data, setData] = React.useState({});
  
  const steps = [
    { k: 'gender', title: '性别', highlight: '性别' },
    { k: 'age', title: '年份', highlight: '年份' },
    { k: 'marriage', title: '婚姻', highlight: '婚姻' },
    { k: 'height', title: '身高', highlight: '身高' },
    { k: 'edu', title: '学历', highlight: '学历' },
    { k: 'income', title: '年收入', highlight: '年收入' },
    { k: 'region', title: '户籍地', highlight: '户籍地' },
    { k: 'job', title: '职业', highlight: '职业' }
  ];
  const cur = steps[step-1];
  
  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ padding: '4px 12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => step > 1 ? setStep(step-1) : nav.back()} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer' }}>
            <svg width="11" height="18" viewBox="0 0 11 18"><path d="M10,1 L2,9 L10,17" stroke="var(--ink)" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
          </button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>乾缘婚恋</div>
          <MPCapsule/>
        </div>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 100px' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', fontFamily: '"Noto Serif SC", serif' }}>
          相亲者的<span style={{ color: 'var(--primary)' }}>{cur.highlight}</span>
          <span style={{ fontSize: 16, color: 'var(--inkMuted)', fontWeight: 400 }}> ({step}/8)</span>
        </div>
        
        <div style={{ marginTop: 22 }}>
          {cur.k === 'height' && <HeightSections/>}
          {cur.k === 'region' && <RegionSection/>}
          {cur.k === 'job' && <JobSection/>}
          {(cur.k === 'gender') && (
            <OptionList opts={['不限','男','女']}/>
          )}
          {(cur.k === 'marriage') && (
            <OptionList opts={['不限','未婚','离异未育','离异已育']}/>
          )}
          {(cur.k === 'edu') && (
            <OptionList opts={window.APP_DATA.eduOptions}/>
          )}
          {(cur.k === 'income') && (
            <OptionGrid opts={window.APP_DATA.incomeOptions}/>
          )}
          {(cur.k === 'age') && (
            <OptionGrid opts={['不限','70后','80后','85后','90后','95后','00后']}/>
          )}
        </div>
      </div>
      
      {step < 8 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 36, textAlign: 'center', paddingBottom: 12 }}>
          <a style={{ color: 'var(--inkSoft)', fontSize: 14, textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setStep(step+1)}>跳过选择</a>
        </div>
      )}
      
      {step === 8 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px' }}>
          <button onClick={() => nav.go('home')} style={{
            width: '100%', padding: '15px 0', background: 'linear-gradient(90deg, #F4A23A, #ED7030)',
            color: '#fff', border: 'none', borderRadius: 100,
            fontSize: 17, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(237,112,48,0.35)'
          }}>完 成</button>
        </div>
      )}
      {step < 8 && (
        <div style={{ position: 'absolute', right: 20, bottom: 80 }}>
          <button onClick={() => setStep(step+1)} style={{
            padding: '10px 24px', background: 'var(--primary)', color: '#fff',
            border: 'none', borderRadius: 100, fontSize: 14, fontWeight: 600, cursor: 'pointer'
          }}>下一步 ›</button>
        </div>
      )}
    </div>
  );
}

function Chip({ label, active }) {
  return (
    <div style={{
      padding: '10px 0', textAlign: 'center',
      background: active ? 'var(--primary)' : 'var(--surfaceAlt)',
      color: active ? '#fff' : 'var(--ink)',
      borderRadius: 8, fontSize: 14.5, fontWeight: 500, cursor: 'pointer'
    }}>{label}</div>
  );
}

function OptionList({ opts }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {opts.map((o, i) => <Chip key={o} label={o} active={i === 1}/>)}
    </div>
  );
}

function OptionGrid({ opts }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {opts.map((o, i) => <Chip key={o} label={o} active={i === 2}/>)}
    </div>
  );
}

function HeightSections() {
  const ranges = [
    { label: '140-', opts: ['140以下'] },
    { label: '140+', opts: ['140','141','142','143','144','145','146','147','148','149'] },
    { label: '150+', opts: ['150','151','152','153','154','155','156','157','158','159'] },
    { label: '160+', opts: ['160','161','162','163','164','165','166','167','168','169'] },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {ranges.map(r => (
        <div key={r.label}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>{r.label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {r.opts.map(o => <div key={o} style={{
              padding: '10px 0', textAlign: 'center', background: 'var(--surfaceAlt)',
              borderRadius: 100, fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer'
            }}>{o}</div>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function RegionSection() {
  const regions = window.APP_DATA.regions['北京'];
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
        <span style={{ color: 'var(--primary)' }}>北京</span> <span style={{ color: 'var(--ink)' }}>所属区/县</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {regions.map(r => <div key={r} style={{
          padding: '10px 0', textAlign: 'center', background: 'var(--surfaceAlt)',
          borderRadius: 6, fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer'
        }}>{r}</div>)}
      </div>
    </div>
  );
}

function JobSection() {
  return (
    <div>
      <div style={{
        background: 'var(--surfaceAlt)', borderRadius: 8, padding: '14px 16px',
        fontSize: 15, color: 'var(--inkMuted)', marginBottom: 18
      }}>请输入相亲者职业</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>热门职业</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {window.APP_DATA.jobOptions.map(j => <div key={j} style={{
          padding: '7px 14px', background: 'var(--surfaceAlt)', borderRadius: 100,
          fontSize: 13, color: 'var(--ink)', cursor: 'pointer',
          border: '1px solid var(--border)'
        }}>{j}</div>)}
      </div>
    </div>
  );
}

Object.assign(window, { FilterScreen });
