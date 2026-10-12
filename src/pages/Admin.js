import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
// A few of these were imported but never actually used anywhere in this
// file (UserCheck, UserPlus, Menu, RotateCcw, Tag) — dead icon imports
// left over from earlier edits (audit 2026-10-08, P2 #15 polish sweep).
import {
  Users, Clock, CheckCircle2, ShieldX, ShieldCheck, ShieldAlert, Flag, StickyNote,
  ListChecks, BarChart3, RefreshCw, GitBranch, Copy, CalendarClock, X, LogOut,
  ClipboardList, Handshake, Link2, SlidersHorizontal, Search, Pencil, Crown, Camera,
  UserRound, Plus, Wrench, UserCog, Eye, Phone, Info, MessageCircle, TrendingUp, Trash2,
  ThumbsUp, ThumbsDown, MoreVertical, MapPin, BadgeCheck, ChevronDown, ChevronUp, Building2, Video,
  Share2, UserPlus, Send, ArrowUp, ArrowDown, NotebookPen, Heart, HeartHandshake,
} from 'lucide-react'
import { supabase } from '../supabase'
import SignedImage from '../components/SignedImage'
import { BrandLockup } from '../components/BrandLogo'
import { RELIGIONS, CASTES, MARITAL_STATUSES, EDUCATIONS, LEAD_SOURCE_OPTIONS, parseHeightToInches, formatHeightFromInches,
  PARTNER_HEIGHT_MIN_INCHES, PARTNER_HEIGHT_MAX_INCHES, PARTNER_INCOME_BOUNDS, PARTNER_INCOME_STEPS,
  formatIncomeShort, parseIncomeRangeMidpoint, COMPLEXIONS, EMPLOYMENT_TYPES, MOTHER_TONGUES,
  LIVING_WITH_PARENTS_OPTIONS, PROFESSION_CATEGORIES } from '../constants/profileOptions'
import DualRangeSlider from '../components/DualRangeSlider'
import CheckboxDropdown from '../components/CheckboxDropdown'
import ProfileFilterGroups from '../components/ProfileFilterGroups'
import { applyFiltersToQuery, applySearchToQuery, profileMatchesFilters, profileMatchesSearch, activeFilterKeys,
  filterChips, fieldsForScope, ADMIN_SEARCH_COLUMNS, searchTokens, withDataOptions, OPTION_COLUMNS } from '../utils/profileFilters'
import CreateProfile from './CreateProfile'
import BiodataView from './BiodataView'
import EditPhotos from './EditPhotos'
import { EditProfileForm } from './Dashboard'
import { rankMatches } from '../utils/matching'
import { STATS_COLUMNS, DIMENSIONS, filterProfiles, breakdown, computeFunnel, funnelCounts, computeRmPerformance } from '../utils/adminStats'
import { DonutChart, StackedColumns, FunnelChart, HBarChart, topSlices, GENDER_COLORS } from '../components/AdminCharts'
import { findDuplicateLeads } from '../utils/duplicateLeads'
import { fieldSuggestionLabel, loadApprovedFieldOptions } from '../utils/fieldSuggestions'
import { shareRegion } from '../utils/shareRegion'
import { buildMailtoLink, buildWaChooserLink, buildMaskedShareText, normalizePhone } from '../utils/shareProfile'
import { MEETING_MODES, isVirtualMeeting, locationPlaceholder, meetingLinkHref, looksLikeContactDetail } from '../utils/meetingMode'
import { ContactButtons, ProfileContact, AddNoteButton, CALL_OUTCOME_LABELS, CALL_OUTCOME_COLORS, contactLogPrefix } from '../components/ContactButtons'
import { generateShareLink, generateShareBundle, generateBureauShareLink, acknowledgeBureauReply, nativeShare, revokeShareLink, getMyShareLinks, acknowledgeShareLinkInterest, acknowledgeShareLinkNotInterested, forwardShareLinkInterest, markInterestSent } from '../utils/shareLinks'
import { WhatsAppReminderButton, ReminderSheet } from '../components/WhatsAppReminder'
import NotificationBell from '../components/NotificationBell'
import { EVENT_LABELS } from '../utils/notifications'
import { gunaMilanFor } from '../utils/astrology'
import { useToast } from '../components/ui'
import { SHARED_MATCH_NOTE_PREFIX, parseProfileIds, formatSharedMatchNote, parseSharedMatchNote } from '../utils/sharedMatchLog'

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
const DASH_PROFILE_COLUMNS = 'id, client_phone, client_email, managed_by_staff_id, ' + STATS_COLUMNS

// Breakdown/Funnel ki ek upper-limit — abhi (sau-do sau profiles) iska
// matlab hi nahi padta, par database badhne par poora table ek saath
// load hone se bachata hai (scale audit, 2026-10-04).
const DASH_CAP = 5000

// Supabase returns at most 1000 rows per request, so `.limit(DASH_CAP)`
// alone silently stopped at 1000 (audit 2026-10-11). Pages through in
// 1000-row chunks up to DASH_CAP. `build` returns a fresh query each call.
async function fetchAllRows(build, cap = DASH_CAP) {
  const out = []
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await build().range(from, Math.min(from + 999, cap - 1))
    if (error) return { data: out, error }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return { data: out, error: null }
}

// ===== MUTUAL LIKES — "each other liked" ek link pe (Aryan, 2026-10-12:
// "woh toh sabse important cheez hai, kahin dikhta hi nahi, bas My Share
// Links ke andar"). Same reciprocal-row logic ShareLinksView already uses
// per-card (reverseLink/mutualInterest there) — pulled out here so
// Dashboard's "Needs action now" and My Queue can show the same signal
// without re-deriving it. A pair = a share_links row (l) plus its reverse
// "Send interest" row (A shown to B, admin-created once B liked A) pointing
// back at it, both with interested_at set. ONLY the reverse row must be
// non-bundle — l itself is very often one profile out of a bulk-shared
// bundle (audit 2026-10-12: a first cut here wrongly required BOTH sides
// non-bundle and so dropped every mutual-like whose original share was part
// of a bundle cycle, which in practice is most of them — ShareLinksView's
// own `!x.bundle_token` check was always reverse-only). Returns one entry
// per pair; `forwardedAt`/`introId` look at either side, same as the
// "→ Connect for a meeting" button does.
function computeMutualLikes(rows) {
  const seen = new Set()
  const pairs = []
  for (const l of rows) {
    if (seen.has(l.id) || l.revoked || !l.interested_at || !l.client_profile_id) continue
    const reverse = rows.find(x => x.profile_id === l.client_profile_id && x.client_profile_id === l.profile_id
      && !x.revoked && !x.bundle_token && x.interested_at)
    if (!reverse) continue
    seen.add(l.id); seen.add(reverse.id)
    // "Liked each other at" = whichever side's like landed second — that's
    // the moment the pair actually became mutual.
    const [earlier, later] = new Date(l.interested_at) <= new Date(reverse.interested_at) ? [l, reverse] : [reverse, l]
    pairs.push({
      id: earlier.id,
      // forward_share_link_interest requires created_by = the calling
      // admin, and the two sides of a pair aren't always created by the
      // same staff member — altId lets the caller retry on the other row
      // if the first one isn't theirs to forward (audit 2026-10-12).
      altId: later.id,
      profileId: earlier.profile_id,
      clientProfileId: earlier.client_profile_id,
      mutualAt: later.interested_at,
      forwardedAt: earlier.forwarded_at || reverse.forwarded_at,
      introId: earlier.forwarded_introduction_id || reverse.forwarded_introduction_id,
    })
  }
  return pairs
}

const MUTUAL_LIKES_COLUMNS = 'id, profile_id, client_profile_id, interested_at, revoked, bundle_token, forwarded_at, forwarded_introduction_id, created_at'

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
// `trigger` (optional) swaps the ⋮ icon for custom button content — the
// profile card's Share button reuses this same dropdown (2026-10-11).
//
// The dropdown used to be `position: absolute; right: 0` inside its own
// button wrapper, which assumed the button sat at the right edge of the
// screen. On the Profiles list the ⋮ button often sits mid-row instead
// (after Find Match/Share on a wrapped line), so the menu's wide,
// nowrap content opened mostly off the LEFT edge of the phone — Aryan's
// "three dot kholne par screen cut rahi hai" (2026-10-12, screenshots).
// Fixed by measuring the button's actual position and rendering the menu
// through a portal with `position: fixed`, clamped to stay on-screen
// regardless of where the button is or what scrolls/clips around it.
const OVERFLOW_MENU_WIDTH = 220
function OverflowMenu({ items, trigger, title = 'More actions' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = React.useRef(null)
  const menuRef = React.useRef(null)
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const left = Math.min(Math.max(8, r.right - OVERFLOW_MENU_WIDTH), window.innerWidth - OVERFLOW_MENU_WIDTH - 8)
    setPos({ top: r.bottom + 4, left })
  }, [open])
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    // Scroll/resize can move the button out from under a fixed-position
    // menu — simplest correct behaviour is to close it rather than chase
    // a moving target.
    const dismiss = () => setOpen(false)
    document.addEventListener('pointerdown', close)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [open])
  const visible = items.filter(i => !i.hidden)
  if (visible.length === 0) return null
  return (
    <>
      <button ref={btnRef} type="button" className="btn btn-outline btn-sm" style={{ padding: '5px 6px', lineHeight: 1 }}
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }} title={title}>{trigger || <MoreVertical size={14} />}</button>
      {open && pos && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: OVERFLOW_MENU_WIDTH,
          background: '#fff', border: '1px solid #ededed', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          zIndex: 1000, overflow: 'hidden' }}
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
        </div>, document.body
      )}
    </>
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

// Follow-ups had no "done" — a passed follow_up_at stayed overdue forever,
// so the overdue badge only ever grew and My Queue's 20-row list filled up
// with old ones (audit 2026-10-10). Done = clear follow_up_at (no new
// column) and stamp the note so the history still shows it was followed up.
async function completeFollowUp(note, notify = console.error) {
  const stamp = `✓ Follow-up done ${new Date().toLocaleDateString('en-IN')}`
  const patch = { follow_up_at: null, note: note.note ? `${note.note} · ${stamp}` : stamp }
  const { error } = await supabase.from('profile_notes').update(patch).eq('id', note.id)
  if (error) { notify('Could not update: ' + error.message); return null }
  return patch
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
      {/* Called with no args — passing onRefresh straight through handed it
          the click event, and load(fromIndex = 0) in the Verification/
          Reports queues read that event as a page offset, so Refresh did
          nothing there (audit 2026-10-10). */}
      {onRefresh && <RefreshButton onClick={() => onRefresh()} loading={loading} />}
    </div>
  )
}

// Simple client-side search box for the smaller queue lists. Gave it the
// same magnifying-glass icon as the other search bars in the app. Uses the
// same compact sizing as the Profiles-list search box (10px padding) instead
// of the taller default .form-input (13px) — with the icon added, the
// default padding made this look oversized next to the rest of the admin
// panel's search bars (Aryan, 2026-10-11).
function ListSearch({ value, onChange, placeholder }) {
  return (
    <div style={{ position: 'relative', marginBottom: 14 }}>
      <Search size={14} color="#8e8e8e" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 34px', borderRadius: 'var(--radius)',
          border: '1px solid rgba(0,0,0,0.12)', fontSize: 13, outline: 'none', background: '#fafafa',
        }} />
    </div>
  )
}

// Multi-word (2026-10-10, universal search): every word must match some
// field — "ramesh delhi" or a phone typed as "+91 98765 43210" both work.
const matchesSearch = (q, ...fields) => {
  const tokens = searchTokens(q).map(t => t.toLowerCase())
  if (tokens.length === 0) return true
  const hay = fields.filter(f => f != null && f !== '').map(f => {
    const str = String(f).toLowerCase()
    return str + ' ' + str.replace(/\D/g, '')
  }).join(' | ')
  return tokens.every(t => hay.includes(t))
}
// Searchable bits of a profile row for the queue lists.
const profileSearchBits = (p) => p ? [p.full_name, p.profile_code, p.client_phone, p.city, p.client_email] : []

