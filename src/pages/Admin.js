import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Users, Clock, CheckCircle2, ShieldX, ShieldCheck, ShieldAlert, Flag, UserCheck, StickyNote,
  ListChecks, UserPlus, BarChart3, RefreshCw, GitBranch, Copy, CalendarClock, Menu, X, LogOut,
  ClipboardList, Handshake, Link2, SlidersHorizontal, Search, Pencil, Crown, Camera, RotateCcw,
  UserRound, Plus, Wrench, UserCog, Eye,
} from 'lucide-react'
import { supabase } from '../supabase'
import SignedImage from '../components/SignedImage'
import { RELIGIONS, CASTES, MARITAL_STATUSES, EDUCATIONS } from '../constants/profileOptions'
import CreateProfile from './CreateProfile'
import BiodataView from './BiodataView'
import { EditProfileForm } from './Dashboard'
import { rankMatches } from '../utils/matching'
import { STATS_COLUMNS, DIMENSIONS, filterProfiles, breakdown, computeFunnel } from '../utils/adminStats'
import { findDuplicateLeads } from '../utils/duplicateLeads'
import { buildWaMeLink, buildMailtoLink, buildWaChooserLink } from '../utils/shareProfile'
import { ContactButtons, ProfileContact, CALL_OUTCOME_LABELS, CALL_OUTCOME_COLORS, contactLogPrefix } from '../components/ContactButtons'
import { generateShareLink, generateShareBundle, nativeShare, revokeShareLink, getMyShareLinks } from '../utils/shareLinks'

// SEARCH DESIGN NOTE: yeh search ab DATABASE se query karta hai (Supabase
// .ilike()/.eq()/.gte() ke saath), poore profiles table ko browser mein
// laake client-side filter nahi karta — isliye 100 profiles ho ya
// 100,000, search speed same rahegi. Pagination (Load More) bhi hai
// taaki ek baar mein poora table na load ho.

const PAGE_SIZE = 30

// Dashboard Breakdown + Funnel ek hi profiles fetch share karte hain —
// Breakdown ke columns + Funnel/duplicate-check ke liye id/contact.
const DASH_PROFILE_COLUMNS = 'id, client_phone, client_email, ' + STATS_COLUMNS

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

// ===== SHARED PROFILE ACTIONS — pehle Profiles list, Verification Queue aur
// Reports Queue teeno apna-apna DB update likhte the (copy-paste), aur
// Reports Queue ka "Block Reported Profile" audit log likhna bhool gaya tha.
// Ab teeno jagah yahi functions use hote hain, isliye audit log (kisne,
// kab, kya kiya) har jagah se ek jaisa banta hai.
async function writeAuditLog(staffUser, action, entityId, metadata) {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      actor_user_id: staffUser.user_id,
      actor_role: staffUser.role,
      action,
      entity_type: 'profile',
      entity_id: entityId,
      metadata: metadata || {},
    })
    if (error) throw error
  } catch (e) {
    console.warn('Audit log failed (non-critical):', e.message)
  }
}

// Request Selfie / Verify & Make Live / Reject. Returns the applied patch, or null on failure.
async function applyVerificationStatus(staffUser, profile, status) {
  const patch = verificationPatch(status, profile?.profile_status)
  const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
  if (error) { alert('Update failed: ' + error.message); return null }
  await writeAuditLog(staffUser, 'verification_status_change', profile.id, { new_status: status })
  return patch
}

// Approve / Block / Set Pending for one or many profiles. Returns true on success.
async function applyProfileStatus(staffUser, ids, status, extraMeta) {
  const { error } = await supabase.from('profiles').update({ profile_status: status }).in('id', ids)
  if (error) { alert('Update failed: ' + error.message); return false }
  await Promise.all(ids.map(id => writeAuditLog(staffUser, 'profile_status_change', id, { new_status: status, ...(extraMeta || {}) })))
  return true
}

// "Make Premium" button abhi hidden hai — koi real payment/subscription
// system nahi hai, isliye Aryan ne kaha (2026-10-03) abhi ke liye chhupa do.
// Code (togglePremium) delete nahi kiya; monetization aane par yeh true karo.
const SHOW_PREMIUM_TOGGLE = false

// Chhota Refresh button — har queue/tool screen ke header mein same look.
function RefreshButton({ onClick, loading }) {
  return (
    <button className="btn btn-outline btn-sm" onClick={onClick} disabled={loading}>
      <RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />{loading ? 'Refreshing...' : 'Refresh'}
    </button>
  )
}

// Back + Refresh ek row mein (queue/tool screens ka common header).
function ViewTopBar({ onBack, onRefresh, loading }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <button className="btn btn-outline btn-sm" onClick={onBack}>← Back to list</button>
      {onRefresh && <RefreshButton onClick={onRefresh} loading={loading} />}
    </div>
  )
}

// Simple client-side search box for the smaller queue lists.
function ListSearch({ value, onChange, placeholder }) {
  return (
    <input type="text" className="form-input" value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} style={{ width: '100%', fontSize: 13, marginBottom: 14 }} />
  )
}

const matchesSearch = (q, ...fields) => {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return fields.some(f => f && String(f).toLowerCase().includes(needle))
}

