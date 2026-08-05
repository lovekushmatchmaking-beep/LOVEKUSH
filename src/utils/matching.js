// Matching engine — hard filters (jo match hi nahi honge) aur soft
// scoring (jitna zyada, utna behtar match) dono. Same design-philosophy
// jo Lovekush ke Google-Apps-Script wale system mein bani thi — dono
// taraf ki preferences check hoti hain, ek-taraf nahi.

// "me" = jo dekh raha hai, "other" = jo dikh raha hai
export function passesHardFilters(me, other) {
  // Opposite gender (yeh business abhi sirf Male/Female ke beech
  // matchmaking karta hai — agar future mein aur options chahiye,
  // yahan badalna hoga)
  if (me.gender === other.gender) return false

  // Age: dono taraf ki "partner_age_min/max" preference check karo
  if (me.partner_age_min && other.age < Number(me.partner_age_min)) return false
  if (me.partner_age_max && other.age > Number(me.partner_age_max)) return false
  if (other.partner_age_min && me.age < Number(other.partner_age_min)) return false
  if (other.partner_age_max && me.age > Number(other.partner_age_max)) return false

  // Religion: dono taraf se (agar "Any"/khaali nahi hai to check hota hai)
  const meWantsReligion = me.partner_religion && me.partner_religion !== 'Any'
  const otherWantsReligion = other.partner_religion && other.partner_religion !== 'Any'
  if (meWantsReligion && me.partner_religion !== other.religion) return false
  if (otherWantsReligion && other.partner_religion !== me.religion) return false

  return true
}

// Soft score — 0 se 100 ke beech, jitna zyada utna behtar compatibility.
// Har category ka reason bhi deta hai taaki UI mein "why this match"
// dikha sakein.
export function computeMatchScore(me, other) {
  const reasons = []
  let score = 0
  let maxPossible = 0

  // Education compatibility (25 points)
  maxPossible += 25
  if (me.education && other.education) {
    if (me.education === other.education) {
      score += 25
      reasons.push('Same education level')
    } else {
      score += 12
      reasons.push('Different education level')
    }
  }

  // Location (25 points)
  maxPossible += 25
  if (me.city && other.city) {
    if (me.city.toLowerCase() === other.city.toLowerCase()) {
      score += 25
      reasons.push('Same city')
    } else if (me.state && other.state && me.state.toLowerCase() === other.state.toLowerCase()) {
      score += 15
      reasons.push('Same state')
    } else if (
      (me.partner_location || '').toLowerCase().includes('relocation') ||
      (other.partner_location || '').toLowerCase().includes('relocation') ||
      (me.partner_location || '').toLowerCase().includes('global') ||
      (other.partner_location || '').toLowerCase().includes('global')
    ) {
      score += 10
      reasons.push('Different city, open to relocation')
    } else {
      reasons.push('Different city')
    }
  }

  // Diet (15 points)
  maxPossible += 15
  if (me.diet && other.diet) {
    if (me.diet === other.diet) {
      score += 15
      reasons.push('Same dietary preference')
    } else {
      reasons.push('Different dietary preference')
    }
  }

  // Family Type (15 points)
  maxPossible += 15
  if (me.family_type && other.family_type) {
    if (me.family_type === other.family_type) {
      score += 15
      reasons.push('Same family type')
    } else {
      score += 5
      reasons.push('Different family type')
    }
  }

  // Age closeness bonus (20 points) — jitna age gap kam, utna zyada
  maxPossible += 20
  if (me.age && other.age) {
    const gap = Math.abs(me.age - other.age)
    const ageScore = Math.max(0, 20 - gap * 2)
    score += ageScore
    reasons.push('Age difference: ' + gap + ' years')
  }

  const finalScore = maxPossible > 0 ? Math.round((score / maxPossible) * 100) : 0
  return { score: finalScore, reasons }
}

// Poori list ko filter + score + sort karta hai
export function rankMatches(me, candidates) {
  return candidates
    .filter(other => passesHardFilters(me, other))
    .map(other => ({ profile: other, ...computeMatchScore(me, other) }))
    .sort((a, b) => b.score - a.score)
}

