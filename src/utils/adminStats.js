// ===== ADMIN LIVE STATS — Admin panel ke "Breakdown" section ka pure logic.
// Existing profiles columns (gender, age/date_of_birth, height, religion...)
// ko hi buckets mein group karta hai — koi naya column/table nahi.
import { parseHeightToInches } from '../constants/profileOptions'

export const STATS_COLUMNS = 'gender, age, date_of_birth, height, religion, community, city, state, country, marital_status, education, profile_for, mother_tongue, manglik, diet, profile_status, created_at'

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
