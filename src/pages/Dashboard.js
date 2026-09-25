import React, { useState, useEffect } from 'react'
import EditPhotos from './EditPhotos'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { DIETS, EDUCATIONS, DEGREE_OPTIONS, HABITS, INCOME_RANGES, RELIGIONS, CASTES, GOTRAS, MOTHER_TONGUES,
  ISLAMIC_DENOMINATIONS, SUNNI_SCHOOLS_OF_THOUGHT, SHIA_BRANCHES, ISLAMIC_COMMUNITIES,
  ISLAMIC_SUB_CASTE_DIVISIONS, SENSITIVE_COMMUNITIES, SENSITIVE_COMMUNITY_NOTE,
  CHRISTIAN_DENOMINATION_GROUPS, CHRISTIAN_COMMUNITIES,
  RELIGION_HIERARCHY, NO_RELIGION_VALUES, JAIN_GOTRAS, HEIGHT_RANGES, MARITAL_STATUSES, FAMILY_TYPES, FAMILY_VALUES, LOCATION_PREFERENCES, COMPLEXIONS, BODY_TYPES, WEIGHT_RANGES,
  PROPERTY_TYPES, PROPERTY_OWNERSHIP, VEHICLE_OWNERSHIP, BUSINESS_ASSET_TYPES,
  PARTNER_COMMUNITY_SPECIAL_OPTIONS, PARTNER_COMMUNITY_NO_BAR, COUNTRIES, MANGLIK_OPTIONS, KUNDLI_AVAILABLE, RELOCATION_PREFERENCES, EMPLOYMENT_TYPES, OWN_HOUSE_OPTIONS, HOUSE_TYPES, FAMILY_INCOME_RANGES, USD_FAMILY_INCOME_RANGES, CURRENCIES, USD_INCOME_RANGES, PHYSICAL_DISABILITY_OPTIONS, PROFESSION_CATEGORIES, HEALTH_INFO_OPTIONS, BLOOD_GROUPS, PROFILE_MANAGED_BY, FAMILY_STATUS_OPTIONS, LIVING_WITH_PARENTS_OPTIONS, HOBBIES_INTERESTS, HOBBIES_MAX_SELECT, CUISINES, SPORTS_LIST, TIME_OF_BIRTH_ACCURACY, CASTE_NO_BAR_OPTIONS, PRIVACY_LEVELS, FAMILY_FINANCIAL_STATUS, WORKING_AS_OPTIONS, FAVOURITE_MUSIC, FAVOURITE_BOOKS, DRESS_STYLES,
  LANGUAGES_SPOKEN, HAVE_CHILDREN_OPTIONS, CHILDREN_LIVING_WITH_OPTIONS, GREW_UP_IN_OPTIONS,
  PARTNER_HEIGHT_MIN_INCHES, PARTNER_HEIGHT_MAX_INCHES, formatHeightFromInches,
  PARTNER_INCOME_BOUNDS } from '../constants/profileOptions'
import { calculateSectionCompleteness } from '../utils/completeness'
import { calculateAge, validateAge, dobInputBounds } from '../utils/ageUtils'
import { rankMatches } from '../utils/matching'
import SignedImage from '../components/SignedImage'
import MultiSelectChips from '../components/MultiSelectChips'
import DualRangeSlider from '../components/DualRangeSlider'
import CheckboxDropdown from '../components/CheckboxDropdown'

const SIBLING_COUNT_OPTIONS = Array.from({length:11}, (_,i)=>i) // 0-10

