// UNIVERSAL SEARCH & FILTER CATALOG (Aryan's ask, 2026-10-10: "jahan bhi
// search bar ya filter hai, sabko advanced/powerful/universal banao — saari
// fields se check kar sakoon"). Ek hi field catalog jo Admin Profiles list
// (DB query), Find Matches aur member Matches tab (client-side) teeno use
// karte hain — taaki har jagah same fields, same labels, same behaviour.
// Har option list wahi existing constant hai jo signup/Edit Profile form
// use karta hai — koi naya field ya DB column nahi.
import {
  MARITAL_STATUSES, COMPLEXIONS, BODY_TYPES, WEIGHT_RANGES, BLOOD_GROUPS, MOTHER_TONGUES,
  PROFILE_FOR_OPTIONS, HAVE_CHILDREN_OPTIONS, PHYSICAL_DISABILITY_OPTIONS, GREW_UP_IN_OPTIONS,
  LIVING_WITH_PARENTS_OPTIONS, RELIGIONS, CASTES, MANGLIK_OPTIONS, KUNDLI_AVAILABLE,
  CASTE_NO_BAR_OPTIONS, EDUCATIONS, EMPLOYMENT_TYPES, PROFESSION_CATEGORIES, INCOME_RANGES,
  USD_INCOME_RANGES, COUNTRIES, RESIDENCY_STATUSES, RELOCATION_PREFERENCES, FAMILY_TYPES,
  FAMILY_VALUES, FAMILY_FINANCIAL_STATUS, FAMILY_INCOME_RANGES, USD_FAMILY_INCOME_RANGES,
  OWN_HOUSE_OPTIONS, VEHICLE_OWNERSHIP, DIETS, HABITS, CUISINES, SPORTS_LIST, LEAD_SOURCE_OPTIONS,
  MARRIAGE_TIMELINE_OPTIONS, CONTACT_MODE_OPTIONS, DECISION_MAKER_OPTIONS,
} from '../constants/profileOptions'
import { RASHIS, NAKSHATRAS } from './astrology'

