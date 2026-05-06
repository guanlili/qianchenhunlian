// Screen: 选填信息 — 填写/编辑 自己的相亲资料

function ProfileEditScreen({ app }) {
  const { nav, state, setState } = app;
  const [desc, setDesc] = React.useState(state.myDesc || '');
  const [openPicker, setOpenPicker] = React.useState(null);
  
  const fields = [
    { k: 'nickname', label: '相亲者昵称', required: true, value: '寻缘号 53652255' },
    { k: 'income', label: '年收入', value: state.myIncome || '5-7万', options: window.APP_DATA.incomeOptions },
    { k: 'marriage', label: '婚姻状况', value: state.myMarriage || '未婚', options: ['未婚','离异未育','离异已育','其他'] },
    { k: 'house', label: '是否有婚房', value: state.myHouse || '有婚房', options: ['有婚房','无婚房','有购房计划'] },
  ];
  
  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--headerGrad)', backgroundImage: 'var(--headerGrad), var(--headerOverlay)' }}>
        <MPHeader subtitle="更多详情" onBack={() => nav.back()} onHome={() => nav.go('home')}/>
        <div style={{ padding: '18px 20px 28px', color: '#fff', fontFamily: '"Noto Serif SC", serif' }}>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 4, textAlign: 'center' }}>选填信息</div>
        </div>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80, marginTop: -16 }}>
        {/* Completeness bar */}
        <div style={{ background: 'var(--surface)', margin: '0 14px', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>资料完善度：</span>
            <span style={{ color: 'var(--inkSoft)' }}>完善度越高，相亲成功率越高</span>
          </div>
          <div style={{ marginTop: 10, position: 'relative', height: 10, background: 'var(--surfaceAlt)', borderRadius: 100, overflow: 'hidden' }}>
            <div style={{ width: '39%', height: '100%', background: 'linear-gradient(90deg, #F4A0A0, var(--primary))', borderRadius: 100 }}/>
            <div style={{ position: 'absolute', right: 12, top: -4, fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>39%</div>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--inkSoft)' }}>
            <span style={{ color: '#ED7030' }}>🔥</span> 资料越完整，越快找到有缘人
          </div>
        </div>
        
        {/* Fields */}
        <div style={{ background: 'var(--surface)', margin: '14px 14px 0', borderRadius: 14, border: '1px solid var(--border)' }}>
          {fields.map((f, i) => (
            <div key={f.k} onClick={() => f.options && setOpenPicker(f)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 16px', borderBottom: i < fields.length-1 ? '1px solid var(--border)' : 'none',
              cursor: f.options ? 'pointer' : 'default'
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                {f.label}{f.required && <span style={{ color: 'var(--primary)' }}>*</span>}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--inkSoft)', fontSize: 14.5 }}>
                {f.value}
                {f.options && <svg width="8" height="12" viewBox="0 0 8 12" fill="none"><path d="M1 1 L6 6 L1 11" stroke="var(--inkMuted)" strokeWidth="1.5"/></svg>}
              </span>
            </div>
          ))}
        </div>
        
        {/* Description */}
        <div style={{ background: 'var(--surface)', margin: '14px 14px 0', borderRadius: 14, border: '1px solid var(--border)', padding: '16px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>相亲描述</div>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="补充相亲信息，增大成功率，让对方更了解相亲者，例如：毕业院校、籍贯、兴趣爱好等。（注意：此处不要留联系方式。否则会导致资料审核不通过。）"
            style={{
              width: '100%', minHeight: 100, padding: '12px 14px',
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--surfaceAlt)', color: 'var(--ink)',
              fontSize: 13.5, lineHeight: 1.65, resize: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box',
              outline: 'none'
            }}
          />
          <button onClick={() => nav.go('quick-fill')} style={{
            marginTop: 10, padding: '8px 14px', background: 'var(--primarySoft)',
            color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 100,
            fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>✨ 快速填写（3问题自动生成）</button>
        </div>
        
        {/* Photos */}
        <div style={{ background: 'var(--surface)', margin: '14px 14px 0', borderRadius: 14, border: '1px solid var(--border)', padding: '16px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>照片<span style={{ fontSize: 12, color: 'var(--inkMuted)', fontWeight: 400 }}>（第一张图片将默认为头像）</span></div>
          <div style={{ fontSize: 13.5, color: 'var(--inkSoft)', marginTop: 4 }}>上传真实照片，匹配效率更高</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
            {[0,1,2,3,4,5].map(i => (
              <div key={i} style={{
                aspectRatio: '1', background: 'var(--surfaceAlt)', borderRadius: 8,
                border: '1.5px dashed var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--inkMuted)', fontSize: 28, cursor: 'pointer'
              }}>+</div>
            ))}
          </div>
        </div>
        
        <div style={{ height: 30 }}/>
      </div>
      
      {/* Bottom actions */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 14px 14px',
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 10
      }}>
        <button onClick={() => nav.back()} style={{
          flex: 1, background: 'var(--primarySoft)', color: 'var(--primary)',
          border: 'none', borderRadius: 100, padding: '12px 0',
          fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: 0.6
        }}>暂不填写</button>
        <button onClick={() => { setState({ ...state, myDesc: desc }); nav.back(); }} style={{
          flex: 1.3, background: 'var(--primary)', color: '#fff',
          border: 'none', borderRadius: 100, padding: '12px 0',
          fontSize: 15, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 6px 16px rgba(200,50,50,0.3)'
        }}>保存</button>
      </div>
      
      {openPicker && (
        <OptionSheet
          title={openPicker.label}
          options={openPicker.options}
          value={openPicker.value}
          onClose={() => setOpenPicker(null)}
          onPick={(v) => {
            const k = 'my' + openPicker.k.charAt(0).toUpperCase() + openPicker.k.slice(1);
            setState({ ...state, [k]: v });
            setOpenPicker(null);
          }}
        />
      )}
    </div>
  );
}

function OptionSheet({ title, options, value, onClose, onPick }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 30, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '18px 16px 30px',
        maxHeight: '70%', overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--inkMuted)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {options.map(o => (
            <button key={o} onClick={() => onPick(o)} style={{
              padding: '12px 0', borderRadius: 8,
              background: o === value ? 'var(--primary)' : 'var(--surfaceAlt)',
              color: o === value ? '#fff' : 'var(--ink)',
              border: 'none', fontSize: 14.5, fontWeight: 600, cursor: 'pointer'
            }}>{o}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ProfileEditScreen, OptionSheet });
