import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
// A few of these were imported but never actually used anywhere in this
// file (UserCheck, UserPlus, Menu, RotateCcw, Tag) — dead icon imports
// left over from earlier edits (audit 2026-10-08, P2 #15 polish sweep).
import {
  Users, Clock, CheckCircle2, ShieldX, ShieldCheck, ShieldAlert, Flag, StickyNote,
  ListChecks, BarChart3, RefreshCw, GitBranch, Copy, CalendarClock, X, LogOut,
  ClipboardList, Handshake, Link2, SlidersHorizontal, Search, Pencil, Crown, Camera,
  UserRound, Plus, Wrench, UserCog, Eye, Phone, Info, MessageCircle, TrendingUp, Trash2,
  ThumbsUp, MoreVertical, MapPin, BadgeCheck, ChevronDown, ChevronUp,
} from 'lucide-react'
import { supabase } from '../supabase'
import SignedImage from '../components/SignedImage'
import { RELIGIONS, CASTES, MARITAL_STATUSES, EDUCATIONS, LEAD_SOURCE_OPTIONS, parseHeightToInches, formatHeightFromInches,
  PARTNER_HEIGHT_MIN_INCHES, PARTNER_HEIGHT_MAX_INCHES, PARTNER_INCOME_BOUNDS, PARTNER_INCOME_STEPS,
  formatIncomeShort, parseIncomeRangeMidpoint } from '../constants/profileOptions'
import DualRangeSlider from '../components/DualRangeSlider'
import CheckboxDropdown from '../components/CheckboxDropdown'
import CreateProfile from './CreateProfile'
import BiodataView from './BiodataView'
import { EditProfileForm } from './Dashboard'
import { rankMatches } from '../utils/matching'
import { STATS_COLUMNS, DIMENSIONS, filterProfiles, breakdown, computeFunnel, computeRmPerformance } from '../utils/adminStats'
import { findDuplicateLeads } from '../utils/duplicateLeads'
import { buildMailtoLink } from '../utils/shareProfile'
import { ContactButtons, ProfileContact, AddNoteButton, CALL_OUTCOME_LABELS, CALL_OUTCOME_COLORS, contactLogPrefix } from '../components/ContactButtons'
import { generateShareLink, generateShareBundle, nativeShare, revokeShareLink, getMyShareLinks, acknowledgeShareLinkInterest, forwardShareLinkInterest, markInterestSent } from '../utils/shareLinks'
import { WhatsAppReminderButton, ReminderSheet } from '../components/WhatsAppReminder'
import NotificationBell from '../components/NotificationBell'
import { EVENT_LABELS } from '../utils/notifications'
import { gunaMilanFor } from '../utils/astrology'
import { useToast } from '../components/ui'

// SEARCH DESIGN NOTE: yeh search ab DATABASE se query karta hai (Supabase
// .ilike()/.eq()/.gte() ke saath), poore profiles table ko browser mein
// laake client-side filter nahi karta — isliye 100 profiles ho ya
// 100,000, search speed same rahegi. Pagination (Load More) bhi hai
// taaki ek baar mein poora table na load ho.

// 30 → 50: cheap, no-new-UI way to cut down on repetitive "Load More"
// clicking (Aryan's audit, gap #11) without building a bulk-select
// workaround — still well under one query's worth of reasonable rows.
const PAGE_SIZE = 50

// Dashboard Breakdown + Funnel ek hi profiles fetch share karte hain —
// Breakdown ke columns + Funnel/duplicate-check ke liye id/contact.
const DASH_PROFILE_COLUMNS = 'id, client_phone, client_email, ' + STATS_COLUMNS

// Breakdown/Funnel ki ek upper-limit — abhi (sau-do sau profiles) iska
// matlab hi nahi padta, par database badhne par poora table ek saath
// load hone se bachata hai (scale audit, 2026-10-04).
const DASH_CAP = 5000

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
// writeAuditLogs ek hi insert() call mein saare entries bhejta hai — bulk
// Approve/Block (50-100 profiles) mein pehle har profile ke liye alag
// parallel request jaati thi, jo bade batch mein slow/partial-fail ho sakti
// thi (scale audit, 2026-10-04 — gap #6). Single-row callers (writeAuditLog)
// isi ko [entityId] ke saath call karte hain.
async function writeAuditLogs(staffUser, action, entityIds, metadata) {
  if (entityIds.length === 0) return
  try {
    const rows = entityIds.map(entityId => ({
      actor_user_id: staffUser.user_id,
      actor_role: staffUser.role,
      action,
      entity_type: 'profile',
      entity_id: entityId,
      metadata: metadata || {},
    }))
    const { error } = await supabase.from('audit_logs').insert(rows)
    if (error) throw error
  } catch (e) {
    console.warn('Audit log failed (non-critical):', e.message)
  }
}
async function writeAuditLog(staffUser, action, entityId, metadata) {
  return writeAuditLogs(staffUser, action, [entityId], metadata)
}

