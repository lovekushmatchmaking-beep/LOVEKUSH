import { passesHardFilters, computeMatchScore, sameCasteOrCommunity } from './matching'
import { NAKSHATRAS } from './astrology'

const base = { marital_status: 'Never Married', religion: 'Hindu', age: 28 }
const boy = (x = {}) => ({ ...base, gender: 'Male', ...x })
const girl = (x = {}) => ({ ...base, gender: 'Female', ...x })

test('same gotra is a warning, not an exclusion; placeholders are ignored', () => {
  expect(passesHardFilters(boy({ gotra: 'Kashyap' }), girl({ gotra: 'Kashyap' }))).toBe(true)
  const r = computeMatchScore(boy({ gotra: 'Kashyap' }), girl({ gotra: 'Kashyap' }))
  expect(r.needsDiscussion.some(s => s.includes('Same Gotra'))).toBe(true)
  const r2 = computeMatchScore(boy({ gotra: 'Kashyap' }), girl({ gotra: 'Bharadwaj' }))
  expect(r2.needsDiscussion.some(s => s.includes('Same Gotra'))).toBe(false)
  const r3 = computeMatchScore(boy({ gotra: "Don't wish to specify" }), girl({ gotra: "Don't wish to specify" }))
  expect(r3.needsDiscussion.some(s => s.includes('Same Gotra'))).toBe(false)
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

test('caste spelling variants (Kushwaha/Kushwah) count as same caste, but unrelated short names do not', () => {
  expect(sameCasteOrCommunity('Kushwaha', 'Kushwah')).toBe(true)
  expect(sameCasteOrCommunity('Kushwaha', 'Kushwaha')).toBe(true)
  expect(sameCasteOrCommunity('Yadav', 'Jat')).toBe(false)
  expect(sameCasteOrCommunity('Jat', 'Rat')).toBe(false) // short names: no fuzzy tolerance
  expect(sameCasteOrCommunity('', 'Kushwah')).toBe(false)

  const r = computeMatchScore(boy({ community: 'Kushwaha' }), girl({ community: 'Kushwah' }))
  expect(r.strengths.some(s => s.includes('Same community/caste'))).toBe(true)
  expect(passesHardFilters(
    boy({ community: 'Kushwaha', partner_community_ids: ['Kushwah'] }),
    girl({ community: 'Kushwah' })
  )).toBe(true)
})

test('age ranking is direction-aware: a bride older than the groom ranks below a same-age/younger bride', () => {
  const groom = boy({ age: 30 })
  const sameAgeBride = girl({ age: 30 })
  const olderBride = girl({ age: 32 })
  const scoreSame = computeMatchScore(groom, sameAgeBride).score
  const scoreOlder = computeMatchScore(groom, olderBride).score
  expect(scoreOlder).toBeLessThan(scoreSame)

  // Groom older than bride by the same gap is penalized much less
  // (traditional/common pattern) than bride older by the same gap.
  const groomOlder = computeMatchScore(boy({ age: 32 }), girl({ age: 30 }))
  const brideOlder = computeMatchScore(boy({ age: 30 }), girl({ age: 32 }))
  expect(brideOlder.score).toBeLessThan(groomOlder.score)
  expect(brideOlder.needsDiscussion.some(s => s.includes('older than groom'))).toBe(true)
})

test('partner religion preference supports multiple religions, with backward-compat fallback to the old single-value field', () => {
  // New multi-select array field
  expect(passesHardFilters(
    boy({ partner_religion_preferences: ['Hindu', 'Sikh'] }),
    girl({ religion: 'Sikh' })
  )).toBe(true)
  expect(passesHardFilters(
    boy({ partner_religion_preferences: ['Hindu', 'Sikh'] }),
    girl({ religion: 'Muslim' })
  )).toBe(false)
  // Empty array = Any / open to all
  expect(passesHardFilters(
    boy({ partner_religion_preferences: [] }),
    girl({ religion: 'Muslim' })
  )).toBe(true)
  // Old single-value field still works for profiles that never saved the new field
  expect(passesHardFilters(
    boy({ partner_religion: 'Sikh' }),
    girl({ religion: 'Sikh' })
  )).toBe(true)
  expect(passesHardFilters(
    boy({ partner_religion: 'Sikh' }),
    girl({ religion: 'Hindu' })
  )).toBe(false)
})

test('profession and complexion (existing fields) now feed the score', () => {
  const r1 = computeMatchScore(boy({ profession: 'Software Engineer' }), girl({ profession: 'Software Engineer' }))
  expect(r1.strengths.some(s => s.includes('Same profession'))).toBe(true)
  const r2 = computeMatchScore(boy({ complexion: 'Fair' }), girl({ complexion: 'Fair' }))
  expect(r2.strengths.some(s => s.includes('Same complexion'))).toBe(true)
})
