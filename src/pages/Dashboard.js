import React, { useState, useEffect } from 'react'
import EditPhotos from './EditPhotos'
import AccountSettings from './AccountSettings'
import BiodataView from './BiodataView'
import MatchSearch from './MatchSearch'
import ProfileView from './ProfileView'
import ActivityTab from './ActivityTab'
import SearchByProfileId from './SearchByProfileId'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  Pencil, Download, Camera, Images, Eye, EyeOff, CircleCheck, Clock, Sparkles, Heart, Star, X,
  SlidersHorizontal, Search, Settings, ScanSearch, Ban, LogOut, ChevronRight, UserRound,
  Undo2, Send, Inbox, ArrowRight, Check as CheckIcon, Lock as LockIcon, MapPin as MapPinIcon, Phone as PhoneIcon, CalendarDays as CalendarIcon, CircleHelp, ShieldCheck, Mail, Copy, Plus,
} from 'lucide-react'
import { TopBar, BottomNav, SideDrawer } from '../components/AppChrome'
import { FormLabel, SectionLabel, PageHeader, EmptyState, ProfileActionsMenu, SUPPORT_EMAIL } from '../components/ui'
import { iconForLabel } from '../components/fieldIcons'
import { DIETS, EDUCATIONS, DEGREE_OPTIONS, HABITS, INCOME_RANGES, RELIGIONS, CASTES, GOTRAS, MOTHER_TONGUES,
  ISLAMIC_DENOMINATIONS, SUNNI_SCHOOLS_OF_THOUGHT, SHIA_BRANCHES, ISLAMIC_COMMUNITIES,
  ISLAMIC_SUB_CASTE_DIVISIONS, SENSITIVE_COMMUNITIES, SENSITIVE_COMMUNITY_NOTE,
  CHRISTIAN_DENOMINATION_GROUPS, CHRISTIAN_COMMUNITIES,
  RELIGION_HIERARCHY, NO_RELIGION_VALUES, JAIN_GOTRAS, HEIGHT_RANGES, MARITAL_STATUSES, FAMILY_TYPES, FAMILY_VALUES, LOCATION_PREFERENCES, COMPLEXIONS, BODY_TYPES, WEIGHT_RANGES,
  VEHICLE_OWNERSHIP,
  PARTNER_COMMUNITY_SPECIAL_OPTIONS, PARTNER_COMMUNITY_NO_BAR, COUNTRIES, MANGLIK_OPTIONS, KUNDLI_AVAILABLE, RELOCATION_PREFERENCES, EMPLOYMENT_TYPES, OWN_HOUSE_OPTIONS, FAMILY_INCOME_RANGES, USD_FAMILY_INCOME_RANGES, CURRENCIES, USD_INCOME_RANGES, PHYSICAL_DISABILITY_OPTIONS, PROFESSION_CATEGORIES, HEALTH_INFO_OPTIONS, BLOOD_GROUPS, LIVING_WITH_PARENTS_OPTIONS, HOBBIES_INTERESTS, HOBBIES_MAX_SELECT, CUISINES, SPORTS_LIST, TIME_OF_BIRTH_ACCURACY, CASTE_NO_BAR_OPTIONS, PRIVACY_LEVELS, FAMILY_FINANCIAL_STATUS, FAVOURITE_MUSIC, FAVOURITE_BOOKS, DRESS_STYLES,
  LANGUAGES_SPOKEN, HAVE_CHILDREN_OPTIONS, CHILDREN_LIVING_WITH_OPTIONS, GREW_UP_IN_OPTIONS,
  PARTNER_HEIGHT_MIN_INCHES, PARTNER_HEIGHT_MAX_INCHES, formatHeightFromInches,
  PARTNER_INCOME_BOUNDS, PARTNER_INCOME_STEPS, formatIncomeShort, PROFILE_FOR_OPTIONS, SCHOOL_ONLY_EDUCATIONS, profileManagedByLabel } from '../constants/profileOptions'
import { calculateSectionCompleteness } from '../utils/completeness'
import { calculateAge, validateAge, dobInputBounds } from '../utils/ageUtils'
import { rankMatches } from '../utils/matching'
import { maskName } from '../utils/maskName'
import SignedImage from '../components/SignedImage'
import MultiSelectChips from '../components/MultiSelectChips'
import DualRangeSlider from '../components/DualRangeSlider'
import CheckboxDropdown from '../components/CheckboxDropdown'
import { TrinityLogo } from '../components/BrandLogo'
import { compressImage } from '../utils/compressImage'

const DASHBOARD_TABS = ['home', 'matches', 'matchsearch', 'activity', 'requests', 'profile', 'searchid',
  'editphotos', 'editprofile', 'accountsettings', 'privacy', 'help', 'biodata', 'disliked']

const SIBLING_COUNT_OPTIONS = Array.from({length:11}, (_,i)=>i) // 0-10

// Single-choice fields render as a native <select> dropdown — keeps the
// screen compact instead of spreading every option out as chips. Multi-
// select fields (MultiSelectChips/CheckboxDropdown) stay as checklists.
function ChipSelect({ options, value, onChange, includeEmpty, emptyLabel }) {
  return (
    <select className="form-select" value={value || ''} onChange={e=>onChange(e.target.value)}>
      {includeEmpty && <option value="">{emptyLabel || 'Not specified'}</option>}
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  )
}

