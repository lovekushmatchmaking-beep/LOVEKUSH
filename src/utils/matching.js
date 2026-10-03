// Matching engine v2 — HARD REQUIREMENTS (jo match hi nahi honge agar
// violate ho) aur SOFT PREFERENCES (jitna zyada match utna behtar score)
// alag-alag. Har match apna "kyun recommend hua" explanation deta hai —
// fake percentage nahi, actual logic se nikla hua.

import { parseHeightToInches, parseIncomeRangeMidpoint } from '../constants/profileOptions'
import { gunaMilanFor, sameGotra } from './astrology'

// "Horoscope Match Required? = Yes" wale member ko 18/36 se kam Guna
// wale profiles nahi dikhte (traditional minimum).
export const MIN_GUNA_WHEN_REQUIRED = 18

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

  // Height preference — dono taraf se, jaisa Age preference upar hai.
  // Height string se parse hoti hai (missing/unparseable height wale
  // profiles is filter se kabhi exclude nahi hote — sirf jinka height
  // pata hai aur preference violate karta hai unhi ko filter kiya jaata hai)
  const otherHeightInches = parseHeightToInches(other.height)
  const meHeightInches = parseHeightToInches(me.height)
  if (me.partner_height_min && otherHeightInches && otherHeightInches < Number(me.partner_height_min)) return false
  if (me.partner_height_max && otherHeightInches && otherHeightInches > Number(me.partner_height_max)) return false
  if (other.partner_height_min && meHeightInches && meHeightInches < Number(other.partner_height_min)) return false
  if (other.partner_height_max && meHeightInches && meHeightInches > Number(other.partner_height_max)) return false

  // Religion — dono taraf se (agar explicit preference hai, "Any" nahi)
  const meWantsReligion = me.partner_religion && me.partner_religion !== 'Any'
  const otherWantsReligion = other.partner_religion && other.partner_religion !== 'Any'
  if (meWantsReligion && me.partner_religion !== other.religion) return false
  if (otherWantsReligion && other.partner_religion !== me.religion) return false

  // Community preference — dono taraf se. "Any Community / No Bar",
  // "Inter-community", "Others" aur "Don't wish to specify" koi actual
  // caste/community naam nahi hain, isliye inme se koi bhi selected ho
  // aur koi REAL community naam saath mein select na ho, to community
  // filtering skip ho jaati hai (no restriction). Agar real community
  // naam bhi selected hain, sirf unhi se match hoga.
  const NON_SPECIFIC = ['Any Community / No Bar', 'Inter-community', 'Others', "Don't wish to specify"]
  const meSpecificCommunities = (me.partner_community_ids || []).filter(c => !NON_SPECIFIC.includes(c))
  const otherSpecificCommunities = (other.partner_community_ids || []).filter(c => !NON_SPECIFIC.includes(c))
  if (meSpecificCommunities.length > 0 && !meSpecificCommunities.includes(other.community)) return false
  if (otherSpecificCommunities.length > 0 && !otherSpecificCommunities.includes(me.community)) return false

  // Education level preference — dono taraf se. Search screen par user
  // jo education levels chunta hai wo ab tak sirf save hote the, matching
  // mein kabhi use nahi hote the. Khaali list = sab acceptable (jaisa
  // MatchSearch.js ka hint text kehta hai).
  if ((me.partner_education_level_preferences || []).length > 0 && other.education &&
      !me.partner_education_level_preferences.includes(other.education)) return false
  if ((other.partner_education_level_preferences || []).length > 0 && me.education &&
      !other.partner_education_level_preferences.includes(me.education)) return false

  // Country preference — dono taraf se. "Open to All" = koi restriction nahi.
  if (me.partner_country_preference && me.partner_country_preference !== 'Open to All' &&
      other.country && other.country !== me.partner_country_preference) return false
  if (other.partner_country_preference && other.partner_country_preference !== 'Open to All' &&
      me.country && me.country !== other.partner_country_preference) return false

  // Same Gotra — Hindu/Jain parampara mein same gotra mein shaadi nahi
  // hoti, isliye yeh hard filter hai (pehle sirf warning tha). Placeholder
  // values ("Don't wish to specify", "Others / Not in list"...) pe rule
  // apply nahi hota — dekho isRealGotra in astrology.js.
  if (sameGotra(me.gotra, other.gotra)) return false

  // Horoscope Match Required = Yes — dono ki Rashi/Nakshatra pata ho aur
  // Guna Milan 18 se kam ho to match nahi dikhta. Data missing ho to
  // exclude nahi karte (computeMatchScore "kundli maangein" bolta hai).
  if (me.horoscope_match_required === 'Yes' || other.horoscope_match_required === 'Yes') {
    const guna = gunaMilanFor(me, other)
    if (guna && guna.total < MIN_GUNA_WHEN_REQUIRED) return false
  }

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
  christianDenomination: 10, guna: 10,
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

  // Gotra — same gotra ab hard filter hai (passesHardFilters). Yahan
  // sirf maternal gotra check: kai parivar maa ka gotra bhi avoid karte
  // hain, par yeh universal nahi, isliye sirf warning.
  if (sameGotra(me.mother_gotra, other.gotra) || sameGotra(other.mother_gotra, me.gotra)) {
    needsDiscussion.push("⚠ One partner's gotra matches the other's mother's gotra — check family tradition")
  }

  // Guna Milan (Ashtakoot, 36 points) — dono ki Rashi/Nakshatra ho tabhi.
  const guna = gunaMilanFor(me, other)
  if (guna) {
    possible += WEIGHTS.guna
    earned += WEIGHTS.guna * (guna.total / guna.max)
    const line = 'Guna Milan ' + guna.total + '/36 (' + guna.verdict + ')'
    if (guna.total >= MIN_GUNA_WHEN_REQUIRED) strengths.push(line)
    else needsDiscussion.push('⚠ ' + line + ' — consult family/astrologer')
    guna.doshas.filter(d => !d.includes('cancelled')).forEach(d => needsDiscussion.push('⚠ ' + d + ' — consult family/astrologer'))
  } else if ((me.horoscope_match_required === 'Yes' || other.horoscope_match_required === 'Yes') && !(me.nakshatra && other.nakshatra)) {
    needsDiscussion.push('Horoscope match wanted — Rashi/Nakshatra missing, ask for kundli')
  }

  // Christian denomination — same-denomination match is a bonus, additive only
  if (me.religion === 'Christian' && other.religion === 'Christian' && me.christian_denomination && other.christian_denomination) {
    possible += WEIGHTS.christianDenomination
    if (me.christian_denomination === other.christian_denomination) {
      earned += WEIGHTS.christianDenomination
      strengths.push('Same denomination (' + me.christian_denomination + ')')
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

  // Income — doosre ki annual_income ko mere partner_income_min/max range
  // se compare karte hain (parseIncomeRangeMidpoint se slab string ko
  // number banate hain). Alag currency ho to galat compare karne se
  // achha hai category hi skip kar dein (koi FX conversion nahi hai).
  // PEHLE: `other.partner_notes !== undefined` lagbhag hamesha true tha,
  // isliye har match ko ye poore 12 points free mil jaate the.
  if (me.partner_income_min != null && me.partner_income_max != null &&
      other.annual_income && other.annual_income_currency === me.partner_income_currency) {
    const otherIncome = parseIncomeRangeMidpoint(other.annual_income, other.annual_income_currency)
    if (otherIncome != null) {
      possible += WEIGHTS.incomeOccupation
      const min = Number(me.partner_income_min), max = Number(me.partner_income_max)
      if (otherIncome >= min && otherIncome <= max) {
        earned += WEIGHTS.incomeOccupation
        strengths.push('Income within your preferred range')
      } else {
        earned += WEIGHTS.incomeOccupation * 0.3
        needsDiscussion.push('Income outside your preferred range')
      }
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
    guna,
  }
}

// Poori list ko filter + score + sort karta hai
export function rankMatches(me, candidates) {
  return candidates
    .filter(other => passesHardFilters(me, other))
    .map(other => ({ profile: other, ...computeMatchScore(me, other) }))
    .sort((a, b) => b.score - a.score)
}
