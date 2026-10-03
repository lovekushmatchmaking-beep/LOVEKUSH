// ===== DUPLICATE LEAD DETECTION — same phone/email dobara register na ho
// jaaye (ya ho jaaye to admin ko pata chale). Koi naya table/column nahi —
// profiles.client_phone / client_email ko hi normalize karke compare karte
// hain. Purely client-side (profile count is small); for live-signup use
// a direct query instead of loading the whole table.

const normEmail = (e) => (e ? String(e).trim().toLowerCase() : '')
const normPhone = (p) => {
  if (!p) return ''
  let d = String(p).replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 10) d = '91' + d
  return d
}

// profiles -> [{ key, type: 'phone'|'email', value, profiles: [profile,...] }]
// for every phone/email shared by 2+ profiles, newest first within each group.
export function findDuplicateLeads(profiles) {
  const byPhone = new Map()
  const byEmail = new Map()
  for (const p of profiles) {
    const phone = normPhone(p.client_phone)
    if (phone) { (byPhone.get(phone) || byPhone.set(phone, []).get(phone)).push(p) }
    const email = normEmail(p.client_email)
    if (email) { (byEmail.get(email) || byEmail.set(email, []).get(email)).push(p) }
  }
  const groups = []
  for (const [value, list] of byPhone) {
    if (list.length > 1) groups.push({ key: 'phone:' + value, type: 'phone', value: list[0].client_phone, profiles: sortNewest(list) })
  }
  for (const [value, list] of byEmail) {
    if (list.length > 1) groups.push({ key: 'email:' + value, type: 'email', value: list[0].client_email, profiles: sortNewest(list) })
  }
  return groups
}

const sortNewest = (list) => [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

// Live check while creating/editing a profile — pass the current profile id
// (or null for a brand-new one) so it isn't flagged against itself.
export function matchingLeads(profiles, { phone, email, excludeId } = {}) {
  const p = normPhone(phone)
  const e = normEmail(email)
  if (!p && !e) return []
  return profiles.filter(x => x.id !== excludeId && (
    (p && normPhone(x.client_phone) === p) ||
    (e && normEmail(x.client_email) === e)
  ))
}
