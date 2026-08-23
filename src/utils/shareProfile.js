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
    profile.occupation,
    '',
    'For full details and to connect, please contact LOVEKUSH Global Matchmaking Services.',
  ].filter(Boolean)
  return lines.join('\n')
}

export function buildWaMeLink(phone, message) {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  const withCountryCode = digits.length === 10 ? '91' + digits : digits
  return 'https://wa.me/' + withCountryCode + '?text=' + encodeURIComponent(message)
}

export function buildMailtoLink(email, subject, message) {
  if (!email) return null
  return 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(message)
}
