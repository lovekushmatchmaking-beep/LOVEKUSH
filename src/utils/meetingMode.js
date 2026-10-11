// In-person vs virtual meetings (Aryan, 2026-10-11): families who live far
// apart can't meet face to face, so the bureau sets up a Zoom / Google Meet
// call instead. Stored as introductions.meeting_mode ('in_person' default,
// 'virtual'); introductions.location holds the venue for in-person and the
// meeting link / platform detail for virtual — one field, so every existing
// place that reads `location` (search, history notes, the RPC) keeps working.

export const MEETING_MODES = [
  { value: 'in_person', label: 'In-Person' },
  { value: 'virtual', label: 'Virtual' },
]

export function isVirtualMeeting(r) {
  return r?.meeting_mode === 'virtual'
}

export function locationPlaceholder(mode) {
  return mode === 'virtual' ? 'Meeting link (Zoom / Google Meet)' : 'Location (optional)'
}

// Turns "zoom.us/j/123" or a full URL into something an <a href> can open.
// Returns null for plain text ("Zoom, ID 123 456") — shown as text instead.
export function meetingLinkHref(text) {
  const t = (text || '').trim()
  if (!t || /\s/.test(t)) {
    const m = t.match(/https?:\/\/\S+/i)
    return m ? m[0] : null
  }
  if (/^https?:\/\//i.test(t)) return t
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return 'https://' + t
  return null
}

// Same privacy rule as the share-link pages: a client's own phone/email
// must never travel on the card. The link field is free text, so warn if
// someone pastes a number or email into it instead of a meeting link.
export function looksLikeContactDetail(text) {
  const t = text || ''
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t) && !/https?:\/\//i.test(t)) return true
  // 10+ digit run (spaces/dashes allowed) outside a URL — e.g. +91 98765 43210.
  // Zoom meeting IDs are 9-11 digits too, so only flag an Indian-mobile-like
  // run (optional +91/0, then 6-9 and 9 more digits) that isn't inside a link.
  const withoutUrls = t.replace(/https?:\/\/\S+/gi, '')
  return /(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}\b/.test(withoutUrls)
}
