// ===== FIELD SUGGESTIONS — "Others / Not in list" values for any dropdown.
// When someone types a value that isn't in a dropdown (caste, gotra,
// degree, mother tongue, father's/mother's profession) it's sent to
// upsert_caste_suggestion() and lands in Admin → Field Suggestions (the
// table is still called caste_suggestions). Approving it there makes it a
// real option in that same dropdown everywhere: the forms merge
// get_approved_field_options() into their hardcoded lists via
// withApprovedOptions(). See migration 20261011_field_suggestions_duplicate_leads_bureau_source.sql.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// field_type -> label shown in the admin list. Caste/gotra are per-religion
// (same name can be a different community in another religion); the rest
// aren't, so they're stored with religion = null.
export const FIELD_SUGGESTION_TYPES = {
  caste: { label: 'Community / Caste', perReligion: true },
  gotra: { label: 'Gotra', perReligion: true },
  degree: { label: 'Degree', perReligion: false },
  mother_tongue: { label: 'Mother Tongue', perReligion: false },
  father_profession: { label: "Father's Profession", perReligion: false },
  mother_profession: { label: "Mother's Profession", perReligion: false },
}

export const fieldSuggestionLabel = (fieldType) =>
  FIELD_SUGGESTION_TYPES[fieldType]?.label || String(fieldType || '').replace(/_/g, ' ')

// Fire-and-forget — never blocks the profile save. Same name for the same
// field (and religion, for caste/gotra) just bumps times_suggested.
export function suggestFieldValue({ fieldType, value, religion, denomination, submittedBy }) {
  const name = String(value || '').trim()
  if (!name || !fieldType) return
  const perReligion = FIELD_SUGGESTION_TYPES[fieldType]?.perReligion
  supabase.rpc('upsert_caste_suggestion', {
    p_religion: perReligion ? (religion || null) : null,
    p_denomination: perReligion ? (denomination || null) : null,
    p_suggested_name: name, p_field_type: fieldType,
    p_submitted_by: submittedBy || null,
  }).then(({ error }) => { if (error) console.error(error.message) })
}

// Loaded once per page load and shared by every form on the page.
let approvedPromise = null
export function loadApprovedFieldOptions(force = false) {
  if (!approvedPromise || force) {
    approvedPromise = supabase.rpc('get_approved_field_options')
      .then(({ data, error }) => {
        if (error) { console.error(error.message); approvedPromise = null; return [] }
        return data || []
      })
  }
  return approvedPromise
}

export function useApprovedFieldOptions() {
  const [rows, setRows] = useState([])
  useEffect(() => {
    let alive = true
    loadApprovedFieldOptions().then(r => { if (alive) setRows(r) })
    return () => { alive = false }
  }, [])
  return rows
}

// Catch-all entries the lists end with — approved values go above them.
const TAIL_OPTIONS = ['Other', 'Others', 'Others / Not in list', "Don't wish to specify",
  "Don't know community", 'Gotra not applicable']

// options + approved values for this field (and religion), de-duplicated
// case-insensitively, inserted just before the trailing "Other" / "Don't
// wish to specify" entries so those stay last.
export function withApprovedOptions(options, approvedRows, fieldType, religion, alsoHave = []) {
  const perReligion = FIELD_SUGGESTION_TYPES[fieldType]?.perReligion
  const have = new Set([...options, ...alsoHave].map(o => String(o).toLowerCase()))
  const extras = []
  for (const r of approvedRows || []) {
    if (r.field_type !== fieldType) continue
    if (perReligion && (r.religion || '') !== (religion || '')) continue
    const key = String(r.value || '').trim().toLowerCase()
    if (!key || have.has(key)) continue
    have.add(key)
    extras.push(String(r.value).trim())
  }
  if (!extras.length) return options
  let cut = options.length
  while (cut > 0 && TAIL_OPTIONS.includes(options[cut - 1])) cut--
  return [...options.slice(0, cut), ...extras, ...options.slice(cut)]
}

// DEGREE_OPTIONS is { group: [degrees] } — approved degrees go into the
// last group (the one holding "Others / Not in list").
export function withApprovedDegreeOptions(degreeOptions, approvedRows) {
  const groups = Object.keys(degreeOptions)
  const last = groups[groups.length - 1]
  const all = groups.flatMap(g => degreeOptions[g])
  const merged = withApprovedOptions(degreeOptions[last], approvedRows, 'degree', null, all)
  return merged === degreeOptions[last] ? degreeOptions : { ...degreeOptions, [last]: merged }
}
