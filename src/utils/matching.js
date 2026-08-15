// Matching engine v2 — HARD REQUIREMENTS (jo match hi nahi honge agar
// violate ho) aur SOFT PREFERENCES (jitna zyada match utna behtar score)
// alag-alag. Har match apna "kyun recommend hua" explanation deta hai —
// fake percentage nahi, actual logic se nikla hua.

// ===================== HARD REQUIREMENTS =====================
// "me" = jo dekh raha hai, "other" = jo dikh raha hai. Dono taraf ki
// preferences check hoti hain — sirf ek taraf se nahi.
export function passesHardFilters(me, other) {
  // Gender — opposite hona zaroori hai
  if (me.gender === other.gender) return false

  // Age preference — dono taraf se
  if (me.partner_age_min && other.age < Number(me.partner_age_min)) return false
  if (me.partner_age_max && other.age > Number(me.partner_age_max)) return false
  if (other.partner_age_min && me.age < Number(other.partner_age_min)) return false
  if (other.partner_age_max && me.age > Number(other.partner_age_max)) return false

  // Religion — dono taraf se (agar explicit preference hai, "Any" nahi)
  const meWantsReligion = me.partner_religion && me.partner_religion !== 'Any'
  const otherWantsReligion = other.partner_religion && other.partner_religion !== 'Any'
  if (meWantsReligion && me.partner_religion !== other.religion) return false
  if (otherWantsReligion && other.partner_religion !== me.religion) return false

  // Marital Status compatibility — Never-Married sirf Never-Married se,
  // Divorced/Widowed aapas mein. Yeh Indian matrimonial mein standard
  // hard-rule hai (jaisa Lovekush ke GAS system mein bhi tha).
  const maritalCompat = {
    'Never Married': ['Never Married'],
    'Divorced': ['Divorced', 'Widowed'],
    'Widowed': ['Divorced', 'Widowed'],
  }
  if (me.marital_status && other.marital_status) {
    const allowed = maritalCompat[me.marital_status] || [me.marital_status]
    if (!allowed.includes(other.marital_status)) return false
  }

  return true
}

// ===================== SOFT PREFERENCES (scored) =====================
// Har category apna weight rakhta hai. Total weight ~100 (agar sab data
// available ho) — jo fields khaali hain unhe skip karke baaki se
// re-normalize hota hai, taaki incomplete profiles ko unfairly kam
// score na mile.
const WEIGHTS = {
  community: 20, education: 12, incomeOccupation: 12, location: 12,
  age: 10, familyType: 8, diet: 8, manglik: 8, motherTongue: 5, lifestyle: 5,
}

function scoreCategory(condition, points, strengthText, discussText) {
  return condition
    ? { points, strength: strengthText }
    : { points: 0, discuss: discussText }
}

