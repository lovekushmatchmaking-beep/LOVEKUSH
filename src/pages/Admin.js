import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Clock, CheckCircle2, ShieldX, ShieldCheck, ShieldAlert, Flag, UserCheck, StickyNote, ListChecks } from 'lucide-react'
import { supabase } from '../supabase'
import SignedImage from '../components/SignedImage'
import { RELIGIONS, CASTES, MARITAL_STATUSES, EDUCATIONS } from '../constants/profileOptions'
import CreateProfile from './CreateProfile'
import { EditProfileForm } from './Dashboard'
import { rankMatches } from '../utils/matching'
import { buildWaMeLink, buildMailtoLink, buildWaChooserLink } from '../utils/shareProfile'
import { generateShareLink, generateShareBundle, nativeShare, revokeShareLink, getMyShareLinks } from '../utils/shareLinks'

// SEARCH DESIGN NOTE: yeh search ab DATABASE se query karta hai (Supabase
// .ilike()/.eq()/.gte() ke saath), poore profiles table ko browser mein
// laake client-side filter nahi karta — isliye 100 profiles ho ya
// 100,000, search speed same rahegi. Pagination (Load More) bhi hai
// taaki ek baar mein poora table na load ho.

const PAGE_SIZE = 30

// ===== SELFIE VERIFICATION — existing profiles.verification_status ko hi
// aage badhaya: not_started → selfie_requested → selfie_submitted →
// verified / rejected. Self-signup profile tabhi live (active) hoti hai jab
// admin selfie ko uploaded photo se match karke Verify kare. Admin ki banayi
// profiles seedha verified + active banti hain (CreateProfile adminMode).
// Database trigger guard_profile_verification non-staff ko yeh fields
// badalne nahi deta (sirf selfie submit karna allowed hai).
export const VERIFICATION_LABELS = {
  not_started: 'Not verified',
  selfie_requested: 'Selfie requested',
  selfie_submitted: 'Selfie received — compare & verify',
  verified: 'Verified',
  rejected: 'Selfie rejected — waiting for a new one',
}

const verificationPatch = (status, currentProfileStatus) => {
  if (status === 'verified') {
    return { verification_status: 'verified', is_verified: true, profile_status: currentProfileStatus === 'blocked' ? 'blocked' : 'active' }
  }
  if (status === 'selfie_requested') return { verification_status: 'selfie_requested', selfie_requested_at: new Date().toISOString() }
  return { verification_status: status, is_verified: false }
}

// Self-signup + abhi verified nahi — direct Approve se pehle confirm
const needsSelfieVerification = (p) => !p.is_admin_managed && p.verification_status !== 'verified'

