// Manual "Shared Matches" log (Aryan, 2026-10-10): kis client profile ID ko
// kaun-kaun se match IDs bheje ja chuke hain — copy-paste se, bina share
// link ke bhi (WhatsApp par seedha biodata bheja ho tab bhi). Har entry ek
// normal profile_notes row hai client ke profile par, is prefix ke saath —
// koi naya table/migration nahi, aur entry client ke Notes & Follow-ups
// history mein bhi apne aap dikhti hai.
export const SHARED_MATCH_NOTE_PREFIX = '📤 Matches shared: '

// "ab12cd34, XY6FG2WW\nRV8P8TU2" -> ['AB12CD34', 'XY6FG2WW', 'RV8P8TU2']
// (uppercase, de-duplicated, order kept). Commas, spaces, new lines,
// semicolons, slashes sab separator.
export function parseProfileIds(text) {
  const seen = new Set()
  const out = []
  for (const raw of (text || '').split(/[\s,;/|]+/)) {
    const id = raw.replace(/^#/, '').trim().toUpperCase()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export const formatSharedMatchNote = (ids, remark) =>
  SHARED_MATCH_NOTE_PREFIX + ids.join(', ') + (remark && remark.trim() ? ` — ${remark.trim()}` : '')

export const isSharedMatchNote = (note) => typeof note === 'string' && note.startsWith(SHARED_MATCH_NOTE_PREFIX)

// Inverse of formatSharedMatchNote: { ids, remark }
export function parseSharedMatchNote(note) {
  if (!isSharedMatchNote(note)) return { ids: [], remark: '' }
  const body = note.slice(SHARED_MATCH_NOTE_PREFIX.length)
  const dash = body.indexOf(' — ')
  const idPart = dash === -1 ? body : body.slice(0, dash)
  return { ids: parseProfileIds(idPart), remark: dash === -1 ? '' : body.slice(dash + 3) }
}
