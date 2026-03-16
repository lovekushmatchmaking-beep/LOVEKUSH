import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const ADMIN_PASS = 'lovekush@admin2025'

export default function Admin() {
  const [authed, setAuthed] = useState(false)
  const [pass, setPass] = useState('')
  const [passError, setPassError] = useState('')
  const [profiles, setProfiles] = useState([])
  const [photos, setPhotos] = useState({})
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [stats, setStats] = useState({total:0,pending:0,active:0,blocked:0})
  const [selected, setSelected] = useState(null)

  const login = () => {
    if(pass === ADMIN_PASS) { setAuthed(true); loadData() }
    else setPassError('Wrong password')
  }

  const loadData = async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at',{ascending:false})
    if(data) {
      setProfiles(data)
      setStats({
        total: data.length,
        pending: data.filter(p=>p.profile_status==='pending').length,
        active: data.filter(p=>p.profile_status==='active').length,
        blocked: data.filter(p=>p.profile_status==='blocked').length,
      })
      const photoMap = {}
      for(const p of data) {
        const { data: ph } = await supabase.from('photos').select('*').eq('profile_id',p.id).eq('is_primary',true).single()
        if(ph) photoMap[p.id] = ph.photo_url
      }
      setPhotos(photoMap)
    }
    setLoading(false)
  }

  const updateStatus = async (id, status) => {
    await supabase.from('profiles').update({profile_status:status}).eq('id',id)
    loadData()
    setSelected(null)
  }

  const filtered = profiles.filter(p => {
    if(activeTab==='pending') return p.profile_status==='pending'
    if(activeTab==='active') return p.profile_status==='active'
    if(activeTab==='blocked') return p.profile_status==='blocked'
    return true
  })

  if(!authed) return (
    <div style={{minHeight:'100vh',background:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{maxWidth:360,width:'100%',padding:24}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontFamily:'DM Sans',fontSize:22,fontWeight:200,letterSpacing:'0.45em',marginBottom:4}}>LOVEKUSH</div>
          <div style={{fontSize:12,color:'#8e8e8e',letterSpacing:'0.2em'}}>ADMIN PANEL</div>
        </div>
        <div style={{marginBottom:12}}>
          <input className="form-input" type="password" placeholder="Admin password"
            value={pass} onChange={e=>{setPass(e.target.value);setPassError('')}}
            onKeyDown={e=>e.key==='Enter'&&login()} autoFocus />
          {passError && <div className="form-error" style={{marginTop:6}}>{passError}</div>}
        </div>
        <button className="btn btn-black btn-full" onClick={login}>Login to Admin</button>
      </div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'#fff'}}>
      <nav className="navbar">
        <span style={{fontFamily:'DM Sans',fontSize:15,fontWeight:200,letterSpacing:'0.35em'}}>ADMIN</span>
        <button className="btn btn-outline" style={{fontSize:11,padding:'6px 14px'}} onClick={()=>setAuthed(false)}>Logout</button>
      </nav>

      <div style={{maxWidth:800,margin:'0 auto',padding:'20px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
          {[
            {label:'Total',val:stats.total,bg:'#f5f5f5'},
            {label:'Pending',val:stats.pending,bg:'#fff8e1'},
            {label:'Active',val:stats.active,bg:'#f0fdf4'},
            {label:'Blocked',val:stats.blocked,bg:'#fef2f2'},
          ].map(s=>(
            <div key={s.label} style={{background:s.bg,borderRadius:12,padding:'14px 16px'}}>
              <div style={{fontFamily:'Cormorant Garamond',fontSize:28,fontWeight:300}}>{s.val}</div>
              <div style={{fontSize:10,color:'#8e8e8e',letterSpacing:'0.1em',textTransform:'uppercase'}}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'1px solid rgba(0,0,0,0.08)'}}>
          {['all','pending','active','blocked'].map(t=>(
            <button key={t} onClick={()=>setActiveTab(t)}
              style={{padding:'8px 16px',border:'none',background:'transparent',
                fontSize:13,fontWeight:activeTab===t?600:400,
                color:activeTab===t?'#000':'#8e8e8e',
                borderBottom:activeTab===t?'2px solid #000':'2px solid transparent',
                cursor:'pointer',textTransform:'capitalize'}}>
              {t}
            </button>
          ))}
          <button className="btn btn-black btn-sm" style={{marginLeft:'auto',marginBottom:4}} onClick={loadData}>
            {loading?'Loading...':'↺ Refresh'}
          </button>
        </div>

        {filtered.length === 0 ? (
          <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:14}}>
            No profiles in this category
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {filtered.map(p=>(
              <div key={p.id} style={{border:'1px solid rgba(0,0,0,0.08)',borderRadius:12,padding:'14px 16px',cursor:'pointer',transition:'background 0.2s'}}
                onClick={()=>setSelected(selected?.id===p.id?null:p)}
                onMouseEnter={e=>e.currentTarget.style.background='#f9f9f9'}
                onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:44,height:44,borderRadius:'50%',background:'#f0f0f0',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {photos[p.id]
                      ? <img src={photos[p.id]} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                      : <span style={{fontSize:18}}>👤</span>
                    }
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:14,marginBottom:2}}>{p.full_name}</div>
                    <div style={{fontSize:12,color:'#8e8e8e'}}>{p.age}y · {p.city} · {p.religion} · {p.occupation}</div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                    <div className={`badge badge-${p.profile_status}`}>{p.profile_status}</div>
                    <div style={{fontSize:10,color:'#8e8e8e',fontFamily:'monospace'}}>{p.profile_code}</div>
                  </div>
                </div>

                {selected?.id===p.id && (
                  <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid rgba(0,0,0,0.06)'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14,fontSize:13}}>
                      {[
                        ['Education',p.education],
                        ['Income',p.annual_income],
                        ['Family',p.family_type],
                        ['Diet',p.diet],
                        ['Completeness',p.profile_completeness+'%'],
                        ['Gender',p.gender],
                        ['Registered',new Date(p.created_at).toLocaleDateString('en-IN')],
                        ['Marital',p.marital_status],
                      ].map(([k,v])=>(
                        <div key={k}>
                          <span style={{color:'#8e8e8e'}}>{k}: </span>
                          <span style={{fontWeight:500}}>{v||'—'}</span>
                        </div>
                      ))}
                    </div>
                    {p.about_me && <div style={{fontSize:13,color:'#555',background:'#f9f9f9',padding:'10px 12px',borderRadius:8,marginBottom:14,lineHeight:1.6}}>{p.about_me}</div>}
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      {p.profile_status!=='active'&&(
                        <button className="btn btn-black btn-sm" onClick={e=>{e.stopPropagation();updateStatus(p.id,'active')}}>✓ Approve</button>
                      )}
                      {p.profile_status!=='blocked'&&(
                        <button className="btn btn-outline btn-sm" style={{color:'#dc2626',borderColor:'#dc2626'}}
                          onClick={e=>{e.stopPropagation();updateStatus(p.id,'blocked')}}>✕ Block</button>
                      )}
                      {p.profile_status!=='pending'&&(
                        <button className="btn btn-outline btn-sm"
                          onClick={e=>{e.stopPropagation();updateStatus(p.id,'pending')}}>↩ Pending</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
