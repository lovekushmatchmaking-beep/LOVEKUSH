// Matching engine v2 — HARD REQUIREMENTS (jo match hi nahi honge agar
// violate ho) aur SOFT PREFERENCES (jitna zyada match utna behtar score)
// alag-alag. Har match apna "kyun recommend hua" explanation deta hai —
// fake percentage nahi, actual logic se nikla hua.

import { parseHeightToInches, parseIncomeRangeMidpoint } from '../constants/profileOptions'
import { gunaMilanFor, sameGotra } from './astrology'

// Caste/community naam ki spelling variants (jaise "Kushwaha" / "Kushwah" —
// same caste, bas transliteration mein ek 'a' ka farak) ko exact string
// match na hone ki wajah se "different caste" treat karne se bachaata hai.
// Chhota edit-distance tolerance use karte hain, sirf lambe naamon par
// (5+ letters) — chhote naamon (jaise "Jat") par tolerance nahi, warna
// galti se alag castes bhi same maan li jaayengi.
function normalizeCasteName(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ')
}
function levenshtein(a, b) {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = []
  for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}
export function sameCasteOrCommunity(a, b) {
  if (!a || !b) return false
  const na = normalizeCasteName(a), nb = normalizeCasteName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length < 5 || nb.length < 5) return false
  return levenshtein(na, nb) <= 1
}

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
  // Exact match ke saath-saath spelling-variant tolerance bhi (Kushwaha/
  // Kushwah jaisi cases) — sameCasteOrCommunity upar define hai.
  if (meSpecificCommunities.length > 0 && !meSpecificCommunities.some(c => c === other.community || sameCasteOrCommunity(c, other.community))) return false
  if (otherSpecificCommunities.length > 0 && !otherSpecificCommunities.some(c => c === me.community || sameCasteOrCommunity(c, me.community))) return false

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
  // Aryan ne bola profession/complexion jaisi existing fields bhi factor
  // mein aani chahiye — reuse-first, naya field nahi, sirf scoring mein
  // add kiya (existing diet/mother_tongue jaisa "same=bonus" pattern).
  profession: 6, complexion: 4,
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

  // Community / Caste — exact match, ya spelling-variant (Kushwaha/Kushwah)
  if (me.community && other.community) {
    possible += WEIGHTS.community
    if (me.community === other.community) {
      earned += WEIGHTS.community
      strengths.push('Same community/caste (' + me.community + ')')
    } else if (sameCasteOrCommunity(me.community, other.community)) {
      earned += WEIGHTS.community
      strengths.push('Same community/caste (' + me.community + ' / ' + other.community + ' — spelling variant)')
    } else {
      earned += WEIGHTS.community * 0.3
      needsDiscussion.push('Different community (' + me.community + ' / ' + other.community + ')')
    }
  }

  // Gotra — same gotra traditionally avoided hota hai, par kuch families
  // kar bhi lete hain, isliye yeh hard filter nahi hai — sirf warning
  // (Aryan ne confirm kiya: exclude mat karo, flag karo). Maternal gotra
  // bhi kai parivar check karte hain, par yeh universal nahi.
  if (sameGotra(me.gotra, other.gotra)) {
    needsDiscussion.push('⚠ Same Gotra (' + me.gotra + ') — verify with family before proceeding')
  }
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

  // Age closeness — ab direction-aware. India mein groom ka bride se
  // same-age ya bada hona common hai; bride ka groom se bada hona rare
  // hai (Aryan: ~20-30% hi karte hain) — ispe exclude nahi karte (hard
  // filter nahi hai) par ranking mein zyada neeche jaata hai, taaki
  // (e.g.) 30-saal ke ladke ko 32-saal ki ladki 28-saal wali se upar
  // rank na ho.
  if (me.age && other.age) {
    possible += WEIGHTS.age
    const gap = Math.abs(me.age - other.age)
    const male = me.gender === 'Male' ? me : other
    const female = me.gender === 'Male' ? other : me
    const brideOlderBy = (male.gender === 'Male' && female.gender === 'Female') ? female.age - male.age : null
    let ageScore
    if (brideOlderBy != null && brideOlderBy > 0) {
      ageScore = Math.max(0, WEIGHTS.age - 2 - brideOlderBy * 2.5)
    } else if (brideOlderBy != null) {
      const groomOlderBy = -brideOlderBy
      ageScore = Math.max(0, WEIGHTS.age - groomOlderBy * 0.8)
    } else {
      // Dono ka gender pata na ho (test/edge data) — purana symmetric fallback
      ageScore = Math.max(0, WEIGHTS.age - gap * 1.5)
    }
    earned += ageScore
    if (brideOlderBy != null && brideOlderBy > 0) {
      needsDiscussion.push('Bride is ' + brideOlderBy + ' years older than groom — less common pairing, worth discussing with family')
    } else if (gap <= 3) {
      strengths.push('Age difference: ' + gap + ' years (within preference)')
    } else {
      needsDiscussion.push('Age difference: ' + gap + ' years')
    }
  }

  // Profession — same profession ek positive signal hai (existing field,
  // pehle scoring mein bilkul use nahi hota tha)
  if (me.profession && other.profession) {
    possible += WEIGHTS.profession
    if (me.profession === other.profession) {
      earned += WEIGHTS.profession
      strengths.push('Same profession (' + me.profession + ')')
    } else {
      needsDiscussion.push('Profession differs (' + me.profession + ' / ' + other.profession + ')')
    }
  }

  // Complexion — existing field, pehle scoring mein use nahi hota tha.
  // Low weight rakha hai kyunki yeh age/community/education jitna decisive
  // factor nahi hai.
  if (me.complexion && other.complexion) {
    possible += WEIGHTS.complexion
    if (me.complexion === other.complexion) {
      earned += WEIGHTS.complexion
      strengths.push('Same complexion (' + me.complexion + ')')
    }
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
