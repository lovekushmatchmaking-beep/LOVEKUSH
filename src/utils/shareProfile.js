// Masked profile sharing — jab Admin kisi client ko doosre profile ka
// match share karta hai, sensitive/private info kabhi text mein nahi
// jaati (phone, email, exact address, internal notes). Yeh wahi
// "official/manual click-to-send" pattern hai (WhatsApp automation
// scraping/unofficial nahi hai, staff khud click karke bhejta hai).

export function buildMaskedShareText(profile) {
  const lines = [
    'LOVEKUSH Global Matchmaking Services',
    '',
    `Profile ID: ${profile.profile_code}`,
    `${profile.gender} • ${profile.age} Years`,
    profile.city ? `${profile.city}${profile.state ? ', ' + profile.state : ''}` : '',
    [profile.religion, profile.community].filter(Boolean).join(' • '),
    profile.education,
    '',
    'For full details and to connect, please contact LOVEKUSH Global Matchmaking Services.',
  ].filter(Boolean)
  return lines.join('\n')
}

// Phone number ko international digits mein badalta hai (wa.me/tel: dono
// isi format ko samajhte hain). 10 digit = Indian mobile (+91 lagta hai),
// "0" se shuru 11 digit = trunk-prefix wala Indian number, baaki sab ko
// country code ke saath maan lete hain. Galat/adhoora number → null.
export function normalizePhone(phone) {
  if (!phone) return null
  let digits = String(phone).replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10) digits = '91' + digits
  return digits.length >= 11 && digits.length <= 15 ? digits : null
}

export function buildWaMeLink(phone, message) {
  const digits = normalizePhone(phone)
  if (!digits) return null
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message)
}

// Admin quick actions — profile ke number par seedha call / WhatsApp chat.
export function buildTelLink(phone) {
  const digits = normalizePhone(phone)
  return digits ? 'tel:+' + digits : null
}

export function buildWaChatLink(phone) {
  const digits = normalizePhone(phone)
  return digits ? 'https://wa.me/' + digits : null
}

export function buildMailtoLink(email, subject, message) {
  if (!email) return null
  return 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(message)
}

// Number pata na ho to WhatsApp khud contact chunne deta hai.
export function buildWaChooserLink(message) {
  return 'https://wa.me/?text=' + encodeURIComponent(message)
}