export default function Admin({ staffUser }) {
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState([])
  const [photos, setPhotos] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [stats, setStats] = useState({ total: 0, male: 0, female: 0, newWeek: 0, newToday: 0, pending: 0, active: 0, blocked: 0, needsVerification: 0, openReports: 0, pendingCoordination: 0 })
  const [statsUpdatedAt, setStatsUpdatedAt] = useState(null)
  const [listUpdatedAt, setListUpdatedAt] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showFunnel, setShowFunnel] = useState(false)
  const [dashProfiles, setDashProfiles] = useState(null) // shared by Breakdown + Funnel (one fetch)
  const [selected, setSelected] = useState(null)
  const [idMetadata, setIdMetadata] = useState({}) // profile_id -> {created_at, source, created_by} — admin-only, staff_users RLS gated
  const [notesByProfile, setNotesByProfile] = useState({}) // profile_id -> [{id, note, follow_up_at, call_outcome, created_at, staff_user_id}]
  const [newNote, setNewNote] = useState('')
  const [newNoteFollowUp, setNewNoteFollowUp] = useState('')
  const [newNoteOutcome, setNewNoteOutcome] = useState('')
  // ===== VIEW NAVIGATION — Aryan ne complain kiya ki drawer/queue ke andar
  // jaane ke baad phone ka "back" button kaam nahi karta (view sirf local
  // state tha, URL/history se juda nahi). Ab view ko ?view= query param mein
  // rakhte hain: andar jaana ek history entry push karta hai, "list" par
  // wapas jaana (har "← Back" button, form save/cancel) navigate(-1) karta
  // hai — matlab phone/browser back button ab in-app back jaise hi kaam
  // karta hai, real navigation stack ke saath.
  // ===== SECTION NAVIGATION — same history-stack idea extended to the
  // top-level nav (Profiles/Dashboard/Queues/Tools/Account). Pehle section
  // switch sirf local state tha (koi history push nahi), isliye agar admin
  // Dashboard tab par (list view hi hai) phone ka back button dabaye to
  // seedha /admin se bahar nikal jaata tha. Ab section bhi ?section= query
  // param mein rehta hai (profiles = default, param omit), isliye har
  // section switch bhi ek history entry push karta hai aur back button
  // pichhle section/view par hi wapas le jaata hai.
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') || 'list'
  const section = searchParams.get('section') || 'profiles' // main nav: profiles | dashboard | queues | tools | account
  const setView = (v) => {
    if (v === 'list') navigate(-1) // undoes the push below — matches hardware back
    else setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('view', v)
      return next
    })
  }
  // Section switch while already on the list (the common case: tapping
  // another bottom-nav/sidebar tab) — pushes one new history entry.
  const setSectionOnly = (s) => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    if (s === 'profiles') next.delete('section'); else next.set('section', s)
    next.delete('view')
    return next
  })
  // Combined section+view jump (e.g. a Dashboard stat tile opening a queue
  // directly) — one push, so one back-press returns to exactly where the
  // admin started instead of landing on the wrong tab.
  const goToSectionView = (s, v) => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    if (s === 'profiles') next.delete('section'); else next.set('section', s)
    next.set('view', v)
    return next
  })
  const [editingProfile, setEditingProfile] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null) // read-only "Full Profile" view — separate from Edit, no accidental changes
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
  const DEFAULT_FILTERS = {
    religion: '', community: '', city: '', gender: '',
    ageMin: '', ageMax: '', maritalStatus: '', education: '', assignedToMe: false,
  }
  // Filters panel ab apna last-used state (open/closed + jo filters chune
  // the) localStorage mein yaad rakhta hai, taaki roz same filter (jaise
  // "assigned to me") use karne waalon ko har baar panel expand + filter
  // dobara select na karna pade. Sirf "remember last state" — koi naya
  // saved-preset system nahi (scope-creep se bachne ke liye).
  const [showFilters, setShowFilters] = useState(() => {
    try { return localStorage.getItem('admin_filters_open') === '1' } catch { return false }
  })
  const [filters, setFilters] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('admin_filters_state') || 'null')
      return saved ? { ...DEFAULT_FILTERS, ...saved } : DEFAULT_FILTERS
    } catch { return DEFAULT_FILTERS }
  })

  useEffect(() => {
    try { localStorage.setItem('admin_filters_open', showFilters ? '1' : '0') } catch {}
  }, [showFilters])
  useEffect(() => {
    try { localStorage.setItem('admin_filters_state', JSON.stringify(filters)) } catch {}
  }, [filters])

  // Debounce search input (400ms) — DB pe har keystroke pe query nahi maarte
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  // STATS COUNTER — loads once when the list view opens, then auto-refreshes
  // every 1 hour (2026-10-03: Aryan had earlier asked for manual-only, then
  // explicitly asked for 1-hour auto-refresh — this replaces that). Manual
  // "Refresh" button next to it still works for an on-demand check.
  useEffect(() => {
    if (view !== 'list') return
    loadStats()
    const t = setInterval(loadStats, 60 * 60 * 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

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
    setStatsLoading(true)
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const counts = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('profile_status', 'pending'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('profile_status', 'active'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('profile_status', 'blocked'),
      // Needs Verification: selfie aa chuki hai (compare karna hai), ya ID document uploaded par abhi tak verified nahi hua
      supabase.from('profiles').select('*', { count: 'exact', head: true })
        .or('verification_status.eq.selfie_submitted,and(id_document_uploaded.eq.true,verification_status.neq.verified)'),
      supabase.from('profile_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('gender', 'Male'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('gender', 'Female'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', startOfToday.toISOString()),
      // Pending coordination requests — dono members ne abhi accept/decline nahi
      // kiya, isliye yeh koi list mein nahi dikhte the. Ab count + queue mein visible.
      supabase.from('introductions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    setStats({
      total: counts[0].count || 0,
      pending: counts[1].count || 0,
      active: counts[2].count || 0,
      blocked: counts[3].count || 0,
      needsVerification: counts[4].count || 0,
      openReports: counts[5].count || 0,
      male: counts[6].count || 0,
      female: counts[7].count || 0,
      newWeek: counts[8].count || 0,
      newToday: counts[9].count || 0,
      pendingCoordination: counts[10].count || 0,
    })
    setStatsUpdatedAt(new Date())
    setStatsLoading(false)
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
    if (fromIndex === 0) setListUpdatedAt(new Date())
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

  // Breakdown aur Funnel dono ko same profiles rows chahiye — pehle dono apni
  // taraf se poori profiles table alag fetch karte the. Ab ek hi fetch,
  // dono panels ko prop se milta hai; Refresh (statsUpdatedAt) par dobara.
  const dashPanelsOpen = showBreakdown || showFunnel
  useEffect(() => {
    if (!dashPanelsOpen) return
    let cancelled = false
    setDashProfiles(null)
    supabase.from('profiles').select(DASH_PROFILE_COLUMNS).then(({ data, error }) => {
      if (cancelled) return
      if (error) console.error(error.message)
      setDashProfiles(data || [])
    })
    return () => { cancelled = true }
  }, [dashPanelsOpen, statsUpdatedAt])

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS)
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  const logAuditEntry = (action, entityId, metadata) => writeAuditLog(staffUser, action, entityId, metadata)

  const updateStatus = async (id, status) => {
    const target = profiles.find(p => p.id === id)
    if (status === 'active' && target && needsSelfieVerification(target)
      && !window.confirm('This profile is not selfie-verified yet. Make it live anyway?')) return
    // Block karne ka koi confirmation nahi tha — ek galti se click se kisi
    // member ki profile turant block ho jaati thi. Active karne jaisa hi
    // safety net ab Block par bhi (symmetric confirmations).
    if (status === 'blocked' && target
      && !window.confirm(`Block ${target.full_name || 'this profile'}? They will no longer be visible to other members.`)) return
    if (!(await applyProfileStatus(staffUser, [id], status))) return
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
    const target = profiles.find(p => p.id === id) || (selected?.id === id ? selected : { id })
    const patch = await applyVerificationStatus(staffUser, target, status)
    if (!patch) return
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
    if (!newNote.trim() && !newNoteOutcome) return
    const { error } = await supabase.from('profile_notes').insert({
      profile_id: profileId,
      staff_user_id: staffUser.user_id,
      note: newNote.trim() || CALL_OUTCOME_LABELS[newNoteOutcome],
      follow_up_at: newNoteFollowUp || null,
      call_outcome: newNoteOutcome || null,
    })
    if (error) { alert('Could not save note: ' + error.message); return }
    setNewNote('')
    setNewNoteFollowUp('')
    setNewNoteOutcome('')
    loadNotesFor(profileId)
  }

  // Call/WhatsApp tap karte hi profile khulti hai aur note box mein call-log
  // ki shuruaat aa jaati hai — baat khatam karke outcome chip daba ke + Add.
  const startContactLog = (p, kind) => {
    if (selected?.id !== p.id) setSelected(p)
    setNewNote(prev => (selected?.id === p.id && prev.trim()) ? prev
      : contactLogPrefix(kind))
  }

  const updateClientPhone = (id, phone) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, client_phone: phone } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, client_phone: phone }))
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
    if (status === 'blocked'
      && !window.confirm(`Block ${ids.length} selected profile(s)? They will no longer be visible to other members.`)) return
    setBulkWorking(true)
    if (await applyProfileStatus(staffUser, ids, status, { via: 'bulk' })) {
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

  const needsAttention = (stats.needsVerification || 0) + (stats.openReports || 0)

  const navItems = [
    { id: 'profiles', label: 'Profiles', Icon: Users },
    { id: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
    { id: 'queues', label: 'Queues', Icon: ListChecks, badge: needsAttention },
    { id: 'tools', label: 'Tools', Icon: Wrench },
    { id: 'account', label: 'Account', Icon: UserRound },
  ]
  const sectionForView = { verificationQueue:'queues', reportsQueue:'queues', myQueue:'queues', duplicateLeads:'queues', casteSuggestions:'tools', coordinationRequests:'tools', shareLinks:'tools', createClient:'profiles', editProfile:'profiles', fullProfile:'profiles', findMatches:'profiles' }
  const effectiveSection = view === 'list' ? section : (sectionForView[view] || section)
  const switchSection = (s) => { if (view !== 'list') navigate(-1); setSectionOnly(s) }

  return (
    <div className="admin-shell">
      {/* ===== DESKTOP SIDEBAR ===== */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <span className="gradient-text" style={{ fontFamily:'var(--font-display)', fontSize: 13, fontWeight:600, letterSpacing:'0.3em' }}>ADMIN</span>
        </div>
        {navItems.map(it => (
          <button key={it.id} className={'admin-sidebar-item' + (effectiveSection === it.id ? ' active' : '')}
            onClick={() => switchSection(it.id)}>
            <it.Icon size={19} />
            <span style={{ flex: 1 }}>{it.label}</span>
            {!!it.badge && <span className="chip chip-primary" style={{ marginLeft: 'auto' }}>{it.badge}</span>}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: 'var(--gray3)', padding: '8px 14px' }}>
          {staffUser.role === 'admin' ? 'Administrator' : 'Relationship Manager'}
        </div>
        <button className="admin-sidebar-item danger" onClick={logout}>
          <LogOut size={19} />
          <span>Logout</span>
        </button>
      </aside>

      <div className="admin-main">
        {/* Mobile top bar */}
        <nav className="navbar admin-topbar">
          <span className="gradient-text" style={{ fontFamily:'var(--font-display)', fontSize: 15, fontWeight:500, letterSpacing:'0.35em' }}>ADMIN</span>
          <span className="chip chip-muted" style={{ textTransform: 'none' }}>{staffUser.role === 'admin' ? 'Admin' : 'RM'}</span>
        </nav>

        <div className="admin-page">
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

      {/* Read-only full profile — reuses the member's own BiodataView (same
          component users see for themselves), so "View" can never
          accidentally change a field the way opening Edit-mode could. */}
      {view === 'fullProfile' && viewingProfile && (
        <div style={{maxWidth:800,margin:'0 auto',padding:'20px'}}>
          <BiodataView
            profile={viewingProfile}
            photo={photos[viewingProfile.id] ? { storage_path: photos[viewingProfile.id] } : null}
            onBack={()=>{ setView('list'); setViewingProfile(null) }}
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

      {view === 'staffManagement' && (
        <StaffManagementView staffUser={staffUser} onBack={()=>setView('list')} />
      )}

      {view === 'duplicateLeads' && (
        <DuplicateLeadsView onBack={()=>setView('list')}
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

      {view === 'list' && section === 'profiles' && (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}>Profiles</div>
          <button className="btn btn-black btn-sm" onClick={()=>setView('createClient')}>
            <Plus size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Create Client
          </button>
        </div>
        {/* SEARCH & FILTER — status tabs, search aur Filters teeno ka kaam
            "list ko narrow karna" hai, isliye ab ek hi box mein grouped hain
            (pehle teen alag rows header mein bikhri dikhti thi). Logic same. */}
        <div style={{ background: '#fafafa', border: '1px solid #ededed', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: '#8e8e8e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Search &amp; Filter</div>
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
            <SlidersHorizontal size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
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
              Assigned to me only <span style={{ color: '#8e8e8e', fontSize: 11 }}>(all statuses — today's pending to-dos are in Queues → My Queue)</span>
            </label>
            {activeFilterCount > 0 && (
              <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={resetFilters}>Reset Filters</button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="pill-tabs" style={{ flex: '1 1 auto', minWidth: 0 }}>
            {['all', 'pending', 'active', 'blocked'].map(t => (
              <button key={t} className={'pill-tab ' + (activeTab === t ? 'active' : '')} onClick={() => setActiveTab(t)}>
                {t}
              </button>
            ))}
          </div>
          <button className="btn btn-black btn-sm" style={{ flex: '0 0 auto' }} onClick={() => runQuery(0)}>
            {loading ? 'Loading...' : <><RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Refresh</>}
          </button>
        </div>
        </div>
        {listUpdatedAt && (
          <div style={{ fontSize: 11, color: 'var(--gray3)', marginTop: -4, marginBottom: 10 }}>
            Last refreshed {listUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}

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
                <button className="btn btn-black btn-sm" disabled={bulkWorking} onClick={() => bulkUpdateStatus('active')}><CheckCircle2 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Approve Selected</button>
                <button className="btn btn-outline btn-sm" style={{ color: '#dc2626', borderColor: '#dc2626' }} disabled={bulkWorking} onClick={() => bulkUpdateStatus('blocked')}><ShieldX size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Block Selected</button>
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
                      : <UserRound size={18} color="#bbb" />
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{p.full_name}</div>
                    <div style={{ fontSize: 12, color: '#8e8e8e' }}>{p.age}y · {p.city} · {p.religion}</div>
                  </div>
                  {selected?.id !== p.id && <ContactButtons phone={p.client_phone} onAction={kind => startContactLog(p, kind)} />}
                  {/* Ek hi row mein wrap karo — pehle "active" + "✓ Verified" + "Premium"
                      alag-alag lines mein stack hoke card ko lamba bana rahe the. "active"
                      ka matlab hi verified hai (is app ke flow mein), isliye Verified badge
                      ab sirf tab dikhta hai jab status active nahi hai — ek kam badge, kam clutter. */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 }}>
                      <div className={"badge badge-" + p.profile_status} style={{ fontSize: 10 }}>{p.profile_status}</div>
                      {p.verification_status === 'verified' && p.profile_status !== 'active' && <div className="badge" style={{ fontSize: 10, background: '#f0fdf4', color: '#16a34a' }}>✓ Verified</div>}
                      {p.verification_status === 'selfie_submitted' && <div className="badge" style={{ fontSize: 10, background: '#eff6ff', color: '#2563eb' }}>Selfie received</div>}
                      {SHOW_PREMIUM_TOGGLE && p.is_premium && <div className="badge" style={{ fontSize: 10, background: '#fef3c7', color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Crown size={10} />Premium</div>}
                    </div>
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

                    {/* Quick contact — client_phone par seedha Call / WhatsApp */}
                    <ProfileContact key={p.id + (p.client_phone || '')} profile={p}
                      onSaved={phone => updateClientPhone(p.id, phone)}
                      onAction={kind => startContactLog(p, kind)} />

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
                            onClick={() => setVerificationStatus(p.id, 'selfie_requested')}><Camera size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Request Selfie</button>
                        )}
                        {p.verification_status !== 'verified' && (
                          <button className="btn btn-outline btn-sm" style={{ padding: '2px 10px', fontSize: 11, color: '#16a34a', borderColor: '#16a34a' }}
                            onClick={() => setVerificationStatus(p.id, 'verified')}><ShieldCheck size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Verify &amp; Make Live</button>
                        )}
                        {(p.verification_status === 'selfie_submitted' || (p.id_document_uploaded && p.verification_status !== 'verified' && p.verification_status !== 'rejected')) && (
                          <button className="btn btn-outline btn-sm" style={{ padding: '2px 10px', fontSize: 11, color: '#dc2626', borderColor: '#dc2626' }}
                            onClick={() => setVerificationStatus(p.id, 'rejected')}><X size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Reject</button>
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
                          {n.call_outcome && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, marginRight: 6,
                              background: CALL_OUTCOME_COLORS[n.call_outcome]?.bg, color: CALL_OUTCOME_COLORS[n.call_outcome]?.fg }}>
                              {CALL_OUTCOME_LABELS[n.call_outcome]}
                            </span>
                          )}
                          <div style={{ display: 'inline' }}>{n.note}</div>
                          <div style={{ fontSize: 10, color: '#bbb', marginTop: 4 }}>
                            {new Date(n.created_at).toLocaleString('en-IN')}
                            {n.follow_up_at && <> · Follow up: {new Date(n.follow_up_at).toLocaleDateString('en-IN')}</>}
                          </div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        {Object.entries(CALL_OUTCOME_LABELS).map(([key, label]) => (
                          <button key={key} type="button"
                            className="btn btn-outline btn-sm"
                            style={{ padding: '2px 8px', fontSize: 11,
                              ...((selected?.id === p.id && newNoteOutcome === key) ? { background: CALL_OUTCOME_COLORS[key].bg, color: CALL_OUTCOME_COLORS[key].fg, borderColor: CALL_OUTCOME_COLORS[key].fg } : {}) }}
                            onClick={() => { if (selected?.id !== p.id) setSelected(p); setNewNoteOutcome(prev => (selected?.id === p.id && prev === key) ? '' : key) }}>
                            {label}
                          </button>
                        ))}
                      </div>
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
                        <button className="btn btn-black btn-sm" onClick={e => { e.stopPropagation(); updateStatus(p.id, 'active') }}><CheckCircle2 size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Approve</button>
                      )}
                      {p.profile_status !== 'blocked' && (
                        <button className="btn btn-outline btn-sm" style={{ color: '#dc2626', borderColor: '#dc2626' }}
                          onClick={e => { e.stopPropagation(); updateStatus(p.id, 'blocked') }}><ShieldX size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Block</button>
                      )}
                      {p.profile_status !== 'pending' && (
                        <button className="btn btn-outline btn-sm"
                          onClick={e => { e.stopPropagation(); updateStatus(p.id, 'pending') }}><RotateCcw size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Set Pending</button>
                      )}
                      <button className="btn btn-outline btn-sm"
                        onClick={e => { e.stopPropagation(); setViewingProfile(p); setView('fullProfile') }}><Eye size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />View Full Profile</button>
                      <button className="btn btn-outline btn-sm"
                        onClick={e => { e.stopPropagation(); setEditingProfile(p); setView('editProfile') }}><Pencil size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Edit</button>
                      <button className="btn btn-outline btn-sm"
                        onClick={e => { e.stopPropagation(); findMatchesForProfile(p) }}><Search size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Find Matches</button>
                      {SHOW_PREMIUM_TOGGLE && (
                        <button className="btn btn-outline btn-sm"
                          style={p.is_premium ? { color: '#b45309', borderColor: '#b45309' } : {}}
                          onClick={e => { e.stopPropagation(); togglePremium(p.id, p.is_premium) }}>
                          <><Crown size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{p.is_premium ? 'Remove Premium' : 'Make Premium'}</>
                        </button>
                      )}
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
      {view === 'list' && section === 'dashboard' && (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}>Dashboard</div>
          <button className="btn btn-outline btn-sm" onClick={loadStats} disabled={statsLoading}>
            <RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            {statsLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total', val: stats.total, bg: '#f5f5f5', fg: '#555', Icon: Users },
            { label: 'Male', val: stats.male, bg: '#eef2ff', fg: '#4f46e5', Icon: Users },
            { label: 'Female', val: stats.female, bg: '#fdf2f8', fg: '#db2777', Icon: Users },
            { label: 'New (7d)', val: stats.newWeek, sub: `Today ${stats.newToday}`, bg: '#ecfeff', fg: '#0891b2', Icon: UserPlus },
            { label: 'Pending', val: stats.pending, bg: '#fff8e1', fg: '#b45309', Icon: Clock },
            { label: 'Active', val: stats.active, bg: '#f0fdf4', fg: '#16a34a', Icon: CheckCircle2 },
            { label: 'Blocked', val: stats.blocked, bg: '#fef2f2', fg: '#dc2626', Icon: ShieldX },
            { label: 'Verify', val: stats.needsVerification, bg: '#eff6ff', fg: '#2563eb', Icon: ShieldAlert, onClick: () => goToSectionView('queues', 'verificationQueue') },
            { label: 'Reports', val: stats.openReports, bg: '#fdf4ff', fg: '#9333ea', Icon: Flag, onClick: () => goToSectionView('queues', 'reportsQueue') },
          ].map(s => (
            <div key={s.label} className="list-row" style={{ background: s.bg, padding: '16px 14px', cursor: s.onClick ? 'pointer' : 'default', transition: 'transform 0.15s, box-shadow 0.15s' }}
              onClick={s.onClick}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize: 26, fontWeight:600 }}>{s.val}</div>
                <s.Icon size={18} color={s.fg} style={{ opacity: 0.7 }} />
              </div>
              <div style={{ fontSize: 11, color: '#8e8e8e', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div>
              {s.sub && <div style={{ fontSize: 11, color: s.fg, marginTop: 2 }}>{s.sub}</div>}
            </div>
          ))}
        </div>
        {statsUpdatedAt && <div style={{ fontSize: 11, color: 'var(--gray3)', marginBottom: 16 }}>Last updated {statsUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setShowBreakdown(v => !v)}>
            <BarChart3 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />{showBreakdown ? 'Hide breakdown' : 'Breakdown (age, height, religion...)'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowFunnel(v => !v)}>
            <GitBranch size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />{showFunnel ? 'Hide funnel' : 'Conversion Funnel'}
          </button>
        </div>
        {showBreakdown && <StatsBreakdown profiles={dashProfiles} />}
        {showFunnel && <FunnelView profiles={dashProfiles} refreshKey={statsUpdatedAt} onOpenDuplicates={() => goToSectionView('queues', 'duplicateLeads')} />}
      </div>
      )}
      {view === 'list' && section === 'queues' && (
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, marginBottom: 20 }}>Queues</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          <AdminNavCard icon={ListChecks} label="My Queue" onClick={()=>setView('myQueue')} />
          <AdminNavCard icon={ShieldAlert} label="Verification" badge={stats.needsVerification} onClick={()=>setView('verificationQueue')} />
          <AdminNavCard icon={Flag} label="Reports" badge={stats.openReports} onClick={()=>setView('reportsQueue')} />
          <AdminNavCard icon={Copy} label="Duplicate Leads" onClick={()=>setView('duplicateLeads')} />
        </div>
      </div>
      )}
      {view === 'list' && section === 'tools' && (
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, marginBottom: 20 }}>Tools</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          <AdminNavCard icon={ClipboardList} label="Caste Suggestions" subtitle="New castes/gotras members typed in" onClick={()=>setView('casteSuggestions')} />
          <AdminNavCard icon={Handshake} label="Coordination" subtitle="Talk/meeting requests between members" badge={stats.pendingCoordination} onClick={()=>setView('coordinationRequests')} />
          <AdminNavCard icon={Link2} label="Share Links" subtitle="Profile/match links sent to clients" onClick={()=>setView('shareLinks')} />
        </div>
      </div>
      )}
      {view === 'list' && section === 'account' && (
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, marginBottom: 20 }}>Account</div>
        <div className="list-row" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="avatar" style={{ width: 48, height: 48 }}><UserRound size={22} /></div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{staffUser.role === 'admin' ? 'Administrator' : 'Relationship Manager'}</div>
              <div style={{ fontSize: 12, color: 'var(--gray3)' }}>Lovekush Global Matchmaking Services</div>
            </div>
          </div>
        </div>
        {staffUser.role === 'admin' && (
          <button className="btn btn-outline btn-sm" style={{ marginBottom: 16 }} onClick={() => setView('staffManagement')}>
            <UserCog size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Manage Staff
          </button>
        )}
        <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={logout}>
          <LogOut size={16} style={{ marginRight: 6 }} />Logout
        </button>
      </div>
      )}
        </div>
      </div>

      {/* ===== MOBILE BOTTOM NAV ===== */}
      <nav className="bottom-nav admin-bottom-nav">
        {navItems.map(it => (
          <button key={it.id} className={'bottom-nav-item' + (effectiveSection === it.id ? ' active' : '')}
            onClick={() => switchSection(it.id)}>
            <span className="nav-icon"><it.Icon size={22} /></span>
            <span className="nav-label">{it.label}</span>
            {!!it.badge && <span className="nav-dot" />}
          </button>
        ))}
      </nav>
    </div>
  )
}

// ===== NAV CARD — grid item for Queues/Tools sections (replaces old AdminDrawer)
function AdminNavCard({ icon: Icon, label, subtitle, badge, onClick }) {
  return (
    <button className="list-row clickable" onClick={onClick}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 16px', textAlign: 'center', cursor: 'pointer', width: '100%' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--gray1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={22} color="var(--gray3)" />
      </div>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
      {subtitle && <span style={{ fontSize: 11, color: 'var(--gray3)', marginTop: -6 }}>{subtitle}</span>}
      {!!badge && <span className="chip chip-primary">{badge}</span>}
    </button>
  )
}

// ===== LIVE STATS BREAKDOWN — Aryan ke "jese marji chae dekh saku" ask ke
// liye: defaults (Total/Male/Female/New) upar hamesha visible hain, yeh
// expandable panel har dimension (age/height/religion/etc, adminStats.js
// mein defined) pe on-demand filter/breakdown deta hai. Existing profiles
// table se hi — koi naya column/table nahi.
// `profiles` comes from Admin's shared dashboard fetch (null while loading).
function StatsBreakdown({ profiles }) {
  const [dim, setDim] = useState('age')
  const [gender, setGender] = useState('')
  const [status, setStatus] = useState('')
  const [joined, setJoined] = useState('all')
  const loading = profiles === null

  const filtered = profiles ? filterProfiles(profiles, { gender, status, joined }) : []
  const rows = profiles ? breakdown(filtered, dim) : []
  const maxTotal = Math.max(1, ...rows.map(r => r.total))

  return (
    <div style={{ background: '#fafafa', border: '1px solid #ededed', borderRadius: 'var(--radius)', padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <select className="form-select" value={dim} onChange={e => setDim(e.target.value)} style={{ maxWidth: 220 }}>
          {Object.entries(DIMENSIONS).map(([key, d]) => <option key={key} value={key}>Break down by: {d.label}</option>)}
        </select>
        <select className="form-select" value={gender} onChange={e => setGender(e.target.value)} style={{ maxWidth: 140 }}>
          <option value="">All genders</option><option value="Male">Male</option><option value="Female">Female</option>
        </select>
        <select className="form-select" value={status} onChange={e => setStatus(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="blocked">Blocked</option>
        </select>
        <select className="form-select" value={joined} onChange={e => setJoined(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="all">Joined: any time</option>
          <option value="today">Joined: today</option>
          <option value="7d">Joined: last 7 days</option>
          <option value="30d">Joined: last 30 days</option>
          <option value="90d">Joined: last 90 days</option>
        </select>
      </div>
      {loading && <div style={{ fontSize: 13, color: '#8e8e8e' }}>Loading…</div>}
      {!loading && (
        <>
          <div style={{ fontSize: 12, color: '#8e8e8e', marginBottom: 10 }}>{filtered.length} profile{filtered.length === 1 ? '' : 's'} matched</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map(r => (
              <div key={r.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                  <span>{r.label}</span>
                  <span style={{ color: '#8e8e8e' }}>{r.total} <span style={{ color: '#4f46e5' }}>M {r.male}</span> · <span style={{ color: '#db2777' }}>F {r.female}</span></span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: '#eee', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(r.total / maxTotal) * 100}%`, background: '#9333ea' }} />
                </div>
              </div>
            ))}
            {rows.length === 0 && <div style={{ fontSize: 13, color: '#8e8e8e' }}>No profiles match these filters.</div>}
          </div>
        </>
      )}
    </div>
  )
}

// ===== CONVERSION FUNNEL — Registered → Active → Matched → Meeting
// Requested → Meeting Done. Counts come from profiles.profile_status
// (existing) plus introductions/match_actions (existing tables) — no new
// lead/stage table. Small data volume today, so distinct-profile counts
// are computed client-side like StatsBreakdown already does.
// `profiles` comes from Admin's shared dashboard fetch (same rows as Breakdown);
// only introductions/match_actions are fetched here.
function FunnelView({ profiles, refreshKey, onOpenDuplicates }) {
  const [activity, setActivity] = useState(null) // { intros, actions }

  useEffect(() => {
    let cancelled = false
    setActivity(null)
    Promise.all([
      supabase.from('introductions').select('from_profile, to_profile, status'),
      supabase.from('match_actions').select('actor_profile_id, target_profile_id, action').in('action', ['like', 'super_like']),
    ]).then(([introsRes, actionsRes]) => {
      if (!cancelled) setActivity({ intros: introsRes.data || [], actions: actionsRes.data || [] })
    })
    return () => { cancelled = true }
  }, [refreshKey])

  const loading = profiles === null || activity === null

  const { counts, dupCount } = useMemo(() => {
    if (loading) return { counts: null, dupCount: 0 }
    const { intros, actions } = activity
    const matched = new Set()
    actions.forEach(a => { matched.add(a.actor_profile_id); matched.add(a.target_profile_id) })
    const meetingRequested = new Set()
    const meetingDone = new Set()
    intros.forEach(i => {
      meetingRequested.add(i.from_profile); meetingRequested.add(i.to_profile)
      if (i.status === 'contacted' || i.status === 'closed') { meetingDone.add(i.from_profile); meetingDone.add(i.to_profile) }
    })
    return {
      counts: {
        registered: profiles.length,
        active: profiles.filter(p => p.profile_status === 'active').length,
        matched: matched.size,
        meetingRequested: meetingRequested.size,
        meetingDone: meetingDone.size,
      },
      dupCount: findDuplicateLeads(profiles).length,
    }
  }, [loading, profiles, activity])

  const stages = counts ? computeFunnel(counts) : []
  const maxCount = Math.max(1, ...stages.map(s => s.count))

  return (
    <div style={{ background: '#fafafa', border: '1px solid #ededed', borderRadius: 'var(--radius)', padding: 16, marginBottom: 20 }}>
      {loading && <div style={{ fontSize: 13, color: '#8e8e8e' }}>Loading…</div>}
      {!loading && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stages.map(s => (
              <div key={s.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                  <span>{s.label}</span>
                  <span style={{ color: '#8e8e8e' }}>
                    {s.count}
                    {s.conversionPct !== null && <span style={{ color: s.conversionPct >= 50 ? '#16a34a' : '#b45309' }}> · {s.conversionPct}% of previous</span>}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: '#eee', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(s.count / maxCount) * 100}%`, background: '#2563eb' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#8e8e8e', marginTop: 14 }}>
            "% of previous" = yeh stage ki count ÷ pichle stage ki count — har stage par kitna drop-off hua, yeh dikhata hai (funnel khud raw counts hai, yeh us par ratio hai).
          </div>
          {dupCount > 0 && (
            <div style={{ marginTop: 10, fontSize: 12 }}>
              <button className="btn btn-outline btn-sm" onClick={onOpenDuplicates}>🧬 {dupCount} possible duplicate lead{dupCount === 1 ? '' : 's'} found — review</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ===== DUPLICATE LEADS — same client_phone/client_email par do profiles ban
// jaayein (galti se do baar register, ya admin ne dobara bana diya) to
// yahan dikh jaate hain. Existing profiles.client_phone/client_email se hi
// — koi naya table nahi. Blocking nahi karte, sirf flag karte hain taaki
// Aryan decide kare (merge/ek ko block/jaane do).
function DuplicateLeadsView({ onBack, onOpenProfile }) {
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState([])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles')
      .select('id, full_name, profile_code, age, city, profile_status, client_phone, client_email, created_at')
    setGroups(findDuplicateLeads(data || []))
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} />
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Duplicate Leads</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>Profiles sharing the same phone number or email — same person registered twice?</div>

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Checking...</div>
      ) : groups.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>No duplicate phone numbers or emails found. 🎉</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {groups.map(g => (
            <div key={g.key} className="list-row">
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <Copy size={14} color="#dc2626" />
                <span style={{fontSize:12,fontWeight:600}}>Same {g.type === 'phone' ? 'phone number' : 'email'}:</span>
                <span style={{fontSize:12,fontFamily:'monospace',color:'#8e8e8e'}}>{g.value}</span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {g.profiles.map(p => (
                  <div key={p.id} className="list-row clickable" style={{background:'#f9f9f9'}} onClick={()=>onOpenProfile(p)}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600}}>{p.full_name} <span className={"badge badge-" + p.profile_status} style={{fontSize:9,marginLeft:6}}>{p.profile_status}</span></div>
                        <div style={{fontSize:11,color:'#8e8e8e'}}>{p.age}y · {p.city} · {p.profile_code} · registered {new Date(p.created_at).toLocaleDateString('en-IN')}</div>
                      </div>
                      <ContactButtons phone={p.client_phone} logProfile={p} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
  // Paytm receipt jaisa "seedha usi ke WhatsApp par" — web app phone ki share
  // list ka order nahi badal sakta, isliye client ka number ho to wa.me/<number>
  // seedha usi chat ko kholta hai. Number save na ho (self-signup profiles)
  // to yahin daal ke save kar sakte hain.
  const [clientPhone, setClientPhone] = useState(profile.client_phone || '')
  const [phoneDraft, setPhoneDraft] = useState('')
  const [phoneError, setPhoneError] = useState('')

  const saveClientPhone = async () => {
    const digits = phoneDraft.replace(/\D/g, '')
    if (digits.length < 10) { setPhoneError('Enter a valid number (10 digits, or with country code)'); return }
    const { error } = await supabase.from('profiles').update({ client_phone: phoneDraft.trim() }).eq('id', profile.id)
    if (error) { setPhoneError('Could not save: ' + error.message); return }
    setClientPhone(phoneDraft.trim()); setPhoneDraft(''); setPhoneError('')
  }

  // Match wali profiles ke number (public view mein phone nahi hota) —
  // staff RLS se profiles table se laate hain, taaki unki family ko bhi
  // seedha call/WhatsApp ho sake.
  const [phonesById, setPhonesById] = useState({})
  useEffect(() => {
    const ids = results.map(r => r.profile.id)
    if (ids.length === 0) return
    supabase.from('profiles').select('id, client_phone').in('id', ids).then(({ data }) => {
      const map = {}
      ;(data || []).forEach(x => { if (x.client_phone) map[x.id] = x.client_phone })
      setPhonesById(map)
    })
  }, [results])
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
    ? (buildWaMeLink(clientPhone, bundleMsg) || buildWaChooserLink(bundleMsg))
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
      {clientPhone && (
        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:-12,marginBottom:16,fontSize:12}}>
          <span style={{color:'#8e8e8e',fontFamily:'monospace'}}>{clientPhone}</span>
          <ContactButtons phone={clientPhone} logProfile={profile} size="md" />
        </div>
      )}

      {!clientPhone && (
        <div style={{background:'#f9f9f9',borderRadius:12,padding:12,marginBottom:14}}>
          <div style={{fontSize:12,marginBottom:6}}>Save {profile.full_name}'s WhatsApp number so matches open straight in their chat</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <input className="form-input" placeholder="9876543210" value={phoneDraft} inputMode="tel"
              onChange={e=>setPhoneDraft(e.target.value)} style={{flex:'1 1 160px',fontSize:13}} />
            <button className="btn btn-outline btn-sm" onClick={saveClientPhone}>Save number</button>
          </div>
          {phoneError && <div style={{fontSize:11,color:'#dc2626',marginTop:6}}>{phoneError}</div>}
        </div>
      )}

      {picked.length > 0 && (
        <div style={{position:'sticky',top:0,zIndex:5,background:'#fff8e1',borderRadius:12,padding:14,marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>
            {picked.length} selected — share all in one link
            {clientPhone
              ? <span style={{fontWeight:400,color:'#8e8e8e'}}> · goes straight to client's WhatsApp ({clientPhone})</span>
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
            const waLink = linkState?.url ? (buildWaMeLink(clientPhone, shareMsg) || buildWaChooserLink(shareMsg)) : null
            const mailLink = linkState?.url ? buildMailtoLink(profile.client_email, 'A match for you — LOVEKUSH', `Hi,\n\nWe found a match for you. View secure profile:\n${linkState.url}\n\n(This link expires in 7 days)\n\nRegards,\nLOVEKUSH Global Matchmaking Services`) : null

            return (
              <div key={other.id} className="list-row">
                <div style={{display:'flex',gap:12,alignItems:'center'}}>
                  <input type="checkbox" checked={picked.includes(other.id)} onChange={()=>togglePicked(other.id)}
                    title="Select to share several matches in one link" style={{width:18,height:18,flexShrink:0}} />
                  <div style={{width:48,height:48,borderRadius:'50%',background:'#f0f0f0',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {r.photoPath
                      ? <SignedImage path={r.photoPath} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                      : <UserRound size={18} color="#bbb" />}
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
                  <ContactButtons phone={phonesById[other.id]} logProfile={other} />
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
                        {!clientPhone && (
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
                  <button className="btn btn-outline btn-sm" onClick={()=>copyLink(l.token)}><Copy size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Copy Link</button>
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
  const [query, setQuery] = useState('')

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

  const visibleSuggestions = suggestions.filter(s => matchesSearch(query, s.suggested_name, s.religion, s.denomination, s.field_type))

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
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} />
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:20}}>Caste Suggestions</h2>
      {suggestions.length > 0 && <ListSearch value={query} onChange={setQuery} placeholder="Search by name, religion or type..." />}

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : suggestions.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>
          No pending suggestions right now.
        </div>
      ) : visibleSuggestions.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>No suggestions match "{query}".</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {visibleSuggestions.map(s => (
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
                  onClick={()=>handleAction(s.id, 'rejected')}><X size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Reject</button>
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
  const [scheduleDraft, setScheduleDraft] = useState({}) // request id -> datetime-local string being edited
  // Pending (not yet accepted/declined by the receiver) requests were never
  // shown here before — admin had no visibility until both members acted.
  // Now included by default so admin can see/coordinate proactively.
  const [tab, setTab] = useState('open') // open (pending+accepted+contacted) | pending | closed | all
  const [query, setQuery] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('introductions')
        .select('*')
        .in('status', ['pending', 'accepted', 'contacted', 'closed'])
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = data || []
      setRequests(rows)
      const ids = [...new Set(rows.flatMap(r => [r.from_profile, r.to_profile]))]
      if (ids.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, profile_code, client_phone').in('id', ids)
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

  // Call/meeting scheduling — introductions.scheduled_at, "Today's calls &
  // meetings" (My Queue) ko yahin se data milta hai.
  const handleSchedule = async (id, datetimeLocal) => {
    if (!datetimeLocal) return
    try {
      const { error } = await supabase.from('introductions').update({ scheduled_at: new Date(datetimeLocal).toISOString() }).eq('id', id)
      if (error) throw error
      setScheduleDraft(prev => ({ ...prev, [id]: undefined }))
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleUnschedule = async (id) => {
    try {
      const { error } = await supabase.from('introductions').update({ scheduled_at: null }).eq('id', id)
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

  const filteredRequests = requests.filter(r => {
    if (tab === 'all') return true
    if (tab === 'pending') return r.status === 'pending'
    if (tab === 'closed') return r.status === 'closed'
    return r.status !== 'closed' // 'open'
  }).filter(r => {
    const a = profilesById[r.from_profile], b = profilesById[r.to_profile]
    return matchesSearch(query, a?.full_name, a?.profile_code, b?.full_name, b?.profile_code)
  })

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} />
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:14}}>Coordination Requests</h2>
      {requests.length > 0 && <ListSearch value={query} onChange={setQuery} placeholder="Search by member name or Profile ID..." />}

      <div className="pill-tabs" style={{marginBottom:16}}>
        {['open','pending','closed','all'].map(t => (
          <button key={t} className={'pill-tab ' + (tab === t ? 'active' : '')} onClick={()=>setTab(t)}>
            {t === 'pending' ? `pending (${requests.filter(r=>r.status==='pending').length})` : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : filteredRequests.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>
          {query.trim() ? `No requests match "${query}".` : tab === 'pending' ? 'No requests waiting on a response.' : 'No Talk/Meeting requests yet.'}
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {filteredRequests.map(r => {
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
                    {/* Dono families ko seedha call/WhatsApp — coordination yahin se.
                        Number missing ho to yahin inline add/save bhi ho sakta hai
                        (Find Matches ka wahi ProfileContact pattern reuse) — pehle
                        button simply gayab ho jaata tha, admin ko pata nahi chalta tha. */}
                    {[from, to].filter(Boolean).map(x => (
                      <div key={x.id} style={{marginTop:6}}>
                        <div style={{fontSize:11,color:'#8e8e8e',marginBottom:2}}>{x.full_name}</div>
                        <ProfileContact profile={x} logCalls
                          onSaved={(phone)=>setProfilesById(prev=>({ ...prev, [x.id]: { ...prev[x.id], client_phone: phone } }))} />
                      </div>
                    ))}
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                    <div className={"badge badge-" + (r.status==='closed'?'blocked':r.status==='contacted'?'active':'pending')} style={{fontSize:10}}>
                      {r.status}
                    </div>
                    {r.scheduled_at && (
                      <div style={{fontSize:10,color:'#2563eb',display:'flex',alignItems:'center',gap:4}}>
                        <CalendarClock size={11} /> {new Date(r.scheduled_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}
                      </div>
                    )}
                  </div>
                </div>
                {/* Schedule a call/meeting time — My Queue ke "Today" section mein dikhta hai */}
                <div style={{display:'flex',alignItems:'center',gap:6,marginTop:8,flexWrap:'wrap'}} onClick={e=>e.stopPropagation()}>
                  <CalendarClock size={13} color="#8e8e8e" />
                  <input type="datetime-local" className="form-input" style={{fontSize:12,padding:'4px 8px',width:190}}
                    value={scheduleDraft[r.id] ?? ''}
                    onChange={e=>setScheduleDraft(prev=>({ ...prev, [r.id]: e.target.value }))} />
                  <button className="btn btn-outline btn-sm" style={{padding:'3px 10px',fontSize:11}}
                    onClick={()=>handleSchedule(r.id, scheduleDraft[r.id])}>
                    {r.scheduled_at ? 'Reschedule' : 'Schedule'}
                  </button>
                  {r.scheduled_at && (
                    <button className="btn btn-outline btn-sm" style={{padding:'3px 10px',fontSize:11,color:'#dc2626',borderColor:'#dc2626'}}
                      onClick={()=>handleUnschedule(r.id)}>Clear</button>
                  )}
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

  // Same shared function as the Profiles list's verification buttons
  const act = async (p, status) => {
    if (await applyVerificationStatus(staffUser, p, status)) load()
  }

  const sections = [
    { key: 'review', title: 'Selfie received — compare & verify', items: profiles.filter(p => p.verification_status === 'selfie_submitted' || (p.id_document_uploaded && p.verification_status !== 'selfie_requested')) },
    { key: 'request', title: 'New sign-ups — request a selfie', items: profiles.filter(p => !p.is_admin_managed && ['not_started', 'rejected'].includes(p.verification_status || 'not_started') && !p.id_document_uploaded) },
    { key: 'waiting', title: 'Waiting for the user\'s selfie', items: profiles.filter(p => p.verification_status === 'selfie_requested') },
  ]

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} />
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
                    <button className="btn btn-black btn-sm" onClick={()=>act(p,'selfie_requested')}><Camera size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Request Selfie</button>
                  )}
                  <button className={'btn btn-sm ' + (sec.key === 'review' ? 'btn-black' : 'btn-outline')} onClick={()=>act(p,'verified')}><ShieldCheck size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Verify &amp; Make Live</button>
                  {sec.key === 'review' && (
                    <button className="btn btn-outline btn-sm" style={{color:'#dc2626',borderColor:'#dc2626'}} onClick={()=>act(p,'rejected')}><X size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Reject</button>
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
  const [query, setQuery] = useState('')

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

  const visibleReports = reports.filter(r => {
    const a = profilesById[r.reported_profile_id], b = profilesById[r.reporter_profile_id]
    return matchesSearch(query, r.reason, a?.full_name, a?.profile_code, b?.full_name, b?.profile_code)
  })

  const resolve = async (id, status, reportedProfileId, alsoBlock) => {
    if (alsoBlock && reportedProfileId) {
      const reported = profilesById[reportedProfileId]
      if (!window.confirm(`Block ${reported?.full_name || 'this profile'}? They will no longer be visible to other members.`)) return
      // Same block path as the Profiles list — writes the audit log too
      // (pehle yahan se block karne par audit log nahi banta tha).
      if (!(await applyProfileStatus(staffUser, [reportedProfileId], 'blocked', { via: 'report', report_id: id }))) return
    }
    const { error } = await supabase.from('profile_reports').update({
      status, resolved_at: new Date().toISOString(), resolved_by: staffUser.user_id,
    }).eq('id', id)
    if (error) { alert(error.message); return }
    load()
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} />
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Reports Queue</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>Profiles reported by other members, awaiting review</div>
      {reports.length > 0 && <ListSearch value={query} onChange={setQuery} placeholder="Search by name, Profile ID or reason..." />}

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : reports.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>No pending reports.</div>
      ) : visibleReports.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>No reports match "{query}".</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {visibleReports.map(r => {
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
                    onClick={()=>resolve(r.id, 'resolved', r.reported_profile_id, true)}><ShieldX size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Block Reported Profile</button>
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
  const [upcomingMeetings, setUpcomingMeetings] = useState([])
  const [pendingCoordination, setPendingCoordination] = useState([])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const nowIso = new Date().toISOString()
    const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString()
    const weekFromNow = new Date(Date.now() + 7*24*60*60*1000).toISOString()
    const [followUpsRes, assignedRes, newRes, meetingsRes, pendingCoordRes] = await Promise.all([
      supabase.from('profile_notes').select('*, profiles(id, full_name, profile_code, client_phone)').lte('follow_up_at', nowIso).order('follow_up_at', { ascending: true }).limit(20),
      supabase.from('profiles').select('id, full_name, profile_code, age, city, profile_status, client_phone').eq('managed_by_staff_id', staffUser.user_id).eq('profile_status', 'pending').limit(20),
      supabase.from('profiles').select('id, full_name, profile_code, age, city, created_at, client_phone').eq('profile_status', 'pending').gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(20),
      // Scheduled calls/meetings (introductions.scheduled_at) due in the next 7 days, soonest first
      supabase.from('introductions').select('*').gte('scheduled_at', nowIso).lte('scheduled_at', weekFromNow).order('scheduled_at', { ascending: true }).limit(20),
      // Coordination requests awaiting the receiver's accept/decline — previously
      // invisible to admin anywhere. Folded in here per Aryan's ask (2026-10-03).
      supabase.from('introductions').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
    ])
    setOverdueFollowUps(followUpsRes.data || [])
    setAssignedPending(assignedRes.data || [])
    setNewSubmissions(newRes.data || [])

    const meetings = meetingsRes.data || []
    const pendingReqs = pendingCoordRes.data || []
    const ids = [...new Set([...meetings, ...pendingReqs].flatMap(m => [m.from_profile, m.to_profile]))]
    let profilesById = {}
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, profile_code, client_phone').in('id', ids)
      ;(profs || []).forEach(p => { profilesById[p.id] = p })
    }
    setUpcomingMeetings(meetings.map(m => ({ ...m, fromProfile: profilesById[m.from_profile], toProfile: profilesById[m.to_profile] })))
    setPendingCoordination(pendingReqs.map(m => ({ ...m, fromProfile: profilesById[m.from_profile], toProfile: profilesById[m.to_profile] })))
    setLoading(false)
  }

  const updatePendingContact = (profileId, phone) => {
    setPendingCoordination(prev => prev.map(m => ({
      ...m,
      fromProfile: m.fromProfile?.id === profileId ? { ...m.fromProfile, client_phone: phone } : m.fromProfile,
      toProfile: m.toProfile?.id === profileId ? { ...m.toProfile, client_phone: phone } : m.toProfile,
    })))
  }

  const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString()

  const Section = ({ icon: Icon, title, hint, items, renderItem, empty }) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#8e8e8e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        <Icon size={14} /> {title} {items.length > 0 && `(${items.length})`}
      </div>
      {hint && <div style={{ fontSize: 11, color: '#bbb', marginTop: -6, marginBottom: 8 }}>{hint}</div>}
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
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} />
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>My Queue</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>Coordination requests, today's follow-ups, your assigned profiles, and new submissions</div>

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : (
        <>
          <Section icon={Handshake} title="Coordination requests awaiting response" items={pendingCoordination}
            empty="Nothing waiting on a member right now."
            renderItem={r => (
              <div key={r.id} className="list-row">
                <div style={{fontSize:13,fontWeight:600}}>
                  {r.fromProfile?.full_name || 'Unknown'} → {r.toProfile?.full_name || 'Unknown'}
                  <span style={{fontWeight:400,color:'#8e8e8e',textTransform:'capitalize'}}> · {r.request_type === 'meeting' ? 'Meeting' : 'Talk'} request</span>
                </div>
                <div style={{fontSize:10,color:'#bbb',marginTop:2}}>Sent {new Date(r.created_at).toLocaleDateString('en-IN')} · waiting on {r.toProfile?.full_name || 'receiver'} to accept</div>
                <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:8}}>
                  {[r.fromProfile, r.toProfile].filter(Boolean).map(x => (
                    <div key={x.id}>
                      <div style={{fontSize:11,color:'#8e8e8e',marginBottom:2}}>{x.full_name}</div>
                      <ProfileContact profile={x} logCalls onSaved={(phone)=>updatePendingContact(x.id, phone)} />
                    </div>
                  ))}
                </div>
              </div>
            )} />
          <Section icon={CalendarClock} title="Calls & meetings (next 7 days)" items={upcomingMeetings} empty="Nothing scheduled."
            renderItem={m => (
              <div key={m.id} className="list-row" style={isToday(m.scheduled_at) ? { borderColor: '#2563eb' } : {}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>
                      {m.fromProfile?.full_name || 'Unknown'} → {m.toProfile?.full_name || 'Unknown'}
                      <span style={{fontWeight:400,color:'#8e8e8e',textTransform:'capitalize'}}> · {m.request_type === 'meeting' ? 'Meeting' : 'Talk'}</span>
                    </div>
                    <div style={{fontSize:11,color: isToday(m.scheduled_at) ? '#2563eb' : '#8e8e8e',marginTop:2,fontWeight: isToday(m.scheduled_at) ? 600 : 400}}>
                      {isToday(m.scheduled_at) ? 'Today' : new Date(m.scheduled_at).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' })}
                      {' · '}{new Date(m.scheduled_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}
                    </div>
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:8}}>
                  {[m.fromProfile, m.toProfile].filter(x=>x?.client_phone).map(x => (
                    <div key={x.id} style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}>
                      <span style={{color:'#8e8e8e',minWidth:90}}>{x.full_name}</span>
                      <ContactButtons phone={x.client_phone} logProfile={x} />
                    </div>
                  ))}
                </div>
              </div>
            )} />
          <Section icon={Clock} title="Follow-ups due" items={overdueFollowUps} empty="Nothing due."
            renderItem={n => (
              <div key={n.id} className="list-row clickable" onClick={()=>n.profiles && onOpenProfile(n.profiles)}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <div style={{fontSize:13,fontWeight:600}}>{n.profiles?.full_name || 'Profile'}</div>
                  <ContactButtons phone={n.profiles?.client_phone} logProfile={n.profiles} />
                </div>
                <div style={{fontSize:12,color:'#555',marginTop:2}}>{n.note}</div>
                <div style={{fontSize:10,color:'#bbb',marginTop:4}}>Due {new Date(n.follow_up_at).toLocaleDateString('en-IN')}</div>
              </div>
            )} />
          <Section icon={ListChecks} title="Your pending profiles (to-do)" items={assignedPending} empty="No pending profiles assigned to you."
            hint="Only your assigned profiles still pending approval (up to 20). For everything assigned to you, use Profiles → Filters → Assigned to me."
            renderItem={p => (
              <div key={p.id} className="list-row clickable" onClick={()=>onOpenProfile(p)}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{p.full_name}</div>
                    <div style={{fontSize:12,color:'#8e8e8e'}}>{p.age}y · {p.city} · {p.profile_code}</div>
                  </div>
                  <ContactButtons phone={p.client_phone} logProfile={p} />
                </div>
              </div>
            )} />
          <Section icon={Users} title="New submissions this week" items={newSubmissions} empty="No new submissions this week."
            renderItem={p => (
              <div key={p.id} className="list-row clickable" onClick={()=>onOpenProfile(p)}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{p.full_name}</div>
                    <div style={{fontSize:12,color:'#8e8e8e'}}>{p.age}y · {p.city} · {p.profile_code}</div>
                  </div>
                  <ContactButtons phone={p.client_phone} logProfile={p} />
                </div>
              </div>
            )} />
        </>
      )}
    </div>
  )
}

// ===== STAFF MANAGEMENT — admin-only. Previously the only way to add a
// staff/admin/RM login was to insert into staff_users directly via the
// Supabase dashboard. staff_users.user_id is a FK to auth.users, so a new
// staff member must first sign up for a normal account (Register.js) with
// the email they'll use; an admin then "promotes" that email here via the
// assign_staff_role() RPC (SECURITY DEFINER, admin-only — see migration
// 20261003_staff_management_rpcs.sql). No service-role key needed client-side.
function StaffManagementView({ staffUser, onBack }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('relationship_manager')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await supabase.rpc('list_staff_with_email')
    if (!err) setStaff(data || [])
    setLoading(false)
  }

  const addStaff = async () => {
    if (!email.trim()) { setError('Enter an email address'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('assign_staff_role', { target_email: email.trim(), target_role: role })
    setSaving(false)
    if (err) { setError(err.message); return }
    setEmail(''); setRole('relationship_manager')
    load()
  }

  const toggleActive = async (row) => {
    const { error: err } = await supabase.rpc('set_staff_active', { target_user_id: row.user_id, is_active: !row.active })
    if (err) { alert(err.message); return }
    load()
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px' }}>
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to Account</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Manage Staff</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>Add admins and relationship managers, or deactivate access.</div>

      <div className="list-row" style={{ marginBottom: 20 }}>
        <div style={{fontSize:12,fontWeight:600,marginBottom:10}}>Add staff</div>
        <div style={{fontSize:11,color:'#8e8e8e',marginBottom:10}}>
          The person must have already created a normal account (sign up at the login page with this email) — this just grants them staff access.
        </div>
        <div className="form-row" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <input className="form-input" placeholder="staff@email.com" value={email}
            onChange={e=>setEmail(e.target.value)} style={{flex:'1 1 200px'}} />
          <select className="form-select" value={role} onChange={e=>setRole(e.target.value)} style={{flex:'0 0 180px'}}>
            <option value="relationship_manager">Relationship Manager</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn btn-black btn-sm" disabled={saving} onClick={addStaff}>{saving ? 'Adding...' : 'Add'}</button>
        </div>
        {error && <div style={{fontSize:12,color:'#dc2626',marginTop:8}}>{error}</div>}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {staff.map(s => (
            <div key={s.id} className="list-row" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{s.email}</div>
                <div style={{fontSize:11,color:'#8e8e8e',textTransform:'capitalize'}}>{s.role.replace('_',' ')} · {s.active ? 'Active' : 'Deactivated'}</div>
              </div>
              <button className="btn btn-outline btn-sm"
                style={s.active ? { color:'#dc2626', borderColor:'#dc2626' } : {}}
                disabled={s.user_id === staffUser.user_id}
                title={s.user_id === staffUser.user_id ? 'You cannot deactivate your own account' : ''}
                onClick={()=>toggleActive(s)}>
                {s.active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
