// Screen: 择偶标准 — 编辑择偶要求

function CriteriaEditScreen({ app }) {
  const { nav, state, setState } = app;
  const [openPicker, setOpenPicker] = React.useState(null);
  const [regions, setRegions] = React.useState(state.wantsOrigin || ['北京-北京-东城区']);
  
  const D = window.APP_DATA;
  const fields = [
    { k: 'year', label: '年份要求', value: state.wantsYear || '1987年-1992年', kind: 'range', rangeKind: 'year' },
    { k: 'height', label: '身高要求', value: state.wantsHeight || '140cm-156cm', kind: 'range', rangeKind: 'height' },
    { k: 'edu', label: '学历要求', value: state.wantsEdu || '小学/初中 至 大专', kind: 'multi', options: D.eduOptions },
    { k: 'income', label: '年收入要求', value: state.wantsIncome || '30-50万', kind: 'multi', options: D.incomeOptions },
    { k: 'house', label: '婚房要求', value: state.wantsHouse || '有购房计划', kind: 'single', options: D.houseOptions },
    { k: 'marriage', label: '婚姻要求', value: state.wantsMarriage || '不限', kind: 'single', options: D.marriageOptions },
  ];
  
  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--headerGrad)', backgroundImage: 'var(--headerGrad), var(--headerOverlay)' }}>
        <MPHeader subtitle="择偶要求" onBack={() => nav.back()} onHome={() => nav.go('home')}/>
        <div style={{ padding: '18px 20px 28px', color: '#fff' }}>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 4, textAlign: 'center', fontFamily: '"Noto Serif SC", serif' }}>择偶标准</div>
        </div>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80, marginTop: -16 }}>
        <div style={{ background: 'var(--surface)', margin: '0 14px', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>资料完善度：</span>
            <span style={{ color: 'var(--inkSoft)' }}>完善度越高，相亲成功率越高</span>
          </div>
          <div style={{ marginTop: 10, height: 10, background: 'var(--surfaceAlt)', borderRadius: 100, overflow: 'hidden', position: 'relative' }}>
            <div style={{ width: '51%', height: '100%', background: 'linear-gradient(90deg, #F4A0A0, var(--primary))' }}/>
            <div style={{ position: 'absolute', right: 12, top: -4, fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>51%</div>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--inkSoft)' }}><span style={{ color: '#ED7030' }}>🔥</span> 资料越完整，越快找到有缘人</div>
        </div>
        
        {/* Residence */}
        <div style={{ background: 'var(--surface)', margin: '14px 14px 0', borderRadius: 14, border: '1px solid var(--border)', padding: '14px 16px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>居住地要求</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {regions.map((r, i) => (
              <div key={i} style={{
                padding: '6px 14px', border: '1px solid var(--primary)',
                borderRadius: 100, color: 'var(--primary)', fontSize: 13, fontWeight: 600
              }}>{r}</div>
            ))}
            <button onClick={() => setOpenPicker({ k: 'region', label: '对女方的居住地要求' })} style={{
              padding: '6px 12px', background: 'none', color: 'var(--primary)',
              border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 3
            }}>
              <span style={{ fontSize: 16 }}>⊕</span> 添加
            </button>
          </div>
        </div>
        
        {/* Fields list */}
        <div style={{ background: 'var(--surface)', margin: '14px 14px 0', borderRadius: 14, border: '1px solid var(--border)' }}>
          <FieldRow label="户籍地要求" value={regions[0] ? regions[0].split('-')[0] + '-' + regions[0].split('-')[1] + '-...' : '不限'} onClick={() => setOpenPicker({ k: 'hometownReq', label: '对女方的户籍地要求' })}/>
          {fields.map(f => (
            <FieldRow key={f.k} label={f.label} value={f.value} onClick={() => setOpenPicker({ ...f, label: '对女方的' + f.label })}/>
          ))}
        </div>
        
        {/* More description */}
        <div style={{ background: 'var(--surface)', margin: '14px 14px 0', borderRadius: 14, border: '1px solid var(--border)', padding: '16px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>更多择偶要求说明</div>
          <textarea
            placeholder="请补充更多择偶要求：例如期望对方的性格、爱好、为人等。（注意：此处不要留联系方式。否则会导致资料审核不通过。）"
            style={{
              width: '100%', minHeight: 80, padding: '12px 14px',
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--surfaceAlt)', color: 'var(--ink)',
              fontSize: 13.5, lineHeight: 1.65, resize: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none'
            }}
          />
        </div>
        <div style={{ height: 30 }}/>
      </div>
      
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 14px 14px',
        background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', gap: 10
      }}>
        <button onClick={() => nav.back()} style={{
          flex: 1, background: 'var(--primarySoft)', color: 'var(--primary)',
          border: 'none', borderRadius: 100, padding: '12px 0',
          fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: 0.6
        }}>暂不填写</button>
        <button onClick={() => nav.back()} style={{
          flex: 1.3, background: 'var(--primary)', color: '#fff',
          border: 'none', borderRadius: 100, padding: '12px 0',
          fontSize: 15, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 6px 16px rgba(200,50,50,0.3)'
        }}>保存</button>
      </div>
      
      {openPicker && (
        <PickerSheet
          picker={openPicker}
          onClose={() => setOpenPicker(null)}
          onSave={(val) => {
            const k = 'wants' + openPicker.k.charAt(0).toUpperCase() + openPicker.k.slice(1);
            setState({ ...state, [k]: val });
            setOpenPicker(null);
          }}
        />
      )}
    </div>
  );
}