export default function Admin({ staffUser }) {
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState([])
  const [photos, setPhotos] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [stats, setStats] = useState({ total: 0, pending: 0, active: 0, blocked: 0, needsVerification: 0, openReports: 0 })
  const [selected, setSelected] = useState(null)
  const [idMetadata, setIdMetadata] = useState({}) // profile_id -> {created_at, source, created_by} — admin-only, staff_users RLS gated
  const [notesByProfile, setNotesByProfile] = useState({}) // profile_id -> [{id, note, follow_up_at, created_at, staff_user_id}]
  const [newNote, setNewNote] = useState('')
  const [newNoteFollowUp, setNewNoteFollowUp] = useState('')
  const [view, setView] = useState('list') // 'list' | 'createClient' | 'findMatches' | 'editProfile' | 'shareLinks' | 'verificationQueue' | 'reportsQueue' | 'myQueue'
  const [editingProfile, setEditingProfile] = useState(null)
  const [matchesFor, setMatchesFor] = useState(null) // profile jiske liye matches dhoondh rahe hain
  const [matchResults, setMatchResults] = useState([])
  const [matchesLoading, setMatchesLoading] = useState(false)

  // Bulk selection — list mein checkbox se multiple profiles choose karke
  // ek saath Approve/Block karne ke liye (ek-ek karke expand karne ke bajaye)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkWorking, setBulkWorking] = useState(false)

  // Search + Filters
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('') // debounced value that actually triggers query
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    religion: '', community: '', city: '', gender: '',
    ageMin: '', ageMax: '', maritalStatus: '', education: '', assignedToMe: false,
  })

  // Debounce search input (400ms) — DB pe har keystroke pe query nahi maarte
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    loadStats()
  }, [])

  useEffect(() => {
    runQuery(0)
  }, [activeTab, search, filters])

  // Profile ID metadata (kab/kaise/kiske dwara bani) — sirf tab fetch
  // karte hain jab admin kisi profile ko expand karta hai, lazily, aur
  // RLS staff_users check ke through sirf admin ko hi dikhta hai.
  useEffect(() => {
    if (!selected || idMetadata[selected.id]) return
    supabase.from('profile_id_metadata').select('*').eq('profile_id', selected.id).maybeSingle()
      .then(({ data }) => { if (data) setIdMetadata(prev => ({ ...prev, [selected.id]: data })) })
  }, [selected, idMetadata])

  // Notes bhi sirf tab load karte hain jab profile expand ho
  useEffect(() => {
    if (!selected || notesByProfile[selected.id]) return
    loadNotesFor(selected.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const loadStats = async () => {
    const counts = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('profile_status', 'pending'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('profile_status', 'active'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('profile_status', 'blocked'),
      // Needs Verification: selfie aa chuki hai (compare karna hai), ya ID document uploaded par abhi tak verified nahi hua
      supabase.from('profiles').select('*', { count: 'exact', head: true })
        .or('verification_status.eq.selfie_submitted,and(id_document_uploaded.eq.true,verification_status.neq.verified)'),
      supabase.from('profile_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    setStats({
      total: counts[0].count || 0,
      pending: counts[1].count || 0,
      active: counts[2].count || 0,
      blocked: counts[3].count || 0,
      needsVerification: counts[4].count || 0,
      openReports: counts[5].count || 0,
    })
  }

  // Poora query builder — DB-level pe filter apply karta hai, client
  // pe nahi. Yehi "scale ke liye sahi" tareeka hai.
  const buildQuery = (from, to) => {
    let q = supabase.from('profiles').select('*').order('created_at', { ascending: false }).range(from, to)

    if (activeTab !== 'all') q = q.eq('profile_status', activeTab)

    if (search) {
      // PostgREST ke .or() syntax mein comma/bracket jaise characters
      // special meaning rakhte hain — search text se hata dete hain
      // taaki koi query-syntax error na aaye ya unexpected result na mile.
      const safeSearch = search.replace(/[,()%*]/g, '')
      if (safeSearch) {
        q = q.or(`profile_code.ilike.%${safeSearch}%,full_name.ilike.%${safeSearch}%`)
      }
    }
    if (filters.religion) q = q.eq('religion', filters.religion)
    if (filters.community) q = q.eq('community', filters.community)
    if (filters.city) q = q.ilike('city', `%${filters.city}%`)
    if (filters.gender) q = q.eq('gender', filters.gender)
    if (filters.maritalStatus) q = q.eq('marital_status', filters.maritalStatus)
    if (filters.education) q = q.eq('education', filters.education)
    if (filters.ageMin) q = q.gte('age', parseInt(filters.ageMin))
    if (filters.ageMax) q = q.lte('age', parseInt(filters.ageMax))
    if (filters.assignedToMe) q = q.eq('managed_by_staff_id', staffUser.user_id)

    return q
  }

  const runQuery = async (fromIndex) => {
    if (fromIndex === 0) setLoading(true)
    else setLoadingMore(true)

    const { data, error } = await buildQuery(fromIndex, fromIndex + PAGE_SIZE - 1)

    if (error) {
      console.error('Search query failed:', error.message)
      setLoading(false); setLoadingMore(false)
      return
    }

    const newRows = data || []
    setHasMore(newRows.length === PAGE_SIZE)

    if (fromIndex === 0) {
      setProfiles(newRows)
      setSelectedIds(new Set())
    } else {
      setProfiles(prev => [...prev, ...newRows])
    }

    await loadPhotosFor(newRows)
    setLoading(false); setLoadingMore(false)
  }

  const loadPhotosFor = async (rows) => {
    if (rows.length === 0) return
    const ids = rows.map(r => r.id)
    const { data: photoRows } = await supabase
      .from('photos').select('profile_id, storage_path').in('profile_id', ids).eq('is_primary', true)
    if (photoRows) {
      setPhotos(prev => {
        const next = { ...prev }
        photoRows.forEach(p => { next[p.profile_id] = p.storage_path })
        return next
      })
    }
  }

  const loadMore = () => {
    if (!hasMore || loadingMore) return
    runQuery(profiles.length)
  }

  const resetFilters = () => {
    setFilters({ religion:'', community:'', city:'', gender:'', ageMin:'', ageMax:'', maritalStatus:'', education:'', assignedToMe:false })
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  const logAuditEntry = async (action, entityId, metadata) => {
    try {
      await supabase.from('audit_logs').insert({
        actor_user_id: staffUser.user_id,
        actor_role: staffUser.role,
        action,
        entity_type: 'profile',
        entity_id: entityId,
        metadata: metadata || {},
      })
    } catch (e) {
      console.warn('Audit log failed (non-critical):', e.message)
    }
  }

  const updateStatus = async (id, status) => {
    const target = profiles.find(p => p.id === id)
    if (status === 'active' && target && needsSelfieVerification(target)
      && !window.confirm('This profile is not selfie-verified yet. Make it live anyway?')) return
    const { error } = await supabase.from('profiles').update({ profile_status: status }).eq('id', id)
    if (error) {
      alert('Update failed: ' + error.message)
      return
    }
    await logAuditEntry('profile_status_change', id, { new_status: status })
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, profile_status: status } : p))
    loadStats()
    setSelected(null)
  }

  // Manual Premium toggle — UI-only "premium look" (blurred photo/locked
  // fields for non-premium viewers) tak hi limited hai abhi, koi real
  // payment/subscription system nahi hai. Staff yahan se kisi bhi profile
  // ko premium mark/unmark kar sakte hain testing/demo ke liye.
  const togglePremium = async (id, current) => {
    const { error } = await supabase.from('profiles').update({ is_premium: !current }).eq('id', id)
    if (error) {
      alert('Update failed: ' + error.message)
      return
    }
    await logAuditEntry('premium_toggle', id, { is_premium: !current })
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, is_premium: !current } : p))
    if (selected && selected.id === id) setSelected(prev => ({ ...prev, is_premium: !current }))
  }

  // ===== RM ASSIGNMENT — profiles.managed_by_staff_id already existed in the
  // DB (CreateProfile sets it when admin creates a profile) par admin list
  // mein kahin dikhta/badalta nahi tha. "Assign to me" se RM apna naam claim
  // kar sakta hai, taaki follow-up kiske zimme hai yeh clear rahe.
  const assignToMe = async (id) => {
    const { error } = await supabase.from('profiles').update({ managed_by_staff_id: staffUser.user_id }).eq('id', id)
    if (error) { alert('Assign failed: ' + error.message); return }
    await logAuditEntry('rm_assigned', id, { managed_by_staff_id: staffUser.user_id })
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, managed_by_staff_id: staffUser.user_id } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, managed_by_staff_id: staffUser.user_id }))
  }

  const unassign = async (id) => {
    const { error } = await supabase.from('profiles').update({ managed_by_staff_id: null }).eq('id', id)
    if (error) { alert('Unassign failed: ' + error.message); return }
    await logAuditEntry('rm_unassigned', id, {})
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, managed_by_staff_id: null } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, managed_by_staff_id: null }))
  }

  // ===== VERIFICATION — profiles.verification_status already existed
  // (completeness.js already reads it). Ab selfie request / verify bhi
  // isi se hota hai — Verify karte hi profile live (active) ho jaati hai.
  const setVerificationStatus = async (id, status) => {
    const target = profiles.find(p => p.id === id)
    const patch = verificationPatch(status, target?.profile_status)
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) { alert('Update failed: ' + error.message); return }
    await logAuditEntry('verification_status_change', id, { new_status: status })
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, ...patch }))
    loadStats()
  }

  // ===== NOTES / FOLLOW-UP — naya chhota profile_notes table, taaki RM
  // conversations/decisions memory pe depend na karke likhe hue hon
  // (CRM workflow doc: "Every conversation should become a note").
  const loadNotesFor = async (profileId) => {
    const { data } = await supabase.from('profile_notes').select('*').eq('profile_id', profileId).order('created_at', { ascending: false })
    setNotesByProfile(prev => ({ ...prev, [profileId]: data || [] }))
  }

  const addNote = async (profileId) => {
    if (!newNote.trim()) return
    const { error } = await supabase.from('profile_notes').insert({
      profile_id: profileId,
      staff_user_id: staffUser.user_id,
      note: newNote.trim(),
      follow_up_at: newNoteFollowUp || null,
    })
    if (error) { alert('Could not save note: ' + error.message); return }
    setNewNote('')
    setNewNoteFollowUp('')
    loadNotesFor(profileId)
  }

  // ===== BULK ACTIONS — pending queue bade hone par ek-ek profile expand
  // karke action lena slow ho jaata hai; checkbox select + ek-saath apply.
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === profiles.length ? new Set() : new Set(profiles.map(p => p.id)))
  }

  const bulkUpdateStatus = async (status) => {
    if (selectedIds.size === 0) return
    const ids = [...selectedIds]
    const unverified = profiles.filter(p => ids.includes(p.id) && needsSelfieVerification(p)).length
    if (status === 'active' && unverified > 0
      && !window.confirm(`${unverified} selected profile(s) are not selfie-verified yet. Make them live anyway?`)) return
    setBulkWorking(true)
    const { error } = await supabase.from('profiles').update({ profile_status: status }).in('id', ids)
    if (error) {
      alert('Bulk update failed: ' + error.message)
    } else {
      await Promise.all(ids.map(id => logAuditEntry('profile_status_change', id, { new_status: status, via: 'bulk' })))
      setProfiles(prev => prev.map(p => ids.includes(p.id) ? { ...p, profile_status: status } : p))
      setSelectedIds(new Set())
      loadStats()
    }
    setBulkWorking(false)
  }

  // ===== FIND MATCHES (reuses existing matching.js — koi naya algorithm nahi) =====
  const findMatchesForProfile = async (profile) => {
    setMatchesFor(profile)
    setView('findMatches')
    setMatchesLoading(true)
    const oppositeGender = profile.gender === 'Male' ? 'Female' : 'Male'
    const { data: candidates, error } = await supabase
      .from('profiles_public_view')
      .select('*')
      .neq('id', profile.id)
      .eq('gender', oppositeGender)
      .limit(150)

    if (error) {
      alert('Could not load candidates: ' + error.message)
      setMatchesLoading(false)
      return
    }

    const ranked = rankMatches(profile, candidates || [])
    const profileIds = ranked.map(r => r.profile.id)
    let photoMap = {}
    if (profileIds.length > 0) {
      const { data: photoRows } = await supabase
        .from('photos').select('profile_id, storage_path').in('profile_id', profileIds).eq('is_primary', true)
      ;(photoRows || []).forEach(p => { photoMap[p.profile_id] = p.storage_path })
    }
    setMatchResults(ranked.map(r => ({ ...r, photoPath: photoMap[r.profile.id] || null })))
    setMatchesLoading(false)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <nav className="navbar">
        <span style={{ fontFamily:'var(--font-display)', fontSize: 15, fontWeight:500, letterSpacing: '0.35em' }}>ADMIN</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: '#8e8e8e' }}>{staffUser.role === 'admin' ? 'Admin' : 'Relationship Manager'}</span>
          <button className="btn btn-outline" style={{ fontSize: 11, padding: '6px 14px' }} onClick={logout}>Logout</button>
        </div>
      </nav>

      {view === 'createClient' && (
        <div>
          <div style={{maxWidth:800,margin:'0 auto',padding:'20px 20px 0'}}>
            <button className="btn btn-outline btn-sm" onClick={()=>{setView('list'); runQuery(0)}}>← Back to list</button>
          </div>
          <CreateProfile
            user={{ id: staffUser.user_id }}
            adminMode={true}
            onComplete={(newProfile)=>{
              setView('list')
              runQuery(0)
              loadStats()
            }}
          />
        </div>
      )}

      {view === 'editProfile' && editingProfile && (
        <div style={{maxWidth:800,margin:'0 auto',padding:'20px'}}>
          <EditProfileForm
            profile={editingProfile}
            user={{ id: staffUser.user_id }}
            onSave={()=>{ setView('list'); setEditingProfile(null); runQuery(0) }}
            onCancel={()=>{ setView('list'); setEditingProfile(null) }}
          />
        </div>
      )}

      {view === 'shareLinks' && (
        <ShareLinksView staffUserId={staffUser.user_id} onBack={()=>setView('list')} />
      )}

      {view === 'casteSuggestions' && (
        <CasteSuggestionsView onBack={()=>setView('list')} />
      )}

      {view === 'coordinationRequests' && (
        <CoordinationRequestsView onBack={()=>setView('list')} />
      )}

      {view === 'verificationQueue' && (
        <VerificationQueueView staffUser={staffUser} onBack={()=>{setView('list'); loadStats()}} />
      )}

      {view === 'reportsQueue' && (
        <ReportsQueueView staffUser={staffUser} onBack={()=>{setView('list'); loadStats()}} />
      )}

      {view === 'myQueue' && (
        <MyQueueView staffUser={staffUser} onBack={()=>setView('list')}
          onOpenProfile={(p)=>{ setView('list'); setSelected(p) }} />
      )}

      {view === 'findMatches' && matchesFor && (
        <FindMatchesView
          profile={matchesFor}
          results={matchResults}
          loading={matchesLoading}
          staffUserId={staffUser.user_id}
          onBack={()=>{setView('list'); setMatchesFor(null); setMatchResults([])}}
        />
      )}

      {view === 'list' && (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={()=>setView('myQueue')}>🗂 My Queue</button>
          <button className="btn btn-outline btn-sm" onClick={()=>setView('verificationQueue')}>🛡 Verification{stats.needsVerification > 0 ? ` (${stats.needsVerification})` : ''}</button>
          <button className="btn btn-outline btn-sm" onClick={()=>setView('reportsQueue')}>🚩 Reports{stats.openReports > 0 ? ` (${stats.openReports})` : ''}</button>
          <button className="btn btn-outline btn-sm" onClick={()=>setView('casteSuggestions')}>📋 Caste Suggestions</button>
          <button className="btn btn-outline btn-sm" onClick={()=>setView('coordinationRequests')}>🤝 Coordination Requests</button>
          <button className="btn btn-outline btn-sm" onClick={()=>setView('shareLinks')}>🔗 My Share Links</button>
          <button className="btn btn-black btn-sm" onClick={()=>setView('createClient')}>+ Create Client Profile</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total', val: stats.total, bg: '#f5f5f5', fg: '#555', Icon: Users },
            { label: 'Pending', val: stats.pending, bg: '#fff8e1', fg: '#b45309', Icon: Clock },
            { label: 'Active', val: stats.active, bg: '#f0fdf4', fg: '#16a34a', Icon: CheckCircle2 },
            { label: 'Blocked', val: stats.blocked, bg: '#fef2f2', fg: '#dc2626', Icon: ShieldX },
            { label: 'Needs Verification', val: stats.needsVerification, bg: '#eff6ff', fg: '#2563eb', Icon: ShieldAlert, onClick: () => setView('verificationQueue') },
            { label: 'Open Reports', val: stats.openReports, bg: '#fdf4ff', fg: '#9333ea', Icon: Flag, onClick: () => setView('reportsQueue') },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 'var(--radius)', padding: '14px 16px', transition: 'transform 0.15s, box-shadow 0.15s', cursor: s.onClick ? 'pointer' : 'default' }}
              onClick={s.onClick}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize: 28, fontWeight:500 }}>{s.val}</div>
                <s.Icon size={16} color={s.fg} style={{ opacity: 0.7 }} />
              </div>
              <div style={{ fontSize: 10, color: '#8e8e8e', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* SEARCH BAR */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Search by Profile ID (e.g. LK-FH26-1073) or name..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 'var(--radius)',
              border: '1px solid rgba(0,0,0,0.12)', fontSize: 13, outline: 'none',
            }}
          />
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setShowFilters(!showFilters)}
            style={{ position: 'relative' }}
          >
            ⚙ Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
        </div>

        {/* ADVANCED FILTERS PANEL */}
        {showFilters && (
          <div className="list-row" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#8e8e8e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Religion & Community</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <select className="form-select" value={filters.religion} onChange={e=>setFilters(f=>({...f,religion:e.target.value}))}>
                <option value="">Any Religion</option>
                {RELIGIONS.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
              <select className="form-select" value={filters.community} onChange={e=>setFilters(f=>({...f,community:e.target.value}))}>
                <option value="">Any Community</option>
                {CASTES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ fontSize: 10, color: '#8e8e8e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Location & Demographics</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <input className="form-input" placeholder="City" value={filters.city}
                onChange={e=>setFilters(f=>({...f,city:e.target.value}))} />
              <select className="form-select" value={filters.gender} onChange={e=>setFilters(f=>({...f,gender:e.target.value}))}>
                <option value="">Any Gender</option>
                <option>Male</option><option>Female</option>
              </select>
              <input className="form-input" type="number" placeholder="Age Min" value={filters.ageMin}
                onChange={e=>setFilters(f=>({...f,ageMin:e.target.value}))} />
              <input className="form-input" type="number" placeholder="Age Max" value={filters.ageMax}
                onChange={e=>setFilters(f=>({...f,ageMax:e.target.value}))} />
            </div>

            <div style={{ fontSize: 10, color: '#8e8e8e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Marital Status & Education</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <select className="form-select" value={filters.maritalStatus} onChange={e=>setFilters(f=>({...f,maritalStatus:e.target.value}))}>
                <option value="">Any Marital Status</option>
                {MARITAL_STATUSES.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
              <select className="form-select" value={filters.education} onChange={e=>setFilters(f=>({...f,education:e.target.value}))}>
                <option value="">Any Education</option>
                {EDUCATIONS.map(e=><option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.assignedToMe} onChange={e=>setFilters(f=>({...f,assignedToMe:e.target.checked}))} />
              Assigned to me only
            </label>
            {activeFilterCount > 0 && (
              <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={resetFilters}>Reset Filters</button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div className="pill-tabs">
            {['all', 'pending', 'active', 'blocked'].map(t => (
              <button key={t} className={'pill-tab ' + (activeTab === t ? 'active' : '')} onClick={() => setActiveTab(t)}>
                {t}
              </button>
            ))}
          </div>
          <button className="btn btn-black btn-sm" style={{ marginLeft: 'auto' }} onClick={() => runQuery(0)}>
            {loading ? 'Loading...' : '↺ Refresh'}
          </button>
        </div>

        {(search || activeFilterCount > 0) && !loading && (
          <div style={{ fontSize: 12, color: '#8e8e8e', marginBottom: 10 }}>
            {profiles.length} result{profiles.length !== 1 ? 's' : ''} found
            {search && ` for "${search}"`}
          </div>
        )}

        {profiles.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 12, color: '#8e8e8e' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedIds.size === profiles.length} onChange={toggleSelectAll} />
              Select all
            </label>
            {selectedIds.size > 0 && (
              <>
                <span>{selectedIds.size} selected</span>
                <button className="btn btn-black btn-sm" disabled={bulkWorking} onClick={() => bulkUpdateStatus('active')}>✓ Approve Selected</button>
                <button className="btn btn-outline btn-sm" style={{ color: '#dc2626', borderColor: '#dc2626' }} disabled={bulkWorking} onClick={() => bulkUpdateStatus('blocked')}>✕ Block Selected</button>
              </>
            )}
          </div>
        )}

        {!loading && profiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#8e8e8e', fontSize: 14 }}>
            {search || activeFilterCount > 0
              ? <>No profiles match your search. Try a different Profile ID, name, or fewer filters.</>
              : 'No profiles in this category'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {profiles.map(p => (
              <div key={p.id} className="list-row clickable"
                onClick={() => setSelected(selected?.id === p.id ? null : p)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="checkbox" checked={selectedIds.has(p.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSelect(p.id)} />
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#f0f0f0', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {photos[p.id]
                      ? <SignedImage path={photos[p.id]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 18 }}>👤</span>
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{p.full_name}</div>
                    <div style={{ fontSize: 12, color: '#8e8e8e' }}>{p.age}y · {p.city} · {p.religion}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <div className={"badge badge-" + p.profile_status} style={{ fontSize: 10 }}>{p.profile_status}</div>
                    {p.verification_status === 'verified' && <div className="badge" style={{ fontSize: 10, background: '#f0fdf4', color: '#16a34a' }}>✓ Verified</div>}
                    {p.verification_status === 'selfie_submitted' && <div className="badge" style={{ fontSize: 10, background: '#eff6ff', color: '#2563eb' }}>Selfie received</div>}
                    {p.is_premium && <div className="badge" style={{ fontSize: 10, background: '#fef3c7', color: '#b45309' }}>👑 Premium</div>}
                    <div style={{ fontSize: 10, color: '#8e8e8e', fontFamily: 'monospace' }}>{p.profile_code}</div>
                  </div>
                </div>

                {selected?.id === p.id && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14, fontSize: 13 }}>
                      {[
                        ['Community', p.community],
                        ['Sub-Caste / Gotra', [p.sub_caste, p.gotra].filter(Boolean).join(' / ') || null],
                        ['Manglik', p.manglik],
                        ['Rashi / Nakshatra', [p.rashi, p.nakshatra].filter(Boolean).join(' / ') || null],
                        ['Education', p.education],
                        ['Income', p.annual_income],
                        ['Family Type', p.family_type],
                        ['Diet', p.diet],
                        ['Completeness', p.profile_completeness + '%'],
                        ['Registered', new Date(p.created_at).toLocaleDateString('en-IN')],
                        ['Gender', p.gender],
                        ['Marital Status', p.marital_status],
                      ].filter(([,v])=>v).map(([k, v]) => (
                        <div key={k}>
                          <span style={{ color: '#8e8e8e' }}>{k}: </span>
                          <span style={{ fontWeight: 500 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    {p.about_me && <div style={{ fontSize: 13, color: '#555', background: '#f9f9f9', padding: '10px 12px', borderRadius: 8, marginBottom: 14, lineHeight: 1.6 }}>{p.about_me}</div>}

                    {/* RM assignment — profiles.managed_by_staff_id, already in DB */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12 }}>
                      <UserCheck size={14} color="#8e8e8e" />
                      {p.managed_by_staff_id ? (
                        <>
                          <span style={{ color: '#8e8e8e' }}>
                            {p.managed_by_staff_id === staffUser.user_id ? 'Assigned to you' : 'Assigned to another staff member'}
                          </span>
                          <button className="btn btn-outline btn-sm" style={{ padding: '2px 10px', fontSize: 11 }}
                            onClick={e => { e.stopPropagation(); unassign(p.id) }}>Unassign</button>
                        </>
                      ) : (
                        <>
                          <span style={{ color: '#8e8e8e' }}>Unassigned</span>
                          <button className="btn btn-outline btn-sm" style={{ padding: '2px 10px', fontSize: 11 }}
                            onClick={e => { e.stopPropagation(); assignToMe(p.id) }}>Assign to me</button>
                        </>
                      )}
                    </div>

                    {/* Verification — selfie request / compare / verify (profiles.verification_status) */}
                    <div style={{ marginBottom: 14, fontSize: 12 }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {p.verification_status === 'verified'
                          ? <ShieldCheck size={14} color="#16a34a" />
                          : <ShieldAlert size={14} color="#2563eb" />}
                        <span style={{ color: '#8e8e8e' }}>
                          {VERIFICATION_LABELS[p.verification_status] || 'Not verified'}
                          {p.id_document_uploaded && p.verification_status !== 'verified' ? ' · ID document uploaded' : ''}
                          {p.is_admin_managed && p.verification_status !== 'verified' ? ' · created by staff, no selfie needed' : ''}
                        </span>
                        {p.verification_status !== 'verified' && !['selfie_requested', 'selfie_submitted'].includes(p.verification_status) && !p.is_admin_managed && (
                          <button className="btn btn-outline btn-sm" style={{ padding: '2px 10px', fontSize: 11 }}
                            onClick={() => setVerificationStatus(p.id, 'selfie_requested')}>📷 Request Selfie</button>
                        )}
                        {p.verification_status !== 'verified' && (
                          <button className="btn btn-outline btn-sm" style={{ padding: '2px 10px', fontSize: 11, color: '#16a34a', borderColor: '#16a34a' }}
                            onClick={() => setVerificationStatus(p.id, 'verified')}>✓ Verify &amp; Make Live</button>
                        )}
                        {(p.verification_status === 'selfie_submitted' || (p.id_document_uploaded && p.verification_status !== 'verified' && p.verification_status !== 'rejected')) && (
                          <button className="btn btn-outline btn-sm" style={{ padding: '2px 10px', fontSize: 11, color: '#dc2626', borderColor: '#dc2626' }}
                            onClick={() => setVerificationStatus(p.id, 'rejected')}>✕ Reject</button>
                        )}
                      </div>
                      {p.selfie_path && p.verification_status !== 'verified' && (
                        <SelfieCompare selfiePath={p.selfie_path} photoPath={photos[p.id]} />
                      )}
                    </div>

                    {/* Notes / follow-up — naya chhota profile_notes table */}
                    <div style={{ marginBottom: 14 }} onClick={e => e.stopPropagation()}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#8e8e8e', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <StickyNote size={13} /> Notes & Follow-ups
                      </div>
                      {(notesByProfile[p.id] || []).map(n => (
                        <div key={n.id} style={{ fontSize: 12, background: '#f9f9f9', padding: '8px 10px', borderRadius: 8, marginBottom: 6 }}>
                          <div>{n.note}</div>
                          <div style={{ fontSize: 10, color: '#bbb', marginTop: 4 }}>
                            {new Date(n.created_at).toLocaleString('en-IN')}
                            {n.follow_up_at && <> · Follow up: {new Date(n.follow_up_at).toLocaleDateString('en-IN')}</>}
                          </div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        <input className="form-input" placeholder="Add a note (call log, decision, etc.)" value={selected?.id === p.id ? newNote : ''}
                          onChange={e => setNewNote(e.target.value)} style={{ flex: '1 1 200px', fontSize: 12 }} />
                        <input className="form-input" type="date" value={selected?.id === p.id ? newNoteFollowUp : ''}
                          onChange={e => setNewNoteFollowUp(e.target.value)} style={{ fontSize: 12, width: 140 }} />
                        <button className="btn btn-outline btn-sm" onClick={() => addNote(p.id)}>+ Add</button>
                      </div>
                    </div>

                    {idMetadata[p.id] && (
                      <div style={{ fontSize: 11, color: '#8e8e8e', background: '#f5f5f5', padding: '8px 12px', borderRadius: 8, marginBottom: 14 }}>
                        🔒 Admin only — Profile ID <strong style={{ fontFamily: 'monospace' }}>{p.profile_code}</strong> generated {new Date(idMetadata[p.id].created_at).toLocaleString('en-IN')} · {idMetadata[p.id].source === 'admin-added' ? 'Added by staff' : 'Self-registered'}
                        {idMetadata[p.id].created_by && <> (staff id: {idMetadata[p.id].created_by.slice(0, 8)})</>}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {p.profile_status !== 'active' && (
                        <button className="btn btn-black btn-sm" onClick={e => { e.stopPropagation(); updateStatus(p.id, 'active') }}>✓ Approve</button>
                      )}
                      {p.profile_status !== 'blocked' && (
                        <button className="btn btn-outline btn-sm" style={{ color: '#dc2626', borderColor: '#dc2626' }}
                          onClick={e => { e.stopPropagation(); updateStatus(p.id, 'blocked') }}>✕ Block</button>
                      )}
                      {p.profile_status !== 'pending' && (
                        <button className="btn btn-outline btn-sm"
                          onClick={e => { e.stopPropagation(); updateStatus(p.id, 'pending') }}>↩ Set Pending</button>
                      )}
                      <button className="btn btn-outline btn-sm"
                        onClick={e => { e.stopPropagation(); setEditingProfile(p); setView('editProfile') }}>✎ Edit</button>
                      <button className="btn btn-outline btn-sm"
                        onClick={e => { e.stopPropagation(); findMatchesForProfile(p) }}>🔍 Find Matches</button>
                      <button className="btn btn-outline btn-sm"
                        style={p.is_premium ? { color: '#b45309', borderColor: '#b45309' } : {}}
                        onClick={e => { e.stopPropagation(); togglePremium(p.id, p.is_premium) }}>
                        {p.is_premium ? '👑 Remove Premium' : '👑 Make Premium'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {hasMore && (
              <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  )
}

// ===== FIND MATCHES VIEW — reuses existing matching.js, adds masked sharing =====
function FindMatchesView({ profile, results, loading, staffUserId, onBack }) {
  const [expandedId, setExpandedId] = useState(null)
  const [linkFor, setLinkFor] = useState({}) // otherId -> { url, generating, error }
  // Kai matches ek saath ek hi link mein bhejne ke liye (jaise ek client
  // ke liye 5-6 chune hue profiles) — checkbox se chuno, ek link banao.
  const [picked, setPicked] = useState([])
  const [bundle, setBundle] = useState(null) // { url, generating, error, copied }

  const togglePicked = (id) => {
    setBundle(null)
    setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleGenerateBundle = async () => {
    setBundle({ generating: true })
    try {
      const b = await generateShareBundle(picked, staffUserId)
      setBundle({ url: b.url })
    } catch (err) {
      setBundle({ error: err.message })
    }
  }

  const bundleMsg = bundle?.url
    ? `Hi! LOVEKUSH has handpicked ${picked.length} ${picked.length === 1 ? 'match' : 'matches'} for you. View them here (link valid for 7 days):\n\n${bundle.url}`
    : ''
  const bundleWaLink = bundle?.url
    ? (buildWaMeLink(profile.client_phone, bundleMsg) || buildWaChooserLink(bundleMsg))
    : null

  const copyBundle = async () => {
    try { await navigator.clipboard.writeText(bundle.url); setBundle(b => ({ ...b, copied: true })) } catch {}
  }

  const handleGenerateLink = async (otherProfileId) => {
    setLinkFor(prev => ({ ...prev, [otherProfileId]: { generating: true } }))
    try {
      const link = await generateShareLink(otherProfileId, staffUserId)
      setLinkFor(prev => ({ ...prev, [otherProfileId]: { url: link.url } }))
    } catch (err) {
      setLinkFor(prev => ({ ...prev, [otherProfileId]: { error: err.message } }))
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to list</button>

      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>
        Matches for {profile.full_name}
      </h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>
        {profile.profile_code} • Using existing matching algorithm
      </div>

      {picked.length > 0 && (
        <div style={{position:'sticky',top:0,zIndex:5,background:'#fff8e1',borderRadius:12,padding:14,marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>
            {picked.length} selected — share all in one link
            {profile.client_phone
              ? <span style={{fontWeight:400,color:'#8e8e8e'}}> · goes straight to client's WhatsApp ({profile.client_phone})</span>
              : <span style={{fontWeight:400,color:'#8e8e8e'}}> · no client phone saved, WhatsApp will ask which chat</span>}
          </div>
          {!bundle?.url ? (
            <button className="btn btn-black btn-sm" disabled={bundle?.generating} onClick={handleGenerateBundle}>
              {bundle?.generating ? 'Generating...' : `🔗 Create one link for ${picked.length} matches`}
            </button>
          ) : (
            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              <a href={bundleWaLink} target="_blank" rel="noreferrer" className="btn btn-black btn-sm">📱 Send via WhatsApp</a>
              {navigator.share && (
                <button className="btn btn-outline btn-sm"
                  onClick={()=>nativeShare({ title:'Matches from LOVEKUSH', text: bundleMsg.replace(bundle.url, '').trim(), url: bundle.url })}>
                  Share…
                </button>
              )}
              <button className="btn btn-outline btn-sm" onClick={copyBundle}>{bundle.copied ? '✓ Copied' : 'Copy link'}</button>
              <span style={{fontSize:11,color:'#16a34a'}}>Link ready, expires in 7 days</span>
            </div>
          )}
          {bundle?.error && <div style={{fontSize:11,color:'#dc2626',marginTop:6}}>{bundle.error}</div>}
        </div>
      )}

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Finding matches...</div>
      ) : results.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>
          No matches found. This can happen if there are no other active, opposite-gender profiles meeting the hard requirements (age/religion/marital-status preferences).
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {results.map(r => {
            const other = r.profile
            const isExpanded = expandedId === other.id
            const linkState = linkFor[other.id]
            const shareMsg = linkState?.url ? `Hi! Found a match for you on LOVEKUSH:\n\n${linkState.url}` : ''
            const waLink = linkState?.url ? (buildWaMeLink(profile.client_phone, shareMsg) || buildWaChooserLink(shareMsg)) : null
            const mailLink = linkState?.url ? buildMailtoLink(profile.client_email, 'A match for you — LOVEKUSH', `Hi,\n\nWe found a match for you. View secure profile:\n${linkState.url}\n\n(This link expires in 7 days)\n\nRegards,\nLOVEKUSH Global Matchmaking Services`) : null

            return (
              <div key={other.id} className="list-row">
                <div style={{display:'flex',gap:12,alignItems:'center'}}>
                  <input type="checkbox" checked={picked.includes(other.id)} onChange={()=>togglePicked(other.id)}
                    title="Select to share several matches in one link" style={{width:18,height:18,flexShrink:0}} />
                  <div style={{width:48,height:48,borderRadius:'50%',background:'#f0f0f0',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {r.photoPath
                      ? <SignedImage path={r.photoPath} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                      : <span style={{fontSize:18}}>👤</span>}
                  </div>
                  <div style={{flex:1,cursor:'pointer'}} onClick={()=>setExpandedId(isExpanded?null:other.id)}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontWeight:600,fontSize:14}}>{other.full_name}</span>
                      <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,
                        background: r.score>=70?'#f0fdf4':r.score>=40?'#fff8e1':'#f5f5f5',
                        color: r.score>=70?'#16a34a':r.score>=40?'#b45309':'#8e8e8e'}}>
                        {r.score}% match
                      </span>
                    </div>
                    <div style={{fontSize:11,color:'#8e8e8e'}}>{other.age}y • {other.city} • {other.profile_code}</div>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid rgba(0,0,0,0.06)'}}>
                    {r.strengths?.length > 0 && (
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:11,fontWeight:600,color:'#16a34a',marginBottom:4}}>Strong Matches</div>
                        {r.strengths.map((s,i)=><div key={i} style={{fontSize:12,marginBottom:2}}>✓ {s}</div>)}
                      </div>
                    )}
                    {r.needsDiscussion?.length > 0 && (
                      <div>
                        <div style={{fontSize:11,fontWeight:600,color:'#b45309',marginBottom:4}}>Needs Discussion</div>
                        {r.needsDiscussion.map((s,i)=><div key={i} style={{fontSize:12,marginBottom:2}}>△ {s}</div>)}
                      </div>
                    )}
                  </div>
                )}

                <div style={{marginTop:10}}>
                  {!linkState?.url ? (
                    <button className="btn btn-black btn-sm" disabled={linkState?.generating}
                      onClick={()=>handleGenerateLink(other.id)}>
                      {linkState?.generating ? 'Generating...' : '🔗 Generate Secure Share Link'}
                    </button>
                  ) : (
                    <div>
                      <div style={{fontSize:11,color:'#16a34a',marginBottom:6}}>
                        ✓ Link ready (expires in 7 days, one-click revoke available in "My Share Links")
                      </div>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        <a href={waLink} target="_blank" rel="noreferrer" className="btn btn-black btn-sm">📱 Send via WhatsApp</a>
                        {!profile.client_phone && (
                          <span style={{fontSize:11,color:'#8e8e8e',alignSelf:'center'}}>No client phone saved, WhatsApp will ask which chat</span>
                        )}
                        {mailLink && <a href={mailLink} className="btn btn-outline btn-sm">✉ Send via Email</a>}
                      </div>
                    </div>
                  )}
                  {linkState?.error && <div style={{fontSize:11,color:'#dc2626',marginTop:6}}>{linkState.error}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ===== SHARE LINKS MANAGEMENT — view kitni baar khula, revoke karo =====
function ShareLinksView({ staffUserId, onBack }) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const data = await getMyShareLinks(staffUserId)
      setLinks(data)
    } catch (err) {
      console.error(err.message)
    }
    setLoading(false)
  }

  const handleRevoke = async (linkId) => {
    try {
      await revokeShareLink(linkId)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  const copyLink = (token) => {
    navigator.clipboard?.writeText(`${window.location.origin}/share/${token}`)
    alert('Link copied!')
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to list</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:20}}>My Share Links</h2>

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : links.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>
          No share links created yet. Generate one from "Find Matches" for any profile.
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {links.map(l => {
            const isExpired = new Date(l.expires_at) < new Date()
            const status = l.revoked ? 'Revoked' : isExpired ? 'Expired' : 'Active'
            const statusColor = l.revoked ? '#8e8e8e' : isExpired ? '#b45309' : '#16a34a'
            return (
              <div key={l.id} className="list-row">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontSize:12,fontFamily:'monospace',color:'#8e8e8e'}}>/{l.token.slice(0,12)}...</div>
                    <div style={{fontSize:11,color:statusColor,fontWeight:600,marginTop:2}}>{status}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:12,color:'#8e8e8e'}}>{l.view_count} view{l.view_count!==1?'s':''}</div>
                    <div style={{fontSize:10,color:'#bbb'}}>
                      {l.revoked ? 'Revoked' : `Expires ${new Date(l.expires_at).toLocaleDateString('en-IN')}`}
                    </div>
                  </div>
                </div>
                <div style={{display:'flex',gap:8,marginTop:10}}>
                  <button className="btn btn-outline btn-sm" onClick={()=>copyLink(l.token)}>📋 Copy Link</button>
                  {!l.revoked && !isExpired && (
                    <button className="btn btn-outline btn-sm" style={{color:'#dc2626',borderColor:'#dc2626'}}
                      onClick={()=>handleRevoke(l.id)}>✕ Revoke</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CasteSuggestionsView({ onBack }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('caste_suggestions')
        .select('*')
        .eq('status', 'pending')
        .order('times_suggested', { ascending: false })
      if (error) throw error
      setSuggestions(data || [])
    } catch (err) {
      console.error(err.message)
    }
    setLoading(false)
  }

  const handleAction = async (id, status) => {
    try {
      const { error } = await supabase.from('caste_suggestions').update({ status }).eq('id', id)
      if (error) throw error
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to list</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:20}}>Caste Suggestions</h2>

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : suggestions.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>
          No pending suggestions right now.
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {suggestions.map(s => (
            <div key={s.id} className="list-row">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600}}>{s.suggested_name}</div>
                  <div style={{fontSize:12,color:'#8e8e8e',marginTop:2}}>
                    {s.religion}{s.denomination ? ' · ' + s.denomination : ''} · <span style={{textTransform:'capitalize'}}>{s.field_type}</span>
                  </div>
                  <div style={{fontSize:10,color:'#bbb',marginTop:2}}>
                    {new Date(s.created_at).toLocaleDateString('en-IN')}
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:12,color:'#8e8e8e'}}>Suggested {s.times_suggested}x</div>
                </div>
              </div>
              <div style={{display:'flex',gap:8,marginTop:10}}>
                <button className="btn btn-outline btn-sm" style={{color:'#16a34a',borderColor:'#16a34a'}}
                  onClick={()=>handleAction(s.id, 'approved')}>✅ Approve</button>
                <button className="btn btn-outline btn-sm" style={{color:'#dc2626',borderColor:'#dc2626'}}
                  onClick={()=>handleAction(s.id, 'rejected')}>✕ Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Talk/Meeting requests (introductions table) — staff yahan se dekh ke
// dono profiles ko manually coordinate karte hain, koi in-app chat nahi.
function CoordinationRequestsView({ onBack }) {
  const [requests, setRequests] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('introductions')
        .select('*')
        .in('status', ['accepted', 'contacted', 'closed'])
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = data || []
      setRequests(rows)
      const ids = [...new Set(rows.flatMap(r => [r.from_profile, r.to_profile]))]
      if (ids.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, profile_code').in('id', ids)
        const map = {}
        ;(profs || []).forEach(p => { map[p.id] = p })
        setProfilesById(map)
      }
    } catch (err) {
      console.error(err.message)
    }
    setLoading(false)
  }

  const handleAction = async (id, status) => {
    try {
      const { error } = await supabase.from('introductions').update({ status }).eq('id', id)
      if (error) throw error
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  // "viewed" status — SmartMatchApp jaisa sent→viewed→accepted/declined lifecycle
  const handleMarkViewed = async (id) => {
    try {
      const { error } = await supabase.from('introductions').update({ viewed_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  // Post-introduction feedback — Shaadi VIP jaisa closed feedback loop
  const handleSaveFeedback = async (id, fb) => {
    try {
      const { error } = await supabase.from('introductions').update(fb).eq('id', id)
      if (error) throw error
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to list</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:20}}>Coordination Requests</h2>

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : requests.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>
          No Talk/Meeting requests yet.
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {requests.map(r => {
            const from = profilesById[r.from_profile]
            const to = profilesById[r.to_profile]
            return (
              <div key={r.id} className="list-row">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:600}}>
                      {from ? from.full_name : 'Unknown'} → {to ? to.full_name : 'Unknown'}
                    </div>
                    <div style={{fontSize:12,color:'#8e8e8e',marginTop:2,textTransform:'capitalize'}}>
                      {r.request_type === 'meeting' ? 'Meeting request' : 'Talk request'}
                    </div>
                    <div style={{fontSize:10,color:'#bbb',marginTop:2}}>
                      {new Date(r.created_at).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                  <div className={"badge badge-" + (r.status==='closed'?'blocked':r.status==='contacted'?'active':'pending')} style={{fontSize:10}}>
                    {r.status}
                  </div>
                </div>
                <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
                  {!r.viewed_at && (
                    <button className="btn btn-outline btn-sm" onClick={()=>handleMarkViewed(r.id)}>👁 Mark Viewed</button>
                  )}
                  {r.status !== 'contacted' && (
                    <button className="btn btn-outline btn-sm" style={{color:'#16a34a',borderColor:'#16a34a'}}
                      onClick={()=>handleAction(r.id, 'contacted')}>✓ Mark Contacted</button>
                  )}
                  {r.status !== 'closed' && (
                    <button className="btn btn-outline btn-sm" onClick={()=>handleAction(r.id, 'closed')}>Close</button>
                  )}
                </div>
                {r.viewed_at && <div style={{fontSize:10,color:'#bbb',marginTop:6}}>Viewed {new Date(r.viewed_at).toLocaleString('en-IN')}</div>}

                {/* Post-introduction feedback — closes the VIP-matchmaking style loop: feedback sharpens the next match */}
                {r.status === 'closed' && (
                  r.feedback ? (
                    <div style={{fontSize:12,color:'#555',background:'#f9f9f9',padding:'8px 10px',borderRadius:8,marginTop:8}}>
                      Feedback ({r.feedback_rating || 'n/a'}): {r.feedback}
                    </div>
                  ) : (
                    <FeedbackForm requestId={r.id} onSave={(fb)=>handleSaveFeedback(r.id, fb)} />
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FeedbackForm({ requestId, onSave }) {
  const [text, setText] = useState('')
  const [rating, setRating] = useState('neutral')
  return (
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>
      <select className="form-select" value={rating} onChange={e=>setRating(e.target.value)} style={{fontSize:12,width:110}}>
        <option value="positive">👍 Positive</option>
        <option value="neutral">〰 Neutral</option>
        <option value="negative">👎 Negative</option>
      </select>
      <input className="form-input" placeholder="How did the meeting go?" value={text} onChange={e=>setText(e.target.value)} style={{flex:'1 1 180px',fontSize:12}} />
      <button className="btn btn-outline btn-sm" onClick={()=>text.trim() && onSave({ feedback: text.trim(), feedback_rating: rating })}>Save Feedback</button>
    </div>
  )
}

// Selfie (verification ke liye) vs profile ki uploaded photo — side by side
function SelfieCompare({ selfiePath, photoPath }) {
  const box = { width: 120, height: 150, borderRadius: 10, overflow: 'hidden', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
      {[['Verification selfie', selfiePath], ['Profile photo', photoPath]].map(([label, path]) => (
        <div key={label} style={{ textAlign: 'center' }}>
          <div style={box}>
            {path ? <SignedImage path={path} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, color: '#8e8e8e' }}>No photo</span>}
          </div>
          <div style={{ fontSize: 10, color: '#8e8e8e', marginTop: 4 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

// ===== VERIFICATION QUEUE — profiles.verification_status + id_document_uploaded
// already existed in the DB. Ab selfie flow bhi yahin: naye self-signups ko
// selfie request karo, aayi hui selfie ko photo se compare karke Verify karo
// (Verify = verified badge + profile live).
function VerificationQueueView({ staffUser, onBack }) {
  const [profiles, setProfiles] = useState([])
  const [photoByProfile, setPhotoByProfile] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, profile_code, age, city, profile_status, verification_status, id_document_uploaded, is_admin_managed, selfie_path, selfie_requested_at, selfie_submitted_at, created_at')
      .neq('verification_status', 'verified')
      .neq('profile_status', 'blocked')
      .or('verification_status.in.(selfie_submitted,selfie_requested),id_document_uploaded.eq.true,and(profile_status.eq.pending,is_admin_managed.eq.false)')
      .order('created_at', { ascending: true })
    if (error) console.error(error.message)
    const list = data || []
    setProfiles(list)
    if (list.length > 0) {
      const { data: ph } = await supabase.from('photos').select('profile_id, storage_path').in('profile_id', list.map(p => p.id)).eq('is_primary', true)
      const map = {}
      ;(ph || []).forEach(x => { map[x.profile_id] = x.storage_path })
      setPhotoByProfile(map)
    }
    setLoading(false)
  }

  const act = async (p, status) => {
    const { error } = await supabase.from('profiles').update(verificationPatch(status, p.profile_status)).eq('id', p.id)
    if (error) { alert(error.message); return }
    await supabase.from('audit_logs').insert({
      actor_user_id: staffUser.user_id, actor_role: staffUser.role,
      action: 'verification_status_change', entity_type: 'profile', entity_id: p.id, metadata: { new_status: status },
    }).then(()=>{}, ()=>{})
    load()
  }

  const sections = [
    { key: 'review', title: 'Selfie received — compare & verify', items: profiles.filter(p => p.verification_status === 'selfie_submitted' || (p.id_document_uploaded && p.verification_status !== 'selfie_requested')) },
    { key: 'request', title: 'New sign-ups — request a selfie', items: profiles.filter(p => !p.is_admin_managed && ['not_started', 'rejected'].includes(p.verification_status || 'not_started') && !p.id_document_uploaded) },
    { key: 'waiting', title: 'Waiting for the user\'s selfie', items: profiles.filter(p => p.verification_status === 'selfie_requested') },
  ]

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to list</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Verification Queue</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>Self-signup profiles go live only after their selfie is matched with their photo and verified</div>

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : profiles.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Nothing waiting on verification right now.</div>
      ) : sections.filter(sec => sec.items.length > 0).map(sec => (
        <div key={sec.key} style={{marginBottom:24}}>
          <div style={{fontSize:12,fontWeight:600,color:'#8e8e8e',marginBottom:8}}>{sec.title} ({sec.items.length})</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {sec.items.map(p => (
              <div key={p.id} className="list-row">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:600}}>{p.full_name}</div>
                    <div style={{fontSize:12,color:'#8e8e8e'}}>{p.age}y · {p.city} · {p.profile_code}</div>
                  </div>
                  <div className="badge" style={{fontSize:10, background:'#eff6ff', color:'#2563eb'}}>
                    {p.id_document_uploaded && p.verification_status !== 'selfie_submitted' ? 'ID document uploaded' : (VERIFICATION_LABELS[p.verification_status] || 'Not verified')}
                  </div>
                </div>
                {p.selfie_path && sec.key === 'review' && <SelfieCompare selfiePath={p.selfie_path} photoPath={photoByProfile[p.id]} />}
                <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
                  {sec.key === 'request' && (
                    <button className="btn btn-black btn-sm" onClick={()=>act(p,'selfie_requested')}>📷 Request Selfie</button>
                  )}
                  <button className={'btn btn-sm ' + (sec.key === 'review' ? 'btn-black' : 'btn-outline')} onClick={()=>act(p,'verified')}>✓ Verify &amp; Make Live</button>
                  {sec.key === 'review' && (
                    <button className="btn btn-outline btn-sm" style={{color:'#dc2626',borderColor:'#dc2626'}} onClick={()=>act(p,'rejected')}>✕ Reject</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== REPORTS QUEUE — profile_reports table already existed in the DB
// (client "Report" flow writes to it) par admin side koi review UI nahi tha.
function ReportsQueueView({ staffUser, onBack }) {
  const [reports, setReports] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profile_reports')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (error) { console.error(error.message); setLoading(false); return }
    const rows = data || []
    setReports(rows)
    const ids = [...new Set(rows.flatMap(r => [r.reporter_profile_id, r.reported_profile_id]))]
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, profile_code, profile_status').in('id', ids)
      const map = {}
      ;(profs || []).forEach(p => { map[p.id] = p })
      setProfilesById(map)
    }
    setLoading(false)
  }

  const resolve = async (id, status, reportedProfileId, alsoBlock) => {
    const { error } = await supabase.from('profile_reports').update({
      status, resolved_at: new Date().toISOString(), resolved_by: staffUser.user_id,
    }).eq('id', id)
    if (error) { alert(error.message); return }
    if (alsoBlock && reportedProfileId) {
      await supabase.from('profiles').update({ profile_status: 'blocked' }).eq('id', reportedProfileId)
    }
    load()
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to list</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Reports Queue</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>Profiles reported by other members, awaiting review</div>

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : reports.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>No pending reports.</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {reports.map(r => {
            const reporter = profilesById[r.reporter_profile_id]
            const reported = profilesById[r.reported_profile_id]
            return (
              <div key={r.id} className="list-row">
                <div style={{fontSize:14,fontWeight:600}}>
                  {reported ? reported.full_name : 'Unknown'} <span style={{fontWeight:400,color:'#8e8e8e'}}>reported by {reporter ? reporter.full_name : 'Unknown'}</span>
                </div>
                <div style={{fontSize:12,color:'#555',marginTop:4}}>{r.reason}</div>
                <div style={{fontSize:10,color:'#bbb',marginTop:4}}>{new Date(r.created_at).toLocaleDateString('en-IN')}</div>
                <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
                  <button className="btn btn-outline btn-sm" style={{color:'#dc2626',borderColor:'#dc2626'}}
                    onClick={()=>resolve(r.id, 'resolved', r.reported_profile_id, true)}>✕ Block Reported Profile</button>
                  <button className="btn btn-outline btn-sm"
                    onClick={()=>resolve(r.id, 'dismissed', r.reported_profile_id, false)}>Dismiss</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ===== MY QUEUE — "what needs me today" view (Shaadi/SmartMatchApp RM
// dashboard pattern), existing tables se compute, koi naya data model nahi.
function MyQueueView({ staffUser, onBack, onOpenProfile }) {
  const [loading, setLoading] = useState(true)
  const [overdueFollowUps, setOverdueFollowUps] = useState([])
  const [assignedPending, setAssignedPending] = useState([])
  const [newSubmissions, setNewSubmissions] = useState([])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const nowIso = new Date().toISOString()
    const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString()
    const [followUpsRes, assignedRes, newRes] = await Promise.all([
      supabase.from('profile_notes').select('*, profiles(id, full_name, profile_code)').lte('follow_up_at', nowIso).order('follow_up_at', { ascending: true }).limit(20),
      supabase.from('profiles').select('id, full_name, profile_code, age, city, profile_status').eq('managed_by_staff_id', staffUser.user_id).eq('profile_status', 'pending').limit(20),
      supabase.from('profiles').select('id, full_name, profile_code, age, city, created_at').eq('profile_status', 'pending').gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(20),
    ])
    setOverdueFollowUps(followUpsRes.data || [])
    setAssignedPending(assignedRes.data || [])
    setNewSubmissions(newRes.data || [])
    setLoading(false)
  }

  const Section = ({ icon: Icon, title, items, renderItem, empty }) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#8e8e8e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        <Icon size={14} /> {title} {items.length > 0 && `(${items.length})`}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: '#bbb' }}>{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(renderItem)}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to list</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>My Queue</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>Today's follow-ups, your assigned profiles, and new submissions</div>

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : (
        <>
          <Section icon={Clock} title="Follow-ups due" items={overdueFollowUps} empty="Nothing due."
            renderItem={n => (
              <div key={n.id} className="list-row clickable" onClick={()=>n.profiles && onOpenProfile(n.profiles)}>
                <div style={{fontSize:13,fontWeight:600}}>{n.profiles?.full_name || 'Profile'}</div>
                <div style={{fontSize:12,color:'#555',marginTop:2}}>{n.note}</div>
                <div style={{fontSize:10,color:'#bbb',marginTop:4}}>Due {new Date(n.follow_up_at).toLocaleDateString('en-IN')}</div>
              </div>
            )} />
          <Section icon={ListChecks} title="Your pending profiles" items={assignedPending} empty="No pending profiles assigned to you."
            renderItem={p => (
              <div key={p.id} className="list-row clickable" onClick={()=>onOpenProfile(p)}>
                <div style={{fontSize:13,fontWeight:600}}>{p.full_name}</div>
                <div style={{fontSize:12,color:'#8e8e8e'}}>{p.age}y · {p.city} · {p.profile_code}</div>
              </div>
            )} />
          <Section icon={Users} title="New submissions this week" items={newSubmissions} empty="No new submissions this week."
            renderItem={p => (
              <div key={p.id} className="list-row clickable" onClick={()=>onOpenProfile(p)}>
                <div style={{fontSize:13,fontWeight:600}}>{p.full_name}</div>
                <div style={{fontSize:12,color:'#8e8e8e'}}>{p.age}y · {p.city} · {p.profile_code}</div>
              </div>
            )} />
        </>
      )}
    </div>
  )
}