// "now" in the local <input type="datetime-local"> format (no timezone,
// minute precision) — used as `min` so past dates can't be picked (audit
// 2026-10-08, P1 #14).
const nowForDatetimeLocalMin = () => {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// Same tz-offset trick as above, but from a stored ISO timestamp — used to
// prefill the Coordination Requests "Reschedule" field with the meeting's
// current date/time instead of showing it blank (meeting audit, 2026-10-11:
// an already-scheduled meeting looked un-scheduled in the editor, and
// tapping Reschedule without retyping the whole date/time from scratch
// silently left the time unchanged while only saving the location/mode).
const toDatetimeLocalValue = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
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
  const [cardCounts, setCardCounts] = useState({}) // profile_id -> { shares, linkViews, memberViews }
  const [infoOpenFor, setInfoOpenFor] = useState(null) // profile id whose ⓘ "added by / date" detail is open
  const [notifyFor, setNotifyFor] = useState(null) // { profile, eventType } — WhatsApp sheet opened from the card's ⋮ menu
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [stats, setStats] = useState({ total: 0, male: 0, female: 0, newWeek: 0, newToday: 0, pending: 0, active: 0, blocked: 0, needsVerification: 0, openReports: 0, pendingCoordination: 0, overdueFollowUps: 0, pendingShareInterest: 0, pendingShareNotInterested: 0, todayMeetings: 0, pendingBureauReply: 0 })
  const [statsUpdatedAt, setStatsUpdatedAt] = useState(null)
  const [listUpdatedAt, setListUpdatedAt] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  // Dashboard tabs (Aryan, 2026-10-11): Today / Business / Profiles instead
  // of one long page with hidden "Breakdown"/"Funnel" toggles.
  const [dashTab, setDashTabState] = useState(() => { try { return sessionStorage.getItem('adminDashTab') || 'today' } catch { return 'today' } })
  const setDashTab = (t) => { setDashTabState(t); try { sessionStorage.setItem('adminDashTab', t) } catch {} }
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
  const [sharedLogCode, setSharedLogCode] = useState(null) // profile_code pre-filled when Shared Matches is opened from a profile card
  // Photos after creation (audit 2026-10-10): 137 of 141 profiles had no
  // photo and the admin panel only took photos inside Create Client — no
  // way to add or change one later. Reuses the member's own EditPhotos
  // screen (staff RLS already covers photos + storage for any profile).
  const [photosProfile, setPhotosProfile] = useState(null)
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
    ageMin: '', ageMax: '', maritalStatus: [], education: [],
    // Universal filters (Aryan's ask, 2026-10-10: "saari fields se filter
    // kar sakoon") — every other profile field, keyed by column name, from
    // the shared catalog in utils/profileFilters.js.
    extra: {},
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
      if (!merged.extra || typeof merged.extra !== 'object') merged.extra = {}
      return merged
    } catch { return DEFAULT_FILTERS }
  })

  useEffect(() => {
    try { localStorage.setItem('admin_filters_open', showFilters ? '1' : '0') } catch {}
  }, [showFilters])
  // Real values present in the data (imported profiles often use values
  // outside the fixed option lists) — loaded once, only when the filter
  // panel is opened, and only the dropdown columns.
  const [filterOptionRows, setFilterOptionRows] = useState(null)
  useEffect(() => {
    if (!showFilters || filterOptionRows) return
    supabase.from('profiles').select(OPTION_COLUMNS.join(',')).limit(5000)
      .then(({ data, error }) => {
        if (error) console.error('Filter options load failed:', error.message)
        setFilterOptionRows(data || [])
      })
  }, [showFilters, filterOptionRows])
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

  // Saved age birthday ke baad purani ho jaati hai — admin khulte hi ek
  // baar sab ages DOB se refresh (refresh_profile_ages, migration
  // 20261011_workflow_audit_fixes.sql). Fire-and-forget; migration na chali
  // ho to bas chup-chaap skip.
  useEffect(() => {
    supabase.rpc('refresh_profile_ages').then(({ error }) => { if (error) console.warn('refresh_profile_ages:', error.message) })
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

  // Notes bhi sirf tab load karte hain jab profile expand ho. Re-fetched on
  // every expand (not cached once per session) — notes logged from My Queue,
  // Coordination or the call-log sheet otherwise never showed up here until
  // a page reload (audit 2026-10-10).
  useEffect(() => {
    if (!selected) return
    loadNotesFor(selected.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  // Coordination requests involving this profile, lazily on expand (gap #5)
  // — re-fetched each expand for the same reason as notes above.
  useEffect(() => {
    if (!selected) return
    loadCoordFor(selected.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

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
    const endOfToday = new Date(startOfToday.getTime() + 86400000)
    const DAY_MS = 24 * 60 * 60 * 1000
    const nowIso = new Date().toISOString()
    const weekAgo = new Date(Date.now() - 7 * DAY_MS).toISOString()
    const monthAgo = new Date(Date.now() - 30 * DAY_MS).toISOString()
    const threeDaysAgo = new Date(Date.now() - 3 * DAY_MS).toISOString()
    const twoDaysAhead = new Date(Date.now() + 2 * DAY_MS).toISOString()
    const weekAhead = new Date(Date.now() + 7 * DAY_MS).toISOString()
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
      // Share-link clients who tapped "Not Interested" — only unacknowledged ones
      // (audit gap, 2026-10-10: was a permanent badge because nothing cleared it).
      supabase.from('share_links').select('*', { count: 'exact', head: true }).not('not_interested_at', 'is', null).is('not_interest_acknowledged_at', null),
      // Today's scheduled calls/meetings — the single most time-sensitive
      // item on a given day, so it leads the Dashboard's priority section
      // (Aryan's ask, 2026-10-10: priority items should show first).
      // Exclude closed requests (audit gap, 2026-10-10) — todayMeetings count
      // was inflated by meetings whose coordination is already closed.
      supabase.from('introductions').select('*', { count: 'exact', head: true })
        .gte('scheduled_at', startOfToday.toISOString()).lt('scheduled_at', endOfToday.toISOString()).not('status', 'in', '(closed,declined)'),
      // Bureau share replies — a bureau found a match in their own database
      // and hasn't been acknowledged yet (Aryan, 2026-10-11).
      supabase.from('share_links').select('*', { count: 'exact', head: true }).not('bureau_reply', 'is', null).is('bureau_reply_acknowledged_at', null),
      // ===== More daily business signals for the Dashboard (Aryan,
      // 2026-10-11: "jo bhi roz zaroori ho, priority pe, ek hi screen se
      // poora business dikhe"). All plain count queries on existing tables.
      // [16] Follow-ups due later today (overdue ones are counted above)
      supabase.from('profile_notes').select('*', { count: 'exact', head: true }).gte('follow_up_at', startOfToday.toISOString()).lt('follow_up_at', endOfToday.toISOString()),
      // [17] Met, but the 48h Positive/Negative decision window has passed
      supabase.from('introductions').select('*', { count: 'exact', head: true }).eq('status', 'meeting_done').is('decision', null).lt('decision_deadline', nowIso),
      // [18] Requests nobody has answered for 3+ days
      supabase.from('introductions').select('*', { count: 'exact', head: true }).eq('status', 'pending').lt('created_at', threeDaysAgo),
      // [19] Both said yes, but no call/meeting date is set yet
      supabase.from('introductions').select('*', { count: 'exact', head: true }).eq('status', 'accepted').is('scheduled_at', null),
      // [20] Share links expiring in the next 48h with no reply yet — a nudge to the client
      supabase.from('share_links').select('*', { count: 'exact', head: true }).not('revoked', 'is', true).eq('is_bureau_share', false)
        .gt('expires_at', nowIso).lt('expires_at', twoDaysAhead).is('interested_at', null).is('not_interested_at', null),
      // [21] Share links sent this week, [22] how many times they were opened
      supabase.from('share_links').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('share_link_access_log').select('*', { count: 'exact', head: true }).gte('accessed_at', weekAgo),
      // [23] Links sent in 30 days, [24] how many of those got an Interested
      supabase.from('share_links').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo).eq('is_bureau_share', false),
      supabase.from('share_links').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo).eq('is_bureau_share', false).not('interested_at', 'is', null),
      // [25] Successful matches, all time, [26] in the last 30 days
      supabase.from('introductions').select('*', { count: 'exact', head: true }).eq('final_outcome', 'successful_match'),
      supabase.from('introductions').select('*', { count: 'exact', head: true }).eq('final_outcome', 'successful_match').gte('final_outcome_at', monthAgo),
      // [27] Calls/meetings in the next 7 days
      supabase.from('introductions').select('*', { count: 'exact', head: true }).gte('scheduled_at', nowIso).lt('scheduled_at', weekAhead).not('status', 'in', '(closed,declined,meeting_done)'),
      // [28] Matches in progress (accepted / called / met, not closed)
      supabase.from('introductions').select('*', { count: 'exact', head: true }).in('status', ['accepted', 'contacted', 'meeting_done']),
      // [29] New profiles in 30 days
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo),
      // [30] Mutual likes ("each other liked") — not a plain count query
      // since it needs the pair-matching in computeMutualLikes(); every
      // row with an interested_at is cheap enough to pull (audit 2026-10-12).
      fetchAllRows(() => supabase.from('share_links').select(MUTUAL_LIKES_COLUMNS).not('interested_at', 'is', null)),
    ])
    const mutualLikePairs = computeMutualLikes(counts[30].data || [])
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
      pendingShareNotInterested: counts[13].count || 0,
      todayMeetings: counts[14].count || 0,
      pendingBureauReply: counts[15].count || 0,
      followUpsToday: counts[16].count || 0,
      decisionsOverdue: counts[17].count || 0,
      staleCoordination: counts[18].count || 0,
      acceptedUnscheduled: counts[19].count || 0,
      expiringLinks: counts[20].count || 0,
      sharesWeek: counts[21].count || 0,
      linkOpensWeek: counts[22].count || 0,
      sharesMonth: counts[23].count || 0,
      interestedMonth: counts[24].count || 0,
      successTotal: counts[25].count || 0,
      successMonth: counts[26].count || 0,
      meetingsWeek: counts[27].count || 0,
      inProgress: counts[28].count || 0,
      newMonth: counts[29].count || 0,
      // Pending = not yet forwarded (admin still needs to connect them);
      // the total pair count is for the Dashboard card regardless of
      // forward state.
      mutualLikes: mutualLikePairs.filter(p => !p.forwardedAt).length,
      mutualLikesTotal: mutualLikePairs.length,
    })
    // Any failed count used to show up as a silent 0 — say so instead.
    const failed = counts.filter(c => c.error)
    if (failed.length) showToast(`${failed.length} dashboard number${failed.length === 1 ? '' : 's'} could not load: ${failed[0].error.message}`)
    setStatsUpdatedAt(new Date())
    setStatsLoading(false)
  }

  // Poora query builder — DB-level pe filter apply karta hai, client
  // pe nahi. Yehi "scale ke liye sahi" tareeka hai.
  const buildQuery = (from, to) => {
    let q = supabase.from('profiles').select('*').order('created_at', { ascending: false }).range(from, to)

    if (activeTab !== 'all') q = q.eq('profile_status', activeTab)

    if (search) {
      // Universal search (2026-10-10): pehle sirf Profile ID / name / phone
      // dekhta tha. Ab har shabd (word) ~30 text fields mein dhoondha jaata
      // hai — city, caste, gotra, job, employer, college, email, alternate
      // phone, bureau, about me... — aur har word match hona chahiye, to
      // "kushwaha delhi" sirf Delhi ke Kushwaha laata hai. Special
      // characters applySearchToQuery khud hata deta hai.
      q = applySearchToQuery(q, search, ADMIN_SEARCH_COLUMNS)
    }
    if (filters.religion.length > 0) q = q.in('religion', filters.religion)
    if (filters.community.length > 0) q = q.in('community', filters.community)
    if (filters.city) q = q.ilike('city', `%${filters.city}%`)
    if (filters.gender) q = q.eq('gender', filters.gender)
    if (filters.maritalStatus.length > 0) q = q.in('marital_status', filters.maritalStatus)
    if (filters.education.length > 0) q = q.in('education', filters.education)
    if (filters.ageMin) q = q.gte('age', parseInt(filters.ageMin))
    if (filters.ageMax) q = q.lte('age', parseInt(filters.ageMax))
    q = applyFiltersToQuery(q, filters.extra)

    return q
  }

  // Typing fast fires several searches; an older, slower one could land
  // last and overwrite the list with results for stale text (audit
  // 2026-10-11). Only the latest request may write.
  const querySeq = React.useRef(0)
  const runQuery = async (fromIndex) => {
    if (fromIndex === 0) setLoading(true)
    else setLoadingMore(true)

    const seq = ++querySeq.current
    const { data, error } = await buildQuery(fromIndex, fromIndex + PAGE_SIZE - 1)
    if (seq !== querySeq.current) return

    if (error) {
      // Was console-only — the list silently kept showing the previous
      // results as if they matched the new search/filter.
      console.error('Search query failed:', error.message)
      showToast('Search failed: ' + error.message)
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

    await Promise.all([loadPhotosFor(newRows), loadCardCountsFor(newRows)])
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

  // Share + view counts shown on the collapsed profile card (Aryan,
  // 2026-10-11: "share count, phir profile view wala aankh"). Two batched
  // reads per page, staff RLS already allows both tables:
  //   shares = share_links rows created for this profile (link, bureau, bundle)
  //   views  = members who opened it in-app (profile_views) + share-link opens
  const loadCardCountsFor = async (rows) => {
    if (rows.length === 0) return
    const ids = rows.map(r => r.id)
    const codes = rows.map(r => (r.profile_code || '').toUpperCase()).filter(c => /^[A-Z0-9]+$/.test(c))
    const [{ data: links }, { data: visits }, { data: toClient }, { data: notesFor }, { data: notesMention }] = await Promise.all([
      supabase.from('share_links').select('profile_id, client_profile_id, view_count').in('profile_id', ids),
      supabase.from('profile_views').select('profile_id').in('profile_id', ids),
      // Matches sent TO these clients via share links
      supabase.from('share_links').select('client_profile_id, profile_id').in('client_profile_id', ids),
      // Manual "📤 Matches shared:" log entries on these clients
      supabase.from('profile_notes').select('profile_id, note').in('profile_id', ids).like('note', SHARED_MATCH_NOTE_PREFIX + '%'),
      // Manual log entries on OTHER clients that list these profiles' IDs
      codes.length
        ? supabase.from('profile_notes').select('profile_id, note').like('note', SHARED_MATCH_NOTE_PREFIX + '%')
            .or(codes.map(c => `note.ilike.%${c}%`).join(','))
        : Promise.resolve({ data: [] }),
    ])
    // Profile codes for the link-sent profiles, so a match sent both by link
    // and in the manual log only counts once.
    const linkProfileIds = [...new Set((toClient || []).map(l => l.profile_id))]
    const { data: linkProfs } = linkProfileIds.length
      ? await supabase.from('profiles').select('id, profile_code').in('id', linkProfileIds)
      : { data: [] }
    const codeById = Object.fromEntries((linkProfs || []).map(x => [x.id, (x.profile_code || '').toUpperCase()]))
    const idByCode = Object.fromEntries(rows.map(r => [(r.profile_code || '').toUpperCase(), r.id]))

    const sentTo = Object.fromEntries(ids.map(id => [id, new Set()])) // this profile → which clients
    const received = Object.fromEntries(ids.map(id => [id, new Set()])) // which profiles → this client
    ;(links || []).forEach(l => { if (l.client_profile_id) sentTo[l.profile_id].add(l.client_profile_id) })
    ;(notesMention || []).forEach(n => parseSharedMatchNote(n.note).ids.forEach(code => {
      const pid = idByCode[code.toUpperCase()]
      if (pid && pid !== n.profile_id) sentTo[pid].add(n.profile_id)
    }))
    ;(toClient || []).forEach(l => received[l.client_profile_id].add(codeById[l.profile_id] || l.profile_id))
    ;(notesFor || []).forEach(n => parseSharedMatchNote(n.note).ids.forEach(code => received[n.profile_id].add(code.toUpperCase())))

    setCardCounts(prev => {
      const next = { ...prev }
      ids.forEach(id => { next[id] = { shares: 0, linkViews: 0, memberViews: 0, sent: sentTo[id].size, received: received[id].size } })
      ;(links || []).forEach(l => { next[l.profile_id].shares++; next[l.profile_id].linkViews += l.view_count || 0 })
      ;(visits || []).forEach(v => { next[v.profile_id].memberViews++ })
      return next
    })
  }
  const bumpShareCount = (id) => setCardCounts(prev => ({ ...prev, [id]: { ...(prev[id] || { linkViews: 0, memberViews: 0 }), shares: (prev[id]?.shares || 0) + 1 } }))

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
  const dashPanelsOpen = section === 'dashboard' && view === 'list' && dashTab !== 'today'
  useEffect(() => {
    if (!dashPanelsOpen) return
    let cancelled = false
    setDashProfiles(null)
    setDashProfilesCapped(false)
    Promise.all([
      fetchAllRows(() => supabase.from('profiles').select(DASH_PROFILE_COLUMNS).order('created_at', { ascending: false })),
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
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== 'extra' && (Array.isArray(v) ? v.length > 0 : Boolean(v))).length
    + activeFilterKeys(filters.extra).length
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
  }
  const activeFilterChips = [
    ...(search ? [{ key: 'search', label: `"${search}"`, clear: () => { setSearchInput(''); setSearch('') } }] : []),
    ...(activeTab !== 'all' ? [{ key: 'status', label: `Status: ${activeTab}`, clear: () => setActiveTab('all') }] : []),
    ...['religion', 'community', 'maritalStatus', 'education'].flatMap(k => filters[k].map(v => ({
      key: k + ':' + v, label: v,
      clear: () => setFilters(f => ({ ...f, [k]: f[k].filter(x => x !== v) })),
    }))),
    ...Object.entries(filters).filter(([k, v]) => k !== 'extra' && !Array.isArray(v) && v).map(([k, v]) => ({
      key: k, label: FILTER_CHIP_LABELS[k] ? FILTER_CHIP_LABELS[k](v) : String(v),
      clear: () => setFilters(f => ({ ...f, [k]: DEFAULT_FILTERS[k] })),
    })),
    ...filterChips(filters.extra, v => setFilters(f => ({ ...f, extra: v }))),
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

  const markFollowUpDone = async (profileId, n) => {
    const patch = await completeFollowUp(n, showToast)
    if (!patch) return
    setNotesByProfile(prev => ({ ...prev, [profileId]: (prev[profileId] || []).map(x => x.id === n.id ? { ...x, ...patch } : x) }))
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

  // External bureau tag — ProfileContact already writes external_bureau_name
  // to Supabase itself; this just keeps the list/selected row in sync so the
  // "External — <name>" badge updates without a refetch.
  const updateExternalBureau = (id, name) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, external_bureau_name: name } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, external_bureau_name: name }))
  }

  // Bureau's own coordination number — same sync pattern as the bureau name
  // above; ProfileContact already wrote external_bureau_contact itself.
  const updateExternalBureauContact = (id, contact) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, external_bureau_contact: contact } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, external_bureau_contact: contact }))
  }

  // One-tap "Share link" for any profile straight from its card — same
  // generateShareLink the Biodata "Link" button uses. Share sheet khule to
  // wahi; warna (desktop / browser ne block kiya) link copy ho jaata hai.
  const shareProfileLink = async (p) => {
    try {
      const link = await generateShareLink(p.id, staffUser.user_id)
      bumpShareCount(p.id)
      const shared = await nativeShare({ title: 'LOVEKUSH Profile', text: `Profile from LOVEKUSH (${p.profile_code})`, url: link.url })
      if (!shared) {
        await navigator.clipboard?.writeText(link.url)
        showToast('Link copied — paste it in WhatsApp')
      }
    } catch (e) {
      showToast(e.message || 'Could not create link')
    }
  }

  // Share menu on the collapsed card — every share type in one place.
  // Each "new link" option creates a share_links row, so the card's share
  // count goes up by one right away (no refetch).
  const makeShareLink = async (p) => {
    const link = await generateShareLink(p.id, staffUser.user_id)
    bumpShareCount(p.id)
    return link.url
  }
  const copyProfileLink = async (p) => {
    try {
      const url = await makeShareLink(p)
      await navigator.clipboard?.writeText(url)
      showToast('Link copied')
    } catch (e) { showToast(e.message || 'Could not create link') }
  }
  const whatsappProfileLink = async (p) => {
    // Open the tab synchronously (before the await) so mobile browsers
    // don't treat it as a blocked popup, then point it at wa.me.
    const win = window.open('', '_blank')
    try {
      const url = await makeShareLink(p)
      const waUrl = buildWaChooserLink(`Profile from LOVEKUSH (${p.profile_code})\n${url}`)
      if (win) win.location.href = waUrl; else window.location.href = waUrl
    } catch (e) { if (win) win.close(); showToast(e.message || 'Could not create link') }
  }
  const whatsappProfileText = (p) => {
    window.open(buildWaChooserLink(buildMaskedShareText(p)), '_blank')
  }

  // ⋮ menu actions that used to sit inside the expanded card.
  const markExternalBureau = async (p) => {
    const name = window.prompt(p.external_bureau_name
      ? 'Bureau name (leave empty to remove the external tag):'
      : 'Which marriage bureau shared this profile? e.g. "X.MB"', p.external_bureau_name || '')
    if (name === null) return
    const value = name.trim() || null
    const { error } = await supabase.from('profiles').update({ external_bureau_name: value }).eq('id', p.id)
    if (error) { showToast('Could not save: ' + error.message); return }
    updateExternalBureau(p.id, value)
    showToast(value ? `Marked as ${value} profile` : 'External tag removed')
  }
  const editBureauContact = async (p) => {
    const raw = window.prompt(`${p.external_bureau_name}'s WhatsApp/mobile number (leave empty to remove):`, p.external_bureau_contact || '')
    if (raw === null) return
    const value = raw.trim() || null
    if (value && !normalizePhone(value)) { showToast('Enter a valid number (10 digits, or with country code)'); return }
    const { error } = await supabase.from('profiles').update({ external_bureau_contact: value }).eq('id', p.id)
    if (error) { showToast('Could not save: ' + error.message); return }
    updateExternalBureauContact(p.id, value)
    showToast(value ? 'Bureau number saved' : 'Bureau number removed')
  }

  // Downloads a .vcf so the number can be saved straight into the phone's
  // contacts (named with the profile ID, easy to find on WhatsApp later).
  const saveProfileContact = (p) => {
    const phone = p.client_phone || p.external_bureau_contact
    if (!phone) { showToast('No number saved yet for this profile'); return }
    const label = `${p.full_name || 'Client'} (${p.profile_code})${!p.client_phone && p.external_bureau_name ? ' via ' + p.external_bureau_name : ''}`
    const vcf = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${label}`, `TEL;TYPE=CELL:${phone}`, `NOTE:LOVEKUSH ${p.profile_code}`, 'END:VCARD'].join('\r\n')
    const blob = new Blob([vcf], { type: 'text/vcard' })
    const url = URL.createObjectURL(blob)
    // iOS Safari ignores the `download` attribute on a blob URL and silently
    // does nothing on a.click() — Aryan's "button se kuch nahi ho raha"
    // (2026-10-11). Opening the blob URL instead makes iOS show its own
    // "Add to Contacts" card; Android/desktop browsers still download the
    // file since it's served with vcard content-type either way.
    const opened = window.open(url, '_blank')
    if (!opened) {
      const a = document.createElement('a')
      a.href = url
      a.download = `${p.profile_code || 'contact'}.vcf`
      document.body.appendChild(a); a.click(); a.remove()
    }
    showToast(`Contact file ready for ${p.profile_code || label} — check your downloads/share sheet`)
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }

  // Share a client's profile with an EXTERNAL bureau, with a manual note,
  // so they can search their own database for a match (Aryan, 2026-10-11).
  // Opens BureauShareSheet below; same generateShareLink pipeline, just
  // is_bureau_share=true + bureau_note (no contact details either way).
  const [bureauShareFor, setBureauShareFor] = useState(null)

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

    // profiles_public_view mein kuch filterable fields nahi hain
    // (profession, employment type, living with parents, family income,
    // languages...) — isliye Find Matches ke wo filters pehle har match ko
    // hata dete the. Staff ke liye sirf un filter columns ko `profiles` se
    // laake candidates mein jodte hain (masked name/employer/college wahi
    // rehte hain — sirf missing filter fields add hote hain).
    const extraCols = fieldsForScope('matches').map(f => f.key).filter(k => !(candidates || []).some(c => k in c))
    if (extraCols.length > 0 && (candidates || []).length > 0) {
      const ids = candidates.map(c => c.id)
      const chunks = []
      for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
      const extraRows = (await Promise.all(chunks.map(chunk =>
        supabase.from('profiles').select(['id', ...extraCols].join(',')).in('id', chunk)
      ))).flatMap(r => r.data || [])
      const extraById = Object.fromEntries(extraRows.map(r => [r.id, r]))
      candidates.forEach(c => {
        const extra = extraById[c.id]
        if (extra) extraCols.forEach(k => { c[k] = extra[k] })
      })
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

  // Mobile bottom nav stays grouped (Queues/Tools) — five tabs is already a
  // tight fit on a phone-width bar. navItems is unchanged from before.
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
    { id: 'profiles', label: 'Profiles', Icon: Users },
    { id: 'queues', label: 'Queues', Icon: ListChecks, badge: needsAttention },
    { id: 'tools', label: 'Tools', Icon: Wrench },
    { id: 'account', label: 'Account', Icon: UserRound },
  ]

  // Laptop sidebar — expanded, flat list (Aryan's 2026-10-10 ask, reference
  // wireframe: Dashboard/Profiles/Coordination/Meetings/Follow-ups/Shared
  // Links/Reports/Templates/Settings as direct links, not grouped behind
  // "Queues"/"Tools" tiles). Desktop only — rendered by .admin-sidebar,
  // which is display:none below 768px (see App.css), so this doesn't
  // affect the mobile bottom nav above.
  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', Icon: BarChart3, onClick: () => switchSection('dashboard') },
    { id: 'profiles', label: 'Profiles', Icon: Users, onClick: () => switchSection('profiles') },
    { section: 'Work' },
    { id: 'myQueue', label: 'My Queue', Icon: ListChecks, badge: stats.overdueFollowUps, onClick: () => goToSectionView('queues', 'myQueue') },
    { id: 'coordinationRequests', label: 'Coordination', Icon: Handshake, badge: stats.pendingCoordination, onClick: () => goToSectionView('tools', 'coordinationRequests') },
    { id: 'verificationQueue', label: 'Verification', Icon: ShieldAlert, badge: stats.needsVerification, onClick: () => goToSectionView('queues', 'verificationQueue') },
    { id: 'reportsQueue', label: 'Reports', Icon: Flag, badge: stats.openReports, onClick: () => goToSectionView('queues', 'reportsQueue') },
    { id: 'shareLinks', label: 'Share Links', Icon: Link2, badge: (stats.pendingShareInterest || 0) + (stats.pendingShareNotInterested || 0) + (stats.pendingBureauReply || 0), onClick: () => goToSectionView('tools', 'shareLinks') },
    { id: 'sharedMatchLog', label: 'Shared Matches', Icon: ListChecks, onClick: () => goToSectionView('tools', 'sharedMatchLog') },
    { section: 'Tools' },
    { id: 'duplicateLeads', label: 'Duplicate Leads', Icon: Copy, onClick: () => goToSectionView('queues', 'duplicateLeads') },
    { id: 'casteSuggestions', label: 'Field Suggestions', Icon: ClipboardList, onClick: () => goToSectionView('tools', 'casteSuggestions') },
    { id: 'whatsappTemplates', label: 'Templates', Icon: MessageCircle, onClick: () => goToSectionView('tools', 'whatsappTemplates') },
    { section: null },
    { id: 'account', label: 'Account', Icon: UserRound, onClick: () => switchSection('account') },
  ]
  const isSidebarItemActive = (it) => (it.id === 'dashboard' || it.id === 'profiles' || it.id === 'account')
    ? effectiveSection === it.id && view === 'list'
    : view === it.id
  const sectionForView = { verificationQueue:'queues', reportsQueue:'queues', myQueue:'queues', duplicateLeads:'queues', casteSuggestions:'tools', coordinationRequests:'tools', shareLinks:'tools', sharedMatchLog:'tools', createClient:'profiles', editProfile:'profiles', editPhotos:'profiles', fullProfile:'profiles', findMatches:'profiles' }
  const effectiveSection = view === 'list' ? section : (sectionForView[view] || section)
  // One push, no navigate(-1): the async history pop used to land after
  // the new section was set and bounce the admin straight back into the
  // sub-view they were leaving (audit 2026-10-11).
  const switchSection = (s) => setSectionOnly(s)
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

  // My Queue / Duplicate Leads rows only carry a few columns, and their old
  // `setView('list'); setSelected(p)` popped back to whatever screen the
  // queue was opened from (usually Dashboard), so nothing opened (audit
  // 2026-10-10). Fetch the full row and use the same jump as Share Links.
  const openProfileById = async (id) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    if (error || !data) { showToast('Could not open profile' + (error ? ': ' + error.message : '')); return }
    jumpToProfile(data)
  }

  // Tapping a notification in the bell dropdown jumps straight to the
  // exact record it's about where we have one (link_entity_type='profile'),
  // instead of a generic queue (audit gap, 2026-10-08: "do not send the
  // admin to a generic tab when the exact record is known").
  const handleNotifNavigate = async (n) => {
    if (n.type === 'selfie_submitted') { goToSectionView('queues', 'verificationQueue'); return }
    if (n.type === 'report_filed') { goToSectionView('queues', 'reportsQueue'); return }
    if (n.type === 'share_link_interest') { goToSectionView('tools', 'shareLinks'); return }
    if (n.type === 'share_link_not_interested') { goToSectionView('tools', 'shareLinks'); return }
    if (n.type === 'bureau_share_reply') { goToSectionView('tools', 'shareLinks'); return }
    // Coordination request / meeting notifications point at an introduction
    // — tapping them used to do nothing at all (audit 2026-10-10).
    if (n.link_entity_type === 'introduction' && n.link_entity_id) { goToCoordination(n.link_entity_id); return }
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
        <div className="admin-sidebar-brand" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <BrandLockup size={26} />
          {/* Bell moved to its own row so it doesn't crowd the logo. */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <NotificationBell userId={staffUser.user_id} onNavigate={handleNotifNavigate} align="left" />
          </div>
        </div>
        {sidebarItems.map((it, i) => (
          'section' in it ? (
            it.section ? <div key={'s' + i} className="admin-sidebar-section">{it.section}</div> : <div key={'s' + i} className="admin-sidebar-divider" />
          ) : (
            <button key={it.id} className={'admin-sidebar-item' + (isSidebarItemActive(it) ? ' active' : '')}
              onClick={it.onClick}>
              <it.Icon size={18} />
              <span style={{ flex: 1 }}>{it.label}</span>
              {!!it.badge && <span className="chip chip-primary" style={{ marginLeft: 'auto' }}>{it.badge}</span>}
            </button>
          )
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
          <BrandLockup size={28} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <NotificationBell userId={staffUser.user_id} onNavigate={handleNotifNavigate} />
            <span className="chip chip-muted" style={{ textTransform: 'none' }}>{staffUser.role === 'admin' ? 'Admin' : 'RM'}</span>
          </div>
        </nav>

        <div className={'admin-page' + (view === 'findMatches' ? ' admin-page-wide' : '')}>
      {view === 'createClient' && (
        <div>
          <div style={{maxWidth:800,margin:'0 auto',padding:'0 0 12px'}}>
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
        <div className="admin-view" style={{maxWidth:800}}>
          <EditProfileForm
            profile={editingProfile}
            user={{ id: staffUser.user_id }}
            onSave={()=>{ setView('list'); setEditingProfile(null); runQuery(0) }}
            onCancel={()=>{ setView('list'); setEditingProfile(null) }}
          />
        </div>
      )}

      {view === 'editPhotos' && photosProfile && (
        <div style={{maxWidth:800,margin:'0 auto'}}>
          <EditPhotos
            user={{ id: staffUser.user_id }}
            profileId={photosProfile.id}
            onBack={()=>{ setView('list'); loadPhotosFor([photosProfile]); setPhotosProfile(null) }}
          />
        </div>
      )}

      {/* Read-only full profile — reuses the member's own BiodataView (same
          component users see for themselves), so "View" can never
          accidentally change a field the way opening Edit-mode could. */}
      {view === 'fullProfile' && viewingProfile && (
        <div className="admin-view" style={{maxWidth:800}}>
          <BiodataView
            profile={viewingProfile}
            photo={photos[viewingProfile.id] ? { storage_path: photos[viewingProfile.id] } : null}
            onBack={()=>{ setView('list'); setViewingProfile(null) }}
            shareAsUserId={staffUser.user_id}
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
          onOpenProfile={(p)=>openProfileById(p.id)}
          onManageCoordination={goToCoordination}
          onOpenShareLinks={()=>setView('shareLinks')} />
      )}

      {view === 'staffManagement' && (
        <StaffManagementView staffUser={staffUser} onBack={()=>setView('list')} />
      )}

      {view === 'sharedMatchLog' && (
        <SharedMatchLogView key={sharedLogCode || ''} staffUser={staffUser} initialCode={sharedLogCode}
          onBack={()=>{ setView('list'); setSharedLogCode(null) }}
          onOpenProfile={(p)=>{ setSharedLogCode(null); jumpToProfile(p) }} />
      )}

      {view === 'shareContact' && (
        <ShareLinkContactView staffUser={staffUser} onBack={()=>setView('list')} />
      )}

      {view === 'whatsappTemplates' && (
        <WhatsAppTemplatesView staffUser={staffUser} onBack={()=>setView('list')} />
      )}

      {view === 'duplicateLeads' && (
        <DuplicateLeadsView onBack={()=>setView('list')}
          onOpenProfile={(p)=>openProfileById(p.id)} />
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
        {notifyFor && (
          <ReminderSheet profile={notifyFor.profile} eventType={notifyFor.eventType} staffUserId={staffUser.user_id}
            onClose={() => setNotifyFor(null)} />
        )}
        {bureauShareFor && (
          <BureauShareSheet profile={bureauShareFor} staffUserId={staffUser.user_id}
            onClose={() => setBureauShareFor(null)} />
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}>Profiles</div>
          <button className="btn btn-black btn-sm" style={{ padding: '7px 10px' }} onClick={()=>setView('createClient')} title="Create Client">
            <Plus size={16} />
          </button>
        </div>
        <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <Search size={14} color="#8e8e8e" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search"
              title="Har word match hota hai — e.g. 'kushwaha delhi engineer'. Profile ID, name, phone, email, city, state, caste, gotra, profession, employer, college, family, bureau, about me — sab mein dhoondta hai."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              style={{
                width: '100%', minWidth: 0, padding: '10px 14px 10px 34px', borderRadius: 'var(--radius)',
                border: '1px solid rgba(0,0,0,0.12)', fontSize: 13, outline: 'none',
                background: '#fafafa', boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            className={'btn btn-sm ' + (showFilters ? 'btn-black' : 'btn-outline')}
            onClick={() => setShowFilters(!showFilters)}
            style={{ position: 'relative', flex: '0 0 auto', padding: '7px 10px' }}
            title="Filters"
          >
            <SlidersHorizontal size={14} />
            {activeFilterCount > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#dc2626', color: '#fff', borderRadius: 10,
                fontSize: 10, fontWeight: 600, minWidth: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                {activeFilterCount}
              </span>
            )}
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
              <CheckboxDropdown options={withDataOptions(RELIGIONS, filterOptionRows, 'religion')} selected={filters.religion}
                onChange={v=>setFilters(f=>({...f,religion:v}))} placeholder="Any Religion" />
              <CheckboxDropdown options={withDataOptions(CASTES, filterOptionRows, 'community')} selected={filters.community}
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
              <CheckboxDropdown options={withDataOptions(MARITAL_STATUSES, filterOptionRows, 'marital_status')} selected={filters.maritalStatus}
                onChange={v=>setFilters(f=>({...f,maritalStatus:v}))} placeholder="Any Marital Status" />
              <CheckboxDropdown options={withDataOptions(EDUCATIONS, filterOptionRows, 'education')} selected={filters.education}
                onChange={v=>setFilters(f=>({...f,education:v}))} placeholder="Any Education" />
            </div>
            {/* Every other profile field — universal filters (2026-10-10) */}
            <div style={{ fontSize: 12, color: '#8e8e8e', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '16px 0 6px' }}>All profile fields</div>
            <ProfileFilterGroups scope="admin" values={filters.extra} optionRows={filterOptionRows}
              onChange={v => setFilters(f => ({ ...f, extra: v }))}
              exclude={['religion', 'community', 'city', 'marital_status', 'education']} />
            {totalFilterCount > 0 && (
              <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={clearAllSearchFilters}>Clear all</button>
            )}
          </div>
        )}

        </div>
{/* Last-refreshed timestamp removed — visual clutter */}

        {isNarrowed && !loading && (
          <div style={{ fontSize: 12, color: '#8e8e8e', marginBottom: 10 }}>
            {/* Only the loaded page is counted — "+" when Load More has more,
                so 50 never reads as the total (audit 2026-10-10). */}
            {profiles.length}{hasMore ? '+' : ''} result{profiles.length !== 1 ? 's' : ''} found
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
              ? <>No profiles match your search. Try fewer words, a different Profile ID/name/phone/city, or fewer filters.</>
              : 'No profiles in this category'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {profiles.map(p => (
              <div key={p.id} className="list-row clickable admin-profile-row"
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {selectionMode && (
                    <input type="checkbox" checked={selectedIds.has(p.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSelect(p.id)} />
                  )}
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#f0f0f0', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                    <div style={{ fontSize: 12, color: '#8e8e8e' }}>{[p.age && p.age + 'y', p.city, p.religion].filter(Boolean).join(' · ')}</div>
                    {/* Counts moved up beside the name (Aryan, 2026-10-12 —
                        "profile card aur compact"): saves a whole row. Same
                        3 labelled stats as before — Viewed = interest this
                        profile got; Sent/Received = matches out of / into it. */}
                    {!selectionMode && (() => {
                      const c = cardCounts[p.id]
                      const views = c ? c.memberViews + c.linkViews : null
                      return (
                        <div className="admin-card-stats">
                          <span className="admin-cstat" title={c ? `${c.memberViews} member visit${c.memberViews !== 1 ? 's' : ''} · ${c.linkViews} share-link open${c.linkViews !== 1 ? 's' : ''}` : 'Loading…'}>
                            <Eye size={12} /> {c ? views : '–'} viewed
                          </span>
                          <span className="admin-cstat admin-cstat-up" title={c ? `This profile was sent to ${c.sent} client${c.sent !== 1 ? 's' : ''} as a match` : 'Loading…'}>
                            <ArrowUp size={12} /> {c ? c.sent : '–'} sent
                          </span>
                          <span className="admin-cstat admin-cstat-down" title={c ? `${c.received} match${c.received !== 1 ? 'es' : ''} sent to this client` : 'Loading…'}>
                            <ArrowDown size={12} /> {c ? c.received : '–'} received
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                  {/* Ek hi row mein wrap karo — pehle "active" + "✓ Verified" + "Premium"
                      alag-alag lines mein stack hoke card ko lamba bana rahe the. "active"
                      ka matlab hi verified hai (is app ke flow mein), isliye Verified badge
                      ab sirf tab dikhta hai jab status active nahi hai — ek kam badge, kam clutter.
                      Title tooltips har badge par — "yeh color/badge ka matlab kya hai" roz yaad
                      na karna pade (Aryan's audit, 2026-10-04, gap #2). */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 }}>
                      {/* Compact (Aryan, 2026-10-11 — "dot ke form mein"): "active"
                          is the normal state for almost every row, so it's now a
                          small green dot; only pending/blocked keep a word pill. */}
                      {p.profile_status === 'active'
                        ? <span className="status-dot status-dot-active" title="Profile status: active" />
                        : <div className={"badge badge-" + p.profile_status} style={{ fontSize: 12 }} title={'Profile status: ' + p.profile_status}>{p.profile_status}</div>}
                      {p.verification_status === 'selfie_submitted' && <div className="badge" style={{ fontSize: 12, background: '#eff6ff', color: '#2563eb', padding: '3px 7px' }} title="Selfie received — member sent a selfie, needs comparing to their photo"><Camera size={12} /></div>}
                      {SHOW_PREMIUM_TOGGLE && p.is_premium && <div className="badge" style={{ fontSize: 12, background: '#fef3c7', color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 3 }} title="Marked Premium"><Crown size={10} />Premium</div>}
                      {/* Profile sourced from another marriage bureau — contact
                          details are usually missing/withheld (Aryan's ask,
                          2026-10-09). profiles.external_bureau_name set below
                          in the expanded Contact section. */}
                      {p.external_bureau_name && <div className="badge" style={{ fontSize: 12, background: '#fff7ed', color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 3 }} title={p.external_bureau_contact ? `Sourced from ${p.external_bureau_name} — coordinate on ${p.external_bureau_contact}` : `Sourced from ${p.external_bureau_name} — their contact details are typically missing/restricted`}><Building2 size={11} /><span className="hide-narrow">{p.external_bureau_name}</span></div>}
                      {/* Note draft keyed per-profile now (Aryan's audit, 2026-10-05) so it
                          survives switching to another client — this badge just surfaces
                          that an unsaved draft is still sitting here, waiting to be finished. */}
                      {selected?.id !== p.id && (getNoteDraft(p.id).note.trim() || getNoteDraft(p.id).outcome) &&
                        <div className="badge" style={{ fontSize: 12, background: '#fff7ed', color: '#c2410c' }} title="You have an unsaved note draft for this profile">✎</div>}
                    </div>
                    <div style={{ fontSize: 12, color: '#555', fontFamily: 'monospace', fontWeight: 600, background: '#f5f5f5', borderRadius: 6, padding: '1px 6px' }} title="Profile ID">{p.profile_code}</div>
                  </div>
                </div>

                {/* Card action bar — one row, visible without expanding:
                    👁 full view, call (with number) + WhatsApp, then Find
                    Match, Share and ⋮ for the rest. */}
                {!selectionMode && (
                    <div className="admin-card-actions" onClick={e => e.stopPropagation()}
                      onTouchStart={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                      <div className="admin-card-buttons">
                      <button type="button" className="btn btn-outline btn-sm admin-card-btn" title="View full profile"
                        onClick={() => { setViewingProfile(p); setView('fullProfile') }}><Eye size={13} /></button>
                      <ContactButtons phone={p.client_phone || p.external_bureau_contact} showNumber
                        onAction={kind => startContactLog(p, kind)} externalBureauName={p.external_bureau_name} />
                      <span className="admin-card-spacer" />
                      <button type="button" className="btn btn-outline btn-sm admin-card-btn" onClick={() => findMatchesForProfile(p)} title="Find matches for this profile">
                        <Search size={13} /><span className="fm-long">Find Match</span><span className="fm-short">Match</span>
                      </button>
                      <OverflowMenu title="Share" trigger={<span className="admin-card-btn-inner"><Share2 size={13} /><span className="hide-narrow">Share</span></span>} items={[
                        { label: 'Share link', icon: Share2, onClick: () => shareProfileLink(p) },
                        { label: 'Send link on WhatsApp', icon: MessageCircle, onClick: () => whatsappProfileLink(p) },
                        { label: 'Copy link', icon: Copy, onClick: () => copyProfileLink(p) },
                        { label: 'Send details (no link)', icon: Send, onClick: () => whatsappProfileText(p) },
                        { label: 'Share with bureau', icon: Building2, onClick: () => setBureauShareFor(p) },
                      ]} />
                      <OverflowMenu items={[
                        // Frequent first; rarely-used (once per profile) at the bottom
                        { label: 'Shared matches log', icon: ListChecks, onClick: () => { setSharedLogCode(p.profile_code); setView('sharedMatchLog') } },
                        { label: 'Edit profile', icon: Pencil, onClick: () => { setEditingProfile(p); setView('editProfile') } },
                        { label: 'Photos', icon: Camera, onClick: () => { setPhotosProfile(p); setView('editPhotos') } },
                        { label: 'Notify on WhatsApp', icon: MessageCircle, onClick: () => setNotifyFor({ profile: p, eventType: 'profile_approved' }), hidden: p.verification_status !== 'verified' },
                        { label: 'Remind on WhatsApp', icon: MessageCircle, onClick: () => setNotifyFor({ profile: p, eventType: 'selfie_requested' }), hidden: p.verification_status !== 'selfie_requested' },
                        { label: 'Approve', icon: CheckCircle2, onClick: () => updateStatus(p.id, 'active'), hidden: p.profile_status === 'active' },
                        { label: 'Verify', icon: ShieldCheck, color: '#16a34a', onClick: () => setVerificationStatus(p.id, 'verified'), hidden: p.verification_status === 'verified' },
                        { label: 'Request selfie', icon: Camera, onClick: () => setVerificationStatus(p.id, 'selfie_requested'),
                          hidden: p.verification_status === 'verified' || ['selfie_requested', 'selfie_submitted'].includes(p.verification_status) || p.is_admin_managed },
                        { label: 'Reject verification', icon: X, color: '#dc2626', onClick: () => setVerificationStatus(p.id, 'rejected'),
                          hidden: !(p.verification_status === 'selfie_submitted' || (p.id_document_uploaded && p.verification_status !== 'verified' && p.verification_status !== 'rejected')) },
                        { label: 'Save contact', icon: UserPlus, onClick: () => saveProfileContact(p) },
                        { label: p.external_bureau_name ? `Bureau: ${p.external_bureau_name}` : 'Mark as external bureau', icon: Building2, onClick: () => markExternalBureau(p) },
                        { label: p.external_bureau_contact ? 'Bureau contact number' : 'Add bureau contact number', icon: Phone, onClick: () => editBureauContact(p), hidden: !p.external_bureau_name },
                        { label: 'Block', icon: ShieldX, color: '#dc2626', onClick: () => updateStatus(p.id, 'blocked'), hidden: p.profile_status === 'blocked' },
                      ]} />
                      </div>
                    </div>
                )}

                {selected?.id === p.id && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    {/* Profile Details / About / Contact / Verified rows removed
                        (Aryan, 2026-10-11): full info is one tap away on the
                        card's 👁 button, call/WhatsApp + number sit on the
                        card row, and edit/bureau/verify live in ⋮. */}
                    {p.selfie_path && p.verification_status !== 'verified' && (
                      <SelfieCompare selfiePath={p.selfie_path} photoPath={photos[p.id]} />
                    )}

                    {/* Lead source — was write-only (updateLeadSource existed with
                        no control to call it), so a walk-in or an old bulk-imported
                        profile could never be tagged/corrected after creation, and
                        new options like Marriage Bureau could never show up in the
                        Dashboard pie chart (Aryan, 2026-10-12). */}
                    <div className="admin-section-header"><Users size={13} />Lead Source</div>
                    <select className="form-select" style={{ marginBottom: 14, fontSize: 13 }} value={p.lead_source || ''}
                      onClick={e => e.stopPropagation()} onChange={e => updateLeadSource(p.id, e.target.value)}>
                      <option value="">Not set</option>
                      {LEAD_SOURCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>

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
                            {n.follow_up_at && <> · Follow up: {new Date(n.follow_up_at).toLocaleDateString('en-IN')}
                              <button type="button" className="btn btn-outline btn-sm" style={{ padding: '2px 8px', fontSize: 11, marginLeft: 6, color: '#16a34a', borderColor: '#16a34a' }}
                                onClick={() => markFollowUpDone(p.id, n)}>✓ Done</button></>}
                          </div>
                        </div>
                      ))}
                      {/* Outcome was 4 always-visible chip buttons — folded into
                          one dropdown (Aryan, 2026-10-12: too much space for
                          something tapped once per note). */}
                      <div className="admin-tight-controls" style={{ marginTop: 10 }}>
                        <select className="form-select admin-outcome-select" value={getNoteDraft(p.id).outcome}
                          style={getNoteDraft(p.id).outcome ? { background: CALL_OUTCOME_COLORS[getNoteDraft(p.id).outcome].bg,
                            color: CALL_OUTCOME_COLORS[getNoteDraft(p.id).outcome].fg, borderColor: CALL_OUTCOME_COLORS[getNoteDraft(p.id).outcome].fg } : undefined}
                          onChange={e => setNoteDraft(p.id, { outcome: e.target.value })}>
                          <option value="">Call outcome (optional)</option>
                          {Object.entries(CALL_OUTCOME_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
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
                    {/* ⓘ info toggle folded into this header's own row
                        instead of a dedicated line at the bottom with empty
                        space next to it (Aryan, 2026-10-12). */}
                    <div className="admin-section-header" style={{ justifyContent: 'space-between' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Handshake size={13} />Coordination Requests</span>
                      {idMetadata[p.id] && (
                        <button type="button" title="Profile info" aria-expanded={infoOpenFor === p.id} onClick={e => { e.stopPropagation(); setInfoOpenFor(infoOpenFor === p.id ? null : p.id) }}
                          style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: infoOpenFor === p.id ? 'var(--primary)' : '#bbb', display: 'inline-flex', textTransform: 'none' }}>
                          <Info size={13} />
                        </button>
                      )}
                    </div>
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

                    {idMetadata[p.id] && infoOpenFor === p.id && (
                      <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }} onClick={e => e.stopPropagation()}>
                        {new Date(idMetadata[p.id].created_at).toLocaleDateString('en-IN')} · {idMetadata[p.id].source === 'admin-added' ? 'Added by staff' : 'Self-registered'}
                      </div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}>Dashboard</div>
            <div style={{ fontSize: 12, color: '#8e8e8e' }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          </div>
          <button className="btn btn-outline btn-sm" style={{ padding: '6px 10px' }} onClick={loadStats} disabled={statsLoading} title="Refresh stats">
            {statsLoading ? '...' : <RefreshCw size={14} />}
          </button>
        </div>
        <div className="dash-tabs" role="tablist">
          {[
            { key: 'today', label: 'Today', Icon: CalendarClock },
            { key: 'business', label: 'Business', Icon: TrendingUp },
            { key: 'profiles', label: 'Profiles', Icon: BarChart3 },
          ].map(t => (
            <button key={t.key} type="button" role="tab" aria-selected={dashTab === t.key}
              className={'dash-tab' + (dashTab === t.key ? ' active' : '')} onClick={() => setDashTab(t.key)}>
              <t.Icon size={14} />{t.label}
            </button>
          ))}
        </div>
        {dashTab === 'today' && <TodayPanel stats={stats} onOpen={(v) => setView(v)} />}
        {dashTab === 'business' && <BusinessPanel stats={stats} profiles={dashProfiles} capped={dashProfilesCapped} refreshKey={statsUpdatedAt} />}
        {dashTab === 'profiles' && <ProfilesPanel stats={stats} profiles={dashProfiles} capped={dashProfilesCapped} />}
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
          <AdminNavCard icon={ClipboardList} label="Field Suggestions" onClick={()=>setView('casteSuggestions')} />
          <AdminNavCard icon={Handshake} label="Coordination" badge={stats.pendingCoordination} onClick={()=>setView('coordinationRequests')} />
          <AdminNavCard icon={Link2} label="Share Links" badge={(stats.pendingShareInterest || 0) + (stats.pendingShareNotInterested || 0) + (stats.pendingBureauReply || 0)} onClick={()=>setView('shareLinks')} />
          <AdminNavCard icon={ListChecks} label="Shared Matches" onClick={()=>setView('sharedMatchLog')} />
          <AdminNavCard icon={MessageCircle} label="Template Editor" onClick={()=>setView('whatsappTemplates')} />
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
              <div style={{ fontSize: 12, color: 'var(--gray3)' }}>Lovekush Matchmaking Services</div>
            </div>
          </div>
        </div>
        {/* Share-link contact (2026-10-10): rm_name/rm_phone/rm_email shown on
            every share link come from staff_users — any staff member edits
            their own here; admin can also fix another staff member's. */}
        <button className="btn btn-outline btn-sm" style={{ marginBottom: 16, marginRight: 8 }} onClick={() => setView('shareContact')}>
          <Link2 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Share Link Contact
        </button>
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

// ===== DASHBOARD PANELS (Aryan, 2026-10-11): "ek hi dashboard screen se
// poore business ka nichod — kya zaroori hai, kya action lena hai". Three
// tabs instead of one long page: Today (what needs doing, ranked by
// urgency), Business (pipeline + 30-day health), Profiles (charts).
// Counts come from loadStats(); Business/Profiles also use the shared
// dashProfiles fetch.

const TONES = {
  urgent: { bg: '#fef2f2', fg: '#b91c1c' },
  act: { bg: '#fff7ed', fg: '#c2410c' },
  sched: { bg: '#eff6ff', fg: '#1d4ed8' },
  like: { bg: '#fdf2f8', fg: '#C2185B' },
  info: { bg: '#f5f5f4', fg: '#475569' },
  // Same pink as ShareLinksView's "Both profiles liked each other" badge —
  // light tint here to match every other action-list row's fixed dark
  // label text (App.css .ai-label); the row's rank (top of the list) is
  // what signals it's the most important one, per Aryan's ask.
  mutual: { bg: '#fce4ec', fg: '#C2185B' },
}

// Opens My Queue on a specific tab (MyQueueView reads this on mount).
const openQueueTab = (onOpen, tab) => {
  try { sessionStorage.setItem('myQueueTab', tab) } catch {}
  onOpen('myQueue')
}

function TodayPanel({ stats, onOpen }) {
  const q = (tab) => () => openQueueTab(onOpen, tab)
  const go = (view) => () => onOpen(view)
  // Ranked most-urgent first; only rows with something to do are shown.
  const items = [
    // Both sides liked each other on the same share link — Aryan, 2026-10-12:
    // "woh toh sabse important cheez hai", and it was only visible buried
    // inside My Share Links. Leads the list now.
    { key: 'mutualLikes', count: stats.mutualLikes, label: 'Liked each other', hint: 'Both sides liked the same link — connect them for a meeting', icon: HeartHandshake, tone: 'mutual', onClick: q('mutualLikes') },
    { key: 'todayMeetings', count: stats.todayMeetings, label: "Today's calls & meetings", hint: 'Confirm with both sides before the time', icon: CalendarClock, tone: 'sched', onClick: q('meetings') },
    { key: 'decisionsOverdue', count: stats.decisionsOverdue, label: 'Meeting decisions overdue', hint: '48 hours passed, get a Positive or Negative', icon: CheckCircle2, tone: 'urgent', onClick: q('decisions') },
    { key: 'overdueFollowUps', count: stats.overdueFollowUps, label: 'Missed follow-ups', hint: 'Were due before today', icon: Clock, tone: 'urgent', onClick: q('followups') },
    { key: 'pendingShareInterest', count: stats.pendingShareInterest, label: 'Clients interested in a match', hint: 'Tell the other side or set up a call', icon: ThumbsUp, tone: 'like', onClick: q('interested') },
    { key: 'pendingBureauReply', count: stats.pendingBureauReply, label: 'Bureau found a match', hint: 'Read their reply and follow up', icon: Building2, tone: 'sched', onClick: q('bureau') },
    { key: 'followUpsToday', count: stats.followUpsToday, label: 'Follow-ups due today', icon: Clock, tone: 'act', onClick: q('followups') },
    { key: 'acceptedUnscheduled', count: stats.acceptedUnscheduled, label: 'Accepted, no date fixed', hint: 'Schedule the call or meeting', icon: CalendarClock, tone: 'act', onClick: go('coordinationRequests') },
    { key: 'staleCoordination', count: stats.staleCoordination, label: 'No reply for 3+ days', hint: 'Nudge the member who has to accept', icon: Handshake, tone: 'act', onClick: go('coordinationRequests') },
    { key: 'needsVerification', count: stats.needsVerification, label: 'Needs verification', hint: 'Selfie or ID waiting to be checked', icon: ShieldAlert, tone: 'act', onClick: go('verificationQueue') },
    { key: 'openReports', count: stats.openReports, label: 'Open reports', icon: Flag, tone: 'urgent', onClick: go('reportsQueue') },
    { key: 'expiringLinks', count: stats.expiringLinks, label: 'Share links expiring, no reply', hint: 'Expire within 48 hours, remind the client', icon: Link2, tone: 'act', onClick: go('shareLinks') },
    { key: 'pendingCoordination', count: stats.pendingCoordination, label: 'Requests awaiting response', icon: Handshake, tone: 'info', onClick: q('coordination') },
    { key: 'pendingShareNotInterested', count: stats.pendingShareNotInterested, label: 'Said not interested', hint: 'Line up a fresh match for them', icon: ThumbsDown, tone: 'info', onClick: q('notInterested') },
  ].filter(i => i.count > 0)

  const kpi = (val, label, sub) => (
    <div className="kpi"><div className="kpi-val">{val}</div><div className="kpi-label">{label}</div>{sub && <div className="kpi-sub">{sub}</div>}</div>
  )
  const interestRate = stats.sharesMonth ? Math.round((stats.interestedMonth / stats.sharesMonth) * 100) + '%' : '–'

  return (
    <div className="dash-grid">
      <div className="dash-card span-2">
        <div className="dash-card-title"><ListChecks size={15} />Needs action now<span className="muted">{items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : ''}</span></div>
        {items.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#166534', background: '#f0fdf4', borderRadius: 10, padding: '10px 14px' }}>
            <CheckCircle2 size={16} />All caught up, nothing urgent right now.
          </div>
        ) : (
          <div className="action-list">
            {items.map(i => {
              const t = TONES[i.tone]
              return (
                <button key={i.key} type="button" className="action-item" onClick={i.onClick} style={{ background: t.bg }}>
                  <i.icon size={17} color={t.fg} />
                  <span className="ai-label">{i.label}{i.hint && <span className="ai-hint">{i.hint}</span>}</span>
                  <span className="ai-count" style={{ color: t.fg }}>{i.count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="dash-card">
        <div className="dash-card-title"><CalendarClock size={15} />Today</div>
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {kpi(stats.todayMeetings, 'Calls & meetings')}
          {kpi(stats.followUpsToday + stats.overdueFollowUps, 'Follow-ups to do', stats.overdueFollowUps ? `${stats.overdueFollowUps} overdue` : null)}
          {kpi(stats.newToday, 'New sign-ups')}
          {kpi(stats.pending, 'Waiting for approval')}
        </div>
      </div>
      <div className="dash-card">
        <div className="dash-card-title"><TrendingUp size={15} />This week</div>
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {kpi(stats.newWeek, 'New profiles')}
          {kpi(stats.sharesWeek, 'Profiles shared', `${stats.linkOpensWeek} link opens`)}
          {kpi(stats.meetingsWeek, 'Meetings next 7 days')}
          {kpi(interestRate, 'Interest rate', 'Shared → Interested, 30 days')}
        </div>
      </div>
    </div>
  )
}

function BusinessPanel({ stats, profiles, capped, refreshKey }) {
  const [activity, setActivity] = useState(null) // { intros, actions, links, photoIds }

  useEffect(() => {
    let cancelled = false
    setActivity(null)
    Promise.all([
      fetchAllRows(() => supabase.from('introductions').select('from_profile, to_profile, status, decision, final_outcome, created_at')),
      fetchAllRows(() => supabase.from('match_actions').select('actor_profile_id, target_profile_id').in('action', ['like', 'super_like'])),
      fetchAllRows(() => supabase.from('share_links').select('profile_id, client_profile_id, interested_at, created_at')),
      fetchAllRows(() => supabase.from('photos').select('profile_id')),
    ]).then(([i, a, l, ph]) => {
      if (cancelled) return
      const err = [i, a, l, ph].find(r => r.error)
      if (err) console.error('Business panel load:', err.error.message)
      setActivity({ intros: i.data, actions: a.data, links: l.data, photoIds: new Set(ph.data.map(p => p.profile_id)) })
    })
    return () => { cancelled = true }
  }, [refreshKey])

  const loading = profiles === null || activity === null
  const derived = useMemo(() => {
    if (loading) return null
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const active = profiles.filter(p => p.profile_status === 'active')
    // "Idle" = active client who got no share link and no request in 30 days.
    const touched = new Set()
    activity.links.forEach(l => { if (new Date(l.created_at).getTime() >= monthAgo) { touched.add(l.client_profile_id); touched.add(l.profile_id) } })
    activity.intros.forEach(x => { if (new Date(x.created_at).getTime() >= monthAgo) { touched.add(x.from_profile); touched.add(x.to_profile) } })
    const funnel = computeFunnel(funnelCounts(profiles, { intros: activity.intros, actions: activity.actions, shareLinks: activity.links }))
    const joined = breakdown(profiles, 'joined').filter(r => r.label !== 'Not filled').slice(0, 6).reverse()
    const leadRows = breakdown(profiles, 'lead_source').map(r => ({ label: r.label, value: r.total, color: r.label === 'Not filled' ? '#b4b2ab' : undefined }))
    return {
      idle: active.filter(p => !touched.has(p.id)).length,
      noPhoto: active.filter(p => !activity.photoIds.has(p.id)).length,
      noRm: active.filter(p => !p.managed_by_staff_id).length,
      activeCount: active.length,
      dupCount: findDuplicateLeads(profiles).length,
      funnel, joined, leads: topSlices(leadRows, 5),
    }
  }, [loading, profiles, activity])

  const kpi = (val, label, sub, warn) => (
    <div className="kpi" style={warn ? { background: '#fff7ed' } : undefined}>
      <div className="kpi-val" style={warn ? { color: '#c2410c' } : undefined}>{val}</div>
      <div className="kpi-label">{label}</div>{sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
  const interestRate = stats.sharesMonth ? Math.round((stats.interestedMonth / stats.sharesMonth) * 100) + '%' : '–'

  return (
    <div className="dash-grid">
      <div className="dash-card span-2">
        <div className="dash-card-title"><TrendingUp size={15} />Last 30 days</div>
        <div className="kpi-grid">
          {kpi(stats.newMonth, 'New profiles', `${stats.newWeek} this week`)}
          {kpi(stats.sharesMonth, 'Matches shared', `${stats.interestedMonth} got Interested`)}
          {kpi(interestRate, 'Interest rate', 'Interested ÷ shared')}
          {kpi(stats.successMonth, 'Successful matches', `${stats.successTotal} all time`)}
          {kpi(stats.inProgress, 'Matches in progress', 'Accepted, called or met')}
          {kpi(derived ? derived.idle : '…', 'Idle active clients', 'No match sent in 30 days', derived && derived.idle > 0)}
          {kpi(derived ? derived.noPhoto : '…', 'Active without photo', derived ? `of ${derived.activeCount} active` : null, derived && derived.noPhoto > 0)}
          {kpi(derived ? derived.dupCount : '…', 'Possible duplicates', 'See Duplicate Leads', derived && derived.dupCount > 0)}
        </div>
      </div>
      <div className="dash-card">
        <div className="dash-card-title"><GitBranch size={15} />Conversion funnel<span className="muted">profiles at each stage</span></div>
        {loading ? <div style={{ fontSize: 13, color: '#8e8e8e' }}>Loading…</div> : <FunnelChart stages={derived.funnel} />}
        {capped && <div style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>Based on the latest {DASH_CAP.toLocaleString('en-IN')} profiles.</div>}
      </div>
      <div className="dash-card">
        <div className="dash-card-title"><Users size={15} />Where leads come from</div>
        {loading ? <div style={{ fontSize: 13, color: '#8e8e8e' }}>Loading…</div> : <DonutChart data={derived.leads} centerLabel="profiles" />}
        {!loading && derived.noRm > 0 && (
          <div style={{ fontSize: 12, color: '#555', marginTop: 12 }}>{derived.noRm} active profile{derived.noRm === 1 ? ' has' : 's have'} no RM assigned.</div>
        )}
      </div>
      <div className="dash-card span-2">
        <div className="dash-card-title"><BarChart3 size={15} />New profiles by month</div>
        {loading ? <div style={{ fontSize: 13, color: '#8e8e8e' }}>Loading…</div> : (
          <StackedColumns rows={derived.joined.map(r => ({ ...r, label: new Date(r.label + '-01').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) }))} />
        )}
      </div>
    </div>
  )
}

function ProfilesPanel({ stats, profiles, capped }) {
  const loading = profiles === null
  const pie = (dim, n = 5) => topSlices(breakdown(profiles, dim).filter(r => r.label !== 'Not filled').map(r => ({ label: r.label, value: r.total })), n)
  const statusColors = { active: '#1baf7a', pending: '#eda100', blocked: '#e34948' }
  const charts = loading ? null : {
    gender: [
      { label: 'Male', value: stats.male, color: GENDER_COLORS.Male },
      { label: 'Female', value: stats.female, color: GENDER_COLORS.Female },
    ],
    status: breakdown(profiles, 'profile_status').map(r => ({ label: r.label[0].toUpperCase() + r.label.slice(1), value: r.total, color: statusColors[r.label] || '#b4b2ab' })),
    religion: pie('religion'),
    marital: pie('marital_status', 4),
    age: breakdown(profiles, 'age'),
    height: breakdown(profiles, 'height'),
  }
  const card = (title, Icon, body, wide) => (
    <div className={'dash-card' + (wide ? ' span-2' : '')}>
      <div className="dash-card-title"><Icon size={15} />{title}</div>
      {loading ? <div style={{ fontSize: 13, color: '#8e8e8e' }}>Loading…</div> : body()}
    </div>
  )
  return (
    <>
      <div className="admin-stats">
        {[
          { label: 'Total', val: stats.total, bg: '#f5f5f5', fg: '#555' },
          { label: 'Male', val: stats.male, bg: '#eef2ff', fg: '#2a78d6' },
          { label: 'Female', val: stats.female, bg: '#fdf2f8', fg: '#C2185B' },
          { label: 'New 7d', val: stats.newWeek, bg: '#ecfeff', fg: '#0891b2' },
          { label: 'Pending', val: stats.pending, bg: '#fff8e1', fg: '#b45309' },
          { label: 'Active', val: stats.active, bg: '#f0fdf4', fg: '#166534' },
          { label: 'Blocked', val: stats.blocked, bg: '#fef2f2', fg: '#dc2626' },
        ].map(s => (
          <div key={s.label} className="admin-stat" style={{ background: s.bg }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: s.fg }}>{s.val}</div>
            <div style={{ fontSize: 11, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
          </div>
        ))}
      </div>
      {capped && <div style={{ fontSize: 12, color: '#b45309', marginBottom: 10 }}>Charts use the latest {DASH_CAP.toLocaleString('en-IN')} profiles.</div>}
      <div className="dash-grid">
        {card('Gender', Users, () => <DonutChart data={charts.gender} centerLabel="profiles" />)}
        {card('Profile status', ShieldCheck, () => <DonutChart data={charts.status} centerLabel="profiles" />)}
        {card('Age groups', BarChart3, () => <StackedColumns rows={charts.age} />)}
        {card('Height', BarChart3, () => <StackedColumns rows={charts.height} />)}
        {card('Religion', Users, () => <DonutChart data={charts.religion} centerLabel="filled" />)}
        {card('Marital status', Users, () => <DonutChart data={charts.marital} centerLabel="filled" />)}
        <div className="dash-card span-2">
          <BreakdownExplorer profiles={profiles} />
        </div>
      </div>
    </>
  )
}

// Any-dimension explorer (was the whole "Breakdown" panel): pick a field
// and filters, see it as a chart. Ordered buckets (age/height/month) draw
// as columns, everything else as count-sorted bars.
function BreakdownExplorer({ profiles }) {
  const [dim, setDim] = useState('community')
  const [gender, setGender] = useState('')
  const [status, setStatus] = useState('')
  const [joined, setJoined] = useState('all')
  const [showAll, setShowAll] = useState(false)
  if (profiles === null) return <div style={{ fontSize: 13, color: '#8e8e8e' }}>Loading…</div>
  const filtered = filterProfiles(profiles, { gender, status, joined })
  const rows = breakdown(filtered, dim)
  const ordered = Array.isArray(DIMENSIONS[dim].order) || DIMENSIONS[dim].order === 'recent'
  const shown = ordered || showAll ? rows : rows.slice(0, 12)
  return (
    <>
      <div className="dash-card-title"><SlidersHorizontal size={15} />Explore any field<span className="muted">{filtered.length} profile{filtered.length === 1 ? '' : 's'}</span></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <select className="form-select" value={dim} onChange={e => { setDim(e.target.value); setShowAll(false) }} style={{ maxWidth: 220 }}>
          {Object.entries(DIMENSIONS).map(([key, d]) => <option key={key} value={key}>By {d.label}</option>)}
        </select>
        <select className="form-select" value={gender} onChange={e => setGender(e.target.value)} style={{ maxWidth: 140 }}>
          <option value="">All genders</option><option value="Male">Male</option><option value="Female">Female</option>
        </select>
        <select className="form-select" value={status} onChange={e => setStatus(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="blocked">Blocked</option>
        </select>
        <select className="form-select" value={joined} onChange={e => setJoined(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="all">Joined: any time</option>
          <option value="today">Joined: today</option>
          <option value="7d">Joined: last 7 days</option>
          <option value="30d">Joined: last 30 days</option>
          <option value="90d">Joined: last 90 days</option>
        </select>
      </div>
      {rows.length === 0 ? <div style={{ fontSize: 13, color: '#8e8e8e' }}>No profiles match these filters.</div>
        : ordered ? <StackedColumns rows={dim === 'joined' ? [...shown].reverse() : shown} /> : <HBarChart rows={shown} />}
      {!ordered && rows.length > 12 && (
        <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Show top 12' : `Show all ${rows.length}`}
        </button>
      )}
    </>
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

// ===== DUPLICATE LEADS — same client_phone/client_email par do profiles ban
// jaayein (galti se do baar register, ya admin ne dobara bana diya) to
// yahan dikh jaate hain. Existing profiles.client_phone/client_email se hi
// — koi naya table nahi. Blocking nahi karte, sirf flag karte hain taaki
// Aryan decide kare (merge/ek ko block/jaane do).
function DuplicateLeadsView({ onBack, onOpenProfile }) {
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState([])
  const [query, setQuery] = useState('')
  const [loadError, setLoadError] = useState('')
  const visibleGroups = groups.filter(g => matchesSearch(query, g.value, ...g.profiles.flatMap(profileSearchBits)))

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    // Server-side duplicate detection (find_duplicate_leads RPC, migration
    // 20261004) — only profiles that actually share a phone/email come
    // back, instead of the whole profiles table (scale audit, 2026-10-04).
    // An RPC error used to fall through to "No duplicates found 🎉" — that's
    // how the RPC never having been applied live went unnoticed.
    const { data, error } = await supabase.rpc('find_duplicate_leads')
    if (error) console.error(error.message)
    setLoadError(error ? error.message : '')
    setGroups(findDuplicateLeads(data || []))
    setLoading(false)
  }

  return (
    <div className="admin-view" style={{ maxWidth: 800 }}>
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} />
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Duplicate Leads</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>Profiles sharing the same phone number or email — same person registered twice?</div>
      {groups.length > 0 && <ListSearch value={query} onChange={setQuery} placeholder="Search" />}

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Checking...</div>
      ) : loadError ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#dc2626',fontSize:13}}>Couldn't check for duplicates: {loadError}</div>
      ) : groups.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>No duplicate phone numbers or emails found. 🎉</div>
      ) : visibleGroups.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>No duplicates match "{query}".</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {visibleGroups.map(g => (
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
// Search box columns for the loaded match list (public view + the filter
// columns findMatchesForProfile adds).
const FIND_MATCHES_SEARCH_COLUMNS = ['profile_code', 'full_name', 'city', 'state', 'country', 'family_city',
  'native_place', 'religion', 'community', 'sub_caste', 'gotra', 'mother_tongue', 'education', 'degree',
  'profession', 'employment_type', 'father_profession', 'mother_profession', 'about_me']
// All of a profile's filled fields, grouped and compact — Aryan asked
// (voice note, 2026-10-10) that opening a profile's full view in Find
// Matches should show every field that's filled in, however many there
// are (he said "100 fields"), readable on a small screen, so he can
// manually compare the main profile against an expanded match before
// deciding which one to send. Reused for both the pinned main-profile
// card and an expanded match row below, so both sides of the comparison
// show the same depth of detail. Reuses the same field catalog as
// EditProfileForm (Dashboard.js) / BiodataView.js — no new fields.
const arrOrStr = (v) => Array.isArray(v) ? (v.join(', ') || null) : (v || null)

// Partner preferences ("Looking For") as its own section — pulled out of
// profileDetailSections so the Find Matches side panel can show it as a
// standalone, always-visible card (Aryan's ask, 2026-10-12: preferences
// should be visible while matching, not buried inside the full collapsed
// profile detail). Same fields, same labels, no new data model — just
// reused here on its own.
function partnerPreferenceSection(p) {
  const partnerAge = (p.partner_age_min || p.partner_age_max) ? `${p.partner_age_min || '18'} - ${p.partner_age_max || '70'} yrs` : null
  const partnerHeight = (p.partner_height_min && p.partner_height_max) ? `${formatHeightFromInches(p.partner_height_min)} - ${formatHeightFromInches(p.partner_height_max)}` : null
  const partnerIncome = (p.partner_income_min || p.partner_income_max) ? `${formatIncomeShort(p.partner_income_min, p.partner_income_currency)} - ${formatIncomeShort(p.partner_income_max, p.partner_income_currency)}` : null
  return { title: 'Looking For', rows: [
    ['Age', partnerAge], ['Height', partnerHeight], ['Income', partnerIncome],
    ['Education', arrOrStr(p.partner_education_level_preferences) || p.partner_education],
    ['Occupation / Sector', arrOrStr(p.partner_employment_type_preferences)],
    ['Religion', p.partner_religion && p.partner_religion !== 'Any' ? p.partner_religion : null],
    ['Community', arrOrStr(p.partner_community_ids)],
    ['Location', p.partner_location], ['City preference', p.partner_city_preference],
    ['State preference', p.partner_state_preference], ['Country preference', p.partner_country_preference],
    ['Notes', p.partner_notes],
  ]}
}

function profileDetailSections(p) {
  const siblings = []
  if (p.brothers_count) siblings.push(`${p.brothers_count} Brother(s) (${p.brothers_married_count || 0} Married)`)
  if (p.sisters_count) siblings.push(`${p.sisters_count} Sister(s) (${p.sisters_married_count || 0} Married)`)

  return [
    { title: 'Personal', rows: [
      ['Date of birth', p.date_of_birth], ['Height', p.height], ['Weight', p.weight],
      ['Complexion', p.complexion], ['Body type', p.body_type], ['Blood group', p.blood_group],
      ['Marital status', p.marital_status], ['Have children', p.have_children],
      ['Children living with', p.children_living_with], ['Physical disability', p.physical_disability],
      ['Disability details', p.disability_details], ['Nationality', p.nationality],
      ['Native place', p.native_place], ['Country of birth', p.country_of_birth],
      ['Ethnic origin', p.ethnic_origin], ['Mother tongue', p.mother_tongue],
      ['Languages spoken', arrOrStr(p.languages_spoken)],
      ['Grew up in', p.grew_up_in], ['Profile for', p.profile_for],
      ['Living with parents', p.living_with_parents],
    ]},
    { title: 'Religion & Horoscope', rows: [
      ['Religion', p.religion], ['Denomination', p.religion_denomination], ['Denomination (2)', p.religion_denomination_2],
      ['Community/Caste', p.community], ['Sub-caste', p.sub_caste], ['Caste no bar', p.caste_no_bar],
      ['Gotra', p.gotra], ["Mother's gotra", p.mother_gotra], ['Manglik', p.manglik],
      ['Rashi', p.rashi], ['Nakshatra', p.nakshatra ? p.nakshatra + (p.nakshatra_pada ? ` (Pada ${p.nakshatra_pada})` : '') : null],
      ['Kundli available', p.kundli_available], ['Horoscope match required', p.horoscope_match_required],
      ['Birth place', p.birth_place], ['Birth time', p.birth_time], ['Time of birth accuracy', p.time_of_birth_accuracy],
      ['Islamic denomination', p.islamic_denomination], ['School of thought', p.islamic_school_of_thought],
      ['Shia branch', p.islamic_shia_branch], ['Sub-caste division', p.islamic_sub_caste_division],
      ['Christian denomination', p.christian_denomination],
    ]},
    { title: 'Education & Career', rows: [
      ['Education', p.education], ['Degree', p.degree], ['College', p.college_name],
      ['Employment type', p.employment_type], ['Profession', p.profession], ['Employer', p.employer],
      ['Annual income', p.annual_income],
    ]},
    { title: 'Location', rows: [
      ['City', p.city], ['State', p.state], ['Country', p.country], ['Zip code', p.zip_code],
      ['Residency status', p.residency_status], ['Relocation preference', p.relocation_preference],
    ]},
    { title: 'Family', rows: [
      ['Family type', p.family_type], ['Family values', p.family_values],
      ['Family financial status', p.family_financial_status], ['Family income', p.family_income_range],
      ['Family city', p.family_city], ["Father's profession", p.father_profession],
      ["Mother's profession", p.mother_profession], ['Siblings', siblings.join(' · ') || null],
      ['Own house', p.own_house], ['Vehicle ownership', p.vehicle_ownership],
    ]},
    { title: 'Lifestyle & Interests', rows: [
      ['Diet', p.diet], ['Smoking', p.smoking], ['Drinking', p.drinking],
      ['Hobbies', p.hobbies], ['Interests', arrOrStr(p.hobbies_interests)],
      ['Favourite music', arrOrStr(p.favourite_music)], ['Favourite books', arrOrStr(p.favourite_books)],
      ['Dress style', p.dress_style], ['Cuisines', arrOrStr(p.cuisines)],
      ['Sports', arrOrStr(p.sports)], ['Health info', arrOrStr(p.health_info)],
    ]},
    partnerPreferenceSection(p),
    { title: 'Contact', rows: [
      ['Phone', p.client_phone], ['Email', p.client_email], ['Alternate email', p.alternate_email],
    ]},
  ]
}

function FullProfileDetails({ profile }) {
  const sections = profileDetailSections(profile)
    .map(s => ({ ...s, rows: s.rows.filter(([, v]) => v) }))
    .filter(s => s.rows.length > 0)
  return (
    <div>
      {profile.about_me && (
        <div style={{fontSize:13,lineHeight:1.6,color:'#444',fontStyle:'italic',marginBottom:12,padding:'8px 10px',background:'#fafafa',borderRadius:8}}>
          "{profile.about_me}"
        </div>
      )}
      {sections.map(s => (
        <div key={s.title} style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:600,color:'#8e8e8e',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:6}}>{s.title}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',gap:'4px 10px'}}>
            {s.rows.map(([label, value]) => (
              <div key={label} style={{fontSize:12,padding:'3px 0',borderBottom:'1px solid rgba(0,0,0,0.05)'}}>
                <span style={{color:'#8e8e8e'}}>{label}: </span>
                <span style={{fontWeight:500}}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Always-visible "Looking For" card on the Find Matches main profile panel
// (Aryan's ask, 2026-10-12) — same fields/labels as the "Looking For"
// section inside FullProfileDetails, just pulled out so it's on screen
// without expanding the whole profile.
function PartnerPreferencesCard({ profile }) {
  const section = partnerPreferenceSection(profile)
  const rows = section.rows.filter(([, v]) => v)
  if (rows.length === 0) return null
  return (
    <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid rgba(0,0,0,0.06)'}}>
      <div style={{fontSize:12,fontWeight:600,color:'#444',display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
        <Heart size={13} /> Partner Preferences
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',gap:'4px 10px'}}>
        {rows.map(([label, value]) => (
          <div key={label} style={{fontSize:12,padding:'3px 0',borderBottom:'1px solid rgba(0,0,0,0.05)'}}>
            <span style={{color:'#8e8e8e'}}>{label}: </span>
            <span style={{fontWeight:500}}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Admin-only free-text "Demand / Note" — one row per profile in a
// dedicated staff-only table (admin_demand_notes), edited in place
// (upsert), never shown to the client. Lets the admin jot what a call/
// consultation revealed about the client's real requirement — the kind
// of thing that doesn't fit the structured partner_* preference fields —
// to use as reference while picking matches (Aryan's ask, 2026-10-12).
function AdminDemandNote({ profileId, staffUser }) {
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState('') // last-saved value, to show "Saved" vs dirty
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase.from('admin_demand_notes').select('note').eq('profile_id', profileId).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setNote(data?.note || '')
        setSaved(data?.note || '')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [profileId])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('admin_demand_notes').upsert({
      profile_id: profileId,
      note: note.trim(),
      updated_by: staffUser?.user_id,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (err) { setError('Could not save: ' + err.message); return }
    setSaved(note.trim())
  }

  if (loading) return null
  const dirty = note.trim() !== saved

  return (
    <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid rgba(0,0,0,0.06)'}} onClick={e => e.stopPropagation()}>
      <div style={{fontSize:12,fontWeight:600,color:'#444',display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
        <NotebookPen size={13} /> Demand / Note <span style={{fontWeight:400,color:'#bbb',fontSize:11}}>(admin only)</span>
      </div>
      <textarea className="form-textarea" rows={3} style={{fontSize:12,resize:'vertical'}}
        placeholder="What the client actually wants — from calls/consultation, not captured above..."
        value={note} onChange={e => setNote(e.target.value)} />
      <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
        <button className="btn btn-outline btn-sm" disabled={!dirty || saving} onClick={handleSave}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {!dirty && saved && <span style={{fontSize:12,color:'#16a34a'}}>✓ Saved</span>}
        {error && <span style={{fontSize:12,color:'#dc2626'}}>{error}</span>}
      </div>
    </div>
  )
}

function FindMatchesView({ profile, results, loading, staffUserId, staffUser, onBack }) {
  const [expandedId, setExpandedId] = useState(null)
  // Main profile pinned on top, full detail collapsible — admin asked
  // (voice note, 2026-10-09) to be able to see the profile they're
  // matching for while scrolling/expanding the match list below, instead
  // of only a name + code header. Defaults open since that's the whole
  // point of the ask; collapsible so it doesn't eat the screen on mobile.
  // Laptop opens it in the left column; on a phone it starts collapsed
  // (one tap to open) so the match list isn't pushed below the fold.
  const [mainExpanded, setMainExpanded] = useState(() => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(min-width: 1024px)').matches)
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
  // External bureau profile (profile.external_bureau_name set) — client ka
  // number aksar missing hota hai, par bureau apna coordination number de
  // chuka ho sakta hai (external_bureau_contact), to seedha wahi use karo
  // (Aryan's ask, 2026-10-10) instead of WhatsApp asking which chat to open.
  const isBureauSourced = !!profile.external_bureau_name
  const [clientPhone, setClientPhone] = useState(profile.client_phone || (isBureauSourced ? profile.external_bureau_contact || '' : ''))
  // Bureau-sourced profiles get the polite bureau_coordination templates by
  // default instead of the regular match_shared ones.
  const shareEventType = isBureauSourced ? 'bureau_coordination' : 'match_shared'
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
    city: '', state: '', religion: [], community: [], maritalStatus: [], education: [],
    // More filters (Aryan's ask, 2026-10-10): complexion, profession/
    // employment status, mother tongue, living with parents — same
    // multi-select pattern, same existing option lists, no new fields.
    complexion: [], profession: [], employmentType: [], motherTongue: [], livingWithParents: [],
    // Universal filters (2026-10-10) — every other profile field, same
    // catalog as the Admin Profiles list (utils/profileFilters.js).
    extra: {} }
  const [showFilters, setShowFilters] = useState(false)
  // Quick search across the loaded matches — Profile ID, city, caste,
  // gotra, education, profession... every word must match.
  const [matchQuery, setMatchQuery] = useState('')
  // Age/height/income ab slider-based range hain (DualRangeSlider, same
  // component jo member-facing Search screen par use hota hai) — pehle
  // number-input/text the (Aryan's ask, 2026-10-09: "filter mein sliders
  // chahiye"). Income filter default range (full bounds) par hamesha
  // "active" dikhta tha purane number-input design mein bhi nahi — yahan
  // bhi default range ko active nahi maante.
  const [filters, setFilters] = useState(showFiltersDefault)
  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }))
  const clearFilters = () => setFilters(showFiltersDefault)
  const activeFilterCount = (filters.city !== '' ? 1 : 0) + (filters.state !== '' ? 1 : 0)
    + ['religion', 'community', 'maritalStatus', 'education', 'complexion', 'profession', 'employmentType', 'motherTongue', 'livingWithParents'].filter(k => filters[k].length > 0).length
    + (filters.ageMin !== showFiltersDefault.ageMin || filters.ageMax !== showFiltersDefault.ageMax ? 1 : 0)
    + (filters.heightMin !== showFiltersDefault.heightMin || filters.heightMax !== showFiltersDefault.heightMax ? 1 : 0)
    + (filters.incomeMin !== showFiltersDefault.incomeMin || filters.incomeMax !== showFiltersDefault.incomeMax || filters.incomeCurrency !== showFiltersDefault.incomeCurrency ? 1 : 0)
    + activeFilterKeys(filters.extra).length
  const extraChips = filterChips(filters.extra, v => setFilter('extra', v))
  const resultProfiles = useMemo(() => results.map(r => r.profile), [results])

  const filteredResults = results.filter(r => {
    const o = r.profile
    if (!profileMatchesSearch(o, matchQuery, FIND_MATCHES_SEARCH_COLUMNS)) return false
    if (!profileMatchesFilters(o, filters.extra)) return false
    if (o.age && (o.age < filters.ageMin || o.age > filters.ageMax)) return false
    if (filters.city && !(o.city || '').toLowerCase().includes(filters.city.trim().toLowerCase())) return false
    if (filters.state && !(o.state || '').toLowerCase().includes(filters.state.trim().toLowerCase())) return false
    if (filters.religion.length > 0 && !filters.religion.includes(o.religion)) return false
    if (filters.community.length > 0 && !filters.community.includes(o.community)) return false
    if (filters.maritalStatus.length > 0 && !filters.maritalStatus.includes(o.marital_status)) return false
    if (filters.education.length > 0 && !filters.education.includes(o.education)) return false
    if (filters.complexion.length > 0 && !filters.complexion.includes(o.complexion)) return false
    if (filters.profession.length > 0 && !filters.profession.includes(o.profession)) return false
    if (filters.employmentType.length > 0 && !filters.employmentType.includes(o.employment_type)) return false
    if (filters.motherTongue.length > 0 && !filters.motherTongue.includes(o.mother_tongue)) return false
    if (filters.livingWithParents.length > 0 && !filters.livingWithParents.includes(o.living_with_parents)) return false
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
    // Bureau-sourced profile — this is the OTHER bureau's own coordination
    // number, not the client's, so it goes in external_bureau_contact, not
    // client_phone (Aryan's ask, 2026-10-10).
    const column = isBureauSourced ? 'external_bureau_contact' : 'client_phone'
    const { error } = await supabase.from('profiles').update({ [column]: phoneDraft.trim() }).eq('id', profile.id)
    if (error) { setPhoneError('Could not save: ' + error.message); return }
    if (!isBureauSourced) await writeAuditLog(staffUser, 'client_phone_edit', profile.id, { new_phone: phoneDraft.trim() })
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

  // Profile codes already sent to this client (from manual Shared Matches
  // log + share links) — shown as a "✓ Sent" badge on each match row
  // (audit gap, 2026-10-10: no way to tell at a glance which matches have
  // already been shared with this client from within Find Matches).
  const [allSentCodes, setAllSentCodes] = useState(new Set())
  useEffect(() => {
    if (!profile.id) return
    Promise.all([
      supabase.from('profile_notes').select('note').eq('profile_id', profile.id).like('note', SHARED_MATCH_NOTE_PREFIX + '%'),
      supabase.from('share_links').select('profile_id').eq('client_profile_id', profile.id),
    ]).then(async ([notesRes, linksRes]) => {
      const ids = new Set()
      for (const row of (notesRes.data || [])) {
        parseSharedMatchNote(row.note).ids.forEach(id => ids.add(id.toUpperCase()))
      }
      const linkProfileIds = (linksRes.data || []).map(r => r.profile_id).filter(Boolean)
      if (linkProfileIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('profile_code').in('id', linkProfileIds)
        ;(profs || []).forEach(p => { if (p.profile_code) ids.add(p.profile_code.toUpperCase()) })
      }
      setAllSentCodes(ids)
    })
  }, [profile.id])
  const [bundle, setBundle] = useState(null) // { url, generating, error, copied }
  // Abhi banaya link bhi turant "✓ Sent" dikhaye (pehle sirf screen dobara
  // kholne par aata tha).
  const markSent = (ids) => setAllSentCodes(prev => {
    const next = new Set(prev)
    results.forEach(r => { if (ids.includes(r.profile.id) && r.profile.profile_code) next.add(r.profile.profile_code.toUpperCase()) })
    return next
  })

  // Admin-initiated coordination request between this client and a match
  // (audit gap, 2026-10-10: no way to start a Talk/Meeting from admin
  // without going through a share-link interest forward). Inserts an
  // introductions row directly. Requires migration 20261010_admin_gaps.sql
  // (adds 'admin' to the source check constraint).
  const [introFor, setIntroFor] = useState({}) // otherId -> { loading, done, error }
  const handleCreateIntro = async (other) => {
    setIntroFor(prev => ({ ...prev, [other.id]: { loading: true } }))
    // Is jodi ki pehle se khuli request ho (kisi bhi taraf se) to nayi nahi
    // banate — pehle reverse-direction duplicate ban jaata tha, aur same
    // direction par raw "duplicate key" error aata tha.
    const { data: existing } = await supabase.from('introductions').select('id, request_id')
      .or(`and(from_profile.eq.${profile.id},to_profile.eq.${other.id}),and(from_profile.eq.${other.id},to_profile.eq.${profile.id})`)
      .not('status', 'in', '(closed,declined)').limit(1)
    if (existing && existing.length > 0) {
      setIntroFor(prev => ({ ...prev, [other.id]: { done: true, existing: existing[0].request_id || true } }))
      return
    }
    const { error } = await supabase.from('introductions').insert({
      from_profile: profile.id,
      to_profile: other.id,
      status: 'pending',
      request_type: 'meeting',
      source: 'admin',
    })
    if (error) {
      setIntroFor(prev => ({ ...prev, [other.id]: { error: error.message } }))
      return
    }
    await writeAuditLog(staffUser, 'admin_coordination_created', profile.id, { other_profile_id: other.id, request_type: 'meeting' })
    setIntroFor(prev => ({ ...prev, [other.id]: { done: true } }))
  }

  const togglePicked = (id) => {
    setBundle(null)
    setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleGenerateBundle = async () => {
    setBundle({ generating: true })
    try {
      const b = await generateShareBundle(picked, staffUserId, profile.id)
      setBundle({ url: b.url })
      markSent(picked)
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
      markSent([otherProfileId])
    } catch (err) {
      setLinkFor(prev => ({ ...prev, [otherProfileId]: { error: err.message } }))
    }
  }

  return (
    <div className={'fm-view' + (mainExpanded ? ' fm-split' : '')}>
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to list</button>

      {/* Laptop: main profile LEFT, matches RIGHT (Aryan, 2026-10-11 —
          "left mein main profile, right mein saari matching profiles").
          Phone keeps the stacked layout (pinned card on top, matches
          below). Collapsing the main card frees the full width for
          matches on laptop too. Layout lives in App.css (.fm-*). */}
      <div className="fm-layout">
      <aside className="fm-main">
      {/* Pinned main profile — sticky so it stays visible while scrolling/
          expanding the match list (the "two partition" screen ask). */}
      <div className="fm-main-card">
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

        {/* Partner preferences — always visible (not gated behind the
            collapsible full-profile toggle above), so the admin has them
            on screen while scanning the match list, without needing to
            expand the whole profile (Aryan's ask, 2026-10-12). */}
        <PartnerPreferencesCard profile={profile} />

        {/* Admin-only "Demand / Note" — free text, filled by admin only,
            never shown to the client (separate staff-only table, not a
            profiles column or a profile_notes row — see migration
            20261012_admin_demand_note.sql). Captures what a call/
            consultation reveals about the client's real requirement,
            which the structured preference fields above don't capture
            (Aryan's ask, 2026-10-12). */}
        <AdminDemandNote profileId={profile.id} staffUser={staffUser} />

        {mainExpanded && (
          <div className="fm-main-details">
            <FullProfileDetails profile={profile} />
          </div>
        )}
      </div>

      {clientPhone && (
        <div className="fm-client-phone">
          <span style={{color:'#8e8e8e',fontFamily:'monospace'}}>{clientPhone}</span>
          <ContactButtons phone={clientPhone} logProfile={profile} size="md" />
        </div>
      )}

      {!clientPhone && (
        <div style={{background:'#f9f9f9',borderRadius:12,padding:12,marginBottom:14}}>
          <div style={{fontSize:12,marginBottom:6}}>
            {isBureauSourced
              ? `Save ${profile.external_bureau_name}'s coordination number so matches open straight in their chat`
              : `Save ${profile.full_name}'s WhatsApp number so matches open straight in their chat`}
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <input className="form-input" placeholder="9876543210" value={phoneDraft} inputMode="tel"
              onChange={e=>setPhoneDraft(e.target.value)} style={{flex:'1 1 160px',fontSize:13}} />
            <button className="btn btn-outline btn-sm" onClick={saveClientPhone}>Save number</button>
          </div>
          {phoneError && <div style={{fontSize:13,color:'#dc2626',marginTop:6}}>{phoneError}</div>}
        </div>
      )}
      </aside>

      <section className="fm-results">
      {picked.length > 0 && (
        <div style={{background:'#fff8e1',borderRadius:12,padding:14,marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>
            {picked.length} selected — share all in one link
            {clientPhone
              ? <span style={{fontWeight:400,color:'#8e8e8e'}}> · goes straight to {isBureauSourced ? `${profile.external_bureau_name}'s` : "client's"} WhatsApp ({clientPhone})</span>
              : <span style={{fontWeight:400,color:'#8e8e8e'}}> · {isBureauSourced ? 'no bureau contact number saved' : 'no client phone saved'}, WhatsApp will ask which chat</span>}
          </div>
          {!bundle?.url ? (
            <button className="btn btn-black btn-sm" disabled={bundle?.generating} onClick={handleGenerateBundle}>
              {bundle?.generating ? 'Generating...' : `🔗 Create one link for ${picked.length} matches`}
            </button>
          ) : (
            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              <WhatsAppReminderButton profile={{ ...profile, client_phone: clientPhone }} eventType={shareEventType}
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
          <div style={{position:'relative',marginBottom:8}}>
            <Search size={14} color="#8e8e8e" style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}} />
            <input type="text" className="form-input" value={matchQuery} onChange={e=>setMatchQuery(e.target.value)}
              placeholder="Search"
              style={{paddingLeft:34,fontSize:13}} />
          </div>
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
                <input className="form-input" placeholder="State" value={filters.state}
                  onChange={e=>setFilter('state', e.target.value)} style={{maxWidth:140}} />
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                <div style={{maxWidth:180,flex:'1 1 160px'}}>
                  <CheckboxDropdown options={withDataOptions(RELIGIONS, resultProfiles, 'religion')} selected={filters.religion}
                    onChange={v=>setFilter('religion', v)} placeholder="All religions" />
                </div>
                <div style={{maxWidth:200,flex:'1 1 180px'}}>
                  <CheckboxDropdown options={withDataOptions(CASTES, resultProfiles, 'community')} selected={filters.community}
                    onChange={v=>setFilter('community', v)} placeholder="All castes / communities" />
                </div>
                <div style={{maxWidth:190,flex:'1 1 170px'}}>
                  <CheckboxDropdown options={withDataOptions(MARITAL_STATUSES, resultProfiles, 'marital_status')} selected={filters.maritalStatus}
                    onChange={v=>setFilter('maritalStatus', v)} placeholder="All marital statuses" />
                </div>
                <div style={{maxWidth:190,flex:'1 1 170px'}}>
                  <CheckboxDropdown options={withDataOptions(EDUCATIONS, resultProfiles, 'education')} selected={filters.education}
                    onChange={v=>setFilter('education', v)} placeholder="All education levels" />
                </div>
                {/* More filters (Aryan's ask, 2026-10-10): complexion,
                    profession/employment status, mother tongue, living
                    with parents — same CheckboxDropdown pattern, same
                    existing option lists. */}
                <div style={{maxWidth:180,flex:'1 1 160px'}}>
                  <CheckboxDropdown options={withDataOptions(COMPLEXIONS, resultProfiles, 'complexion')} selected={filters.complexion}
                    onChange={v=>setFilter('complexion', v)} placeholder="All complexions" />
                </div>
                <div style={{maxWidth:190,flex:'1 1 170px'}}>
                  <CheckboxDropdown options={withDataOptions(PROFESSION_CATEGORIES, resultProfiles, 'profession')} selected={filters.profession}
                    onChange={v=>setFilter('profession', v)} placeholder="All professions" />
                </div>
                <div style={{maxWidth:190,flex:'1 1 170px'}}>
                  <CheckboxDropdown options={withDataOptions(EMPLOYMENT_TYPES, resultProfiles, 'employment_type')} selected={filters.employmentType}
                    onChange={v=>setFilter('employmentType', v)} placeholder="All employment types" />
                </div>
                <div style={{maxWidth:190,flex:'1 1 170px'}}>
                  <CheckboxDropdown options={withDataOptions(MOTHER_TONGUES, resultProfiles, 'mother_tongue')} selected={filters.motherTongue}
                    onChange={v=>setFilter('motherTongue', v)} placeholder="All mother tongues" />
                </div>
                <div style={{maxWidth:190,flex:'1 1 170px'}}>
                  <CheckboxDropdown options={withDataOptions(LIVING_WITH_PARENTS_OPTIONS, resultProfiles, 'living_with_parents')} selected={filters.livingWithParents}
                    onChange={v=>setFilter('livingWithParents', v)} placeholder="Living with parents: Any" />
                </div>
                {activeFilterCount > 0 && <button className="btn btn-outline btn-sm" onClick={clearFilters}>Clear filters</button>}
              </div>
              <div style={{fontSize:12,color:'#8e8e8e',letterSpacing:'0.08em',textTransform:'uppercase',margin:'4px 0 6px'}}>All profile fields</div>
              <ProfileFilterGroups scope="matches" values={filters.extra} onChange={v=>setFilter('extra', v)} optionRows={resultProfiles}
                exclude={['religion', 'community', 'marital_status', 'education', 'complexion', 'profession',
                  'employment_type', 'mother_tongue', 'living_with_parents', 'city', 'state']} />
            </div>
          )}
          {extraChips.length > 0 && (
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
              {extraChips.map(c => (
                <button key={c.key} className="chip chip-muted" style={{textTransform:'none',cursor:'pointer',border:'none'}}
                  onClick={c.clear} title="Remove this filter">{c.label} ✕</button>
              ))}
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
          No matches meet these filters{matchQuery ? ` / "${matchQuery}"` : ''}. <button className="btn btn-outline btn-sm" style={{marginLeft:6}} onClick={()=>{ clearFilters(); setMatchQuery('') }}>Clear filters</button>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{fontSize:12,color:'#8e8e8e',marginBottom:-2}}>{filteredResults.length} of {results.length} matches</div>
          {filteredResults.map(r => {
            const other = r.profile
            const isExpanded = expandedId === other.id
            const linkState = linkFor[other.id]
            const mailLink = linkState?.url ? buildMailtoLink(profile.client_email, 'A match for you — LOVEKUSH', `Hi,\n\nWe found a match for you. View secure profile:\n${linkState.url}\n\n(This link expires in 7 days)\n\nRegards,\nLOVEKUSH Matchmaking Services`) : null

            return (
              <div key={other.id} className="list-row">
                <div style={{display:'flex',gap:12,alignItems:'center'}}>
                  <input type="checkbox" checked={picked.includes(other.id)} onChange={()=>togglePicked(other.id)}
                    title="Select to share several matches in one link" style={{width:18,height:18,flexShrink:0}} />
                  <div className="fm-match-avatar">
                    {r.photoPath
                      ? <SignedImage path={r.photoPath} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                      : <UserRound size={18} color="#bbb" />}
                  </div>
                  <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={()=>setExpandedId(isExpanded?null:other.id)}>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                      <span style={{fontWeight:600,fontSize:14}}>{other.full_name}</span>
                      <span style={{fontSize:12,fontWeight:600,padding:'2px 8px',borderRadius:20,
                        background: r.score>=70?'#f0fdf4':r.score>=40?'#fff8e1':'#f5f5f5',
                        color: r.score>=70?'#16a34a':r.score>=40?'#b45309':'#8e8e8e'}}>
                        {r.score}% match
                      </span>
                      {allSentCodes.has((other.profile_code || '').toUpperCase()) && (
                        <span style={{fontSize:11,padding:'3px 8px',borderRadius:10,background:'#f0fdf4',color:'#16a34a',fontWeight:500}}>✓ Sent</span>
                      )}
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
                      <div style={{marginBottom:10}}>
                        <div style={{fontSize:13,fontWeight:600,color:'#b45309',marginBottom:4}}>Needs Discussion</div>
                        {r.needsDiscussion.map((s,i)=><div key={i} style={{fontSize:12,marginBottom:2}}>△ {s}</div>)}
                      </div>
                    )}
                    {/* Full profile, so the admin can manually compare this match
                        against the pinned main profile (left on laptop, above on phone) before deciding
                        which one to send (Aryan's ask, 2026-10-10). */}
                    <div style={{paddingTop:8,borderTop:'1px solid rgba(0,0,0,0.06)'}}>
                      <FullProfileDetails profile={other} />
                    </div>
                  </div>
                )}

                {/* Share link + Start Coordination on one row (2026-10-11 compaction). */}
                <div style={{marginTop:10,display:'flex',flexWrap:'wrap',gap:8,alignItems:'flex-start'}}>
                <div style={{flex: linkState?.url || linkState?.error ? '1 1 100%' : '0 0 auto'}}>
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
                        <WhatsAppReminderButton profile={{ ...profile, client_phone: clientPhone }} eventType={shareEventType}
                          vars={{ otherName: other.full_name }} appendText={linkState.url} staffUserId={staffUserId}
                          label="Send via WhatsApp" size="md" />
                        {!clientPhone && (
                          <span style={{fontSize:13,color:'#8e8e8e',alignSelf:'center'}}>
                            {isBureauSourced ? 'No bureau contact number saved' : 'No client phone saved'}, WhatsApp will ask which chat
                          </span>
                        )}
                        {mailLink && <a href={mailLink} className="btn btn-outline btn-sm">✉ Send via Email</a>}
                      </div>
                    </div>
                  )}
                  {linkState?.error && <div style={{fontSize:13,color:'#dc2626',marginTop:6}}>{linkState.error}</div>}
                </div>

                {/* Admin-initiated Talk/Meeting request — previously the only
                    way to start coordination was via a share-link interest
                    forward (audit gap, 2026-10-10). */}
                <div>
                  {introFor[other.id]?.done ? (
                    <span style={{fontSize:12,color:'#16a34a',display:'flex',alignItems:'center',gap:5}}>
                      <Handshake size={13} /> {introFor[other.id].existing
                        ? `Already in Coordination Requests${typeof introFor[other.id].existing === 'string' ? ` (${introFor[other.id].existing})` : ''}`
                        : 'Coordination request created — visible in Coordination Requests'}
                    </span>
                  ) : (
                    <button className="btn btn-outline btn-sm" disabled={introFor[other.id]?.loading}
                      onClick={()=>handleCreateIntro(other)}>
                      <Handshake size={13} style={{verticalAlign:'-2px',marginRight:4}} />
                      {introFor[other.id]?.loading ? 'Creating...' : 'Start Coordination'}
                    </button>
                  )}
                  {introFor[other.id]?.error && <div style={{fontSize:12,color:'#dc2626',marginTop:4}}>{introFor[other.id].error}</div>}
                </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      </section>
      </div>
    </div>
  )
}

