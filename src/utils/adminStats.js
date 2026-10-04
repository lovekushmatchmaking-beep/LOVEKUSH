// ===== ADMIN LIVE STATS — Admin panel ke "Breakdown" section ka pure logic.
// Existing profiles columns (gender, age/date_of_birth, height, religion...)
// ko hi buckets mein group karta hai — koi naya column/table nahi.
import { parseHeightToInches } from '../constants/profileOptions'

export const STATS_COLUMNS = 'gender, age, date_of_birth, height, religion, community, city, state, country, marital_status, education, profile_for, mother_tongue, manglik, diet, profile_status, lead_source, created_at'

const UNKNOWN = 'Not filled'

const ageOf = (p) => {
  if (p.age) return p.age
  if (!p.date_of_birth) return null
  const dob = new Date(p.date_of_birth)
  if (isNaN(dob)) return null
  const now = new Date()
  let a = now.getFullYear() - dob.getFullYear()
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) a--
  return a
}

const AGE_BUCKETS = [[18, 21], [22, 25], [26, 29], [30, 33], [34, 37], [38, 41], [42, 49], [50, 200]]
const ageBucket = (p) => {
  const a = ageOf(p)
  if (!a) return UNKNOWN
  const b = AGE_BUCKETS.find(([lo, hi]) => a >= lo && a <= hi)
  if (!b) return 'Under 18'
  return b[1] >= 200 ? `${b[0]}+` : `${b[0]}–${b[1]}`
}

const HEIGHT_BUCKETS = [
  [0, 59, 'Under 5\'0"'],
  [60, 63, '5\'0"–5\'3"'],
  [64, 67, '5\'4"–5\'7"'],
  [68, 71, '5\'8"–5\'11"'],
  [72, 999, '6\'0" and above'],
]
const heightBucket = (p) => {
  const inches = parseHeightToInches(p.height)
  if (!inches) return UNKNOWN
  return HEIGHT_BUCKETS.find(([lo, hi]) => inches >= lo && inches <= hi)[2]
}

const field = (key) => (p) => (p[key] && String(p[key]).trim()) || UNKNOWN

// key -> { label, bucket(profile), order: 'bucket' (fixed order) | 'count' }
export const DIMENSIONS = {
  age: { label: 'Age', bucket: ageBucket, order: AGE_BUCKETS.map(([lo, hi]) => hi >= 200 ? `${lo}+` : `${lo}–${hi}`) },
  height: { label: 'Height', bucket: heightBucket, order: HEIGHT_BUCKETS.map(b => b[2]) },
  joined: { label: 'Joined (month)', bucket: (p) => p.created_at ? p.created_at.slice(0, 7) : UNKNOWN, order: 'recent' },
  religion: { label: 'Religion', bucket: field('religion') },
  community: { label: 'Caste / Community', bucket: field('community') },
  marital_status: { label: 'Marital Status', bucket: field('marital_status') },
  education: { label: 'Education', bucket: field('education') },
  city: { label: 'City', bucket: field('city') },
  state: { label: 'State', bucket: field('state') },
  country: { label: 'Country', bucket: field('country') },
  mother_tongue: { label: 'Mother Tongue', bucket: field('mother_tongue') },
  profile_for: { label: 'Profile For', bucket: field('profile_for') },
  manglik: { label: 'Manglik', bucket: field('manglik') },
  diet: { label: 'Diet', bucket: field('diet') },
  profile_status: { label: 'Profile Status', bucket: field('profile_status') },
  lead_source: { label: 'Lead Source', bucket: field('lead_source') },
}

// ===== CONVERSION FUNNEL — "Lead → Match → Meeting" stages Aryan ne
// maanga. Koi naya lead/stage table nahi — jo signals already database
// mein hain (profiles.profile_status, introductions, match_actions) unhi
// se counts banate hain. Conversion% = is stage ka count / pichle stage
// ka count.
export const FUNNEL_STAGE_LABELS = {
  registered: 'Registered',
  active: 'Active / Verified',
  matched: 'Matched (sent or received interest)',
  meetingRequested: 'Talk / Meeting Requested',
  meetingDone: 'Meeting Done (Contacted / Closed)',
}

// counts: { registered, active, matched, meetingRequested, meetingDone } — plain numbers,
// each one a count of DISTINCT profiles reaching that stage.
export function computeFunnel(counts) {
  const order = ['registered', 'active', 'matched', 'meetingRequested', 'meetingDone']
  let prev = null
  return order.map(key => {
    const count = counts[key] || 0
    const conversionPct = prev === null ? null : (prev === 0 ? 0 : Math.round((count / prev) * 100))
    prev = count
    return { key, label: FUNNEL_STAGE_LABELS[key], count, conversionPct }
  })
}