export default function Dashboard({ user }) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('home')
  const [matches, setMatches] = useState([])
  const [myActions, setMyActions] = useState([]) // match_actions rows where actor = me
  const [myIntroductions, setMyIntroductions] = useState([]) // introductions (Talk/Meeting requests) involving me

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

      // Apne khud ke Like/Dislike/Super Like actions pehle load karte hain,
      // taaki disliked profiles ko candidates se hi nikaal sakein (kabhi
      // dobara na dikhein, jab tak user khud "Undo" na kare).
      const { data: actions } = await supabase
        .from('match_actions')
        .select('*')
        .eq('actor_profile_id', p.id)
      const myActionsList = actions || []
      setMyActions(myActionsList)
      const dislikedIds = new Set(myActionsList.filter(a => a.action === 'dislike').map(a => a.target_profile_id))

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

      const visibleCandidates = (candidates || []).filter(c => !dislikedIds.has(c.id))

      if (visibleCandidates.length > 0) {
        const ranked = rankMatches(p, visibleCandidates)
        const profileIds = ranked.map(r => r.profile.id)
        const { data: matchPhotos } = profileIds.length > 0
          ? await supabase.from('photos').select('*').in('profile_id', profileIds).eq('is_primary', true)
          : { data: [] }
        const photoPathByProfile = {}
        ;(matchPhotos || []).forEach(ph => { photoPathByProfile[ph.profile_id] = ph.storage_path })
        setMatches(ranked.map(r => ({
          ...r.profile,
          matchScore: r.score,
          matchStrengths: r.strengths,
          matchNeedsDiscussion: r.needsDiscussion,
          primaryPhotoPath: photoPathByProfile[r.profile.id] || null,
        })))
      } else {
        setMatches([])
      }

      // Talk/Meeting requests (introductions table) — dono taraf ki, taaki
      // "already requested" state pata chale aur Requests tab bhar sake.
      const { data: intros } = await supabase
        .from('introductions')
        .select('*')
        .or(`from_profile.eq.${p.id},to_profile.eq.${p.id}`)
      setMyIntroductions(intros || [])
    }
    setLoading(false)
  }

  // ===== LIKE / DISLIKE / SUPER LIKE =====
  const setMatchAction = async (targetProfileId, action) => {
    const { error } = await supabase.from('match_actions')
      .upsert({ actor_profile_id: profile.id, target_profile_id: targetProfileId, action, updated_at: new Date().toISOString() },
        { onConflict: 'actor_profile_id,target_profile_id' })
    if (error) { alert('Could not save: ' + error.message); return }
    if (action === 'dislike') {
      setMatches(prev => prev.filter(m => m.id !== targetProfileId))
    }
    setMyActions(prev => {
      const rest = prev.filter(a => a.target_profile_id !== targetProfileId)
      return [...rest, { actor_profile_id: profile.id, target_profile_id: targetProfileId, action }]
    })
  }

  const undoDislike = async (targetProfileId) => {
    const { error } = await supabase.from('match_actions').delete()
      .eq('actor_profile_id', profile.id).eq('target_profile_id', targetProfileId)
    if (error) { alert('Could not undo: ' + error.message); return }
    setMyActions(prev => prev.filter(a => a.target_profile_id !== targetProfileId))
  }

  // ===== TALK / MEETING REQUEST (routed to a Relationship Manager, no in-app chat) =====
  const sendIntroductionRequest = async (targetProfileId, requestType) => {
    const { error } = await supabase.from('introductions').insert({
      from_profile: profile.id,
      to_profile: targetProfileId,
      request_type: requestType,
      status: 'pending',
    })
    if (error) {
      if (error.code === '23505') { alert('You have already sent a request to this profile.') }
      else { alert('Could not send request: ' + error.message) }
      return
    }
    setMyIntroductions(prev => [...prev, { from_profile: profile.id, to_profile: targetProfileId, request_type: requestType, status: 'pending' }])
  }

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  // Profile ko 15 din ke liye temporarily hide karna — profiles_public_view
  // hidden_until wale profiles ko already exclude karti hai (matching se
  // gayab ho jaate hain), koi extra client-side filtering nahi chahiye.
  const hideProfile = async () => {
    const until = new Date(Date.now() + 15*24*60*60*1000).toISOString()
    const { error } = await supabase.from('profiles').update({ hidden_until: until }).eq('id', profile.id)
    if (error) { alert('Could not hide profile: ' + error.message); return }
    setProfile(p => ({ ...p, hidden_until: until }))
  }

  const unhideProfile = async () => {
    const { error } = await supabase.from('profiles').update({ hidden_until: null }).eq('id', profile.id)
    if (error) { alert('Could not unhide profile: ' + error.message); return }
    setProfile(p => ({ ...p, hidden_until: null }))
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

                {profile.hidden_until && new Date(profile.hidden_until) > new Date() ? (
                  <div className="notice" style={{marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10}}>
                    <span>Your profile is hidden until {new Date(profile.hidden_until).toLocaleDateString('en-IN')}.</span>
                    <button className="btn btn-outline btn-sm" style={{flexShrink:0}} onClick={unhideProfile}>Unhide Now</button>
                  </div>
                ) : (
                  <div style={{display:'flex', gap:10, marginBottom:20}}>
                    <button className="btn btn-outline" style={{fontSize:12,padding:'8px 14px'}} onClick={()=>{
                      if (window.confirm('Hide your profile for 15 days? Other members won\'t see you in matches until then.')) hideProfile()
                    }}>Hide Profile (15 days)</button>
                    <button className="btn btn-outline" style={{fontSize:12,padding:'8px 14px'}} onClick={()=>setActiveTab('biodata')}>Download Biodata</button>
                  </div>
                )}

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
                    ['Have Children', profile.have_children],
                    ['Children Living With', profile.children_living_with],
                    ['Languages I Speak', Array.isArray(profile.languages_spoken) && profile.languages_spoken.length ? profile.languages_spoken.join(', ') : null],
                    ['Grew Up In', profile.grew_up_in],
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
                    ['Highest Education', profile.education],
                    ['Degree', profile.degree],
                    ['College/Institution Name', profile.college_name],
                    ['Employment Type', profile.employment_type],
                    ['Profession Category', profile.profession],
                    ['Occupation', profile.occupation],
                    ['Working As', profile.working_as],
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
                    ['Brothers', profile.brothers_count ? profile.brothers_count + ' (' + (profile.brothers_married_count || 0) + ' married)' : null],
                    ['Sisters', profile.sisters_count ? profile.sisters_count + ' (' + (profile.sisters_married_count || 0) + ' married)' : null],
                    ['Family City', profile.family_city],
                    ['Own House', profile.own_house],
                    ['House Type', profile.house_type],
                    ['Family Income Range', profile.family_income_range],
                    ['Property Type', profile.property_type],
                    ['Property Ownership', profile.property_ownership],
                    ['Property Location', [profile.property_city, profile.property_state].filter(Boolean).join(', ')],
                    ['Property Size', profile.property_size],
                    ['Vehicle Ownership', profile.vehicle_ownership],
                    ['Vehicle Details', profile.vehicle_model],
                    ['Business / Commercial Asset', profile.business_asset_type],
                    ['Business Detail', profile.business_detail],
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
                    ['Height Range', profile.partner_height_min && profile.partner_height_max ? formatHeightFromInches(profile.partner_height_min) + ' - ' + formatHeightFromInches(profile.partner_height_max) : null],
                    ['Income Range', profile.partner_income_max ? (profile.partner_income_currency === 'USD' ? '$' : '₹') + Number(profile.partner_income_min || 0).toLocaleString() + ' - ' + (profile.partner_income_currency === 'USD' ? '$' : '₹') + Number(profile.partner_income_max).toLocaleString() : null],
                    ['Religion', profile.partner_religion],
                    ['Preferred Community', Array.isArray(profile.partner_community_ids) ? profile.partner_community_ids.join(', ') : null],
                    ['Education Level', Array.isArray(profile.partner_education_level_preferences) && profile.partner_education_level_preferences.length ? profile.partner_education_level_preferences.join(', ') : null],
                    ['Location', profile.partner_location],
                    ['Preferred City', profile.partner_city_preference],
                    ['Preferred State', profile.partner_state_preference],
                    ['Preferred Country', profile.partner_country_preference && profile.partner_country_preference !== 'Open to All' ? profile.partner_country_preference : null],
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
                  <MatchCard key={m.id} match={m} viewerIsPremium={!!profile.is_premium}
                    myAction={myActions.find(a => a.target_profile_id === m.id)?.action || null}
                    introSent={myIntroductions.some(i => i.from_profile === profile.id && i.to_profile === m.id)}
                    onSetAction={(action)=>setMatchAction(m.id, action)}
                    onSendIntro={(type)=>sendIntroductionRequest(m.id, type)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* REQUESTS TAB */}
        {activeTab === 'requests' && (
          <RequestsTab myProfile={profile} introductions={myIntroductions} />
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
                  <button className="btn btn-outline" style={{width:'100%'}} onClick={()=>setActiveTab('disliked')}>
                    Disliked Profiles
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

        {/* BIODATA TAB */}
        {activeTab === 'biodata' && profile && (
          <BiodataView profile={profile} photo={photos.find(p=>p.is_primary) || photos[0]} onBack={()=>setActiveTab('home')} />
        )}

        {/* DISLIKED PROFILES TAB */}
        {activeTab === 'disliked' && profile && (
          <DislikedProfilesView myProfile={profile} dislikedActions={myActions.filter(a=>a.action==='dislike')}
            onUndo={async (id)=>{ await undoDislike(id); loadProfile() }} onBack={()=>setActiveTab('profile')} />
        )}
      </div>

      {/* Bottom Nav */}
      <div className="bottom-nav">
        {[
          {id:'home',icon:'🏠',label:'Home'},
          {id:'matches',icon:'💝',label:'Matches'},
          {id:'requests',icon:'🤝',label:'Requests'},
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

// Match card — score ke saath "Why this match?" expand karke poora
// breakdown dikhata hai (Strong Matches ✓ / Needs Discussion △) — fake
// percentage nahi, actual matching.js se aaya hua real explanation.
// ===== BIODATA — printable/shareable biodata (browser "Save as PDF" print,
// no new PDF library dependency) =====
function BiodataView({ profile: p, photo, onBack }) {
  const rows = (pairs) => pairs.filter(([,v])=>v).map(([k,v])=>(
    <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(0,0,0,0.06)',fontSize:13}}>
      <span style={{color:'#8e8e8e'}}>{k}</span>
      <span style={{fontWeight:500,textAlign:'right'}}>{v}</span>
    </div>
  ))

  return (
    <div>
      <div className="no-print" style={{display:'flex',gap:10,marginBottom:16}}>
        <button className="btn btn-outline" style={{flex:1}} onClick={onBack}>← Back</button>
        <button className="btn btn-black" style={{flex:2}} onClick={()=>window.print()}>🖨️ Print / Save as PDF</button>
      </div>

      <div style={{border:'1px solid rgba(0,0,0,0.1)',borderRadius:16,padding:24,background:'#fff'}}>
        <div style={{textAlign:'center',marginBottom:20,paddingBottom:16,borderBottom:'2px solid #000'}}>
          <div style={{fontFamily:'Cormorant Garamond',fontSize:28,fontWeight:300,letterSpacing:'0.05em'}}>LOVEKUSH</div>
          <div style={{fontSize:11,color:'#8e8e8e',letterSpacing:'0.15em',textTransform:'uppercase'}}>Matrimonial Biodata</div>
        </div>

        <div style={{display:'flex',gap:16,marginBottom:20}}>
          <div style={{width:96,height:96,borderRadius:10,background:'#f0f0f0',overflow:'hidden',flexShrink:0}}>
            {photo
              ? <SignedImage path={photo.storage_path} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
              : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:32}}>👤</div>
            }
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,fontSize:19,marginBottom:4}}>{p.full_name}</div>
            <div style={{fontSize:13,color:'#555'}}>{p.age ? p.age + ' years' : ''}{p.height ? ' • ' + p.height : ''}</div>
            <div style={{fontSize:13,color:'#555'}}>{p.city}{p.state ? ', ' + p.state : ''}</div>
            <div className="profile-code" style={{marginTop:6}}>{p.profile_code}</div>
          </div>
        </div>

        {p.about_me && (
          <div style={{marginBottom:16,fontSize:13,color:'#333',lineHeight:1.6,fontStyle:'italic'}}>
            "{p.about_me}"
          </div>
        )}

        <div style={{fontSize:12,fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',color:'#8e8e8e',marginTop:14,marginBottom:6}}>Basic Details</div>
        {rows([
          ['Marital Status', p.marital_status], ['Complexion', p.complexion], ['Body Type', p.body_type],
          ['Nationality', p.nationality], ['Mother Tongue', p.mother_tongue],
        ])}

        <div style={{fontSize:12,fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',color:'#8e8e8e',marginTop:14,marginBottom:6}}>Religious Background</div>
        {rows([
          ['Religion', p.religion], ['Community', p.community], ['Sub-Caste', p.sub_caste],
          ['Gotra', p.gotra], ['Manglik', p.manglik],
        ])}

        <div style={{fontSize:12,fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',color:'#8e8e8e',marginTop:14,marginBottom:6}}>Location, Education & Career</div>
        {rows([
          ['Living In', [p.city, p.state, p.country].filter(Boolean).join(', ')],
          ['Highest Qualification', p.education], ['Degree', p.degree], ['College', p.college_name],
          ['Occupation', p.occupation], ['Employer', p.employer], ['Annual Income', p.annual_income],
        ])}

        <div style={{fontSize:12,fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',color:'#8e8e8e',marginTop:14,marginBottom:6}}>Family Details</div>
        {rows([
          ['Family Type', p.family_type], ["Father's Profession", p.father_profession],
          ["Mother's Profession", p.mother_profession], ['Family Financial Status', p.family_financial_status],
        ])}

        <div style={{fontSize:12,fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',color:'#8e8e8e',marginTop:14,marginBottom:6}}>Contact</div>
        {rows([
          ['Contact No.', p.client_phone], ['Email ID', p.client_email || p.alternate_email],
        ])}

        <div style={{textAlign:'center',marginTop:20,paddingTop:12,borderTop:'1px solid rgba(0,0,0,0.08)',fontSize:10,color:'#b0b0b0'}}>
          Generated via LOVEKUSH Matchmaking
        </div>
      </div>
    </div>
  )
}

function MatchCard({ match: m, viewerIsPremium, myAction, introSent, onSetAction, onSendIntro }) {
  const [expanded, setExpanded] = useState(false)
  const [aboutExpanded, setAboutExpanded] = useState(false)
  const [showIntroChoice, setShowIntroChoice] = useState(false)
  const [introJustSent, setIntroJustSent] = useState(false)

  // "You match X/Y preferences" — existing matching.js strengths/needsDiscussion
  // se hi nikala, koi naya scoring logic nahi. Strength = matched, needsDiscussion
  // = evaluated but not matched; total = dono ka sum.
  const matchedCount = (m.matchStrengths || []).length
  const totalCount = matchedCount + (m.matchNeedsDiscussion || []).length

  const aboutText = m.about_me || ''
  const aboutTruncated = aboutText.length > 140 && !aboutExpanded ? aboutText.slice(0, 140) + '\u2026' : aboutText

  const handleIntro = (type) => {
    onSendIntro(type)
    setShowIntroChoice(false)
    setIntroJustSent(true)
  }

  return (
    <div style={{background:'#f5f5f5',borderRadius:14,overflow:'hidden'}}>
      <div style={{display:'flex',gap:14,alignItems:'center',padding:'14px'}}>
        <div style={{position:'relative',width:56,height:56,borderRadius:'50%',background:'#e0e0e0',overflow:'hidden',flexShrink:0}}>
          {m.primaryPhotoPath
            ? <SignedImage path={m.primaryPhotoPath} alt="" style={{width:'100%',height:'100%',objectFit:'cover', filter: viewerIsPremium ? 'none' : 'blur(6px)'}} />
            : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>\ud83d\udc64</div>
          }
          {!viewerIsPremium && m.primaryPhotoPath && (
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.15)'}}>
              <span style={{fontSize:16}}>\ud83d\udd12</span>
            </div>
          )}
        </div>
        <div style={{flex:1,cursor:'pointer'}} onClick={()=>setExpanded(!expanded)}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
            <div style={{fontWeight:600,fontSize:15}}>{m.full_name}</div>
            {typeof m.matchScore === 'number' && (
              <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,background: m.matchScore>=70?'#f0fdf4':m.matchScore>=40?'#fff8e1':'#f5f5f5', color: m.matchScore>=70?'#16a34a':m.matchScore>=40?'#b45309':'#8e8e8e'}}>
                {m.matchScore}% match
              </span>
            )}
          </div>
          <div style={{fontSize:12,color:'#8e8e8e'}}>{m.age} years \u2022 {m.city}</div>
          {totalCount > 0 && (
            <div style={{fontSize:11,color:'#4a5568',marginTop:2}}>You match {matchedCount}/{totalCount} preferences</div>
          )}
          <div style={{fontSize:10,color:'#4a5568',marginTop:3,textDecoration:'underline'}}>
            {expanded ? 'Hide details' : 'Why this match?'}
          </div>
        </div>
      </div>

      <div style={{display:'flex',gap:6,padding:'0 14px 14px'}}>
        <button className={myAction==='like' ? 'btn btn-black btn-sm' : 'btn btn-outline btn-sm'} style={{flex:1}}
          onClick={()=>onSetAction('like')}>\ud83d\udc4d Like</button>
        <button className={myAction==='super_like' ? 'btn btn-black btn-sm' : 'btn btn-outline btn-sm'} style={{flex:1}}
          onClick={()=>onSetAction('super_like')}>\u2b50 Super Like</button>
        <button className="btn btn-outline btn-sm" style={{flex:1,color:'#dc2626',borderColor:'#dc2626'}}
          onClick={()=>onSetAction('dislike')}>\ud83d\udc4e Dislike</button>
      </div>

      {expanded && (
        <div style={{padding:'0 14px 14px 84px'}}>
          {!viewerIsPremium && (
            <div style={{background:'#fff8e1',border:'1px solid #fde68a',borderRadius:10,padding:'10px 12px',marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:600,color:'#b45309',marginBottom:6}}>\ud83d\udd12 Premium members can see:</div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0'}}>
                <span style={{color:'#8e8e8e'}}>Photo</span>
                <span style={{fontWeight:500,filter:'blur(3px)',userSelect:'none'}}>\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0'}}>
                <span style={{color:'#8e8e8e'}}>Company Name</span>
                <span style={{fontWeight:500,filter:'blur(3px)',userSelect:'none'}}>\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0'}}>
                <span style={{color:'#8e8e8e'}}>College Name</span>
                <span style={{fontWeight:500,filter:'blur(3px)',userSelect:'none'}}>\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022</span>
              </div>
              <button className="btn btn-black btn-sm" style={{marginTop:8,width:'100%'}}>\ud83d\udc51 Go Premium Now</button>
            </div>
          )}
          {viewerIsPremium && (m.employer || m.college_name) && (
            <div style={{marginBottom:10}}>
              {m.employer && <div style={{fontSize:12,color:'#333',marginBottom:2}}><span style={{color:'#8e8e8e'}}>Company: </span>{m.employer}</div>}
              {m.college_name && <div style={{fontSize:12,color:'#333',marginBottom:2}}><span style={{color:'#8e8e8e'}}>College: </span>{m.college_name}</div>}
            </div>
          )}
          {aboutText && (
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:600,color:'#333',marginBottom:4}}>About</div>
              <div style={{fontSize:12,color:'#555',lineHeight:1.6}}>{aboutTruncated}</div>
              {aboutText.length > 140 && (
                <div style={{fontSize:11,color:'#4a5568',textDecoration:'underline',cursor:'pointer',marginTop:2}}
                  onClick={()=>setAboutExpanded(!aboutExpanded)}>
                  {aboutExpanded ? 'View less' : 'View more'}
                </div>
              )}
            </div>
          )}
          {m.matchStrengths && m.matchStrengths.length > 0 && (
            <div style={{marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:600,color:'#16a34a',marginBottom:4}}>Strong Matches</div>
              {m.matchStrengths.map((s,i)=>(
                <div key={i} style={{fontSize:12,color:'#333',marginBottom:2}}>\u2713 {s}</div>
              ))}
            </div>
          )}
          {m.matchNeedsDiscussion && m.matchNeedsDiscussion.length > 0 && (
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:600,color:'#b45309',marginBottom:4}}>Needs Discussion</div>
              {m.matchNeedsDiscussion.map((s,i)=>(
                <div key={i} style={{fontSize:12,color:'#333',marginBottom:2}}>\u25b3 {s}</div>
              ))}
            </div>
          )}

          {/* Talk / Meeting request — routed to a Relationship Manager, no in-app chat */}
          {introSent ? (
            <div style={{fontSize:12,color:'#16a34a',fontWeight:500}}>\u2713 Request sent \u2014 our relationship manager will contact you to coordinate.</div>
          ) : introJustSent ? (
            <div style={{fontSize:12,color:'#16a34a',fontWeight:500}}>\u2713 Request sent \u2014 our relationship manager will contact you to coordinate.</div>
          ) : showIntroChoice ? (
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-black btn-sm" style={{flex:1}} onClick={()=>handleIntro('talk')}>Request to Talk</button>
              <button className="btn btn-black btn-sm" style={{flex:1}} onClick={()=>handleIntro('meeting')}>Request a Meeting</button>
            </div>
          ) : (
            <button className="btn btn-outline btn-sm" style={{width:'100%'}} onClick={()=>setShowIntroChoice(true)}>Request to Talk / Meet</button>
          )}
        </div>
      )}
    </div>
  )
}

// ===== REQUESTS TAB — Talk/Meeting requests (Sent + Received), routed to a
// Relationship Manager instead of in-app chat =====
// ===== DISLIKED PROFILES — undo a Dislike so the profile can reappear in matches =====
function DislikedProfilesView({ myProfile, dislikedActions, onUndo, onBack }) {
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ids = dislikedActions.map(a => a.target_profile_id)
    if (ids.length === 0) { setLoading(false); return }
    supabase.from('profiles_public_view').select('id, full_name, city').in('id', ids).then(({ data }) => {
      const map = {}
      ;(data || []).forEach(p => { map[p.id] = p })
      setProfilesById(map)
      setLoading(false)
    })
  }, [])

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
        <button onClick={onBack} style={{background:'none',border:'none',fontSize:20,cursor:'pointer'}}>←</button>
        <h2 style={{fontFamily:'Cormorant Garamond',fontSize:24,fontWeight:300,margin:0}}>Disliked Profiles</h2>
      </div>
      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : dislikedActions.length === 0 ? (
        <div style={{textAlign:'center',padding:'60px 0',color:'#8e8e8e',fontSize:13}}>No disliked profiles</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {dislikedActions.map(a => {
            const p = profilesById[a.target_profile_id]
            return (
              <div key={a.target_profile_id} style={{padding:'14px',background:'#f5f5f5',borderRadius:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:14,fontWeight:500}}>{p ? p.full_name + (p.city ? ' • ' + p.city : '') : 'Profile'}</span>
                <button className="btn btn-outline btn-sm" onClick={()=>onUndo(a.target_profile_id)}>Undo</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RequestsTab({ myProfile, introductions }) {
  const [subTab, setSubTab] = useState('received') // 'received' | 'sent'
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfileNames()
  }, [introductions])

  const loadProfileNames = async () => {
    const ids = [...new Set(introductions.flatMap(i => [i.from_profile, i.to_profile]))]
      .filter(id => id !== myProfile.id)
    if (ids.length === 0) { setLoading(false); return }
    const { data } = await supabase.from('profiles_public_view').select('id, full_name').in('id', ids)
    const map = {}
    ;(data || []).forEach(p => { map[p.id] = p.full_name })
    setProfilesById(map)
    setLoading(false)
  }

  const received = introductions.filter(i => i.to_profile === myProfile.id)
  const sent = introductions.filter(i => i.from_profile === myProfile.id)

  return (
    <div>
      <h2 style={{fontFamily:'Cormorant Garamond',fontSize:26,fontWeight:300,marginBottom:16}}>Requests</h2>

      <div style={{display:'flex',gap:4,marginBottom:18,borderBottom:'1px solid rgba(0,0,0,0.08)'}}>
        {['received','sent'].map(t=>(
          <button key={t} onClick={()=>setSubTab(t)}
            style={{padding:'8px 14px',border:'none',background:'transparent',fontSize:13,
              fontWeight:subTab===t?600:400, color:subTab===t?'#000':'#8e8e8e',
              borderBottom:subTab===t?'2px solid #000':'2px solid transparent',
              cursor:'pointer',textTransform:'capitalize'}}>
            {t === 'received' && received.length>0 ? `Received (${received.length})` : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : subTab === 'received' ? (
        received.length === 0 ? (
          <div style={{textAlign:'center',padding:'60px 0',color:'#8e8e8e'}}>
            <div style={{fontSize:48,marginBottom:16}}>\ud83e\udd1d</div>
            <div style={{fontSize:16,marginBottom:8}}>No requests yet</div>
            <div style={{fontSize:13}}>When someone wants to talk or meet, it'll show here</div>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {received.map(i => (
              <div key={i.id} style={{padding:'14px',background:'#f5f5f5',borderRadius:12}}>
                <div style={{fontSize:14,fontWeight:500,marginBottom:6}}>{profilesById[i.from_profile] || 'A member'}</div>
                <div style={{fontSize:12,color:'#555',lineHeight:1.6}}>
                  Interested in {i.request_type === 'meeting' ? 'meeting' : 'talking to'} you. Our relationship manager will contact you shortly to coordinate.
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        sent.length === 0 ? (
          <div style={{textAlign:'center',padding:'60px 0',color:'#8e8e8e',fontSize:13}}>No requests sent yet</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {sent.map(i => (
              <div key={i.id} style={{padding:'14px',background:'#f5f5f5',borderRadius:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:14,fontWeight:500}}>{profilesById[i.to_profile] || 'Profile'}</div>
                  <div style={{fontSize:11,color:'#8e8e8e',textTransform:'capitalize'}}>{i.request_type === 'meeting' ? 'Meeting request' : 'Talk request'}</div>
                </div>
                <span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,
                  background: i.status==='closed'?'#f5f5f5':i.status==='contacted'?'#f0fdf4':'#fff8e1',
                  color: i.status==='closed'?'#8e8e8e':i.status==='contacted'?'#16a34a':'#b45309',
                  textTransform:'capitalize'}}>{i.status}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

export function EditProfileForm({ profile, user, onSave, onCancel }) {
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
    community_privacy: profile.community_privacy || 'Matches Only',
    islamic_denomination: profile.islamic_denomination || '',
    islamic_school_of_thought: profile.islamic_school_of_thought || '',
    islamic_shia_branch: profile.islamic_shia_branch || '',
    islamic_sub_caste_division: profile.islamic_sub_caste_division || 'Not Applicable',
    christian_denomination: profile.christian_denomination || '',
    religion_denomination: profile.religion_denomination || '',
    religion_denomination_2: profile.religion_denomination_2 || '',
    custom_caste_text: profile.custom_caste_text || '',
    custom_caste_text_gotra: '',
    gotra_other: '',
    mother_tongue: profile.mother_tongue || '',
    mother_tongue_other: '',
    height: profile.height || '',
    weight: profile.weight || '',
    complexion: profile.complexion || '',
    body_type: profile.body_type || 'Average',
    marital_status: profile.marital_status || 'Never Married',
    nationality: profile.nationality || 'India',
    physical_disability: profile.physical_disability || 'No',
    blood_group: profile.blood_group || '',
    health_info: profile.health_info || '',
    birth_time: profile.birth_time || '',
    birth_place: profile.birth_place || '',
    astrology_consent: profile.astrology_consent || false,
    horoscope_match_required: profile.horoscope_match_required || '',
    profession: profile.profession || '',
    languages_spoken: profile.languages_spoken || [],
    have_children: profile.have_children || '', children_living_with: profile.children_living_with || '',
    grew_up_in: profile.grew_up_in || '',
    hobbies_interests: profile.hobbies_interests || [],
    cuisines: profile.cuisines || [],
    sports: profile.sports || [],
    profile_managed_by: profile.profile_managed_by || '',
    family_status: profile.family_status || '',
    living_with_parents: profile.living_with_parents || '',
    alternate_email: profile.alternate_email || '',
    working_as: profile.working_as || '',
    zip_code: profile.zip_code || '',
    ethnic_origin: profile.ethnic_origin || '',
    country_of_birth: profile.country_of_birth || '',
    time_of_birth_accuracy: profile.time_of_birth_accuracy || '',
    caste_no_bar: profile.caste_no_bar || '',
    favourite_music: profile.favourite_music || [],
    favourite_books: profile.favourite_books || [],
    dress_style: profile.dress_style || '',
    family_financial_status: profile.family_financial_status || '',
    company_privacy: profile.company_privacy || 'Matches Only',
    college_privacy: profile.college_privacy || 'Matches Only',
    income_privacy: profile.income_privacy || 'Private',
    contact_privacy: profile.contact_privacy || 'Matches Only',
    disability_details: profile.disability_details || '',
    sub_caste: profile.sub_caste || '',
    gotra: profile.gotra || '',
    manglik: profile.manglik || '',
    kundli_available: profile.kundli_available || '',
    native_place: profile.native_place || '',
    current_address: profile.current_address || '',
    relocation_preference: profile.relocation_preference || '',
    education: profile.education || '',
    degree: profile.degree || '', degree_other: '',
    college_name: profile.college_name || '',
    occupation: profile.occupation || '',
    employment_type: profile.employment_type || '',
    work_location: profile.work_location || '',
    employer: profile.employer || '',
    annual_income: profile.annual_income || '',
    annual_income_currency: profile.annual_income_currency || 'INR',
    diet: profile.diet || '',
    smoking: profile.smoking || '',
    drinking: profile.drinking || '',
    hobbies: profile.hobbies || '',
    about_me: profile.about_me || '',
    family_type: profile.family_type || '',
    family_values: profile.family_values || '',
    father_profession: profile.father_profession || '', father_profession_other: '',
    mother_profession: profile.mother_profession || '', mother_profession_other: '',
    siblings: profile.siblings || '',
    brothers_count: profile.brothers_count || 0, brothers_married_count: profile.brothers_married_count || 0,
    sisters_count: profile.sisters_count || 0, sisters_married_count: profile.sisters_married_count || 0,
    family_city: profile.family_city || '',
    own_house: profile.own_house || '',
    house_type: profile.house_type || '',
    property_type: profile.property_type || '', property_ownership: profile.property_ownership || '',
    property_city: profile.property_city || '', property_state: profile.property_state || '',
    property_country: profile.property_country || 'India', property_size: profile.property_size || '',
    property_privacy: profile.property_privacy || 'Matches Only',
    vehicle_ownership: profile.vehicle_ownership || '', vehicle_model: profile.vehicle_model || '',
    business_asset_type: profile.business_asset_type || '', business_detail: profile.business_detail || '',
    business_privacy: profile.business_privacy || 'Private',
    family_income_range: profile.family_income_range || '',
    family_income_currency: profile.family_income_currency || 'INR',
    partner_age_min: profile.partner_age_min || 18,
    partner_age_max: profile.partner_age_max || 40,
    partner_height_min: profile.partner_height_min || PARTNER_HEIGHT_MIN_INCHES,
    partner_height_max: profile.partner_height_max || PARTNER_HEIGHT_MAX_INCHES,
    partner_income_min: profile.partner_income_min || PARTNER_INCOME_BOUNDS.INR.min,
    partner_income_max: profile.partner_income_max || PARTNER_INCOME_BOUNDS.INR.max,
    partner_income_currency: profile.partner_income_currency || 'INR',
    partner_city_preference: profile.partner_city_preference || '',
    partner_state_preference: profile.partner_state_preference || '',
    partner_country_preference: profile.partner_country_preference || 'Open to All',
    partner_religion: profile.partner_religion || 'Any',
    partner_community_ids: profile.partner_community_ids || [],
    partner_location: profile.partner_location || '',
    partner_education: profile.partner_education || 'Any',
    partner_education_level_preferences: profile.partner_education_level_preferences || [],
    partner_notes: profile.partner_notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  const setCommunity = (v) => setForm(p=>({
    ...p,
    community: v,
    community_privacy: (SENSITIVE_COMMUNITIES.includes(v) && p.community_privacy === 'Matches Only')
      ? 'Private'
      : p.community_privacy,
  }))

  // "Any Community / No Bar" ek exclusive flag hai — usse select karte
  // hi baaki sab communities unselect ho jaati hain, aur ussi ke baad
  // koi aur community select karo to No Bar apne aap hat jaata hai.
  const setPartnerCommunity = (newSelected) => {
    const wasNoBar = form.partner_community_ids.includes(PARTNER_COMMUNITY_NO_BAR)
    const isNoBar = newSelected.includes(PARTNER_COMMUNITY_NO_BAR)
    if (isNoBar && !wasNoBar) {
      set('partner_community_ids', [PARTNER_COMMUNITY_NO_BAR])
    } else if (isNoBar && newSelected.length > 1) {
      set('partner_community_ids', newSelected.filter(v => v !== PARTNER_COMMUNITY_NO_BAR))
    } else {
      set('partner_community_ids', newSelected)
    }
  }

  // Brothers/Sisters counts — hardcoded 0-10 range mein clamp karte hain
  // (sirf HTML max attribute pe bharosa nahi karte, kyunki user type karke
  // usse bypass kar sakta hai), aur married count kabhi total count se
  // zyada nahi ho sakta.
  const setSiblingCount = (field, rawValue) => {
    let n = parseInt(rawValue, 10)
    if (isNaN(n) || n < 0) n = 0
    if (n > 10) n = 10
    setForm(p => {
      const next = { ...p, [field]: n }
      if (field === 'brothers_count' && next.brothers_married_count > n) next.brothers_married_count = n
      if (field === 'sisters_count' && next.sisters_married_count > n) next.sisters_married_count = n
      if (field === 'brothers_married_count' && n > p.brothers_count) next.brothers_married_count = p.brothers_count
      if (field === 'sisters_married_count' && n > p.sisters_count) next.sisters_married_count = p.sisters_count
      return next
    })
  }

  // "Others / Not in list" (community/gotra) — fire-and-forget, doesn't
  // block save. Increments times_suggested if the same name was already
  // suggested for this religion.
  const suggestCaste = ({ religion, denomination, suggested_name, field_type }) => {
    if (!suggested_name) return
    supabase.rpc('upsert_caste_suggestion', {
      p_religion: religion, p_denomination: denomination || null,
      p_suggested_name: suggested_name, p_field_type: field_type,
      p_submitted_by: profile.id || null,
    }).then(({ error }) => { if (error) console.error(error.message) })
  }

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
      const communityIsOther = form.community === 'Other' || form.community === 'Others / Not in list'
      const finalCommunity = communityIsOther ? (form.community_other || form.custom_caste_text) : form.community
      const finalMotherTongue = form.mother_tongue === 'Other' ? form.mother_tongue_other : form.mother_tongue
      const gotraIsOther = form.gotra === 'Other' || form.gotra === 'Others / Not in list'
      const finalGotra = gotraIsOther ? (form.gotra_other || form.custom_caste_text_gotra) : form.gotra
      const degreeIsOther = form.degree === 'Others / Not in list'
      const finalDegree = degreeIsOther ? form.degree_other : form.degree
      const finalFatherProfession = form.father_profession === 'Other' ? form.father_profession_other : form.father_profession
      const finalMotherProfession = form.mother_profession === 'Other' ? form.mother_profession_other : form.mother_profession

      const denominationValue = form.islamic_denomination || form.christian_denomination || form.religion_denomination || null

      if (communityIsOther && (form.community_other || form.custom_caste_text)) {
        suggestCaste({
          religion: form.religion, denomination: denominationValue,
          suggested_name: form.community_other || form.custom_caste_text, field_type: 'caste',
        })
      }
      if (gotraIsOther && (form.gotra_other || form.custom_caste_text_gotra)) {
        suggestCaste({
          religion: form.religion, denomination: denominationValue,
          suggested_name: form.gotra_other || form.custom_caste_text_gotra, field_type: 'gotra',
        })
      }
      if (degreeIsOther && form.degree_other) {
        suggestCaste({
          religion: form.religion, denomination: denominationValue,
          suggested_name: form.degree_other, field_type: 'degree',
        })
      }

      const { community_other, mother_tongue_other, gotra_other, custom_caste_text_gotra,
        father_profession_other, mother_profession_other, ...formToSave } = form

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
          gotra: finalGotra,
          degree: finalDegree,
          father_profession: finalFatherProfession,
          mother_profession: finalMotherProfession,
          age: ageCheck.age,
          partner_age_min: parseInt(form.partner_age_min) || null,
          partner_age_max: parseInt(form.partner_age_max) || null,
          partner_height_min: parseInt(form.partner_height_min) || null,
          partner_height_max: parseInt(form.partner_height_max) || null,
          partner_income_min: parseInt(form.partner_income_min) || null,
          partner_income_max: parseInt(form.partner_income_max) || null,
          profile_completeness: breakdown.overall,
          completeness_breakdown: breakdown,
        })
        .eq('id', profile.id)
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
              <option value="">Select</option>
              {BODY_TYPES.map(b=><option key={b}>{b}</option>)}
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
              {COUNTRIES.filter(c=>c!=='Open to All').map(n=><option key={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Have Children?</label>
            <select className="form-select" value={form.have_children} onChange={e=>set('have_children',e.target.value)}>
              <option value="">Select</option>
              {HAVE_CHILDREN_OPTIONS.map(h=><option key={h}>{h}</option>)}
            </select>
          </div>
          {form.have_children === 'Yes' && (
            <div className="form-group">
              <label className="form-label">Children Living With</label>
              <select className="form-select" value={form.children_living_with} onChange={e=>set('children_living_with',e.target.value)}>
                <option value="">Select</option>
                {CHILDREN_LIVING_WITH_OPTIONS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
          )}
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
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Blood Group</label>
            <select className="form-select" value={form.blood_group} onChange={e=>set('blood_group',e.target.value)}>
              <option value="">Select</option>
              {BLOOD_GROUPS.map(b=><option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Health Information</label>
            <select className="form-select" value={form.health_info} onChange={e=>set('health_info',e.target.value)}>
              <option value="">Select</option>
              {HEALTH_INFO_OPTIONS.map(h=><option key={h}>{h}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Languages I Speak</label>
          <CheckboxDropdown options={LANGUAGES_SPOKEN} selected={form.languages_spoken}
            onChange={v=>set('languages_spoken',v)} placeholder="Select languages..." />
        </div>
        <div className="form-group">
          <label className="form-label">Grew Up In</label>
          <select className="form-select" value={form.grew_up_in} onChange={e=>set('grew_up_in',e.target.value)}>
            <option value="">Select</option>
            {GREW_UP_IN_OPTIONS.map(g=><option key={g}>{g}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="section-label" style={{marginBottom:14}}>Horoscope</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Birth Time</label>
            <input className="form-input" type="time" value={form.birth_time} onChange={e=>set('birth_time',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Time of Birth Accuracy</label>
            <select className="form-select" value={form.time_of_birth_accuracy} onChange={e=>set('time_of_birth_accuracy',e.target.value)}>
              <option value="">Select</option>
              {TIME_OF_BIRTH_ACCURACY.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Birth Place (City)</label>
            <input className="form-input" value={form.birth_place} onChange={e=>set('birth_place',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Country of Birth</label>
            <select className="form-select" value={form.country_of_birth} onChange={e=>set('country_of_birth',e.target.value)}>
              <option value="">Select</option>
              {COUNTRIES.filter(c=>c!=='Open to All').map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Horoscope Match Required?</label>
          <select className="form-select" value={form.horoscope_match_required} onChange={e=>set('horoscope_match_required',e.target.value)}>
            <option value="">Select</option>
            <option>Yes</option><option>No</option><option>Flexible</option>
          </select>
        </div>
        <div className="form-group" style={{display:'flex',alignItems:'flex-start',gap:8}}>
          <input type="checkbox" id="astro_consent_edit" checked={form.astrology_consent}
            onChange={e=>set('astrology_consent',e.target.checked)} style={{marginTop:3}} />
          <label htmlFor="astro_consent_edit" style={{fontSize:12,color:'#555',cursor:'pointer'}}>
            I consent to LOVEKUSH collecting, processing and analysing my astrology/birth details for kundli-matching purposes.
          </label>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="section-label" style={{marginBottom:14}}>Religion & Community</div>
        <div className="form-group">
          <label className="form-label">Religion</label>
          <select className="form-select" value={form.religion} onChange={e=>set('religion',e.target.value)}>
            {RELIGIONS.map(r=><option key={r}>{r}</option>)}
          </select>
        </div>
        {form.religion === 'Muslim' && (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Denomination / Sect</label>
              <select className="form-select" value={form.islamic_denomination}
                onChange={e=>set('islamic_denomination',e.target.value)}>
                <option value="">Select</option>
                {ISLAMIC_DENOMINATIONS.map(d=><option key={d}>{d}</option>)}
              </select>
            </div>
            {form.islamic_denomination === 'Sunni' && (
              <div className="form-group">
                <label className="form-label">School of Thought (Madhab)</label>
                <select className="form-select" value={form.islamic_school_of_thought}
                  onChange={e=>set('islamic_school_of_thought',e.target.value)}>
                  <option value="">Select</option>
                  {SUNNI_SCHOOLS_OF_THOUGHT.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            )}
            {form.islamic_denomination === 'Shia' && (
              <div className="form-group">
                <label className="form-label">Shia Branch</label>
                <select className="form-select" value={form.islamic_shia_branch}
                  onChange={e=>set('islamic_shia_branch',e.target.value)}>
                  <option value="">Select</option>
                  {SHIA_BRANCHES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        {form.religion === 'Christian' && (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Denomination</label>
              <select className="form-select" value={form.christian_denomination}
                onChange={e=>set('christian_denomination',e.target.value)}>
                <option value="">Select</option>
                {CHRISTIAN_DENOMINATION_GROUPS.map(g=>(
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map(d=><option key={d}>{d}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        )}
        {RELIGION_HIERARCHY[form.religion] && (
          <div className="form-row">
            {RELIGION_HIERARCHY[form.religion].denomination && (
              <div className="form-group">
                <label className="form-label">{RELIGION_HIERARCHY[form.religion].denomination.label}</label>
                <select className="form-select" value={form.religion_denomination}
                  onChange={e=>set('religion_denomination',e.target.value)}>
                  <option value="">Select</option>
                  {RELIGION_HIERARCHY[form.religion].denomination.options.map(d=><option key={d}>{d}</option>)}
                </select>
              </div>
            )}
            {form.religion === 'Zoroastrian' && (
              <div className="form-group">
                <label className="form-label">{RELIGION_HIERARCHY[form.religion].community.label}</label>
                <select className="form-select" value={form.religion_denomination_2}
                  onChange={e=>set('religion_denomination_2',e.target.value)}>
                  <option value="">Select</option>
                  {RELIGION_HIERARCHY[form.religion].community.options.map(d=><option key={d}>{d}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        <div className="form-row">
          {!NO_RELIGION_VALUES.includes(form.religion) && form.religion !== 'Zoroastrian' && (
            <div className="form-group">
              <label className="form-label">{RELIGION_HIERARCHY[form.religion]?.community.label || 'Community / Caste'}</label>
              <select className="form-select" value={form.community} onChange={e=>setCommunity(e.target.value)}>
                <option value="">Select</option>
                {(form.religion === 'Muslim' ? ISLAMIC_COMMUNITIES
                  : form.religion === 'Christian' ? CHRISTIAN_COMMUNITIES
                  : RELIGION_HIERARCHY[form.religion]?.community.options
                  || CASTES).map(c=><option key={c}>{c}</option>)}
              </select>
              {form.community === 'Other' && (
                <input className="form-input" style={{marginTop:8}} placeholder="Apni Caste/Community likhein"
                  value={form.community_other} onChange={e=>set('community_other',e.target.value)} />
              )}
              {form.community === 'Others / Not in list' && (
                <input className="form-input" style={{marginTop:8}} placeholder="Apni jati/community ka naam likhein"
                  value={form.custom_caste_text} onChange={e=>set('custom_caste_text',e.target.value)} />
              )}
              {SENSITIVE_COMMUNITIES.includes(form.community) && (
                <div className="form-hint">{SENSITIVE_COMMUNITY_NOTE}</div>
              )}
            </div>
          )}
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
        {form.religion === 'Muslim' && (
          <div className="form-group">
            <label className="form-label">Sub-Caste / Division</label>
            <select className="form-select" value={form.islamic_sub_caste_division}
              onChange={e=>set('islamic_sub_caste_division',e.target.value)}>
              {ISLAMIC_SUB_CASTE_DIVISIONS.map(s=><option key={s}>{s}</option>)}
            </select>
            <div className="form-hint">Optional — sab communities ke liye applicable nahi hota</div>
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Sub-Caste</label>
            <input className="form-input" value={form.sub_caste} onChange={e=>set('sub_caste',e.target.value)} />
          </div>
          {(form.religion === 'Hindu' || form.religion === 'Jain') && (
            <div className="form-group">
              <label className="form-label">Gotra</label>
              <select className="form-select" value={form.gotra} onChange={e=>set('gotra',e.target.value)}>
                <option value="">Select</option>
                {(form.religion === 'Hindu' ? GOTRAS : JAIN_GOTRAS).map(g=><option key={g}>{g}</option>)}
              </select>
              {form.gotra === 'Other' && (
                <input className="form-input" style={{marginTop:8}} placeholder="Apna Gotra likhein"
                  value={form.gotra_other} onChange={e=>set('gotra_other',e.target.value)} />
              )}
              {form.gotra === 'Others / Not in list' && (
                <input className="form-input" style={{marginTop:8}} placeholder="Apna Gotra likhein"
                  value={form.custom_caste_text_gotra} onChange={e=>set('custom_caste_text_gotra',e.target.value)} />
              )}
            </div>
          )}
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
        <div className="form-group">
          <label className="form-label">Caste No Bar?</label>
          <select className="form-select" value={form.caste_no_bar} onChange={e=>set('caste_no_bar',e.target.value)}>
            <option value="">Select</option>
            {CASTE_NO_BAR_OPTIONS.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="section-label" style={{marginBottom:14}}>Location Details</div>
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
            <label className="form-label">Zip / PIN Code</label>
            <input className="form-input" value={form.zip_code} onChange={e=>set('zip_code',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Ethnic Origin</label>
            <input className="form-input" value={form.ethnic_origin} onChange={e=>set('ethnic_origin',e.target.value)} />
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
          <label className="form-label">Highest Education *</label>
          <select className="form-select" value={form.education} onChange={e=>set('education',e.target.value)}>
            {EDUCATIONS.map(e=><option key={e}>{e}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Degree</label>
          <select className="form-select" value={form.degree} onChange={e=>set('degree',e.target.value)}>
            <option value="">Select</option>
            {Object.entries(DEGREE_OPTIONS).map(([cat, options]) => (
              <optgroup key={cat} label={cat}>
                {options.map(d=><option key={d}>{d}</option>)}
              </optgroup>
            ))}
          </select>
          {form.degree === 'Others / Not in list' && (
            <input className="form-input" style={{marginTop:8}} placeholder="Apni degree likhein"
              value={form.degree_other} onChange={e=>set('degree_other',e.target.value)} />
          )}
        </div>
        <div className="form-group">
          <label className="form-label">College/Institution Name</label>
          <input className="form-input" value={form.college_name} onChange={e=>set('college_name',e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Employment Type</label>
            <select className="form-select" value={form.employment_type} onChange={e=>set('employment_type',e.target.value)}>
              <option value="">Select</option>
              {EMPLOYMENT_TYPES.map(e=><option key={e}>{e}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Profession Category</label>
            <select className="form-select" value={form.profession} onChange={e=>set('profession',e.target.value)}>
              <option value="">Select</option>
              {PROFESSION_CATEGORIES.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Occupation</label>
            <input className="form-input" value={form.occupation} onChange={e=>set('occupation',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Working As</label>
            <select className="form-select" value={form.working_as} onChange={e=>set('working_as',e.target.value)}>
              <option value="">Select</option>
              {WORKING_AS_OPTIONS.map(w=><option key={w}>{w}</option>)}
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
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Annual Income</label>
            <select className="form-select" value={form.annual_income} onChange={e=>set('annual_income',e.target.value)}>
              {(form.annual_income_currency === 'USD' ? USD_INCOME_RANGES : INCOME_RANGES).map(i=><option key={i}>{i}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Currency</label>
            <select className="form-select" value={form.annual_income_currency} onChange={e=>{
              setForm(p=>({...p, annual_income_currency:e.target.value, annual_income:''}))
            }}>
              {CURRENCIES.map(c=><option key={c} value={c}>{c === 'INR' ? '₹ INR' : '$ USD'}</option>)}
            </select>
          </div>
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
          <label className="form-label">Hobbies (short text)</label>
          <input className="form-input" value={form.hobbies} onChange={e=>set('hobbies',e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Interests (select up to {HOBBIES_MAX_SELECT})</label>
          <MultiSelectChips groups={HOBBIES_INTERESTS} selected={form.hobbies_interests}
            onChange={(v)=>set('hobbies_interests',v)} maxSelect={HOBBIES_MAX_SELECT} />
        </div>
        <div className="form-group">
          <label className="form-label">Favourite Cuisines</label>
          <MultiSelectChips options={CUISINES} selected={form.cuisines} onChange={(v)=>set('cuisines',v)} />
        </div>
        <div className="form-group">
          <label className="form-label">Sports & Activities</label>
          <MultiSelectChips options={SPORTS_LIST} selected={form.sports} onChange={(v)=>set('sports',v)} />
        </div>
        <div className="form-group">
          <label className="form-label">Favourite Music</label>
          <MultiSelectChips options={FAVOURITE_MUSIC} selected={form.favourite_music} onChange={(v)=>set('favourite_music',v)} />
        </div>
        <div className="form-group">
          <label className="form-label">Favourite Books</label>
          <MultiSelectChips options={FAVOURITE_BOOKS} selected={form.favourite_books} onChange={(v)=>set('favourite_books',v)} />
        </div>
        <div className="form-group">
          <label className="form-label">Dress Style</label>
          <select className="form-select" value={form.dress_style} onChange={e=>set('dress_style',e.target.value)}>
            <option value="">Select</option>
            {DRESS_STYLES.map(d=><option key={d}>{d}</option>)}
          </select>
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
            <select className="form-select" value={form.father_profession} onChange={e=>set('father_profession',e.target.value)}>
              <option value="">Select</option>
              {PROFESSION_CATEGORIES.map(p=><option key={p}>{p}</option>)}
              <option value="Retired">Retired</option>
              <option value="Other">Other</option>
              <option value="Passed Away">Passed Away</option>
            </select>
            {form.father_profession === 'Other' && (
              <input className="form-input" style={{marginTop:8}} placeholder="Please specify"
                value={form.father_profession_other} onChange={e=>set('father_profession_other',e.target.value)} />
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Mother's Profession</label>
            <select className="form-select" value={form.mother_profession} onChange={e=>set('mother_profession',e.target.value)}>
              <option value="">Select</option>
              <option value="Homemaker">Homemaker</option>
              {PROFESSION_CATEGORIES.map(p=><option key={p}>{p}</option>)}
              <option value="Retired">Retired</option>
              <option value="Other">Other</option>
              <option value="Passed Away">Passed Away</option>
            </select>
            {form.mother_profession === 'Other' && (
              <input className="form-input" style={{marginTop:8}} placeholder="Please specify"
                value={form.mother_profession_other} onChange={e=>set('mother_profession_other',e.target.value)} />
            )}
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Brothers</label>
            <select className="form-select" value={form.brothers_count}
              onChange={e=>setSiblingCount('brothers_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Brothers Married</label>
            <select className="form-select" value={form.brothers_married_count}
              onChange={e=>setSiblingCount('brothers_married_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.filter(n=>n<=form.brothers_count).map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Sisters</label>
            <select className="form-select" value={form.sisters_count}
              onChange={e=>setSiblingCount('sisters_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Sisters Married</label>
            <select className="form-select" value={form.sisters_married_count}
              onChange={e=>setSiblingCount('sisters_married_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.filter(n=>n<=form.sisters_count).map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Family City</label>
          <input className="form-input" value={form.family_city} onChange={e=>set('family_city',e.target.value)} />
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
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Family Income Range</label>
            <select className="form-select" value={form.family_income_range} onChange={e=>set('family_income_range',e.target.value)}>
              <option value="">Select</option>
              {(form.family_income_currency === 'USD' ? USD_FAMILY_INCOME_RANGES : FAMILY_INCOME_RANGES).map(f=><option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Currency</label>
            <select className="form-select" value={form.family_income_currency} onChange={e=>{
              setForm(p=>({...p, family_income_currency:e.target.value, family_income_range:''}))
            }}>
              {CURRENCIES.map(c=><option key={c} value={c}>{c === 'INR' ? '₹ INR' : '$ USD'}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Property Type</label>
            <select className="form-select" value={form.property_type} onChange={e=>set('property_type',e.target.value)}>
              <option value="">Select</option>
              {PROPERTY_TYPES.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Property Ownership</label>
            <select className="form-select" value={form.property_ownership} onChange={e=>set('property_ownership',e.target.value)}>
              <option value="">Select</option>
              {PROPERTY_OWNERSHIP.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Property City</label>
            <input className="form-input" value={form.property_city} onChange={e=>set('property_city',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Property State</label>
            <input className="form-input" value={form.property_state} onChange={e=>set('property_state',e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Property Country</label>
            <input className="form-input" value={form.property_country} onChange={e=>set('property_country',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Property Size</label>
            <input className="form-input" placeholder="Optional, e.g. 1200 sq.ft" value={form.property_size} onChange={e=>set('property_size',e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Vehicle Ownership</label>
            <select className="form-select" value={form.vehicle_ownership} onChange={e=>set('vehicle_ownership',e.target.value)}>
              <option value="">Select</option>
              {VEHICLE_OWNERSHIP.map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Vehicle Details</label>
            <input className="form-input" placeholder="Optional, e.g. Hyundai Creta" value={form.vehicle_model} onChange={e=>set('vehicle_model',e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Business / Commercial Asset</label>
            <select className="form-select" value={form.business_asset_type} onChange={e=>set('business_asset_type',e.target.value)}>
              <option value="">Select</option>
              {BUSINESS_ASSET_TYPES.map(b=><option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Business Detail</label>
            <input className="form-input" placeholder="Optional, e.g. Garment Business" value={form.business_detail} onChange={e=>set('business_detail',e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Family Status</label>
          <select className="form-select" value={form.family_status} onChange={e=>set('family_status',e.target.value)}>
            <option value="">Select</option>
            {FAMILY_STATUS_OPTIONS.map(f=><option key={f}>{f}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Family Financial Status</label>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {FAMILY_FINANCIAL_STATUS.map(f=>{
              const isSelected = form.family_financial_status === f.label
              return (
                <div key={f.label} onClick={()=>set('family_financial_status', f.label)}
                  style={{border:'1.5px solid ' + (isSelected ? '#000' : 'rgba(0,0,0,0.1)'), borderRadius:10, overflow:'hidden', cursor:'pointer'}}>
                  <div style={{padding:'12px 16px', fontWeight:600, fontSize:14,
                    background: isSelected ? '#000' : 'transparent', color: isSelected ? '#fff' : '#333'}}>
                    {isSelected ? '◉' : '○'} {f.label}
                  </div>
                  {isSelected && (
                    <div style={{padding:'10px 16px 14px', fontSize:12, color:'#555', lineHeight:1.6}}>
                      <div>{f.desc}</div>
                      <div style={{marginTop:4, fontWeight:500}}>Annual family income: {f.range}</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Living With Parents?</label>
          <select className="form-select" value={form.living_with_parents} onChange={e=>set('living_with_parents',e.target.value)}>
            <option value="">Select</option>
            {LIVING_WITH_PARENTS_OPTIONS.map(l=><option key={l}>{l}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Profile Managed By</label>
            <select className="form-select" value={form.profile_managed_by} onChange={e=>set('profile_managed_by',e.target.value)}>
              <option value="">Select</option>
              {PROFILE_MANAGED_BY.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Alternate Email</label>
            <input className="form-input" value={form.alternate_email} onChange={e=>set('alternate_email',e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="section-label" style={{marginBottom:14}}>Partner Preferences</div>
        <div className="form-group">
          <label className="form-label">Age Preference</label>
          <DualRangeSlider min={18} max={70}
            valueMin={form.partner_age_min} valueMax={form.partner_age_max}
            onChange={(lo,hi)=>setForm(p=>({...p, partner_age_min:lo, partner_age_max:hi}))}
            formatLabel={v=>v+' yrs'} />
        </div>
        <div className="form-group">
          <label className="form-label">Height Preference</label>
          <DualRangeSlider min={PARTNER_HEIGHT_MIN_INCHES} max={PARTNER_HEIGHT_MAX_INCHES}
            valueMin={form.partner_height_min} valueMax={form.partner_height_max}
            onChange={(lo,hi)=>setForm(p=>({...p, partner_height_min:lo, partner_height_max:hi}))}
            formatLabel={formatHeightFromInches} />
        </div>
        <div className="form-group">
          <label className="form-label">Income Preference</label>
          <select className="form-select" value={form.partner_income_currency} onChange={e=>{
            const bounds = PARTNER_INCOME_BOUNDS[e.target.value]
            setForm(p=>({...p, partner_income_currency:e.target.value, partner_income_min:bounds.min, partner_income_max:bounds.max}))
          }} style={{marginBottom:8, maxWidth:140}}>
            {CURRENCIES.map(c=><option key={c} value={c}>{c === 'INR' ? '₹ INR' : '$ USD'}</option>)}
          </select>
          <DualRangeSlider min={PARTNER_INCOME_BOUNDS[form.partner_income_currency].min}
            max={PARTNER_INCOME_BOUNDS[form.partner_income_currency].max}
            valueMin={form.partner_income_min} valueMax={form.partner_income_max}
            onChange={(lo,hi)=>setForm(p=>({...p, partner_income_min:lo, partner_income_max:hi}))}
            formatLabel={v=>{
              const symbol = form.partner_income_currency === 'INR' ? '₹' : '$'
              const isMax = v === PARTNER_INCOME_BOUNDS[form.partner_income_currency].max
              return symbol + v.toLocaleString(form.partner_income_currency === 'INR' ? 'en-IN' : 'en-US') + (isMax ? '+' : '')
            }} />
        </div>
        <div className="form-group">
          <label className="form-label">Religion Preference</label>
          <select className="form-select" value={form.partner_religion} onChange={e=>set('partner_religion',e.target.value)}>
            <option value="Any">Any / Open to all</option>
            {RELIGIONS.map(r=><option key={r}>{r}</option>)}
          </select>
        </div>
        {form.partner_religion !== 'Any' && (
          <div className="form-group">
            <label className="form-label">Preferred Community</label>
            <MultiSelectChips
              options={[
                ...(form.partner_religion === 'Muslim' ? ISLAMIC_COMMUNITIES
                  : form.partner_religion === 'Christian' ? CHRISTIAN_COMMUNITIES
                  : RELIGION_HIERARCHY[form.partner_religion]?.community.options
                  || CASTES
                ).filter(c => !/^(other|others|don'?t)/i.test(c)),
                ...PARTNER_COMMUNITY_SPECIAL_OPTIONS,
              ]}
              selected={form.partner_community_ids}
              onChange={setPartnerCommunity}
            />
            <div className="form-hint">"Any Community / No Bar" select karne par baaki communities apne aap unselect ho jaayengi</div>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Education Level Preference</label>
          <MultiSelectChips options={EDUCATIONS} selected={form.partner_education_level_preferences}
            onChange={v=>set('partner_education_level_preferences',v)} />
          <div className="form-hint">Khaali chhodne par sab education levels acceptable maane jaayenge</div>
        </div>
        <div className="form-group">
          <label className="form-label">Location Preference</label>
          <select className="form-select" value={form.partner_location} onChange={e=>set('partner_location',e.target.value)}>
            <option value="">Select</option>
            {LOCATION_PREFERENCES.map(l=><option key={l}>{l}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Partner City Preference</label>
            <input className="form-input" value={form.partner_city_preference} onChange={e=>set('partner_city_preference',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Partner State Preference</label>
            <input className="form-input" value={form.partner_state_preference} onChange={e=>set('partner_state_preference',e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Partner Country Preference</label>
          <select className="form-select" value={form.partner_country_preference} onChange={e=>set('partner_country_preference',e.target.value)}>
            {COUNTRIES.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Additional Notes</label>
          <textarea className="form-textarea" value={form.partner_notes} onChange={e=>set('partner_notes',e.target.value)} />
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="section-label" style={{marginBottom:14}}>Privacy & Sensitive Info</div>
        <div className="form-group">
          <label className="form-label">Who can see your Community/Caste?</label>
          <select className="form-select" value={form.community_privacy} onChange={e=>set('community_privacy',e.target.value)}>
            {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Who can see your College/Institution Name?</label>
          <select className="form-select" value={form.college_privacy} onChange={e=>set('college_privacy',e.target.value)}>
            {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Who can see your Company Name?</label>
          <select className="form-select" value={form.company_privacy} onChange={e=>set('company_privacy',e.target.value)}>
            {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Who can see your Income?</label>
          <select className="form-select" value={form.income_privacy} onChange={e=>set('income_privacy',e.target.value)}>
            {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Who can see your Property details?</label>
          <select className="form-select" value={form.property_privacy} onChange={e=>set('property_privacy',e.target.value)}>
            {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Who can see your Business/Commercial Asset details?</label>
          <select className="form-select" value={form.business_privacy} onChange={e=>set('business_privacy',e.target.value)}>
            {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Who can see your Contact Details?</label>
          <select className="form-select" value={form.contact_privacy} onChange={e=>set('contact_privacy',e.target.value)}>
            {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
          </select>
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