// ===== OVERFLOW MENU — three-dot (⋮) menu for condensing action buttons
function OverflowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const visible = items.filter(i => !i.hidden)
  if (visible.length === 0) return null
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" className="btn btn-outline btn-sm" style={{ padding: '5px 6px', lineHeight: 1 }}
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }} title="More actions"><MoreVertical size={14} /></button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid #ededed',
          borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.10)', zIndex: 50, minWidth: 150, overflow: 'hidden' }}
          onClick={e => e.stopPropagation()}>
          {visible.map((item, i) => (
            <button key={i} type="button" style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px',
              fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: item.color || '#333', textAlign: 'left' }}
              onClick={() => { setOpen(false); item.onClick() }}
              onPointerEnter={e => e.currentTarget.style.background = '#f5f5f5'}
              onPointerLeave={e => e.currentTarget.style.background = 'none'}>
              {item.icon && <item.icon size={14} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ===== COORDINATION STATUS — shared between CoordinationRequestsView,
// MyQueueView and the Profiles-list "Coordination requests" section, so a
// request's stage/label/color reads the same wherever it shows up.
// 'contacted' ("we called them") and 'meeting_done' ("the meeting actually
// happened") used to be the same single status — Aryan's 2026-10-04 audit
// flagged that as ambiguous.
const COORD_STATUS_LABELS = {
  pending: 'Awaiting response',
  declined: 'Declined',
  accepted: 'Accepted',
  contacted: 'Call done',
  meeting_done: 'Meeting done',
  closed: 'Closed',
}
const coordStatusLabel = (status) => COORD_STATUS_LABELS[status] || status
const coordBadgeClass = (status) => 'badge badge-coord-' + (COORD_STATUS_LABELS[status] ? status : 'pending')

// Request Selfie / Verify & Make Live / Reject. Returns the applied patch, or null on failure.
// `notify`: a toast function (showToast) — kept optional/defaulted so any
// caller that forgets to pass one still gets *something* instead of a
// silent failure, but every real call site below passes the shared toast.
async function applyVerificationStatus(staffUser, profile, status, notify = console.error) {
  const patch = verificationPatch(status, profile?.profile_status)
  const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
  if (error) { notify('Update failed: ' + error.message); return null }
  await writeAuditLog(staffUser, 'verification_status_change', profile.id, { new_status: status })
  return patch
}

// Approve / Block / Set Pending for one or many profiles. Returns true on success.
async function applyProfileStatus(staffUser, ids, status, extraMeta, notify = console.error) {
  const { error } = await supabase.from('profiles').update({ profile_status: status }).in('id', ids)
  if (error) { notify('Update failed: ' + error.message); return false }
  await writeAuditLogs(staffUser, 'profile_status_change', ids, { new_status: status, ...(extraMeta || {}) })
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
function ViewTopBar({ onBack, onRefresh, loading, label = '← Back to list' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <button className="btn btn-outline btn-sm" onClick={onBack}>{label}</button>
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

// "now" in the local <input type="datetime-local"> format (no timezone,
// minute precision) — used as `min` so past dates can't be picked (audit
// 2026-10-08, P1 #14).
const nowForDatetimeLocalMin = () => {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function Admin({ staffUser }) {
  const navigate = useNavigate()
  // Toast replaces every browser alert() in this screen (Aryan's audit,
  // 2026-10-04) — same hook/CSS the rest of the app already uses elsewhere.
  const [showToast, ToastView] = useToast()
  const [profiles, setProfiles] = useState([])
  const [photos, setPhotos] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [stats, setStats] = useState({ total: 0, male: 0, female: 0, newWeek: 0, newToday: 0, pending: 0, active: 0, blocked: 0, needsVerification: 0, openReports: 0, pendingCoordination: 0, overdueFollowUps: 0, pendingShareInterest: 0 })
  const [statsUpdatedAt, setStatsUpdatedAt] = useState(null)
  const [listUpdatedAt, setListUpdatedAt] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showFunnel, setShowFunnel] = useState(false)
  const [dashProfiles, setDashProfiles] = useState(null) // shared by Breakdown + Funnel (one fetch)
  const [dashProfilesCapped, setDashProfilesCapped] = useState(false) // true if profiles table is bigger than DASH_CAP (scale audit)
  const [selected, setSelected] = useState(null)
  const [idMetadata, setIdMetadata] = useState({}) // profile_id -> {created_at, source, created_by} — admin-only, staff_users RLS gated
  const [notesByProfile, setNotesByProfile] = useState({}) // profile_id -> [{id, note, follow_up_at, call_outcome, created_at, staff_user_id}]
  // Note draft, keyed per-profile (Aryan's audit, 2026-10-05): used to be
  // three flat strings shared by whichever profile happened to be
  // `selected` — switching to another client mid-type silently discarded
  // whatever was typed, with no warning. Now each profile keeps its own
  // draft, so interrupting a note to handle another client never loses it.
  const [noteDrafts, setNoteDrafts] = useState({}) // profile_id -> {note, followUp, outcome}
  const getNoteDraft = (profileId) => noteDrafts[profileId] || { note: '', followUp: '', outcome: '' }
  const setNoteDraft = (profileId, patch) => setNoteDrafts(prev => ({ ...prev, [profileId]: { ...(prev[profileId] || { note: '', followUp: '', outcome: '' }), ...patch } }))
  const clearNoteDraft = (profileId) => setNoteDrafts(prev => { const next = { ...prev }; delete next[profileId]; return next })
  // Coordination requests involving the expanded profile — so "has this
  // client got any Talk/Meeting requests" doesn't need a trip to the
  // separate Coordination Requests screen (Aryan's audit, gap #5).
  const [coordByProfile, setCoordByProfile] = useState({})
  // Set when a request is opened via a "Manage"/"View" link elsewhere (My
  // Queue, this profile section) — CoordinationRequestsView picks the right
  // tab and scrolls/highlights that one card.
  const [coordFocusId, setCoordFocusId] = useState(null)
  // Set only when the request was opened from inside a profile's own
  // detail panel (vs. My Queue) — so "Back" there can return to that same
  // profile instead of always dropping to the generic Profiles list
  // (Aryan's audit, 2026-10-08: "Back to Profile" nav gap).
  const [coordBackProfile, setCoordBackProfile] = useState(null)
  const goToCoordination = (requestId, backProfile) => {
    setCoordFocusId(requestId)
    setCoordBackProfile(backProfile || null)
    goToSectionView('tools', 'coordinationRequests')
  }
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
  // Dashboard (the stats command-center) is the default landing screen, not
  // Profiles — audit 2026-10-08, P1 #13: admin opened the app straight into
  // a client list with no overview of what needs attention today.
  const section = searchParams.get('section') || 'dashboard' // main nav: profiles | dashboard | queues | tools | account
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
    if (s === 'dashboard') next.delete('section'); else next.set('section', s)
    next.delete('view')
    return next
  })
  // Combined section+view jump (e.g. a Dashboard stat tile opening a queue
  // directly) — one push, so one back-press returns to exactly where the
  // admin started instead of landing on the wrong tab.
  const goToSectionView = (s, v) => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    if (s === 'dashboard') next.delete('section'); else next.set('section', s)
    next.set('view', v)
    return next
  })
  const [editingProfile, setEditingProfile] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null) // read-only "Full Profile" view — separate from Edit, no accidental changes
  const [matchesFor, setMatchesFor] = useState(null) // profile jiske liye matches dhoondh rahe hain
  const [matchResults, setMatchResults] = useState([])
  const [matchesLoading, setMatchesLoading] = useState(false)

  // Bulk selection — list mein checkbox se multiple profiles choose karke
  // ek saath Approve/Block karne ke liye (ek-ek karke expand karne ke bajaye).
  // Checkbox hamesha visible rehta tha — Aryan ko laga yeh screen ki jagah
  // waste karta hai (2026-10-04). Ab "selection mode" tabhi on hota hai
  // jab kisi row par long-press (ya desktop par "Select" button) karo —
  // WhatsApp/Gallery jaisa. Normal tap list clean rakhta hai (row expand/
  // collapse), checkbox kahin nahi dikhta jab tak selection mode on na ho.
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [bulkWorking, setBulkWorking] = useState(false)
  const LONG_PRESS_MS = 500

  // Search + Filters
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('') // debounced value that actually triggers query
  // religion/community/maritalStatus/education ab multi-select arrays hain
  // (Aryan's ask, 2026-10-09: "multiple choice, checkbox — koi Hindu bhi
  // dekhna chahta hai, Sikh bhi") — pehle sirf ek value chun sakte the.
  const DEFAULT_FILTERS = {
    religion: [], community: [], city: '', gender: '',
    ageMin: '', ageMax: '', maritalStatus: [], education: [], assignedToMe: false,
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
      if (!saved) return DEFAULT_FILTERS
      const merged = { ...DEFAULT_FILTERS, ...saved }
      // Purana saved state religion/community/maritalStatus/education ko
      // single string ki tarah save kar chuka ho sakta hai (multi-select
      // se pehle) — array fields ko hamesha array mein coerce karte hain.
      ;['religion', 'community', 'maritalStatus', 'education'].forEach(k => {
        if (!Array.isArray(merged[k])) merged[k] = merged[k] ? [merged[k]] : []
      })
      return merged
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

  // Coordination requests involving this profile, lazily on expand (gap #5)
  useEffect(() => {
    if (!selected || coordByProfile[selected.id]) return
    loadCoordFor(selected.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const loadCoordFor = async (profileId) => {
    const { data } = await supabase.from('introductions').select('*')
      .or(`from_profile.eq.${profileId},to_profile.eq.${profileId}`)
      .order('created_at', { ascending: false }).limit(10)
    const rows = data || []
    const otherIds = [...new Set(rows.map(r => (r.from_profile === profileId ? r.to_profile : r.from_profile)))]
    let others = {}
    if (otherIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, profile_code').in('id', otherIds)
      ;(profs || []).forEach(p => { others[p.id] = p })
    }
    setCoordByProfile(prev => ({ ...prev, [profileId]: rows.map(r => ({ ...r, other: others[r.from_profile === profileId ? r.to_profile : r.from_profile] })) }))
  }

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
      // Overdue follow-ups — strictly before today (not just "due", which also
      // includes today's) so My Queue's nav badge only fires on the ones that
      // actually got missed (Aryan's audit, 2026-10-05, gap #4).
      supabase.from('profile_notes').select('*', { count: 'exact', head: true }).not('follow_up_at', 'is', null).lt('follow_up_at', startOfToday.toISOString()),
      // Share-link clients who tapped "👍 Interested" that admin hasn't
      // acknowledged yet (audit gap, 2026-10-05) — previously this signal
      // didn't exist at all.
      supabase.from('share_links').select('*', { count: 'exact', head: true }).not('interested_at', 'is', null).is('interest_acknowledged_at', null),
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
      overdueFollowUps: counts[11].count || 0,
      pendingShareInterest: counts[12].count || 0,
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
        // Registered mobile number (client_phone) bhi search karte hain —
        // partial match, taaki pura number yaad na ho to bhi profile mil jaaye.
        q = q.or(`profile_code.ilike.%${safeSearch}%,full_name.ilike.%${safeSearch}%,client_phone.ilike.%${safeSearch}%`)
      }
    }
    if (filters.religion.length > 0) q = q.in('religion', filters.religion)
    if (filters.community.length > 0) q = q.in('community', filters.community)
    if (filters.city) q = q.ilike('city', `%${filters.city}%`)
    if (filters.gender) q = q.eq('gender', filters.gender)
    if (filters.maritalStatus.length > 0) q = q.in('marital_status', filters.maritalStatus)
    if (filters.education.length > 0) q = q.in('education', filters.education)
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
  // Scale audit (2026-10-04): abhi (sau-do sau profiles) poori table ek
  // saath laana safe hai, par database badhne par yeh fetch bhi bada ho
  // jaata — isliye ek upper-limit cap (DASH_CAP) laga di hai taaki yeh
  // kabhi unbounded na ho. Server-side aggregation (SQL group-by/RPC) is
  // the real fix for very large scale — reuse-first ke liye abhi sirf cap,
  // woh bada rewrite baad mein alag se discuss karenge.
  const dashPanelsOpen = showBreakdown || showFunnel
  useEffect(() => {
    if (!dashPanelsOpen) return
    let cancelled = false
    setDashProfiles(null)
    setDashProfilesCapped(false)
    Promise.all([
      supabase.from('profiles').select(DASH_PROFILE_COLUMNS).order('created_at', { ascending: false }).limit(DASH_CAP),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
    ]).then(([{ data, error }, { count }]) => {
      if (cancelled) return
      if (error) console.error(error.message)
      setDashProfiles(data || [])
      setDashProfilesCapped((count || 0) > DASH_CAP)
    })
    return () => { cancelled = true }
  }, [dashPanelsOpen, statsUpdatedAt])

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS)
  }

  // Arrays (religion/community/maritalStatus/education) count as "active"
  // only when non-empty — Boolean([]) is otherwise always true.
  const activeFilterCount = Object.values(filters).filter(v => Array.isArray(v) ? v.length > 0 : Boolean(v)).length
  // Status bhi ab ek filter field ki tarah count hota hai (combined Search &
  // Filter control) — "X results found", Filters badge aur "Clear all" teeno
  // search + status + panel filters ko ek saath treat karte hain.
  const totalFilterCount = activeFilterCount + (activeTab !== 'all' ? 1 : 0)
  const isNarrowed = !!search || totalFilterCount > 0
  const clearAllSearchFilters = () => {
    setSearchInput(''); setSearch(''); setActiveTab('all'); resetFilters()
  }
  // Chhote removable chips — jo bhi narrow kar raha hai (search/status/panel
  // filter) ek hi line mein dikhta hai, panel band hone par bhi. Multi-select
  // fields (religion/community/maritalStatus/education) ek chip per selected
  // value dikhate hain, taaki "clear" sirf wahi ek value hataye.
  const FILTER_CHIP_LABELS = {
    city: v => `City: ${v}`, gender: v => v,
    ageMin: v => `Age ≥ ${v}`, ageMax: v => `Age ≤ ${v}`,
    assignedToMe: () => 'Assigned to me',
  }
  const activeFilterChips = [
    ...(search ? [{ key: 'search', label: `"${search}"`, clear: () => { setSearchInput(''); setSearch('') } }] : []),
    ...(activeTab !== 'all' ? [{ key: 'status', label: `Status: ${activeTab}`, clear: () => setActiveTab('all') }] : []),
    ...['religion', 'community', 'maritalStatus', 'education'].flatMap(k => filters[k].map(v => ({
      key: k + ':' + v, label: v,
      clear: () => setFilters(f => ({ ...f, [k]: f[k].filter(x => x !== v) })),
    }))),
    ...Object.entries(filters).filter(([k, v]) => !Array.isArray(v) && v).map(([k, v]) => ({
      key: k, label: FILTER_CHIP_LABELS[k] ? FILTER_CHIP_LABELS[k](v) : String(v),
      clear: () => setFilters(f => ({ ...f, [k]: DEFAULT_FILTERS[k] })),
    })),
  ]

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
    if (!(await applyProfileStatus(staffUser, [id], status, null, showToast))) return
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
      showToast('Update failed: ' + error.message)
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
    if (error) { showToast('Assign failed: ' + error.message); return }
    await logAuditEntry('rm_assigned', id, { managed_by_staff_id: staffUser.user_id })
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, managed_by_staff_id: staffUser.user_id } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, managed_by_staff_id: staffUser.user_id }))
  }

  const unassign = async (id) => {
    const { error } = await supabase.from('profiles').update({ managed_by_staff_id: null }).eq('id', id)
    if (error) { showToast('Unassign failed: ' + error.message); return }
    await logAuditEntry('rm_unassigned', id, {})
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, managed_by_staff_id: null } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, managed_by_staff_id: null }))
  }

  // ===== VERIFICATION — profiles.verification_status already existed
  // (completeness.js already reads it). Ab selfie request / verify bhi
  // isi se hota hai — Verify karte hi profile live (active) ho jaati hai.
  const setVerificationStatus = async (id, status) => {
    const target = profiles.find(p => p.id === id) || (selected?.id === id ? selected : { id })
    const patch = await applyVerificationStatus(staffUser, target, status, showToast)
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
    const draft = getNoteDraft(profileId)
    if (!draft.note.trim() && !draft.outcome) return
    const { error } = await supabase.from('profile_notes').insert({
      profile_id: profileId,
      staff_user_id: staffUser.user_id,
      note: draft.note.trim() || CALL_OUTCOME_LABELS[draft.outcome],
      follow_up_at: draft.followUp || null,
      call_outcome: draft.outcome || null,
    })
    if (error) { showToast('Could not save note: ' + error.message); return }
    clearNoteDraft(profileId)
    loadNotesFor(profileId)
    // Was missing — a new follow-up's effect on the My Queue badge/dashboard
    // overdueFollowUps count only showed up after the hourly auto-refresh,
    // not immediately (audit 2026-10-08, P1 #11).
    loadStats()
  }

  // Call/WhatsApp tap karte hi profile khulti hai aur note box mein call-log
  // ki shuruaat aa jaati hai — baat khatam karke outcome chip daba ke + Add.
  const startContactLog = (p, kind) => {
    if (selected?.id !== p.id) setSelected(p)
    const existing = getNoteDraft(p.id).note
    setNoteDraft(p.id, { note: existing.trim() ? existing : contactLogPrefix(kind) })
  }

  const updateClientPhone = (id, phone) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, client_phone: phone } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, client_phone: phone }))
  }

  // Lead source — business-owner audit (2026-10-04). Signup/Create Client
  // already asks this; this is just so admin can set/correct it for a
  // walk-in that was entered without going through the full question.
  const updateLeadSource = async (id, value) => {
    const { error } = await supabase.from('profiles').update({ lead_source: value || null }).eq('id', id)
    if (error) { showToast('Could not save: ' + error.message); return }
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, lead_source: value || null } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, lead_source: value || null }))
  }

  // ===== BULK ACTIONS — pending queue bade hone par ek-ek profile expand
  // karke action lena slow ho jaata hai; checkbox select + ek-saath apply.
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      // Last checkbox unticked — exit selection mode automatically, so the
      // list goes back to its clean (no-checkbox) look on its own.
      if (next.size === 0) setSelectionMode(false)
      return next
    })
  }

  // "Select all" sirf abhi tak LOADED profiles ko select karta hai, DB ke
  // saare matching profiles ko nahi (Profiles list paginated hai) — label
  // isi liye count ke saath "Select all loaded (X)" kehta hai (scale audit
  // #5), taaki admin "500 pending hain par sirf 30 approve hue" surprise
  // na ho. Load More ke baad bhi pehle se selected ids waise hi rehte hain
  // (yeh state clear nahi hoti), naye loaded rows select-all mein add nahi
  // hote jab tak dobara na dabao — matlab selection accumulate hoti hai,
  // overwrite nahi.
  const toggleSelectAll = () => {
    const allLoadedSelected = profiles.length > 0 && profiles.every(p => selectedIds.has(p.id))
    if (allLoadedSelected) { setSelectedIds(new Set()); setSelectionMode(false); return }
    setSelectedIds(prev => new Set([...prev, ...profiles.map(p => p.id)]))
    setSelectionMode(true)
  }

  // ===== LONG-PRESS SELECTION MODE — checkbox pehle hamesha dikhta tha,
  // Aryan ko "screen ki jagah waste karta hai" laga (2026-10-04). Ab
  // checkbox tabhi dikhta hai jab selection mode on ho, jo long-press se on
  // hota hai (WhatsApp/Gallery jaisa) — normal tap list expand/collapse
  // karta hai jaisa pehle karta tha. Desktop/mouse ke liye ek "Select"
  // button bhi hai jo wahi mode on karta hai bina long-press ke.
  const longPressTimer = React.useRef(null)
  const longPressFired = React.useRef(false)
  const startLongPress = (id) => {
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setSelectionMode(true)
      toggleSelect(id)
    }, LONG_PRESS_MS)
  }
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }
  const exitSelectionMode = () => { setSelectionMode(false); setSelectedIds(new Set()) }

  const bulkUpdateStatus = async (status) => {
    if (selectedIds.size === 0) return
    const ids = [...selectedIds]
    const unverified = profiles.filter(p => ids.includes(p.id) && needsSelfieVerification(p)).length
    if (status === 'active' && unverified > 0
      && !window.confirm(`${unverified} selected profile(s) are not selfie-verified yet. Make them live anyway?`)) return
    if (status === 'blocked'
      && !window.confirm(`Block ${ids.length} selected profile(s)? They will no longer be visible to other members.`)) return
    setBulkWorking(true)
    if (await applyProfileStatus(staffUser, ids, status, { via: 'bulk' }, showToast)) {
      setProfiles(prev => prev.map(p => ids.includes(p.id) ? { ...p, profile_status: status } : p))
      setSelectedIds(new Set())
      setSelectionMode(false)
      loadStats()
    }
    setBulkWorking(false)
  }

  // ===== FIND MATCHES (reuses existing matching.js — koi naya algorithm nahi) =====
  // Candidate limit matched to Dashboard's client-side fallback path (500 —
  // see MATCH_CANDIDATE_BUCKET_SIZE/limit(500) in Dashboard.js) so admin never
  // sees fewer candidates for a client than that client would see themselves
  // (Aryan's audit, 2026-10-05, gap #5).
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
      .limit(500)

    if (error) {
      showToast('Could not load candidates: ' + error.message)
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
    { id: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
    { id: 'profiles', label: 'Profiles', Icon: Users },
    { id: 'queues', label: 'Queues', Icon: ListChecks, badge: needsAttention },
    { id: 'tools', label: 'Tools', Icon: Wrench },
    { id: 'account', label: 'Account', Icon: UserRound },
  ]
  const sectionForView = { verificationQueue:'queues', reportsQueue:'queues', myQueue:'queues', duplicateLeads:'queues', casteSuggestions:'tools', coordinationRequests:'tools', shareLinks:'tools', createClient:'profiles', editProfile:'profiles', fullProfile:'profiles', findMatches:'profiles' }
  const effectiveSection = view === 'list' ? section : (sectionForView[view] || section)
  const switchSection = (s) => { if (view !== 'list') navigate(-1); setSectionOnly(s) }
  // Jumping to a profile card from a sub-view other than Profiles (e.g.
  // Share Links, notification bell, "View Profile"/profile-ID clicks) —
  // two bugs here, both from Aryan testing the live deploy (2026-10-09):
  // 1) switchSection+navigate(-1) races with the pending history pop
  //    (navigate(-1) is async), so the section param it just set can get
  //    clobbered right back by the old value the moment the pop actually
  //    resolves. Fixed with one direct setSearchParams call — single
  //    history push, no pending pop to race with.
  // 2) Even with the section switch landing correctly, the Profiles list
  //    only renders an expanded detail panel for a row that's actually in
  //    its own paginated/filtered `profiles` array — `setSelected(p)` alone
  //    does nothing visible if that profile isn't on the currently loaded
  //    page (wrong tab, filtered out, or just further down the list than
  //    what's fetched). That's why "only one of the two profile IDs on a
  //    share-link card opens" — whichever one happened to already be in
  //    the loaded list worked, the other silently selected a profile with
  //    no matching row to expand. Fixed by injecting the fetched profile
  //    into the `profiles` array directly, so a matching row always exists.
  const jumpToProfile = (p) => {
    setProfiles(prev => prev.some(x => x.id === p.id) ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev])
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('view')
      next.set('section', 'profiles')
      return next
    })
    setSelected(p)
  }

  // Tapping a notification in the bell dropdown jumps straight to the
  // exact record it's about where we have one (link_entity_type='profile'),
  // instead of a generic queue (audit gap, 2026-10-08: "do not send the
  // admin to a generic tab when the exact record is known").
  const handleNotifNavigate = async (n) => {
    if (n.type === 'selfie_submitted') { goToSectionView('queues', 'verificationQueue'); return }
    if (n.type === 'report_filed') { goToSectionView('queues', 'reportsQueue'); return }
    if (n.type === 'share_link_interest') { goToSectionView('tools', 'shareLinks'); return }
    // New (audit 2026-10-08): notification types with no dedicated queue
    // view — e.g. profile_liked — open the exact profile instead of
    // dropping the admin on a generic tab.
    if (n.link_entity_type === 'profile' && n.link_entity_id) {
      const { data } = await supabase.from('profiles').select('*').eq('id', n.link_entity_id).maybeSingle()
      if (data) jumpToProfile(data)
    }
  }

  return (
    <div className="admin-shell">
      <ToastView />
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
        <div style={{ padding: '0 14px 10px' }}>
          <NotificationBell userId={staffUser.user_id} onNavigate={handleNotifNavigate} align="left" />
        </div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <NotificationBell userId={staffUser.user_id} onNavigate={handleNotifNavigate} />
            <span className="chip chip-muted" style={{ textTransform: 'none' }}>{staffUser.role === 'admin' ? 'Admin' : 'RM'}</span>
          </div>
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
        <ShareLinksView staffUserId={staffUser.user_id} onBack={()=>setView('list')} onManageCoordination={goToCoordination}
          onOpenProfile={(p)=>{ jumpToProfile(p) }} />
      )}

      {view === 'casteSuggestions' && (
        <CasteSuggestionsView staffUser={staffUser} onBack={()=>setView('list')} />
      )}

      {view === 'coordinationRequests' && (
        <CoordinationRequestsView staffUser={staffUser}
          onBack={()=>{ setView('list'); if (coordBackProfile) { setSelected(coordBackProfile); setCoordBackProfile(null) } }}
          backLabel={coordBackProfile ? '← Back to Profile' : undefined}
          focusId={coordFocusId} onConsumeFocus={()=>setCoordFocusId(null)} />
      )}

      {view === 'verificationQueue' && (
        <VerificationQueueView staffUser={staffUser} onBack={()=>{setView('list'); loadStats()}} />
      )}

      {view === 'reportsQueue' && (
        <ReportsQueueView staffUser={staffUser} onBack={()=>{setView('list'); loadStats()}} />
      )}

      {view === 'myQueue' && (
        <MyQueueView staffUser={staffUser} onBack={()=>setView('list')}
          onOpenProfile={(p)=>{ setView('list'); setSelected(p) }}
          onManageCoordination={goToCoordination}
          onOpenShareLinks={()=>setView('shareLinks')} />
      )}

      {view === 'staffManagement' && (
        <StaffManagementView staffUser={staffUser} onBack={()=>setView('list')} />
      )}

      {view === 'whatsappTemplates' && (
        <WhatsAppTemplatesView staffUser={staffUser} onBack={()=>setView('list')} />
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
          staffUser={staffUser}
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
        <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Search name, Profile ID, or phone..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{
              flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: 'var(--radius)',
              border: '1px solid rgba(0,0,0,0.12)', fontSize: 13, outline: 'none',
              background: '#fafafa',
            }}
          />
          <button
            className={'btn btn-sm ' + (showFilters ? 'btn-black' : 'btn-outline')}
            onClick={() => setShowFilters(!showFilters)}
            style={{ position: 'relative', flex: '0 0 auto' }}
          >
            <SlidersHorizontal size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
          <button className="btn btn-outline btn-sm" style={{ flex: '0 0 auto' }} onClick={() => runQuery(0)}>
            {loading ? '...' : <RefreshCw size={14} />}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: (showFilters || activeFilterChips.length) ? 10 : 0 }}>
          <div className="pill-tabs" style={{ flex: '1 1 auto', minWidth: 0 }}>
            {['all', 'pending', 'active', 'blocked'].map(t => (
              <button key={t} className={'pill-tab ' + (activeTab === t ? 'active' : '')} onClick={() => setActiveTab(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {activeFilterChips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: showFilters ? 10 : 0 }}>
            {activeFilterChips.map(c => (
              <button key={c.key} className="chip chip-muted" style={{ textTransform: 'none', cursor: 'pointer', border: 'none' }}
                onClick={c.clear} title="Remove this filter">
                {c.label} ✕
              </button>
            ))}
            {activeFilterChips.length > 1 && (
              <button className="btn btn-outline btn-sm" style={{ padding: '6px 14px', fontSize: 13 }} onClick={clearAllSearchFilters}>Clear all</button>
            )}
          </div>
        )}

        {/* ADVANCED FILTERS PANEL */}
        {showFilters && (
          <div className="list-row" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 12, color: '#8e8e8e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Religion & Community</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <CheckboxDropdown options={RELIGIONS} selected={filters.religion}
                onChange={v=>setFilters(f=>({...f,religion:v}))} placeholder="Any Religion" />
              <CheckboxDropdown options={CASTES} selected={filters.community}
                onChange={v=>setFilters(f=>({...f,community:v}))} placeholder="Any Community" />
            </div>

            <div style={{ fontSize: 12, color: '#8e8e8e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Location & Demographics</div>
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

            <div style={{ fontSize: 12, color: '#8e8e8e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Marital Status & Education</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <CheckboxDropdown options={MARITAL_STATUSES} selected={filters.maritalStatus}
                onChange={v=>setFilters(f=>({...f,maritalStatus:v}))} placeholder="Any Marital Status" />
              <CheckboxDropdown options={EDUCATIONS} selected={filters.education}
                onChange={v=>setFilters(f=>({...f,education:v}))} placeholder="Any Education" />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.assignedToMe} onChange={e=>setFilters(f=>({...f,assignedToMe:e.target.checked}))} />
              Assigned to me only <span style={{ color: '#8e8e8e', fontSize: 13 }}>(all statuses — today's pending to-dos are in Queues → My Queue)</span>
            </label>
            {totalFilterCount > 0 && (
              <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={clearAllSearchFilters}>Clear all</button>
            )}
          </div>
        )}

        </div>
{/* Last-refreshed timestamp removed — visual clutter */}

        {isNarrowed && !loading && (
          <div style={{ fontSize: 12, color: '#8e8e8e', marginBottom: 10 }}>
            {profiles.length} result{profiles.length !== 1 ? 's' : ''} found
            {search && ` for "${search}"`}
          </div>
        )}

        {/* Selection mode activates on long-press — no explicit Select button */}
        {selectionMode && profiles.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 12, color: '#8e8e8e', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={profiles.length > 0 && profiles.every(p => selectedIds.has(p.id))} onChange={toggleSelectAll} />
              Select all ({profiles.length})
            </label>
            <button className="btn btn-outline btn-sm" onClick={exitSelectionMode}>Cancel</button>
            {selectedIds.size > 0 && (
              <>
                <span>{selectedIds.size} selected</span>
                <button className="btn btn-black btn-sm" disabled={bulkWorking} onClick={() => bulkUpdateStatus('active')}><CheckCircle2 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Approve</button>
                <button className="btn btn-outline btn-sm" style={{ color: '#dc2626', borderColor: '#dc2626' }} disabled={bulkWorking} onClick={() => bulkUpdateStatus('blocked')}><ShieldX size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Block</button>
              </>
            )}
          </div>
        )}

        {!loading && profiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#8e8e8e', fontSize: 14 }}>
            {search || activeFilterCount > 0
              ? <>No profiles match your search. Try a different Profile ID, name, phone number, or fewer filters.</>
              : 'No profiles in this category'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {profiles.map(p => (
              <div key={p.id} className="list-row clickable"
                onClick={() => {
                  if (longPressFired.current) { longPressFired.current = false; return } // long-press already handled this tap
                  if (selectionMode) toggleSelect(p.id)
                  else setSelected(selected?.id === p.id ? null : p)
                }}
                onTouchStart={() => startLongPress(p.id)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
                onMouseDown={() => startLongPress(p.id)}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {selectionMode && (
                    <input type="checkbox" checked={selectedIds.has(p.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSelect(p.id)} />
                  )}
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#f0f0f0', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {photos[p.id]
                      ? <SignedImage path={photos[p.id]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <UserRound size={18} color="#bbb" />
                    }
                  </div>
                  <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {p.full_name}
                      {/* Blue-tick, Instagram/Twitter-style, instead of a
                          separate "✓ Verified" badge taking up row space
                          (Aryan's audit, 2026-10-08: compact verification). */}
                      {p.verification_status === 'verified' && <BadgeCheck size={15} color="#2563eb" title="Selfie/ID verified by staff" />}
                    </div>
                    <div style={{ fontSize: 12, color: '#8e8e8e' }}>{p.age}y · {p.city} · {p.religion}</div>
                  </div>
                  {/* Ek hi row mein wrap karo — pehle "active" + "✓ Verified" + "Premium"
                      alag-alag lines mein stack hoke card ko lamba bana rahe the. "active"
                      ka matlab hi verified hai (is app ke flow mein), isliye Verified badge
                      ab sirf tab dikhta hai jab status active nahi hai — ek kam badge, kam clutter.
                      Title tooltips har badge par — "yeh color/badge ka matlab kya hai" roz yaad
                      na karna pade (Aryan's audit, 2026-10-04, gap #2). */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 }}>
                      <div className={"badge badge-" + p.profile_status} style={{ fontSize: 12 }} title={'Profile status: ' + p.profile_status}>{p.profile_status}</div>
                      {p.verification_status === 'selfie_submitted' && <div className="badge" style={{ fontSize: 12, background: '#eff6ff', color: '#2563eb' }} title="Member sent a selfie — needs comparing to their photo">Selfie received</div>}
                      {SHOW_PREMIUM_TOGGLE && p.is_premium && <div className="badge" style={{ fontSize: 12, background: '#fef3c7', color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 3 }} title="Marked Premium"><Crown size={10} />Premium</div>}
                      {/* Note draft keyed per-profile now (Aryan's audit, 2026-10-05) so it
                          survives switching to another client — this badge just surfaces
                          that an unsaved draft is still sitting here, waiting to be finished. */}
                      {selected?.id !== p.id && (getNoteDraft(p.id).note.trim() || getNoteDraft(p.id).outcome) &&
                        <div className="badge" style={{ fontSize: 12, background: '#fff7ed', color: '#c2410c' }} title="You have an unsaved note draft for this profile">✎ Draft note</div>}
                    </div>
                    <div style={{ fontSize: 12, color: '#8e8e8e', fontFamily: 'monospace' }}>{p.profile_code}</div>
                  </div>
                </div>

{/* Call/WhatsApp/Approve moved to expanded view only — collapsed rows stay clean */}

                {selected?.id === p.id && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    {/* Quick actions repeated near the top too — the full
                        action row is still at the bottom, but a 50-profile
                        review day shouldn't need a full scroll just to tap
                        Approve/Block (Aryan's audit, gap #10). */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }} onClick={e => e.stopPropagation()}>
                      <ContactButtons phone={p.client_phone} onAction={kind => startContactLog(p, kind)} />
                      <OverflowMenu items={[
                        { label: 'View profile', icon: Eye, onClick: () => { setViewingProfile(p); setView('fullProfile') } },
                        { label: 'Edit profile', icon: Pencil, onClick: () => { setEditingProfile(p); setView('editProfile') } },
                        { label: 'Find matches', icon: Search, onClick: () => findMatchesForProfile(p) },
                        { label: 'Approve', icon: CheckCircle2, onClick: () => updateStatus(p.id, 'active'), hidden: p.profile_status === 'active' },
                        { label: 'Block', icon: ShieldX, color: '#dc2626', onClick: () => updateStatus(p.id, 'blocked'), hidden: p.profile_status === 'blocked' },
                      ]} />
                    </div>

{/* Status legend removed — badge colors are self-explanatory */}

                    <div className="admin-section-header"><UserRound size={13} />Profile Details</div>
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
                    {p.about_me && (() => {
                      const raw = p.about_me;
                      const isPipeData = (raw.match(/\|/g) || []).length > 3;
                      const display = isPipeData ? raw.split('|').filter(Boolean).slice(0, 4).join(' · ') + (raw.split('|').filter(Boolean).length > 4 ? ' …' : '') : raw;
                      return <div style={{ fontSize: 13, color: '#555', background: '#f9f9f9', padding: '10px 12px', borderRadius: 8, marginBottom: 14, lineHeight: 1.6 }}>{display}</div>;
                    })()}

                    {/* Quick contact — number + edit. Call/WhatsApp buttons
                        already shown in the quick-actions row above, so
                        this doesn't repeat them (audit 2026-10-08: duplicate
                        Call/WhatsApp buttons). */}
                    <div className="admin-section-header"><Phone size={13} />Contact</div>
                    <ProfileContact key={p.id + (p.client_phone || '')} profile={p} staffUser={staffUser}
                      onSaved={phone => updateClientPhone(p.id, phone)}
                      onAction={kind => startContactLog(p, kind)} showContactButtons={false} />

                    {/* Verification — compact: just icon + inline action buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14, fontSize: 12 }} onClick={e => e.stopPropagation()}>
                      {p.verification_status === 'verified'
                        ? <ShieldCheck size={14} color="#16a34a" title="Verified" />
                        : <ShieldAlert size={14} color="#2563eb" title={VERIFICATION_LABELS[p.verification_status] || 'Not verified'} />}
                      <span style={{ color: '#8e8e8e' }}>
                        {p.verification_status === 'verified' ? 'Verified' : (VERIFICATION_LABELS[p.verification_status] || 'Not verified')}
                      </span>
                      {p.verification_status !== 'verified' && !['selfie_requested', 'selfie_submitted'].includes(p.verification_status) && !p.is_admin_managed && (
                        <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => setVerificationStatus(p.id, 'selfie_requested')}><Camera size={12} /></button>
                      )}
                      {p.verification_status !== 'verified' && (
                        <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: 12, color: '#16a34a', borderColor: '#16a34a' }}
                          onClick={() => setVerificationStatus(p.id, 'verified')}><ShieldCheck size={12} /></button>
                      )}
                      {(p.verification_status === 'selfie_submitted' || (p.id_document_uploaded && p.verification_status !== 'verified' && p.verification_status !== 'rejected')) && (
                        <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: 12, color: '#dc2626', borderColor: '#dc2626' }}
                          onClick={() => setVerificationStatus(p.id, 'rejected')}><X size={12} /></button>
                      )}
                      {p.verification_status === 'selfie_requested' && (
                        <WhatsAppReminderButton profile={p} eventType="selfie_requested" staffUserId={staffUser.user_id} label="Remind on WhatsApp" />
                      )}
                      {p.verification_status === 'verified' && (
                        <WhatsAppReminderButton profile={p} eventType="profile_approved" staffUserId={staffUser.user_id} label="Notify on WhatsApp" />
                      )}
                    </div>
                    {p.selfie_path && p.verification_status !== 'verified' && (
                      <SelfieCompare selfiePath={p.selfie_path} photoPath={photos[p.id]} />
                    )}

                    {/* Notes / follow-up — naya chhota profile_notes table */}
                    <div className="admin-section-header"><StickyNote size={13} />Notes &amp; Follow-ups</div>
                    <div style={{ marginBottom: 14 }} onClick={e => e.stopPropagation()}>
                      {(notesByProfile[p.id] || []).map(n => (
                        <div key={n.id} style={{ fontSize: 12, background: '#f9f9f9', padding: '8px 10px', borderRadius: 8, marginBottom: 6 }}>
                          {n.introduction_id && (
                            <span style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 20, marginRight: 6, background: '#eff6ff', color: '#2563eb' }}>
                              🤝 Coordination
                            </span>
                          )}
                          {n.call_outcome && (
                            <span style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 20, marginRight: 6,
                              background: CALL_OUTCOME_COLORS[n.call_outcome]?.bg, color: CALL_OUTCOME_COLORS[n.call_outcome]?.fg }}>
                              {CALL_OUTCOME_LABELS[n.call_outcome]}
                            </span>
                          )}
                          {n.note && n.note !== (CALL_OUTCOME_LABELS[n.call_outcome] || '') && <div style={{ display: 'inline' }}>{n.note}</div>}
                          <div style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>
                            {new Date(n.created_at).toLocaleString('en-IN')}
                            {n.follow_up_at && <> · Follow up: {new Date(n.follow_up_at).toLocaleDateString('en-IN')}</>}
                          </div>
                        </div>
                      ))}
                      {/* Outcome chips se text/date box ke beech thoda zyada gap
                          (10px, pehle 6px) — galti se paas wale control pe tap
                          lagne ka risk kam karta hai (Aryan's audit, gap #9). */}
                      <div className="admin-tight-controls" style={{ marginTop: 10 }}>
                        {Object.entries(CALL_OUTCOME_LABELS).map(([key, label]) => (
                          <button key={key} type="button"
                            className="btn btn-outline btn-sm"
                            style={{ padding: '6px 12px', fontSize: 13,
                              ...(getNoteDraft(p.id).outcome === key ? { background: CALL_OUTCOME_COLORS[key].bg, color: CALL_OUTCOME_COLORS[key].fg, borderColor: CALL_OUTCOME_COLORS[key].fg } : {}) }}
                            onClick={() => setNoteDraft(p.id, { outcome: getNoteDraft(p.id).outcome === key ? '' : key })}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="admin-tight-controls" style={{ marginTop: 10 }}>
                        <input className="form-input" placeholder="Add a note (call log, decision, etc.)" value={getNoteDraft(p.id).note}
                          onChange={e => setNoteDraft(p.id, { note: e.target.value })} style={{ flex: '1 1 200px', fontSize: 12 }} />
                        <input className="form-input" type="date" value={getNoteDraft(p.id).followUp}
                          onChange={e => setNoteDraft(p.id, { followUp: e.target.value })} style={{ fontSize: 12, width: 140 }} />
                        <button className="btn btn-outline btn-sm" onClick={() => addNote(p.id)}>+ Add</button>
                      </div>
                    </div>

                    {/* Coordination requests involving this client — so admin doesn't
                        have to jump to the separate Coordination Requests screen and
                        search for them (Aryan's 2026-10-04 audit, gap #5). */}
                    <div className="admin-section-header"><Handshake size={13} />Coordination Requests</div>
                    <div style={{ marginBottom: 14 }} onClick={e => e.stopPropagation()}>
                      {(coordByProfile[p.id] || []).length === 0 ? (
                        <div style={{ fontSize: 12, color: '#bbb' }}>No Talk/Meeting requests involving this profile.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {coordByProfile[p.id].map(r => (
                            <div key={r.id} className="list-row clickable" style={{ padding: '8px 10px' }}
                              onClick={() => goToCoordination(r.id, p)}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <div style={{ fontSize: 12 }}>
                                  {r.from_profile === p.id ? 'Sent to ' : 'Received from '}
                                  <strong>{r.other?.full_name || 'Unknown'}</strong>
                                  <span style={{ color: '#8e8e8e', textTransform: 'capitalize' }}> · {r.request_type === 'meeting' ? 'Meeting' : 'Talk'}</span>
                                </div>
                                <span className={coordBadgeClass(r.status)} style={{ fontSize: 12 }}>{coordStatusLabel(r.status)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {idMetadata[p.id] && (
                      <>
                        <div className="admin-section-header"><Info size={13} />Metadata</div>
                        <div style={{ fontSize: 13, color: '#8e8e8e', background: '#f5f5f5', padding: '8px 12px', borderRadius: 8, marginBottom: 14 }}>
                          🔒 Admin only — Profile ID <strong style={{ fontFamily: 'monospace' }}>{p.profile_code}</strong> generated {new Date(idMetadata[p.id].created_at).toLocaleString('en-IN')} · {idMetadata[p.id].source === 'admin-added' ? 'Added by staff' : 'Self-registered'}
                          {idMetadata[p.id].created_by && <> (staff id: {idMetadata[p.id].created_by.slice(0, 8)})</>}
                        </div>
                      </>
                    )}
                    {/* View/Edit/Matches now in overflow menu at top */}
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
          <button className="btn btn-outline btn-sm" style={{ padding: '6px 10px' }} onClick={loadStats} disabled={statsLoading} title="Refresh stats">
            {statsLoading ? '...' : <RefreshCw size={14} />}
          </button>
        </div>
        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))', gap: 6, marginBottom: 16 }}>
          {[
            { label: 'Total', val: stats.total, bg: '#f5f5f5', fg: '#555' },
            { label: 'Male', val: stats.male, bg: '#eef2ff', fg: '#4f46e5' },
            { label: 'Female', val: stats.female, bg: '#fdf2f8', fg: '#db2777' },
            { label: 'New 7d', val: stats.newWeek, bg: '#ecfeff', fg: '#0891b2' },
            { label: 'Pending', val: stats.pending, bg: '#fff8e1', fg: '#b45309' },
            { label: 'Active', val: stats.active, bg: '#f0fdf4', fg: '#16a34a' },
            { label: 'Blocked', val: stats.blocked, bg: '#fef2f2', fg: '#dc2626' },
            { label: 'Verify', val: stats.needsVerification, bg: '#eff6ff', fg: '#2563eb' },
            { label: 'Reports', val: stats.openReports, bg: '#fdf4ff', fg: '#9333ea' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '10px 10px', textAlign: 'center', cursor: 'default' }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize: 20, fontWeight:600, color: s.fg }}>{s.val}</div>
              <div style={{ fontSize: 11, color: '#8e8e8e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
            </div>
          ))}
        </div>
{/* Stats timestamp removed — visual clutter */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setShowBreakdown(v => !v)}>
            <BarChart3 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />{showBreakdown ? 'Hide breakdown' : 'Breakdown (age, height, religion...)'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowFunnel(v => !v)}>
            <GitBranch size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />{showFunnel ? 'Hide funnel' : 'Conversion Funnel'}
          </button>
        </div>
        {showBreakdown && <StatsBreakdown profiles={dashProfiles} capped={dashProfilesCapped} />}
        {showFunnel && <FunnelView profiles={dashProfiles} capped={dashProfilesCapped} refreshKey={statsUpdatedAt} />}
      </div>
      )}
      {view === 'list' && section === 'queues' && (
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, marginBottom: 20 }}>Queues</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          <AdminNavCard icon={ListChecks} label="My Queue" badge={stats.overdueFollowUps} onClick={()=>setView('myQueue')} />
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
          <AdminNavCard icon={Link2} label="Share Links" subtitle="Profile/match links sent to clients" badge={stats.pendingShareInterest} onClick={()=>setView('shareLinks')} />
          <AdminNavCard icon={MessageCircle} label="WhatsApp Templates" subtitle="Saved messages for reminders" onClick={()=>setView('whatsappTemplates')} />
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
        {/* Logout yahan sirf mobile par dikhta hai — desktop par sidebar
            mein already Logout hai, dono saath dikhna duplicate tha
            (Aryan's audit). CSS admin-account-logout-mobile ko >=768px par
            hide karta hai. */}
        <button className="btn btn-outline admin-account-logout-mobile" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={logout}>
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
      {subtitle && <span style={{ fontSize: 13, color: 'var(--gray3)', marginTop: -6 }}>{subtitle}</span>}
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
function StatsBreakdown({ profiles, capped }) {
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
          {capped && (
            <div style={{ fontSize: 13, color: '#b45309', background: '#fff8e1', padding: '6px 10px', borderRadius: 8, marginBottom: 10 }}>
              Database is bigger than {DASH_CAP.toLocaleString('en-IN')} profiles — showing the most recent {DASH_CAP.toLocaleString('en-IN')} only.
            </div>
          )}
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
function FunnelView({ profiles, capped, refreshKey }) {
  const [activity, setActivity] = useState(null) // { intros, actions }

  useEffect(() => {
    let cancelled = false
    setActivity(null)
    Promise.all([
      supabase.from('introductions').select('from_profile, to_profile, status').limit(DASH_CAP),
      supabase.from('match_actions').select('actor_profile_id, target_profile_id, action').in('action', ['like', 'super_like']).limit(DASH_CAP),
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
          {capped && (
            <div style={{ fontSize: 13, color: '#b45309', background: '#fff8e1', padding: '6px 10px', borderRadius: 8, marginBottom: 10 }}>
              Database is bigger than {DASH_CAP.toLocaleString('en-IN')} profiles — counts below are based on a capped sample, not every profile.
            </div>
          )}
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
          <div style={{ fontSize: 13, color: '#8e8e8e', marginTop: 14 }}>
            "% of previous" = yeh stage ki count ÷ pichle stage ki count — har stage par kitna drop-off hua, yeh dikhata hai (funnel khud raw counts hai, yeh us par ratio hai).
          </div>
          {dupCount > 0 && (
            // Shortcut button hata diya — Duplicate Leads already Queues tab
            // ke card se khulti hai, teesri entry point ki zaroorat nahi.
            // Count yahan sirf context ke liye.
            <div style={{ marginTop: 10, fontSize: 12, color: '#8e8e8e' }}>
              🧬 {dupCount} possible duplicate lead{dupCount === 1 ? '' : 's'} found — see Queues → Duplicate Leads
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
    // Server-side duplicate detection (find_duplicate_leads RPC, migration
    // 20261004) — only profiles that actually share a phone/email come
    // back, instead of the whole profiles table (scale audit, 2026-10-04).
    const { data, error } = await supabase.rpc('find_duplicate_leads')
    if (error) console.error(error.message)
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
                        <div style={{fontSize:13,fontWeight:600}}>{p.full_name} <span className={"badge badge-" + p.profile_status} style={{fontSize:12,marginLeft:6}}>{p.profile_status}</span></div>
                        <div style={{fontSize:13,color:'#8e8e8e'}}>{p.age}y · {p.city} · {p.profile_code} · registered {new Date(p.created_at).toLocaleDateString('en-IN')}</div>
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
function FindMatchesView({ profile, results, loading, staffUserId, staffUser, onBack }) {
  const [expandedId, setExpandedId] = useState(null)
  // Main profile pinned on top, full detail collapsible — admin asked
  // (voice note, 2026-10-09) to be able to see the profile they're
  // matching for while scrolling/expanding the match list below, instead
  // of only a name + code header. Defaults open since that's the whole
  // point of the ask; collapsible so it doesn't eat the screen on mobile.
  const [mainExpanded, setMainExpanded] = useState(true)
  const [mainPhotoPath, setMainPhotoPath] = useState(null)
  useEffect(() => {
    supabase.from('photos').select('storage_path').eq('profile_id', profile.id).eq('is_primary', true).maybeSingle()
      .then(({ data }) => setMainPhotoPath(data?.storage_path || null))
  }, [profile.id])
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

  // Manual filters on top of the matching algorithm's own ranking/score
  // (Aryan's ask, 2026-10-09) — admin can narrow the ranked list by hand
  // instead of only trusting the auto score. Reuses the same select
  // option lists (RELIGIONS/CASTES/MARITAL_STATUSES/EDUCATIONS) as
  // signup/profile fields, same height-bucket approach as the Dashboard
  // Breakdown panel — no new field, no new algorithm.
  const showFiltersDefault = { ageMin: 18, ageMax: 70, heightMin: PARTNER_HEIGHT_MIN_INCHES, heightMax: PARTNER_HEIGHT_MAX_INCHES,
    incomeCurrency: 'INR', incomeMin: PARTNER_INCOME_BOUNDS.INR.min, incomeMax: PARTNER_INCOME_BOUNDS.INR.max,
    // Multi-select (Aryan's ask, 2026-10-09: checkbox/multi-choice filters —
    // e.g. Hindu aur Sikh dono ek saath select karna)
    city: '', religion: [], community: [], maritalStatus: [], education: [] }
  const [showFilters, setShowFilters] = useState(false)
  // Age/height/income ab slider-based range hain (DualRangeSlider, same
  // component jo member-facing Search screen par use hota hai) — pehle
  // number-input/text the (Aryan's ask, 2026-10-09: "filter mein sliders
  // chahiye"). Income filter default range (full bounds) par hamesha
  // "active" dikhta tha purane number-input design mein bhi nahi — yahan
  // bhi default range ko active nahi maante.
  const [filters, setFilters] = useState(showFiltersDefault)
  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }))
  const clearFilters = () => setFilters(showFiltersDefault)
  const activeFilterCount = (filters.city !== '' ? 1 : 0)
    + ['religion', 'community', 'maritalStatus', 'education'].filter(k => filters[k].length > 0).length
    + (filters.ageMin !== showFiltersDefault.ageMin || filters.ageMax !== showFiltersDefault.ageMax ? 1 : 0)
    + (filters.heightMin !== showFiltersDefault.heightMin || filters.heightMax !== showFiltersDefault.heightMax ? 1 : 0)
    + (filters.incomeMin !== showFiltersDefault.incomeMin || filters.incomeMax !== showFiltersDefault.incomeMax || filters.incomeCurrency !== showFiltersDefault.incomeCurrency ? 1 : 0)

  const filteredResults = results.filter(r => {
    const o = r.profile
    if (o.age && (o.age < filters.ageMin || o.age > filters.ageMax)) return false
    if (filters.city && !(o.city || '').toLowerCase().includes(filters.city.trim().toLowerCase())) return false
    if (filters.religion.length > 0 && !filters.religion.includes(o.religion)) return false
    if (filters.community.length > 0 && !filters.community.includes(o.community)) return false
    if (filters.maritalStatus.length > 0 && !filters.maritalStatus.includes(o.marital_status)) return false
    if (filters.education.length > 0 && !filters.education.includes(o.education)) return false
    const inches = parseHeightToInches(o.height)
    if (inches && (inches < filters.heightMin || inches > filters.heightMax)) return false
    if (filters.incomeMin !== showFiltersDefault.incomeMin || filters.incomeMax !== showFiltersDefault.incomeMax) {
      if (o.annual_income && o.annual_income_currency === filters.incomeCurrency) {
        const mid = parseIncomeRangeMidpoint(o.annual_income, o.annual_income_currency)
        if (mid != null && (mid < filters.incomeMin || mid > filters.incomeMax)) return false
      }
    }
    return true
  })

  const saveClientPhone = async () => {
    const digits = phoneDraft.replace(/\D/g, '')
    if (digits.length < 10) { setPhoneError('Enter a valid number (10 digits, or with country code)'); return }
    const { error } = await supabase.from('profiles').update({ client_phone: phoneDraft.trim() }).eq('id', profile.id)
    if (error) { setPhoneError('Could not save: ' + error.message); return }
    await writeAuditLog(staffUser, 'client_phone_edit', profile.id, { new_phone: phoneDraft.trim() })
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
      const b = await generateShareBundle(picked, staffUserId, profile.id)
      setBundle({ url: b.url })
    } catch (err) {
      setBundle({ error: err.message })
    }
  }


  const copyBundle = async () => {
    try { await navigator.clipboard.writeText(bundle.url); setBundle(b => ({ ...b, copied: true })) } catch {}
  }

  const handleGenerateLink = async (otherProfileId) => {
    setLinkFor(prev => ({ ...prev, [otherProfileId]: { generating: true } }))
    try {
      const link = await generateShareLink(otherProfileId, staffUserId, profile.id)
      setLinkFor(prev => ({ ...prev, [otherProfileId]: { url: link.url } }))
    } catch (err) {
      setLinkFor(prev => ({ ...prev, [otherProfileId]: { error: err.message } }))
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to list</button>

      {/* Pinned main profile — sticky so it stays visible while scrolling/
          expanding the match list below (the "two partition" screen ask:
          main profile on one side/top, matches to expand on the other/
          below, without navigating away). */}
      <div style={{position:'sticky',top:0,zIndex:6,background:'#fff',borderBottom:'1px solid #ededed',marginBottom:16,paddingBottom:12,marginLeft:-20,marginRight:-20,paddingLeft:20,paddingRight:20}}>
        <div style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer'}} onClick={()=>setMainExpanded(v=>!v)}>
          <div style={{width:44,height:44,borderRadius:'50%',background:'#f0f0f0',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
            {mainPhotoPath ? <SignedImage path={mainPhotoPath} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : <UserRound size={18} color="#bbb" />}
          </div>
          <div style={{flex:1}}>
            <div style={{fontFamily:'var(--font-display)',fontSize:17,fontWeight:500}}>Matches for {profile.full_name}</div>
            <div style={{fontSize:12,color:'#8e8e8e'}}>{profile.profile_code} • {profile.age ? profile.age+'y' : ''}{profile.age && profile.height ? ' • ' : ''}{profile.height || ''}{(profile.age||profile.height) && profile.city ? ' • ' : ''}{profile.city || ''}</div>
          </div>
          {mainExpanded ? <ChevronUp size={18} color="#8e8e8e" /> : <ChevronDown size={18} color="#8e8e8e" />}
        </div>

        {mainExpanded && (
          <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid rgba(0,0,0,0.06)',display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',gap:8}}>
            {[
              ['Religion', profile.religion], ['Community/Caste', profile.community],
              ['Marital status', profile.marital_status], ['Education', profile.education],
              ['Diet', profile.diet], ['Mother tongue', profile.mother_tongue],
              ['Family type', profile.family_type], ['Manglik', profile.manglik],
              ['Annual income', profile.annual_income], ['State', profile.state],
              ['Country', profile.country],
            ].filter(([,v]) => v).map(([label, value]) => (
              <div key={label}>
                <div style={{fontSize:11,color:'#8e8e8e'}}>{label}</div>
                <div style={{fontSize:13,fontWeight:500}}>{value}</div>
              </div>
            ))}
            {(profile.partner_age_min || profile.partner_age_max || profile.partner_religion || profile.partner_country_preference) && (
              <div style={{gridColumn:'1 / -1',marginTop:4}}>
                <div style={{fontSize:11,color:'#8e8e8e',marginBottom:2}}>Looking for</div>
                <div style={{fontSize:13}}>
                  {profile.partner_age_min && profile.partner_age_max ? `${profile.partner_age_min}-${profile.partner_age_max}y` : ''}
                  {profile.partner_religion && profile.partner_religion !== 'Any' ? ` • ${profile.partner_religion}` : ''}
                  {profile.partner_country_preference && profile.partner_country_preference !== 'Open to All' ? ` • ${profile.partner_country_preference}` : ''}
                </div>
              </div>
            )}
          </div>
        )}
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
          {phoneError && <div style={{fontSize:13,color:'#dc2626',marginTop:6}}>{phoneError}</div>}
        </div>
      )}

      {picked.length > 0 && (
        <div style={{background:'#fff8e1',borderRadius:12,padding:14,marginBottom:14}}>
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
              <WhatsAppReminderButton profile={{ ...profile, client_phone: clientPhone }} eventType="match_shared"
                vars={{ count: picked.length }} appendText={bundle.url} staffUserId={staffUserId}
                label="Send via WhatsApp" size="md" />
              {navigator.share && (
                <button className="btn btn-outline btn-sm"
                  onClick={()=>nativeShare({ title:'Matches from LOVEKUSH', text: `LOVEKUSH has handpicked ${picked.length} ${picked.length === 1 ? 'match' : 'matches'} for you.`, url: bundle.url })}>
                  Share…
                </button>
              )}
              <button className="btn btn-outline btn-sm" onClick={copyBundle}>{bundle.copied ? '✓ Copied' : 'Copy link'}</button>
              <span style={{fontSize:13,color:'#16a34a'}}>Link ready, expires in 7 days</span>
            </div>
          )}
          {bundle?.error && <div style={{fontSize:13,color:'#dc2626',marginTop:6}}>{bundle.error}</div>}
        </div>
      )}

      {!loading && results.length > 0 && (
        <div style={{marginBottom:14}}>
          <button className="btn btn-outline btn-sm" onClick={()=>setShowFilters(v=>!v)}>
            <SlidersHorizontal size={14} style={{verticalAlign:'-2px',marginRight:4}} />
            {showFilters ? 'Hide filters' : 'Filter results'}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          {showFilters && (
            <div style={{background:'#fafafa',border:'1px solid #ededed',borderRadius:'var(--radius)',padding:14,marginTop:8}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:16,marginBottom:14}}>
                <div>
                  <div style={{fontSize:12,color:'#8e8e8e',marginBottom:4}}>Age range</div>
                  <DualRangeSlider min={18} max={70} valueMin={filters.ageMin} valueMax={filters.ageMax}
                    onChange={(lo,hi)=>setFilters(p=>({...p, ageMin:lo, ageMax:hi}))}
                    formatLabel={v => v + ' yrs'} />
                </div>
                <div>
                  <div style={{fontSize:12,color:'#8e8e8e',marginBottom:4}}>Height range</div>
                  <DualRangeSlider min={PARTNER_HEIGHT_MIN_INCHES} max={PARTNER_HEIGHT_MAX_INCHES}
                    valueMin={filters.heightMin} valueMax={filters.heightMax}
                    onChange={(lo,hi)=>setFilters(p=>({...p, heightMin:lo, heightMax:hi}))}
                    formatLabel={formatHeightFromInches} />
                </div>
                <div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontSize:12,color:'#8e8e8e'}}>Income range</span>
                    <select className="form-select" value={filters.incomeCurrency} style={{maxWidth:100,fontSize:12,padding:'2px 6px'}}
                      onChange={e=>{
                        const bounds = PARTNER_INCOME_BOUNDS[e.target.value]
                        setFilters(p=>({...p, incomeCurrency:e.target.value, incomeMin:bounds.min, incomeMax:bounds.max}))
                      }}>
                      <option value="INR">₹ INR</option>
                      <option value="USD">$ USD</option>
                    </select>
                  </div>
                  <DualRangeSlider values={PARTNER_INCOME_STEPS[filters.incomeCurrency]}
                    valueMin={filters.incomeMin} valueMax={filters.incomeMax}
                    onChange={(lo,hi)=>setFilters(p=>({...p, incomeMin:lo, incomeMax:hi}))}
                    formatLabel={v => formatIncomeShort(v, filters.incomeCurrency)} />
                </div>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
                <input className="form-input" placeholder="City" value={filters.city}
                  onChange={e=>setFilter('city', e.target.value)} style={{maxWidth:140}} />
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                <div style={{maxWidth:180,flex:'1 1 160px'}}>
                  <CheckboxDropdown options={RELIGIONS} selected={filters.religion}
                    onChange={v=>setFilter('religion', v)} placeholder="All religions" />
                </div>
                <div style={{maxWidth:200,flex:'1 1 180px'}}>
                  <CheckboxDropdown options={CASTES} selected={filters.community}
                    onChange={v=>setFilter('community', v)} placeholder="All castes / communities" />
                </div>
                <div style={{maxWidth:190,flex:'1 1 170px'}}>
                  <CheckboxDropdown options={MARITAL_STATUSES} selected={filters.maritalStatus}
                    onChange={v=>setFilter('maritalStatus', v)} placeholder="All marital statuses" />
                </div>
                <div style={{maxWidth:190,flex:'1 1 170px'}}>
                  <CheckboxDropdown options={EDUCATIONS} selected={filters.education}
                    onChange={v=>setFilter('education', v)} placeholder="All education levels" />
                </div>
                {activeFilterCount > 0 && <button className="btn btn-outline btn-sm" onClick={clearFilters}>Clear filters</button>}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Finding matches...</div>
      ) : results.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>
          No matches found. This can happen if there are no other active, opposite-gender profiles meeting the hard requirements (age/religion/marital-status preferences).
        </div>
      ) : filteredResults.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>
          No matches meet these filters. <button className="btn btn-outline btn-sm" style={{marginLeft:6}} onClick={clearFilters}>Clear filters</button>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{fontSize:12,color:'#8e8e8e',marginBottom:-2}}>{filteredResults.length} of {results.length} matches</div>
          {filteredResults.map(r => {
            const other = r.profile
            const isExpanded = expandedId === other.id
            const linkState = linkFor[other.id]
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
                      <span style={{fontSize:12,fontWeight:600,padding:'6px 12px',borderRadius:20,
                        background: r.score>=70?'#f0fdf4':r.score>=40?'#fff8e1':'#f5f5f5',
                        color: r.score>=70?'#16a34a':r.score>=40?'#b45309':'#8e8e8e'}}>
                        {r.score}% match
                      </span>
                    </div>
                    <div style={{fontSize:13,color:'#8e8e8e'}}>{other.age}y • {other.city} • {other.profile_code}</div>
                  </div>
                  <ContactButtons phone={phonesById[other.id]} logProfile={other} />
                </div>

                {isExpanded && (
                  <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid rgba(0,0,0,0.06)'}}>
                    {r.strengths?.length > 0 && (
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:13,fontWeight:600,color:'#16a34a',marginBottom:4}}>Strong Matches</div>
                        {r.strengths.map((s,i)=><div key={i} style={{fontSize:12,marginBottom:2}}>✓ {s}</div>)}
                      </div>
                    )}
                    {r.needsDiscussion?.length > 0 && (
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:'#b45309',marginBottom:4}}>Needs Discussion</div>
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
                      <div style={{fontSize:13,color:'#16a34a',marginBottom:6}}>
                        ✓ Link ready (expires in 7 days, one-click revoke available in "My Share Links")
                      </div>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        <WhatsAppReminderButton profile={{ ...profile, client_phone: clientPhone }} eventType="match_shared"
                          vars={{ otherName: other.full_name }} appendText={linkState.url} staffUserId={staffUserId}
                          label="Send via WhatsApp" size="md" />
                        {!clientPhone && (
                          <span style={{fontSize:13,color:'#8e8e8e',alignSelf:'center'}}>No client phone saved, WhatsApp will ask which chat</span>
                        )}
                        {mailLink && <a href={mailLink} className="btn btn-outline btn-sm">✉ Send via Email</a>}
                      </div>
                    </div>
                  )}
                  {linkState?.error && <div style={{fontSize:13,color:'#dc2626',marginTop:6}}>{linkState.error}</div>}
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
function ShareLinksView({ staffUserId, onBack, onManageCoordination, onOpenProfile }) {
  const [links, setLinks] = useState([])
  const [profilesById, setProfilesById] = useState({}) // shown-profile id + client_profile_id -> {full_name, profile_code}
  const [loading, setLoading] = useState(true)
  const [showToast, ToastView] = useToast()
  const [expandedBundles, setExpandedBundles] = useState(new Set())
  const [openingProfile, setOpeningProfile] = useState(null) // profile_id currently being fetched for "View Profile"
  // Share ID search — Aryan ne complain kiya (2026-10-09) ki page bahut
  // messy hai aur Share ID (jaise SHR-261009-0075) daalne par kuch filter
  // nahi hota, kyunki pehle is page par koi search box tha hi nahi. Ab ek
  // dedicated box hai, upar/prominent, jo share_id + profile name/ID +
  // client name sab pe match karta hai (client-side, list already chhoti hai).
  const [shareSearch, setShareSearch] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const data = await getMyShareLinks(staffUserId)
      // Interested-but-unacknowledged links first, newest interest first —
      // that's what needs the admin's attention right now (audit gap, 2026-10-05).
      data.sort((a, b) => {
        const aPending = a.interested_at && !a.interest_acknowledged_at
        const bPending = b.interested_at && !b.interest_acknowledged_at
        if (aPending !== bPending) return aPending ? -1 : 1
        return new Date(b.created_at) - new Date(a.created_at)
      })
      setLinks(data)
      const ids = [...new Set(data.flatMap(l => [l.profile_id, l.client_profile_id]).filter(Boolean))]
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

  const handleRevoke = async (linkId) => {
    try {
      await revokeShareLink(linkId)
      load()
    } catch (err) {
      showToast(err.message)
    }
  }

  const handleAcknowledge = async (linkId) => {
    try {
      await acknowledgeShareLinkInterest(linkId)
      setLinks(prev => prev.map(l => l.id === linkId ? { ...l, interest_acknowledged_at: new Date().toISOString() } : l))
    } catch (err) {
      showToast(err.message)
    }
  }

  // "Yeh profile ne aapko like kiya hai, meeting ke liye interested ho?" —
  // ab tak sirf admin ko interest pata chalta tha, matched profile ko kabhi
  // nahi (Model 2 ka sabse bada gap, audit 2026-10-06). client_profile_id
  // maujood ho to ek Talk/Meet request ban jaati hai (Coordination Requests
  // mein dikhegi); nahi to profile ko seedha notify kar diya jaata hai.
  const [forwarding, setForwarding] = useState({})
  const handleForward = async (linkId) => {
    setForwarding(prev => ({ ...prev, [linkId]: true }))
    try {
      const introId = await forwardShareLinkInterest(linkId)
      setLinks(prev => prev.map(l => l.id === linkId ? { ...l, forwarded_at: new Date().toISOString(), forwarded_introduction_id: introId } : l))
      showToast(introId ? 'Forwarded — a meeting request was created.' : 'Profile notified.')
    } catch (err) {
      showToast(err.message)
    }
    setForwarding(prev => ({ ...prev, [linkId]: false }))
  }

  // Ek party ne share link par "Interested" dabaya (yahan client) — ab
  // doosri party (jiska profile share hua tha) ko batana hai ki "X ne aapki
  // profile mein interest dikhaya hai, meeting karna ya aage badhna
  // chahenge?", saath mein X (interested profile) ka share link (Aryan,
  // 2026-10-09). Reuse-first: existing generateShareLink + WhatsApp
  // template sheet (interest_received category). Agar is pair ka active
  // link pehle se bana hai to wahi dobara bhejte hain, naya nahi banate.
  const [interestSheet, setInterestSheet] = useState(null) // { linkId, profile, otherName, url }
  const [preparingInterest, setPreparingInterest] = useState(null)
  const handleSendInterest = async (l) => {
    setPreparingInterest(l.id)
    try {
      const { data: target, error } = await supabase.from('profiles').select('id, full_name, client_phone').eq('id', l.profile_id).single()
      if (error) throw error
      const now = new Date()
      const existing = links.find(x => x.profile_id === l.client_profile_id && x.client_profile_id === l.profile_id
        && !x.revoked && new Date(x.expires_at) > now && !x.bundle_token)
      const url = existing
        ? `${window.location.origin}/share/${existing.token}`
        : (await generateShareLink(l.client_profile_id, staffUserId, l.profile_id)).url
      setInterestSheet({ linkId: l.id, profile: target, otherName: profilesById[l.client_profile_id]?.full_name || 'A LOVEKUSH member', url })
      if (!existing) load()
    } catch (err) {
      showToast(err.message)
    }
    setPreparingInterest(null)
  }

  // "Send interest" button ka "✓ Sent" state — WhatsApp sheet se asal mein
  // "Send via WhatsApp" dabne par persist hota hai (interest_sent_at,
  // forwarded_at jaisa hi pattern), taaki refresh ke baad bhi pata chale
  // ki humne bhej diya hai (Aryan, 2026-10-09).
  const handleInterestSent = async (linkId) => {
    await markInterestSent(linkId)
    setLinks(prev => prev.map(l => l.id === linkId ? { ...l, interest_sent_at: new Date().toISOString() } : l))
  }

  const copyLink = (token) => {
    navigator.clipboard?.writeText(`${window.location.origin}/share/${token}`)
    showToast('Link copied!')
  }

  // "Interested" badge pehle sirf client ka naam dikhata tha — jis profile
  // par interest aaya hai uski ID ya profile tak jaane ka koi raasta nahi tha
  // (Aryan, 2026-10-09). Poora profile fetch karke seedha uska profile card
  // (Profiles list, Call/WhatsApp/Share actions ke saath) khol dete hain —
  // wahi jo My Queue karta hai. Pehle read-only biodata khulta tha, par
  // Aryan ko card chahiye tha jahan se aage action le sake.
  const handleViewProfile = async (profileId) => {
    if (!onOpenProfile) return
    setOpeningProfile(profileId)
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', profileId).single()
      if (error) throw error
      onOpenProfile(data)
    } catch (err) {
      showToast(err.message)
    }
    setOpeningProfile(null)
  }

  const filteredLinks = useMemo(() => {
    const q = shareSearch.trim().toLowerCase()
    if (!q) return links
    return links.filter(l => {
      const shownProfile = profilesById[l.profile_id]
      const client = l.client_profile_id ? profilesById[l.client_profile_id] : null
      return (l.share_id && l.share_id.toLowerCase().includes(q))
        || (shownProfile?.full_name && shownProfile.full_name.toLowerCase().includes(q))
        || (shownProfile?.profile_code && shownProfile.profile_code.toLowerCase().includes(q))
        || (client?.full_name && client.full_name.toLowerCase().includes(q))
        || (client?.profile_code && client.profile_code.toLowerCase().includes(q))
    })
  }, [links, profilesById, shareSearch])

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <ToastView />
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to list</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:12}}>My Share Links</h2>
      {/* Search box — upar, achi tarah visible, Share ID + profile/client
          naam/ID sab pe kaam karta hai (Aryan, 2026-10-09). */}
      {links.length > 0 && (
        <div style={{position:'relative',marginBottom:18}}>
          <Search size={15} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#aaa'}} />
          <input type="text" value={shareSearch} onChange={e=>setShareSearch(e.target.value)}
            placeholder="Search by Share ID, profile ID or name..."
            style={{width:'100%',padding:'10px 12px 10px 36px',fontSize:13,borderRadius:10,border:'1px solid #ededed',background:'#fafafa'}} />
          {shareSearch && (
            <button className="btn btn-outline btn-sm" style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',padding:'3px 6px'}}
              onClick={()=>setShareSearch('')} title="Clear search"><X size={13} /></button>
          )}
        </div>
      )}
      {interestSheet && (
        <ReminderSheet profile={interestSheet.profile} eventType="interest_received"
          vars={{ otherName: interestSheet.otherName }} appendText={interestSheet.url} staffUserId={staffUserId}
          onSent={()=>handleInterestSent(interestSheet.linkId)}
          onClose={()=>setInterestSheet(null)} />
      )}

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : links.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>
          No share links created yet. Generate one from "Find Matches" for any profile.
        </div>
      ) : filteredLinks.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>
          No share links match "{shareSearch}".
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {filteredLinks.map(l => {
            const isExpired = new Date(l.expires_at) < new Date()
            const status = l.revoked ? 'Revoked' : isExpired ? 'Expired' : 'Active'
            const statusColor = l.revoked ? '#8e8e8e' : isExpired ? '#b45309' : '#16a34a'
            const shownProfile = profilesById[l.profile_id]
            const client = l.client_profile_id ? profilesById[l.client_profile_id] : null
            const interestPending = l.interested_at && !l.interest_acknowledged_at
            // Bulk match share = one matching cycle (audit 2026-10-08,
            // P0 #4): several profiles shared to the same client in one
            // bundle, each with its own independent status. Admin should
            // see them as one cycle; siblings are found by bundle_token
            // (never shown to the client — each client's own token/page
            // only ever returns their own interaction, untouched here).
            const bundleSiblings = l.bundle_token ? links.filter(x => x.bundle_token === l.bundle_token && x.id !== l.id) : []
            const isBundleExpanded = expandedBundles.has(l.bundle_token)
            return (
              <div key={l.id} className="list-row" style={interestPending ? { borderColor: '#16a34a', background: '#f0fdf4' } : {}}>
                {/* Share ID — moved to the top corner, prominent, since
                    that's what Aryan actually searches/refers to by
                    (Aryan, 2026-10-09 follow-up). */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                  <div style={{fontSize:11,fontFamily:'monospace',fontWeight:700,color:'#8e8e8e',letterSpacing:'0.3px'}}>
                    {l.share_id || '/' + l.token.slice(0,12) + '...'}
                  </div>
                  <div style={{display:'flex',alignItems:'flex-start',gap:4}}>
                    {/* Views + expiry compacted to icon + value — no "views"
                        / "Expires" words (Aryan, 2026-10-09). */}
                    <div style={{textAlign:'right',fontSize:12,color:'#8e8e8e'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:3}} title={`${l.view_count} view${l.view_count!==1?'s':''}`}>
                        <Eye size={12} /> {l.view_count}
                      </div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:3,color:'#bbb',marginTop:2}}
                        title={l.revoked ? 'Revoked' : `Expires ${new Date(l.expires_at).toLocaleDateString('en-IN')}`}>
                        <Info size={12} /> {l.revoked ? 'Revoked' : new Date(l.expires_at).toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit' })}
                      </div>
                    </div>
                    {/* Copy Link — icon-only now (Aryan, 2026-10-09: the
                        word "Copy Link" was just taking up space). */}
                    <button className="btn btn-outline btn-sm" style={{padding:'5px 6px',lineHeight:1}}
                      onClick={()=>copyLink(l.token)} title="Copy share link"><Copy size={14} /></button>
                    {/* Less-used actions compacted into the ⋮ menu (Aryan,
                        2026-10-09: page felt messy with every button always
                        showing). Revoke lives here regardless of interest
                        state; "Dismiss reminder" only while an unread
                        interest is still highlighting this card. */}
                    <OverflowMenu items={[
                      interestPending && { label: 'Dismiss reminder (already followed up)', icon: CheckCircle2,
                        onClick: () => handleAcknowledge(l.id) },
                      !l.revoked && !isExpired && { label: 'Revoke link', icon: X, color: '#dc2626',
                        onClick: () => handleRevoke(l.id) },
                    ].filter(Boolean)} />
                  </div>
                </div>
                {/* Both profiles in this coordination — the shared profile
                    and who it was shared with — each with their own
                    Profile ID right under their name, clickable straight to
                    that profile's card. The standalone "View Profile"
                    button never worked reliably and is gone now; the name
                    and ID themselves are the link (Aryan, 2026-10-09
                    follow-up: "View Profile hata do, dono ki ID clickable
                    honi chahiye"). */}
                <div style={{marginTop:8,display:'flex',alignItems:'flex-start',gap:6}}>
                  <span title={status} style={{width:7,height:7,borderRadius:'50%',background:statusColor,flexShrink:0,marginTop:5}} />
                  <div>
                    {onOpenProfile ? (
                      <button type="button" disabled={openingProfile === l.profile_id} onClick={()=>handleViewProfile(l.profile_id)}
                        style={{fontSize:13,fontWeight:600,background:'none',border:'none',padding:0,textAlign:'left',cursor:'pointer',color:'#111'}}>
                        {shownProfile ? shownProfile.full_name : 'Profile'}
                      </button>
                    ) : (
                      <div style={{fontSize:13,fontWeight:600}}>{shownProfile ? shownProfile.full_name : 'Profile'}</div>
                    )}
                    {shownProfile?.profile_code && (
                      onOpenProfile ? (
                        <button type="button" disabled={openingProfile === l.profile_id} onClick={()=>handleViewProfile(l.profile_id)}
                          style={{display:'block',fontSize:11,fontFamily:'monospace',color:'#8e8e8e',background:'none',border:'none',
                            padding:0,textDecoration:'underline',cursor:'pointer',marginTop:1}} title="Open this profile">
                          ID {shownProfile.profile_code}
                        </button>
                      ) : <div style={{fontSize:11,fontFamily:'monospace',color:'#8e8e8e',marginTop:1}}>ID {shownProfile.profile_code}</div>
                    )}
                    {client && (
                      <div style={{marginTop:6,fontSize:12,color:'#8e8e8e'}}>
                        for{' '}
                        {onOpenProfile ? (
                          <button type="button" disabled={openingProfile === l.client_profile_id} onClick={()=>handleViewProfile(l.client_profile_id)}
                            style={{fontWeight:600,background:'none',border:'none',padding:0,cursor:'pointer',color:'#333'}}>
                            {client.full_name}
                          </button>
                        ) : <span style={{fontWeight:600,color:'#333'}}>{client.full_name}</span>}
                        {client.profile_code && (
                          onOpenProfile ? (
                            <button type="button" disabled={openingProfile === l.client_profile_id} onClick={()=>handleViewProfile(l.client_profile_id)}
                              style={{display:'block',fontSize:11,fontFamily:'monospace',color:'#8e8e8e',background:'none',border:'none',
                                padding:0,textDecoration:'underline',cursor:'pointer',marginTop:1}} title="Open this profile">
                              ID {client.profile_code}
                            </button>
                          ) : <div style={{fontSize:11,fontFamily:'monospace',color:'#8e8e8e',marginTop:1}}>ID {client.profile_code}</div>
                        )}
                      </div>
                    )}
                    {status !== 'Active' && (
                      <div style={{fontSize:12,color:statusColor,fontWeight:600,marginTop:6}}>{status}</div>
                    )}
                  </div>
                </div>
                {bundleSiblings.length > 0 && (
                  <div style={{marginTop:8}}>
                    <button className="btn btn-outline btn-sm" style={{padding:'4px 10px',fontSize:12}}
                      onClick={()=>setExpandedBundles(prev => {
                        const next = new Set(prev)
                        next.has(l.bundle_token) ? next.delete(l.bundle_token) : next.add(l.bundle_token)
                        return next
                      })}>
                      🔗 One of {bundleSiblings.length + 1} shared in this cycle {isBundleExpanded ? '▲' : '▼'}
                    </button>
                    {isBundleExpanded && (
                      <div style={{marginTop:6,display:'flex',flexDirection:'column',gap:4,paddingLeft:10,borderLeft:'2px solid #eee'}}>
                        {bundleSiblings.map(s => {
                          const sp = profilesById[s.profile_id]
                          const sStatus = s.revoked ? 'Revoked' : new Date(s.expires_at) < new Date() ? 'Expired'
                            : s.interested_at ? '👍 Interested' : 'Awaiting response'
                          return (
                            <div key={s.id} style={{fontSize:12,color:'#555',display:'flex',justifyContent:'space-between',gap:8}}>
                              <span>{sp ? sp.full_name : 'Profile'}</span>
                              <span style={{color:'#8e8e8e'}}>{sStatus}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                {/* Client tapped "👍 Interested" on this profile — previously
                    there was no way for a share-link client to signal this at
                    all, and no record of which client a link was even for
                    (audit gap, 2026-10-05). */}
                {l.interested_at && (
                  <div style={{marginTop:8,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
                    {/* The word "Interested" was redundant next to the
                        thumbs-up icon itself (Aryan, 2026-10-09 follow-up:
                        "only logo hi kaafi hai"). */}
                    <div style={{fontSize:12,color:'#16a34a',fontWeight:600,display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}} title="Interested">
                      <ThumbsUp size={12} /> {new Date(l.interested_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}
                    </div>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      {client && (
                        l.interest_sent_at ? (
                          <button className="btn btn-outline btn-sm" style={{padding:'5px 10px',fontSize:12,color:'#16a34a',borderColor:'#16a34a'}}
                            disabled={preparingInterest === l.id} onClick={()=>handleSendInterest(l)}
                            title={`Sent ${new Date(l.interest_sent_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })} — click to send again`}>
                            {preparingInterest === l.id ? 'Preparing...' : '✓ Sent'}
                          </button>
                        ) : (
                          <button className="btn btn-outline btn-sm" style={{padding:'5px 10px',fontSize:12,color:'#16a34a',borderColor:'#16a34a'}}
                            disabled={preparingInterest === l.id} onClick={()=>handleSendInterest(l)}
                            title={`Send ${client.full_name}'s profile to ${shownProfile?.full_name || 'this profile'} on WhatsApp`}>
                            {preparingInterest === l.id ? 'Preparing...' : `📲 Send interest to ${(shownProfile?.full_name || 'profile').split(' ')[0]}`}
                          </button>
                        )
                      )}
                      {l.forwarded_at ? (
                        l.forwarded_introduction_id && onManageCoordination ? (
                          <button className="btn btn-outline btn-sm" style={{padding:'5px 10px',fontSize:12,color:'#16a34a',borderColor:'#16a34a'}}
                            onClick={()=>onManageCoordination(l.forwarded_introduction_id)}>✓ Forwarded — Manage</button>
                        ) : (
                          <span style={{fontSize:12,color:'#16a34a',fontWeight:600}}>✓ Profile notified</span>
                        )
                      ) : (
                        <button className="btn btn-black btn-sm" style={{padding:'5px 10px',fontSize:12}}
                          disabled={forwarding[l.id]} onClick={()=>handleForward(l.id)}>
                          {forwarding[l.id] ? 'Forwarding...' : '→ Tell this profile'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CasteSuggestionsView({ onBack, staffUser }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [showToast, ToastView] = useToast()

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

  const handleAction = async (id, status, suggestion) => {
    try {
      const { error } = await supabase.from('caste_suggestions').update({ status }).eq('id', id)
      if (error) throw error
      // Approve/reject kahin audit log nahi likhta tha — Aryan ka audit gap #7.
      await writeAuditLog(staffUser, 'caste_suggestion_' + status, id, {
        suggested_name: suggestion?.suggested_name, field_type: suggestion?.field_type,
      })
      load()
    } catch (err) {
      showToast(err.message)
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <ToastView />
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
                  <div style={{fontSize:12,color:'#bbb',marginTop:2}}>
                    {new Date(s.created_at).toLocaleDateString('en-IN')}
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:12,color:'#8e8e8e'}}>Suggested {s.times_suggested}x</div>
                </div>
              </div>
              <div style={{display:'flex',gap:8,marginTop:10}}>
                <button className="btn btn-outline btn-sm" style={{color:'#16a34a',borderColor:'#16a34a'}}
                  onClick={()=>handleAction(s.id, 'approved', s)}>✅ Approve</button>
                <button className="btn btn-outline btn-sm" style={{color:'#dc2626',borderColor:'#dc2626'}}
                  onClick={()=>handleAction(s.id, 'rejected', s)}><X size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Reject</button>
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
// Status sets for each tab's server-side query — 'open' deliberately still
// includes 'pending' (not-yet-accepted requests show in both, same as before).
const COORD_ALL_STATUSES = ['pending', 'declined', 'accepted', 'contacted', 'meeting_done', 'closed']
const COORD_OPEN_STATUSES = ['pending', 'declined', 'accepted', 'contacted', 'meeting_done']

function CoordinationRequestsView({ onBack, backLabel, focusId, onConsumeFocus, staffUser }) {
  const [showToast, ToastView] = useToast()
  const [requests, setRequests] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [notesByIntroduction, setNotesByIntroduction] = useState({}) // introduction_id -> profile_notes[] (history, incl. reschedules)
  const [loading, setLoading] = useState(true)
  // ===== PAGINATION (scale audit, 2026-10-04) — pehle yeh poori
  // introductions table (sab pending/declined/accepted/contacted/
  // meeting_done/closed rows) ek saath load karta tha. Ab Profiles list
  // jaisa hi "Load More" pattern (30 per page), server-side tab filter ke
  // saath — ek baar mein ek page hi aati hai.
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [pendingCount, setPendingCount] = useState(0) // badge ke liye — loaded rows se independent, poore table ka sahi count
  const [scheduleDraft, setScheduleDraft] = useState({}) // request id -> datetime-local string being edited
  const [locationDraft, setLocationDraft] = useState({}) // request id -> location string being edited
  // Pending (not yet accepted/declined by the receiver) requests were never
  // shown here before — admin had no visibility until both members acted.
  // Now included by default so admin can see/coordinate proactively.
  const [tab, setTab] = useState('open') // open (not closed) | pending | closed | all
  const [query, setQuery] = useState('')
  // Search used to only filter whatever page of the CURRENT tab happened to
  // be loaded — a request in a different tab, or not yet paged in, simply
  // wasn't found (audit 2026-10-08, P1 #10 re-scope). A non-empty query now
  // runs its own broader fetch across every status instead.
  const [searchResults, setSearchResults] = useState(null) // null = not searching, else rows from every status
  const [searching, setSearching] = useState(false)

  const buildQuery = (forTab, from, to) => {
    let q = supabase.from('introductions').select('*').order('created_at', { ascending: false }).range(from, to)
    if (forTab === 'pending') q = q.eq('status', 'pending')
    else if (forTab === 'closed') q = q.eq('status', 'closed')
    else if (forTab === 'open') q = q.in('status', COORD_OPEN_STATUSES)
    else q = q.in('status', COORD_ALL_STATUSES)
    return q
  }

  // Merges related profiles/notes for a set of (newly loaded) rows into the
  // existing maps, instead of refetching everything already on screen.
  const loadRelated = async (rows) => {
    if (rows.length === 0) return
    const ids = [...new Set(rows.flatMap(r => [r.from_profile, r.to_profile]))]
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, profile_code, client_phone, gender').in('id', ids)
      const map = {}
      ;(profs || []).forEach(p => { map[p.id] = p })
      setProfilesById(prev => ({ ...prev, ...map }))
    }
    const { data: notes } = await supabase.from('profile_notes').select('*')
      .in('introduction_id', rows.map(r => r.id)).order('created_at', { ascending: false })
    const byIntro = {}
    ;(notes || []).forEach(n => { (byIntro[n.introduction_id] = byIntro[n.introduction_id] || []).push(n) })
    setNotesByIntroduction(prev => ({ ...prev, ...byIntro }))
  }

  const refreshPendingCount = async () => {
    const { count } = await supabase.from('introductions').select('*', { count: 'exact', head: true }).eq('status', 'pending')
    setPendingCount(count || 0)
  }

  const runQuery = async (forTab, fromIndex) => {
    if (fromIndex === 0) setLoading(true); else setLoadingMore(true)
    try {
      const { data, error } = await buildQuery(forTab, fromIndex, fromIndex + PAGE_SIZE - 1)
      if (error) throw error
      const newRows = data || []
      setHasMore(newRows.length === PAGE_SIZE)
      if (fromIndex === 0) setRequests(newRows)
      else setRequests(prev => [...prev, ...newRows])
      await loadRelated(newRows)
    } catch (err) {
      console.error(err.message)
    }
    setLoading(false); setLoadingMore(false)
  }

  // Manual "Refresh" — resets back to this tab's first page (same as the
  // Profiles list's Refresh button).
  const load = () => { runQuery(tab, 0); refreshPendingCount() }
  const loadMore = () => { if (!hasMore || loadingMore) return; runQuery(tab, requests.length) }

  useEffect(() => { runQuery(tab, 0) }, [tab])
  useEffect(() => { refreshPendingCount() }, [])

  // Debounced cross-status search — covers every request regardless of
  // which tab it'd normally sit in or whether its page has been loaded.
  useEffect(() => {
    if (!query.trim()) { setSearchResults(null); return }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.from('introductions').select('*')
          .order('created_at', { ascending: false }).limit(200)
        if (error) throw error
        if (cancelled) return
        await loadRelated(data || [])
        if (!cancelled) setSearchResults(data || [])
      } catch (err) {
        console.error(err.message)
      }
      if (!cancelled) setSearching(false)
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Opened via a "Manage"/"View" link elsewhere (My Queue, a profile's own
  // Coordination section) — jump to the tab that has it, make sure that
  // exact request is loaded even if pagination hasn't reached it yet, then
  // scroll to it (audit gap #5).
  useEffect(() => {
    if (!focusId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('introductions').select('*').eq('id', focusId).maybeSingle()
      if (cancelled) return
      if (!data) { onConsumeFocus && onConsumeFocus(); return }
      const targetTab = data.status === 'pending' ? 'pending' : data.status === 'closed' ? 'closed' : 'open'
      setQuery('')
      setTab(targetTab)
      await runQuery(targetTab, 0)
      if (cancelled) return
      setRequests(prev => prev.some(x => x.id === data.id) ? prev : [data, ...prev])
      await loadRelated([data])
      setTimeout(() => {
        document.getElementById('coord-req-' + focusId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      onConsumeFocus && onConsumeFocus()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  const handleAction = async (id, status) => {
    try {
      // Audit 2026-10-08, P0 #10: marking a meeting Done should
      // automatically start a 48-hour decision window — introductions
      // already has a decision/decision_at/decision_deadline columns,
      // but nothing ever set or read them. Starting it here, same write.
      const patch = status === 'meeting_done' ? { status, decision_deadline: new Date(Date.now() + 48*60*60*1000).toISOString() } : { status }
      const { error } = await supabase.from('introductions').update(patch).eq('id', id)
      if (error) throw error
      // Coordination status change kahin audit log nahi likhta tha — Aryan
      // ka audit gap #7. entity_id = introduction id.
      await writeAuditLog(staffUser, 'coordination_status_change', id, { new_status: status })
      setRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
      refreshPendingCount()
    } catch (err) {
      showToast(err.message)
    }
  }

  // Positive/Negative outcome after the meeting — recorded on the same
  // interaction (decision/decision_at), not a new record (audit #39). A
  // positive decision also starts the next-round pipeline (audit #11).
  const handleDecision = async (id, decision) => {
    try {
      const patch = { decision, decision_at: new Date().toISOString() }
      if (decision === 'interested') patch.next_round_stage = 'horoscope_review'
      const { error } = await supabase.from('introductions').update(patch).eq('id', id)
      if (error) throw error
      await writeAuditLog(staffUser, 'coordination_decision_recorded', id, patch)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    } catch (err) {
      showToast(err.message)
    }
  }

  // Next-round pipeline after a positive decision: horoscope review ->
  // house visit -> final meeting -> contact disclosure -> successful match.
  // Same introduction row throughout (reuse-first, audit #11) — each step
  // just advances next_round_stage and, where the audit calls for it,
  // stamps its own timestamp. Any step can instead end the round as "not
  // proceeding", which closes the request same as the existing Close action.
  const handleAdvanceRound = async (id, nextStage, extraPatch) => {
    try {
      const patch = { next_round_stage: nextStage, ...(extraPatch || {}) }
      const { error } = await supabase.from('introductions').update(patch).eq('id', id)
      if (error) throw error
      await writeAuditLog(staffUser, 'coordination_round_advanced', id, patch)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    } catch (err) {
      showToast(err.message)
    }
  }

  // Contact disclosure is the audit's one explicitly "auditable" step —
  // writeAuditLog already records who (actor_user_id) and when
  // (created_at) for every coordination action, so this reuses that same
  // path rather than a new mechanism. It also closes the round out as a
  // successful match — the audit's "final historical state".
  const handleDiscloseAndComplete = async (id) => {
    try {
      const now = new Date().toISOString()
      const patch = {
        next_round_stage: 'successful_match',
        contact_disclosed_at: now,
        contact_disclosed_by: staffUser.user_id,
        final_outcome: 'successful_match',
        final_outcome_at: now,
        status: 'closed',
      }
      const { error } = await supabase.from('introductions').update(patch).eq('id', id)
      if (error) throw error
      await writeAuditLog(staffUser, 'contact_disclosed', id, patch)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
      refreshPendingCount()
    } catch (err) {
      showToast(err.message)
    }
  }

  const handleNotProceeding = async (id) => {
    try {
      const now = new Date().toISOString()
      const patch = { final_outcome: 'not_proceeding', final_outcome_at: now, status: 'closed' }
      const { error } = await supabase.from('introductions').update(patch).eq('id', id)
      if (error) throw error
      await writeAuditLog(staffUser, 'coordination_round_ended', id, patch)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
      refreshPendingCount()
    } catch (err) {
      showToast(err.message)
    }
  }

  // "viewed" status — SmartMatchApp jaisa sent→viewed→accepted/declined lifecycle
  const handleMarkViewed = async (id) => {
    try {
      const viewed_at = new Date().toISOString()
      const { error } = await supabase.from('introductions').update({ viewed_at }).eq('id', id)
      if (error) throw error
      setRequests(prev => prev.map(r => r.id === id ? { ...r, viewed_at } : r))
    } catch (err) {
      showToast(err.message)
    }
  }

  // Call/meeting scheduling — introductions.scheduled_at, "Today's calls &
  // meetings" (My Queue) ko yahin se data milta hai. Reschedule ka purana
  // time overwrite hone se pehle profile_notes mein log hota hai, taaki
  // "pehle kab rakha tha, kyun badla" ki history na gayab ho (audit gap #4).
  const handleSchedule = async (id, datetimeLocal, prevScheduledAt, fromProfileId, location) => {
    if (!datetimeLocal) return
    try {
      const newWhen = new Date(datetimeLocal).toISOString()
      // Audit 2026-10-08, P1 #14: past dates were selectable (the
      // datetime-local input had no min) — the UI now also sets min=now,
      // this is the belt-and-suspenders server-side check.
      if (new Date(newWhen).getTime() < Date.now() - 60000) {
        showToast('Meeting time cannot be in the past.')
        return
      }
      if (prevScheduledAt) {
        const { data: auth } = await supabase.auth.getUser()
        const { data: noteRow } = await supabase.from('profile_notes').insert({
          profile_id: fromProfileId,
          staff_user_id: auth?.user?.id,
          introduction_id: id,
          note: `🔁 Rescheduled: ${new Date(prevScheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} → ${new Date(newWhen).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
        }).select('*').single()
        if (noteRow) setNotesByIntroduction(prev => ({ ...prev, [id]: [noteRow, ...(prev[id] || [])] }))
      }
      const patch = { scheduled_at: newWhen, location: location || null }
      const { error } = await supabase.from('introductions').update(patch).eq('id', id)
      if (error) throw error
      await writeAuditLog(staffUser, 'coordination_meeting_scheduled', id, { scheduled_at: newWhen, location: location || null, previous: prevScheduledAt || null })
      setScheduleDraft(prev => ({ ...prev, [id]: undefined }))
      setRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    } catch (err) {
      showToast(err.message)
    }
  }

  const handleUnschedule = async (id) => {
    try {
      const { error } = await supabase.from('introductions').update({ scheduled_at: null }).eq('id', id)
      if (error) throw error
      setRequests(prev => prev.map(r => r.id === id ? { ...r, scheduled_at: null } : r))
    } catch (err) {
      showToast(err.message)
    }
  }

  // Post-introduction feedback — Shaadi VIP jaisa closed feedback loop
  const handleSaveFeedback = async (id, fb) => {
    try {
      const { error } = await supabase.from('introductions').update(fb).eq('id', id)
      if (error) throw error
      await writeAuditLog(staffUser, 'coordination_feedback_saved', id, fb)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, ...fb } : r))
    } catch (err) {
      showToast(err.message)
    }
  }

  // Tab filtering is server-side; search instead runs over searchResults
  // (every status, fetched separately above) once a query is typed, so it
  // isn't limited to whichever tab/page happens to be on screen.
  const filteredRequests = (searchResults ?? requests).filter(r => {
    const a = profilesById[r.from_profile], b = profilesById[r.to_profile]
    return matchesSearch(query, a?.full_name, a?.profile_code, a?.client_phone, b?.full_name, b?.profile_code, b?.client_phone, r.request_id)
  })

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <ToastView />
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} label={backLabel} />
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:14}}>Coordination Requests</h2>
      {requests.length > 0 && <ListSearch value={query} onChange={setQuery} placeholder="Search by name, Profile ID, mobile or Request ID..." />}

      {/* Tab labels spelled out (audit 2026-10-08, P0 #9: "Open" and
          "Pending" read as contradictory statuses when both are just
          lowercase words) — "Pending" is a narrower filter *within*
          "Open" (every status but Closed), not a separate current state;
          a request's one real current state is still its single
          COORD_STATUS_LABELS badge on the card below. */}
      {/* Searching looks across every status at once, so the tab pills
          (which only describe the non-search view) step aside for a plain
          note instead of implying the search is scoped to one of them. */}
      {searchResults !== null ? (
        <div style={{fontSize:12,color:'#8e8e8e',marginBottom:16}}>
          {searching ? 'Searching across all requests...' : `Searching across all requests — ${filteredRequests.length} match${filteredRequests.length === 1 ? '' : 'es'}.`}
        </div>
      ) : (
        <div className="pill-tabs" style={{marginBottom:16}}>
          {[
            ['open', 'Open'],
            ['pending', `Needs first response (${pendingCount})`],
            ['closed', 'Closed'],
            ['all', 'All'],
          ].map(([t, label]) => (
            <button key={t} className={'pill-tab ' + (tab === t ? 'active' : '')} onClick={()=>setTab(t)}>
              {label}
            </button>
          ))}
        </div>
      )}

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
            const history = notesByIntroduction[r.id] || []
            return (
              <div key={r.id} id={'coord-req-' + r.id} className="list-row"
                style={focusId === r.id ? { borderColor: '#2563eb', boxShadow: '0 0 0 2px rgba(37,99,235,0.25)' } : {}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:600}}>
                      {from ? from.full_name : (r.source === 'share_link' ? 'Share-link client' : 'Unknown')} → {to ? to.full_name : 'Unknown'}
                    </div>
                    <div style={{fontSize:12,color:'#8e8e8e',marginTop:2,textTransform:'capitalize'}}>
                      {r.request_type === 'meeting' ? 'Meeting request' : 'Talk request'}
                      {r.source === 'share_link' && <span style={{marginLeft:6,color:'#16a34a'}}>· forwarded from a shared link</span>}
                    </div>
                    <div style={{fontSize:12,color:'#bbb',marginTop:2,display:'flex',alignItems:'center',gap:8}}>
                      {new Date(r.created_at).toLocaleDateString('en-IN')}
                      {r.request_id && <span style={{fontFamily:'monospace',color:'#8e8e8e'}}>{r.request_id}</span>}
                    </div>
                    {/* Dono families ko seedha call/WhatsApp — coordination yahin se.
                        Number missing ho to yahin inline add/save bhi ho sakta hai
                        (Find Matches ka wahi ProfileContact pattern reuse) — pehle
                        button simply gayab ho jaata tha, admin ko pata nahi chalta tha.
                        Call/WhatsApp yahan se log ki gayi note is request se bhi
                        link hoti hai (introductionId), + ek plain "Add note" bhi
                        (jab baat call/WhatsApp tap ke bina hui ho, jaise in-person
                        meeting) — audit gap #4. */}
                    {[from, to].filter(Boolean).map(x => {
                      const other = x.id === from?.id ? to : from
                      return (
                      <div key={x.id} style={{marginTop:6}}>
                        <div style={{fontSize:13,color:'#8e8e8e',marginBottom:2,display:'flex',alignItems:'center',gap:6}}>
                          {x.full_name} <AddNoteButton profile={x} introductionId={r.id} />
                        </div>
                        <ProfileContact profile={x} logCalls introductionId={r.id} staffUser={staffUser}
                          onSaved={(phone)=>setProfilesById(prev=>({ ...prev, [x.id]: { ...prev[x.id], client_phone: phone } }))} />
                        {/* No automated reminder yet (no WhatsApp vendor
                            chosen — see docs/product/future-whatsapp-plan.md);
                            one-tap confirm until that's decided. */}
                        {r.scheduled_at && (
                          <div style={{marginTop:4}}>
                            <WhatsAppReminderButton profile={x} eventType="meeting_scheduled" label="Confirm on WhatsApp"
                              vars={{ otherName: other?.full_name || 'the other member',
                                when: new Date(r.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                                  + (r.location ? ` at ${r.location}` : '') }} />
                          </div>
                        )}
                      </div>
                      )
                    })}
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                    <div className={coordBadgeClass(r.status)} style={{fontSize:12}}>
                      {coordStatusLabel(r.status)}
                    </div>
                    {r.scheduled_at && (
                      <div style={{fontSize:12,color:'#2563eb',display:'flex',alignItems:'center',gap:4}}>
                        <CalendarClock size={11} /> {new Date(r.scheduled_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}
                      </div>
                    )}
                    {r.location && (
                      <div style={{fontSize:12,color:'#8e8e8e',display:'flex',alignItems:'center',gap:4}}>
                        <MapPin size={11} /> {r.location}
                      </div>
                    )}
                  </div>
                </div>
                {/* Schedule a call/meeting time — My Queue ke "Today" section mein
                    dikhta hai. min=now blocks past dates (audit 2026-10-08, P1 #14);
                    location field reuses introductions.location (audit P1 #15). */}
                <div style={{display:'flex',alignItems:'center',gap:6,marginTop:8,flexWrap:'wrap'}} onClick={e=>e.stopPropagation()}>
                  <CalendarClock size={13} color="#8e8e8e" />
                  <input type="datetime-local" className="form-input" style={{fontSize:12,padding:'7px 12px',width:190}}
                    min={nowForDatetimeLocalMin()}
                    value={scheduleDraft[r.id] ?? ''}
                    onChange={e=>setScheduleDraft(prev=>({ ...prev, [r.id]: e.target.value }))} />
                  <MapPin size={13} color="#8e8e8e" />
                  <input type="text" className="form-input" placeholder="Location (optional)"
                    style={{fontSize:12,padding:'7px 12px',width:160}}
                    value={locationDraft[r.id] ?? r.location ?? ''}
                    onChange={e=>setLocationDraft(prev=>({ ...prev, [r.id]: e.target.value }))} />
                  <button className="btn btn-outline btn-sm" style={{padding:'7px 14px',fontSize:13}}
                    onClick={()=>handleSchedule(r.id, scheduleDraft[r.id], r.scheduled_at, r.from_profile, locationDraft[r.id] ?? r.location)}>
                    {r.scheduled_at ? 'Reschedule' : 'Schedule'}
                  </button>
                  {r.scheduled_at && (
                    <button className="btn btn-outline btn-sm" style={{padding:'7px 14px',fontSize:13,color:'#dc2626',borderColor:'#dc2626'}}
                      onClick={()=>handleUnschedule(r.id)}>Clear</button>
                  )}
                </div>
                <div style={{display:'flex',gap:6,marginTop:8,alignItems:'center'}}>
                  <OverflowMenu items={[
                    { label: 'Mark viewed', icon: Eye, onClick: () => handleMarkViewed(r.id), hidden: !!r.viewed_at },
                    { label: 'Called', icon: Phone, color: '#b45309', onClick: () => handleAction(r.id, 'contacted'), hidden: ['contacted', 'meeting_done', 'closed'].includes(r.status) },
                    { label: 'Met', icon: Handshake, color: '#7c3aed', onClick: () => handleAction(r.id, 'meeting_done'), hidden: r.status === 'meeting_done' || r.status === 'closed' },
                    { label: 'Close', icon: X, onClick: () => handleAction(r.id, 'closed'), hidden: r.status === 'closed' },
                  ]} />
                </div>
                {r.viewed_at && <div style={{fontSize:12,color:'#bbb',marginTop:6}}>Viewed {new Date(r.viewed_at).toLocaleString('en-IN')}</div>}

                {/* History — every call/WhatsApp log, free-form note and reschedule
                    for this request, not just the final close-time feedback
                    (audit gap #4: "beech ki baatein kahin save nahi hoti thi"). */}
                {history.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#8e8e8e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>History</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {history.map(n => {
                        const notedProfile = n.profile_id === from?.id ? from : n.profile_id === to?.id ? to : null
                        return (
                        <div key={n.id} style={{ fontSize: 13, background: '#f9f9f9', padding: '6px 8px', borderRadius: 8 }}>
                          {/* Which of the two profiles this note is about —
                              otherwise ambiguous once both sides of the
                              match share one History list (audit gap). */}
                          {notedProfile && (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 12, marginRight: 6,
                              background: notedProfile.gender === 'Male' ? '#eff6ff' : '#fdf2f8',
                              color: notedProfile.gender === 'Male' ? '#2563eb' : '#db2777' }}>
                              {notedProfile.gender === 'Male' ? '👦' : notedProfile.gender === 'Female' ? '👧' : '●'} {notedProfile.profile_code || notedProfile.full_name}
                            </span>
                          )}
                          {n.call_outcome && (
                            <span style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 20, marginRight: 6,
                              background: CALL_OUTCOME_COLORS[n.call_outcome]?.bg, color: CALL_OUTCOME_COLORS[n.call_outcome]?.fg }}>
                              {CALL_OUTCOME_LABELS[n.call_outcome]}
                            </span>
                          )}
                          {n.note} <span style={{ color: '#bbb' }}>· {new Date(n.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        </div>
                      )})}
                    </div>
                  </div>
                )}

                {/* 48-hour decision window — starts automatically when the
                    meeting is marked Done (audit 2026-10-08, P0 #10). Shown
                    only until a decision is recorded, then replaced by the
                    recorded outcome (same interaction, no new record). */}
                {r.status === 'meeting_done' && r.decision_deadline && !r.decision && (
                  <DecisionWindow deadline={r.decision_deadline} onDecide={(d)=>handleDecision(r.id, d)} />
                )}
                {r.decision && (
                  <div style={{fontSize:12,marginTop:8,display:'flex',alignItems:'center',gap:6,
                    color: r.decision === 'interested' ? '#16a34a' : '#8e8e8e'}}>
                    {r.decision === 'interested' ? <CheckCircle2 size={13} /> : <X size={13} />}
                    Decision: {r.decision === 'interested' ? 'Positive' : 'Negative'} · {new Date(r.decision_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}
                  </div>
                )}

                {/* Next round after a positive decision: horoscope review ->
                    house visit -> final meeting -> contact disclosure ->
                    successful match (audit 2026-10-08, P0 #11). Hidden once
                    the round has ended (closed), same as every other
                    in-progress control on this card. */}
                {r.decision === 'interested' && r.next_round_stage && r.status !== 'closed' && (
                  <NextRoundPanel request={r} fromProfile={from} toProfile={to}
                    onAdvance={(stage, patch)=>handleAdvanceRound(r.id, stage, patch)}
                    onDiscloseAndComplete={()=>handleDiscloseAndComplete(r.id)}
                    onNotProceeding={()=>handleNotProceeding(r.id)} />
                )}
                {r.final_outcome && (
                  <div style={{fontSize:12,marginTop:8,display:'flex',alignItems:'center',gap:6,
                    color: r.final_outcome === 'successful_match' ? '#16a34a' : '#8e8e8e'}}>
                    {r.final_outcome === 'successful_match' ? '💍' : <X size={13} />}
                    {r.final_outcome === 'successful_match' ? 'Successful match' : 'Not proceeding'} · {new Date(r.final_outcome_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}
                  </div>
                )}

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
          {hasMore && !query.trim() && (
            <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// 48-hour decision window — countdown + Positive/Negative buttons, shown on
// a coordination card once a meeting is marked Done (audit 2026-10-08, P0 #10).
function DecisionWindow({ deadline, onDecide }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])
  const msLeft = new Date(deadline).getTime() - now
  const overdue = msLeft <= 0
  const hLeft = Math.floor(Math.abs(msLeft) / (60 * 60 * 1000))
  const mLeft = Math.floor((Math.abs(msLeft) % (60 * 60 * 1000)) / 60000)
  return (
    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: overdue ? '#fef2f2' : '#fffbeb' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: overdue ? '#b91c1c' : '#92400e', marginBottom: 6 }}>
        {overdue ? `Decision overdue · ${hLeft}h ${mLeft}m past deadline` : `Decision Pending · ${hLeft}h ${mLeft}m remaining`}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-black btn-sm" onClick={() => onDecide('interested')}>👍 Positive</button>
        <button className="btn btn-outline btn-sm" onClick={() => onDecide('not_interested')}>👎 Negative</button>
      </div>
    </div>
  )
}

const ROUND_STAGE_LABELS = {
  horoscope_review: 'Horoscope review',
  house_visit: 'House visit',
  final_meeting: 'Final meeting',
  contact_disclosure: 'Contact disclosure',
  successful_match: 'Successful match',
}

// Next-round pipeline card — one step visible at a time, matching
// ROUND_STAGE_LABELS' order. Each stage's own local date draft is kept
// here rather than lifted up, same as scheduleDraft does for the first
// meeting, since it's only needed while that stage is active.
function NextRoundPanel({ request, fromProfile, toProfile, onAdvance, onDiscloseAndComplete, onNotProceeding }) {
  const [dateDraft, setDateDraft] = useState('')
  const stage = request.next_round_stage
  const guna = gunaMilanFor(fromProfile, toProfile)

  return (
    <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: '#f0f7ff' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', marginBottom: 8 }}>
        Next round · {ROUND_STAGE_LABELS[stage]}
      </div>

      {stage === 'horoscope_review' && (
        <>
          {guna ? (
            <div style={{ fontSize: 12, color: '#333', marginBottom: 8 }}>
              Guna Milan: {guna.total}/{guna.max} ({guna.verdict}){guna.doshas.length > 0 && ` · ${guna.doshas.join(', ')}`}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#8e8e8e', marginBottom: 8 }}>
              Horoscope data not available for one or both profiles — can still proceed.
            </div>
          )}
          <button className="btn btn-black btn-sm" onClick={() => onAdvance('house_visit')}>Mark Reviewed → House Visit</button>
        </>
      )}

      {stage === 'house_visit' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="datetime-local" className="form-input" style={{ fontSize: 12, padding: '7px 12px', width: 190 }}
            value={dateDraft} onChange={e => setDateDraft(e.target.value)} />
          <button className="btn btn-black btn-sm"
            onClick={() => onAdvance('final_meeting', { house_visit_at: dateDraft ? new Date(dateDraft).toISOString() : new Date().toISOString() })}>
            Mark Visit Done → Final Meeting
          </button>
        </div>
      )}

      {stage === 'final_meeting' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="datetime-local" className="form-input" style={{ fontSize: 12, padding: '7px 12px', width: 190 }}
            value={dateDraft} onChange={e => setDateDraft(e.target.value)} />
          <button className="btn btn-black btn-sm"
            onClick={() => onAdvance('contact_disclosure', { final_meeting_at: dateDraft ? new Date(dateDraft).toISOString() : new Date().toISOString() })}>
            Mark Meeting Done → Contact Disclosure
          </button>
        </div>
      )}

      {stage === 'contact_disclosure' && (
        <button className="btn btn-black btn-sm" onClick={onDiscloseAndComplete}>
          Disclose Contact & Mark Successful Match
        </button>
      )}

      {stage !== 'successful_match' && (
        <button className="btn btn-outline btn-sm" style={{ marginLeft: 8, color: '#dc2626', borderColor: '#dc2626' }}
          onClick={onNotProceeding}>
          Not Proceeding
        </button>
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
            {path ? <SignedImage path={path} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 13, color: '#8e8e8e' }}>No photo</span>}
          </div>
          <div style={{ fontSize: 12, color: '#8e8e8e', marginTop: 4 }}>{label}</div>
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
  const [showToast, ToastView] = useToast()
  const [profiles, setProfiles] = useState([])
  const [photoByProfile, setPhotoByProfile] = useState({})
  const [loading, setLoading] = useState(true)
  // ===== PAGINATION (scale audit, 2026-10-04) — pehle yeh poori matching
  // list (sab selfie-submitted/requested/ID-uploaded/pending profiles) ek
  // saath load karta tha. Ab Profiles list jaisa "Load More" (30 per page).
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  // Bulk "Request Selfie" for the new-sign-ups section — a busy day can have
  // a dozen new sign-ups needing the exact same one action, same motivation
  // as the Profiles list's bulk Approve/Block (audit 2026-10-08, P2 #15).
  const [selectedReq, setSelectedReq] = useState(new Set())
  const [bulkRequesting, setBulkRequesting] = useState(false)
  const toggleReqSelected = (id) => setSelectedReq(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const buildQuery = (from, to) => supabase
    .from('profiles')
    .select('id, full_name, profile_code, age, city, profile_status, verification_status, id_document_uploaded, is_admin_managed, selfie_path, selfie_requested_at, selfie_submitted_at, client_phone, created_at')
    .neq('verification_status', 'verified')
    .neq('profile_status', 'blocked')
    .or('verification_status.in.(selfie_submitted,selfie_requested),id_document_uploaded.eq.true,and(profile_status.eq.pending,is_admin_managed.eq.false)')
    .order('created_at', { ascending: true })
    .range(from, to)

  const load = async (fromIndex = 0) => {
    if (fromIndex === 0) setLoading(true); else setLoadingMore(true)
    const { data, error } = await buildQuery(fromIndex, fromIndex + PAGE_SIZE - 1)
    if (error) console.error(error.message)
    const newRows = data || []
    setHasMore(newRows.length === PAGE_SIZE)
    if (fromIndex === 0) setProfiles(newRows)
    else setProfiles(prev => [...prev, ...newRows])
    if (newRows.length > 0) {
      const { data: ph } = await supabase.from('photos').select('profile_id, storage_path').in('profile_id', newRows.map(p => p.id)).eq('is_primary', true)
      const map = {}
      ;(ph || []).forEach(x => { map[x.profile_id] = x.storage_path })
      setPhotoByProfile(prev => ({ ...prev, ...map }))
    }
    setLoading(false); setLoadingMore(false)
  }
  const loadMore = () => { if (!hasMore || loadingMore) return; load(profiles.length) }

  useEffect(() => { load(0) }, [])

  // Same shared function as the Profiles list's verification buttons.
  // Optimistic local update instead of a full reload — keeps whatever's
  // already been "Load More"-d in place rather than snapping back to page 1.
  const act = async (p, status) => {
    const patch = await applyVerificationStatus(staffUser, p, status, showToast)
    if (!patch) return
    if (status === 'verified') setProfiles(prev => prev.filter(x => x.id !== p.id)) // done — leaves the queue
    else setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, ...patch } : x))
  }

  const bulkRequestSelfies = async (items) => {
    setBulkRequesting(true)
    await Promise.all(items.filter(p => selectedReq.has(p.id)).map(p => act(p, 'selfie_requested')))
    setSelectedReq(new Set())
    setBulkRequesting(false)
  }

  const sections = [
    { key: 'review', title: 'Selfie received — compare & verify', items: profiles.filter(p => p.verification_status === 'selfie_submitted' || (p.id_document_uploaded && p.verification_status !== 'selfie_requested')) },
    { key: 'request', title: 'New sign-ups — request a selfie', items: profiles.filter(p => !p.is_admin_managed && ['not_started', 'rejected'].includes(p.verification_status || 'not_started') && !p.id_document_uploaded) },
    { key: 'waiting', title: 'Waiting for the user\'s selfie', items: profiles.filter(p => p.verification_status === 'selfie_requested') },
  ]

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <ToastView />
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} />
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Verification Queue</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>Self-signup profiles go live only after their selfie is matched with their photo and verified</div>

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : profiles.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Nothing waiting on verification right now.</div>
      ) : sections.filter(sec => sec.items.length > 0).map(sec => (
        <div key={sec.key} style={{marginBottom:24}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:600,color:'#8e8e8e'}}>{sec.title} ({sec.items.length})</div>
            {sec.key === 'request' && selectedReq.size > 0 && (
              <button className="btn btn-black btn-sm" disabled={bulkRequesting} onClick={()=>bulkRequestSelfies(sec.items)}>
                {bulkRequesting ? 'Requesting...' : `Request Selfie (${selectedReq.size})`}
              </button>
            )}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {sec.items.map(p => (
              <div key={p.id} className="list-row">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    {sec.key === 'request' && (
                      <input type="checkbox" checked={selectedReq.has(p.id)} onChange={()=>toggleReqSelected(p.id)}
                        title="Select for bulk Request Selfie" style={{width:18,height:18,flexShrink:0}} />
                    )}
                    <div>
                      <div style={{fontSize:14,fontWeight:600}}>{p.full_name}</div>
                      <div style={{fontSize:12,color:'#8e8e8e'}}>{p.age}y · {p.city} · {p.profile_code}</div>
                    </div>
                  </div>
                  <div className="badge" style={{fontSize:12, background:'#eff6ff', color:'#2563eb'}}>
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
                  {sec.key === 'waiting' && (
                    <WhatsAppReminderButton profile={p} eventType="selfie_requested" staffUserId={staffUser.user_id} label="Remind on WhatsApp" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {hasMore && (
        <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  )
}

// ===== REPORTS QUEUE — profile_reports table already existed in the DB
// (client "Report" flow writes to it) par admin side koi review UI nahi tha.
function ReportsQueueView({ staffUser, onBack }) {
  const [showToast, ToastView] = useToast()
  const [reports, setReports] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  // ===== PAGINATION (scale audit, 2026-10-04) — pehle yeh har pending
  // report ek saath load karta tha. Ab Profiles list jaisa "Load More".
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  const load = async (fromIndex = 0) => {
    if (fromIndex === 0) setLoading(true); else setLoadingMore(true)
    const { data, error } = await supabase
      .from('profile_reports')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .range(fromIndex, fromIndex + PAGE_SIZE - 1)
    if (error) { console.error(error.message); setLoading(false); setLoadingMore(false); return }
    const newRows = data || []
    setHasMore(newRows.length === PAGE_SIZE)
    if (fromIndex === 0) setReports(newRows)
    else setReports(prev => [...prev, ...newRows])
    const ids = [...new Set(newRows.flatMap(r => [r.reporter_profile_id, r.reported_profile_id]))]
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, profile_code, profile_status').in('id', ids)
      const map = {}
      ;(profs || []).forEach(p => { map[p.id] = p })
      setProfilesById(prev => ({ ...prev, ...map }))
    }
    setLoading(false); setLoadingMore(false)
  }
  const loadMore = () => { if (!hasMore || loadingMore) return; load(reports.length) }

  useEffect(() => { load(0) }, [])

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
      if (!(await applyProfileStatus(staffUser, [reportedProfileId], 'blocked', { via: 'report', report_id: id }, showToast))) return
    }
    const { error } = await supabase.from('profile_reports').update({
      status, resolved_at: new Date().toISOString(), resolved_by: staffUser.user_id,
    }).eq('id', id)
    if (error) { showToast(error.message); return }
    // Report resolve/dismiss khud kabhi audit log nahi likhta tha (sirf
    // "also block" ka block action likhta tha) — Aryan ka audit gap #12.
    // entity_id = reported profile (audit_logs.entity_type abhi hamesha
    // 'profile' hai), report id metadata mein.
    await writeAuditLog(staffUser, 'report_resolved', reportedProfileId, { status, report_id: id })
    // Resolved/dismissed reports leave this (pending-only) queue — drop it
    // locally instead of a full reload, so any already-"Load More"-d rows
    // further down the list stay in place.
    setReports(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <ToastView />
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
                <div style={{fontSize:12,color:'#bbb',marginTop:4}}>{new Date(r.created_at).toLocaleDateString('en-IN')}</div>
                <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
                  <button className="btn btn-outline btn-sm" style={{color:'#dc2626',borderColor:'#dc2626'}}
                    onClick={()=>resolve(r.id, 'resolved', r.reported_profile_id, true)}><ShieldX size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Block Reported Profile</button>
                  <button className="btn btn-outline btn-sm"
                    onClick={()=>resolve(r.id, 'dismissed', r.reported_profile_id, false)}>Dismiss</button>
                </div>
              </div>
            )
          })}
          {hasMore && !query.trim() && (
            <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Follow-ups grouped as Overdue / Today / Upcoming instead of one flat list
// with just an inline "Overdue" flag (audit 2026-10-08, P1 #11 re-scope —
// the flat list made it easy to miss that most of what was showing wasn't
// actually due yet once "Upcoming" started being fetched at all).
function FollowUpsSection({ items, onOpenProfile }) {
  const now = new Date()
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999)
  const groups = { overdue: [], today: [], upcoming: [] }
  items.forEach(n => {
    const d = new Date(n.follow_up_at)
    if (d < startOfToday) groups.overdue.push(n)
    else if (d <= endOfToday) groups.today.push(n)
    else groups.upcoming.push(n)
  })

  const renderFollowUp = (n, isOverdue) => (
    <div key={n.id} className="list-row clickable" onClick={() => n.profiles && onOpenProfile(n.profiles)}
      style={isOverdue ? { borderColor: '#dc2626', background: '#fef2f2' } : {}}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          {n.profiles?.full_name || 'Profile'}
          {isOverdue && <span className="badge" style={{ fontSize: 11, background: '#dc2626', color: '#fff' }}>Overdue</span>}
        </div>
        <ContactButtons phone={n.profiles?.client_phone} logProfile={n.profiles} />
      </div>
      <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{n.note}</div>
      <div style={{ fontSize: 12, color: isOverdue ? '#dc2626' : '#bbb', marginTop: 4, fontWeight: isOverdue ? 600 : 400 }}>
        {isOverdue ? 'Overdue since' : 'Due'} {new Date(n.follow_up_at).toLocaleDateString('en-IN')}
      </div>
    </div>
  )
  const groupLabel = (text) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#8e8e8e', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '4px 0' }}>{text}</div>
  )

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#8e8e8e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        <Clock size={14} /> Follow-ups {items.length > 0 && `(${items.length})`}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: '#bbb' }}>Nothing due.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groups.overdue.length > 0 && <>{groupLabel('Overdue')}{groups.overdue.map(n => renderFollowUp(n, true))}</>}
          {groups.today.length > 0 && <>{groupLabel('Today')}{groups.today.map(n => renderFollowUp(n, false))}</>}
          {groups.upcoming.length > 0 && <>{groupLabel('Upcoming')}{groups.upcoming.map(n => renderFollowUp(n, false))}</>}
        </div>
      )}
    </div>
  )
}

// ===== MY QUEUE — "what needs me today" view (Shaadi/SmartMatchApp RM
// dashboard pattern), existing tables se compute, koi naya data model nahi.
function MyQueueView({ staffUser, onBack, onOpenProfile, onManageCoordination, onOpenShareLinks }) {
  const [loading, setLoading] = useState(true)
  const [overdueFollowUps, setOverdueFollowUps] = useState([])
  const [assignedPending, setAssignedPending] = useState([])
  const [newSubmissions, setNewSubmissions] = useState([])
  const [upcomingMeetings, setUpcomingMeetings] = useState([])
  const [meetingsTotal, setMeetingsTotal] = useState(0) // true count in the 7-day window — the list itself is capped at 20 (scale audit #7)
  const [pendingCoordination, setPendingCoordination] = useState([])
  // Share-link clients (no login) who tapped "👍 Interested" and admin
  // hasn't acted on yet — audit gap, 2026-10-05: this signal didn't exist
  // before, and there was no way to tell which client a link was even for.
  const [shareInterest, setShareInterest] = useState([])
  // Admin-only: how much pending work each staff member is carrying, so a
  // bulk burst of new profiles/requests can be spread out instead of
  // landing on whoever happens to click first (scale audit #8).
  const [staffWorkload, setStaffWorkload] = useState(null) // null = not loaded / not admin

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const nowIso = new Date().toISOString()
    const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString()
    const weekFromNow = new Date(Date.now() + 7*24*60*60*1000).toISOString()
    const [followUpsRes, assignedRes, newRes, meetingsRes, meetingsCountRes, pendingCoordRes, shareInterestRes] = await Promise.all([
      // Was lte(nowIso) only — upcoming follow-ups (due later this week)
      // never got fetched at all, so there was nothing to group into an
      // "Upcoming" section (audit 2026-10-08, P1 #11 re-scope).
      supabase.from('profile_notes').select('*, profiles(id, full_name, profile_code, client_phone)').lte('follow_up_at', weekFromNow).order('follow_up_at', { ascending: true }).limit(20),
      supabase.from('profiles').select('id, full_name, profile_code, age, city, profile_status, client_phone').eq('managed_by_staff_id', staffUser.user_id).eq('profile_status', 'pending').limit(20),
      supabase.from('profiles').select('id, full_name, profile_code, age, city, created_at, client_phone').eq('profile_status', 'pending').gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(20),
      // Scheduled calls/meetings (introductions.scheduled_at) due in the next 7 days, soonest first
      supabase.from('introductions').select('*').gte('scheduled_at', nowIso).lte('scheduled_at', weekFromNow).order('scheduled_at', { ascending: true }).limit(20),
      // Same window, just the count — so a burst of >20 meetings shows "+N more" instead of silently hiding them (scale audit #7)
      supabase.from('introductions').select('*', { count: 'exact', head: true }).gte('scheduled_at', nowIso).lte('scheduled_at', weekFromNow),
      // Coordination requests awaiting the receiver's accept/decline — previously
      // invisible to admin anywhere. Folded in here per Aryan's ask (2026-10-03).
      supabase.from('introductions').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
      // Share-link clients who tapped "👍 Interested" — audit gap, 2026-10-05.
      supabase.from('share_links').select('*').not('interested_at', 'is', null).is('interest_acknowledged_at', null).order('interested_at', { ascending: false }).limit(20),
    ])
    setOverdueFollowUps(followUpsRes.data || [])
    setAssignedPending(assignedRes.data || [])
    setNewSubmissions(newRes.data || [])
    setMeetingsTotal(meetingsCountRes.count || 0)

    const meetings = meetingsRes.data || []
    const pendingReqs = pendingCoordRes.data || []
    const shareInterestRows = shareInterestRes.data || []
    const ids = [...new Set([...meetings, ...pendingReqs].flatMap(m => [m.from_profile, m.to_profile]).concat(shareInterestRows.flatMap(s => [s.profile_id, s.client_profile_id])).filter(Boolean))]
    let profilesById = {}
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, profile_code, client_phone').in('id', ids)
      ;(profs || []).forEach(p => { profilesById[p.id] = p })
    }
    setUpcomingMeetings(meetings.map(m => ({ ...m, fromProfile: profilesById[m.from_profile], toProfile: profilesById[m.to_profile] })))
    setPendingCoordination(pendingReqs.map(m => ({ ...m, fromProfile: profilesById[m.from_profile], toProfile: profilesById[m.to_profile] })))
    setShareInterest(shareInterestRows.map(s => ({ ...s, shownProfile: profilesById[s.profile_id], clientProfile: s.client_profile_id ? profilesById[s.client_profile_id] : null })))

    // Team workload — admin-only (list_staff_with_email RPC is admin-gated).
    // Small number of staff, so one count query per staff member is fine
    // (this never scales with the number of profiles, only staff headcount).
    if (staffUser.role === 'admin') {
      const { data: staffList, error: staffErr } = await supabase.rpc('list_staff_with_email')
      if (!staffErr && staffList) {
        const activeStaff = staffList.filter(s => s.active)
        const counts = await Promise.all(activeStaff.map(s =>
          supabase.from('profiles').select('*', { count: 'exact', head: true })
            .eq('managed_by_staff_id', s.user_id).eq('profile_status', 'pending')
        ))
        setStaffWorkload(activeStaff.map((s, i) => ({ ...s, pendingCount: counts[i].count || 0 })).sort((a, b) => b.pendingCount - a.pendingCount))
      } else {
        setStaffWorkload([])
      }
    }
    setLoading(false)
  }

  const handleAcknowledgeShareInterest = async (linkId) => {
    try {
      await acknowledgeShareLinkInterest(linkId)
      setShareInterest(prev => prev.filter(s => s.id !== linkId))
    } catch (err) {
      console.error(err.message)
    }
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
      {hint && <div style={{ fontSize: 13, color: '#bbb', marginTop: -6, marginBottom: 8 }}>{hint}</div>}
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
          <Section icon={ThumbsUp} title="Clients interested in shared matches" items={shareInterest}
            empty="No unread interest from share links right now."
            renderItem={s => (
              <div key={s.id} className="list-row" style={{borderColor:'#16a34a',background:'#f0fdf4'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                  <div style={{fontSize:13,fontWeight:600}}>
                    {s.shownProfile?.full_name || 'Profile'}
                    {s.clientProfile && <span style={{fontWeight:400,color:'#8e8e8e'}}> · for {s.clientProfile.full_name}</span>}
                  </div>
                  {onOpenShareLinks && (
                    <button className="btn btn-outline btn-sm" style={{padding:'6px 12px',fontSize:13}}
                      onClick={onOpenShareLinks}>Open</button>
                  )}
                </div>
                <div style={{fontSize:12,color:'#16a34a',marginTop:2}}>
                  Interested {new Date(s.interested_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}
                </div>
                <div style={{display:'flex',gap:8,marginTop:8}}>
                  {s.clientProfile?.client_phone && (
                    <ContactButtons phone={s.clientProfile.client_phone} logProfile={s.clientProfile} />
                  )}
                  <button className="btn btn-outline btn-sm" onClick={()=>handleAcknowledgeShareInterest(s.id)}>Mark as noted</button>
                </div>
              </div>
            )} />
          <Section icon={Handshake} title="Coordination requests awaiting response" items={pendingCoordination}
            empty="Nothing waiting on a member right now."
            renderItem={r => (
              <div key={r.id} className="list-row">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                  <div style={{fontSize:13,fontWeight:600}}>
                    {r.fromProfile?.full_name || 'Unknown'} → {r.toProfile?.full_name || 'Unknown'}
                    <span style={{fontWeight:400,color:'#8e8e8e',textTransform:'capitalize'}}> · {r.request_type === 'meeting' ? 'Meeting' : 'Talk'} request</span>
                  </div>
                  {onManageCoordination && (
                    <button className="btn btn-outline btn-sm" style={{padding:'6px 12px',fontSize:13}}
                      onClick={()=>onManageCoordination(r.id)}>Manage</button>
                  )}
                </div>
                <div style={{fontSize:12,color:'#bbb',marginTop:2}}>Sent {new Date(r.created_at).toLocaleDateString('en-IN')} · waiting on {r.toProfile?.full_name || 'receiver'} to accept</div>
                <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:8}}>
                  {[r.fromProfile, r.toProfile].filter(Boolean).map(x => (
                    <div key={x.id}>
                      <div style={{fontSize:13,color:'#8e8e8e',marginBottom:2}}>{x.full_name}</div>
                      <ProfileContact profile={x} logCalls introductionId={r.id} staffUser={staffUser} onSaved={(phone)=>updatePendingContact(x.id, phone)} />
                    </div>
                  ))}
                </div>
              </div>
            )} />
          <Section icon={CalendarClock} title="Calls & meetings (next 7 days)" items={upcomingMeetings} empty="Nothing scheduled."
            hint={meetingsTotal > upcomingMeetings.length ? `Showing the first ${upcomingMeetings.length} — +${meetingsTotal - upcomingMeetings.length} more scheduled this week. Manage from Coordination Requests to see them all.` : null}
            renderItem={m => (
              <div key={m.id} className="list-row" style={isToday(m.scheduled_at) ? { borderColor: '#2563eb' } : {}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>
                      {m.fromProfile?.full_name || 'Unknown'} → {m.toProfile?.full_name || 'Unknown'}
                      <span style={{fontWeight:400,color:'#8e8e8e',textTransform:'capitalize'}}> · {m.request_type === 'meeting' ? 'Meeting' : 'Talk'}</span>
                    </div>
                    <div style={{fontSize:13,color: isToday(m.scheduled_at) ? '#2563eb' : '#8e8e8e',marginTop:2,fontWeight: isToday(m.scheduled_at) ? 600 : 400}}>
                      {isToday(m.scheduled_at) ? 'Today' : new Date(m.scheduled_at).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' })}
                      {' · '}{new Date(m.scheduled_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}
                    </div>
                    {m.location && (
                      <div style={{fontSize:12,color:'#8e8e8e',marginTop:2,display:'flex',alignItems:'center',gap:4}}>
                        <MapPin size={11} /> {m.location}
                      </div>
                    )}
                  </div>
                  {onManageCoordination && (
                    <button className="btn btn-outline btn-sm" style={{padding:'6px 12px',fontSize:13}}
                      onClick={()=>onManageCoordination(m.id)}>Manage</button>
                  )}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:8}}>
                  {[m.fromProfile, m.toProfile].filter(x=>x?.client_phone).map(x => (
                    <div key={x.id} style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}>
                      <span style={{color:'#8e8e8e',minWidth:90}}>{x.full_name}</span>
                      <ContactButtons phone={x.client_phone} logProfile={x} introductionId={m.id} />
                    </div>
                  ))}
                </div>
              </div>
            )} />
          <FollowUpsSection items={overdueFollowUps} onOpenProfile={onOpenProfile} />
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
          {/* Team workload — admin-only. Who's carrying how much pending
              work, so a bulk burst of new profiles/requests can be spread
              around instead of landing on whoever clicks first (scale audit #8). */}
          {staffWorkload !== null && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#8e8e8e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                <UserCog size={14} /> Team workload
              </div>
              {staffWorkload.length === 0 ? (
                <div style={{ fontSize: 12, color: '#bbb' }}>No active staff found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {staffWorkload.map(s => (
                    <div key={s.user_id} className="list-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.email}</div>
                        <div style={{ fontSize: 13, color: '#8e8e8e', textTransform: 'capitalize' }}>{s.role.replace('_', ' ')}</div>
                      </div>
                      <div className="badge" style={{ fontSize: 13, background: s.pendingCount > 0 ? '#fff8e1' : '#f0fdf4', color: s.pendingCount > 0 ? '#b45309' : '#16a34a' }}>
                        {s.pendingCount} pending
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
  const [showToast, ToastView] = useToast()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('relationship_manager')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // RM performance — business-owner audit (2026-10-04). null = not loaded yet.
  const [perfByStaff, setPerfByStaff] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await supabase.rpc('list_staff_with_email')
    if (!err) setStaff(data || [])
    setLoading(false)
    loadPerformance(data || [])
  }

  // Derived from existing tables only (profile_notes, introductions,
  // profiles.managed_by_staff_id) — no new heavy tracking system.
  const loadPerformance = async (staffList) => {
    if (!staffList.length) { setPerfByStaff({}); return }
    const [notesRes, introRes, managedRes] = await Promise.all([
      supabase.from('profile_notes').select('staff_user_id, introduction_id, created_at').not('staff_user_id', 'is', null),
      supabase.from('introductions').select('id, from_profile, to_profile, status, created_at'),
      supabase.from('profiles').select('id, managed_by_staff_id').not('managed_by_staff_id', 'is', null),
    ])
    const rows = computeRmPerformance(staffList, {
      profileNotes: notesRes.data || [],
      introductions: introRes.data || [],
      managedProfiles: managedRes.data || [],
    })
    setPerfByStaff(Object.fromEntries(rows.map(r => [r.user_id, r])))
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
    if (err) { showToast(err.message); return }
    load()
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px' }}>
      <ToastView />
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to Account</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Manage Staff</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>Add admins and relationship managers, or deactivate access.</div>

      <div className="list-row" style={{ marginBottom: 20 }}>
        <div style={{fontSize:12,fontWeight:600,marginBottom:10}}>Add staff</div>
        <div style={{fontSize:13,color:'#8e8e8e',marginBottom:10}}>
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
          {staff.map(s => {
            const perf = perfByStaff?.[s.user_id]
            return (
            <div key={s.id} className="list-row">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600}}>{s.email}</div>
                  <div style={{fontSize:13,color:'#8e8e8e',textTransform:'capitalize'}}>{s.role.replace('_',' ')} · {s.active ? 'Active' : 'Deactivated'}</div>
                </div>
                <button className="btn btn-outline btn-sm"
                  style={s.active ? { color:'#dc2626', borderColor:'#dc2626' } : {}}
                  disabled={s.user_id === staffUser.user_id}
                  title={s.user_id === staffUser.user_id ? 'You cannot deactivate your own account' : ''}
                  onClick={()=>toggleActive(s)}>
                  {s.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
              {/* RM performance — derived from profile_notes/introductions/
                  managed_by_staff_id, no new tracking table (audit 2026-10-04) */}
              {perfByStaff === null ? (
                <div style={{fontSize:12,color:'#bbb',marginTop:8}}>Loading performance…</div>
              ) : perf && (
                <div style={{display:'flex',gap:14,flexWrap:'wrap',marginTop:10,paddingTop:10,borderTop:'1px solid #ededed',fontSize:12}}>
                  <div><TrendingUp size={12} style={{verticalAlign:'-2px',marginRight:3}} color="#8e8e8e" />
                    <span style={{fontWeight:600}}>{perf.followUps30d}</span> <span style={{color:'#8e8e8e'}}>follow-ups (30d)</span></div>
                  <div><span style={{fontWeight:600}}>{perf.matchesClosed}</span> <span style={{color:'#8e8e8e'}}>matches closed</span></div>
                  <div><span style={{fontWeight:600}}>{perf.avgResponseHours == null ? '—' : perf.avgResponseHours < 1 ? '<1h' : Math.round(perf.avgResponseHours) + 'h'}</span> <span style={{color:'#8e8e8e'}}>avg first response</span></div>
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ===== WHATSAPP TEMPLATES - business-owner audit (2026-10-04). Reusable,
// admin-editable short messages for the one-tap WhatsApp reminder flow
// (WhatsAppReminderButton) so staff don't retype the same "selfie
// request"/"meeting confirm" message every time. Simple variable
// substitution ({{name}}, {{city}}, ...), no templating engine - see
// src/utils/notifications.js. Everyone active can read/use templates;
// only an admin can add/edit/delete (same split as Manage Staff).
function WhatsAppTemplatesView({ staffUser, onBack }) {
  const [showToast, ToastView] = useToast()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState({ category: 'general', name: '', message: '' })
  const [saving, setSaving] = useState(false)
  const isAdmin = staffUser.role === 'admin'

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('whatsapp_templates').select('*').order('category').order('created_at')
    if (error) showToast(error.message)
    setTemplates(data || [])
    setLoading(false)
  }

  const addTemplate = async () => {
    if (!draft.name.trim() || !draft.message.trim()) { showToast('Name and message are required'); return }
    setSaving(true)
    const { data: auth } = await supabase.auth.getUser()
    const { error } = await supabase.from('whatsapp_templates').insert({
      category: draft.category, name: draft.name.trim(), message: draft.message.trim(), created_by: auth?.user?.id,
    })
    setSaving(false)
    if (error) { showToast(error.message); return }
    setDraft({ category: 'general', name: '', message: '' })
    load()
  }

  const deleteTemplate = async (id) => {
    const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id)
    if (error) { showToast(error.message); return }
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px' }}>
      <ToastView />
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>WhatsApp Templates</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>
        Saved messages the WhatsApp reminder button fills in automatically. Use {'{{name}}'}, {'{{otherName}}'}, {'{{when}}'} - filled in from the profile.
      </div>

      {isAdmin && (
        <div className="list-row" style={{ marginBottom: 20 }}>
          <div style={{fontSize:12,fontWeight:600,marginBottom:10}}>Add template</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <select className="form-select" value={draft.category} onChange={e=>setDraft(d=>({ ...d, category: e.target.value }))}>
              {Object.entries(EVENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <input className="form-input" placeholder="Template name (e.g. Selfie follow-up)" value={draft.name}
              onChange={e=>setDraft(d=>({ ...d, name: e.target.value }))} />
            <textarea className="form-input" placeholder="Hi {{name}}, ..." rows={3} value={draft.message}
              onChange={e=>setDraft(d=>({ ...d, message: e.target.value }))} style={{resize:'vertical'}} />
            <button className="btn btn-black btn-sm" disabled={saving} onClick={addTemplate} style={{alignSelf:'flex-start'}}>
              {saving ? 'Adding...' : 'Add template'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : templates.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>No templates yet.</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {templates.map(t => (
            <div key={t.id} className="list-row">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600}}>{t.name}</div>
                  <div style={{fontSize:12,color:'#8e8e8e',marginBottom:6}}>{EVENT_LABELS[t.category] || t.category}</div>
                  <div style={{fontSize:13,color:'#555',background:'#f9f9f9',padding:'8px 10px',borderRadius:8}}>{t.message}</div>
                </div>
                {isAdmin && (
                  <button className="btn btn-outline btn-sm" style={{color:'#dc2626',borderColor:'#dc2626',flexShrink:0}}
                    onClick={()=>deleteTemplate(t.id)}><Trash2 size={13} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
