// Biodata (PDF/photo) se nikle text ko signup form ke fields mein badalta
// hai. Yeh pure function hai — koi network/AI nahi. Shaadi ke biodata
// lagbhag hamesha "Label : Value" lines mein hote hain (English ya Hindi),
// isliye label pehchaan ke value ko existing dropdown options se match
// karte hain. Jo value kisi option se match nahi hoti woh "unmatched" mein
// jaati hai taaki user khud chun le — galat value kabhi chupke se nahi
// bharte.

import {
  RELIGIONS, CASTES, GOTRAS, MOTHER_TONGUES, LANGUAGES_SPOKEN, EDUCATIONS, DEGREE_OPTIONS, HEIGHT_RANGES,
  INCOME_RANGES, MARITAL_STATUSES, MANGLIK_OPTIONS, COMPLEXIONS, DIETS, BLOOD_GROUPS,
  PROFESSION_CATEGORIES, COUNTRIES, FAMILY_TYPES, EMPLOYMENT_TYPES, BODY_TYPES,
  CHILDREN_LIVING_WITH_OPTIONS, RELOCATION_PREFERENCES, RESIDENCY_STATUSES,
  SIKH_COMMUNITIES, ISLAMIC_COMMUNITIES, CHRISTIAN_COMMUNITIES, RELIGION_HIERARCHY,
  PARTNER_INCOME_STEPS, PARTNER_HEIGHT_MIN_INCHES, PARTNER_HEIGHT_MAX_INCHES,
  PARTNER_MARITAL_STATUS_PREFERENCES, PARTNER_COMMUNITY_NO_BAR,
} from '../constants/profileOptions'
import { RASHIS, NAKSHATRAS } from './astrology'