// type: 'multi' (any of the picked values) | 'array' (profile's array
// column overlaps the picked values) | 'text' (contains, case-insensitive)
// | 'recency' (created within N days).
// pub: column exists in profiles_public_view (member-facing data) — member
// Matches tab only offers these. admin: staff-only field (contact/CRM).
export const PROFILE_FILTER_GROUPS = [
  { title: 'Personal', fields: [
    { key: 'marital_status', label: 'Marital status', type: 'multi', options: MARITAL_STATUSES, pub: true },
    { key: 'complexion', label: 'Complexion', type: 'multi', options: COMPLEXIONS, pub: true },
    { key: 'body_type', label: 'Body type', type: 'multi', options: BODY_TYPES, pub: true },
    { key: 'weight', label: 'Weight', type: 'multi', options: WEIGHT_RANGES, pub: true },
    { key: 'mother_tongue', label: 'Mother tongue', type: 'multi', options: MOTHER_TONGUES, pub: true },
    { key: 'languages_spoken', label: 'Languages spoken', type: 'array', options: MOTHER_TONGUES },
    { key: 'profile_for', label: 'Profile for', type: 'multi', options: PROFILE_FOR_OPTIONS, pub: true },
    { key: 'have_children', label: 'Have children', type: 'multi', options: HAVE_CHILDREN_OPTIONS },
    { key: 'physical_disability', label: 'Physical disability', type: 'multi', options: PHYSICAL_DISABILITY_OPTIONS },
    { key: 'blood_group', label: 'Blood group', type: 'multi', options: BLOOD_GROUPS },
    { key: 'grew_up_in', label: 'Grew up in', type: 'multi', options: GREW_UP_IN_OPTIONS },
    { key: 'living_with_parents', label: 'Living with parents', type: 'multi', options: LIVING_WITH_PARENTS_OPTIONS },
  ]},
  { title: 'Religion & Horoscope', fields: [
    { key: 'religion', label: 'Religion', type: 'multi', options: RELIGIONS, pub: true },
    { key: 'community', label: 'Community / Caste', type: 'multi', options: CASTES, pub: true },
    { key: 'sub_caste', label: 'Sub-caste', type: 'text', pub: true },
    { key: 'gotra', label: 'Gotra', type: 'text', pub: true },
    { key: 'caste_no_bar', label: 'Caste no bar', type: 'multi', options: CASTE_NO_BAR_OPTIONS },
    { key: 'manglik', label: 'Manglik', type: 'multi', options: MANGLIK_OPTIONS, pub: true },
    { key: 'rashi', label: 'Rashi', type: 'multi', options: RASHIS, pub: true },
    { key: 'nakshatra', label: 'Nakshatra', type: 'multi', options: NAKSHATRAS, pub: true },
    { key: 'kundli_available', label: 'Kundli available', type: 'multi', options: KUNDLI_AVAILABLE, pub: true },
    { key: 'horoscope_match_required', label: 'Horoscope match required', type: 'multi', options: ['Yes', 'No', 'Flexible'], pub: true },
  ]},
  { title: 'Education & Career', fields: [
    { key: 'education', label: 'Education', type: 'multi', options: EDUCATIONS, pub: true },
    { key: 'degree', label: 'Degree', type: 'text' },
    { key: 'college_name', label: 'College', type: 'text', admin: true },
    { key: 'employment_type', label: 'Employment type', type: 'multi', options: EMPLOYMENT_TYPES },
    { key: 'profession', label: 'Profession', type: 'multi', options: PROFESSION_CATEGORIES },
    { key: 'designation', label: 'Designation', type: 'text' },
    { key: 'employer', label: 'Employer', type: 'text', admin: true },
    { key: 'annual_income', label: 'Annual income', type: 'multi', options: [...INCOME_RANGES, ...USD_INCOME_RANGES], pub: true },
  ]},
  { title: 'Location', fields: [
    { key: 'city', label: 'City', type: 'text', pub: true },
    { key: 'state', label: 'State', type: 'text', pub: true },
    { key: 'country', label: 'Country', type: 'multi', options: COUNTRIES.filter(c => c !== 'Open to All'), pub: true },
    { key: 'native_place', label: 'Native place', type: 'text' },
    { key: 'residency_status', label: 'Residency / visa status', type: 'multi', options: RESIDENCY_STATUSES, pub: true },
    { key: 'relocation_preference', label: 'Relocation', type: 'multi', options: RELOCATION_PREFERENCES, pub: true },
  ]},
  { title: 'Family', fields: [
    { key: 'family_type', label: 'Family type', type: 'multi', options: FAMILY_TYPES, pub: true },
    { key: 'family_values', label: 'Family values', type: 'multi', options: FAMILY_VALUES, pub: true },
    { key: 'family_financial_status', label: 'Family financial status', type: 'multi', options: FAMILY_FINANCIAL_STATUS.map(f => f.label) },
    { key: 'family_income_range', label: 'Family income', type: 'multi', options: [...FAMILY_INCOME_RANGES, ...USD_FAMILY_INCOME_RANGES] },
    { key: 'family_city', label: 'Family city', type: 'text', pub: true },
    { key: 'own_house', label: 'Own house', type: 'multi', options: OWN_HOUSE_OPTIONS },
    { key: 'vehicle_ownership', label: 'Vehicle', type: 'multi', options: VEHICLE_OWNERSHIP },
  ]},
  { title: 'Lifestyle', fields: [
    { key: 'diet', label: 'Diet', type: 'multi', options: DIETS, pub: true },
    { key: 'smoking', label: 'Smoking', type: 'multi', options: HABITS, pub: true },
    { key: 'drinking', label: 'Drinking', type: 'multi', options: HABITS, pub: true },
    { key: 'cuisines', label: 'Cuisines', type: 'array', options: CUISINES },
    { key: 'sports', label: 'Sports', type: 'array', options: SPORTS_LIST },
  ]},
  { title: 'CRM', fields: [
    { key: 'lead_source', label: 'Lead source', type: 'multi', options: LEAD_SOURCE_OPTIONS, admin: true },
    { key: 'marriage_timeline', label: 'Marriage timeline', type: 'multi', options: MARRIAGE_TIMELINE_OPTIONS, admin: true },
    { key: 'preferred_contact_mode', label: 'Contact mode', type: 'multi', options: CONTACT_MODE_OPTIONS, admin: true },
    { key: 'decision_maker', label: 'Decision maker', type: 'multi', options: DECISION_MAKER_OPTIONS, admin: true },
    { key: 'verification_status', label: 'Verification', type: 'multi', options: ['not_started', 'selfie_requested', 'selfie_submitted', 'verified', 'rejected'], admin: true },
    { key: 'created_at', label: 'Joined within', type: 'recency', options: [7, 30, 90, 365], admin: true },
  ]},
]

