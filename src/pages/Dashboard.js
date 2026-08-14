import React, { useState, useEffect } from 'react'
import EditPhotos from './EditPhotos'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { DIETS, EDUCATIONS, HABITS, INCOME_RANGES, RELIGIONS, CASTES, MOTHER_TONGUES, HEIGHT_RANGES, MARITAL_STATUSES, FAMILY_TYPES, FAMILY_VALUES, LOCATION_PREFERENCES, COMPLEXIONS, WEIGHT_RANGES, NATIONALITIES, MANGLIK_OPTIONS, KUNDLI_AVAILABLE, RELOCATION_PREFERENCES, EMPLOYMENT_TYPES, INDUSTRIES, OWN_HOUSE_OPTIONS, HOUSE_TYPES, FAMILY_INCOME_RANGES, PHYSICAL_DISABILITY_OPTIONS } from '../constants/profileOptions'
import { calculateSectionCompleteness } from '../utils/completeness'
import { calculateAge, validateAge, dobInputBounds } from '../utils/ageUtils'
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
                  {profile.profile_completeness < 100 && (() => {
                    const { suggestions } = calculateSectionCompleteness(profile, photos.length)
                    return suggestions.length > 0 ? (
                      <div style={{marginTop:10,fontSize:12,color:'#8e8e8e'}}>
                        <strong style={{color:'#333'}}>Improve your profile:</strong>
                        <ul style={{margin:'4px 0 0 18px',padding:0}}>
                          {suggestions.map((s,i)=><li key={i} style={{marginBottom:2}}>{s}</li>)}
                        </ul>
                      </div>
                    ) : null
                  })()}
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
                    ['Gender', profile.gender],
                    ['Age', profile.age ? profile.age + ' years' : null],
                    ['Date of Birth', profile.date_of_birth],
                    ['Marital Status', profile.marital_status],
                    ['Height', profile.height],
                    ['Weight', profile.weight],
                    ['Complexion', profile.complexion],
                    ['Body Type', profile.body_type],
                    ['Nationality', profile.nationality],
                    ['Physical Disability', profile.physical_disability === 'Yes' ? (profile.disability_details || 'Yes') : null],
                    ['Religion', profile.religion],
                    ['Community / Caste', profile.community],
                    ['Sub-Caste', profile.sub_caste],
                    ['Gotra', profile.gotra],
                    ['Manglik', profile.manglik],
                    ['Kundli Available', profile.kundli_available],
                    ['Mother Tongue', profile.mother_tongue],
                    ['City', profile.city],
                    ['State', profile.state],
                    ['Country', profile.country],
                    ['Native Place', profile.native_place],
                    ['Relocation Preference', profile.relocation_preference],
                    ['Education', profile.education],
                    ['Field of Study', profile.field_of_study],
                    ['Specialization', profile.specialization],
                    ['Occupation', profile.occupation],
                    ['Designation', profile.designation],
                    ['Industry', profile.industry],
                    ['Employment Type', profile.employment_type],
                    ['Employer', profile.employer],
                    ['Work Location', profile.work_location],
                    ['Annual Income', profile.annual_income],
                    ['Diet', profile.diet],
                    ['Smoking', profile.smoking],
                    ['Drinking', profile.drinking],
                    ['Hobbies', profile.hobbies],
                    ['Family Type', profile.family_type],
                    ['Family Values', profile.family_values],
                    ["Father's Profession", profile.father_profession],
                    ["Mother's Profession", profile.mother_profession],
                    ['Siblings', profile.siblings],
                    ['Family City', profile.family_city],
                    ['Own House', profile.own_house],
                    ['House Type', profile.house_type],
                    ['Family Income Range', profile.family_income_range],
                    ['Property Details', profile.property_details],
                    ['Vehicle Details', profile.vehicle_details],
                  ].filter(([,v])=>v).map(([k,v])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid rgba(0,0,0,0.05)',fontSize:14}}>
                      <span style={{color:'#8e8e8e'}}>{k}</span>
                      <span style={{fontWeight:500}}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* Partner Preferences */}
                <div className="card" style={{marginBottom:12}}>
                  <div className="section-label" style={{marginBottom:14}}>Partner Preferences</div>
                  {[
                    ['Age Range', profile.partner_age_min && profile.partner_age_max ? profile.partner_age_min + ' - ' + profile.partner_age_max + ' years' : null],
                    ['Religion', profile.partner_religion],
                    ['Education', profile.partner_education],
                    ['Location', profile.partner_location],
                    ['Notes', profile.partner_notes],
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
  // Purana full_name ko First/Middle/Last mein todne ki koshish (best-effort —
  // agar profile purani hai aur sirf full_name mein bana tha)
  const nameParts = (profile.full_name || '').trim().split(/\s+/)
  const guessedFirst = profile.first_name || nameParts[0] || ''
  const guessedLast = profile.last_name || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : '')
  const guessedMiddle = profile.middle_name || (nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '')

  const [form, setForm] = useState({
    first_name: guessedFirst,
    middle_name: guessedMiddle,
    last_name: guessedLast,
    gender: profile.gender || 'Male',
    date_of_birth: profile.date_of_birth || '',
    city: profile.city || '',
    state: profile.state || '',
    country: profile.country || 'India',
    religion: profile.religion || '',
    community: profile.community || '',
    community_other: '',
    mother_tongue: profile.mother_tongue || '',
    mother_tongue_other: '',
    height: profile.height || '',
    weight: profile.weight || '',
    complexion: profile.complexion || '',
    body_type: profile.body_type || 'Average',
    marital_status: profile.marital_status || 'Never Married',
    nationality: profile.nationality || 'Indian',
    physical_disability: profile.physical_disability || 'No',
    disability_details: profile.disability_details || '',
    sub_caste: profile.sub_caste || '',
    gotra: profile.gotra || '',
    manglik: profile.manglik || '',
    kundli_available: profile.kundli_available || '',
    native_place: profile.native_place || '',
    current_address: profile.current_address || '',
    relocation_preference: profile.relocation_preference || '',
    education: profile.education || '',
    field_of_study: profile.field_of_study || '',
    specialization: profile.specialization || '',
    occupation: profile.occupation || '',
    designation: profile.designation || '',
    industry: profile.industry || '',
    employment_type: profile.employment_type || '',
    work_location: profile.work_location || '',
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
    own_house: profile.own_house || '',
    house_type: profile.house_type || '',
    property_details: profile.property_details || '',
    vehicle_details: profile.vehicle_details || '',
    family_income_range: profile.family_income_range || '',
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
    if(!form.first_name || !form.last_name || !form.date_of_birth || !form.city) {
      showToast('First Name, Last Name, Date of Birth aur City zaroori hai'); return
    }
    const ageCheck = validateAge(form.date_of_birth, form.gender)
    if (!ageCheck.valid) {
      showToast(ageCheck.message)
      return
    }
    setSaving(true)
    try {
      const fullName = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ')
      const finalCommunity = form.community === 'Other' ? form.community_other : form.community
      const finalMotherTongue = form.mother_tongue === 'Other' ? form.mother_tongue_other : form.mother_tongue
      const { community_other, mother_tongue_other, ...formToSave } = form

      const { count: photoCount } = await supabase
        .from('photos')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', profile.id)

      const breakdown = calculateSectionCompleteness(formToSave, photoCount || 0)

      const { data, error } = await supabase
        .from('profiles')
        .update({
          ...formToSave,
          full_name: fullName,
          community: finalCommunity,
          mother_tongue: finalMotherTongue,
          age: ageCheck.age,
          partner_age_min: parseInt(form.partner_age_min) || null,
          partner_age_max: parseInt(form.partner_age_max) || null,
          profile_completeness: breakdown.overall,
          completeness_breakdown: breakdown,
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
          <label className="form-label">First Name *</label>
          <input className="form-input" value={form.first_name} onChange={e=>set('first_name',e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Middle Name</label>
            <input className="form-input" value={form.middle_name} onChange={e=>set('middle_name',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name / Surname *</label>
            <input className="form-input" value={form.last_name} onChange={e=>set('last_name',e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Date of Birth *</label>
            <input className="form-input" type="date" value={form.date_of_birth}
              min={dobInputBounds().min} max={dobInputBounds().max}
              onChange={e=>set('date_of_birth',e.target.value)} />
            {form.date_of_birth && (() => {
              const check = validateAge(form.date_of_birth, form.gender)
              return (
                <div style={{fontSize:12, marginTop:4, color: check.valid ? '#16a34a' : '#dc2626'}}>
                  {check.valid ? `Age: ${check.age} years` : check.message}
                </div>
              )
            })()}
          </div>
          <div className="form-group">
            <label className="form-label">Gender *</label>
            <select className="form-select" value={form.gender} onChange={e=>set('gender',e.target.value)}>
              <option>Male</option><option>Female</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Height</label>
            <select className="form-select" value={form.height} onChange={e=>set('height',e.target.value)}>
              <option value="">Select</option>
              {HEIGHT_RANGES.map(h=><option key={h}>{h}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Weight</label>
            <select className="form-select" value={form.weight} onChange={e=>set('weight',e.target.value)}>
              <option value="">Select</option>
              {WEIGHT_RANGES.map(w=><option key={w}>{w}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Complexion</label>
            <select className="form-select" value={form.complexion} onChange={e=>set('complexion',e.target.value)}>
              <option value="">Select</option>
              {COMPLEXIONS.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Body Type</label>
            <select className="form-select" value={form.body_type} onChange={e=>set('body_type',e.target.value)}>
              <option>Slim</option><option>Average</option><option>Athletic</option><option>Heavy</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Marital Status</label>
            <select className="form-select" value={form.marital_status} onChange={e=>set('marital_status',e.target.value)}>
              {MARITAL_STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Nationality</label>
            <select className="form-select" value={form.nationality} onChange={e=>set('nationality',e.target.value)}>
              {NATIONALITIES.map(n=><option key={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Physical Disability</label>
          <select className="form-select" value={form.physical_disability} onChange={e=>set('physical_disability',e.target.value)}>
            {PHYSICAL_DISABILITY_OPTIONS.map(o=><option key={o}>{o}</option>)}
          </select>
          {form.physical_disability === 'Yes' && (
            <input className="form-input" style={{marginTop:8}} placeholder="Please provide details"
              value={form.disability_details} onChange={e=>set('disability_details',e.target.value)} />
          )}
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="section-label" style={{marginBottom:14}}>Religion & Location</div>
        <div className="form-group">
          <label className="form-label">Religion</label>
          <select className="form-select" value={form.religion} onChange={e=>set('religion',e.target.value)}>
            {RELIGIONS.map(r=><option key={r}>{r}</option>)}
          </select>
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
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Community / Caste</label>
            <select className="form-select" value={form.community} onChange={e=>set('community',e.target.value)}>
              <option value="">Select</option>
              {CASTES.map(c=><option key={c}>{c}</option>)}
            </select>
            {form.community === 'Other' && (
              <input className="form-input" style={{marginTop:8}} placeholder="Apni Caste/Community likhein"
                value={form.community_other} onChange={e=>set('community_other',e.target.value)} />
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Mother Tongue</label>
            <select className="form-select" value={form.mother_tongue} onChange={e=>set('mother_tongue',e.target.value)}>
              <option value="">Select</option>
              {MOTHER_TONGUES.map(m=><option key={m}>{m}</option>)}
            </select>
            {form.mother_tongue === 'Other' && (
              <input className="form-input" style={{marginTop:8}} placeholder="Apni Mother Tongue likhein"
                value={form.mother_tongue_other} onChange={e=>set('mother_tongue_other',e.target.value)} />
            )}
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Sub-Caste</label>
            <input className="form-input" value={form.sub_caste} onChange={e=>set('sub_caste',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Gotra</label>
            <input className="form-input" value={form.gotra} onChange={e=>set('gotra',e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Manglik</label>
            <select className="form-select" value={form.manglik} onChange={e=>set('manglik',e.target.value)}>
              <option value="">Select</option>
              {MANGLIK_OPTIONS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Kundli Available?</label>
            <select className="form-select" value={form.kundli_available} onChange={e=>set('kundli_available',e.target.value)}>
              <option value="">Select</option>
              {KUNDLI_AVAILABLE.map(k=><option key={k}>{k}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Native Place</label>
            <input className="form-input" value={form.native_place} onChange={e=>set('native_place',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Relocation Preference</label>
            <select className="form-select" value={form.relocation_preference} onChange={e=>set('relocation_preference',e.target.value)}>
              <option value="">Select</option>
              {RELOCATION_PREFERENCES.map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Current Address</label>
          <textarea className="form-textarea" value={form.current_address} onChange={e=>set('current_address',e.target.value)} />
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
          <label className="form-label">Field of Study</label>
          <input className="form-input" value={form.field_of_study} onChange={e=>set('field_of_study',e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Specialization</label>
          <input className="form-input" value={form.specialization} onChange={e=>set('specialization',e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Occupation</label>
            <input className="form-input" value={form.occupation} onChange={e=>set('occupation',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Designation</label>
            <input className="form-input" value={form.designation} onChange={e=>set('designation',e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Industry</label>
            <select className="form-select" value={form.industry} onChange={e=>set('industry',e.target.value)}>
              <option value="">Select</option>
              {INDUSTRIES.map(i=><option key={i}>{i}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Employment Type</label>
            <select className="form-select" value={form.employment_type} onChange={e=>set('employment_type',e.target.value)}>
              <option value="">Select</option>
              {EMPLOYMENT_TYPES.map(e=><option key={e}>{e}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Employer</label>
            <input className="form-input" value={form.employer} onChange={e=>set('employer',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Work Location</label>
            <input className="form-input" value={form.work_location} onChange={e=>set('work_location',e.target.value)} />
          </div>
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
        <div className="section-label" style={{marginBottom:14}}>Family Background</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Family Type</label>
            <select className="form-select" value={form.family_type} onChange={e=>set('family_type',e.target.value)}>
              {FAMILY_TYPES.map(f=><option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Family Values</label>
            <select className="form-select" value={form.family_values} onChange={e=>set('family_values',e.target.value)}>
              {FAMILY_VALUES.map(f=><option key={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Father's Profession</label>
            <input className="form-input" value={form.father_profession} onChange={e=>set('father_profession',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Mother's Profession</label>
            <input className="form-input" value={form.mother_profession} onChange={e=>set('mother_profession',e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Siblings</label>
            <input className="form-input" placeholder="e.g. 1 Brother, 1 Sister" value={form.siblings} onChange={e=>set('siblings',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Family City</label>
            <input className="form-input" value={form.family_city} onChange={e=>set('family_city',e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Own House</label>
            <select className="form-select" value={form.own_house} onChange={e=>set('own_house',e.target.value)}>
              <option value="">Select</option>
              {OWN_HOUSE_OPTIONS.map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">House Type</label>
            <select className="form-select" value={form.house_type} onChange={e=>set('house_type',e.target.value)}>
              <option value="">Select</option>
              {HOUSE_TYPES.map(h=><option key={h}>{h}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Family Income Range</label>
          <select className="form-select" value={form.family_income_range} onChange={e=>set('family_income_range',e.target.value)}>
            <option value="">Select</option>
            {FAMILY_INCOME_RANGES.map(f=><option key={f}>{f}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Property Details</label>
          <input className="form-input" value={form.property_details} onChange={e=>set('property_details',e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Vehicle Details</label>
          <input className="form-input" value={form.vehicle_details} onChange={e=>set('vehicle_details',e.target.value)} />
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
          <label className="form-label">Education Preference</label>
          <select className="form-select" value={form.partner_education} onChange={e=>set('partner_education',e.target.value)}>
            <option value="Any">Any</option>
            {EDUCATIONS.map(e=><option key={e}>{e}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Location Preference</label>
          <select className="form-select" value={form.partner_location} onChange={e=>set('partner_location',e.target.value)}>
            <option value="">Select</option>
            {LOCATION_PREFERENCES.map(l=><option key={l}>{l}</option>)}
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
