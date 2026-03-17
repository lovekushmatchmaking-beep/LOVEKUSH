import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Dashboard({ user }) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('home')

  useEffect(() => {
    loadProfile()
  }, [user])

  const loadProfile = async () => {
    const { data: p } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()
    if(p) {
      setProfile(p)
      const { data: ph } = await supabase
        .from('photos')
        .select('*')
        .eq('profile_id', p.id)
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
      {/* Navbar */}
      <nav className="navbar">
        <span style={{fontFamily:'DM Sans',fontSize:16,fontWeight:200,letterSpacing:'0.4em'}}>LOVEKUSH</span>
        <button className="btn btn-outline" style={{fontSize:11,padding:'6px 14px'}} onClick={logout}>Logout</button>
      </nav>

      {/* Content */}
      <div style={{maxWidth:480,margin:'0 auto',padding:'20px 20px 20px'}}>

        {/* No profile yet */}
        {!profile ? (
          <div style={{textAlign:'center',padding:'60px 0'}}>
            <svg width="56" height="56" viewBox="0 0 60 60" fill="none" style={{margin:'0 auto 20px',display:'block',opacity:0.2}}>
              <g stroke="black" strokeWidth="2.2" strokeLinecap="round" fill="none">
                <path d="M30 6C36 6,44 14,44 22C44 29,38 34,33 37C40 39,51 46,51 55C51 59,44 62,37 58C33 55,31 51,30 47C29 51,27 55,23 58C16 62,9 59,9 55C9 46,20 39,27 37C22 34,16 29,16 22C16 14,24 6,30 6Z"/>
                <circle cx="30" cy="37" r="2.5" fill="black"/>
              </g>
            </svg>
            <h2 style={{fontFamily:'Cormorant Garamond',fontSize:28,fontWeight:300,marginBottom:8}}>Complete Your Profile</h2>
            <p style={{fontSize:14,color:'#8e8e8e',marginBottom:28,lineHeight:1.6}}>Create your profile to start your matchmaking journey</p>
            <button className="btn btn-black btn-lg" onClick={()=>navigate('/create-profile')}>Create Profile →</button>
          </div>
        ) : (
          <>
            {/* Profile Header */}
            <div style={{display:'flex',gap:14,alignItems:'flex-start',marginBottom:20,padding:'16px',background:'#f5f5f5',borderRadius:16}}>
              <div style={{width:64,height:64,borderRadius:'50%',background:'#e0e0e0',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                {photos.find(p=>p.is_primary)
                  ? <img src={photos.find(p=>p.is_primary).photo_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                  : <span style={{fontSize:24}}>👤</span>
                }
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:16,marginBottom:2}}>{profile.full_name}</div>
                <div style={{fontSize:13,color:'#8e8e8e',marginBottom:6}}>{profile.city}{profile.state ? ", " + profile.state : ''}</div>
                <div className="profile-code">{profile.profile_code}</div>
              </div>
              <div style={{
                background: profile.profile_status==='active'?'#f0fdf4':'#fff8e1',
                color: profile.profile_status==='active'?'#16a34a':'#f59e0b',
                fontSize:10, fontWeight:600, padding:'4px 10px', borderRadius:50,
                letterSpacing:'0.1em', textTransform:'uppercase'
              }}>
                {profile.profile_status==='active'?'Active':'Under Review'}
              </div>
            </div>

            {/* Completeness */}
            <div style={{marginBottom:20}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:13,fontWeight:500}}>Profile Completeness</span>
                <span style={{fontSize:13,fontWeight:600}}>{profile.profile_completeness}%</span>
              </div>
              <div className="progress-wrap">
                <div className="progress-fill" style={{width:profile.profile_completeness+'%'}}></div>
              </div>
              {profile.profile_completeness < 80 && (
                <div style={{fontSize:12,color:'#8e8e8e',marginTop:6}}>
                  Complete your profile for better matches →{' '}
                  <span style={{color:'#000',cursor:'pointer',fontWeight:500}} onClick={()=>navigate('/create-profile')}>Update</span>
                </div>
              )}
            </div>

            {/* Stats */}
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

            {/* Profile Details */}
            <div className="card" style={{marginBottom:12}}>
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

            {/* About */}
            {profile.about_me && (
              <div className="card">
                <div className="section-label" style={{marginBottom:10}}>About</div>
                <p style={{fontSize:14,lineHeight:1.7,color:'#333'}}>{profile.about_me}</p>
              </div>
            )}

            {/* Photos */}
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

            {/* Partner Preferences */}
            <div className="card">
              <div className="section-label" style={{marginBottom:14}}>Partner Preferences</div>
              {[
                ['Age Range', profile.partner_age_min && profile.partner_age_max ? profile.partner_age_min + " – " + profile.partner_age_max + " years" : null],
                ['Religion', profile.partner_religion],
                ['Location', profile.partner_location],
                ['Education', profile.partner_education],
              ].filter(([,v])=>v).map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid rgba(0,0,0,0.05)',fontSize:14}}>
                  <span style={{color:'#8e8e8e'}}>{k}</span>
                  <span style={{fontWeight:500}}>{v}</span>
                </div>
              ))}
            </div>

            <div className="notice" style={{marginTop:20}}>
              <strong>Our team is reviewing your profile.</strong> You'll be notified once it's active and we start finding suitable matches.
            </div>
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="bottom-nav">
        {[
          {id:'home',icon:'🏠',label:'Home'},
          {id:'matches',icon:'💝',label:'Matches'},
          {id:'messages',icon:'💬',label:'Messages'},
          {id:'profile',icon:'👤',label:'Profile'},
        ].map(item=>(
          <button key={item.id} className={"bottom-nav-item " + (activeTab===item.id?'active':'')}
            onClick={()=>setActiveTab(item.id)}>
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