// Share a client's profile with an external bureau — manual note (budget,
// specific requirement), contact details never go out (generateBureauShareLink
// reuses the same get_shared_profile pipeline as a normal match share).
// Bottom sheet, same createPortal pattern as WhatsAppReminder's ReminderSheet.
function BureauShareSheet({ profile, staffUserId, onClose }) {
  const [note, setNote] = useState('')
  const [result, setResult] = useState(null) // { url, copied } | { error }
  const [generating, setGenerating] = useState(false)

  const generate = async () => {
    setGenerating(true)
    try {
      const link = await generateBureauShareLink(profile.id, staffUserId, note)
      setResult({ url: link.url })
    } catch (err) {
      setResult({ error: err.message })
    }
    setGenerating(false)
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(result.url); setResult(r => ({ ...r, copied: true })) } catch {}
  }

  return createPortal(
    <div onClick={e => { e.stopPropagation(); onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', borderRadius: '14px 14px 0 0', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Building2 size={15} /> Share with a bureau — {profile.full_name || 'profile'}
        </div>
        <div style={{ fontSize: 12, color: '#8e8e8e' }}>
          Sends the full profile (no phone/email) with a link they can open without logging in.
          Add any manual note — budget, a specific requirement — just for this share.
        </div>
        {!result?.url ? (
          <>
            <textarea className="form-input" rows={3} placeholder="e.g. Ladke ka budget 20-25 LPA hai, IT/Govt job wali chahiye"
              value={note} onChange={e => setNote(e.target.value)} style={{ fontSize: 13, resize: 'vertical' }} autoFocus />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
              <button className="btn btn-black btn-sm" disabled={generating} onClick={generate}>
                {generating ? 'Generating...' : 'Generate link'}
              </button>
            </div>
            {result?.error && <div style={{ fontSize: 12, color: '#dc2626' }}>{result.error}</div>}
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Link ready — expires in 7 days</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {navigator.share && (
                <button className="btn btn-outline btn-sm"
                  onClick={() => nativeShare({ title: 'LOVEKUSH Profile', text: `Profile from LOVEKUSH (${profile.profile_code})`, url: result.url })}>
                  Share…
                </button>
              )}
              <button className="btn btn-outline btn-sm" onClick={copy}>{result.copied ? '✓ Copied' : 'Copy link'}</button>
              <button className="btn btn-black btn-sm" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
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
        const aPending = (a.interested_at && !a.interest_acknowledged_at) || (a.bureau_reply && !a.bureau_reply_acknowledged_at)
        const bPending = (b.interested_at && !b.interest_acknowledged_at) || (b.bureau_reply && !b.bureau_reply_acknowledged_at)
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
    // Can't be undone from the app — confirm first (audit 2026-10-11).
    if (!window.confirm('Revoke this link? The client will no longer be able to open it.')) return
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

  // "Not Interested" signal ko dismiss karta hai — permanent red badge hata
  // deta hai (audit gap, 2026-10-10). Requires migration 20261010_admin_gaps.sql.
  const handleNoteNotInterested = async (linkId) => {
    try {
      await acknowledgeShareLinkNotInterested(linkId)
      setLinks(prev => prev.map(l => l.id === linkId ? { ...l, not_interest_acknowledged_at: new Date().toISOString() } : l))
    } catch (err) {
      showToast(err.message)
    }
  }

  // Bureau ka "match mil gaya" reply dekh/action le liya — "needs attention"
  // se hata deta hai, record khud rehta hai (Aryan, 2026-10-11).
  const handleAcknowledgeBureau = async (linkId) => {
    try {
      await acknowledgeBureauReply(linkId)
      setLinks(prev => prev.map(l => l.id === linkId ? { ...l, bureau_reply_acknowledged_at: new Date().toISOString() } : l))
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
    <div className="admin-view" style={{ maxWidth: 800 }}>
      <ToastView />
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to list</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:12}}>My Share Links</h2>
      {/* Search box — upar, achi tarah visible, Share ID + profile/client
          naam/ID sab pe kaam karta hai (Aryan, 2026-10-09). */}
      {links.length > 0 && (
        <div style={{position:'relative',marginBottom:18}}>
          <Search size={15} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#aaa'}} />
          <input type="text" value={shareSearch} onChange={e=>setShareSearch(e.target.value)}
            placeholder="Search"
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
            const bureauReplyPending = l.bureau_reply && !l.bureau_reply_acknowledged_at
            // Bulk match share = one matching cycle (audit 2026-10-08,
            // P0 #4): several profiles shared to the same client in one
            // bundle, each with its own independent status. Admin should
            // see them as one cycle; siblings are found by bundle_token
            // (never shown to the client — each client's own token/page
            // only ever returns their own interaction, untouched here).
            const bundleSiblings = l.bundle_token ? links.filter(x => x.bundle_token === l.bundle_token && x.id !== l.id) : []
            const isBundleExpanded = expandedBundles.has(l.bundle_token)
            // Two-way interest, same pattern as handleSendInterest's
            // "existing" lookup: when A's share link (showing B) got a
            // 👍, admin sends a REVERSE link (showing A to B) via "Send
            // interest" — a separate share_links row. If B also likes it,
            // that's two rows, each with its own "→ Tell this profile"
            // button, and forwarding either one creates/reuses the SAME
            // introduction (20261011_workflow_audit_fixes.sql). The admin
            // was still having to click it twice because each row only
            // showed ITS OWN forwarded_at (Aryan, 2026-10-11: "dono par
            // tell this profile dabana padta hai"). Now every row looks at
            // its reverse sibling too, so clicking either one marks both
            // as forwarded immediately — one click is enough.
            const reverseLink = l.client_profile_id ? links.find(x => x.profile_id === l.client_profile_id
              && x.client_profile_id === l.profile_id && !x.revoked && !x.bundle_token) : null
            const mutualInterest = !!(l.interested_at && reverseLink?.interested_at)
            const effectiveForwardedAt = l.forwarded_at || reverseLink?.forwarded_at
            const effectiveIntroId = l.forwarded_introduction_id || reverseLink?.forwarded_introduction_id
            return (
              <div key={l.id} className={'list-row' + (interestPending ? ' resp-row-interested' : bureauReplyPending ? ' resp-row-bureau' : '')}>
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
                    {l.is_bureau_share && (
                      <div style={{marginTop:6,fontSize:12,color:'#b45309',display:'flex',alignItems:'center',gap:4}}>
                        <Building2 size={12} /> Shared with an external bureau
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
                            : s.interested_at ? '👍 Interested' : s.not_interested_at ? '👎 Not Interested' : 'Awaiting response'
                          return (
                            <div key={s.id} style={{fontSize:12,color:'#555',display:'flex',justifyContent:'space-between',gap:8}}>
                              <span>{sp ? sp.full_name : 'Profile'}</span>
                              <span style={{color: s.interested_at ? '#C2185B' : s.not_interested_at ? '#475569' : '#8e8e8e', fontWeight: s.interested_at || s.not_interested_at ? 600 : 400}}>{sStatus}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                {/* Admin's manual note shown to the bureau on this share
                    (Aryan, 2026-10-11) + their free-text reply once they
                    find a match in their own database. */}
                {l.is_bureau_share && l.bureau_note && (
                  <div style={{marginTop:8,fontSize:12,color:'#555',background:'#fafafa',padding:'8px 10px',borderRadius:8}}>
                    <strong>Note sent:</strong> {l.bureau_note}
                  </div>
                )}
                {l.bureau_reply && (
                  <div style={{marginTop:8,fontSize:12,display:'flex',flexDirection:'column',gap:6,padding:'8px 10px',
                    borderRadius:8, background: l.bureau_reply_acknowledged_at ? '#fafafa' : '#eff6ff'}}>
                    <div style={{color: l.bureau_reply_acknowledged_at ? '#555' : '#1D4ED8',fontWeight:600,display:'flex',alignItems:'center',gap:5}}
                      title={new Date(l.bureau_replied_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}>
                      <ThumbsUp size={12} /> Bureau replied: {l.bureau_reply}
                    </div>
                    {l.bureau_reply_acknowledged_at
                      ? <span style={{fontSize:11,color:'#8e8e8e'}}>✓ Noted</span>
                      : <button className="btn btn-outline btn-sm" style={{padding:'3px 8px',fontSize:11,alignSelf:'flex-start'}}
                          onClick={()=>handleAcknowledgeBureau(l.id)}>Noted</button>
                    }
                  </div>
                )}
                {/* Client tapped "👍 Interested" or "Not Interested" on this profile
                    (Aryan, 2026-10-10: not_interested_at also shown here,
                    sirf admin ke liye — client ko pata nahi chalta). */}
                {l.not_interested_at && !l.interested_at && (
                  <div style={{marginTop:8,fontSize:12,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <span className="resp-badge resp-not" style={l.not_interest_acknowledged_at ? { opacity: 0.7 } : undefined}
                      title={l.not_interest_acknowledged_at ? `Noted ${new Date(l.not_interest_acknowledged_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}` : 'Client tapped Not Interested on this profile'}>
                      <ThumbsDown size={12} /> Not interested · {new Date(l.not_interested_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}
                    </span>
                    {l.not_interest_acknowledged_at
                      ? <span style={{fontSize:11,color:'#8e8e8e'}}>✓ Noted</span>
                      : <button className="btn btn-outline btn-sm" style={{padding:'3px 8px',fontSize:11}}
                          onClick={()=>handleNoteNotInterested(l.id)}>Noted</button>
                    }
                  </div>
                )}
                {l.interested_at && (
                  <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:8}}>
                    {/* Was a faint 12px icon + timestamp — easy to miss
                        entirely next to the bold black "Tell this profile"
                        pill (Aryan, 2026-10-11: "like ka logo aur button
                        gayab jesa feel hota hai, dikhta hi nahi"). Now a
                        proper solid green badge, same visual weight as any
                        other status pill on this page. */}
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                      <span className="resp-badge resp-interested" title={`Interested ${new Date(l.interested_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}`}>
                        <ThumbsUp size={12} /> Interested · {new Date(l.interested_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}
                      </span>
                      {l.not_interested_at && (
                        <div style={{fontSize:11,color:'#8e8e8e',display:'flex',alignItems:'center',gap:3}} title="Client later tapped Not Interested">
                          <ThumbsDown size={11} /> {new Date(l.not_interested_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}
                        </div>
                      )}
                    </div>
                    {/* Both sides of this pair have liked each other — the
                        two halves (this link + its reverse "Send interest"
                        link) are really one cycle, so say so plainly
                        instead of leaving the admin to notice two separate
                        green cards on their own (Aryan, 2026-10-11). */}
                    {mutualInterest && !effectiveForwardedAt && (
                      <div style={{fontSize:12,fontWeight:600,color:'#fff',background:'#C2185B',
                        borderRadius:8,padding:'6px 10px',display:'flex',alignItems:'center',gap:6}}>
                        <ThumbsUp size={13} /> Both profiles liked each other — ready for a meeting
                      </div>
                    )}
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
                      {effectiveForwardedAt ? (
                        effectiveIntroId && onManageCoordination ? (
                          <button className="btn btn-outline btn-sm" style={{padding:'5px 10px',fontSize:12,color:'#16a34a',borderColor:'#16a34a'}}
                            onClick={()=>onManageCoordination(effectiveIntroId)}>✓ Connected — Manage meeting</button>
                        ) : (
                          <span style={{fontSize:12,color:'#16a34a',fontWeight:600}}>✓ Profile notified</span>
                        )
                      ) : (
                        <button className="btn btn-black btn-sm" style={{padding:'5px 10px',fontSize:12}}
                          disabled={forwarding[l.id]} onClick={()=>handleForward(l.id)}
                          title={mutualInterest ? 'Both sides liked each other — this creates the one meeting request for the pair' : 'Let this profile know they were liked'}>
                          {forwarding[l.id] ? 'Connecting...' : mutualInterest ? '→ Connect for a meeting' : '→ Tell this profile'}
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

// Field Suggestions (was "Caste Suggestions" — Aryan, 2026-10-11: it's for
// every dropdown, not just caste). When someone picks "Others / Not in list"
// and types their own caste, gotra, degree, mother tongue or parent's
// profession, it lands here. Approve -> it becomes a real option in that
// same dropdown for everyone (forms read get_approved_field_options(), see
// utils/fieldSuggestions.js). "Added" tab lists them so one can be taken
// back out of the dropdown. Table is still caste_suggestions.
function CasteSuggestionsView({ onBack, staffUser }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('pending')
  const [fieldFilter, setFieldFilter] = useState('')
  const [showToast, ToastView] = useToast()

  useEffect(() => { load() }, [tab])

  const load = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const { data, error } = await supabase
        .from('caste_suggestions')
        .select('*')
        .eq('status', tab)
        .order(tab === 'pending' ? 'times_suggested' : 'updated_at', { ascending: false })
      if (error) throw error
      setSuggestions(data || [])
    } catch (err) {
      console.error(err.message)
      setLoadError(err.message)
    }
    setLoading(false)
  }

  const fieldsPresent = [...new Set(suggestions.map(s => s.field_type))]
  const visibleSuggestions = suggestions
    .filter(s => !fieldFilter || s.field_type === fieldFilter)
    .filter(s => matchesSearch(query, s.suggested_name, s.religion, s.denomination, s.field_type, fieldSuggestionLabel(s.field_type)))

  const handleAction = async (id, status, suggestion) => {
    try {
      const { error } = await supabase.from('caste_suggestions').update({ status }).eq('id', id)
      if (error) throw error
      // Approve/reject kahin audit log nahi likhta tha — Aryan ka audit gap #7.
      await writeAuditLog(staffUser, 'caste_suggestion_' + status, id, {
        suggested_name: suggestion?.suggested_name, field_type: suggestion?.field_type,
      })
      loadApprovedFieldOptions(true)
      const label = fieldSuggestionLabel(suggestion?.field_type)
      showToast(status === 'approved' ? `"${suggestion?.suggested_name}" added to ${label} dropdown`
        : tab === 'approved' ? `"${suggestion?.suggested_name}" removed from ${label} dropdown`
        : 'Suggestion rejected')
      load()
    } catch (err) {
      showToast(err.message)
    }
  }

  return (
    <div className="admin-view" style={{ maxWidth: 800 }}>
      <ToastView />
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} />
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Field Suggestions</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:16}}>
        Values people typed under "Others / Not in list" in any dropdown. Approve to add it as a new option in that dropdown.
      </div>
      <div className="pill-tabs" style={{marginBottom:16}}>
        {[['pending', 'Pending'], ['approved', 'Added to dropdowns']].map(([t, label]) => (
          <button key={t} className={'pill-tab ' + (tab === t ? 'active' : '')} onClick={()=>{ setTab(t); setFieldFilter('') }}>
            {label}
          </button>
        ))}
      </div>
      {fieldsPresent.length > 1 && (
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}}>
          {['', ...fieldsPresent].map(f => (
            <button key={f || 'all'} className={'chip ' + (fieldFilter === f ? 'chip-primary' : 'chip-muted')}
              style={{textTransform:'none',cursor:'pointer',border:'none'}} onClick={()=>setFieldFilter(f)}>
              {f ? fieldSuggestionLabel(f) : 'All fields'}
            </button>
          ))}
        </div>
      )}
      {suggestions.length > 0 && <ListSearch value={query} onChange={setQuery} placeholder="Search" />}

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : loadError ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#dc2626',fontSize:13}}>Couldn't load suggestions: {loadError}</div>
      ) : suggestions.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>
          {tab === 'pending' ? 'No pending suggestions right now.' : 'Nothing added from suggestions yet.'}
        </div>
      ) : visibleSuggestions.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>No suggestions match{query ? ` "${query}"` : ''}.</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {visibleSuggestions.map(s => (
            <div key={s.id} className="list-row">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600}}>{s.suggested_name}</div>
                  <div style={{fontSize:12,color:'#8e8e8e',marginTop:2}}>
                    <span className="chip chip-muted" style={{textTransform:'none',marginRight:6}}>{fieldSuggestionLabel(s.field_type)}</span>
                    {s.religion ? s.religion : ''}{s.denomination ? ' · ' + s.denomination : ''}
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
                {tab === 'pending' ? (
                  <>
                    <button className="btn btn-outline btn-sm" style={{color:'#16a34a',borderColor:'#16a34a'}}
                      onClick={()=>handleAction(s.id, 'approved', s)}>✅ Add to {fieldSuggestionLabel(s.field_type)}</button>
                    <button className="btn btn-outline btn-sm" style={{color:'#dc2626',borderColor:'#dc2626'}}
                      onClick={()=>handleAction(s.id, 'rejected', s)}><X size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Reject</button>
                  </>
                ) : (
                  <button className="btn btn-outline btn-sm" style={{color:'#dc2626',borderColor:'#dc2626'}}
                    onClick={()=>handleAction(s.id, 'rejected', s)}><X size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Remove from dropdown</button>
                )}
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

// "Schedule Meeting" directly (Aryan, 2026-10-10): fix a meeting between a
// client and one or more profiles by Profile ID — no share link / Interested
// tap needed first. 1 client + several profiles = one meeting block (same
// date/time/place). Each pair becomes a normal introductions row via the
// admin_schedule_meeting RPC (migration 20261010_admin_direct_meeting.sql),
// so Met -> 48-hour decision -> next round all work exactly as before.
// Venue (in-person) or join link (virtual) for a scheduled request — the
// link opens in a new tab when it looks like a URL.
function MeetingPlace({ r, style }) {
  if (!r.location) return null
  const virtual = isVirtualMeeting(r)
  const href = virtual ? meetingLinkHref(r.location) : null
  return (
    <div style={{fontSize:12,color:'#8e8e8e',display:'flex',alignItems:'center',gap:4,...style}}>
      {virtual ? <Video size={11} /> : <MapPin size={11} />}
      {href
        ? <a href={href} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{color:'#2563eb',wordBreak:'break-all'}}>{r.location}</a>
        : <span style={{wordBreak:'break-all'}}>{virtual ? `Virtual · ${r.location}` : r.location}</span>}
    </div>
  )
}

// In-Person / Virtual pill toggle (Aryan, 2026-10-11 — far-away families
// meet on Zoom / Google Meet). See utils/meetingMode.js.
function MeetingModeToggle({ value, onChange, size = 13 }) {
  return (
    <div style={{display:'inline-flex',border:'1px solid var(--border)',borderRadius:999,overflow:'hidden',flexShrink:0}}>
      {MEETING_MODES.map(m => {
        const on = (value || 'in_person') === m.value
        return (
          <button key={m.value} type="button" onClick={()=>onChange(m.value)}
            style={{display:'inline-flex',alignItems:'center',gap:4,padding:'6px 12px',fontSize:size-1,border:'none',cursor:'pointer',
              background: on ? '#1F1720' : 'transparent', color: on ? '#fff' : '#555'}}>
            {m.value === 'virtual' ? <Video size={size-1} /> : <MapPin size={size-1} />} {m.label}
          </button>
        )
      })}
    </div>
  )
}

function ContactDetailWarning({ text }) {
  if (!looksLikeContactDetail(text)) return null
  return (
    <div style={{fontSize:12,color:'#b45309',marginTop:4}}>
      ⚠ This looks like a phone number or email. Only put the meeting link here, never a client's contact details.
    </div>
  )
}

function ScheduleMeetingPanel({ staffUser, onDone, onCancel, showToast }) {
  const [clientCode, setClientCode] = useState('')
  const [otherCodes, setOtherCodes] = useState('')
  const [when, setWhen] = useState('')
  const [location, setLocation] = useState('')
  const [mode, setMode] = useState('in_person')
  const [byCode, setByCode] = useState({}) // PROFILE_CODE -> profile row (or null if not found)
  const [saving, setSaving] = useState(false)

  const client = parseProfileIds(clientCode)[0] || ''
  const others = parseProfileIds(otherCodes).filter(c => c !== client)

  // Live lookup so admin sees the names before fixing the meeting.
  useEffect(() => {
    const codes = [client, ...others].filter(c => c && !(c in byCode))
    if (codes.length === 0) return
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, profile_code, gender, age, city').in('profile_code', codes)
      const found = {}
      codes.forEach(c => { found[c] = null })
      ;(data || []).forEach(p => { found[p.profile_code.toUpperCase()] = p })
      setByCode(prev => ({ ...prev, ...found }))
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientCode, otherCodes])

  const who = (code) => {
    if (!(code in byCode)) return <span style={{color:'#bbb'}}>{code} — checking...</span>
    const p = byCode[code]
    if (!p) return <span style={{color:'#dc2626'}}>{code} — not found</span>
    return <span>{p.gender === 'Male' ? '👦' : p.gender === 'Female' ? '👧' : '●'} {p.full_name} · {p.profile_code}{p.age ? ` · ${p.age}y` : ''}{p.city ? ` · ${p.city}` : ''}</span>
  }

  const clientRow = client ? byCode[client] : null
  const otherRows = others.map(c => byCode[c])
  const sameGender = clientRow && otherRows.some(o => o && o.gender && o.gender === clientRow.gender)
  const ready = clientRow && others.length > 0 && otherRows.every(Boolean) && when && !saving

  const submit = async () => {
    if (!ready) return
    if (new Date(when).getTime() < Date.now() - 60000) { showToast('Meeting time cannot be in the past.'); return }
    setSaving(true)
    const scheduledAt = new Date(when).toISOString()
    const { data, error } = await supabase.rpc('admin_schedule_meeting', {
      p_client: clientRow.id,
      p_others: otherRows.map(o => o.id),
      p_scheduled_at: scheduledAt,
      p_location: location.trim() || null,
      // Only sent for virtual, so in-person keeps working on a DB that
      // hasn't run 20261011_virtual_meetings.sql yet.
      ...(mode === 'virtual' ? { p_meeting_mode: 'virtual' } : {}),
    })
    setSaving(false)
    if (error) {
      showToast(/admin_schedule_meeting|meeting_mode/.test(error.message)
        ? 'Run the 20261011_virtual_meetings.sql migration in Supabase first.'
        : error.message)
      return
    }
    await writeAuditLog(staffUser, 'admin_meeting_scheduled', clientRow.id, {
      other_profile_ids: otherRows.map(o => o.id), scheduled_at: scheduledAt, location: location.trim() || null, meeting_mode: mode,
      introduction_ids: (data || []).map(r => r.introduction_id),
    })
    showToast(`Meeting fixed with ${others.length} profile${others.length === 1 ? '' : 's'}.`)
    onDone((data || [])[0]?.introduction_id)
  }

  return (
    <div className="card" style={{marginBottom:16,padding:16}}>
      <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>Schedule a meeting</div>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:12}}>No share link needed. Add more than one Profile ID to fix one meeting with several profiles.</div>
      <div className="form-group">
        <label className="form-label">Client Profile ID</label>
        <input className="form-input" placeholder="e.g. MB00012" value={clientCode} onChange={e=>setClientCode(e.target.value)} />
        {client && <div style={{fontSize:12,marginTop:4}}>{who(client)}</div>}
      </div>
      <div className="form-group">
        <label className="form-label">Meeting with (Profile IDs)</label>
        <input className="form-input" placeholder="e.g. MB00045, MB00078" value={otherCodes} onChange={e=>setOtherCodes(e.target.value)} />
        {others.map(c => <div key={c} style={{fontSize:12,marginTop:4}}>{who(c)}</div>)}
        {sameGender && <div style={{fontSize:12,color:'#b45309',marginTop:4}}>⚠ Same gender as the client — check the Profile IDs.</div>}
      </div>
      <div className="form-group">
        <label className="form-label">Meeting type</label>
        <MeetingModeToggle value={mode} onChange={setMode} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Date & time</label>
          <input type="datetime-local" className="form-input" min={nowForDatetimeLocalMin()} value={when} onChange={e=>setWhen(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">{mode === 'virtual' ? 'Meeting link' : 'Location'}</label>
          <input className="form-input" placeholder={mode === 'virtual' ? 'e.g. https://zoom.us/j/...' : 'e.g. Cafe Coffee Day, Hazratganj'} value={location} onChange={e=>setLocation(e.target.value)} />
          {mode === 'virtual' && <ContactDetailWarning text={location} />}
        </div>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button className="btn btn-black btn-sm" disabled={!ready} onClick={submit}>
          {saving ? 'Saving...' : `Fix meeting${others.length > 1 ? ` (${others.length} profiles)` : ''}`}
        </button>
        <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

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
  const [modeDraft, setModeDraft] = useState({}) // request id -> 'in_person' | 'virtual' being edited
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
  // Every card action updates BOTH lists — while searching, the visible
  // cards come from searchResults, which used to stay stale after "Met",
  // "Schedule" etc. (audit 2026-10-11).
  const patchRequests = (fn) => {
    setRequests(fn)
    setSearchResults(prev => prev && fn(prev))
  }
  const [searching, setSearching] = useState(false)
  const [showScheduler, setShowScheduler] = useState(false)
  // "Send meeting details" now lives inside each profile's WhatsApp button
  // dropdown instead of its own standalone button (Aryan: "itna bada button
  // bna diya hai ... whatsapp wale button me hi dropdown me add kardo",
  // 2026-10-11) — one sheet, opened with whichever profile/vars were tapped.
  const [meetingReminder, setMeetingReminder] = useState(null) // { profile, vars, card } | null

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
      // rashi/nakshatra/pada: Next round "Horoscope review" Guna Milan inhi
      // se nikalta hai — pehle yahan load hi nahi hote the, to har request
      // par "Horoscope data not available" dikhta tha.
      const { data: profs } = await supabase.from('profiles').select('id, full_name, profile_code, client_phone, gender, rashi, nakshatra, nakshatra_pada, age, city, state, country, external_bureau_name, external_bureau_contact').in('id', ids)
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
      patchRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
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
      const now = new Date().toISOString()
      const patch = { decision, decision_at: now }
      if (decision === 'interested') patch.next_round_stage = 'horoscope_review'
      // Negative = yeh match yahin khatam. Pehle request "Met" par hi
      // Open tab mein padi rehti thi jab tak koi haath se Close na kare —
      // ab "Not Proceeding" jaisa hi seedha close hota hai (pair phir se
      // naya request ban sakta hai, 20261010_allow_rerequests_after_close).
      if (decision === 'not_interested') Object.assign(patch, { final_outcome: 'not_proceeding', final_outcome_at: now, status: 'closed' })
      const { error } = await supabase.from('introductions').update(patch).eq('id', id)
      if (error) throw error
      await writeAuditLog(staffUser, 'coordination_decision_recorded', id, patch)
      patchRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
      if (patch.status === 'closed') refreshPendingCount()
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
      patchRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
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
      patchRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
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
      patchRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
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
      patchRequests(prev => prev.map(r => r.id === id ? { ...r, viewed_at } : r))
    } catch (err) {
      showToast(err.message)
    }
  }

  // Call/meeting scheduling — introductions.scheduled_at, "Today's calls &
  // meetings" (My Queue) ko yahin se data milta hai. Reschedule ka purana
  // time overwrite hone se pehle profile_notes mein log hota hai, taaki
  // "pehle kab rakha tha, kyun badla" ki history na gayab ho (audit gap #4).
  // Older rows (or a DB without 20261011_virtual_meetings.sql) have no
  // meeting_mode — only send it when it's virtual or changing, so in-person
  // scheduling keeps working before the migration is run.
  const migrationHint = (err) => /meeting_mode/.test(err.message) ? 'Run the 20261011_virtual_meetings.sql migration in Supabase first.' : err.message
  const handleSchedule = async (id, datetimeLocal, prevScheduledAt, fromProfileId, location, mode, prevMode, prevStatus, prevDecision) => {
    const modePatch = (mode || 'in_person') !== (prevMode || 'in_person') ? { meeting_mode: mode || 'in_person' } : {}
    // admin_schedule_meeting (the "Schedule a meeting" panel's RPC) already
    // promotes pending/declined -> accepted the moment a time is fixed —
    // this inline per-request scheduler never did, so fixing a time on a
    // request the receiver hadn't even responded to (or had declined) left
    // the badge reading "Awaiting response"/"Declined" while a meeting was
    // now on the calendar for it (workflow audit, 2026-10-11). Only applies
    // when an actual new time is being set below, same as the RPC.
    // Same rule for a "Met" request with no decision recorded yet (round 3
    // of the audit, 2026-10-11): a brand-new future time fixed for it left
    // it reading "Meeting done" with an upcoming date and a stale 48h
    // decision countdown still running — reopen it the same way
    // admin_schedule_meeting's SQL now does. Once a decision IS recorded
    // the pipeline has moved on, so status is left untouched either way.
    const statusPatch = ['pending', 'declined'].includes(prevStatus) ? { status: 'accepted' }
      : (prevStatus === 'meeting_done' && !prevDecision) ? { status: 'accepted', decision_deadline: null }
      : {}
    // Editing only the location of an already-scheduled meeting used to do
    // nothing (no new date picked → silent return) — keep the existing
    // time and save the location. With nothing scheduled yet, say so
    // instead of ignoring the tap (audit 2026-10-10).
    if (!datetimeLocal) {
      if (!prevScheduledAt) { showToast('Pick a date and time first.'); return }
      try {
        const patch = { location: location || null, ...modePatch }
        const { error } = await supabase.from('introductions').update(patch).eq('id', id)
        if (error) throw error
        await writeAuditLog(staffUser, 'coordination_meeting_scheduled', id, { scheduled_at: prevScheduledAt, location: location || null, meeting_mode: mode || 'in_person', previous: prevScheduledAt })
        patchRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
        setModeDraft(prev => ({ ...prev, [id]: undefined }))
        showToast(mode === 'virtual' ? 'Meeting link saved.' : 'Location saved.')
      } catch (err) {
        showToast(migrationHint(err))
      }
      return
    }
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
      const patch = { scheduled_at: newWhen, location: location || null, ...modePatch, ...statusPatch }
      const { error } = await supabase.from('introductions').update(patch).eq('id', id)
      if (error) throw error
      await writeAuditLog(staffUser, 'coordination_meeting_scheduled', id, { scheduled_at: newWhen, location: location || null, meeting_mode: mode || 'in_person', previous: prevScheduledAt || null })
      setScheduleDraft(prev => ({ ...prev, [id]: undefined }))
      setModeDraft(prev => ({ ...prev, [id]: undefined }))
      patchRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
      if (statusPatch.status) refreshPendingCount()
    } catch (err) {
      showToast(migrationHint(err))
    }
  }

  const handleUnschedule = async (id, prevScheduledAt) => {
    try {
      const { error } = await supabase.from('introductions').update({ scheduled_at: null }).eq('id', id)
      if (error) throw error
      // Every other coordination action here (schedule, status change,
      // decision, feedback) writes an audit log entry — Clear silently
      // didn't, so a cleared meeting vanished from the History/audit trail
      // with no record of who cleared it or what time was lost (audit gap).
      await writeAuditLog(staffUser, 'coordination_meeting_cleared', id, { previous: prevScheduledAt || null })
      patchRequests(prev => prev.map(r => r.id === id ? { ...r, scheduled_at: null } : r))
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
      patchRequests(prev => prev.map(r => r.id === id ? { ...r, ...fb } : r))
    } catch (err) {
      showToast(err.message)
    }
  }

  // Tab filtering is server-side; search instead runs over searchResults
  // (every status, fetched separately above) once a query is typed, so it
  // isn't limited to whichever tab/page happens to be on screen.
  const filteredRequests = (searchResults ?? requests).filter(r => {
    const a = profilesById[r.from_profile], b = profilesById[r.to_profile]
    return matchesSearch(query, ...profileSearchBits(a), ...profileSearchBits(b), r.request_id, r.request_type, r.status, coordStatusLabel(r.status), r.location)
  })

  return (
    <div className="admin-view" style={{ maxWidth: 800 }}>
      <ToastView />
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} label={backLabel} />
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:14,flexWrap:'wrap'}}>
        <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,margin:0}}>Coordination Requests</h2>
        {!showScheduler && (
          <button className="btn btn-black btn-sm" onClick={()=>setShowScheduler(true)}>
            <CalendarClock size={14} /> Schedule Meeting
          </button>
        )}
      </div>
      {showScheduler && (
        <ScheduleMeetingPanel staffUser={staffUser} showToast={showToast}
          onCancel={()=>setShowScheduler(false)}
          onDone={()=>{ setShowScheduler(false); setQuery(''); if (tab === 'open') load(); else setTab('open') }} />
      )}
      {requests.length > 0 && <ListSearch value={query} onChange={setQuery} placeholder="Search" />}

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
                      {r.request_type === 'meeting' ? (isVirtualMeeting(r) && r.scheduled_at ? 'Virtual meeting request' : 'Meeting request') : 'Talk request'}
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
                        meeting) — audit gap #4.
                        Naam sirf header mein ek baar ("X → Y") — yahan dobara
                        poora naam nahi, sirf Profile ID (Aryan: naam baar baar
                        repeat ho raha tha — uper bhi, niche bhi, 2026-10-11). */}
                    {[from, to].filter(Boolean).map((x, idx) => {
                      const other = x.id === from?.id ? to : from
                      return (
                      <div key={x.id} style={idx > 0 ? {marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)'} : {marginTop:6}}>
                        {x.profile_code && (
                          <div style={{fontSize:11,fontFamily:'monospace',color:'#8e8e8e',marginBottom:2,display:'flex',alignItems:'center',gap:6}}>
                            {x.profile_code}
                            <AddNoteButton profile={x} introductionId={r.id} />
                          </div>
                        )}
                        <ProfileContact profile={x} compact logCalls introductionId={r.id} staffUser={staffUser}
                          onSaved={(phone)=>setProfilesById(prev=>({ ...prev, [x.id]: { ...prev[x.id], client_phone: phone } }))}
                          whatsappMenuExtra={r.scheduled_at ? [{
                            label: 'Send meeting details', icon: CalendarClock,
                            // A real visual card (MeetingCard, shared via the
                            // native share sheet) instead of a plain-text
                            // WhatsApp message locked to one number — Aryan:
                            // "esa ganda sa template... accha sa card ban kar
                            // ... jaruri nhi ki usi ke whatsapp number par jaye"
                            // (2026-10-11). The plain-text send still exists
                            // underneath (ReminderSheet's `card` prop just
                            // adds the card on top, see WhatsAppReminder.js).
                            onClick: () => setMeetingReminder({ profile: x, vars: {
                              otherName: (other?.full_name || 'the other member')
                                + (other?.age || other?.city ? ` (${[other?.age && `${other.age} yrs`, other?.city].filter(Boolean).join(', ')})` : ''),
                              when: new Date(r.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                                + (isVirtualMeeting(r)
                                  ? ` (virtual meeting${r.location ? `, join here: ${meetingLinkHref(r.location) || r.location}` : ''})`
                                  : (r.location ? ` at ${r.location}` : '')) },
                              card: {
                                name: x.full_name,
                                otherName: other?.full_name || 'the other member',
                                otherAge: other?.age, otherCity: other ? shareRegion(other) : null, otherCode: other?.profile_code,
                                date: new Date(r.scheduled_at).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
                                time: new Date(r.scheduled_at).toLocaleTimeString('en-IN', { timeStyle: 'short' }),
                                location: r.location || '',
                                virtual: isVirtualMeeting(r),
                                requestId: r.request_id,
                                // Same editable RM contact the share-link pages show
                                // (ShareProfileCard.js's RM box, staff_users.rm_*) —
                                // Aryan asked for the meeting card to carry it too,
                                // with WhatsApp opening a pre-filled message instead
                                // of a blank chat (2026-10-11).
                                rmName: staffUser?.rm_name, rmPhone: staffUser?.rm_phone, rmEmail: staffUser?.rm_email,
                              } }),
                          }] : undefined} />
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
                    <MeetingPlace r={r} style={{maxWidth:180,justifyContent:'flex-end'}} />
                  </div>
                </div>
                {/* Schedule a call/meeting time — My Queue ke "Today" section mein
                    dikhta hai. min=now blocks past dates (audit 2026-10-08, P1 #14);
                    location field reuses introductions.location (audit P1 #15).
                    Guard: scheduling/rescheduling blocked on closed deals — a
                    closed request must stay closed (audit 2026-10-10 bug fix). */}
                {r.status !== 'closed' && (
                <div style={{display:'flex',alignItems:'center',gap:6,marginTop:8,flexWrap:'wrap'}} onClick={e=>e.stopPropagation()}>
                  <CalendarClock size={13} color="#8e8e8e" />
                  <input type="datetime-local" className="form-input" style={{fontSize:12,padding:'7px 12px',width:190}}
                    min={nowForDatetimeLocalMin()}
                    value={scheduleDraft[r.id] ?? toDatetimeLocalValue(r.scheduled_at)}
                    onChange={e=>setScheduleDraft(prev=>({ ...prev, [r.id]: e.target.value }))} />
                  <MeetingModeToggle value={modeDraft[r.id] ?? r.meeting_mode} onChange={v=>setModeDraft(prev=>({ ...prev, [r.id]: v }))} size={12} />
                  <input type="text" className="form-input" placeholder={locationPlaceholder(modeDraft[r.id] ?? r.meeting_mode)}
                    style={{fontSize:12,padding:'7px 12px',width:200}}
                    value={locationDraft[r.id] ?? r.location ?? ''}
                    onChange={e=>setLocationDraft(prev=>({ ...prev, [r.id]: e.target.value }))} />
                  {(modeDraft[r.id] ?? r.meeting_mode) === 'virtual' && <ContactDetailWarning text={locationDraft[r.id] ?? r.location} />}
                  <button className="btn btn-outline btn-sm" style={{padding:'7px 14px',fontSize:13}}
                    onClick={()=>handleSchedule(r.id, scheduleDraft[r.id], r.scheduled_at, r.from_profile, locationDraft[r.id] ?? r.location, modeDraft[r.id] ?? r.meeting_mode, r.meeting_mode, r.status, r.decision)}>
                    {r.scheduled_at ? 'Reschedule' : 'Schedule'}
                  </button>
                  {r.scheduled_at && (
                    <button className="btn btn-outline btn-sm" style={{padding:'7px 14px',fontSize:13,color:'#dc2626',borderColor:'#dc2626'}}
                      onClick={()=>handleUnschedule(r.id, r.scheduled_at)}>Clear</button>
                  )}
                </div>
                )}
                <div style={{display:'flex',gap:6,marginTop:8,alignItems:'center',justifyContent:'flex-end'}}>
                  <OverflowMenu items={[
                    { label: 'Mark viewed', icon: Eye, onClick: () => handleMarkViewed(r.id), hidden: !!r.viewed_at },
                    // With no members using the app yet, the receiving family
                    // answers by phone — admin records their yes/no here instead
                    // of the request sitting on "Awaiting response" (audit 2026-10-10).
                    { label: 'Accepted (family said yes)', icon: CheckCircle2, color: '#16a34a', onClick: () => handleAction(r.id, 'accepted'), hidden: r.status !== 'pending' },
                    { label: 'Declined (family said no)', icon: ThumbsDown, color: '#dc2626', onClick: () => handleAction(r.id, 'declined'), hidden: r.status !== 'pending' },
                    { label: 'Called', icon: Phone, color: '#b45309', onClick: () => handleAction(r.id, 'contacted'), hidden: ['contacted', 'meeting_done', 'closed'].includes(r.status) },
                    { label: 'Met', icon: Handshake, color: '#7c3aed', onClick: () => handleAction(r.id, 'meeting_done'), hidden: r.status === 'meeting_done' || r.status === 'closed' },
                    { label: 'Close', icon: X, onClick: () => { if (window.confirm('Close this request? All its actions will be hidden.')) handleAction(r.id, 'closed') }, hidden: r.status === 'closed' },
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
                    onDiscloseAndComplete={()=>{ if (window.confirm('Share contact details and mark this as a successful match?')) handleDiscloseAndComplete(r.id) }}
                    onNotProceeding={()=>{ if (window.confirm('Mark as not proceeding? This closes the request.')) handleNotProceeding(r.id) }} />
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
      {/* "Send meeting details" — opened from the WhatsApp button's own
          dropdown per profile (see whatsappMenuExtra above) instead of a
          standalone button on every card (Aryan, 2026-10-11). One shared
          sheet, since only one can be open at a time. */}
      {meetingReminder && (
        <ReminderSheet profile={meetingReminder.profile} eventType="meeting_scheduled" vars={meetingReminder.vars} card={meetingReminder.card}
          staffUserId={staffUser?.user_id} onClose={() => setMeetingReminder(null)} />
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
        <button className="btn btn-outline btn-sm" onClick={() => { if (window.confirm('Record a Negative decision? This closes the request.')) onDecide('not_interested') }}>👎 Negative</button>
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
  // The house-visit date used to carry over into the Final Meeting field
  // (audit 2026-10-11).
  useEffect(() => { setDateDraft('') }, [stage])
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
  const [query, setQuery] = useState('')
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
    // A load error used to look like "nothing waiting" (audit 2026-10-11).
    if (error) showToast('Could not load the queue: ' + error.message)
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

  // Search (2026-10-10) — loaded queue rows by name/ID/phone/city.
  const searched = profiles.filter(p => matchesSearch(query, ...profileSearchBits(p)))
  const sections = [
    { key: 'review', title: 'Selfie received — compare & verify', items: searched.filter(p => p.verification_status === 'selfie_submitted' || (p.id_document_uploaded && p.verification_status !== 'selfie_requested')) },
    { key: 'request', title: 'New sign-ups — request a selfie', items: searched.filter(p => !p.is_admin_managed && ['not_started', 'rejected'].includes(p.verification_status || 'not_started') && !p.id_document_uploaded) },
    { key: 'waiting', title: 'Waiting for the user\'s selfie', items: searched.filter(p => p.verification_status === 'selfie_requested') },
  ]

  return (
    <div className="admin-view" style={{ maxWidth: 800 }}>
      <ToastView />
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} />
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Verification Queue</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>Self-signup profiles go live only after their selfie is matched with their photo and verified</div>
      {profiles.length > 0 && <ListSearch value={query} onChange={setQuery} placeholder="Search" />}

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : profiles.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Nothing waiting on verification right now.</div>
      ) : searched.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>No profiles in this queue match "{query}".</div>
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
    if (error) { showToast('Could not load reports: ' + error.message); setLoading(false); setLoadingMore(false); return }
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
    <div className="admin-view" style={{ maxWidth: 800 }}>
      <ToastView />
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} />
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Reports Queue</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>Profiles reported by other members, awaiting review</div>
      {reports.length > 0 && <ListSearch value={query} onChange={setQuery} placeholder="Search" />}

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
function FollowUpsSection({ items, onOpenProfile, onDone, hideTitle }) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ContactButtons phone={n.profiles?.client_phone} logProfile={n.profiles} />
          {onDone && (
            <button className="btn btn-outline btn-sm" style={{ padding: '6px 10px', fontSize: 12, color: '#16a34a', borderColor: '#16a34a' }}
              title="Mark this follow-up as done" onClick={e => { e.stopPropagation(); onDone(n) }}>✓ Done</button>
          )}
        </div>
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
      {!hideTitle && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#8e8e8e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          <Clock size={14} /> Follow-ups {items.length > 0 && `(${items.length})`}
        </div>
      )}
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
  const [showToast, ToastView] = useToast()
  const [loading, setLoading] = useState(true)
  const [overdueFollowUps, setOverdueFollowUps] = useState([])
  const [assignedPending, setAssignedPending] = useState([])
  const [newSubmissions, setNewSubmissions] = useState([])
  const [upcomingMeetings, setUpcomingMeetings] = useState([])
  const [meetingsTotal, setMeetingsTotal] = useState(0) // true count in the 7-day window — the list itself is capped at 20 (scale audit #7)
  const [pendingCoordination, setPendingCoordination] = useState([])
  const [decisionsDue, setDecisionsDue] = useState([])
  // Share-link clients (no login) who tapped "👍 Interested" and admin
  // hasn't acted on yet — audit gap, 2026-10-05: this signal didn't exist
  // before, and there was no way to tell which client a link was even for.
  const [shareInterest, setShareInterest] = useState([])
  // Share-link clients who tapped "Not Interested" (Aryan, 2026-10-10).
  // Informational only — no dedicated ack column; admin sees it here and in Share Links.
  const [shareNotInterested, setShareNotInterested] = useState([])
  // Bureau shares where the other bureau replied "found a match" — had a
  // Dashboard badge but no My Queue list (audit 2026-10-11).
  const [bureauReplies, setBureauReplies] = useState([])
  // Both sides liked each other on a share link, not yet connected — same
  // computeMutualLikes() pairing ShareLinksView and the Dashboard card use
  // (Aryan, 2026-10-12: this needed its own place here too, not just My
  // Share Links).
  const [mutualLikes, setMutualLikes] = useState([])
  const [forwardingMutual, setForwardingMutual] = useState({})
  // Admin-only: how much pending work each staff member is carrying, so a
  // bulk burst of new profiles/requests can be spread out instead of
  // landing on whoever happens to click first (scale audit #8).
  const [staffWorkload, setStaffWorkload] = useState(null) // null = not loaded / not admin
  // One search box across every My Queue section (2026-10-10, universal
  // search ask) — name / Profile ID / phone / city / note / location.
  const [query, setQuery] = useState('')
  // Which My Queue tab is open — remembered for the session so "Manage" →
  // Back returns to the same list.
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('myQueueTab') } catch { return null } })
  const inQueue = (list, bitsOf) => list.filter(x => matchesSearch(query, ...bitsOf(x)))

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const nowIso = new Date().toISOString()
    const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString()
    const weekFromNow = new Date(Date.now() + 7*24*60*60*1000).toISOString()
    // Past meetings still show (as Overdue) — but only from the last 30
    // days. With no lower bound, months-old unmarked calls filled all 20
    // slots and pushed today's meetings off the list (audit 2026-10-11).
    const monthAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString()
    const [followUpsRes, assignedRes, newRes, meetingsRes, meetingsCountRes, pendingCoordRes, shareInterestRes, shareNotInterestedRes, decisionsRes, bureauRes, mutualRes] = await Promise.all([
      // Was lte(nowIso) only — upcoming follow-ups (due later this week)
      // never got fetched at all, so there was nothing to group into an
      // "Upcoming" section (audit 2026-10-08, P1 #11 re-scope).
      supabase.from('profile_notes').select('*, profiles(id, full_name, profile_code, client_phone)').lte('follow_up_at', weekFromNow).order('follow_up_at', { ascending: true }).limit(20),
      supabase.from('profiles').select('id, full_name, profile_code, age, city, profile_status, client_phone').eq('managed_by_staff_id', staffUser.user_id).eq('profile_status', 'pending').limit(20),
      supabase.from('profiles').select('id, full_name, profile_code, age, city, created_at, client_phone').eq('profile_status', 'pending').gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(20),
      // Scheduled calls/meetings (introductions.scheduled_at) due in the next 7 days, soonest first.
      // Filter out closed deals — a closed deal with a past meeting date was showing indefinitely as
      // "upcoming call" in My Queue, confusing staff into thinking it was still active (audit 2026-10-10).
      // Pehle sirf `scheduled_at >= abhi` aata tha — aaj subah ki meeting
      // dopahar tak list se gayab, aur jo meeting ho chuki par "Met" mark
      // nahi hui wo kahin nahi dikhti thi. Ab past meetings bhi aati hain
      // jab tak Met/Closed/Declined na ho (upar "Overdue" ke saath).
      supabase.from('introductions').select('*').gte('scheduled_at', monthAgo).lte('scheduled_at', weekFromNow).not('status', 'in', '(closed,meeting_done,declined)').order('scheduled_at', { ascending: true }).limit(20),
      // Same window + same filter — so a burst of >20 meetings shows "+N more" instead of silently hiding them (scale audit #7)
      supabase.from('introductions').select('*', { count: 'exact', head: true }).gte('scheduled_at', monthAgo).lte('scheduled_at', weekFromNow).not('status', 'in', '(closed,meeting_done,declined)'),
      // Coordination requests awaiting the receiver's accept/decline — previously
      // invisible to admin anywhere. Folded in here per Aryan's ask (2026-10-03).
      supabase.from('introductions').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
      // Share-link clients who tapped "👍 Interested" — audit gap, 2026-10-05.
      supabase.from('share_links').select('*').not('interested_at', 'is', null).is('interest_acknowledged_at', null).order('interested_at', { ascending: false }).limit(20),
      // Share-link clients who tapped "Not Interested" — only unacknowledged (audit gap, 2026-10-10).
      supabase.from('share_links').select('*').not('not_interested_at', 'is', null).is('not_interest_acknowledged_at', null).order('not_interested_at', { ascending: false }).limit(20),
      // Meeting ho gayi ("Met"), 48 ghante mein Positive/Negative decision
      // chahiye — yeh list pehle sirf Coordination card par dikhti thi.
      supabase.from('introductions').select('*').eq('status', 'meeting_done').is('decision', null).order('decision_deadline', { ascending: true, nullsFirst: false }).limit(20),
      supabase.from('share_links').select('*').not('bureau_reply', 'is', null).is('bureau_reply_acknowledged_at', null).order('bureau_replied_at', { ascending: false }).limit(20),
      // Both sides liked each other — computeMutualLikes() does the pairing below.
      supabase.from('share_links').select(MUTUAL_LIKES_COLUMNS).not('interested_at', 'is', null),
    ])
    setOverdueFollowUps(followUpsRes.data || [])
    setAssignedPending(assignedRes.data || [])
    setNewSubmissions(newRes.data || [])
    setMeetingsTotal(meetingsCountRes.count || 0)

    const meetings = meetingsRes.data || []
    const pendingReqs = pendingCoordRes.data || []
    const shareInterestRows = shareInterestRes.data || []
    const shareNotInterestedRows = shareNotInterestedRes.data || []
    const decisions = decisionsRes.data || []
    const bureauRows = bureauRes.data || []
    // Only the ones still needing a "→ Connect for a meeting" click — once
    // forwarded it already has its own introduction/meeting flow elsewhere.
    const mutualPairs = computeMutualLikes(mutualRes.data || []).filter(p => !p.forwardedAt)
      .sort((a, b) => new Date(b.mutualAt) - new Date(a.mutualAt))
    const ids = [...new Set([...meetings, ...pendingReqs, ...decisions].flatMap(m => [m.from_profile, m.to_profile]).concat([...shareInterestRows, ...shareNotInterestedRows, ...bureauRows].flatMap(s => [s.profile_id, s.client_profile_id])).concat(mutualPairs.flatMap(p => [p.profileId, p.clientProfileId])).filter(Boolean))]
    let profilesById = {}
    if (ids.length > 0) {
      // external_bureau_* too — ProfileContact reads them; without them a
      // bureau-sourced profile showed "+ Mark as external bureau profile"
      // even when already tagged (audit 2026-10-11).
      const { data: profs } = await supabase.from('profiles').select('id, full_name, profile_code, client_phone, external_bureau_name, external_bureau_contact').in('id', ids)
      ;(profs || []).forEach(p => { profilesById[p.id] = p })
    }
    setUpcomingMeetings(meetings.map(m => ({ ...m, fromProfile: profilesById[m.from_profile], toProfile: profilesById[m.to_profile] })))
    setPendingCoordination(pendingReqs.map(m => ({ ...m, fromProfile: profilesById[m.from_profile], toProfile: profilesById[m.to_profile] })))
    setDecisionsDue(decisions.map(m => ({ ...m, fromProfile: profilesById[m.from_profile], toProfile: profilesById[m.to_profile] })))
    setShareInterest(shareInterestRows.map(s => ({ ...s, shownProfile: profilesById[s.profile_id], clientProfile: s.client_profile_id ? profilesById[s.client_profile_id] : null })))
    setShareNotInterested(shareNotInterestedRows.map(s => ({ ...s, shownProfile: profilesById[s.profile_id], clientProfile: s.client_profile_id ? profilesById[s.client_profile_id] : null })))
    setBureauReplies(bureauRows.map(s => ({ ...s, shownProfile: profilesById[s.profile_id] })))
    setMutualLikes(mutualPairs.map(p => ({ ...p, profileA: profilesById[p.profileId], profileB: profilesById[p.clientProfileId] })))

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

  const handleFollowUpDone = async (n) => {
    if (await completeFollowUp(n, showToast)) setOverdueFollowUps(prev => prev.filter(x => x.id !== n.id))
  }

  const handleAcknowledgeShareInterest = async (linkId) => {
    try {
      await acknowledgeShareLinkInterest(linkId)
      setShareInterest(prev => prev.filter(s => s.id !== linkId))
    } catch (err) {
      console.error(err.message)
    }
  }

  // Not-interested rows and bureau replies had no way to be cleared from
  // My Queue, so their Dashboard badges never went away (audit 2026-10-11).
  const handleAcknowledgeNotInterested = async (linkId) => {
    try {
      await acknowledgeShareLinkNotInterested(linkId)
      setShareNotInterested(prev => prev.filter(s => s.id !== linkId))
    } catch (err) {
      showToast(err.message)
    }
  }
  const handleAcknowledgeBureauReply = async (linkId) => {
    try {
      await acknowledgeBureauReply(linkId)
      setBureauReplies(prev => prev.filter(s => s.id !== linkId))
    } catch (err) {
      showToast(err.message)
    }
  }

  // Same forward_share_link_interest RPC + same stay-on-page pattern as
  // ShareLinksView's "→ Connect for a meeting" button — one click creates
  // the single meeting request for the pair (20261011_workflow_audit_fixes.sql).
  const handleConnectMutual = async (pair) => {
    setForwardingMutual(prev => ({ ...prev, [pair.id]: true }))
    try {
      let introId
      try {
        introId = await forwardShareLinkInterest(pair.id)
      } catch (err) {
        // The RPC only forwards a link the calling admin created — the
        // pair's two rows aren't always owned by the same staff member, so
        // retry on the other side before giving up (audit 2026-10-12).
        if (!pair.altId || pair.altId === pair.id) throw err
        introId = await forwardShareLinkInterest(pair.altId)
      }
      setMutualLikes(prev => prev.filter(p => p.id !== pair.id))
      showToast(introId ? 'Connected — a meeting request was created.' : 'Both profiles notified.')
    } catch (err) {
      showToast(err.message)
    } finally {
      setForwardingMutual(prev => { const next = { ...prev }; delete next[pair.id]; return next })
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
  const isPastDay = (iso) => { const d = new Date(); d.setHours(0, 0, 0, 0); return new Date(iso) < d }

  const fmt = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })
  const pairName = (r) => <>{r.fromProfile?.full_name || 'Unknown'} → {r.toProfile?.full_name || 'Unknown'}</>
  const manageBtn = (id) => onManageCoordination && (
    <button className="btn btn-outline btn-sm" style={{padding:'6px 12px',fontSize:13}} onClick={()=>onManageCoordination(id)}>Manage</button>
  )
  const openShareBtn = onOpenShareLinks && (
    <button className="btn btn-outline btn-sm" style={{padding:'6px 12px',fontSize:13}} onClick={onOpenShareLinks}>Open</button>
  )
  const profileRow = (p) => (
    <div key={p.id} className="list-row clickable" onClick={()=>onOpenProfile(p)}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
        <div>
          <div style={{fontSize:13,fontWeight:600}}>{p.full_name}</div>
          <div style={{fontSize:12,color:'#8e8e8e'}}>{[p.age && `${p.age}y`, p.city, p.profile_code].filter(Boolean).join(' · ')}</div>
        </div>
        <ContactButtons phone={p.client_phone} logProfile={p} />
      </div>
    </div>
  )

  // ===== TABS (Aryan, 2026-10-11): nine sections used to be stacked in one
  // long scroll. Now a tile grid on top doubles as the tab bar — every
  // count visible at a glance, one list on screen at a time.
  const tabs = [
    // Both sides liked each other, not yet connected — Aryan, 2026-10-12:
    // "sabse important cheez hai", leads the tile grid.
    { key: 'mutualLikes', icon: HeartHandshake, label: 'Liked each other', color: '#C2185B',
      items: inQueue(mutualLikes, p => [...profileSearchBits(p.profileA), ...profileSearchBits(p.profileB)]),
      empty: 'No mutual likes waiting to be connected right now.',
      render: p => (
        <div key={p.id} className="list-row resp-row-interested">
          <div style={{fontSize:13,fontWeight:600}}>
            {p.profileA?.full_name || 'Profile'} <Heart size={11} style={{color:'#C2185B',verticalAlign:'middle'}} /> {p.profileB?.full_name || 'Profile'}
          </div>
          <div style={{marginTop:6}}>
            <span style={{fontSize:12,fontWeight:600,color:'#fff',background:'#C2185B',borderRadius:8,padding:'5px 10px',display:'inline-flex',alignItems:'center',gap:6}}>
              <ThumbsUp size={12} /> Both liked each other · {fmt(p.mutualAt)}
            </span>
          </div>
          <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
            {p.profileA?.client_phone && <ContactButtons phone={p.profileA.client_phone} logProfile={p.profileA} />}
            {p.profileB?.client_phone && <ContactButtons phone={p.profileB.client_phone} logProfile={p.profileB} />}
            {openShareBtn}
            <button className="btn btn-black btn-sm" style={{padding:'5px 10px',fontSize:12}}
              disabled={forwardingMutual[p.id]} onClick={()=>handleConnectMutual(p)}
              title="Creates the one meeting request for this pair">
              {forwardingMutual[p.id] ? 'Connecting...' : '→ Connect for a meeting'}
            </button>
          </div>
        </div>
      ) },
    { key: 'interested', icon: ThumbsUp, label: 'Clients interested', color: '#C2185B',
      items: inQueue(shareInterest, s => [...profileSearchBits(s.shownProfile), ...profileSearchBits(s.clientProfile), s.share_id]),
      empty: 'No unread interest from share links right now.',
      render: s => (
        <div key={s.id} className="list-row resp-row-interested">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
            <div style={{fontSize:13,fontWeight:600}}>
              {s.shownProfile?.full_name || 'Profile'}
              {s.clientProfile && <span style={{fontWeight:400,color:'#8e8e8e'}}> · for {s.clientProfile.full_name}</span>}
            </div>
            {openShareBtn}
          </div>
          <div style={{marginTop:6}}><span className="resp-badge resp-interested"><ThumbsUp size={12} /> Interested · {fmt(s.interested_at)}</span></div>
          <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
            {s.clientProfile?.client_phone && <ContactButtons phone={s.clientProfile.client_phone} logProfile={s.clientProfile} />}
            <button className="btn btn-outline btn-sm" onClick={()=>handleAcknowledgeShareInterest(s.id)}>Mark as noted</button>
          </div>
        </div>
      ) },
    { key: 'notInterested', icon: ThumbsDown, label: 'Not interested', color: '#475569',
      items: inQueue(shareNotInterested, s => [...profileSearchBits(s.shownProfile), ...profileSearchBits(s.clientProfile), s.share_id]),
      empty: 'Nobody has said Not Interested since you last checked.',
      render: s => (
        <div key={s.id} className="list-row resp-row-not">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
            <div style={{fontSize:13,fontWeight:600}}>
              {s.shownProfile?.full_name || 'Profile'}
              {s.clientProfile && <span style={{fontWeight:400,color:'#8e8e8e'}}> · for {s.clientProfile.full_name}</span>}
            </div>
            {openShareBtn}
          </div>
          <div style={{display:'flex',gap:8,marginTop:6,alignItems:'center',flexWrap:'wrap'}}>
            <span className="resp-badge resp-not"><ThumbsDown size={12} /> Not interested · {fmt(s.not_interested_at)}</span>
            <button className="btn btn-outline btn-sm" style={{padding:'4px 10px',fontSize:12}} onClick={()=>handleAcknowledgeNotInterested(s.id)}>Noted</button>
          </div>
        </div>
      ) },
    { key: 'bureau', icon: Building2, label: 'Bureau replies', color: '#1D4ED8', hideWhenEmpty: true,
      items: inQueue(bureauReplies, s => [...profileSearchBits(s.shownProfile), s.bureau_reply, s.share_id]),
      empty: 'No bureau replies waiting.',
      render: s => (
        <div key={s.id} className="list-row resp-row-bureau">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
            <div style={{fontSize:13,fontWeight:600}}>{s.shownProfile?.full_name || 'Profile'}</div>
            {openShareBtn}
          </div>
          <div style={{marginTop:6}}><span className="resp-badge resp-bureau"><Building2 size={12} /> Bureau found a match · {fmt(s.bureau_replied_at)}</span></div>
          <div style={{fontSize:13,color:'#333',marginTop:6,whiteSpace:'pre-wrap'}}>{s.bureau_reply}</div>
          <button className="btn btn-outline btn-sm" style={{marginTop:8}} onClick={()=>handleAcknowledgeBureauReply(s.id)}>Mark as noted</button>
        </div>
      ) },
    { key: 'coordination', icon: Handshake, label: 'Awaiting response', color: '#7c3aed',
      items: inQueue(pendingCoordination, r => [...profileSearchBits(r.fromProfile), ...profileSearchBits(r.toProfile), r.request_id, r.request_type]),
      empty: 'Nothing waiting on a member right now.',
      render: r => (
        <div key={r.id} className="list-row">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
            <div style={{fontSize:13,fontWeight:600}}>
              {pairName(r)}
              <span style={{fontWeight:400,color:'#8e8e8e'}}> · {r.request_type === 'meeting' ? 'Meeting' : 'Talk'} request</span>
            </div>
            {manageBtn(r.id)}
          </div>
          <div style={{fontSize:12,color:'#8e8e8e',marginTop:2}}>Sent {new Date(r.created_at).toLocaleDateString('en-IN')} · waiting on {r.toProfile?.full_name || 'receiver'} to accept</div>
          <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:8}}>
            {[r.fromProfile, r.toProfile].filter(Boolean).map(x => (
              <div key={x.id}>
                <div style={{fontSize:13,color:'#8e8e8e',marginBottom:2}}>{x.full_name}</div>
                <ProfileContact profile={x} logCalls introductionId={r.id} staffUser={staffUser} compact onSaved={(phone)=>updatePendingContact(x.id, phone)} />
              </div>
            ))}
          </div>
        </div>
      ) },
    { key: 'meetings', icon: CalendarClock, label: 'Calls & meetings', color: '#2563eb',
      items: inQueue(upcomingMeetings, m => [...profileSearchBits(m.fromProfile), ...profileSearchBits(m.toProfile), m.request_id, m.location]),
      empty: 'Nothing scheduled.',
      hint: meetingsTotal > upcomingMeetings.length ? `Showing the first ${upcomingMeetings.length}. ${meetingsTotal - upcomingMeetings.length} more are scheduled; open Coordination to see them all.` : 'Next 7 days, plus unmarked ones from the last 30 days.',
      render: m => (
        <div key={m.id} className="list-row" style={isPastDay(m.scheduled_at) ? { borderLeft: '4px solid #dc2626' } : isToday(m.scheduled_at) ? { borderLeft: '4px solid #2563eb' } : {}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
            <div>
              <div style={{fontSize:13,fontWeight:600}}>
                {pairName(m)}
                <span style={{fontWeight:400,color:'#8e8e8e'}}> · {m.request_type === 'meeting' ? (isVirtualMeeting(m) ? 'Virtual meeting' : 'Meeting') : 'Talk'}</span>
              </div>
              <div style={{fontSize:13,color: isPastDay(m.scheduled_at) ? '#dc2626' : isToday(m.scheduled_at) ? '#2563eb' : '#666',marginTop:2,fontWeight: isToday(m.scheduled_at) || isPastDay(m.scheduled_at) ? 600 : 400}}>
                {isPastDay(m.scheduled_at) ? 'Overdue · ' : ''}
                {isToday(m.scheduled_at) ? 'Today' : new Date(m.scheduled_at).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' })}
                {' · '}{new Date(m.scheduled_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}
                {isPastDay(m.scheduled_at) && <span style={{fontWeight:400,color:'#8e8e8e'}}> (mark Met or reschedule)</span>}
              </div>
              <MeetingPlace r={m} style={{marginTop:2}} />
            </div>
            {manageBtn(m.id)}
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
      ) },
    { key: 'decisions', icon: CheckCircle2, label: 'Decisions due', color: '#b45309',
      items: inQueue(decisionsDue, m => [...profileSearchBits(m.fromProfile), ...profileSearchBits(m.toProfile), m.request_id]),
      empty: 'No meeting is waiting on a Positive/Negative decision.',
      render: m => {
        const overdue = m.decision_deadline && new Date(m.decision_deadline) < new Date()
        return (
          <div key={m.id} className="list-row" style={overdue ? { borderLeft: '4px solid #dc2626' } : {}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{pairName(m)}</div>
                <div style={{fontSize:12,color: overdue ? '#dc2626' : '#b45309',marginTop:2,fontWeight:600}}>
                  {m.decision_deadline ? `${overdue ? 'Decision overdue since' : 'Decide by'} ${fmt(m.decision_deadline)}` : 'Met, decision pending'}
                </div>
              </div>
              {manageBtn(m.id)}
            </div>
          </div>
        )
      } },
    { key: 'followups', icon: Clock, label: 'Follow-ups', color: '#dc2626',
      items: inQueue(overdueFollowUps, n => [...profileSearchBits(n.profiles), n.note]),
      custom: (items) => <FollowUpsSection items={items} onOpenProfile={onOpenProfile} onDone={handleFollowUpDone} hideTitle /> },
    { key: 'pending', icon: ListChecks, label: 'My pending profiles', color: '#b45309',
      items: inQueue(assignedPending, profileSearchBits), empty: 'No pending profiles assigned to you.',
      hint: 'Your assigned profiles still pending approval (up to 20).', render: profileRow },
    { key: 'new', icon: Users, label: 'New this week', color: '#0891b2',
      items: inQueue(newSubmissions, profileSearchBits), empty: 'No new submissions this week.', render: profileRow },
    ...(staffWorkload !== null ? [{ key: 'team', icon: UserCog, label: 'Team workload', color: '#555', count: staffWorkload.length,
      items: staffWorkload, empty: 'No active staff found.',
      render: s => (
        <div key={s.user_id} className="list-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{s.email}</div>
            <div style={{ fontSize: 13, color: '#8e8e8e', textTransform: 'capitalize' }}>{s.role.replace('_', ' ')}</div>
          </div>
          <div className="badge" style={{ fontSize: 13, background: s.pendingCount > 0 ? '#fff8e1' : '#f5f5f5', color: s.pendingCount > 0 ? '#b45309' : '#555' }}>
            {s.pendingCount} pending
          </div>
        </div>
      ) }] : []),
  ].filter(t => !t.hideWhenEmpty || t.items.length > 0)

  // Default to the first tab that actually has something in it.
  const firstBusy = (tabs.find(t => t.key !== 'team' && t.items.length > 0) || tabs[0]).key
  const activeKey = tabs.some(t => t.key === tab) ? tab : firstBusy
  const active = tabs.find(t => t.key === activeKey)
  const pickTab = (k) => {
    setTab(k)
    try { sessionStorage.setItem('myQueueTab', k) } catch {}
  }

  return (
    <div className="admin-view" style={{ maxWidth: 900 }}>
      <ToastView />
      <ViewTopBar onBack={onBack} onRefresh={load} loading={loading} />
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>My Queue</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:16}}>Tap a box to see that list.</div>
      {!loading && <ListSearch value={query} onChange={setQuery} placeholder="Search" />}

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : (
        <>
          <div className="queue-tiles" role="tablist">
            {tabs.map(t => {
              const n = t.count ?? t.items.length
              return (
                <button key={t.key} type="button" role="tab" aria-selected={t.key === activeKey}
                  className={'queue-tile' + (t.key === activeKey ? ' active' : '') + (n === 0 ? ' zero' : '')}
                  onClick={() => pickTab(t.key)}>
                  <t.icon size={16} color={t.color} />
                  <span className="qt-count" style={{ color: t.color }}>{n}</span>
                  <span className="qt-label">{t.label}</span>
                </button>
              )
            })}
          </div>

          <div className="queue-section-title"><active.icon size={16} color={active.color} />{active.label}</div>
          {active.hint && <div style={{ fontSize: 12, color: '#8e8e8e', marginBottom: 10 }}>{active.hint}</div>}
          <div style={{ marginTop: 10 }}>
            {active.custom ? active.custom(active.items) : active.items.length === 0 ? (
              <div style={{ fontSize: 13, color: '#8e8e8e', padding: '18px 0' }}>{active.empty}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{active.items.map(active.render)}</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ===== SHARE LINK CONTACT — Aryan (2026-10-10): the RM name/phone/email
// shown on every client-facing share link (SharedProfile.js/SharedMatches.js)
// used to be fixed (seeded once in staff_users.rm_name/rm_phone, email fell
// back to the staff login email). This lets a staff member edit their own
// three fields; an admin can also fix another staff member's. Saved via
// set_share_contact() RPC (migration 20261010_editable_share_link_contact.sql)
// — get_shared_profile/get_shared_bundle read staff_users live, so editing
// here changes what EXISTING share links show too, not just new ones.
// ===== SHARED MATCHES LOG — Aryan's ask (2026-10-10): ek client profile ID
// ke liye kitne/kaun se matches bheje ja chuke hain, manually copy-paste se
// track karna. Har entry = client ke profile par ek profile_notes row
// (SHARED_MATCH_NOTE_PREFIX) — koi naya table nahi. Share Links se bheje
// gaye matches (share_links.client_profile_id) bhi saath mein gine jaate
// hain, taaki ek hi jagah poora count dikhe.
function SharedMatchLogView({ staffUser, onBack, initialCode, onOpenProfile }) {
  const [showToast, ToastView] = useToast()
  const [code, setCode] = useState(initialCode || '')
  const [client, setClient] = useState(null)
  const [entries, setEntries] = useState([]) // profile_notes rows for this client
  const [linkCodes, setLinkCodes] = useState([]) // profile codes sent via share links
  const [paste, setPaste] = useState('')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState([]) // [{ profile, count, last }]

  useEffect(() => { loadRecent(); if (initialCode) lookup(initialCode) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadRecent = async () => {
    const { data } = await supabase.from('profile_notes')
      .select('profile_id, note, created_at').like('note', SHARED_MATCH_NOTE_PREFIX + '%')
      .order('created_at', { ascending: false }).limit(1000)
    const byProfile = new Map()
    for (const r of data || []) {
      const cur = byProfile.get(r.profile_id) || { ids: new Set(), last: r.created_at }
      parseSharedMatchNote(r.note).ids.forEach(id => cur.ids.add(id))
      byProfile.set(r.profile_id, cur)
    }
    const ids = [...byProfile.keys()].slice(0, 50)
    if (!ids.length) { setRecent([]); return }
    const { data: profs } = await supabase.from('profiles').select('id, full_name, profile_code').in('id', ids)
    const pById = Object.fromEntries((profs || []).map(p => [p.id, p]))
    setRecent(ids.filter(id => pById[id]).map(id => ({ profile: pById[id], count: byProfile.get(id).ids.size, last: byProfile.get(id).last })))
  }

  const lookup = async (raw = code) => {
    const c = parseProfileIds(raw)[0]
    setError(''); setClient(null); setEntries([]); setLinkCodes([])
    if (!c) return
    setBusy(true)
    const { data: prof } = await supabase.from('profiles').select('*').ilike('profile_code', c).maybeSingle()
    if (!prof) { setBusy(false); setError(`No profile found with ID ${c}`); return }
    const [{ data: notes }, { data: links }] = await Promise.all([
      supabase.from('profile_notes').select('id, note, created_at').eq('profile_id', prof.id)
        .like('note', SHARED_MATCH_NOTE_PREFIX + '%').order('created_at', { ascending: false }),
      supabase.from('share_links').select('profile_id').eq('client_profile_id', prof.id),
    ])
    const linkIds = [...new Set((links || []).map(l => l.profile_id))]
    let codes = []
    if (linkIds.length) {
      const { data: lp } = await supabase.from('profiles').select('profile_code').in('id', linkIds)
      codes = (lp || []).map(p => (p.profile_code || '').toUpperCase()).filter(Boolean)
    }
    setClient(prof); setCode(prof.profile_code); setEntries(notes || []); setLinkCodes(codes)
    setBusy(false)
  }

  const manualIds = useMemo(() => {
    const s = new Set()
    entries.forEach(e => parseSharedMatchNote(e.note).ids.forEach(id => s.add(id)))
    return s
  }, [entries])
  const allSent = useMemo(() => new Set([...manualIds, ...linkCodes]), [manualIds, linkCodes])

  const pasted = parseProfileIds(paste)
  const alreadySent = pasted.filter(id => allSent.has(id))
  const fresh = pasted.filter(id => !allSent.has(id) && id !== (client?.profile_code || '').toUpperCase())

  const save = async () => {
    if (!client || !fresh.length) return
    setBusy(true)
    const { data, error: err } = await supabase.from('profile_notes').insert({
      profile_id: client.id, staff_user_id: staffUser.user_id, note: formatSharedMatchNote(fresh, remark),
    }).select('id, note, created_at').single()
    setBusy(false)
    if (err) { showToast('Could not save: ' + err.message); return }
    setEntries(prev => [data, ...prev]); setPaste(''); setRemark('')
    showToast(`Logged ${fresh.length} ${fresh.length === 1 ? 'match' : 'matches'}${alreadySent.length ? ` (skipped ${alreadySent.length} already sent)` : ''}`)
    loadRecent()
  }

  const remove = async (entry) => {
    if (!window.confirm('Delete this entry?')) return
    const { error: err } = await supabase.from('profile_notes').delete().eq('id', entry.id)
    if (err) { showToast('Could not delete: ' + err.message); return }
    setEntries(prev => prev.filter(e => e.id !== entry.id))
    loadRecent()
  }

  return (
    <div className="admin-view" style={{ maxWidth: 640 }}>
      <ToastView />
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Shared Matches</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:16}}>
        Enter a client's profile ID to see how many matches were already sent to them, and log new ones by pasting their IDs.
      </div>

      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <input className="form-input" placeholder="Client profile ID, e.g. RV4H8NMM" value={code}
          onChange={e=>setCode(e.target.value)} onKeyDown={e=>{ if (e.key === 'Enter') lookup() }}
          style={{flex:1,fontFamily:'monospace',textTransform:'uppercase'}} />
        <button className="btn btn-black btn-sm" disabled={busy || !code.trim()} onClick={()=>lookup()}>{busy && !client ? 'Finding…' : 'Open'}</button>
      </div>
      {error && <div style={{fontSize:12,color:'#dc2626',marginBottom:12}}>{error}</div>}

      {client && (
        <div className="list-row" style={{display:'flex',flexDirection:'column',gap:12,marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
            <div>
              <div style={{fontWeight:600,fontSize:15,cursor:onOpenProfile?'pointer':'default'}} onClick={()=>onOpenProfile && onOpenProfile(client)}>{client.full_name}</div>
              <div style={{fontSize:12,color:'#8e8e8e',fontFamily:'monospace'}}>ID {client.profile_code}{client.gender ? ' · ' + client.gender : ''}{client.city ? ' · ' + client.city : ''}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:26,fontWeight:600,lineHeight:1}}>{allSent.size}</div>
              <div style={{fontSize:11,color:'#8e8e8e'}}>matches sent</div>
            </div>
          </div>

          <div>
            <label className="form-label">Paste match IDs sent to this client</label>
            <textarea className="form-input" rows={3} placeholder="One or many IDs — commas, spaces or new lines all work"
              value={paste} onChange={e=>setPaste(e.target.value)} style={{fontFamily:'monospace',textTransform:'uppercase',resize:'vertical'}} />
            <input className="form-input" placeholder="Note (optional), e.g. sent biodata on WhatsApp" value={remark}
              onChange={e=>setRemark(e.target.value)} style={{marginTop:8}} />
            {pasted.length > 0 && (
              <div style={{fontSize:12,marginTop:6,color:'#555'}}>
                {fresh.length} new{alreadySent.length > 0 && <span style={{color:'#b45309'}}> · already sent before: {alreadySent.join(', ')}</span>}
              </div>
            )}
            <button className="btn btn-black btn-sm" style={{marginTop:8}} disabled={busy || !fresh.length} onClick={save}>
              {busy ? 'Saving…' : `Log ${fresh.length || ''} ${fresh.length === 1 ? 'match' : 'matches'}`}
            </button>
          </div>

          {entries.length > 0 && (
            <div>
              <div className="admin-section-header">Logged manually ({manualIds.size})</div>
              {entries.map(e => {
                const { ids, remark: r } = parseSharedMatchNote(e.note)
                return (
                  <div key={e.id} style={{display:'flex',gap:8,alignItems:'flex-start',padding:'8px 0',borderBottom:'1px solid rgba(0,0,0,0.06)',fontSize:12}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:'#8e8e8e',fontSize:11}}>{new Date(e.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {ids.length}</div>
                      <div style={{fontFamily:'monospace',wordBreak:'break-word'}}>{ids.join(', ')}</div>
                      {r && <div style={{color:'#555'}}>{r}</div>}
                    </div>
                    <button className="btn btn-outline btn-sm" style={{padding:'4px 6px'}} title="Copy IDs"
                      onClick={()=>navigator.clipboard?.writeText(ids.join(', ')).then(()=>showToast('IDs copied'))}><Copy size={12} /></button>
                    <button className="btn btn-outline btn-sm" style={{padding:'4px 6px',color:'#dc2626'}} title="Delete entry"
                      onClick={()=>remove(e)}><Trash2 size={12} /></button>
                  </div>
                )
              })}
            </div>
          )}
          {linkCodes.length > 0 && (
            <div>
              <div className="admin-section-header">Sent via share links ({new Set(linkCodes).size})</div>
              <div style={{fontFamily:'monospace',fontSize:12,wordBreak:'break-word'}}>{[...new Set(linkCodes)].join(', ')}</div>
            </div>
          )}
          {allSent.size > 0 && (
            <button className="btn btn-outline btn-sm" style={{alignSelf:'flex-start'}}
              onClick={()=>navigator.clipboard?.writeText([...allSent].join(', ')).then(()=>showToast('All sent IDs copied'))}>
              <Copy size={12} style={{verticalAlign:'-2px',marginRight:4}} />Copy all {allSent.size} sent IDs
            </button>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <div className="admin-section-header">Recently logged clients</div>
          {recent.map(({ profile: rp, count, last }) => (
            <div key={rp.id} className="list-row" style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',marginBottom:6,padding:'10px 12px'}}
              onClick={()=>{ setCode(rp.profile_code); setPaste(''); lookup(rp.profile_code) }}>
              <div>
                <div style={{fontWeight:500,fontSize:13}}>{rp.full_name}</div>
                <div style={{fontSize:11,color:'#8e8e8e',fontFamily:'monospace'}}>ID {rp.profile_code} · last {new Date(last).toLocaleDateString('en-IN')}</div>
              </div>
              <div style={{fontWeight:600}}>{count}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ShareLinkContactView({ staffUser, onBack }) {
  const [showToast, ToastView] = useToast()
  const isAdmin = staffUser.role === 'admin'
  const [staffList, setStaffList] = useState([])
  const [targetUserId, setTargetUserId] = useState(staffUser.user_id)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    if (isAdmin) {
      const { data } = await supabase.rpc('list_staff_with_email')
      setStaffList(data || [])
    }
    await loadContact(staffUser.user_id)
    setLoading(false)
  }

  const loadContact = async (userId) => {
    const { data } = await supabase.from('staff_users')
      .select('rm_name, rm_phone, rm_email').eq('user_id', userId).maybeSingle()
    setName(data?.rm_name || '')
    setPhone(data?.rm_phone || '')
    setEmail(data?.rm_email || '')
  }

  const onPickStaff = async (userId) => {
    setTargetUserId(userId)
    setLoading(true)
    await loadContact(userId)
    setLoading(false)
  }

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.rpc('set_share_contact', {
      p_name: name, p_phone: phone, p_email: email,
      p_target_user_id: isAdmin ? targetUserId : null,
    })
    setSaving(false)
    if (error) { showToast(error.message); return }
    showToast('Saved — new share links will use this contact.')
  }

  return (
    <div className="admin-view" style={{ maxWidth: 500 }}>
      <ToastView />
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back to Account</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Share Link Contact</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>
        This name, phone and email show on every share link you generate, so clients know who to contact. Change it any time — it updates existing links too.
      </div>

      {isAdmin && staffList.length > 1 && (
        <div className="form-row" style={{marginBottom:16}}>
          <label className="form-label">Editing contact for</label>
          <select className="form-select" value={targetUserId} onChange={e=>onPickStaff(e.target.value)}>
            {staffList.map(s => (
              <option key={s.user_id} value={s.user_id}>{s.email}{s.user_id === staffUser.user_id ? ' (me)' : ''}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
      ) : (
        <div className="list-row" style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="form-row">
            <label className="form-label">RM Name</label>
            <input className="form-input" placeholder="e.g. Aryan Kushwaha" value={name} onChange={e=>setName(e.target.value)} />
          </div>
          <div className="form-row">
            <label className="form-label">RM Phone</label>
            <input className="form-input" placeholder="e.g. +91 8376981829" value={phone} onChange={e=>setPhone(e.target.value)} />
          </div>
          <div className="form-row">
            <label className="form-label">RM Email</label>
            <input className="form-input" type="email" placeholder="e.g. rm@lovekushmatchmaking.com" value={email} onChange={e=>setEmail(e.target.value)} />
          </div>
          <button className="btn btn-black btn-sm" disabled={saving} onClick={save} style={{alignSelf:'flex-start'}}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
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
      supabase.from('introductions').select('id, from_profile, to_profile, status, final_outcome, created_at').limit(DASH_CAP),
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
    <div className="admin-view" style={{ maxWidth: 700 }}>
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
                  <div><span style={{fontWeight:600}}>{perf.matchesClosed}</span> <span style={{color:'#8e8e8e'}}>successful matches</span></div>
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
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({})
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
    // One tap used to delete with no undo (audit 2026-10-10).
    if (!window.confirm('Delete this template?')) return
    const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id)
    if (error) { showToast(error.message); return }
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const startEdit = (t) => { setEditingId(t.id); setEditDraft({ category: t.category, name: t.name, message: t.message }) }
  const cancelEdit = () => { setEditingId(null); setEditDraft({}) }

  const saveEdit = async () => {
    if (!editDraft.name?.trim() || !editDraft.message?.trim()) { showToast('Name and message are required'); return }
    const { error } = await supabase.from('whatsapp_templates').update({
      category: editDraft.category, name: editDraft.name.trim(), message: editDraft.message.trim(),
    }).eq('id', editingId)
    if (error) { showToast(error.message); return }
    setTemplates(prev => prev.map(t => t.id === editingId ? { ...t, category: editDraft.category, name: editDraft.name.trim(), message: editDraft.message.trim() } : t))
    cancelEdit()
  }

  return (
    <div className="admin-view" style={{ maxWidth: 700 }}>
      <ToastView />
      <button className="btn btn-outline btn-sm" style={{marginBottom:16}} onClick={onBack}>← Back</button>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:500,marginBottom:4}}>Template Editor</h2>
      <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20}}>
        Universal templates — plain text, not tied to WhatsApp. The reminder buttons fill them in automatically, or tap Copy to paste one into WhatsApp, SMS, email or anywhere else. Use {'{{name}}'}, {'{{otherName}}'}, {'{{when}}'}, {'{{count}}'} - filled in from the profile.
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
              {editingId === t.id ? (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <select className="form-select" value={editDraft.category} onChange={e=>setEditDraft(d=>({...d, category: e.target.value}))}>
                    {Object.entries(EVENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  <input className="form-input" placeholder="Template name" value={editDraft.name}
                    onChange={e=>setEditDraft(d=>({...d, name: e.target.value}))} />
                  <textarea className="form-input" placeholder="Hi {{name}}, ..." rows={3} value={editDraft.message}
                    onChange={e=>setEditDraft(d=>({...d, message: e.target.value}))} style={{resize:'vertical'}} />
                  <div style={{display:'flex',gap:8}}>
                    <button className="btn btn-black btn-sm" onClick={saveEdit}>Save</button>
                    <button className="btn btn-outline btn-sm" onClick={cancelEdit}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{t.name}</div>
                    <div style={{fontSize:12,color:'#8e8e8e',marginBottom:6}}>{EVENT_LABELS[t.category] || t.category}</div>
                    <div style={{fontSize:13,color:'#555',background:'#f9f9f9',padding:'8px 10px',borderRadius:8}}>{t.message}</div>
                  </div>
                  <div style={{display:'flex',gap:6,flexShrink:0}}>
                    <button className="btn btn-outline btn-sm" title="Copy — paste into WhatsApp, SMS, email or anywhere"
                      onClick={async()=>{ try { await navigator.clipboard.writeText(t.message); showToast('Copied') } catch { showToast('Could not copy') } }}>
                      <Copy size={13} />
                    </button>
                    {isAdmin && (
                      <>
                        <button className="btn btn-outline btn-sm" title="Edit template" onClick={()=>startEdit(t)}>
                          <Pencil size={13} />
                        </button>
                        <button className="btn btn-outline btn-sm" style={{color:'#dc2626',borderColor:'#dc2626'}}
                          onClick={()=>deleteTemplate(t.id)}><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