export function computeMatchScore(me, other) {
  const strengths = []
  const needsDiscussion = []
  let earned = 0
  let possible = 0

  // Community / Caste
  if (me.community && other.community) {
    possible += WEIGHTS.community
    if (me.community === other.community) {
      earned += WEIGHTS.community
      strengths.push('Same community/caste (' + me.community + ')')
    } else {
      earned += WEIGHTS.community * 0.3
      needsDiscussion.push('Different community (' + me.community + ' / ' + other.community + ')')
    }
  }

  // Gotra — different gotra is a POSITIVE (culturally preferred), same is a flag
  if (me.gotra && other.gotra) {
    if (me.gotra !== other.gotra) {
      strengths.push('Different Gotra')
    } else {
      needsDiscussion.push('⚠ Same Gotra — verify with family before proceeding')
    }
  }

  // Manglik compatibility
  if (me.manglik && other.manglik) {
    possible += WEIGHTS.manglik
    const mv = me.manglik, ov = other.manglik
    if (mv === ov) {
      earned += WEIGHTS.manglik
      strengths.push('Manglik status matches (' + mv + ')')
    } else if (mv === "Don't Know" || ov === "Don't Know") {
      earned += WEIGHTS.manglik * 0.5
      needsDiscussion.push('Manglik status unclear for one profile — verify')
    } else {
      needsDiscussion.push('⚠ Manglik mismatch (' + mv + ' / ' + ov + ') — consult family/astrologer')
    }
  }

  // Education
  if (me.education && other.education) {
    possible += WEIGHTS.education
    if (me.education === other.education) {
      earned += WEIGHTS.education
      strengths.push('Same education level (' + me.education + ')')
    } else {
      earned += WEIGHTS.education * 0.5
      needsDiscussion.push('Education differs (' + me.education + ' / ' + other.education + ')')
    }
  }

  // Income / Occupation (basic presence-based signal — real income-range
  // comparison ke liye INCOME_RANGES ko ordered-scale banana hoga, abhi
  // simple compatibility check)
  if (me.annual_income && other.partner_notes !== undefined) {
    possible += WEIGHTS.incomeOccupation
    if (me.occupation && other.occupation) {
      earned += WEIGHTS.incomeOccupation
      strengths.push('Occupation: ' + other.occupation)
    } else {
      earned += WEIGHTS.incomeOccupation * 0.4
    }
  }

  // Location
  if (me.city && other.city) {
    possible += WEIGHTS.location
    if (me.city.toLowerCase() === other.city.toLowerCase()) {
      earned += WEIGHTS.location
      strengths.push('Same city (' + me.city + ')')
    } else if (me.state && other.state && me.state.toLowerCase() === other.state.toLowerCase()) {
      earned += WEIGHTS.location * 0.6
      strengths.push('Same state (' + me.state + ')')
    } else {
      const openToRelocate = (me.relocation_preference || '').toLowerCase().includes('open') ||
        (other.relocation_preference || '').toLowerCase().includes('open')
      if (openToRelocate) {
        earned += WEIGHTS.location * 0.4
        strengths.push('Different city, but open to relocation')
      } else {
        needsDiscussion.push('Different city (' + me.city + ' / ' + other.city + '), relocation preference differs')
      }
    }
  }

  // Age closeness
  if (me.age && other.age) {
    possible += WEIGHTS.age
    const gap = Math.abs(me.age - other.age)
    const ageScore = Math.max(0, WEIGHTS.age - gap * 1.5)
    earned += ageScore
    if (gap <= 3) strengths.push('Age difference: ' + gap + ' years (within preference)')
    else needsDiscussion.push('Age difference: ' + gap + ' years')
  }

  // Family Type
  if (me.family_type && other.family_type) {
    possible += WEIGHTS.familyType
    if (me.family_type === other.family_type) {
      earned += WEIGHTS.familyType
      strengths.push('Same family type (' + me.family_type + ')')
    } else {
      earned += WEIGHTS.familyType * 0.3
      needsDiscussion.push('Family type differs (' + me.family_type + ' / ' + other.family_type + ')')
    }
  }

  // Diet + Smoking/Drinking (lifestyle)
  if (me.diet && other.diet) {
    possible += WEIGHTS.diet
    if (me.diet === other.diet) {
      earned += WEIGHTS.diet
      strengths.push('Same dietary preference (' + me.diet + ')')
    } else {
      needsDiscussion.push('Dietary preference differs (' + me.diet + ' / ' + other.diet + ')')
    }
  }
  if ((me.smoking || me.drinking) && (other.smoking || other.drinking)) {
    possible += WEIGHTS.lifestyle
    const meClean = (me.smoking === 'Never' || !me.smoking) && (me.drinking === 'Never' || !me.drinking)
    const otherClean = (other.smoking === 'Never' || !other.smoking) && (other.drinking === 'Never' || !other.drinking)
    if (meClean === otherClean) {
      earned += WEIGHTS.lifestyle
      strengths.push('Compatible lifestyle (smoking/drinking)')
    } else {
      needsDiscussion.push('Smoking/drinking habits differ — worth discussing')
    }
  }

  // Mother Tongue
  if (me.mother_tongue && other.mother_tongue) {
    possible += WEIGHTS.motherTongue
    if (me.mother_tongue === other.mother_tongue) {
      earned += WEIGHTS.motherTongue
      strengths.push('Same mother tongue (' + me.mother_tongue + ')')
    } else {
      needsDiscussion.push('Different mother tongue (' + me.mother_tongue + ' / ' + other.mother_tongue + ')')
    }
  }

  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0

  return {
    score,
    strengths,
    needsDiscussion,
    // Backward-compat: purana flat "reasons" bhi de dete hain (kuch UI abhi
    // isi ka use kar rahe honge)
    reasons: [...strengths, ...needsDiscussion],
  }
}

// Poori list ko filter + score + sort karta hai
export function rankMatches(me, candidates) {
  return candidates
    .filter(other => passesHardFilters(me, other))
    .map(other => ({ profile: other, ...computeMatchScore(me, other) }))
    .sort((a, b) => b.score - a.score)
}