export default function Dashboard({ user }) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  // Tab URL (?tab=...) me rehta hai, taaki browser/phone ka Back button
  // pichhle tab pe le jaaye (har tab change ek naya history entry hai).
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = DASHBOARD_TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'home'
  const setActiveTab = (tab) => {
    if (tab === activeTab) return
    setSearchParams(tab === 'home' ? {} : { tab })
    window.scrollTo(0, 0)
  }
  const [matches, setMatches] = useState([])
  const [myActions, setMyActions] = useState([]) // match_actions rows where actor = me
  const [myIntroductions, setMyIntroductions] = useState([]) // introductions (Talk/Meeting requests) involving me
  const [myPhotoRequests, setMyPhotoRequests] = useState([]) // photo_requests (Request Photo) involving me — sent + received
  const [viewingMatchId, setViewingMatchId] = useState(null) // set when a match card is tapped, opens ProfileView
  const [receivedActions, setReceivedActions] = useState([]) // match_actions rows where target = me (others' interest in me)
  const [profileViewsCount, setProfileViewsCount] = useState(0)
  const [activityViewProfile, setActivityViewProfile] = useState(null) // set when a row in Activity tab is tapped, opens ProfileView
  const [searchViewProfile, setSearchViewProfile] = useState(null) // set when a Search-by-Profile-ID result is opened
  const [drawerOpen, setDrawerOpen] = useState(false) // top-right hamburger → slide-in settings drawer
  // Bell dot sirf naye (unseen) interests par — Notifications tab kholte hi
  // "seen" ho jaate hain. Per-device localStorage, sirf UI convenience.
  const [activitySeenAt, setActivitySeenAt] = useState(() => {
    try { return Number(localStorage.getItem('lk_activity_seen_at')) || 0 } catch { return 0 }
  })
  useEffect(() => {
    if (activeTab !== 'activity') return
    const now = Date.now()
    setActivitySeenAt(now)
    try { localStorage.setItem('lk_activity_seen_at', String(now)) } catch {}
  }, [activeTab])
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

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

      // Photo privacy — dusre member ki photo sirf tab dikhti hai jab usne
      // meri "Request Photo" approve ki ho. Pehle requests load karte hain
      // taaki neeche matches/activity ke photo paths isi se gate ho sakein.
      // (Database RLS bhi yahi rule enforce karta hai; yeh client gate
      // sirf UI ko consistent rakhta hai.)
      const { data: photoReqs, error: photoReqErr } = await supabase
        .from('photo_requests')
        .select('*')
        .or(`requester_profile_id.eq.${p.id},owner_profile_id.eq.${p.id}`)
      if (photoReqErr) console.error('photo_requests load failed:', photoReqErr.message)
      const photoReqList = photoReqs || []
      setMyPhotoRequests(photoReqList)
      const approvedOwnerIds = new Set(photoReqList
        .filter(r => r.requester_profile_id === p.id && r.status === 'approved')
        .map(r => r.owner_profile_id))

      // Load matches — "profiles_public_view" se (sensitive fields
      // pehle se hi exclude hain database-level pe) — opposite gender
      // pe query-level pe hi filter karte hain (efficient), phir baaki
      // hard-filters (age preference, religion) + soft-scoring client
      // pe hoti hai (matching.js — GAS system jaisi hi philosophy:
      // dono taraf ki preferences check hoti hain).
      // Matching tabhi shuru hoti hai jab profile live (active) ho — self-signup
      // profiles selfie verification ke baad hi active hoti hain.
      // NOTE: candidate pool abhi bhi client-side hi filter/score hota hai
      // (profile count chhota hai). `order` + raised limit ek mitigation
      // hai taaki 100 se zyada profiles hone par bhi purane/random 100
      // tak simit na rahe — asli fix (bada scale aane par) hard filters
      // ko query mein hi push karna hoga (ek Postgres function/RPC se).
      const oppositeGender = p.gender === 'Male' ? 'Female' : 'Male'
      const { data: candidates } = p.profile_status !== 'active' ? { data: [] } : await supabase
        .from('profiles_public_view')
        .select('*')
        .neq('user_id', user.id)
        .eq('gender', oppositeGender)
        .order('created_at', { ascending: false })
        .limit(500)

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
          primaryPhotoPath: approvedOwnerIds.has(r.profile.id) ? (photoPathByProfile[r.profile.id] || null) : null,
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

      // Activity tab — dusre logo ne mujhe like/super-like kiya (Received),
      // resolve actor ki basic info (naam+photo) profiles_public_view se,
      // same join pattern jo matches ke liye upar use hua.
      const { data: received } = await supabase
        .from('match_actions')
        .select('*')
        .eq('target_profile_id', p.id)
        .in('action', ['like', 'super_like'])
      const receivedList = received || []
      if (receivedList.length > 0) {
        const actorIds = receivedList.map(r => r.actor_profile_id)
        const { data: actorProfiles } = await supabase
          .from('profiles_public_view')
          .select('*')
          .in('id', actorIds)
        const { data: actorPhotos } = await supabase
          .from('photos')
          .select('*')
          .in('profile_id', actorIds)
          .eq('is_primary', true)
        const actorPhotoByProfile = {}
        ;(actorPhotos || []).forEach(ph => { actorPhotoByProfile[ph.profile_id] = ph.storage_path })
        const actorById = {}
        ;(actorProfiles || []).forEach(a => { actorById[a.id] = a })
        setReceivedActions(receivedList.map(r => ({
          ...r,
          actorProfile: actorById[r.actor_profile_id] || null,
          actorPhotoPath: approvedOwnerIds.has(r.actor_profile_id) ? (actorPhotoByProfile[r.actor_profile_id] || null) : null,
        })))
      } else {
        setReceivedActions([])
      }

      // Profile Visits — distinct dusre profiles jinhone mera profile
      // ProfileView me khola (profile_views table, ProfileView.js pe record hota hai).
      const { count: viewsCount } = await supabase
        .from('profile_views')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', p.id)
      setProfileViewsCount(viewsCount || 0)
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

  // Received request ko Accept/Decline karna — sirf Accept hone par hi
  // admin ke Coordination Requests list me dikhta hai (Admin.js).
  const respondToIntroduction = async (introId, newStatus) => {
    const { error } = await supabase.from('introductions').update({ status: newStatus }).eq('id', introId)
    if (error) { alert('Could not update: ' + error.message); return }
    setMyIntroductions(prev => prev.map(i => i.id === introId ? { ...i, status: newStatus } : i))
  }

  // ===== PHOTO PRIVACY — Request Photo / Approve / Hide again =====
  // Mere bheje hue request ka status us profile ke liye: null | 'pending' | 'approved' | 'declined'
  const photoAccessFor = (targetProfileId) =>
    myPhotoRequests.find(r => r.requester_profile_id === profile?.id && r.owner_profile_id === targetProfileId)?.status || null

  const sendPhotoRequest = async (targetProfileId) => {
    const { data, error } = await supabase.from('photo_requests')
      .insert({ requester_profile_id: profile.id, owner_profile_id: targetProfileId, status: 'pending' })
      .select().single()
    if (error) {
      if (error.code === '23505') { showToast('Photo request already sent') }
      else { alert('Could not send photo request: ' + error.message) }
      return
    }
    setMyPhotoRequests(prev => [...prev, data])
    showToast('Photo request sent')
  }

  // Owner Approve kare to sirf us requester ko photo dikhegi; "Hide again"
  // (declined) se access wapas chala jaata hai.
  const respondToPhotoRequest = async (requestId, newStatus) => {
    const responded_at = new Date().toISOString()
    const { error } = await supabase.from('photo_requests').update({ status: newStatus, responded_at }).eq('id', requestId)
    if (error) { alert('Could not update: ' + error.message); return }
    setMyPhotoRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: newStatus, responded_at } : r))
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
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg)'}}>
      <div style={{textAlign:'center'}}>
        <TrinityLogo size={64} className="logo-breathe" />
      </div>
    </div>
  )

  const primaryPhoto = photos.find(p=>p.is_primary) || photos[0]
  const isHidden = profile?.hidden_until && new Date(profile.hidden_until) > new Date()

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)',paddingBottom:96}}>
      <TopBar onBell={()=>setActiveTab('activity')} bellDot={activeTab!=='activity' && receivedActions.some(r => new Date(r.updated_at || r.created_at).getTime() > activitySeenAt)}
        onMenu={()=>setDrawerOpen(true)} />
      <SideDrawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} profile={profile}
        avatarPath={primaryPhoto?.storage_path} onNavigate={setActiveTab} onLogout={logout} />
      <div className={'toast ' + (toast?'show':'')}>{toast}</div>

      <div key={activeTab} className="page-enter" style={{maxWidth:520,margin:'0 auto',padding:'20px 16px'}}>

        {/* HOME TAB */}
        {activeTab === 'home' && (
          <>
            {!profile ? (
              <EmptyState icon={UserRound} title="Complete your profile"
                text="Start your matchmaking journey"
                action={<button className="btn btn-primary btn-lg" onClick={()=>navigate('/create-profile')}>Create Profile <ArrowRight size={18} /></button>} />
            ) : (
              <>
                {/* Profile Header — Instagram-style ring avatar */}
                <div className="card" style={{display:'flex',gap:14,alignItems:'center',marginBottom:14}}>
                  <div className="avatar-ring" onClick={()=>setActiveTab('editphotos')} style={{cursor:'pointer'}}>
                    <div className="avatar" style={{width:68,height:68}}>
                      {primaryPhoto
                        ? <SignedImage path={primaryPhoto.storage_path} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                        : <UserRound size={28} />}
                    </div>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:'var(--font-display)',fontWeight:500,fontSize:18,marginBottom:2}}>{profile.full_name}</div>
                    {profile.city && (
                      <div style={{fontSize:13,color:'var(--gray3)',marginBottom:6}}>{profile.city}{profile.state ? ', ' + profile.state : ''}</div>
                    )}
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                      <span className="profile-code">{profile.profile_code}</span>
                      <span className={'chip ' + (profile.profile_status==='active' ? 'chip-success' : 'chip-warning')}
                        title={profile.profile_status==='active' ? 'Active' : 'Under review'}>
                        {profile.profile_status==='active' ? <CircleCheck size={12} /> : <Clock size={12} />}
                        {profile.profile_status==='active' ? 'Active' : 'In review'}
                      </span>
                      {profile.verification_status==='verified' && (
                        <span className="chip chip-success" title="Verified by LOVEKUSH"><ShieldCheck size={12} /> Verified</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick actions — icon tiles */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:14}}>
                  {[
                    {icon:Pencil, label:'Edit', onClick:()=>setActiveTab('editprofile')},
                    {icon:Camera, label:'Photos', onClick:()=>setActiveTab('editphotos')},
                    {icon:Download, label:'Biodata', onClick:()=>setActiveTab('biodata')},
                    isHidden
                      ? {icon:Eye, label:'Unhide', onClick:unhideProfile}
                      : {icon:Settings, label:'Settings', onClick:()=>setActiveTab('accountsettings')},
                  ].map(({icon:Icon,label,onClick})=>(
                    <button key={label} className="stat-card" onClick={onClick}
                      style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,padding:'14px 4px',cursor:'pointer',font:'inherit'}}>
                      <Icon size={20} style={{color:'var(--primary)'}} />
                      <span style={{fontSize:11,color:'var(--gray3)'}}>{label}</span>
                    </button>
                  ))}
                </div>

                {isHidden && (
                  <div className="notice" style={{display:'flex',alignItems:'center',gap:8}}>
                    <EyeOff size={16} style={{color:'var(--primary)'}} /> Hidden until {new Date(profile.hidden_until).toLocaleDateString('en-IN')}
                  </div>
                )}

                {/* Completeness */}
                <div className="card" style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <SectionLabel icon={Sparkles} style={{marginBottom:0}}>Profile strength</SectionLabel>
                    <span style={{fontSize:14,fontWeight:600,color:'var(--primary)'}}>{profile.profile_completeness}%</span>
                  </div>
                  <div className="progress-wrap" style={{marginBottom:0}}>
                    <div className="progress-fill" style={{width:profile.profile_completeness+'%'}}></div>
                  </div>
                  {profile.profile_completeness < 100 && (() => {
                    const { suggestions } = calculateSectionCompleteness(profile, photos.length)
                    return suggestions.length > 0 ? (
                      <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:6}}>
                        {suggestions.map((sg,i)=>(
                          <button key={i} onClick={()=>setActiveTab(/photo/i.test(sg) ? 'editphotos' : 'editprofile')}
                            style={{display:'flex',alignItems:'center',gap:8,background:'none',border:'none',padding:0,font:'inherit',fontSize:12,color:'var(--gray3)',cursor:'pointer',textAlign:'left'}}>
                            <Plus size={14} style={{color:'var(--primary)'}} /> {sg}
                          </button>
                        ))}
                      </div>
                    ) : null
                  })()}
                </div>

                {/* Profile Details */}
                <div className="card" style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <SectionLabel style={{marginBottom:0}}>Profile Details</SectionLabel>
                    <button className="icon-btn" aria-label="Edit profile" onClick={()=>setActiveTab('editprofile')}>
                      <Pencil size={18} />
                    </button>
                  </div>
                  {[
                    { group: 'Personal', rows: [
                      ['Gender', profile.gender],
                      ['Age', profile.age ? profile.age + ' years' : null],
                      ['Date of Birth', profile.date_of_birth],
                      ['Marital Status', profile.marital_status],
                      ['Height', profile.height],
                      ['Weight', profile.weight],
                      ['Complexion', profile.complexion],
                      ['Body Type', profile.body_type],
                      ['Profile Created For', profile.profile_for],
                      ['Nationality', profile.nationality],
                      ['Have Children', profile.have_children],
                      ['Children Living With', profile.children_living_with],
                      ['Languages I Speak', Array.isArray(profile.languages_spoken) && profile.languages_spoken.length ? profile.languages_spoken.join(', ') : null],
                      ['Grew Up In', profile.grew_up_in],
                      ['Physical Disability', profile.physical_disability === 'Yes' ? (profile.disability_details || 'Yes') : null],
                    ]},
                    { group: 'Horoscope', rows: [
                      ['Manglik', profile.manglik],
                      ['Kundli Available', profile.kundli_available],
                    ]},
                    { group: 'Religion & Community', rows: [
                      ['Religion', profile.religion],
                      ['Community / Caste', profile.community],
                      ['Sub-Caste', profile.sub_caste],
                      ['Gotra', profile.gotra],
                      ['Mother Tongue', profile.mother_tongue],
                    ]},
                    { group: 'Location', rows: [
                      ['City', profile.city],
                      ['State', profile.state],
                      ['Country', profile.country],
                      ['Native Place', profile.native_place],
                      ['Relocation Preference', profile.relocation_preference],
                    ]},
                    { group: 'Education & Career', rows: [
                      ['Highest Education', profile.education],
                      ['Degree', profile.degree],
                      ['College/Institution Name', profile.college_name],
                      ['Employment Type', profile.employment_type],
                      ['Profession Category', profile.profession],
                      ['Employer', profile.employer],
                      ['Annual Income', profile.annual_income],
                    ]},
                    { group: 'Lifestyle', rows: [
                      ['Diet', profile.diet],
                      ['Smoking', profile.smoking],
                      ['Drinking', profile.drinking],
                      ['Hobbies', profile.hobbies],
                    ]},
                    { group: 'Family Background', rows: [
                      ['Family Type', profile.family_type],
                      ['Family Values', profile.family_values],
                      ["Father's Profession", profile.father_profession],
                      ["Mother's Profession", profile.mother_profession],
                      ['Brothers', profile.brothers_count ? profile.brothers_count + ' (' + (profile.brothers_married_count || 0) + ' married)' : null],
                      ['Sisters', profile.sisters_count ? profile.sisters_count + ' (' + (profile.sisters_married_count || 0) + ' married)' : null],
                      ['Family City', profile.family_city],
                      ['Family Income Range', profile.family_income_range],
                    ]},
                    { group: 'Assets', rows: [
                      ['Own Vehicle', profile.vehicle_ownership],
                      ['Own House', profile.own_house],
                    ]},
                  ].map(({group, rows}) => ({group, rows: rows.filter(([,v])=>v)})).filter(({rows})=>rows.length).map(({group, rows}, gi)=>(
                    <div key={group} style={{marginTop: gi>0 ? 16 : 4}}>
                      <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--gray3)',marginBottom:2}}>{group}</div>
                      {rows.map(([k,v])=><FactRow key={k} k={k} v={v} />)}
                    </div>
                  ))}
                </div>

                {/* Partner Preferences */}
                <div className="card" style={{marginBottom:14}}>
                  <SectionLabel style={{marginBottom:6}}>Partner Preferences</SectionLabel>
                  {[
                    ['Age Range', profile.partner_age_min && profile.partner_age_max ? profile.partner_age_min + ' - ' + profile.partner_age_max + ' years' : null],
                    ['Height Range', profile.partner_height_min && profile.partner_height_max ? formatHeightFromInches(profile.partner_height_min) + ' - ' + formatHeightFromInches(profile.partner_height_max) : null],
                    ['Income Range', profile.partner_income_max ? formatIncomeShort(profile.partner_income_min, profile.partner_income_currency) + ' - ' + formatIncomeShort(profile.partner_income_max, profile.partner_income_currency) : null],
                    ['Religion', profile.partner_religion],
                    ['Preferred Community', Array.isArray(profile.partner_community_ids) ? profile.partner_community_ids.join(', ') : null],
                    ['Education Level', Array.isArray(profile.partner_education_level_preferences) && profile.partner_education_level_preferences.length ? profile.partner_education_level_preferences.join(', ') : null],
                    ['Location', profile.partner_location],
                    ['Preferred City', profile.partner_city_preference],
                    ['Preferred State', profile.partner_state_preference],
                    ['Preferred Country', profile.partner_country_preference && profile.partner_country_preference !== 'Open to All' ? profile.partner_country_preference : null],
                    ['Notes', profile.partner_notes],
                  ].filter(([,v])=>v).map(([k,v])=><FactRow key={k} k={k} v={v} />)}
                </div>

                {/* About */}
                {profile.about_me && (
                  <div className="card" style={{marginBottom:14}}>
                    <SectionLabel style={{marginBottom:8}}>About</SectionLabel>
                    <p style={{fontSize:14,lineHeight:1.7,color:'var(--ink)'}}>{profile.about_me}</p>
                  </div>
                )}

                {/* Photos */}
                <div className="card" style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:photos.length>0?12:0}}>
                    <SectionLabel icon={Images} style={{marginBottom:0}}>Photos {photos.length>0 ? '· ' + photos.length : ''}</SectionLabel>
                    <button className="icon-btn" aria-label="Manage photos" onClick={()=>setActiveTab('editphotos')}>
                      {photos.length>0 ? <Pencil size={18} /> : <Plus size={20} />}
                    </button>
                  </div>
                  {photos.length > 0 ? (
                    <div className="photo-grid" style={{marginBottom:0}}>
                      {photos.map((p,i)=>(
                        <div key={i} style={{aspectRatio:1,borderRadius:12,overflow:'hidden',background:'var(--gray1)'}}>
                          <SignedImage path={p.storage_path} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <button className="photo-slot" style={{width:'100%',aspectRatio:'auto',padding:'22px 0',marginTop:12,font:'inherit'}} onClick={()=>setActiveTab('editphotos')}>
                      <Camera size={24} style={{color:'var(--primary)'}} />
                      <span style={{fontSize:12,color:'var(--gray3)'}}>Add photo</span>
                    </button>
                  )}
                </div>

                {(profile.profile_status !== 'active' || ['selfie_requested','rejected'].includes(profile.verification_status)) && (
                  <VerificationNotice profile={profile} userId={user.id} onUpdated={setProfile} onToast={showToast} />
                )}
              </>
            )}
          </>
        )}


        {/* MATCHES TAB */}
        {activeTab === 'matches' && (
          viewingMatchId ? (() => {
            const m = matches.find(x => x.id === viewingMatchId)
            if (!m) { setViewingMatchId(null); return null }
            return (
              <ProfileView match={m} viewerIsPremium={!!profile.is_premium} viewerProfileId={profile.id}
                myAction={myActions.find(a => a.target_profile_id === m.id)?.action || null}
                introSent={myIntroductions.some(i => i.from_profile === profile.id && i.to_profile === m.id)}
                onSetAction={(action)=>setMatchAction(m.id, action)}
                onSendIntro={(type)=>sendIntroductionRequest(m.id, type)}
                photoAccess={photoAccessFor(m.id)} onRequestPhoto={()=>sendPhotoRequest(m.id)}
                onToast={showToast} onBack={()=>setViewingMatchId(null)} />
            )
          })() : (
          <div>
            <PageHeader title="Matches" right={matches.length > 0 && <span className="chip chip-primary">{matches.length}</span>} />
            <div className="search-pill" onClick={()=>setActiveTab('matchsearch')} style={{marginBottom:18}}>
              <Search size={18} style={{color:'var(--primary)'}} />
              <span style={{flex:1}}>What are you looking for?</span>
              <SlidersHorizontal size={18} />
            </div>
            {profile.profile_status !== 'active' ? (
              <EmptyState icon={ShieldCheck} title="Matches unlock after verification"
                text="Once our team verifies your profile, it goes live and your matches appear here"
                action={<button className="btn btn-soft btn-sm" onClick={()=>setActiveTab('home')}>See verification status</button>} />
            ) : matches.length === 0 ? (
              <EmptyState icon={Heart} title="No matches yet" text="A complete profile gets better matches"
                action={<button className="btn btn-soft btn-sm" onClick={()=>setActiveTab('editprofile')}><Pencil size={14} /> Complete profile</button>} />
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                {matches.map((m)=>(
                  <MatchCard key={m.id} match={m} viewerProfileId={profile.id} viewerIsPremium={!!profile.is_premium}
                    myAction={myActions.find(a => a.target_profile_id === m.id)?.action || null}
                    introSent={myIntroductions.some(i => i.from_profile === profile.id && i.to_profile === m.id)}
                    onSetAction={(action)=>setMatchAction(m.id, action)}
                    onSendIntro={(type)=>sendIntroductionRequest(m.id, type)}
                    photoAccess={photoAccessFor(m.id)} onRequestPhoto={()=>sendPhotoRequest(m.id)}
                    onToast={showToast}
                    onView={()=>setViewingMatchId(m.id)} />
                ))}
              </div>
            )}
          </div>
          )
        )}

        {/* MATCH SEARCH (Tell us what you're looking for) */}
        {activeTab === 'matchsearch' && (
          <MatchSearch profile={profile}
            onSearch={async () => { await loadProfile(); setActiveTab('matches') }}
            onBack={()=>setActiveTab('matches')} />
        )}

        {/* ACTIVITY TAB */}
        {activeTab === 'activity' && (
          activityViewProfile ? (
            <ProfileView match={activityViewProfile} viewerIsPremium={!!profile.is_premium} viewerProfileId={profile.id}
              myAction={myActions.find(a => a.target_profile_id === activityViewProfile.id)?.action || null}
              introSent={myIntroductions.some(i => i.from_profile === profile.id && i.to_profile === activityViewProfile.id)}
              onSetAction={(action)=>setMatchAction(activityViewProfile.id, action)}
              onSendIntro={(type)=>sendIntroductionRequest(activityViewProfile.id, type)}
              photoAccess={photoAccessFor(activityViewProfile.id)} onRequestPhoto={()=>sendPhotoRequest(activityViewProfile.id)}
              onToast={showToast} onBack={()=>setActivityViewProfile(null)} />
          ) : (
            <ActivityTab
              myActions={myActions}
              receivedActions={receivedActions}
              matches={matches}
              profileViewsCount={profileViewsCount}
              onViewProfile={(p)=>setActivityViewProfile(p)}
            />
          )
        )}

        {/* REQUESTS TAB */}
        {activeTab === 'requests' && (
          <RequestsTab myProfile={profile} introductions={myIntroductions} onRespond={respondToIntroduction}
            photoRequests={myPhotoRequests} onRespondPhoto={respondToPhotoRequest} />
        )}

        {/* PROFILE TAB — Instagram-style header + icon list */}
        {activeTab === 'profile' && profile && (
          <div>
            <div style={{textAlign:'center',padding:'8px 0 20px'}}>
              <div className="avatar-ring" style={{display:'inline-block',marginBottom:12,cursor:'pointer'}} onClick={()=>setActiveTab('editphotos')}>
                <div className="avatar" style={{width:96,height:96}}>
                  {primaryPhoto
                    ? <SignedImage path={primaryPhoto.storage_path} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                    : <UserRound size={38} />}
                </div>
              </div>
              <div style={{fontFamily:'var(--font-display)',fontWeight:500,fontSize:20,marginBottom:2}}>{profile.full_name}</div>
              {profile.city && <div style={{fontSize:13,color:'var(--gray3)',marginBottom:8}}>{profile.city}{profile.state ? ', ' + profile.state : ''}</div>}
              <span className="profile-code">{profile.profile_code}</span>
            </div>

            <div className="stats-row" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
              {[
                {icon:Images, n:photos.length, l:'Photos', tab:'editphotos'},
                {icon:Heart, n:myActions.filter(a=>a.action!=='dislike').length, l:'Liked', tab:'activity'},
                {icon:Eye, n:profileViewsCount, l:'Visits', tab:'activity'},
              ].map(({icon:Icon,n,l,tab})=>(
                <button key={l} className="stat-card" onClick={()=>setActiveTab(tab)} style={{textAlign:'center',cursor:'pointer',font:'inherit',padding:'14px 6px'}}>
                  <Icon size={18} className="stat-icon" />
                  <span className="stat-num" style={{fontSize:20}}>{n}</span>
                  <span className="stat-label">{l}</span>
                </button>
              ))}
            </div>

            <div style={{display:'flex',gap:10,marginBottom:16}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={()=>setActiveTab('editprofile')}><Pencil size={16} /> Edit profile</button>
              <button className="btn btn-outline" style={{flex:1}} onClick={()=>setActiveTab('biodata')}><Download size={16} /> Biodata</button>
            </div>

            <div className="menu-list">
              {[
                {icon:Images, label:'Manage Photos', tab:'editphotos'},
                {icon:ScanSearch, label:'Search by Profile ID', tab:'searchid'},
                {icon:Ban, label:'Blocked Profiles', tab:'disliked'},
                {icon:Settings, label:'Account & Settings', tab:'accountsettings'},
              ].map(({icon:Icon,label,tab})=>(
                <button key={label} className="menu-row" onClick={()=>setActiveTab(tab)}>
                  <Icon size={20} className="menu-row-icon" />
                  <span>{label}</span>
                  <ChevronRight size={18} className="chev" />
                </button>
              ))}
              <button className="menu-row" style={{color:'var(--danger)'}} onClick={logout}>
                <LogOut size={20} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        )}

        {/* SEARCH BY PROFILE ID TAB */}
        {activeTab === 'searchid' && profile && (
          searchViewProfile ? (
            <ProfileView match={searchViewProfile} viewerIsPremium={!!profile.is_premium} viewerProfileId={profile.id}
              myAction={myActions.find(a => a.target_profile_id === searchViewProfile.id)?.action || null}
              introSent={myIntroductions.some(i => i.from_profile === profile.id && i.to_profile === searchViewProfile.id)}
              onSetAction={(action)=>setMatchAction(searchViewProfile.id, action)}
              onSendIntro={(type)=>sendIntroductionRequest(searchViewProfile.id, type)}
              photoAccess={photoAccessFor(searchViewProfile.id)} onRequestPhoto={()=>sendPhotoRequest(searchViewProfile.id)}
              onToast={showToast} onBack={()=>setSearchViewProfile(null)} />
          ) : (
            <SearchByProfileId onView={(p)=>setSearchViewProfile(p)} onBack={()=>setActiveTab('profile')} />
          )
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
            onManagePrivacy={() => setActiveTab('accountsettings')}
          />
        )}

        {/* ACCOUNT & SETTINGS TAB */}
        {activeTab === 'accountsettings' && profile && (
          <AccountSettings
            profile={profile}
            user={user}
            onProfileUpdate={(updated) => setProfile(updated)}
            onBack={() => setActiveTab('profile')}
            onDeleted={logout}
          />
        )}

        {/* PRIVACY — drawer shortcut, seedha Privacy Settings khulta hai */}
        {activeTab === 'privacy' && profile && (
          <AccountSettings
            profile={profile}
            user={user}
            initialView="privacy"
            onProfileUpdate={(updated) => setProfile(updated)}
            onBack={() => window.history.back()}
            onDeleted={logout}
          />
        )}

        {/* HELP */}
        {activeTab === 'help' && (
          <HelpView profileCode={profile?.profile_code} onBack={() => window.history.back()} onToast={showToast} />
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

      {/* Bottom Nav — icons only, label on active tab */}
      <BottomNav active={activeTab} onChange={setActiveTab} avatarPath={primaryPhoto?.storage_path}
        dots={{ requests: myIntroductions.some(i => i.to_profile === profile?.id && (!i.status || i.status === 'pending'))
          || myPhotoRequests.some(r => r.owner_profile_id === profile?.id && r.status === 'pending') }} />
    </div>
  )
}

// Label/value row with the field's icon (same icon map as the forms).
function FactRow({ k, v }) {
  const Icon = iconForLabel(k)
  return (
    <div className="fact-row">
      {Icon && <Icon size={16} className="fact-icon" />}
      <span className="fact-key">{k}</span>
      <span className="fact-val">{v}</span>
    </div>
  )
}

// Match card — score ke saath "Why this match?" expand karke poora
// breakdown dikhata hai (Strong Matches ✓ / Needs Discussion △) — fake
// percentage nahi, actual matching.js se aaya hua real explanation.
// Home tab par verification status — admin ne selfie maangi ho to yahin se
// front camera selfie upload hoti hai (profiles.selfie_path), phir admin
// use uploaded photo se match karke Verify karta hai → profile live.
function VerificationNotice({ profile, userId, onUpdated, onToast }) {
  const [uploading, setUploading] = useState(false)
  const status = profile.verification_status

  const uploadSelfie = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { onToast('Please choose a photo'); return }
    setUploading(true)
    try {
      const compressed = await compressImage(file)
      const path = userId + '/selfie-' + Date.now() + '.jpg'
      const { error: upErr } = await supabase.storage.from('lovekush-photos').upload(path, compressed, { contentType: 'image/jpeg' })
      if (upErr) throw new Error('Upload failed: ' + upErr.message)
      const { data, error } = await supabase.from('profiles')
        .update({ selfie_path: path, selfie_submitted_at: new Date().toISOString(), verification_status: 'selfie_submitted' })
        .eq('id', profile.id).select().single()
      if (error) throw new Error('Could not save selfie: ' + error.message)
      onUpdated(data)
      onToast('Selfie sent for verification')
    } catch (e) {
      alert(e.message)
    }
    setUploading(false)
  }

  if (status === 'selfie_requested' || status === 'rejected') {
    return (
      <div className="notice" style={{display:'flex',flexDirection:'column',gap:10}}>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <Camera size={18} style={{color:'var(--primary)',flexShrink:0}} />
          <span>
            <strong>{status === 'rejected' ? 'Please send a new selfie' : 'Selfie needed for your Verified badge'}</strong>
            {' · '}we'll match it with your uploaded photo, then your profile goes live
          </span>
        </div>
        <label className="btn btn-primary btn-sm" style={{alignSelf:'flex-start',cursor:uploading?'default':'pointer',opacity:uploading?0.6:1}}>
          <Camera size={14} /> {uploading ? 'Uploading...' : 'Take selfie'}
          <input type="file" accept="image/*" capture="user" hidden disabled={uploading}
            onChange={e => { uploadSelfie(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>
    )
  }

  return (
    <div className="notice" style={{display:'flex',gap:10,alignItems:'center'}}>
      <ShieldCheck size={18} style={{color:'var(--primary)',flexShrink:0}} />
      {status === 'selfie_submitted'
        ? <span><strong>Selfie received</strong> · we're matching it with your photo. Matches start once you're verified</span>
        : <span><strong>Under review</strong> · we'll ask for a quick selfie to verify you, then your profile goes live</span>}
    </div>
  )
}

function MatchCard({ match: m, viewerProfileId, viewerIsPremium, myAction, introSent, onSetAction, onSendIntro, photoAccess, onRequestPhoto, onView, onToast }) {
  // "You match X/Y preferences" — existing matching.js strengths/needsDiscussion
  // se hi nikala, koi naya scoring logic nahi. Strength = matched, needsDiscussion
  // = evaluated but not matched; total = dono ka sum.
  const matchedCount = (m.matchStrengths || []).length
  const totalCount = matchedCount + (m.matchNeedsDiscussion || []).length

  return (
    <div className="match-card">
      <div style={{display:'flex',gap:14,alignItems:'center',padding:'14px 8px 10px 14px',cursor:'pointer'}} onClick={onView}>
        <div className="avatar" style={{position:'relative',width:64,height:64}}>
          {/* Photo privacy — owner ke approve karne par hi photo; approve ho
              gayi to premium blur nahi (owner ne khud consent diya hai). */}
          {photoAccess === 'approved' && m.primaryPhotoPath
            ? <SignedImage path={m.primaryPhotoPath} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
            : photoAccess === 'approved' ? <UserRound size={26} /> : <LockIcon size={22} />
          }
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:600,fontSize:16,marginBottom:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{maskName(m.full_name)}</div>
          <div style={{fontSize:13,color:'var(--gray3)',display:'flex',alignItems:'center',gap:4}}>
            {m.age} yrs{m.city ? <> · <MapPinIcon size={12} /> {m.city}</> : null}
          </div>
          <div style={{display:'flex',gap:6,marginTop:6,flexWrap:'wrap'}}>
            {typeof m.matchScore === 'number' && (
              <span className={'chip ' + (m.matchScore>=70 ? 'chip-success' : m.matchScore>=40 ? 'chip-warning' : 'chip-muted')}>
                <Sparkles size={11} /> {m.matchScore}%
              </span>
            )}
            {totalCount > 0 && (
              <span className="chip chip-primary" title="Preferences matched"><CircleCheck size={11} /> {matchedCount}/{totalCount}</span>
            )}
            {m.verification_status === 'verified' && (
              <span className="chip chip-success" title="Verified by LOVEKUSH"><ShieldCheck size={11} /> Verified</span>
            )}
            {profileManagedByLabel(m.profile_for) && (
              <span className="chip chip-muted" title={'Profile created for: ' + m.profile_for}><UserRound size={11} /> {profileManagedByLabel(m.profile_for)}</span>
            )}
            <PhotoRequestChip status={photoAccess} onRequest={onRequestPhoto} />
          </div>
        </div>
        <ProfileActionsMenu profile={m} reporterProfileId={viewerProfileId} onBlock={()=>onSetAction('dislike')} onToast={onToast} />
      </div>

      <div className="action-row" style={{padding:'4px 14px 16px'}}>
        <button className="action-btn sm pass" aria-label="Pass" title="Pass" onClick={()=>onSetAction('dislike')}><X size={20} /></button>
        <button className={'action-btn like' + (myAction==='like' ? ' on' : '')} aria-label="Like" title="Like"
          aria-pressed={myAction==='like'} onClick={()=>onSetAction('like')}><Heart size={22} /></button>
        <button className={'action-btn sm super' + (myAction==='super_like' ? ' on' : '')} aria-label="Super like" title="Super like"
          aria-pressed={myAction==='super_like'} onClick={()=>onSetAction('super_like')}><Star size={20} /></button>
      </div>
    </div>
  )
}

// Match card / list pe chhota "Request photo" chip — status ke hisaab se
// label badalta hai. Approved hone par kuch nahi dikhata (photo hi dikh rahi hai).
function PhotoRequestChip({ status, onRequest }) {
  if (status === 'approved') return null
  if (status === 'pending') return <span className="chip chip-warning"><Clock size={11} /> Photo requested</span>
  if (status === 'declined') return <span className="chip chip-muted"><LockIcon size={11} /> Photo private</span>
  return (
    <button type="button" className="chip chip-primary" style={{border:'none',cursor:'pointer'}}
      onClick={(e)=>{ e.stopPropagation(); onRequest && onRequest() }}>
      <Camera size={11} /> Request photo
    </button>
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
      <PageHeader title="Blocked Profiles" onBack={onBack} />
      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'var(--gray3)',fontSize:13}}>Loading...</div>
      ) : dislikedActions.length === 0 ? (
        <EmptyState icon={Ban} title="Nothing here" text="Profiles you block or pass on show up here" />
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {dislikedActions.map(a => {
            const p = profilesById[a.target_profile_id]
            return (
              <div key={a.target_profile_id} className="list-row" style={{display:'flex',gap:12,alignItems:'center'}}>
                <div className="avatar" style={{width:40,height:40}}><UserRound size={18} /></div>
                <span style={{flex:1,fontSize:14,fontWeight:500}}>{p ? maskName(p.full_name) + (p.city ? ' · ' + p.city : '') : 'Profile'}</span>
                <button className="btn btn-soft btn-sm" onClick={()=>onUndo(a.target_profile_id)}><Undo2 size={14} /> Unblock</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ===== HELP — short, icon-led answers + contact =====
function HelpView({ profileCode, onBack, onToast }) {
  const faqs = [
    { icon: ShieldCheck, q: 'Profile review', a: 'Every profile is checked by our team within 24-48 hours.' },
    { icon: Heart, q: 'Like & Super Like', a: 'Show interest. Mutual likes appear under Notifications.' },
    { icon: Send, q: 'Talk / Meet', a: 'Your relationship manager calls both families to set it up.' },
    { icon: LockIcon, q: 'Privacy', a: 'Phone & email are never shown. Control the rest in Privacy.' },
  ]
  const copyId = async () => {
    try { await navigator.clipboard.writeText(profileCode || ''); onToast('Profile ID copied') } catch { onToast(profileCode || '') }
  }
  return (
    <div>
      <PageHeader title="Help" onBack={onBack} />
      <div className="menu-list" style={{marginBottom:16}}>
        {faqs.map(({icon:Icon,q,a})=>(
          <div key={q} className="menu-row" style={{cursor:'default',alignItems:'flex-start'}}>
            <Icon size={20} className="menu-row-icon" style={{marginTop:2}} />
            <div>
              <div style={{fontWeight:500}}>{q}</div>
              <div className="menu-row-sub">{a}</div>
            </div>
          </div>
        ))}
      </div>
      {SUPPORT_EMAIL ? (
        <a className="btn btn-primary btn-full" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Help — ' + (profileCode || ''))}`}>
          <Mail size={16} /> Contact us
        </a>
      ) : profileCode && (
        <button className="btn btn-outline btn-full" onClick={copyId}><Copy size={16} /> Copy my Profile ID</button>
      )}
      <div style={{textAlign:'center',marginTop:14,color:'var(--gray3)',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
        <CircleHelp size={14} /> Share your Profile ID when you contact us
      </div>
    </div>
  )
}

function RequestsTab({ myProfile, introductions, onRespond, photoRequests = [], onRespondPhoto }) {
  const [subTab, setSubTab] = useState('received') // 'received' | 'sent'
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfileNames()
  }, [introductions, photoRequests])

  const loadProfileNames = async () => {
    const ids = [...new Set([
      ...introductions.flatMap(i => [i.from_profile, i.to_profile]),
      ...photoRequests.flatMap(r => [r.requester_profile_id, r.owner_profile_id]),
    ])].filter(id => id !== myProfile.id)
    if (ids.length === 0) { setLoading(false); return }
    const { data } = await supabase.from('profiles_public_view').select('id, full_name').in('id', ids)
    const map = {}
    ;(data || []).forEach(p => { map[p.id] = maskName(p.full_name) })
    setProfilesById(map)
    setLoading(false)
  }

  const received = introductions.filter(i => i.to_profile === myProfile.id)
  const sent = introductions.filter(i => i.from_profile === myProfile.id)
  const photoReceived = photoRequests.filter(r => r.owner_profile_id === myProfile.id)
  const photoSent = photoRequests.filter(r => r.requester_profile_id === myProfile.id)
  const pendingReceivedCount = received.filter(i => !i.status || i.status === 'pending').length
    + photoReceived.filter(r => r.status === 'pending').length

  return (
    <div>
      <PageHeader title="Requests" />

      <div className="pill-tabs" style={{marginBottom:18}}>
        {[['received', Inbox], ['sent', Send]].map(([t, Icon])=>(
          <button key={t} className={'pill-tab '+(subTab===t?'active':'')} onClick={()=>setSubTab(t)}
            style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            <Icon size={15} /> {t}{t === 'received' && pendingReceivedCount>0 ? ` · ${pendingReceivedCount}` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'var(--gray3)',fontSize:13}}>Loading...</div>
      ) : subTab === 'received' ? (
        <>
        {photoReceived.length > 0 && (
          <div style={{marginBottom:18}}>
            <SectionLabel icon={Camera}>Photo requests</SectionLabel>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {photoReceived.map(r => (
                <div key={r.id} className="list-row">
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom: r.status === 'pending' ? 12 : 6}}>
                    <div className="avatar" style={{width:42,height:42}}><Camera size={18} /></div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:15,fontWeight:600}}>{profilesById[r.requester_profile_id] || 'A member'}</div>
                      <div style={{fontSize:12,color:'var(--gray3)'}}>Wants to see your photos</div>
                    </div>
                  </div>
                  {r.status === 'pending' ? (
                    <div style={{display:'flex',gap:8}}>
                      <button className="btn btn-primary btn-sm" style={{flex:1}} onClick={()=>onRespondPhoto(r.id,'approved')}><Eye size={15} /> Show photo</button>
                      <button className="btn btn-outline btn-sm" style={{flex:1}} onClick={()=>onRespondPhoto(r.id,'declined')}><X size={15} /> Decline</button>
                    </div>
                  ) : r.status === 'approved' ? (
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{flex:1,fontSize:12,color:'var(--success)',display:'flex',gap:6,alignItems:'center'}}><Eye size={14} /> Can see your photos</span>
                      <button className="btn btn-outline btn-sm" onClick={()=>onRespondPhoto(r.id,'declined')}><EyeOff size={14} /> Hide again</button>
                    </div>
                  ) : (
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{flex:1,fontSize:12,color:'var(--gray3)',display:'flex',gap:6,alignItems:'center'}}><EyeOff size={14} /> Photos hidden</span>
                      <button className="btn btn-soft btn-sm" onClick={()=>onRespondPhoto(r.id,'approved')}><Eye size={14} /> Show photo</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {received.length === 0 ? (
          photoReceived.length === 0 &&
          <EmptyState icon={Inbox} title="No requests yet" text="Talk & meet requests show up here" />
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {received.map(i => (
              <div key={i.id} className="list-row">
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:(!i.status || i.status === 'pending') ? 12 : 6}}>
                  <div className="avatar" style={{width:42,height:42}}>
                    {i.request_type === 'meeting' ? <CalendarIcon size={18} /> : <PhoneIcon size={18} />}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:600}}>{profilesById[i.from_profile] || 'A member'}</div>
                    <div style={{fontSize:12,color:'var(--gray3)'}}>Wants to {i.request_type === 'meeting' ? 'meet' : 'talk'}</div>
                  </div>
                </div>
                {(!i.status || i.status === 'pending') ? (
                  <div style={{display:'flex',gap:8}}>
                    <button className="btn btn-primary btn-sm" style={{flex:1}} onClick={()=>onRespond(i.id,'accepted')}><CircleCheck size={15} /> Accept</button>
                    <button className="btn btn-outline btn-sm" style={{flex:1}} onClick={()=>onRespond(i.id,'declined')}><X size={15} /> Decline</button>
                  </div>
                ) : i.status === 'accepted' ? (
                  <div style={{fontSize:12,color:'var(--success)',display:'flex',gap:6,alignItems:'center'}}>
                    <CircleCheck size={14} /> Accepted · our manager will call you
                  </div>
                ) : i.status === 'declined' ? (
                  <div style={{fontSize:12,color:'var(--gray3)',display:'flex',gap:6,alignItems:'center'}}><X size={14} /> Declined</div>
                ) : (
                  <div style={{fontSize:12,color:'var(--gray3)',display:'flex',gap:6,alignItems:'center'}}>
                    <PhoneIcon size={14} /> Our manager will call you
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </>
      ) : (
        <>
        {photoSent.length > 0 && (
          <div style={{marginBottom:18}}>
            <SectionLabel icon={Camera}>Photo requests</SectionLabel>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {photoSent.map(r => (
                <div key={r.id} className="list-row" style={{display:'flex',alignItems:'center',gap:12}}>
                  <div className="avatar" style={{width:42,height:42}}><Camera size={18} /></div>
                  <div style={{flex:1,fontSize:15,fontWeight:600}}>{profilesById[r.owner_profile_id] || 'Profile'}</div>
                  <span className={'chip ' + (r.status==='approved' ? 'chip-success' : r.status==='declined' ? 'chip-muted' : 'chip-warning')}>
                    {r.status==='approved' ? 'Photo shared' : r.status==='declined' ? 'Photo private' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {sent.length === 0 ? (
          photoSent.length === 0 &&
          <EmptyState icon={Send} title="No requests sent" text="Open a profile and tap Talk / Meet" />
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {sent.map(i => (
              <div key={i.id} className="list-row" style={{display:'flex',alignItems:'center',gap:12}}>
                <div className="avatar" style={{width:42,height:42}}>
                  {i.request_type === 'meeting' ? <CalendarIcon size={18} /> : <PhoneIcon size={18} />}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:600}}>{profilesById[i.to_profile] || 'Profile'}</div>
                  <div style={{fontSize:12,color:'var(--gray3)'}}>{i.request_type === 'meeting' ? 'Meeting' : 'Talk'}</div>
                </div>
                <span className={'chip ' + ((i.status==='declined' || i.status==='closed') ? 'chip-muted' : (i.status==='contacted'||i.status==='accepted') ? 'chip-success' : 'chip-warning')}
                  style={{textTransform:'capitalize'}}>{i.status==='declined' ? 'Not accepted' : (i.status || 'pending')}</span>
              </div>
            ))}
          </div>
        )}
        </>
      )}
    </div>
  )
}

export function EditProfileForm({ profile, user, onSave, onCancel, onManagePrivacy }) {
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
    profile_for: profile.profile_for || '',
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
    living_with_parents: profile.living_with_parents || '',
    alternate_email: profile.alternate_email || '',
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
    relocation_preference: profile.relocation_preference || '',
    education: profile.education || '',
    degree: profile.degree || '', degree_other: '',
    college_name: profile.college_name || '',
    employment_type: profile.employment_type || '',
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
    vehicle_ownership: profile.vehicle_ownership || '',
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

  // Nationality badalne par income currency apne aap sync hoti hai — India
  // ke liye INR, kisi aur country ke liye USD (dono currencies dropdown mein
  // available rehti hain, yeh sirf ek sensible default set karta hai).
  const set = (k,v) => setForm(p=>{
    const next = {...p,[k]:v}
    if (k === 'education' && SCHOOL_ONLY_EDUCATIONS.includes(v)) { next.degree = ''; next.degree_other = '' }
    if (k === 'nationality') {
      const curr = v === 'India' ? 'INR' : 'USD'
      if (p.annual_income_currency !== curr) { next.annual_income_currency = curr; next.annual_income = '' }
      if (p.family_income_currency !== curr) { next.family_income_currency = curr; next.family_income_range = '' }
      if (p.partner_income_currency !== curr) {
        next.partner_income_currency = curr
        next.partner_income_min = PARTNER_INCOME_BOUNDS[curr].min
        next.partner_income_max = PARTNER_INCOME_BOUNDS[curr].max
      }
    }
    return next
  })

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
      <PageHeader title="Edit Profile" onBack={onCancel} />

      <div className="card" style={{marginBottom:12}}>
        <SectionLabel style={{marginBottom:14}}>Personal Info</SectionLabel>

        <div className="form-group">
          <FormLabel>Profile Created For</FormLabel>
          <ChipSelect options={PROFILE_FOR_OPTIONS} value={form.profile_for} onChange={v=>set('profile_for',v)} includeEmpty />
        </div>
        <div className="form-group">
          <FormLabel>First Name *</FormLabel>
          <input className="form-input" value={form.first_name} onChange={e=>set('first_name',e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Middle Name</FormLabel>
            <input className="form-input" value={form.middle_name} onChange={e=>set('middle_name',e.target.value)} />
          </div>
          <div className="form-group">
            <FormLabel>Last Name / Surname *</FormLabel>
            <input className="form-input" value={form.last_name} onChange={e=>set('last_name',e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Date of Birth *</FormLabel>
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
            <FormLabel>Gender *</FormLabel>
            <select className="form-select" value={form.gender} onChange={e=>set('gender',e.target.value)}>
              <option>Male</option><option>Female</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Height</FormLabel>
            <select className="form-select" value={form.height} onChange={e=>set('height',e.target.value)}>
              <option value="">Select</option>
              {HEIGHT_RANGES.map(h=><option key={h}>{h}</option>)}
            </select>
          </div>
          <div className="form-group">
            <FormLabel>Weight</FormLabel>
            <ChipSelect options={WEIGHT_RANGES} value={form.weight} onChange={v=>set('weight',v)} includeEmpty />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Complexion</FormLabel>
            <ChipSelect options={COMPLEXIONS} value={form.complexion} onChange={v=>set('complexion',v)} includeEmpty />
          </div>
          <div className="form-group">
            <FormLabel>Body Type</FormLabel>
            <ChipSelect options={BODY_TYPES} value={form.body_type} onChange={v=>set('body_type',v)} includeEmpty />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Marital Status</FormLabel>
            <select className="form-select" value={form.marital_status} onChange={e=>set('marital_status',e.target.value)}>
              {MARITAL_STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <FormLabel>Nationality</FormLabel>
            <select className="form-select" value={form.nationality} onChange={e=>set('nationality',e.target.value)}>
              {COUNTRIES.filter(c=>c!=='Open to All').map(n=><option key={n}>{n}</option>)}
            </select>
          </div>
        </div>
        {form.marital_status !== 'Never Married' && (
          <div className="form-row">
            <div className="form-group">
              <FormLabel>Have Children?</FormLabel>
              <select className="form-select" value={form.have_children} onChange={e=>set('have_children',e.target.value)}>
                <option value="">Select</option>
                {HAVE_CHILDREN_OPTIONS.map(h=><option key={h}>{h}</option>)}
              </select>
            </div>
            {form.have_children === 'Yes' && (
              <div className="form-group">
                <FormLabel>Children Living With</FormLabel>
                <select className="form-select" value={form.children_living_with} onChange={e=>set('children_living_with',e.target.value)}>
                  <option value="">Select</option>
                  {CHILDREN_LIVING_WITH_OPTIONS.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        <div className="form-group">
          <FormLabel>Physical Disability</FormLabel>
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
            <FormLabel>Blood Group</FormLabel>
            <ChipSelect options={BLOOD_GROUPS} value={form.blood_group} onChange={v=>set('blood_group',v)} includeEmpty />
          </div>
          <div className="form-group">
            <FormLabel>Health Information</FormLabel>
            <ChipSelect options={HEALTH_INFO_OPTIONS} value={form.health_info} onChange={v=>set('health_info',v)} includeEmpty />
          </div>
        </div>
        <div className="form-group">
          <FormLabel>Languages I Speak</FormLabel>
          <CheckboxDropdown options={LANGUAGES_SPOKEN} selected={form.languages_spoken}
            onChange={v=>set('languages_spoken',v)} placeholder="Select languages..." />
        </div>
        <div className="form-group">
          <FormLabel>Grew Up In</FormLabel>
          <ChipSelect options={GREW_UP_IN_OPTIONS} value={form.grew_up_in} onChange={v=>set('grew_up_in',v)} includeEmpty />
        </div>
        <div className="form-group">
          <FormLabel>Alternate Email</FormLabel>
          <input className="form-input" value={form.alternate_email} onChange={e=>set('alternate_email',e.target.value)} />
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <SectionLabel style={{marginBottom:14}}>Horoscope</SectionLabel>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Birth Time</FormLabel>
            <input className="form-input" type="time" value={form.birth_time} onChange={e=>set('birth_time',e.target.value)} />
          </div>
          <div className="form-group">
            <FormLabel>Time of Birth Accuracy</FormLabel>
            <ChipSelect options={TIME_OF_BIRTH_ACCURACY} value={form.time_of_birth_accuracy} onChange={v=>set('time_of_birth_accuracy',v)} includeEmpty />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Birth Place (City)</FormLabel>
            <input className="form-input" value={form.birth_place} onChange={e=>set('birth_place',e.target.value)} />
          </div>
          <div className="form-group">
            <FormLabel>Country of Birth</FormLabel>
            <select className="form-select" value={form.country_of_birth} onChange={e=>set('country_of_birth',e.target.value)}>
              <option value="">Select</option>
              {COUNTRIES.filter(c=>c!=='Open to All').map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Manglik</FormLabel>
            <ChipSelect options={MANGLIK_OPTIONS} value={form.manglik} onChange={v=>set('manglik',v)} includeEmpty />
          </div>
          <div className="form-group">
            <FormLabel>Kundli Available?</FormLabel>
            <ChipSelect options={KUNDLI_AVAILABLE} value={form.kundli_available} onChange={v=>set('kundli_available',v)} includeEmpty />
          </div>
        </div>
        <div className="form-group">
          <FormLabel>Horoscope Match Required?</FormLabel>
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
        <SectionLabel style={{marginBottom:14}}>Religion & Community</SectionLabel>
        <div className="form-group">
          <FormLabel>Religion</FormLabel>
          <select className="form-select" value={form.religion} onChange={e=>set('religion',e.target.value)}>
            {RELIGIONS.map(r=><option key={r}>{r}</option>)}
          </select>
        </div>
        {form.religion === 'Muslim' && (
          <div className="form-row">
            <div className="form-group">
              <FormLabel>Denomination / Sect</FormLabel>
              <ChipSelect options={ISLAMIC_DENOMINATIONS} value={form.islamic_denomination} onChange={v=>set('islamic_denomination',v)} includeEmpty />
            </div>
            {form.islamic_denomination === 'Sunni' && (
              <div className="form-group">
                <FormLabel>School of Thought (Madhab)</FormLabel>
                <ChipSelect options={SUNNI_SCHOOLS_OF_THOUGHT} value={form.islamic_school_of_thought} onChange={v=>set('islamic_school_of_thought',v)} includeEmpty />
              </div>
            )}
            {form.islamic_denomination === 'Shia' && (
              <div className="form-group">
                <FormLabel>Shia Branch</FormLabel>
                <ChipSelect options={SHIA_BRANCHES} value={form.islamic_shia_branch} onChange={v=>set('islamic_shia_branch',v)} includeEmpty />
              </div>
            )}
          </div>
        )}
        {form.religion === 'Christian' && (
          <div className="form-row">
            <div className="form-group">
              <FormLabel>Denomination</FormLabel>
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
                <FormLabel>{RELIGION_HIERARCHY[form.religion].denomination.label}</FormLabel>
                <select className="form-select" value={form.religion_denomination}
                  onChange={e=>set('religion_denomination',e.target.value)}>
                  <option value="">Select</option>
                  {RELIGION_HIERARCHY[form.religion].denomination.options.map(d=><option key={d}>{d}</option>)}
                </select>
              </div>
            )}
            {form.religion === 'Zoroastrian' && (
              <div className="form-group">
                <FormLabel>{RELIGION_HIERARCHY[form.religion].community.label}</FormLabel>
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
              <FormLabel>{RELIGION_HIERARCHY[form.religion]?.community.label || 'Community / Caste'}</FormLabel>
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
            <FormLabel>Mother Tongue</FormLabel>
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
            <FormLabel>Sub-Caste / Division</FormLabel>
            <select className="form-select" value={form.islamic_sub_caste_division}
              onChange={e=>set('islamic_sub_caste_division',e.target.value)}>
              {ISLAMIC_SUB_CASTE_DIVISIONS.map(s=><option key={s}>{s}</option>)}
            </select>
            <div className="form-hint">Optional — sab communities ke liye applicable nahi hota</div>
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Sub-Caste</FormLabel>
            <input className="form-input" value={form.sub_caste} onChange={e=>set('sub_caste',e.target.value)} />
          </div>
          {(form.religion === 'Hindu' || form.religion === 'Jain') && (
            <div className="form-group">
              <FormLabel>Gotra</FormLabel>
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
        <div className="form-group">
          <FormLabel>Caste No Bar?</FormLabel>
          <ChipSelect options={CASTE_NO_BAR_OPTIONS} value={form.caste_no_bar} onChange={v=>set('caste_no_bar',v)} includeEmpty />
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <SectionLabel style={{marginBottom:14}}>Location Details</SectionLabel>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>City *</FormLabel>
            <input className="form-input" value={form.city} onChange={e=>set('city',e.target.value)} />
          </div>
          <div className="form-group">
            <FormLabel>State</FormLabel>
            <input className="form-input" value={form.state} onChange={e=>set('state',e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Zip / PIN Code</FormLabel>
            <input className="form-input" value={form.zip_code} onChange={e=>set('zip_code',e.target.value)} />
          </div>
          <div className="form-group">
            <FormLabel>Ethnic Origin</FormLabel>
            <input className="form-input" value={form.ethnic_origin} onChange={e=>set('ethnic_origin',e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Native Place</FormLabel>
            <input className="form-input" value={form.native_place} onChange={e=>set('native_place',e.target.value)} />
          </div>
          <div className="form-group">
            <FormLabel>Relocation Preference</FormLabel>
            <ChipSelect options={RELOCATION_PREFERENCES} value={form.relocation_preference} onChange={v=>set('relocation_preference',v)} includeEmpty />
          </div>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <SectionLabel style={{marginBottom:14}}>Education & Career</SectionLabel>
        <div className="form-group">
          <FormLabel>Highest Education *</FormLabel>
          <ChipSelect options={EDUCATIONS} value={form.education} onChange={v=>set('education',v)} includeEmpty />
        </div>
        {!SCHOOL_ONLY_EDUCATIONS.includes(form.education) && (
        <div className="form-group">
          <FormLabel>Degree</FormLabel>
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
        )}
        <div className="form-group">
          <FormLabel>College/Institution Name</FormLabel>
          <input className="form-input" value={form.college_name} onChange={e=>set('college_name',e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Employment Type</FormLabel>
            <ChipSelect options={EMPLOYMENT_TYPES} value={form.employment_type} onChange={v=>set('employment_type',v)} includeEmpty />
          </div>
          <div className="form-group">
            <FormLabel>Profession Category</FormLabel>
            <select className="form-select" value={form.profession} onChange={e=>set('profession',e.target.value)}>
              <option value="">Select</option>
              {PROFESSION_CATEGORIES.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <FormLabel>Employer</FormLabel>
          <input className="form-input" value={form.employer} onChange={e=>set('employer',e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Annual Income</FormLabel>
            <select className="form-select" value={form.annual_income} onChange={e=>set('annual_income',e.target.value)}>
              {(form.annual_income_currency === 'USD' ? USD_INCOME_RANGES : INCOME_RANGES).map(i=><option key={i}>{i}</option>)}
            </select>
          </div>
          <div className="form-group">
            <FormLabel>Currency</FormLabel>
            <select className="form-select" value={form.annual_income_currency} onChange={e=>{
              setForm(p=>({...p, annual_income_currency:e.target.value, annual_income:''}))
            }}>
              {CURRENCIES.map(c=><option key={c} value={c}>{c === 'INR' ? '₹ INR' : '$ USD'}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <SectionLabel style={{marginBottom:14}}>Lifestyle</SectionLabel>
        <div className="form-group">
          <FormLabel>Diet</FormLabel>
          <select className="form-select" value={form.diet} onChange={e=>set('diet',e.target.value)}>
            {DIETS.map(d=><option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Smoking</FormLabel>
            <ChipSelect options={HABITS} value={form.smoking} onChange={v=>set('smoking',v)} includeEmpty />
          </div>
          <div className="form-group">
            <FormLabel>Drinking</FormLabel>
            <ChipSelect options={HABITS} value={form.drinking} onChange={v=>set('drinking',v)} includeEmpty />
          </div>
        </div>
        <div className="form-group">
          <FormLabel>Hobbies (short text)</FormLabel>
          <input className="form-input" value={form.hobbies} onChange={e=>set('hobbies',e.target.value)} />
        </div>
        <div className="form-group">
          <FormLabel>Interests (select up to {HOBBIES_MAX_SELECT})</FormLabel>
          <MultiSelectChips groups={HOBBIES_INTERESTS} selected={form.hobbies_interests}
            onChange={(v)=>set('hobbies_interests',v)} maxSelect={HOBBIES_MAX_SELECT} />
        </div>
        <div className="form-group">
          <FormLabel>Favourite Cuisines</FormLabel>
          <CheckboxDropdown options={CUISINES} selected={form.cuisines} onChange={(v)=>set('cuisines',v)} placeholder="Select cuisines..." />
        </div>
        <div className="form-group">
          <FormLabel>Sports & Activities</FormLabel>
          <CheckboxDropdown options={SPORTS_LIST} selected={form.sports} onChange={(v)=>set('sports',v)} placeholder="Select sports..." />
        </div>
        <div className="form-group">
          <FormLabel>Favourite Music</FormLabel>
          <CheckboxDropdown options={FAVOURITE_MUSIC} selected={form.favourite_music} onChange={(v)=>set('favourite_music',v)} placeholder="Select music..." />
        </div>
        <div className="form-group">
          <FormLabel>Favourite Books</FormLabel>
          <CheckboxDropdown options={FAVOURITE_BOOKS} selected={form.favourite_books} onChange={(v)=>set('favourite_books',v)} placeholder="Select books..." />
        </div>
        <div className="form-group">
          <FormLabel>Dress Style</FormLabel>
          <ChipSelect options={DRESS_STYLES} value={form.dress_style} onChange={v=>set('dress_style',v)} includeEmpty />
        </div>
        <div className="form-group">
          <FormLabel>About Me</FormLabel>
          <textarea className="form-textarea" value={form.about_me} onChange={e=>set('about_me',e.target.value)} style={{minHeight:100}} />
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <SectionLabel style={{marginBottom:14}}>Family Background</SectionLabel>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Family Type</FormLabel>
            <select className="form-select" value={form.family_type} onChange={e=>set('family_type',e.target.value)}>
              {FAMILY_TYPES.map(f=><option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <FormLabel>Family Values</FormLabel>
            <select className="form-select" value={form.family_values} onChange={e=>set('family_values',e.target.value)}>
              {FAMILY_VALUES.map(f=><option key={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Father's Profession</FormLabel>
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
            <FormLabel>Mother's Profession</FormLabel>
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
            <FormLabel>Brothers</FormLabel>
            <select className="form-select" value={form.brothers_count}
              onChange={e=>setSiblingCount('brothers_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="form-group">
            <FormLabel>Brothers Married</FormLabel>
            <select className="form-select" value={form.brothers_married_count}
              onChange={e=>setSiblingCount('brothers_married_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.filter(n=>n<=form.brothers_count).map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Sisters</FormLabel>
            <select className="form-select" value={form.sisters_count}
              onChange={e=>setSiblingCount('sisters_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="form-group">
            <FormLabel>Sisters Married</FormLabel>
            <select className="form-select" value={form.sisters_married_count}
              onChange={e=>setSiblingCount('sisters_married_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.filter(n=>n<=form.sisters_count).map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <FormLabel>Family City</FormLabel>
          <input className="form-input" value={form.family_city} onChange={e=>set('family_city',e.target.value)} />
        </div>
        <div className="form-group">
          <FormLabel>Family Financial Status</FormLabel>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {FAMILY_FINANCIAL_STATUS.map(f=>{
              const isSelected = form.family_financial_status === f.label
              return (
                <div key={f.label} onClick={()=>set('family_financial_status', f.label)}
                  style={{border:'1.5px solid ' + (isSelected ? 'var(--primary)' : 'var(--gray2)'), borderRadius:'var(--radius)', overflow:'hidden', cursor:'pointer', transition:'border-color 0.2s'}}>
                  <div className={'radio-option' + (isSelected ? ' selected' : '')} style={{borderRadius:0, border:'none', fontWeight:600}}>
                    <span className="radio-dot">{isSelected && <CheckIcon size={12} />}</span> {f.label}
                  </div>
                  {isSelected && (
                    <div style={{padding:'10px 16px 14px', fontSize:12, color:'#555', lineHeight:1.6}}>
                      <div>{f.desc}</div>
                      <div style={{marginTop:4, fontWeight:500}}>Annual family income: {form.nationality && form.nationality !== 'India' ? f.rangeUsd : f.range}</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Family Income Range</FormLabel>
            <select className="form-select" value={form.family_income_range} onChange={e=>set('family_income_range',e.target.value)}>
              <option value="">Select</option>
              {(form.family_income_currency === 'USD' ? USD_FAMILY_INCOME_RANGES : FAMILY_INCOME_RANGES).map(f=><option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <FormLabel>Currency</FormLabel>
            <select className="form-select" value={form.family_income_currency} onChange={e=>{
              setForm(p=>({...p, family_income_currency:e.target.value, family_income_range:''}))
            }}>
              {CURRENCIES.map(c=><option key={c} value={c}>{c === 'INR' ? '₹ INR' : '$ USD'}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <FormLabel>Living With Parents?</FormLabel>
          <ChipSelect options={LIVING_WITH_PARENTS_OPTIONS} value={form.living_with_parents} onChange={v=>set('living_with_parents',v)} includeEmpty />
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <SectionLabel style={{marginBottom:14}}>Assets</SectionLabel>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Own Vehicle</FormLabel>
            <ChipSelect options={VEHICLE_OWNERSHIP} value={form.vehicle_ownership} onChange={v=>set('vehicle_ownership',v)} includeEmpty />
          </div>
          <div className="form-group">
            <FormLabel>Own House</FormLabel>
            <ChipSelect options={OWN_HOUSE_OPTIONS} value={form.own_house} onChange={v=>set('own_house',v)} includeEmpty />
          </div>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <SectionLabel style={{marginBottom:14}}>Partner Preferences</SectionLabel>
        <div className="form-group">
          <FormLabel>Age Preference</FormLabel>
          <DualRangeSlider min={18} max={70}
            valueMin={form.partner_age_min} valueMax={form.partner_age_max}
            onChange={(lo,hi)=>setForm(p=>({...p, partner_age_min:lo, partner_age_max:hi}))}
            formatLabel={v=>v+' yrs'} />
        </div>
        <div className="form-group">
          <FormLabel>Height Preference</FormLabel>
          <DualRangeSlider min={PARTNER_HEIGHT_MIN_INCHES} max={PARTNER_HEIGHT_MAX_INCHES}
            valueMin={form.partner_height_min} valueMax={form.partner_height_max}
            onChange={(lo,hi)=>setForm(p=>({...p, partner_height_min:lo, partner_height_max:hi}))}
            formatLabel={formatHeightFromInches} />
        </div>
        <div className="form-group">
          <FormLabel>Income Preference</FormLabel>
          <select className="form-select" value={form.partner_income_currency} onChange={e=>{
            const bounds = PARTNER_INCOME_BOUNDS[e.target.value]
            setForm(p=>({...p, partner_income_currency:e.target.value, partner_income_min:bounds.min, partner_income_max:bounds.max}))
          }} style={{marginBottom:8, maxWidth:140}}>
            {CURRENCIES.map(c=><option key={c} value={c}>{c === 'INR' ? '₹ INR' : '$ USD'}</option>)}
          </select>
          <DualRangeSlider values={PARTNER_INCOME_STEPS[form.partner_income_currency]}
            valueMin={form.partner_income_min} valueMax={form.partner_income_max}
            onChange={(lo,hi)=>setForm(p=>({...p, partner_income_min:lo, partner_income_max:hi}))}
            formatLabel={v => formatIncomeShort(v, form.partner_income_currency)} />
        </div>
        <div className="form-group">
          <FormLabel>Religion Preference</FormLabel>
          <select className="form-select" value={form.partner_religion} onChange={e=>set('partner_religion',e.target.value)}>
            <option value="Any">Any / Open to all</option>
            {RELIGIONS.map(r=><option key={r}>{r}</option>)}
          </select>
        </div>
        {form.partner_religion !== 'Any' && (
          <div className="form-group">
            <FormLabel>Preferred Community</FormLabel>
            <CheckboxDropdown
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
              placeholder="Select communities..."
            />
            <div className="form-hint">"Any Community / No Bar" select karne par baaki communities apne aap unselect ho jaayengi</div>
          </div>
        )}
        <div className="form-group">
          <FormLabel>Education Level Preference</FormLabel>
          <CheckboxDropdown options={EDUCATIONS} selected={form.partner_education_level_preferences}
            onChange={v=>set('partner_education_level_preferences',v)} placeholder="Select education levels..." />
          <div className="form-hint">Khaali chhodne par sab education levels acceptable maane jaayenge</div>
        </div>
        <div className="form-group">
          <FormLabel>Location Preference</FormLabel>
          <ChipSelect options={LOCATION_PREFERENCES} value={form.partner_location} onChange={v=>set('partner_location',v)} includeEmpty />
        </div>
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Partner City Preference</FormLabel>
            <input className="form-input" value={form.partner_city_preference} onChange={e=>set('partner_city_preference',e.target.value)} />
          </div>
          <div className="form-group">
            <FormLabel>Partner State Preference</FormLabel>
            <input className="form-input" value={form.partner_state_preference} onChange={e=>set('partner_state_preference',e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <FormLabel>Partner Country Preference</FormLabel>
          <select className="form-select" value={form.partner_country_preference} onChange={e=>set('partner_country_preference',e.target.value)}>
            {COUNTRIES.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <FormLabel>Additional Notes</FormLabel>
          <textarea className="form-textarea" value={form.partner_notes} onChange={e=>set('partner_notes',e.target.value)} />
        </div>
      </div>

      {onManagePrivacy ? (
        <div className="card" style={{marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <SectionLabel style={{marginBottom:4}}>Privacy & Sensitive Info</SectionLabel>
            <div style={{fontSize:12,color:'var(--gray3)'}}>Who sees your community, income, contact</div>
          </div>
          <button type="button" className="icon-btn" aria-label="Manage privacy" style={{flexShrink:0}} onClick={onManagePrivacy}>
            <ChevronRight size={20} />
          </button>
        </div>
      ) : (
        <div className="card" style={{marginBottom:12}}>
          <SectionLabel style={{marginBottom:14}}>Privacy & Sensitive Info</SectionLabel>
          <div className="form-group">
            <FormLabel>Who can see your Community/Caste?</FormLabel>
            <ChipSelect options={PRIVACY_LEVELS} value={form.community_privacy} onChange={v=>set('community_privacy',v)} />
          </div>
          <div className="form-group">
            <FormLabel>Who can see your College/Institution Name?</FormLabel>
            <ChipSelect options={PRIVACY_LEVELS} value={form.college_privacy} onChange={v=>set('college_privacy',v)} />
          </div>
          <div className="form-group">
            <FormLabel>Who can see your Company Name?</FormLabel>
            <ChipSelect options={PRIVACY_LEVELS} value={form.company_privacy} onChange={v=>set('company_privacy',v)} />
          </div>
          <div className="form-group">
            <FormLabel>Who can see your Income?</FormLabel>
            <ChipSelect options={PRIVACY_LEVELS} value={form.income_privacy} onChange={v=>set('income_privacy',v)} />
          </div>
          <div className="form-group">
            <FormLabel>Who can see your Contact Details?</FormLabel>
            <ChipSelect options={PRIVACY_LEVELS} value={form.contact_privacy} onChange={v=>set('contact_privacy',v)} />
          </div>
        </div>
      )}

      <div style={{display:'flex',gap:10,marginTop:8,marginBottom:20}}>
        <button className="btn btn-outline" style={{flex:1}} onClick={onCancel}><X size={16} /> Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>
          <CheckIcon size={16} /> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