export const PROFILE_FILTER_FIELDS = PROFILE_FILTER_GROUPS.flatMap(g => g.fields)
// Columns whose dropdown options are also filled from real data (below).
export const OPTION_COLUMNS = PROFILE_FILTER_FIELDS.filter(f => f.type === 'multi' || f.type === 'array').map(f => f.key)

// Purane/imported profiles mein bahut values fixed list se bahar hain
// (e.g. education "B.Tech (Information Technology)", profession "Software
// Engineer", weight "58 Kg") — sirf fixed list dikhate to wo profiles kabhi
// filter hi nahi ho paate. Isliye dropdown = fixed list + jo bhi values
// actually data mein hain (rows = loaded profiles).
export function withDataOptions(options, rows, column) {
  if (!rows || rows.length === 0) return options
  const known = new Set(options)
  const extra = new Set()
  rows.forEach(r => {
    const v = r?.[column]
    ;(Array.isArray(v) ? v : [v]).forEach(x => {
      const t = typeof x === 'string' ? x.trim() : x
      if (t != null && t !== '' && !known.has(t)) extra.add(String(t))
    })
  })
  return extra.size ? [...options, ...[...extra].sort((a, b) => a.localeCompare(b))] : options
}
const FIELD_BY_KEY = Object.fromEntries(PROFILE_FILTER_FIELDS.map(f => [f.key, f]))

export const recencyLabel = (days) => days >= 365 ? 'Last 1 year' : `Last ${days} days`

// Fields that a given screen should offer.
//  scope 'admin'   — everything (Admin Profiles list, reads `profiles`)
//  scope 'matches' — no staff-only CRM/contact fields (Find Matches)
//  scope 'member'  — only profiles_public_view columns (member Matches tab)
export function fieldsForScope(scope, exclude = []) {
  return PROFILE_FILTER_FIELDS.filter(f => {
    if (exclude.includes(f.key)) return false
    if (scope === 'member') return !!f.pub && !f.admin
    if (scope === 'matches') return !f.admin
    return true
  })
}

const isActive = (f, v) => f.type === 'multi' || f.type === 'array'
  ? Array.isArray(v) && v.length > 0
  : f.type === 'text' ? !!(v && String(v).trim()) : !!v

export function activeFilterKeys(values = {}) {
  return Object.keys(values).filter(k => FIELD_BY_KEY[k] && isActive(FIELD_BY_KEY[k], values[k]))
}

// Removable chip per picked value — same chip UX the Admin Profiles list
// already had for its own filters.
export function filterChips(values = {}, onChange) {
  return activeFilterKeys(values).flatMap(k => {
    const f = FIELD_BY_KEY[k]
    const v = values[k]
    if (Array.isArray(v)) {
      return v.map(x => ({ key: `${k}:${x}`, label: `${f.label}: ${x}`, clear: () => onChange({ ...values, [k]: v.filter(y => y !== x) }) }))
    }
    const label = f.type === 'recency' ? `${f.label}: ${recencyLabel(v)}` : `${f.label}: ${v}`
    return [{ key: k, label, clear: () => onChange({ ...values, [k]: f.type === 'text' ? '' : null }) }]
  })
}

