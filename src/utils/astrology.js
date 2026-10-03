// Ashtakoot Guna Milan (36-point kundli matching) — pure JS, koi API nahi.
//
// Guna Milan sirf do cheezon pe chalta hai: ladke aur ladki ka Janma
// Nakshatra (Moon nakshatra) aur Janma Rashi (Moon sign). Inko
// birth date + time + place se nikalne ke liye ephemeris/API chahiye —
// woh baad mein connect hogi (dekho src/utils/astrologyProvider.js aur
// supabase/functions/astrology-chart). Tab tak jo user apni Rashi /
// Nakshatra jaanta hai (zyadatar Indian families jaanti hain, kundli pe
// likha hota hai) woh Edit Profile / signup mein khud select kar sakta
// hai, aur scoring abhi se kaam karti hai.
//
// Tables traditional North-Indian Ashtakoot convention follow karti hain.
// Vashya rashi-level pe simplified hai (Dhanu/Makara ka half-split nahi
// karte); API connect hone ke baad vendor ka koot-wise result chahein to
// `astro_api_payload` mein store karke override kar sakte hain.

export const RASHIS = [
  'Mesha (Aries)', 'Vrishabha (Taurus)', 'Mithuna (Gemini)', 'Karka (Cancer)',
  'Simha (Leo)', 'Kanya (Virgo)', 'Tula (Libra)', 'Vrischika (Scorpio)',
  'Dhanu (Sagittarius)', 'Makara (Capricorn)', 'Kumbha (Aquarius)', 'Meena (Pisces)',
]

export const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta',
  'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
]

export const NAKSHATRA_PADAS = [1, 2, 3, 4]

// 27 nakshatra x 4 pada = 108 pada, har rashi mein 9 pada.
const rashiOfPada = (nak, pada) => Math.floor((nak * 4 + (pada - 1)) / 9)

// Kisi nakshatra ke padas jin rashis mein padte hain (1 ya 2 rashi).
export function rashisForNakshatra(nakshatra) {
  const n = NAKSHATRAS.indexOf(nakshatra)
  if (n < 0) return []
  const set = new Set([1, 2, 3, 4].map(p => rashiOfPada(n, p)))
  return [...set].map(i => RASHIS[i])
}

// Rashi select hone ke baad sirf wahi nakshatras dikhane ke liye.
export function nakshatrasForRashi(rashi) {
  const r = RASHIS.indexOf(rashi)
  if (r < 0) return NAKSHATRAS
  return NAKSHATRAS.filter((_, n) => [1, 2, 3, 4].some(p => rashiOfPada(n, p) === r))
}

// Profile ke rashi/nakshatra/pada se indices nikalta hai. Rashi khaali ho
// to nakshatra (+ pada) se derive hoti hai; inconsistent combo (jaise
// Ashwini + Vrishabha) ko null maante hain taaki galat score na bane.
export function resolveMoonChart(profile) {
  if (!profile) return null
  const nak = NAKSHATRAS.indexOf(profile.nakshatra)
  if (nak < 0) return null
  const pada = Number(profile.nakshatra_pada) || null
  const possible = [...new Set([1, 2, 3, 4].map(p => rashiOfPada(nak, p)))]
  let rashi = RASHIS.indexOf(profile.rashi)
  if (rashi >= 0) {
    if (!possible.includes(rashi)) return null
  } else if (pada) {
    rashi = rashiOfPada(nak, pada)
  } else if (possible.length === 1) {
    rashi = possible[0]
  } else {
    return null // nakshatra do rashis mein bata hua hai, rashi ya pada chahiye
  }
  return { nak, rashi, pada }
}

// ---------- 1. Varna (1) ----------
// Brahmin 3, Kshatriya 2, Vaishya 1, Shudra 0 — rashi ke element se.
const VARNA = [2, 1, 0, 3, 2, 1, 0, 3, 2, 1, 0, 3]
const VARNA_NAMES = ['Shudra', 'Vaishya', 'Kshatriya', 'Brahmin']

