import React, { useState, useEffect } from 'react'
import EditPhotos from './EditPhotos'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { DIETS, EDUCATIONS, HABITS, INCOME_RANGES, RELIGIONS } from '../constants/profileOptions'
import { rankMatches } from '../utils/matching'
import SignedImage from '../components/SignedImage'

export default function Dashboard({ user }) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('home')
  const [matches, setMatches] = useState([])
  const [messages, setMessages] = useState([])

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

      // Load matches — "profiles_public_view" se (sensitive fields
      // pehle se hi exclude hain database-level pe) — opposite gender
      // pe query-level pe hi filter karte hain (efficient), phir baaki
      // hard-filters (age preference, religion) + soft-scoring client
      // pe hoti hai (matching.js — GAS system jaisi hi philosophy:
      // dono taraf ki preferences check hoti hain).
      const oppositeGender = p.gender === 'Male' ? 'Female' : 'Male'
      const { data: candidates } = await supabase
        .from('profiles_public_view')
        .select('*')
        .neq('user_id', user.id)
        .eq('gender', oppositeGender)
        .limit(100)

      if (candidates && candidates.length > 0) {
        const ranked = rankMatches(p, candidates)
        const profileIds = ranked.map(r => r.profile.id)
        const { data: matchPhotos } = profileIds.length > 0
          ? await supabase.from('photos').select('*').in('profile_id', profileIds).eq('is_primary', true)
          : { data: [] }
        const photoPathByProfile = {}
        ;(matchPhotos || []).forEach(ph => { photoPathByProfile[ph.profile_id] = ph.storage_path })
        setMatches(ranked.map(r => ({
          ...r.profile,
          matchScore: r.score,
          matchReasons: r.reasons,
          primaryPhotoPath: photoPathByProfile[r.profile.id] || null,
        })))
      } else {
        setMatches([])
      }

      // Load messages
      const { data: msg } = await supabase
        .from('messages')
        .select('*')
        .or('sender_id.eq.' + user.id + ',receiver_id.eq.' + user.id)
        .order('created_at', { ascending: false })
        .limit(30)
      setMessages(msg || [])
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

      <div style={{maxWidth:480,margin:'0 auto',padding:'20px 20px 20px'}}>

        {/* HOME TAB */}
        {activeTab === 'home' && (
          <>
            {!profile ? (
              <div style={{textAlign:'center',padding:'60px 0'}}>
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
                      ? <SignedImage path={photos.find(p=>p.is_primary).storage_path} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                      : <span style={{fontSize:24}}>👤</span>
                    }
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:16,marginBottom:2}}>{profile.full_name}</div>
                    <div style={{fontSize:13,color:'#8e8e8e',marginBottom:6}}>{profile.city}{profile.state ? ', ' + profile.state : ''}</div>
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
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                    <div className="section-label">Profile Details</div>
                    <button className="btn btn-outline" style={{fontSize:11,padding:'5px 14px'}}
                      onClick={()=>setActiveTab('editprofile')}>
                      Edit Profile
                    </button>
                  </div>
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
                  <div className="card" style={{marginBottom:12}}>
                    <div className="section-label" style={{marginBottom:10}}>About</div>
                    <p style={{fontSize:14,lineHeight:1.7,color:'#333'}}>{profile.about_me}</p>
                  </div>
                )}

                {/* Photos */}
                {photos.length > 0 && (
                  <div className="card" style={{marginBottom:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                    <div className="section-label">Photos ({photos.length})</div>
                    <button className="btn btn-outline" style={{fontSize:11,padding:'5px 14px'}}
                      onClick={()=>setActiveTab('editphotos')}>
                      Manage Photos
                    </button>
                  </div>
                    <div className="photo-grid">
                      {photos.map((p,i)=>(
                        <div key={i} style={{aspectRatio:1,borderRadius:10,overflow:'hidden',background:'#f5f5f5'}}>
                          <SignedImage path={p.storage_path} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Partner Preferences */}
                <div className="card" style={{marginBottom:12}}>
                  <div className="section-label" style={{marginBottom:14}}>Partner Preferences</div>
                  {[
                    ['Age Range', profile.partner_age_min && profile.partner_age_max ? profile.partner_age_min + ' - ' + profile.partner_age_max + ' years' : null],
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
          </>
        )}

        {/* MATCHES TAB */}
        {activeTab === 'matches' && (
          <div>
            <h2 style={{fontFamily:'Cormorant Garamond',fontSize:26,fontWeight:300,marginBottom:20}}>Your Matches</h2>
            {matches.length === 0 ? (
              <div style={{textAlign:'center',padding:'60px 0',color:'#8e8e8e'}}>
                <div style={{fontSize:48,marginBottom:16}}>💝</div>
                <div style={{fontSize:16,marginBottom:8}}>No matches yet</div>
                <div style={{fontSize:13}}>Complete your profile to get better matches</div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {matches.map((m)=>(
                  <div key={m.id} style={{display:'flex',gap:14,alignItems:'center',padding:'14px',background:'#f5f5f5',borderRadius:14}}>
                    <div style={{width:56,height:56,borderRadius:'50%',background:'#e0e0e0',overflow:'hidden',flexShrink:0}}>
                      {m.primaryPhotoPath
                        ? <SignedImage path={m.primaryPhotoPath} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                        : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>👤</div>
                      }
                    </div>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                        <div style={{fontWeight:600,fontSize:15}}>{m.full_name}</div>
                        {typeof m.matchScore === 'number' && (
                          <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,background: m.matchScore>=70?'#f0fdf4':m.matchScore>=40?'#fff8e1':'#f5f5f5', color: m.matchScore>=70?'#16a34a':m.matchScore>=40?'#b45309':'#8e8e8e'}}>
                            {m.matchScore}% match
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:12,color:'#8e8e8e'}}>{m.age} years • {m.city}</div>
                      <div style={{fontSize:11,color:'#8e8e8e'}}>{m.education} • {m.occupation}</div>
                      {m.matchReasons && m.matchReasons.length > 0 && (
                        <div style={{fontSize:10,color:'#aaa',marginTop:3}}>{m.matchReasons.slice(0,2).join(' · ')}</div>
                      )}
                    </div>
                    <button className="btn btn-black" style={{fontSize:11,padding:'6px 14px'}}
                      onClick={()=>setActiveTab('messages')}>
                      Connect
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MESSAGES TAB */}
        {activeTab === 'messages' && (
          <div>
            <h2 style={{fontFamily:'Cormorant Garamond',fontSize:26,fontWeight:300,marginBottom:20}}>Messages</h2>
            {messages.length === 0 ? (
              <div style={{textAlign:'center',padding:'60px 0',color:'#8e8e8e'}}>
                <div style={{fontSize:48,marginBottom:16}}>💬</div>
                <div style={{fontSize:16,marginBottom:8}}>No messages yet</div>
                <div style={{fontSize:13}}>Connect with matches to start a conversation</div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {messages.map((msg,i)=>(
                  <div key={i} style={{padding:'14px',background:'#f5f5f5',borderRadius:12}}>
                    <div style={{fontSize:13,color:'#333'}}>{msg.content}</div>
                    <div style={{fontSize:11,color:'#8e8e8e',marginTop:4}}>{new Date(msg.created_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div>
            <h2 style={{fontFamily:'Cormorant Garamond',fontSize:26,fontWeight:300,marginBottom:20}}>My Profile</h2>
            {profile && (
              <div style={{textAlign:'center',padding:'20px 0'}}>
                <div style={{width:90,height:90,borderRadius:'50%',background:'#e0e0e0',overflow:'hidden',margin:'0 auto 16px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {photos.find(p=>p.is_primary)
                    ? <SignedImage path={photos.find(p=>p.is_primary).storage_path} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                    : <span style={{fontSize:36}}>👤</span>
                  }
                </div>
                <div style={{fontWeight:600,fontSize:20,marginBottom:4}}>{profile.full_name}</div>
                <div style={{fontSize:14,color:'#8e8e8e',marginBottom:8}}>{profile.city}{profile.state ? ', ' + profile.state : ''}</div>
                <div className="profile-code" style={{display:'inline-block',marginBottom:20}}>{profile.profile_code}</div>

                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  <button className="btn btn-black" style={{width:'100%'}} onClick={()=>setActiveTab('editprofile')}>
                    Edit Profile
                  </button>
                  <button className="btn btn-outline" style={{width:'100%',color:'#e53e3e',borderColor:'#e53e3e'}} onClick={logout}>
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* EDIT PHOTOS TAB */}
        {activeTab === 'editphotos' && profile && (
          <EditPhotos
            user={user}
            profileId={profile.id}
            onBack={()=>setActiveTab('home')}
          />
        )}

        {/* EDIT PROFILE TAB */}
        {activeTab === 'editprofile' && profile && (
          <EditProfileForm
            profile={profile}
            user={user}
            onSave={(updated) => {
              setProfile(updated)
              setActiveTab('home')
            }}
            onCancel={() => setActiveTab('home')}
          />
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

function EditProfileForm({ profile, user, onSave, onCancel }) {
  const [form, setForm] = useState({
    full_name: profile.full_name || '',
    age: profile.age || '',
    city: profile.city || '',
    state: profile.state || '',
    country: profile.country || 'India',
    religion: profile.religion || '',
    community: profile.community || '',
    mother_tongue: profile.mother_tongue || '',
    height: profile.height || '',
    education: profile.education || '',
    field_of_study: profile.field_of_study || '',
    occupation: profile.occupation || '',
    employer: profile.employer || '',
    annual_income: profile.annual_income || '',
    diet: profile.diet || '',
    smoking: profile.smoking || '',
    drinking: profile.drinking || '',
    hobbies: profile.hobbies || '',
    about_me: profile.about_me || '',
    family_type: profile.family_type || '',
    family_values: profile.family_values || '',
    father_profession: profile.father_profession || '',
    mother_profession: profile.mother_profession || '',
    siblings: profile.siblings || '',
    family_city: profile.family_city || '',
    partner_age_min: profile.partner_age_min || '',
    partner_age_max: profile.partner_age_max || '',
    partner_religion: profile.partner_religion || 'Any',
    partner_location: profile.partner_location || '',
    partner_education: profile.partner_education || 'Any',
    partner_notes: profile.partner_notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(()=>setToast(''),3000)
  }

  const handleSave = async () => {
    if(!form.full_name || !form.age || !form.city) {
      showToast('Name, Age aur City zaroori hai'); return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          ...form,
          age: parseInt(form.age),
          partner_age_min: parseInt(form.partner_age_min) || null,
          partner_age_max: parseInt(form.partner_age_max) || null,
        })
        .eq('user_id', user.id)
        .select()
        .single()

      if(error) throw error
      showToast('Profile updated!')
      setTimeout(()=>onSave(data), 1000)
    } catch(err) {
      showToast('Error: ' + err.message)
    }
    setSaving(false)
  }


  return (
    <div>
      <div className={'toast ' + (toast?'show':'')}>{toast}</div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button onClick={onCancel} style={{background:'none',border:'none',fontSize:20,cursor:'pointer'}}>←</button>
        <h2 style={{fontFamily:'Cormorant Garamond',fontSize:24,fontWeight:300,margin:0}}>Edit Profile</h2>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="section-label" style={{marginBottom:14}}>Personal Info</div>

        <div className="form-group">
          <label className="form-label">Full Name *</label>
          <input className="form-input" value={form.full_name} onChange={e=>set('full_name',e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Age *</label>
            <input className="form-input" type="number" value={form.age} onChange={e=>set('age',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Religion</label>
            <select className="form-select" value={form.religion} onChange={e=>set('religion',e.target.value)}>
              {RELIGIONS.map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">City *</label>
            <input className="form-input" value={form.city} onChange={e=>set('city',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">State</label>
            <input className="form-input" value={form.state} onChange={e=>set('state',e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Community</label>
          <input className="form-input" value={form.community} onChange={e=>set('community',e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Mother Tongue</label>
          <input className="form-input" value={form.mother_tongue} onChange={e=>set('mother_tongue',e.target.value)} />
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="section-label" style={{marginBottom:14}}>Education & Career</div>
        <div className="form-group">
          <label className="form-label">Education</label>
          <select className="form-select" value={form.education} onChange={e=>set('education',e.target.value)}>
            {EDUCATIONS.map(e=><option key={e}>{e}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Occupation</label>
          <input className="form-input" value={form.occupation} onChange={e=>set('occupation',e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Annual Income</label>
          <select className="form-select" value={form.annual_income} onChange={e=>set('annual_income',e.target.value)}>
            {INCOME_RANGES.map(i=><option key={i}>{i}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="section-label" style={{marginBottom:14}}>Lifestyle</div>
        <div className="form-group">
          <label className="form-label">Diet</label>
          <select className="form-select" value={form.diet} onChange={e=>set('diet',e.target.value)}>
            {DIETS.map(d=><option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Smoking</label>
            <select className="form-select" value={form.smoking} onChange={e=>set('smoking',e.target.value)}>
              {HABITS.map(h=><option key={h}>{h}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Drinking</label>
            <select className="form-select" value={form.drinking} onChange={e=>set('drinking',e.target.value)}>
              {HABITS.map(h=><option key={h}>{h}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Hobbies</label>
          <input className="form-input" value={form.hobbies} onChange={e=>set('hobbies',e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">About Me</label>
          <textarea className="form-textarea" value={form.about_me} onChange={e=>set('about_me',e.target.value)} style={{minHeight:100}} />
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="section-label" style={{marginBottom:14}}>Partner Preferences</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Age Min</label>
            <input className="form-input" type="number" value={form.partner_age_min} onChange={e=>set('partner_age_min',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Age Max</label>
            <input className="form-input" type="number" value={form.partner_age_max} onChange={e=>set('partner_age_max',e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Religion Preference</label>
          <select className="form-select" value={form.partner_religion} onChange={e=>set('partner_religion',e.target.value)}>
            <option value="Any">Any / Open to all</option>
            {RELIGIONS.map(r=><option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Additional Notes</label>
          <textarea className="form-textarea" value={form.partner_notes} onChange={e=>set('partner_notes',e.target.value)} />
        </div>
      </div>

      <div style={{display:'flex',gap:10,marginTop:8,marginBottom:20}}>
        <button className="btn btn-outline" style={{flex:1}} onClick={onCancel}>Cancel</button>
        <button className="btn btn-black" style={{flex:2}} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