function FieldRow({ label, value, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '15px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer'
    }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--inkSoft)', fontSize: 14 }}>
        {value}
        <svg width="8" height="12" viewBox="0 0 8 12" fill="none"><path d="M1 1 L6 6 L1 11" stroke="var(--inkMuted)" strokeWidth="1.5"/></svg>
      </span>
    </div>
  );
}

function PickerSheet({ picker, onClose, onSave }) {
  const [sel, setSel] = React.useState(picker.value);
  const [multiSel, setMultiSel] = React.useState(
    picker.kind === 'multi' && typeof picker.value === 'string' ? [picker.value] : (picker.value || [])
  );
  
  let body;
  if (picker.kind === 'range' && picker.rangeKind === 'year') {
    body = <WheelRange from="1982年" to="1992年" fromOpts={range(1970, 2005).map(y => y + '年')} toOpts={range(1970, 2005).map(y => y + '年')}/>;
  } else if (picker.kind === 'range' && picker.rangeKind === 'height') {
    body = <WheelRange from="140cm" to="156cm" fromOpts={range(140, 199).map(h => h + 'cm')} toOpts={range(140, 199).map(h => h + 'cm')} extraTop="不限"/>;
  } else if (picker.kind === 'multi') {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '6px 0 16px' }}>
        {picker.options.map(o => {
          const active = multiSel.includes(o);
          return <button key={o} onClick={() => setMultiSel(active ? multiSel.filter(x => x !== o) : [...multiSel, o])} style={{
            padding: '14px 0', borderRadius: 8,
            background: active ? 'var(--primary)' : 'var(--surfaceAlt)',
            color: active ? '#fff' : 'var(--ink)',
            border: 'none', fontSize: 14.5, fontWeight: 600, cursor: 'pointer'
          }}>{o}</button>;
        })}
      </div>
    );
  } else if (picker.kind === 'single') {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '6px 0 16px' }}>
        {picker.options.map(o => (
          <button key={o} onClick={() => setSel(o)} style={{
            padding: '14px 0', borderRadius: 8,
            background: sel === o ? 'var(--primary)' : 'var(--surfaceAlt)',
            color: sel === o ? '#fff' : 'var(--ink)',
            border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer'
          }}>{o}</button>
        ))}
      </div>
    );
  } else if (picker.k === 'region' || picker.k === 'hometownReq') {
    body = <RegionPicker/>;
  } else {
    body = <div style={{ padding: 20, color: 'var(--inkMuted)' }}>暂无选项</div>;
  }
  
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '18px 18px 20px',
        maxHeight: '75%', overflow: 'auto', position: 'relative'
      }}>
        <button onClick={onClose} style={{ position: 'absolute', right: 14, top: 14, background: 'none', border: 'none', fontSize: 20, color: 'var(--inkMuted)', cursor: 'pointer' }}>✕</button>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: '"Noto Serif SC", serif' }}>
            对<span style={{ color: 'var(--primary)' }}>女方的</span>{picker.label.replace('对女方的', '')}
          </div>
          {picker.kind === 'multi' && <div style={{ color: 'var(--primary)', fontSize: 13, marginTop: 4 }}>可以多选</div>}
          {picker.kind === 'range' && <div style={{ color: 'var(--primary)', fontSize: 14, marginTop: 4, fontWeight: 600 }}>
            {picker.rangeKind === 'year' ? '1987年 - 1992年' : '140cm - 156cm'}
          </div>}
        </div>
        {body}
        <button onClick={() => onSave(picker.kind === 'multi' ? multiSel.join('、') : sel)} style={{
          width: '100%', padding: '14px 0', background: 'var(--primary)', color: '#fff',
          border: 'none', borderRadius: 100, fontSize: 15, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 6px 16px rgba(200,50,50,0.3)'
        }}>确 定</button>
      </div>
    </div>
  );
}

function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }

function WheelRange({ fromOpts, toOpts, extraTop }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: '10px 0 18px', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 38, borderTop: '1px solid var(--primarySoft)', borderBottom: '1px solid var(--primarySoft)', pointerEvents: 'none' }}/>
      <WheelCol opts={[...(extraTop ? [extraTop] : []), ...fromOpts]} highlight={extraTop ? fromOpts[0] : fromOpts[10]}/>
      <WheelCol opts={toOpts} highlight={toOpts[16]}/>
    </div>
  );
}

function WheelCol({ opts, highlight }) {
  const idx = opts.indexOf(highlight);
  const visible = opts.slice(Math.max(0, idx - 3), idx + 4);
  return (
    <div style={{ height: 180, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {visible.map((o, i) => {
        const dist = Math.abs(i - 3);
        return (
          <div key={i} style={{
            height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: o === highlight ? 18 : 15, fontWeight: o === highlight ? 700 : 400,
            color: o === highlight ? 'var(--ink)' : 'var(--inkMuted)',
            opacity: o === highlight ? 1 : Math.max(0.2, 1 - dist * 0.25),
            width: '100%'
          }}>{o}</div>
        );
      })}
    </div>
  );
}

function RegionPicker() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, padding: '10px 0 18px', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 38, borderTop: '1px solid var(--primarySoft)', borderBottom: '1px solid var(--primarySoft)', pointerEvents: 'none' }}/>
      <WheelCol opts={['不限', '北京', '天津', '河北', '山东']} highlight="北京"/>
      <WheelCol opts={['不限', '北京', '天津', '河北']} highlight="北京"/>
      <WheelCol opts={['不限', '东城区', '西城区', '朝阳区', '丰台区']} highlight="东城区"/>
    </div>
  );
}

Object.assign(window, { CriteriaEditScreen });