// label key -> regex (line ke shuru mein). Order matters: zyada specific
// labels (Father's Occupation) generic (Occupation) se pehle.
const LABELS = [
  // Partner preferences pehle — "Partner Height" ko generic "Height" na pakad le.
  ['partner_age', /((partner'?s?|preferred)\s*age(\s*range)?|age\s*(preference|range|expected)|जीवनसाथी\s*(की)?\s*(आयु|उम्र))/i],
  ['partner_height', /((partner'?s?|preferred)\s*height|height\s*(preference|expected)|जीवनसाथी\s*(की)?\s*(लंबाई|कद))/i],
  ['partner_income', /((partner'?s?|preferred|expected)\s*(annual\s*)?(income|salary|package)|income\s*(preference|expected))/i],
  ['partner_religion', /((partner'?s?|preferred)\s*religion|religion\s*preference)/i],
  ['partner_caste', /((partner'?s?|preferred)\s*(caste|community)|(caste|community)\s*preference)/i],
  ['partner_education', /((partner'?s?|preferred)\s*(education|qualification)|education\s*preference)/i],
  ['partner_occupation', /((partner'?s?|preferred)\s*(occupation|profession|job|employment|work)|(occupation|profession)\s*preference)/i],
  ['partner_marital_status', /((partner'?s?|preferred)\s*marital\s*status|marital\s*status\s*preference)/i],
  ['partner_complexion', /((partner'?s?|preferred)\s*(complexion|colou?r)|complexion\s*preference)/i],
  ['partner_city', /((partner'?s?|preferred)\s*city|city\s*preference)/i],
  ['partner_state', /((partner'?s?|preferred)\s*state|state\s*preference)/i],
  ['partner_country', /((partner'?s?|preferred)\s*country|country\s*preference)/i],
  ['mother_tongue', /(mother\s*tongue|मातृभाषा)/i],
  ['father_profession', /(father'?s?\s*(occupation|profession|job|work|business)|पिता\s*(जी)?\s*(का|की)?\s*(व्यवसाय|पेशा|नौकरी|कार्य))/i],
  ['mother_profession', /(mother'?s?\s*(occupation|profession|job|work)|माता\s*(जी)?\s*(का|की)?\s*(व्यवसाय|पेशा|नौकरी|कार्य))/i],
  ['father_name', /(father'?s?\s*name|father|पिता\s*(जी)?\s*(का)?\s*(नाम)?)/i],
  ['mother_name', /(mother'?s?\s*name|mother|माता\s*(जी)?\s*(का)?\s*(नाम)?)/i],
  ['birth_time', /(time\s*of\s*birth|birth\s*time|tob|जन्म\s*(का)?\s*समय)/i],
  ['birth_place', /(place\s*of\s*birth|birth\s*place|pob|जन्म\s*(का)?\s*स्थान)/i],
  ['dob', /(date\s*of\s*birth|d\.?\s*o\.?\s*b\.?|birth\s*date|born\s*on|जन्म\s*(तिथि|दिनांक|तारीख)|जन्मतिथि)/i],
  ['sub_caste', /(sub[\s-]*caste|उप\s*जाति|उपजाति)/i],
  ['children_living_with', /(children\s*living\s*with|बच्चे\s*(किसके)?\s*साथ\s*रहते)/i],
  ['have_children', /(have\s*(any\s*)?children|do\s*you\s*have\s*children|children\b|बच्चे)/i],
  ['marital_status', /(marital\s*status|वैवाहिक\s*स्थिति)/i],
  ['name', /(full\s*name|name\s*of\s*(the\s*)?(boy|girl|candidate)|candidate'?s?\s*name|name|नाम)/i],
  ['gender', /(gender|sex|लिंग)/i],
  ['height', /(height|कद|लंबाई|लम्बाई|ऊंचाई|ऊँचाई)/i],
  ['weight', /(weight|वजन|वज़न)/i],
  ['body_type', /(body\s*type|शरीर\s*(की)?\s*बनावट)/i],
  ['education', /(educational\s*qualification|qualification|education|शिक्षा|योग्यता)/i],
  ['employer', /(company|employer|organisation|organization|working\s*(at|with)|कंपनी)/i],
  ['employment_type', /(employment\s*type|नौकरी\s*(का)?\s*प्रकार)/i],
  ['occupation', /(occupation|profession|job|designation|working\s*as|व्यवसाय|पेशा|नौकरी)/i],
  ['income', /(annual\s*income|income|salary|package|ctc|आय|वेतन)/i],
  ['religion', /(religion|धर्म)/i],
  ['caste_no_bar', /(caste\s*no\s*bar|जाति\s*(का)?\s*बंधन\s*नहीं)/i],
  ['caste', /(caste|community|जाति|समाज)/i],
  ['gotra', /(gotra|gothra|गोत्र)/i],
  ['manglik', /(manglik|mangalik|manglic|mangal\s*dosh|मांगलिक|मंगली)/i],
  ['kundli_available', /(kundli\s*(available)?|horoscope\s*available|कुंडली\s*(उपलब्ध)?)/i],
  ['rashi', /(rashi|raasi|rasi|moon\s*sign|राशि)/i],
  ['nakshatra', /(nakshatra|nakshatram|natchathiram|birth\s*star|star|नक्षत्र)/i],
  ['complexion', /(complexion|colou?r|skin\s*tone|रंग|वर्ण)/i],
  ['diet', /(diet|food\s*habits?|eating\s*habits?|भोजन|आहार)/i],
  ['blood_group', /(blood\s*group|रक्त\s*समूह)/i],
  ['brothers', /(brothers?|भाई)/i],
  ['sisters', /(sisters?|बहन|बहनें)/i],
  ['family_city', /(family\s*(city|residence|location|lives?\s*in)|परिवार\s*(का)?\s*निवास)/i],
  ['city', /(current\s*city|city|residing\s*(at|in)|location|शहर|निवास)/i],
  ['state', /(state|राज्य|प्रदेश)/i],
  ['native_place', /(native\s*place|native|hometown|मूल\s*निवास|पैतृक\s*गांव)/i],
  ['residency_status', /(residency\s*status|visa\s*status)/i],
  ['relocation_preference', /(relocation\s*preference|willing\s*to\s*relocate|स्थानांतरण\s*(की)?\s*इच्छा)/i],
  ['nationality', /(nationality|citizenship|राष्ट्रीयता)/i],
  ['phone', /(mobile|phone|contact\s*(no|number)?|whatsapp|मोबाइल|संपर्क)/i],
  ['email', /(e-?mail|ईमेल)/i],
  ['family_type', /(family\s*type|परिवार\s*(का)?\s*प्रकार)/i],
  ['smoking', /(smok\w*|धूम्रपान)/i],
  ['drinking', /(drink\w*|alcohol|शराब|मद्यपान)/i],
  ['own_house', /(own\s*house|house|home|मकान|घर)/i],
  ['vehicle', /(vehicle|car|two[\s-]*wheeler|वाहन|गाड़ी)/i],
  ['college', /(college|university|institute|कॉलेज|विश्वविद्यालय)/i],
  ['languages_spoken', /(languages?\s*(known|spoken)?|भाषा(एं)?)/i],
  ['hobbies', /(hobbies|hobby|interests|शौक)/i],
  ['partner_notes', /(partner\s*(expectations?|preferences?|requirements?)|expectations?(\s*from\s*partner)?|looking\s*for|जीवनसाथी\s*(से)?\s*अपेक्षा|अपेक्षा)/i],
  ['about_me', /(about\s*(me|myself|him|her|the\s*(boy|girl|candidate))?|परिचय)/i],
]

const HUMAN_LABELS = {
  name: 'Name', dob: 'Date of Birth', birth_time: 'Birth Time', birth_place: 'Birth Place',
  height: 'Height', education: 'Education', occupation: 'Profession', employer: 'Employer',
  income: 'Annual Income', religion: 'Religion', caste: 'Community / Caste', sub_caste: 'Sub-Caste',
  gotra: 'Gotra', manglik: 'Manglik', rashi: 'Rashi', nakshatra: 'Nakshatra',
  mother_tongue: 'Mother Tongue', marital_status: 'Marital Status', complexion: 'Complexion',
  diet: 'Diet', blood_group: 'Blood Group', father_profession: "Father's Profession",
  mother_profession: "Mother's Profession", brothers: 'Brothers', sisters: 'Sisters',
  city: 'City', native_place: 'Native Place', nationality: 'Nationality', phone: 'Phone',
  email: 'Email', about_me: 'About', gender: 'Gender', weight: 'Weight', father_name: "Father's Name", mother_name: "Mother's Name",
  family_city: 'Family City', state: 'State', family_type: 'Family Type', smoking: 'Smoking', drinking: 'Drinking',
  own_house: 'Own House', vehicle: 'Vehicle', college: 'College', hobbies: 'Hobbies', partner_notes: 'Partner Expectations',
  languages_spoken: 'Languages Known', employment_type: 'Employment Type', body_type: 'Body Type',
  have_children: 'Have Children', children_living_with: 'Children Living With', kundli_available: 'Kundli Available',
  caste_no_bar: 'Caste No Bar', relocation_preference: 'Relocation Preference', residency_status: 'Residency Status',
  partner_age: 'Partner Age', partner_height: 'Partner Height', partner_income: 'Partner Income',
  partner_religion: 'Partner Religion', partner_caste: 'Partner Community', partner_education: 'Partner Education',
  partner_occupation: 'Partner Occupation', partner_marital_status: 'Partner Marital Status',
  partner_complexion: 'Partner Complexion', partner_city: 'Partner City', partner_state: 'Partner State',
  partner_country: 'Partner Country',
}

const DEVANAGARI_DIGITS = '०१२३४५६७८९'
const normDigits = (s) => s.replace(/[०-९]/g, d => String(DEVANAGARI_DIGITS.indexOf(d)))
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// ChatGPT / WhatsApp se paste kiye text ki sajawat hatao: **bold**, # heading,
// "1." numbering, emoji, aur markdown table "| Name | Rahul |" -> "Name : Rahul".
// OCR text par iska koi asar nahi padta.
function cleanLine(line) {
  let l = line.replace(/[\t ]+/g, ' ').replace(/[：]/g, ':').trim()
  if (/^\|?[\s:|-]+\|?$/.test(l) && l.includes('-')) return '' // table divider |---|---|
  if (/^\|.*\|$/.test(l)) {
    const cells = l.slice(1, -1).split('|').map(c => c.trim())
    l = cells.length >= 2 ? cells[0] + ' : ' + cells.slice(1).join(' ') : cells[0]
  }
  return l
    .replace(/\*\*|__|`/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/^#+\s*/, '')
    .replace(/^\(?\d{1,2}[.)]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---- Text -> { labelKey: rawValue } ----
export function extractLabeledValues(text) {
  const lines = normDigits(String(text || ''))
    .replace(/\r/g, '')
    .split('\n')
    .map(cleanLine)
    .filter(Boolean)

  const out = {}
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Line mein ":" ho to label ke baad separator zaroori ("Name of Father :"
    // ko "Name" na samjhe); warna "Height 5'4"" jaisa space bhi chalega.
    const sep = /[:=|]/.test(line) ? '[:\\-–=|]' : '(?:[:;+\\-–=|]|\\s+(?=[0-9A-Za-z\\u0900-\\u097F]))'
    for (const [key, re] of LABELS) {
      if (out[key]) continue
      const m = line.match(new RegExp('^[\\s•*\\-–>]*(?:' + re.source + ')\\s*' + sep + '\\s*(.*)$', 'i'))
      if (!m) continue
      let value = m[m.length - 1].trim()
      // "Name :" akela line pe ho to value agli line mein hoti hai
      if (!value && lines[i + 1] && !/:/.test(lines[i + 1])) value = lines[i + 1].trim()
      value = value.replace(/^[:\-–=|\s]+/, '').trim()
      if (value) { out[key] = value; break }
    }
  }
  return out
}

// ---- Individual value parsers ----
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n) => String(n).padStart(2, '0')
const validDate = (y, m, d) => {
  if (y < 1940 || y > new Date().getFullYear() || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null
}

export function parseDob(raw) {
  const s = String(raw || '').toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1')
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return validDate(+m[1], +m[2], +m[3])
  m = s.match(/(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/)
  if (m) {
    let y = +m[3]
    if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000
    return validDate(y, +m[2], +m[1]) // Indian biodata: DD/MM/YYYY
  }
  m = s.match(/(\d{1,2})[\s,.-]*([a-z]{3,9})[\s,.-]*(\d{4})/)
  if (m && MONTHS.indexOf(m[2].slice(0, 3)) >= 0) return validDate(+m[3], MONTHS.indexOf(m[2].slice(0, 3)) + 1, +m[1])
  m = s.match(/([a-z]{3,9})[\s,.-]*(\d{1,2})[\s,.-]+(\d{4})/)
  if (m && MONTHS.indexOf(m[1].slice(0, 3)) >= 0) return validDate(+m[3], MONTHS.indexOf(m[1].slice(0, 3)) + 1, +m[2])
  return null
}

export function parseTime(raw) {
  const s = String(raw || '').toLowerCase()
  const m = s.match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/) || s.match(/(\d{1,2})\s*(am|pm)/)
  if (!m) return null
  let h = +m[1]
  const min = m[2] && /^\d+$/.test(m[2]) ? +m[2] : 0
  const ap = (m[3] || (m[2] && !/^\d+$/.test(m[2]) ? m[2] : '') || '').replace(/\./g, '')
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${pad(h)}:${pad(min)}`
}

const heightOptionInches = (opt) => {
  const m = opt.match(/(\d+)'(\d+)"/)
  return m ? (+m[1]) * 12 + (+m[2]) : null
}

function heightToInches(raw) {
  const s = String(raw || '').toLowerCase().trim()
  let inches = null
  let m = s.match(/(\d{3})\s*cm/)
  if (m) inches = Math.round(+m[1] / 2.54)
  if (inches == null) {
    m = s.match(/(\d)\s*(?:'|’|ft|feet|foot|फीट|फुट)\s*(\d{1,2})?\s*(?:"|”|''|in|inch|inches|इंच)?/)
    if (m) inches = (+m[1]) * 12 + (m[2] ? +m[2] : 0)
  }
  if (inches == null) {
    m = s.match(/^(\d)\.(\d{1,2})$/) // "5.4" = 5 ft 4 in (biodata convention)
    if (m) inches = (+m[1]) * 12 + (+m[2])
  }
  return inches
}

export function parseHeight(raw) {
  const inches = heightToInches(raw)
  if (inches == null) return null
  let best = null
  for (const opt of HEIGHT_RANGES) {
    const v = heightOptionInches(opt)
    if (v == null) continue
    if (!best || Math.abs(v - inches) < Math.abs(best.v - inches)) best = { opt, v }
  }
  return best && Math.abs(best.v - inches) <= 1 ? best.opt : null
}

const ALL_DEGREES = Object.entries(DEGREE_OPTIONS)
  .filter(([cat]) => cat !== 'System' && cat !== 'General' && cat !== 'Non-Graduate')
  .flatMap(([cat, opts]) => opts.map(o => ({ cat, opt: o })))

// 'M...' se shuru hone wali degrees PG hain (M.Tech, MBA, M.Sc...), MBBS ko chhod ke
const isPgDegree = (opt) => (/^m/i.test(opt) && squash(opt) !== 'mbbs') || /^(pg|executive mba|ml \/ llm)/i.test(opt)
export function parseEducation(raw) {
  const s = String(raw || '')
  const tokens = s.split(/[\s,()/&+]+/).map(squash).filter(Boolean)
  const whole = squash(s)
  let found = null
  for (const { cat, opt } of ALL_DEGREES) {
    // "B.E / B.Tech" jaise options mein har hissa alag check
    const parts = opt.split('/').map(squash).filter(p => p.length >= 2)
    const hit = parts.some(p => tokens.includes(p) || (p.length >= 4 && whole.includes(p)))
    if (!hit) continue
    const score = Math.max(...parts.map(p => p.length))
    const isPg = cat === 'Doctorate' || isPgDegree(opt)
    // Sabse "upar" wali degree rakho (B.Tech + MBA ho to MBA)
    // Poora option hi likha ho ("M.Sc") to "MSc / MFin / MS" jaise combo se behtar
    const exact = tokens.includes(squash(opt)) ? 50 : 0
    const rank = (cat === 'Doctorate' ? 3 : isPg ? 2 : 1) * 100 + exact + score
    if (!found || rank > found.rank) found = { cat, opt, isPg, rank }
  }
  if (found) {
    const education = found.cat === 'Doctorate' ? 'Doctorate'
      : (['Medicine & Healthcare', 'Law'].includes(found.cat) || /^(ca|cs|cfa|icwa)/i.test(found.opt)) && !found.isPg ? 'Professional Degree'
      : found.isPg ? 'Post Graduation' : 'Graduation'
    return { education: EDUCATIONS.includes(education) ? education : 'Graduation', degree: found.opt }
  }
  const low = s.toLowerCase()
  if (/12(th)?|intermediate|inter\b|hsc|senior secondary|इंटर/.test(low)) return { education: 'Class 12th' }
  if (/10(th)?|matric|ssc|high school|हाई स्कूल/.test(low)) return { education: 'Class 10th' }
  if (/post\s*grad|masters?\b/.test(low)) return { education: 'Post Graduation' }
  if (/grad|bachelor|स्नातक/.test(low)) return { education: 'Graduation' }
  return null
}

const matchOption = (raw, options) => {
  const v = squash(raw)
  if (!v) return null
  return options.find(o => squash(o) === v)
    || options.find(o => o.split(/\s*[/(]\s*/).some(part => squash(part) === v))
    || null
}

export function parseCommunity(raw) {
  const v = squash(raw)
  if (!v) return null
  const exact = CASTES.find(c => squash(c) === v)
  if (exact) return { community: exact }
  const head = CASTES.find(c => c.split(/\s+[/-]\s+/).some(part => squash(part) === v))
  if (head) return { community: head }
  return { community: 'Other', community_other: String(raw).trim() }
}

// Sikh community list ke against. "Jat Sikh" jaisa value jiske kai
// sub-group hain (Jat - Achara, Jat - Bhakar…) kisi ek par chupke se nahi
// daalte — "Others / Not in list" + likha hua text, admin khud chunega.
// "Punjabi" Sikh community nahi hai (bhasha/region hai), use chhod dete hain.
export function parseSikhCommunity(raw) {
  const text = String(raw || '').replace(/\b(sikh|sikkh)\b|सिख/gi, ' ').replace(/\s+/g, ' ').trim()
  const v = squash(text)
  if (!v || /^(punjabi|panjabi)$/.test(v)) return null
  const exact = SIKH_COMMUNITIES.find(c => squash(c) === v)
  if (exact) return { community: exact }
  const parts = SIKH_COMMUNITIES.filter(c => c.split(/\s+[/-]\s+/).some(part => squash(part) === v))
  if (parts.length === 1) return { community: parts[0] }
  return { community: 'Others / Not in list', custom_caste_text: String(raw).trim() }
}

export function parseGotra(raw) {
  const v = squash(raw)
  if (!v) return null
  const hit = GOTRAS.find(g => squash(g) === v)
  return hit ? { gotra: hit } : { gotra: 'Other', gotra_other: String(raw).trim() }
}

export function parseManglik(raw) {
  const s = String(raw || '').toLowerCase()
  if (/anshik|partial|आंशिक|low/.test(s)) return null // user khud tay kare
  if (/\b(no|non|nahi|nahin|not)\b|नहीं|ना\b/.test(s)) return 'Non-Manglik'
  if (/\b(yes|manglik|mangalik|haan|ha)\b|हाँ|हां|मांगलिक/.test(s)) return 'Manglik'
  if (/don'?t know|not sure|pata nahi/.test(s)) return "Don't Know"
  return null
}

const RASHI_ALIASES = {
  'Mesha (Aries)': ['mesh', 'mesha', 'aries', 'मेष'],
  'Vrishabha (Taurus)': ['vrishabh', 'vrishabha', 'vrushabh', 'taurus', 'वृषभ', 'वृष'],
  'Mithuna (Gemini)': ['mithun', 'mithuna', 'gemini', 'मिथुन'],
  'Karka (Cancer)': ['kark', 'karka', 'karkataka', 'cancer', 'कर्क'],
  'Simha (Leo)': ['simha', 'singh', 'sinh', 'leo', 'सिंह'],
  'Kanya (Virgo)': ['kanya', 'virgo', 'कन्या'],
  'Tula (Libra)': ['tula', 'tul', 'libra', 'तुला'],
  'Vrischika (Scorpio)': ['vrischika', 'vrishchik', 'vrishchika', 'vruschika', 'scorpio', 'वृश्चिक'],
  'Dhanu (Sagittarius)': ['dhanu', 'dhanus', 'sagittarius', 'धनु'],
  'Makara (Capricorn)': ['makar', 'makara', 'capricorn', 'मकर'],
  'Kumbha (Aquarius)': ['kumbh', 'kumbha', 'aquarius', 'कुंभ', 'कुम्भ'],
  'Meena (Pisces)': ['meen', 'meena', 'pisces', 'मीन'],
}
export function parseRashi(raw) {
  const s = String(raw || '').toLowerCase()
  const words = s.split(/[\s,()/.-]+/).filter(Boolean)
  for (const r of RASHIS) {
    if ((RASHI_ALIASES[r] || []).some(a => words.includes(a) || (/[ऀ-ॿ]/.test(a) && s.includes(a)))) return r
  }
  return null
}

const NAKSHATRA_ALIASES = {
  Ashwini: ['aswini', 'ashvini'], Krittika: ['kritika', 'karthigai', 'kruthika'], Mrigashira: ['mrigasira', 'mrigshira', 'mrugashira'],
  Ardra: ['arudra', 'aridra'], Pushya: ['pushyami', 'poosam', 'pushya'], Ashlesha: ['aslesha', 'ayilyam'],
  Magha: ['makha', 'magam'], Hasta: ['hastha', 'hastam'], Chitra: ['chithra', 'chitta'], Swati: ['swathi', 'svati'],
  Vishakha: ['visakha', 'vishaka'], Anuradha: ['anusham'], Jyeshtha: ['jyeshta', 'jyestha', 'kettai'], Mula: ['moola', 'moolam'],
  Shravana: ['sravana', 'shravan', 'thiruvonam'], Dhanishta: ['dhanishtha', 'avittam'], Shatabhisha: ['satabhisha', 'shatabhishak', 'sadayam'],
  Revati: ['revathi'],
}
export function parseNakshatra(raw) {
  const v = squash(raw)
  if (!v) return null
  // "Purva Phalguni" pehle check ho, warna "Phalguni" galat match ho sakta hai
  const sorted = [...NAKSHATRAS].sort((a, b) => b.length - a.length)
  for (const n of sorted) {
    const names = [n, ...(NAKSHATRA_ALIASES[n] || [])].map(squash)
    if (names.some(x => v.includes(x))) return n
  }
  return null
}

export function parseMaritalStatus(raw) {
  const s = String(raw || '').toLowerCase()
  if (/unmarried|never|single|bachelor|अविवाहित|कुंवारा|कुंवारी/.test(s)) return 'Never Married'
  if (/awaiting/.test(s)) return 'Awaiting Divorce'
  if (/divorc|तलाक/.test(s)) return 'Divorced'
  if (/widow|विधवा|विधुर/.test(s)) return 'Widowed'
  if (/separat/.test(s)) return 'Separated'
  return matchOption(raw, MARITAL_STATUSES)
}

export function parseDiet(raw) {
  const s = String(raw || '').toLowerCase()
  if (/jain/.test(s)) return 'Jain'
  if (/vegan/.test(s)) return 'Vegan'
  if (/egg/.test(s)) return 'Eggetarian'
  if (/occasion/.test(s)) return 'Occasionally Non-Vegetarian'
  if (/non[\s-]*veg|मांसाहारी/.test(s)) return 'Non-Vegetarian'
  if (/veg|शाकाहारी/.test(s)) return 'Vegetarian'
  return matchOption(raw, DIETS)
}

export function parseComplexion(raw) {
  const s = String(raw || '').toLowerCase()
  if (/very\s*fair/.test(s)) return 'Very Fair'
  if (/wheatish\s*brown/.test(s)) return 'Wheatish Brown'
  if (/wheat|गेहुआ|गेहुँआ/.test(s)) return 'Wheatish'
  if (/fair|गोरा|गोरी/.test(s)) return 'Fair'
  if (/very\s*dark/.test(s)) return 'Very Dark'
  if (/dark|sanwla|saanwla|सांवला|सांवली/.test(s)) return 'Dark'
  return matchOption(raw, COMPLEXIONS)
}

// Pehle mile keyword se category (sirf zaahir cases — baaki "Other" + text)
const PROFESSION_KEYWORDS = [
  [/software|developer|programmer|it\b|computer|data\s*(scien|analyst)|tech\s*lead/i, 'IT & Software Engineering'],
  [/doctor|mbbs|surgeon|nurse|physician|dentist|pharmac|medical|hospital|डॉक्टर/i, 'Medical & Healthcare'],
  [/engineer|इंजीनियर/i, 'Engineering'],
  [/teacher|professor|lecturer|tutor|principal|शिक्षक|अध्यापक/i, 'Education & Training'],
  [/bank|account|finance|chartered|\bca\b|auditor/i, 'Accounting, Banking & Finance'],
  [/lawyer|advocate|legal|judge|वकील/i, 'Legal'],
  [/army|navy|air\s*force|defen[cs]e|military|सेना/i, 'Defense'],
  [/ias|ips|police|civil\s*serv|पुलिस/i, 'Civil Services / Law Enforcement'],
  [/farm|agricultur|kisan|किसान|खेती/i, 'Agriculture'],
  [/sales|marketing/i, 'Sales & Marketing'],
  [/\bhr\b|human\s*resource|admin/i, 'Administration & HR'],
  [/architect|interior/i, 'Architecture & Design'],
  [/hotel|hospitality|chef/i, 'Hotel & Hospitality'],
  [/pilot|cabin\s*crew|airline|aviation/i, 'Airline & Aviation'],
  [/not\s*working|unemployed/i, 'Not Working'],
]

export function parseProfessionCategory(raw) {
  const s = String(raw || '')
  for (const [re, cat] of PROFESSION_KEYWORDS) if (re.test(s) && PROFESSION_CATEGORIES.includes(cat)) return cat
  return null
}

export function parseParentProfession(raw, isMother) {
  const s = String(raw || '').toLowerCase()
  if (/late|expired|passed\s*away|स्वर्गीय|स्व\./.test(s)) return { value: 'Passed Away' }
  if (/retire|सेवानिवृत्त/.test(s)) return { value: 'Retired' }
  if (isMother && /house\s*wife|home\s*maker|homemaker|गृहिणी/.test(s)) return { value: 'Homemaker' }
  const cat = parseProfessionCategory(raw)
  if (cat) return { value: cat }
  return { value: 'Other', other: String(raw).trim() }
}

const WORD_NUMS = { no: 0, none: 0, nil: 0, one: 1, two: 2, three: 3, four: 4, five: 5, एक: 1, दो: 2, तीन: 3, चार: 4 }
export function parseSiblings(raw) {
  const s = String(raw || '').toLowerCase()
  if (/^\s*(no|none|nil|nahi|-|0)\b/.test(s)) return { count: 0, married: 0 }
  let count = null
  const m = s.match(/(\d+)/)
  if (m) count = +m[1]
  else {
    const w = Object.keys(WORD_NUMS).find(k => new RegExp('(^|\\s)' + k + '(\\s|$)').test(s))
    if (w) count = WORD_NUMS[w]
  }
  if (count == null || count > 10) return null
  let married = 0
  const mm = s.match(/(\d+)\s*(?:are\s*)?married/)
  if (mm) married = Math.min(+mm[1], count)
  else if (/\bmarried\b|विवाहित/.test(s) && !/unmarried|अविवाहित/.test(s)) married = count
  return { count, married }
}

// "8 LPA", "₹6 lakh p.a.", "50,000 per month", "12 लाख" -> INCOME_RANGES slab
export function parseIncome(raw) {
  const s = String(raw || '').toLowerCase().replace(/,/g, '')
  const m = s.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  let n = parseFloat(m[1])
  let lakhs
  if (/cr|crore|करोड़/.test(s)) lakhs = n * 100
  else if (/l\b|lac|lakh|lpa|लाख/.test(s)) lakhs = n
  else if (/k\b|thousand|हजार|हज़ार/.test(s)) lakhs = (n * 1000) / 100000
  else lakhs = n / 100000
  if (/month|pm\b|p\.m|mahina|महीना|मासिक/.test(s)) lakhs *= 12
  if (!(lakhs > 0)) return null
  if (lakhs < 1) return 'Below ₹1L'
  if (lakhs >= 100) return '₹1Cr+'
  for (const opt of INCOME_RANGES) {
    const r = opt.match(/₹(\d+)(?:L)?–₹?(\d+)(L|Cr)/)
    if (!r) continue
    const lo = +r[1]
    const hi = r[3] === 'Cr' ? +r[2] * 100 : +r[2]
    if (lakhs >= lo && lakhs < hi) return opt
  }
  return null
}

const NAME_PREFIX = /^(mr|mrs|ms|miss|kumari|kum|km|chi|chiranjeevi|sau|shri|shree|sri|smt|dr|er|सुश्री|कुमारी|श्री|चि|कु)\.?\s+/i
export function parseName(raw) {
  const clean = String(raw || '').replace(/\(.*?\)/g, '').replace(NAME_PREFIX, '').replace(/[^A-Za-zऀ-ॿ .'-]/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = clean.split(' ').filter(Boolean)
  if (parts.length < 1 || clean.length > 60) return null
  const cap = (w) => /^[a-z]/i.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w
  if (parts.length === 1) return { first_name: cap(parts[0]) }
  return {
    first_name: cap(parts[0]),
    middle_name: parts.slice(1, -1).map(cap).join(' '),
    last_name: cap(parts[parts.length - 1]),
  }
}

// ---- Main: text -> fields for CreateProfile form ----
// Returns { values: {formKey: value}, found: [{label, raw, shown}], unmatched: [{label, raw}] }
// "62 kg", "62kg", "62" -> existing WEIGHT_RANGES slab
export function parseWeight(raw) {
  const m = String(raw).match(/(\d{2,3}(?:\.\d+)?)/)
  if (!m) return null
  const kg = parseFloat(m[1])
  if (kg < 30 || kg > 200) return null
  if (kg < 45) return 'Below 45kg'
  if (kg < 55) return '45–55kg'
  if (kg < 65) return '55–65kg'
  if (kg < 75) return '65–75kg'
  if (kg < 85) return '75–85kg'
  return 'Above 85kg'
}

// Smoking/Drinking -> HABITS (Never / Occasionally / Yes)
export function parseHabit(raw) {
  const s = String(raw).toLowerCase()
  if (/occasional|social|sometimes|कभी/.test(s)) return 'Occasionally'
  if (/^(no|nil|none|never|non|nahi|नहीं)|non[\s-]*(smok|drink|alcohol)|never|don'?t|doesn'?t|teetotal/.test(s)) return 'Never'
  if (/^(yes|regular|हाँ|हां)|regularly|smokes|drinks/.test(s)) return 'Yes'
  return null
}

export function parseYesNo(raw) {
  const s = String(raw).toLowerCase().trim()
  if (/^(yes|own|owned|haan|हाँ|हां|है|apna|अपना)/.test(s)) return 'Yes'
  if (/^(no|rent|rented|nahi|नहीं|किराय)/.test(s)) return 'No'
  return null
}

export function parseVehicle(raw) {
  const s = String(raw).toLowerCase()
  const car = /car|four[\s-]*wheeler|कार/.test(s)
  const two = /two[\s-]*wheeler|bike|scooty|scooter|motorcycle|बाइक/.test(s)
  if (car && two) return 'Both'
  if (car) return 'Car'
  if (two) return 'Two-Wheeler'
  if (/^(no|nil|none|nahi|नहीं)/.test(s.trim())) return 'No'
  return null
}

export function parseHaveChildren(raw) {
  const s = String(raw || '').toLowerCase().trim()
  if (/prefer\s*not/.test(s)) return 'Prefer not to say'
  if (/^(no|none|nil|nahi|नहीं|0)\b/.test(s)) return 'No'
  if (/^(yes|haan|हाँ|हां)\b/.test(s) || /\d/.test(s)) return 'Yes'
  return null
}

export function parseChildrenLivingWith(raw) {
  const s = String(raw || '').toLowerCase()
  if (/joint(ly)?/.test(s)) return 'Jointly'
  if (/ex[\s-]*spouse/.test(s)) return 'Ex-Spouse'
  if (/^(me|myself|with\s*me)\b/.test(s.trim())) return 'Me'
  return matchOption(raw, CHILDREN_LIVING_WITH_OPTIONS)
}

export function parseEmploymentType(raw) {
  const s = String(raw || '').toLowerCase()
  if (/govt|government|सरकारी/.test(s)) return 'Government'
  if (/business|self[\s-]*employ|own\s*business|entrepreneur|व्यवसाय/.test(s)) return 'Business / Self-Employed'
  if (/not\s*working|unemployed/.test(s)) return 'Not Working'
  if (/student|विद्यार्थी/.test(s)) return 'Student'
  if (/retire|सेवानिवृत्त/.test(s)) return 'Retired'
  if (/private|प्राइवेट/.test(s)) return 'Private Sector'
  return matchOption(raw, EMPLOYMENT_TYPES)
}

export function parseBodyType(raw) {
  const s = String(raw || '').toLowerCase()
  if (/slim|पतला/.test(s)) return 'Slim'
  if (/athlet|fit\b/.test(s)) return 'Athletic'
  if (/average|सामान्य/.test(s)) return 'Average'
  if (/heavy|मोटा/.test(s)) return 'Heavy'
  if (/curvy/.test(s)) return 'Curvy'
  return matchOption(raw, BODY_TYPES)
}

export function parseKundliAvailable(raw) {
  const s = String(raw || '').toLowerCase().trim()
  if (/arrange/.test(s)) return 'Will arrange if needed'
  if (/^(yes|haan|हाँ|हां)/.test(s)) return 'Yes'
  if (/^(no|nahi|नहीं)/.test(s)) return 'No'
  return null
}

export function parseRelocationPreference(raw) {
  const s = String(raw || '').toLowerCase()
  if (/not\s*willing/.test(s)) return 'Not willing to relocate'
  if (/abroad|international|overseas/.test(s)) return 'Open to relocation abroad'
  if (/flexible/.test(s)) return 'Flexible'
  if (/relocat/.test(s)) return 'Open to relocation within my country'
  return matchOption(raw, RELOCATION_PREFERENCES)
}

export function parseResidencyStatus(raw) {
  const s = String(raw || '').toLowerCase()
  if (/applied\s*for\s*pr/.test(s)) return 'Applied for PR'
  if (/green\s*card|permanent\s*resident|\bpr\b/.test(s)) return 'Permanent Resident / Green Card'
  if (/work\s*permit|work\s*visa|h-?1b/.test(s)) return 'Work Permit / Work Visa'
  if (/student\s*visa/.test(s)) return 'Student Visa'
  if (/dependent\s*visa/.test(s)) return 'Dependent Visa'
  if (/visitor\s*visa|temporary\s*visa|tourist/.test(s)) return 'Temporary / Visitor Visa'
  if (/citizen/.test(s)) return 'Citizen'
  return matchOption(raw, RESIDENCY_STATUSES)
}

// "Hindi, English, Bhojpuri" / "Hindi and English" -> matched against the
// existing Mother Tongue list (same options, LANGUAGES_SPOKEN is an alias).
export function parseLanguages(raw) {
  const parts = String(raw || '').split(/[,/&]|\band\b|और/i).map(p => p.trim()).filter(Boolean)
  const matched = [...new Set(parts.map(p => matchOption(p, LANGUAGES_SPOKEN)).filter(Boolean))]
  return matched.length ? matched : null
}

// ---- Partner preferences (biodata ki "Expectations" lines) ----
const RANGE_SPLIT = /\s*(?:-|–|—|\bto\b|से)\s*/i
const listParts = (raw) => String(raw || '').split(/[,/&]|\bor\b|\band\b|या|और/i).map(p => p.trim()).filter(Boolean)
const isNoPref = (raw) => /^(any|anyone|no\s*(bar|preference|pref)|open|doesn'?t\s*matter|not\s*important|कोई\s*भी)\b/i.test(String(raw || '').trim())

export function parsePartnerAge(raw) {
  const s = String(raw || '').toLowerCase()
  const nums = (s.match(/\d{2}/g) || []).map(Number).filter(n => n >= 18 && n <= 70)
  if (!nums.length) return null
  if (nums.length >= 2) return { partner_age_min: Math.min(nums[0], nums[1]), partner_age_max: Math.max(nums[0], nums[1]) }
  if (/below|under|upto|up\s*to|max|less|तक/.test(s)) return { partner_age_max: nums[0] }
  return { partner_age_min: nums[0], ...(/\+|above|plus|min|more/.test(s) ? {} : { partner_age_max: nums[0] }) }
}

export function parsePartnerHeight(raw) {
  const clamp = (v) => Math.max(PARTNER_HEIGHT_MIN_INCHES, Math.min(PARTNER_HEIGHT_MAX_INCHES, v))
  const s = String(raw || '')
  const parts = s.split(RANGE_SPLIT).map(heightToInches).filter(v => v != null)
  if (parts.length >= 2) {
    const [a, b] = parts
    return { partner_height_min: clamp(Math.min(a, b)), partner_height_max: clamp(Math.max(a, b)) }
  }
  const one = heightToInches(s.replace(/\+|above|plus|below|under|upto|up\s*to|max|min/gi, ' '))
  if (one == null) return null
  if (/below|under|upto|up\s*to|max/i.test(s)) return { partner_height_max: clamp(one) }
  return { partner_height_min: clamp(one) }
}

// INR mein: "10 LPA+", "10-20 lakh", "1 crore". Values PARTNER_INCOME_STEPS
// ke slider stops par snap hote hain (min neeche, max upar).
export function parsePartnerIncome(raw) {
  const s = String(raw || '').toLowerCase().replace(/,/g, '')
  const crore = /cr|crore|करोड़/.test(s)
  const nums = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(n => n > 0)
  if (!nums.length) return null
  const toRs = (n) => n >= 1000 ? n : n * (crore ? 10000000 : 100000)
  const steps = PARTNER_INCOME_STEPS.INR
  const floor = (v) => [...steps].reverse().find(x => x <= v) ?? steps[0]
  const ceil = (v) => steps.find(x => x >= v) ?? steps[steps.length - 1]
  if (nums.length >= 2) {
    const a = toRs(nums[0]), b = toRs(nums[1])
    return { partner_income_min: floor(Math.min(a, b)), partner_income_max: ceil(Math.max(a, b)) }
  }
  if (/below|under|upto|up\s*to|max|less/.test(s)) return { partner_income_max: ceil(toRs(nums[0])) }
  return { partner_income_min: floor(toRs(nums[0])) }
}

const parseReligionWord = (v) => {
  const s = String(v || '').toLowerCase()
  return /hindu|हिन्दू|हिंदू|sanatan/.test(s) ? 'Hindu' : /muslim|islam|मुस्लिम/.test(s) ? 'Muslim'
    : /sikh|सिख/.test(s) ? 'Sikh' : /christian|ईसाई/.test(s) ? 'Christian' : /jain|जैन/.test(s) ? 'Jain'
    : /buddh|बौद्ध/.test(s) ? 'Buddhist' : matchOption(v, RELIGIONS)
}

export function parsePartnerReligion(raw) {
  if (isNoPref(raw)) return 'Any'
  const found = [...new Set(listParts(raw).map(parseReligionWord).filter(Boolean))]
  // Form mein ek hi religion chuni ja sakti hai — do-teen likhi hon to admin chunega
  return found.length === 1 ? found[0] : null
}

const communityOptionsFor = (religion) => religion === 'Muslim' ? ISLAMIC_COMMUNITIES
  : religion === 'Christian' ? CHRISTIAN_COMMUNITIES
  : RELIGION_HIERARCHY[religion]?.community.options || CASTES

export function parsePartnerCommunities(raw, religion) {
  if (isNoPref(raw) || /caste\s*no\s*bar|no\s*caste/i.test(String(raw))) return [PARTNER_COMMUNITY_NO_BAR]
  const opts = communityOptionsFor(religion).filter(c => !/^(other|others|don'?t)/i.test(c))
  const found = [...new Set(listParts(raw).map(p => {
    const v = squash(p.replace(/\b(sikh|hindu|muslim)\b/gi, ''))
    return opts.find(c => squash(c) === v) || null
  }).filter(Boolean))]
  return found.length ? found : null
}

export function parsePartnerEducation(raw) {
  const found = [...new Set(listParts(raw).map(p => parseEducation(p)?.education).filter(Boolean))]
  return found.length ? found : null
}

export function parsePartnerOccupation(raw) {
  const found = [...new Set(listParts(raw).map(p => {
    const s = p.toLowerCase()
    if (/govt|government|सरकारी/.test(s)) return 'Government'
    if (/private|mnc|corporate|प्राइवेट/.test(s)) return 'Private Sector'
    if (/business|self[\s-]*employ|entrepreneur|व्यवसाय/.test(s)) return 'Business / Self-Employed'
    return null
  }).filter(Boolean))]
  return found.length ? found : null
}

export function parsePartnerMaritalStatus(raw) {
  if (isNoPref(raw)) return 'No preference'
  const s = String(raw || '').toLowerCase()
  const hits = [/never|unmarried|single|अविवाहित/.test(s) && 'Never married', /divorc/.test(s) && 'Divorced', /widow/.test(s) && 'Widowed'].filter(Boolean)
  if (hits.length === 1) return hits[0]
  return hits.length > 1 ? 'No preference' : matchOption(raw, PARTNER_MARITAL_STATUS_PREFERENCES)
}

// ---- Religion cues (Punjabi ≠ Hindu by default) ----
// "Punjabi" bhasha/region hai, religion nahi — Punjabi Hindu bhi hote hain
// (Khatri, Arora…) aur Sikh bhi. Isliye sirf "Punjabi" dekh ke kuch nahi
// bharte. Sikh tabhi jab saaf cue ho: Sikh/Gursikh/Amritdhari/Sardar/
// Gurdwara jaise shabd, "Kaur" naam mein, ya "Singh" + Punjabi saath mein.
const SIKH_WORDS = /\b(sikh|sikkh|gursikh|amritdhari|keshdhari|kesadhari|sardar|sardarni|gurdwara|gurudwara|khalsa)\b|सिख|सरदार|गुरुद्वारा/i
const PUNJABI_WORDS = /\b(punjabi|panjabi|punjab)\b|पंजाबी|पंजाब/i
const nameWords = (v) => [v.first_name, v.middle_name, v.last_name].filter(Boolean).join(' ').toLowerCase().split(/\s+/)

export function inferReligionFromText(text, values) {
  const words = nameWords(values)
  // Partner preference lines ("Partner Religion: Sikh") apni religion ka cue nahi hain
  const t = String(text || '').split('\n')
    .filter(l => !/partner|expect|preference|looking\s*for|अपेक्षा|जीवनसाथी/i.test(l)).join('\n')
  if (SIKH_WORDS.test(t) || words.includes('kaur') || (words.includes('singh') && PUNJABI_WORDS.test(t))) return 'Sikh'
  if (PUNJABI_WORDS.test(t)) return 'ambiguous-punjabi'
  return null
}

export function parseBiodataText(text, { includeContact = false } = {}) {
  const raw = extractLabeledValues(text)
  const values = {}
  const found = []
  const unmatched = []
  const add = (labelKey, fields, shown) => {
    Object.assign(values, fields)
    found.push({ key: labelKey, label: HUMAN_LABELS[labelKey], raw: raw[labelKey], shown, fields: Object.keys(fields) })
  }
  const miss = (labelKey) => unmatched.push({ key: labelKey, label: HUMAN_LABELS[labelKey], raw: raw[labelKey] })

  const tryField = (labelKey, fn) => {
    if (!raw[labelKey]) return
    const res = fn(raw[labelKey])
    if (res && res.fields && Object.values(res.fields).some(v => v !== '' && v != null)) add(labelKey, res.fields, res.shown)
    else miss(labelKey)
  }
  const single = (formKey, parse) => (v) => { const r = parse(v); return r ? { fields: { [formKey]: r }, shown: r } : null }

  tryField('name', v => { const n = parseName(v); return n ? { fields: n, shown: [n.first_name, n.middle_name, n.last_name].filter(Boolean).join(' ') } : null })
  tryField('gender', v => {
    const s = v.toLowerCase()
    const g = /female|girl|स्त्री|महिला|लड़की/.test(s) ? 'Female' : /male|boy|पुरुष|लड़का/.test(s) ? 'Male' : null
    return g ? { fields: { gender: g }, shown: g } : null
  })
  tryField('dob', single('date_of_birth', parseDob))
  tryField('birth_time', single('birth_time', parseTime))
  tryField('birth_place', v => ({ fields: { birth_place: v.slice(0, 80) }, shown: v.slice(0, 80) }))
  tryField('height', single('height', parseHeight))
  tryField('body_type', single('body_type', parseBodyType))
  tryField('marital_status', single('marital_status', parseMaritalStatus))
  tryField('have_children', single('have_children', parseHaveChildren))
  if (values.have_children === 'Yes') tryField('children_living_with', single('children_living_with', parseChildrenLivingWith))
  else if (raw.children_living_with) miss('children_living_with')
  tryField('languages_spoken', v => { const l = parseLanguages(v); return l ? { fields: { languages_spoken: l }, shown: l.join(', ') } : null })
  tryField('nationality', v => {
    const c = /indian|india|भारतीय/i.test(v) ? 'India' : matchOption(v, COUNTRIES.filter(x => x !== 'Open to All'))
    return c ? { fields: { nationality: c }, shown: c } : null
  })
  tryField('religion', single('religion', parseReligionWord))
  // Religion label na ho (ya "Religion: Punjabi" jaisa ho) to form ka default
  // "Hindu" chupchaap reh jaata tha — Punjabi Sikh profiles Hindu ban jaati
  // thin. Ab saaf Sikh cue ho to Sikh, sirf "Punjabi" ho to admin se puchte hain.
  let askReligion = false
  if (!values.religion) {
    const inferred = inferReligionFromText(text, values)
    const pending = unmatched.findIndex(u => u.key === 'religion')
    if (inferred === 'Sikh') {
      if (pending >= 0) unmatched.splice(pending, 1)
      add('religion', { religion: 'Sikh' }, 'Sikh (from Sikh/Kaur/Singh cues)')
    } else if (inferred === 'ambiguous-punjabi') {
      askReligion = true
      if (pending >= 0) unmatched.splice(pending, 1)
      unmatched.push({ key: 'religion', label: 'Religion', raw: 'Punjabi — choose Hindu or Sikh, form default is Hindu' })
    }
  }
  // Caste list religion ke hisaab se: Hindu (ya religion na mila ho) → CASTES,
  // Sikh → Sikh communities; baaki religions ki apni lists hain, wahan user
  // khud chunega. Religion pooch rahe hain to caste bhi wahi chunega.
  if (askReligion) { if (raw.caste) miss('caste') }
  else if (values.religion === 'Sikh') {
    tryField('caste', v => { const c = parseSikhCommunity(v); return c ? { fields: c, shown: c.custom_caste_text || c.community } : null })
  } else if (!values.religion || values.religion === 'Hindu') {
    tryField('caste', v => { const c = parseCommunity(v); return c ? { fields: c, shown: c.community_other || c.community } : null })
  } else if (raw.caste) miss('caste')
  tryField('sub_caste', v => ({ fields: { sub_caste: v.slice(0, 60) }, shown: v.slice(0, 60) }))
  if (!askReligion && (!values.religion || values.religion === 'Hindu')) {
    tryField('gotra', v => { const g = parseGotra(v); return g ? { fields: g, shown: g.gotra_other || g.gotra } : null })
  } else if (raw.gotra) miss('gotra')
  tryField('manglik', v => { const r = parseManglik(v); return r && MANGLIK_OPTIONS.includes(r) ? { fields: { manglik: r }, shown: r } : null })
  tryField('kundli_available', single('kundli_available', parseKundliAvailable))
  tryField('caste_no_bar', single('caste_no_bar', parseYesNo))
  tryField('rashi', single('rashi', parseRashi))
  tryField('nakshatra', single('nakshatra', parseNakshatra))
  tryField('mother_tongue', single('mother_tongue', v => matchOption(v, MOTHER_TONGUES)))
  tryField('education', v => {
    const e = parseEducation(v)
    return e ? { fields: e, shown: [e.education, e.degree].filter(Boolean).join(' — ') } : null
  })
  tryField('occupation', single('profession', parseProfessionCategory))
  tryField('employer', v => ({ fields: { employer: v.slice(0, 80) }, shown: v.slice(0, 80) }))
  tryField('employment_type', single('employment_type', parseEmploymentType))
  // Income slabs INR mein hain — non-India nationality par user khud chunega
  if (!values.nationality || values.nationality === 'India') tryField('income', single('annual_income', parseIncome))
  else if (raw.income) miss('income')
  tryField('complexion', single('complexion', parseComplexion))
  tryField('diet', single('diet', parseDiet))
  tryField('blood_group', single('blood_group', v => matchOption(v.replace(/\s*(ve|positive)\b/i, '+').replace(/\s*negative\b/i, '-'), BLOOD_GROUPS)))
  tryField('father_profession', v => {
    const p = parseParentProfession(v, false)
    return { fields: { father_profession: p.value, ...(p.other ? { father_profession_other: p.other } : {}) }, shown: p.other || p.value }
  })
  tryField('mother_profession', v => {
    const p = parseParentProfession(v, true)
    return { fields: { mother_profession: p.value, ...(p.other ? { mother_profession_other: p.other } : {}) }, shown: p.other || p.value }
  })
  tryField('brothers', v => {
    const r = parseSiblings(v)
    return r ? { fields: { brothers_count: r.count, brothers_married_count: r.married }, shown: `${r.count}${r.married ? ` (${r.married} married)` : ''}` } : null
  })
  tryField('sisters', v => {
    const r = parseSiblings(v)
    return r ? { fields: { sisters_count: r.count, sisters_married_count: r.married }, shown: `${r.count}${r.married ? ` (${r.married} married)` : ''}` } : null
  })
  tryField('city', v => { const c = v.split(',')[0].trim().slice(0, 60); return c ? { fields: { city: c }, shown: c } : null })
  tryField('native_place', v => ({ fields: { native_place: v.slice(0, 80) }, shown: v.slice(0, 80) }))
  tryField('residency_status', single('residency_status', parseResidencyStatus))
  tryField('relocation_preference', single('relocation_preference', parseRelocationPreference))
  const freeText = (key, max) => (v) => { const t = v.slice(0, max).trim(); return t ? { fields: { [key]: t }, shown: t.length > 60 ? t.slice(0, 60) + '…' : t } : null }
  tryField('family_city', freeText('family_city', 60))
  tryField('state', freeText('state', 60))
  tryField('weight', single('weight', parseWeight))
  tryField('family_type', single('family_type', v => /joint|संयुक्त/i.test(v) ? 'Joint' : /nuclear|एकल/i.test(v) ? 'Nuclear' : matchOption(v, FAMILY_TYPES)))
  tryField('smoking', single('smoking', parseHabit))
  tryField('drinking', single('drinking', parseHabit))
  tryField('own_house', single('own_house', parseYesNo))
  tryField('vehicle', single('vehicle_ownership', parseVehicle))
  tryField('college', freeText('college_name', 100))
  tryField('hobbies', freeText('hobbies', 300))
  tryField('partner_notes', freeText('partner_notes', 1000))
  // Partner preferences
  const range = (fields, fmt) => {
    const lo = Object.entries(fields).find(([k]) => k.endsWith('_min'))?.[1]
    const hi = Object.entries(fields).find(([k]) => k.endsWith('_max'))?.[1]
    return lo != null && hi != null ? (lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`) : lo != null ? `${fmt(lo)}+` : `up to ${fmt(hi)}`
  }
  const inch = (n) => `${Math.floor(n / 12)}'${n % 12}"`
  const lakh = (n) => n >= 10000000 ? `₹${+(n / 10000000).toFixed(1)} Cr` : `₹${+(n / 100000).toFixed(1)}L`
  tryField('partner_age', v => { const r = parsePartnerAge(v); return r ? { fields: r, shown: range(r, n => `${n}`) + ' yrs' } : null })
  tryField('partner_height', v => { const r = parsePartnerHeight(v); return r ? { fields: r, shown: range(r, inch) } : null })
  // Slider INR mein hai — non-India nationality par admin khud set karega
  if (!values.nationality || values.nationality === 'India') {
    tryField('partner_income', v => { const r = parsePartnerIncome(v); return r ? { fields: r, shown: range(r, lakh) } : null })
  } else if (raw.partner_income) miss('partner_income')
  tryField('partner_religion', single('partner_religion', parsePartnerReligion))
  // Community preference ka dropdown tabhi dikhta hai jab partner religion
  // "Any" na ho — religion na likhi ho to apni religion maan lete hain
  // (caste preference lagbhag hamesha apne hi dharm mein hoti hai).
  if (raw.partner_caste) {
    const prefReligion = values.partner_religion && values.partner_religion !== 'Any' ? values.partner_religion : values.religion
    const ids = prefReligion ? parsePartnerCommunities(raw.partner_caste, prefReligion) : null
    if (ids && ids[0] === PARTNER_COMMUNITY_NO_BAR) add('partner_caste', { partner_community_ids: ids }, ids[0])
    else if (ids) add('partner_caste', { partner_community_ids: ids, ...(values.partner_religion && values.partner_religion !== 'Any' ? {} : { partner_religion: prefReligion }) }, ids.join(', '))
    else miss('partner_caste')
  }
  tryField('partner_education', v => { const r = parsePartnerEducation(v); return r ? { fields: { partner_education_level_preferences: r }, shown: r.join(', ') } : null })
  tryField('partner_occupation', v => { const r = parsePartnerOccupation(v); return r ? { fields: { partner_employment_type_preferences: r }, shown: r.join(', ') } : null })
  tryField('partner_marital_status', single('partner_marital_status_preference', parsePartnerMaritalStatus))
  tryField('partner_complexion', single('partner_complexion_preference', v => isNoPref(v) ? null : parseComplexion(v)))
  tryField('partner_city', freeText('partner_city_preference', 60))
  tryField('partner_state', freeText('partner_state_preference', 60))
  tryField('partner_country', single('partner_country_preference', v => isNoPref(v) ? 'Open to All'
    : /indian?|भारत/i.test(v) ? 'India' : matchOption(v, COUNTRIES)))
  tryField('about_me', v => ({ fields: { about_me: v.slice(0, 1000) }, shown: v.length > 80 ? v.slice(0, 80) + '…' : v }))
  if (includeContact) {
    tryField('phone', v => {
      const d = v.replace(/[^\d+]/g, '').replace(/^\+?91(?=\d{10}$)/, '')
      return d.replace(/\D/g, '').length >= 10 ? { fields: { client_phone: d }, shown: d } : null
    })
    tryField('email', v => {
      const m = v.match(/[\w.+-]+@[\w-]+\.[\w.]+/)
      return m ? { fields: { client_email: m[0] }, shown: m[0] } : null
    })
  }

  return { values, found, unmatched }
}

// Form mein apply karne ka order — nationality pehle (currency reset hoti
// hai), education degree se pehle (school-only par degree saaf hoti hai),
// religion community/gotra se pehle.
export const APPLY_ORDER = [
  'nationality', 'religion', 'gender', 'first_name', 'middle_name', 'last_name', 'date_of_birth',
  'education', 'degree', 'annual_income',
]

// Admin yeh prompt ChatGPT mein messy biodata ke saath daalta hai; jawab
// bilkul inhi labels mein aata hai jo upar LABELS pehchaanta hai, to paste
// karte hi zyada se zyada fields bhar jaate hain.
export const BIODATA_CHATGPT_PROMPT = `Rewrite the biodata below as plain text, one detail per line, in exactly this "Label: Value" format. Use only these labels, skip any line whose value is not in the biodata, do not guess, no bold, no bullets, no table.

Name:
Gender: (Male/Female)
Date of Birth: (DD/MM/YYYY)
Birth Time: (e.g. 10:30 AM)
Birth Place:
Height: (e.g. 5'6")
Weight: (in kg)
Marital Status:
Have Children: (Yes/No, only if married)
Religion: (exactly as written; if not written, write Sikh only when there are clear Sikh signs such as Kaur, Singh with Punjabi, Sikh, Gursikh, Amritdhari, Gurdwara; Punjabi is a language/region, not a religion, so never write Hindu just because the person is Punjabi; otherwise skip this line)
Caste: (community/caste only, e.g. Khatri, Arora, Jat Sikh, Ramgarhia; not the language)
Sub Caste:
Caste No Bar: (Yes/No)
Gotra:
Manglik: (Yes/No)
Kundli Available: (Yes/No/Will arrange if needed)
Rashi:
Nakshatra:
Mother Tongue:
Languages Known: (comma separated)
Education: (highest degree, e.g. B.Tech, MBA)
College:
Occupation:
Company:
Employment Type: (Government/Private Sector/Business / Self-Employed/Not Working/Student/Retired)
Annual Income: (e.g. 8 LPA)
Complexion:
Body Type: (Slim/Athletic/Average/Heavy/Curvy)
Diet:
Smoking: (Never/Occasionally/Yes)
Drinking: (Never/Occasionally/Yes)
Blood Group:
Father's Occupation:
Mother's Occupation:
Brothers: (e.g. 2, 1 married)
Sisters: (e.g. 1, 0 married)
City:
State:
Native Place:
Residency Status: (Citizen/Permanent Resident/Work Visa/Student Visa, for NRIs)
Relocation Preference:
Family Type: (Nuclear/Joint)
Family City:
Own House: (Yes/No)
Vehicle: (Car/Two-Wheeler/Both/No)
Hobbies:
Nationality:
Mobile:
Email:
About Me: (one line)

(Only if the biodata says what they want in a partner, also add these lines)
Partner Age: (e.g. 25-30)
Partner Height: (e.g. 5'2" - 5'8")
Partner Income: (e.g. 10 LPA+ or 10-20 LPA)
Partner Religion: (one religion, or Any)
Partner Caste: (comma separated, or No Bar)
Partner Education: (e.g. Graduation, Post Graduation)
Partner Occupation: (Government/Private Sector/Business)
Partner Marital Status: (Never married/Divorced/Widowed/No preference)
Partner Complexion:
Partner City:
Partner State:
Partner Country:
Partner Expectations: (anything else they want, one line)

Biodata:
`
