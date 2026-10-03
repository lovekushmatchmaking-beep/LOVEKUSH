import { passesHardFilters, computeMatchScore } from './matching'
import { NAKSHATRAS } from './astrology'

const base = { marital_status: 'Never Married', religion: 'Hindu', age: 28 }
const boy = (x = {}) => ({ ...base, gender: 'Male', ...x })
const girl = (x = {}) => ({ ...base, gender: 'Female', ...x })

test('same gotra is excluded, placeholders are not', () => {
  expect(passesHardFilters(boy({ gotra: 'Kashyap' }), girl({ gotra: 'Kashyap' }))).toBe(false)
  expect(passesHardFilters(boy({ gotra: 'Kashyap' }), girl({ gotra: 'Bharadwaj' }))).toBe(true)
  expect(passesHardFilters(boy({ gotra: "Don't wish to specify" }), girl({ gotra: "Don't wish to specify" }))).toBe(true)
})

test('horoscope required hides low-guna matches only when both charts are known', () => {
  let low = null, high = null
  for (const bn of NAKSHATRAS) for (const gn of NAKSHATRAS) {
    const total = computeMatchScore(boy({ nakshatra: bn, nakshatra_pada: 1 }), girl({ nakshatra: gn, nakshatra_pada: 1 })).guna.total
    if (total < 18 && !low) low = [bn, gn]
    if (total >= 18 && !high) high = [bn, gn]
  }
  const req = { horoscope_match_required: 'Yes', nakshatra_pada: 1 }
  expect(passesHardFilters(boy({ ...req, nakshatra: low[0] }), girl({ nakshatra: low[1], nakshatra_pada: 1 }))).toBe(false)
  expect(passesHardFilters(boy({ nakshatra: low[0], nakshatra_pada: 1 }), girl({ nakshatra: low[1], nakshatra_pada: 1 }))).toBe(true)
  expect(passesHardFilters(boy({ ...req, nakshatra: high[0] }), girl({ nakshatra: high[1], nakshatra_pada: 1 }))).toBe(true)
  expect(passesHardFilters(boy({ ...req, nakshatra: low[0] }), girl({}))).toBe(true)
})

test('guna feeds the score and strengths', () => {
  const r = computeMatchScore(boy({ nakshatra: 'Ashwini' }), girl({ nakshatra: 'Bharani' }))
  expect(r.guna.total).toBe(34)
  expect(r.strengths.some(s => s.startsWith('Guna Milan 34/36'))).toBe(true)
})

test("mother's gotra overlap is a warning", () => {
  const r = computeMatchScore(boy({ gotra: 'Garg', mother_gotra: 'Kashyap' }), girl({ gotra: 'Kashyap' }))
  expect(r.needsDiscussion.some(s => s.includes("mother's gotra"))).toBe(true)
})
