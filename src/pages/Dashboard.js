import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Dashboard({ user }) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('home')

  useEffect(() => { loadProfile() }, [user])

  const loadProfile = async () => {
    const { data: p } = await supabase.from('profiles').select('*').eq('user_id', user.id).single()
    if(p) {
      setProfile(p)
      const { data: ph } = await supabase.from('photos').select('*').eq('profile_id', p.id)
      setPhotos(ph || [])
    }
    setLoading(false)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  if(loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontFamily:'serif',fontSize:24,letterSpacing:'0.4em',marginBottom:8}}>LOVEKUSH</div>
        <div style={{fontSize:12,opacity:0.4}}>Loading...</div>
      </div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'#fff',paddingBottom:80}}>
      <nav className="navbar">
        <span style={{fontFamily:'DM Sans',fontSize:16,fontWeight:200,letterSpacing:'0.4em'}}>LOVEKUSH</span>
        <button className="btn btn-outline" style={{fontSize:11,padding:'6px 14px'}} onClick={logout}>Logout</button>
      </nav>

      <div style={{maxWidth:480,margin:'0 auto',padding:'20px'}}>
        {!profile ? (
          <div style={{textAlign:'center',padding:'60px 0'}}>
            <h2 style={{fontFamily:'Cormorant Garamond',fontSize:28,fontWeight:300,marginBottom:8}}>Complete Your Profile</h2>
            <p style={{fontSize:14,color:'#8e8e8e',marginBottom:28,lineHeight:1.6}}>Create your profile to start your matchmaking journey</p>
            <button className="btn btn-black btn-lg" onClick={()=>navigate('/create-profile')}>Create Profile →</button>
          </div>
        ) : (
          <>
            <div style={{display:'flex',gap:14,alignItems:'flex-start',marginBottom:20,padding:'16px',background:'#f5f5f5',borderRadius:16}}>
              <div style={{width:64,height:64,borderRadius:'50%',background:'#e0e0e0',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                {photos.find(p=>p.is_primary)
                  ? <img src={photos.find(p=>p.is_primary).photo_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                  : <span style={{fontSize:24}}>👤</span>
                }
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:16,marginBottom:2}}>{profile.full_name}</div>
                <div style={{fontSize:13,color:'#8e8e8e',marginBottom:6}}>{profile.city}{profile.state?, ${profile.state}:''}</div>
                <div className="profile-code">{profile.profile_code}</div>
              </div>
              <div style={{
                background: profile.profile_status==='active'?'#f0fdf4':'#fff8e1',
                color: profile.profile_status==='active'?'#16a34a':'#f59e0b',
                fontSize:10,fontWeight:600,padding:'4px 10px',borderRadius:50,
                letterSpacing:'0.1em',textTransform:'uppercase'
              }}>
                {profile.profile_status==='active'?'Active':'Under Review'}
              </div>
            </div>

            <div style={{marginBottom:20}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:13,fontWeight:500}}>Profile Completeness</span>
                <span style={{fontSize:13,fontWeight:600}}>{profile.profile_completeness}%</span>
              </div>
              <div className="progress-wrap">
                <div className="progress-fill" style={{width:${profile.profile_completeness}%}}></div>
              </div>
            </div>

            <div className="stats-row">
              <div className="stat-card">
                <span className="stat-num">{photos.length}</span>
                <span className="stat-label">Photos</span>
              </div>
              <div className="stat-card">
                <span className="stat-num">{profile.profile_completeness}%</span>
                <span className="stat-label">Complete</span>
              </div>
            </div>

            <div className="card">
              <div className="section-label" style={{marginBottom:14}}>Profile Details</div>
              {[
                ['Age', profile.age + ' years'],
                ['Religion', profile.religion],
                ['Education', profile.education],
                ['Occupation', profile.occupation],
                ['Annual Income', profile.annual_income],
                ['Diet', profile.diet],
                ['Family Type', profile.family_type],
                ['Marital Status', profile.marital_status],
              ].filter(([,v])=>v).map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid rgba(0,0,0,0.05)',fontSize:14}}>
                  <span style={{color:'#8e8e8e'}}>{k}</span>
                  <span style={{fontWeight:500}}>{v}</span>
                </div>
              ))}
            </div>

            {profile.about_me && (
              <div className="card">
                <div className="section-label" style={{marginBottom:10}}>About</div>
                <p style={{fontSize:14,lineHeight:1.7,color:'#333'}}>{profile.about_me}</p>
              </div>
            )}

            {photos.length > 0 && (
              <div className="card">
                <div className="section-label" style={{marginBottom:12}}>Photos ({photos.length})</div>
                <div className="photo-grid">
                  {photos.map((p,i)=>(
                    <div key={i} style={{aspectRatio:1,borderRadius:10,overflow:'hidden',background:'#f5f5f5'}}>
                      <img src={p.photo_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="notice" style={{marginTop:20}}>
              <strong>Our team is reviewing your profile.</strong> You'll be notified once it's active and we start finding suitable matches.
            </div>
          </>
        )}
      </div>

      <div className="bottom-nav">
        {[
          {id:'home',icon:'🏠',label:'Home'},
          {id:'matches',icon:'💝',label:'Matches'},
          {id:'messages',icon:'💬',label:'Messages'},
          {id:'profile',icon:'👤',label:'Profile'},
        ].map(item=>(
          <button key={item.id} className={bottom-nav-item ${activeTab===item.id?'active':''}}
            onClick={()=>setActiveTab(item.id)}>
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