// ---------- 2. Vashya (2) ----------
// 0 Chatushpad, 1 Manav, 2 Jalchar, 3 Vanchar, 4 Keeta
const VASHYA = [0, 0, 1, 2, 3, 1, 1, 4, 1, 2, 1, 2]
const VASHYA_NAMES = ['Chatushpad', 'Manav', 'Jalchar', 'Vanchar', 'Keeta']
const VASHYA_POINTS = [
  [2, 1, 1, 0.5, 1],
  [1, 2, 0.5, 0, 1],
  [1, 0.5, 2, 1, 1],
  [0.5, 0, 1, 2, 0],
  [1, 1, 1, 0, 2],
]

// ---------- 4. Yoni (4) ----------
const YONI_NAMES = ['Horse', 'Elephant', 'Sheep', 'Serpent', 'Dog', 'Cat', 'Rat',
  'Cow', 'Buffalo', 'Tiger', 'Deer', 'Monkey', 'Mongoose', 'Lion']
const YONI = [0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9, 8, 9, 10, 10, 4, 11, 12, 11, 13, 0, 13, 7, 1]
const YONI_POINTS = [
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1],
  [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
  [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
  [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
  [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
  [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
]

// ---------- 5. Graha Maitri (5) ----------
// Rashi lords: 0 Sun, 1 Moon, 2 Mars, 3 Mercury, 4 Jupiter, 5 Venus, 6 Saturn
const PLANET_NAMES = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']
const RASHI_LORD = [2, 5, 3, 1, 0, 3, 5, 2, 4, 6, 6, 4]
// FRIENDSHIP[a][b]: a ki nazar mein b — 1 friend, 0 neutral, -1 enemy
const FRIENDSHIP = [
  [1, 1, 1, 0, 1, -1, -1],
  [1, 1, 0, 1, 0, 0, 0],
  [1, 1, 1, -1, 1, 0, 0],
  [1, -1, 0, 1, 0, 1, 0],
  [1, 1, 1, -1, 1, -1, 0],
  [-1, -1, 0, 1, 0, 1, 1],
  [-1, -1, -1, 1, 0, 1, 1],
]

// ---------- 6. Gana (6) ----------
// 0 Deva, 1 Manushya, 2 Rakshasa
const GANA_NAMES = ['Deva', 'Manushya', 'Rakshasa']
const GANA = [0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 2, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0]
// [boy gana][girl gana]
const GANA_POINTS = [
  [6, 6, 1],
  [5, 6, 0],
  [1, 0, 6],
]

// ---------- 8. Nadi (8) ----------
const NADI_NAMES = ['Adi', 'Madhya', 'Antya']
const nadiOf = nak => [0, 1, 2, 2, 1, 0][nak % 6]

function taraGood(from, to) {
  const count = ((to - from + 27) % 27) + 1
  return ![3, 5, 7].includes(count % 9)
}

// Guna Milan ladke (boy) aur ladki (girl) ke profiles se. Dono ke paas
// resolvable nakshatra/rashi hona chahiye, warna null.
export function computeGunaMilan(boyProfile, girlProfile) {
  const b = resolveMoonChart(boyProfile)
  const g = resolveMoonChart(girlProfile)
  if (!b || !g) return null

  const koots = []
  const doshas = []

  const varnaPts = VARNA[b.rashi] >= VARNA[g.rashi] ? 1 : 0
  koots.push({ key: 'varna', name: 'Varna', max: 1, points: varnaPts,
    detail: VARNA_NAMES[VARNA[b.rashi]] + ' / ' + VARNA_NAMES[VARNA[g.rashi]] })

  koots.push({ key: 'vashya', name: 'Vashya', max: 2, points: VASHYA_POINTS[VASHYA[b.rashi]][VASHYA[g.rashi]],
    detail: VASHYA_NAMES[VASHYA[b.rashi]] + ' / ' + VASHYA_NAMES[VASHYA[g.rashi]] })

  const taraPts = (taraGood(g.nak, b.nak) ? 1.5 : 0) + (taraGood(b.nak, g.nak) ? 1.5 : 0)
  koots.push({ key: 'tara', name: 'Tara', max: 3, points: taraPts, detail: NAKSHATRAS[b.nak] + ' / ' + NAKSHATRAS[g.nak] })

  koots.push({ key: 'yoni', name: 'Yoni', max: 4, points: YONI_POINTS[YONI[b.nak]][YONI[g.nak]],
    detail: YONI_NAMES[YONI[b.nak]] + ' / ' + YONI_NAMES[YONI[g.nak]] })

  const lb = RASHI_LORD[b.rashi], lg = RASHI_LORD[g.rashi]
  const fb = FRIENDSHIP[lb][lg], fg = FRIENDSHIP[lg][lb]
  let maitri
  if (lb === lg || (fb === 1 && fg === 1)) maitri = 5
  else if (fb + fg === 1) maitri = 4         // friend + neutral
  else if (fb === 0 && fg === 0) maitri = 3   // neutral + neutral
  else if (fb + fg === 0) maitri = 1          // friend + enemy
  else if (fb + fg === -1) maitri = 0.5       // neutral + enemy
  else maitri = 0                             // enemy + enemy
  koots.push({ key: 'maitri', name: 'Graha Maitri', max: 5, points: maitri,
    detail: PLANET_NAMES[lb] + ' / ' + PLANET_NAMES[lg] })

  const ganaPts = GANA_POINTS[GANA[b.nak]][GANA[g.nak]]
  koots.push({ key: 'gana', name: 'Gana', max: 6, points: ganaPts,
    detail: GANA_NAMES[GANA[b.nak]] + ' / ' + GANA_NAMES[GANA[g.nak]] })
  if (ganaPts <= 1) doshas.push('Gana Dosha')

  // Bhakoot: ek doosre se rashi distance. 2/12, 5/9, 6/8 = dosha.
  const dist = ((b.rashi - g.rashi + 12) % 12) + 1
  const badBhakoot = [2, 12, 5, 9, 6, 8].includes(dist)
  const bhakootCancelled = badBhakoot && (lb === lg || (fb === 1 && fg === 1))
  koots.push({ key: 'bhakoot', name: 'Bhakoot', max: 7, points: badBhakoot ? 0 : 7,
    detail: RASHIS[b.rashi] + ' / ' + RASHIS[g.rashi] })
  if (badBhakoot) doshas.push(bhakootCancelled ? 'Bhakoot Dosha (cancelled — friendly rashi lords)' : 'Bhakoot Dosha')

  const sameNadi = nadiOf(b.nak) === nadiOf(g.nak)
  // Traditional cancellation: same rashi + alag nakshatra, ya same
  // nakshatra + alag rashi/pada.
  const nadiCancelled = sameNadi && (
    (b.rashi === g.rashi && b.nak !== g.nak) ||
    (b.nak === g.nak && (b.rashi !== g.rashi || (b.pada && g.pada && b.pada !== g.pada)))
  )
  koots.push({ key: 'nadi', name: 'Nadi', max: 8, points: sameNadi ? 0 : 8,
    detail: NADI_NAMES[nadiOf(b.nak)] + ' / ' + NADI_NAMES[nadiOf(g.nak)] })
  if (sameNadi) doshas.push(nadiCancelled ? 'Nadi Dosha (cancelled by exception)' : 'Nadi Dosha')

  const total = koots.reduce((s, k) => s + k.points, 0)
  return { total, max: 36, koots, doshas, verdict: gunaVerdict(total) }
}

export function gunaVerdict(total) {
  if (total < 18) return 'Not recommended'
  if (total < 25) return 'Average'
  if (total < 33) return 'Good'
  return 'Excellent'
}

// Gender-agnostic wrapper — matching code "me"/"other" deta hai.
export function gunaMilanFor(a, b) {
  if (!a || !b || a.gender === b.gender) return null
  return a.gender === 'Male' ? computeGunaMilan(a, b) : computeGunaMilan(b, a)
}

// Gotra placeholders jo asli gotra naam nahi hain — inpe same-gotra rule
// apply nahi hota.
const NON_GOTRA = ['', 'other', 'others / not in list', "don't wish to specify", "don't know", 'gotra not applicable', 'not applicable']
export const isRealGotra = g => !!g && !NON_GOTRA.includes(String(g).trim().toLowerCase())
export const sameGotra = (a, b) => isRealGotra(a) && isRealGotra(b) &&
  String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
