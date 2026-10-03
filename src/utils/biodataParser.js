// Biodata (PDF/photo) se nikle text ko signup form ke fields mein badalta
// hai. Yeh pure function hai — koi network/AI nahi. Shaadi ke biodata
// lagbhag hamesha "Label : Value" lines mein hote hain (English ya Hindi),
// isliye label pehchaan ke value ko existing dropdown options se match
// karte hain. Jo value kisi option se match nahi hoti woh "unmatched" mein
// jaati hai taaki user khud chun le — galat value kabhi chupke se nahi
// bharte.

import {
  RELIGIONS, CASTES, GOTRAS, MOTHER_TONGUES, EDUCATIONS, DEGREE_OPTIONS, HEIGHT_RANGES,
  INCOME_RANGES, MARITAL_STATUSES, MANGLIK_OPTIONS, COMPLEXIONS, DIETS, BLOOD_GROUPS,
  PROFESSION_CATEGORIES, COUNTRIES,
} from '../constants/profileOptions'
import { RASHIS, NAKSHATRAS } from './astrology'

// label key -> regex (line ke shuru mein). Order matters: zyada specific
// labels (Father's Occupation) generic (Occupation) se pehle.
const LABELS = [
  ['mother_tongue', /(mother\s*tongue|मातृभाषा)/i],
  ['father_profession', /(father'?s?\s*(occupation|profession|job|work|business)|पिता\s*(जी)?\s*(का|की)?\s*(व्यवसाय|पेशा|नौकरी|कार्य))/i],
  ['mother_profession', /(mother'?s?\s*(occupation|profession|job|work)|माता\s*(जी)?\s*(का|की)?\s*(व्यवसाय|पेशा|नौकरी|कार्य))/i],
  ['father_name', /(father'?s?\s*name|father|पिता\s*(जी)?\s*(का)?\s*(नाम)?)/i],
  ['mother_name', /(mother'?s?\s*name|mother|माता\s*(जी)?\s*(का)?\s*(नाम)?)/i],
  ['birth_time', /(time\s*of\s*birth|birth\s*time|tob|जन्म\s*(का)?\s*समय)/i],
  ['birth_place', /(place\s*of\s*birth|birth\s*place|pob|जन्म\s*(का)?\s*स्थान)/i],
  ['dob', /(date\s*of\s*birth|d\.?\s*o\.?\s*b\.?|birth\s*date|born\s*on|जन्म\s*(तिथि|दिनांक|तारीख)|जन्मतिथि)/i],
  ['sub_caste', /(sub[\s-]*caste|उप\s*जाति|उपजाति)/i],
  ['marital_status', /(marital\s*status|वैवाहिक\s*स्थिति)/i],
  ['name', /(full\s*name|name\s*of\s*(the\s*)?(boy|girl|candidate)|candidate'?s?\s*name|name|नाम)/i],
  ['gender', /(gender|sex|लिंग)/i],
  ['height', /(height|कद|लंबाई|लम्बाई|ऊंचाई|ऊँचाई)/i],
  ['weight', /(weight|वजन|वज़न)/i],
  ['education', /(educational\s*qualification|qualification|education|शिक्षा|योग्यता)/i],
  ['employer', /(company|employer|organisation|organization|working\s*(at|with)|कंपनी)/i],
  ['occupation', /(occupation|profession|job|designation|working\s*as|व्यवसाय|पेशा|नौकरी)/i],
  ['income', /(annual\s*income|income|salary|package|ctc|आय|वेतन)/i],
  ['religion', /(religion|धर्म)/i],
  ['caste', /(caste|community|जाति|समाज)/i],
  ['gotra', /(gotra|gothra|गोत्र)/i],
  ['manglik', /(manglik|mangalik|manglic|mangal\s*dosh|मांगलिक|मंगली)/i],
  ['rashi', /(rashi|raasi|rasi|moon\s*sign|राशि)/i],
  ['nakshatra', /(nakshatra|nakshatram|natchathiram|birth\s*star|star|नक्षत्र)/i],
  ['complexion', /(complexion|colou?r|skin\s*tone|रंग|वर्ण)/i],
  ['diet', /(diet|food\s*habits?|eating\s*habits?|भोजन|आहार)/i],
  ['blood_group', /(blood\s*group|रक्त\s*समूह)/i],
  ['brothers', /(brothers?|भाई)/i],
  ['sisters', /(sisters?|बहन|बहनें)/i],
  ['city', /(current\s*city|city|residing\s*(at|in)|location|शहर|निवास)/i],
  ['native_place', /(native\s*place|native|hometown|मूल\s*निवास|पैतृक\s*गांव)/i],
  ['nationality', /(nationality|citizenship|राष्ट्रीयता)/i],
  ['phone', /(mobile|phone|contact\s*(no|number)?|whatsapp|मोबाइल|संपर्क)/i],
  ['email', /(e-?mail|ईमेल)/i],
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
  email: 'Email', gender: 'Gender', weight: 'Weight', father_name: "Father's Name", mother_name: "Mother's Name",
}

const DEVANAGARI_DIGITS = '०१२३४५६७८९'
const normDigits = (s) => s.replace(/[०-९]/g, d => String(DEVANAGARI_DIGITS.indexOf(d)))
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// ---- Text -> { labelKey: rawValue } ----
export function extractLabeledValues(text) {
  const lines = normDigits(String(text || ''))
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.replace(/[\t ]+/g, ' ').replace(/[：]/g, ':').trim())
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

export function parseHeight(raw) {
  const s = String(raw || '').toLowerCase()
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
  tryField('marital_status', single('marital_status', parseMaritalStatus))
  tryField('nationality', v => {
    const c = /indian|india|भारतीय/i.test(v) ? 'India' : matchOption(v, COUNTRIES.filter(x => x !== 'Open to All'))
    return c ? { fields: { nationality: c }, shown: c } : null
  })
  tryField('religion', v => {
    const s = v.toLowerCase()
    const r = /hindu|हिन्दू|हिंदू|sanatan/.test(s) ? 'Hindu' : /muslim|islam|मुस्लिम/.test(s) ? 'Muslim'
      : /sikh|सिख/.test(s) ? 'Sikh' : /christian|ईसाई/.test(s) ? 'Christian' : /jain|जैन/.test(s) ? 'Jain'
      : /buddh|बौद्ध/.test(s) ? 'Buddhist' : matchOption(v, RELIGIONS)
    return r ? { fields: { religion: r }, shown: r } : null
  })
  // Caste list sirf Hindu (ya religion na mila ho) ke liye — baaki religions
  // ki apni community lists hain, wahan user khud chunega.
  if (!values.religion || values.religion === 'Hindu') {
    tryField('caste', v => { const c = parseCommunity(v); return c ? { fields: c, shown: c.community_other || c.community } : null })
  } else if (raw.caste) miss('caste')
  tryField('sub_caste', v => ({ fields: { sub_caste: v.slice(0, 60) }, shown: v.slice(0, 60) }))
  if (!values.religion || values.religion === 'Hindu') {
    tryField('gotra', v => { const g = parseGotra(v); return g ? { fields: g, shown: g.gotra_other || g.gotra } : null })
  } else if (raw.gotra) miss('gotra')
  tryField('manglik', v => { const r = parseManglik(v); return r && MANGLIK_OPTIONS.includes(r) ? { fields: { manglik: r }, shown: r } : null })
  tryField('rashi', single('rashi', parseRashi))
  tryField('nakshatra', single('nakshatra', parseNakshatra))
  tryField('mother_tongue', single('mother_tongue', v => matchOption(v, MOTHER_TONGUES)))
  tryField('education', v => {
    const e = parseEducation(v)
    return e ? { fields: e, shown: [e.education, e.degree].filter(Boolean).join(' — ') } : null
  })
  tryField('occupation', single('profession', parseProfessionCategory))
  tryField('employer', v => ({ fields: { employer: v.slice(0, 80) }, shown: v.slice(0, 80) }))
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
