import { computeGunaMilan, gunaMilanFor, resolveMoonChart, nakshatrasForRashi, rashisForNakshatra, sameGotra, NAKSHATRAS, RASHIS } from './astrology'

const P = (gender, nakshatra, rashi, nakshatra_pada) => ({ gender, nakshatra, rashi, nakshatra_pada })

test('every nakshatra lies in 1-2 rashis and rashi->nakshatra lists cover all 27', () => {
  NAKSHATRAS.forEach(n => expect(rashisForNakshatra(n).length).toBeGreaterThanOrEqual(1))
  const covered = new Set(RASHIS.flatMap(r => nakshatrasForRashi(r)))
  expect(covered.size).toBe(27)
})

test('inconsistent rashi/nakshatra combo is rejected; split nakshatra needs rashi or pada', () => {
  expect(resolveMoonChart(P('Male', 'Ashwini', 'Vrishabha (Taurus)'))).toBeNull()
  expect(resolveMoonChart(P('Male', 'Krittika'))).toBeNull()
  expect(resolveMoonChart(P('Male', 'Krittika', '', 1)).rashi).toBe(0)
  expect(resolveMoonChart(P('Male', 'Krittika', '', 2)).rashi).toBe(1)
  expect(resolveMoonChart(P('Male', 'Rohini')).rashi).toBe(1)
})

test('score stays in 0..36 for every pair and koot maxima add to 36', () => {
  for (let b = 0; b < 27; b++) for (let g = 0; g < 27; g++) {
    const r = computeGunaMilan(P('Male', NAKSHATRAS[b], '', 1), P('Female', NAKSHATRAS[g], '', 1))
    expect(r.koots.reduce((s, k) => s + k.max, 0)).toBe(36)
    expect(r.total).toBeGreaterThanOrEqual(0)
    expect(r.total).toBeLessThanOrEqual(36)
    r.koots.forEach(k => expect(k.points).toBeLessThanOrEqual(k.max))
  }
})

test('same nakshatra + same rashi: Nadi dosha, Bhakoot full', () => {
  const r = computeGunaMilan(P('Male', 'Rohini'), P('Female', 'Rohini'))
  expect(r.koots.find(k => k.key === 'nadi').points).toBe(0)
  expect(r.koots.find(k => k.key === 'bhakoot').points).toBe(7)
  expect(r.doshas).toContain('Nadi Dosha')
})

test('Ashwini boy x Bharani girl (both Mesha)', () => {
  const r = computeGunaMilan(P('Male', 'Ashwini'), P('Female', 'Bharani'))
  const pts = Object.fromEntries(r.koots.map(k => [k.key, k.points]))
  expect(pts).toEqual({ varna: 1, vashya: 2, tara: 3, yoni: 2, maitri: 5, gana: 6, bhakoot: 7, nadi: 8 })
  expect(r.total).toBe(34)
})

test('gunaMilanFor orders by gender', () => {
  const a = P('Female', 'Bharani'), b = P('Male', 'Ashwini')
  expect(gunaMilanFor(a, b).total).toBe(gunaMilanFor(b, a).total)
  expect(gunaMilanFor(a, { ...b, gender: 'Female' })).toBeNull()
})

test('sameGotra ignores placeholders and case', () => {
  expect(sameGotra('Kashyap', 'kashyap ')).toBe(true)
  expect(sameGotra("Don't wish to specify", "Don't wish to specify")).toBe(false)
  expect(sameGotra('Others / Not in list', 'Others / Not in list')).toBe(false)
})

test('Yoni score is symmetric (boy/girl order does not change it)', () => {
  for (let b = 0; b < 27; b++) for (let g = 0; g < 27; g++) {
    const y1 = computeGunaMilan(P('Male', NAKSHATRAS[b], '', 1), P('Female', NAKSHATRAS[g], '', 1)).koots.find(k => k.key === 'yoni').points
    const y2 = computeGunaMilan(P('Male', NAKSHATRAS[g], '', 1), P('Female', NAKSHATRAS[b], '', 1)).koots.find(k => k.key === 'yoni').points
    expect(y1).toBe(y2)
  }
})