// ===== RM PERFORMANCE — business-owner audit (2026-10-04): "kis RM ne
// kitne follow-up liye, kitne matches close kiye, response time kitna
// tha" wasn't tracked anywhere. No new heavy tracking table — derived from
// profile_notes (already how calls/follow-ups get logged) and
// introductions + the existing profiles.managed_by_staff_id link (a
// coordination request is attributed to the RM managing its "from" profile).
//
// staffList: [{ user_id, ... }], profileNotes: [{ staff_user_id, introduction_id, created_at }],
// introductions: [{ id, from_profile, to_profile, status, created_at }],
// managedProfiles: [{ id, managed_by_staff_id }] (profiles with an RM assigned)
export function computeRmPerformance(staffList, { profileNotes, introductions, managedProfiles }) {
  const sinceMs = Date.now() - 30 * DAY
  const notesByStaff = new Map()
  for (const n of profileNotes) {
    if (!n.staff_user_id) continue
    const arr = notesByStaff.get(n.staff_user_id) || []
    arr.push(n)
    notesByStaff.set(n.staff_user_id, arr)
  }
  const firstNoteByIntroduction = new Map()
  for (const n of profileNotes) {
    if (!n.introduction_id) continue
    const existing = firstNoteByIntroduction.get(n.introduction_id)
    if (!existing || new Date(n.created_at) < new Date(existing.created_at)) firstNoteByIntroduction.set(n.introduction_id, n)
  }
  return staffList.map(s => {
    const managedIds = new Set(managedProfiles.filter(p => p.managed_by_staff_id === s.user_id).map(p => p.id))
    const theirIntros = introductions.filter(i => managedIds.has(i.from_profile) || managedIds.has(i.to_profile))
    const notes = notesByStaff.get(s.user_id) || []

    const responseHours = []
    for (const intro of theirIntros) {
      const firstNote = firstNoteByIntroduction.get(intro.id)
      if (!firstNote) continue
      const hours = (new Date(firstNote.created_at) - new Date(intro.created_at)) / (60 * 60 * 1000)
      if (hours >= 0) responseHours.push(hours)
    }
    const avgResponseHours = responseHours.length ? responseHours.reduce((a, b) => a + b, 0) / responseHours.length : null

    return {
      user_id: s.user_id,
      followUpsTotal: notes.length,
      followUps30d: notes.filter(n => new Date(n.created_at).getTime() >= sinceMs).length,
      matchesClosed: theirIntros.filter(i => i.status === 'closed' || i.status === 'meeting_done').length,
      avgResponseHours,
    }
  })
}

const DAY = 24 * 60 * 60 * 1000
export const JOINED_WITHIN = { all: null, today: 1, '7d': 7, '30d': 30, '90d': 90 }

export function filterProfiles(profiles, { gender = '', status = '', joined = 'all' } = {}, now = Date.now()) {
  const days = JOINED_WITHIN[joined]
  let since = null
  if (days === 1) { const d = new Date(now); d.setHours(0, 0, 0, 0); since = d.getTime() }
  else if (days) since = now - days * DAY
  return profiles.filter(p =>
    (!gender || p.gender === gender) &&
    (!status || p.profile_status === status) &&
    (!since || (p.created_at && new Date(p.created_at).getTime() >= since)))
}

// -> [{ label, total, male, female }] in display order
export function breakdown(profiles, dimKey) {
  const dim = DIMENSIONS[dimKey]
  const rows = new Map()
  for (const p of profiles) {
    const label = dim.bucket(p)
    const r = rows.get(label) || { label, total: 0, male: 0, female: 0 }
    r.total++
    if (p.gender === 'Male') r.male++
    else if (p.gender === 'Female') r.female++
    rows.set(label, r)
  }
  const list = [...rows.values()]
  const last = (r) => (r.label === UNKNOWN ? 1 : 0)
  if (Array.isArray(dim.order)) {
    const idx = (r) => { const i = dim.order.indexOf(r.label); return i === -1 ? -1 : i }
    list.sort((a, b) => last(a) - last(b) || idx(a) - idx(b))
  } else if (dim.order === 'recent') {
    list.sort((a, b) => last(a) - last(b) || b.label.localeCompare(a.label))
  } else {
    list.sort((a, b) => last(a) - last(b) || b.total - a.total || a.label.localeCompare(b.label))
  }
  return list
}