// PostgREST special characters stripped (same reason as the existing
// Profiles search — avoid query-syntax errors).
const safe = (s) => String(s).replace(/[,()%*]/g, '').trim()

// Supabase query builder version — DB pe filter, client pe nahi.
export function applyFiltersToQuery(q, values = {}) {
  activeFilterKeys(values).forEach(k => {
    const f = FIELD_BY_KEY[k]
    const v = values[k]
    if (f.type === 'multi') q = q.in(k, v)
    else if (f.type === 'array') q = q.overlaps(k, v)
    else if (f.type === 'text') { const s = safe(v); if (s) q = q.ilike(k, `%${s}%`) }
    else if (f.type === 'recency') q = q.gte(k, new Date(Date.now() - Number(v) * 86400000).toISOString())
  })
  return q
}

// Client-side version (Find Matches, member Matches tab).
export function profileMatchesFilters(p, values = {}) {
  return activeFilterKeys(values).every(k => {
    const f = FIELD_BY_KEY[k]
    const v = values[k]
    const pv = p[k]
    if (f.type === 'multi') return v.includes(pv)
    if (f.type === 'array') return Array.isArray(pv) && pv.some(x => v.includes(x))
    if (f.type === 'text') return String(pv || '').toLowerCase().includes(String(v).trim().toLowerCase())
    if (f.type === 'recency') return !!pv && new Date(pv).getTime() >= Date.now() - Number(v) * 86400000
    return true
  })
}

// ===== SEARCH BAR — multi-word, every word must match some field =====
// "kushwaha delhi" → Kushwaha jo Delhi mein hain. Phone numbers typed with
// spaces/dashes ("98765 43210") are treated as one number.
export function searchTokens(query) {
  const q = String(query || '').trim()
  if (!q) return []
  if (/^[+\d\s()-]+$/.test(q)) {
    let digits = q.replace(/\D/g, '')
    // Numbers are saved as plain 10 digits — "+91 98765 43210" still finds it.
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
    return [digits].filter(Boolean)
  }
  return q.split(/\s+/).map(safe).filter(Boolean)
}

// Text columns on `profiles` the Admin Profiles search bar looks in.
export const ADMIN_SEARCH_COLUMNS = [
  'profile_code', 'full_name', 'client_phone', 'alternate_phone', 'client_email', 'alternate_email',
  'city', 'state', 'country', 'native_place', 'family_city', 'religion', 'community', 'sub_caste',
  'gotra', 'mother_tongue', 'education', 'degree', 'college_name', 'profession', 'designation',
  'employer', 'father_profession', 'mother_profession', 'external_bureau_name', 'external_bureau_contact',
  'reference_contact_name', 'reference_contact_phone', 'lead_source', 'hobbies', 'about_me',
]

// Columns present in profiles_public_view — member-side search.
export const MEMBER_SEARCH_COLUMNS = [
  'profile_code', 'city', 'state', 'country', 'family_city', 'religion', 'community', 'sub_caste',
  'gotra', 'mother_tongue', 'education', 'father_profession', 'mother_profession', 'about_me',
]

export function applySearchToQuery(q, query, columns = ADMIN_SEARCH_COLUMNS) {
  searchTokens(query).forEach(tok => {
    q = q.or(columns.map(c => `${c}.ilike.%${tok}%`).join(','))
  })
  return q
}

export function profileMatchesSearch(p, query, columns = MEMBER_SEARCH_COLUMNS) {
  const tokens = searchTokens(query).map(t => t.toLowerCase())
  if (tokens.length === 0) return true
  const hay = columns.map(c => {
    const v = p?.[c]
    if (v == null) return ''
    const s = Array.isArray(v) ? v.join(' ') : String(v)
    // digits-only copy so a phone token matches "+91 98765-43210"
    return s.toLowerCase() + ' ' + s.replace(/\D/g, '')
  }).join(' | ')
  return tokens.every(t => hay.includes(t))
}
