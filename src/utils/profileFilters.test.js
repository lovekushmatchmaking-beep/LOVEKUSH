import { searchTokens, profileMatchesSearch, profileMatchesFilters, applyFiltersToQuery, applySearchToQuery,
  activeFilterKeys, filterChips, fieldsForScope, withDataOptions } from './profileFilters'

const p = {
  profile_code: 'LK-1042', city: 'New Delhi', state: 'Delhi', community: 'Kushwaha', gotra: 'Kashyap',
  education: 'B.Tech / B.E.', diet: 'Vegetarian', languages_spoken: ['Hindi', 'English'],
  client_phone: '9876543210', created_at: new Date().toISOString(),
}

test('search tokens: words split, phones normalised', () => {
  expect(searchTokens('  kushwaha   delhi ')).toEqual(['kushwaha', 'delhi'])
  expect(searchTokens('+91 98765-43210')).toEqual(['9876543210'])
  expect(searchTokens('a,b(c)')).toEqual(['abc'])
  expect(searchTokens('')).toEqual([])
})

test('every word must match some field', () => {
  expect(profileMatchesSearch(p, 'kushwaha delhi', ['community', 'city'])).toBe(true)
  expect(profileMatchesSearch(p, 'kushwaha mumbai', ['community', 'city'])).toBe(false)
  expect(profileMatchesSearch(p, '+91 98765 43210', ['client_phone'])).toBe(true)
  expect(profileMatchesSearch(p, '', ['city'])).toBe(true)
})

test('client-side filters: multi, array, text, recency', () => {
  expect(profileMatchesFilters(p, { diet: ['Vegetarian', 'Jain'] })).toBe(true)
  expect(profileMatchesFilters(p, { diet: ['Vegan'] })).toBe(false)
  expect(profileMatchesFilters(p, { languages_spoken: ['English'] })).toBe(true)
  expect(profileMatchesFilters(p, { languages_spoken: ['Tamil'] })).toBe(false)
  expect(profileMatchesFilters(p, { gotra: 'kash' })).toBe(true)
  expect(profileMatchesFilters(p, { created_at: 7 })).toBe(true)
  expect(profileMatchesFilters({ ...p, created_at: '2020-01-01' }, { created_at: 7 })).toBe(false)
  // empty values don't narrow
  expect(profileMatchesFilters(p, { diet: [], gotra: '', created_at: null })).toBe(true)
})

test('query builder gets one call per active filter / search word', () => {
  const calls = []
  const q = new Proxy({}, { get: (_, name) => (...args) => { calls.push([name, ...args]); return q } })
  applyFiltersToQuery(q, { diet: ['Jain'], languages_spoken: ['Hindi'], gotra: 'kas%hyap', created_at: 30, smoking: [] })
  expect(calls.map(c => c[0])).toEqual(['in', 'overlaps', 'ilike', 'gte'])
  expect(calls[2]).toEqual(['ilike', 'gotra', '%kashyap%'])
  calls.length = 0
  applySearchToQuery(q, 'ram delhi', ['full_name', 'city'])
  expect(calls).toEqual([['or', 'full_name.ilike.%ram%,city.ilike.%ram%'], ['or', 'full_name.ilike.%delhi%,city.ilike.%delhi%']])
})

test('chips and scopes', () => {
  const vals = { diet: ['Jain', 'Vegan'], gotra: 'Kashyap' }
  expect(activeFilterKeys(vals).sort()).toEqual(['diet', 'gotra'])
  let next
  const chips = filterChips(vals, v => { next = v })
  expect(chips.map(c => c.label)).toEqual(['Diet: Jain', 'Diet: Vegan', 'Gotra: Kashyap'])
  chips[0].clear()
  expect(next.diet).toEqual(['Vegan'])
  const member = fieldsForScope('member').map(f => f.key)
  expect(member).toContain('diet')
  expect(member).not.toContain('employer')
  expect(member).not.toContain('profession') // not in profiles_public_view
  expect(fieldsForScope('matches').map(f => f.key)).not.toContain('lead_source')
})

test('dropdown options include real values outside the fixed list', () => {
  const rows = [{ education: 'B.Tech (IT)' }, { education: 'MBA' }, { education: '' }, { education: null }, { languages_spoken: ['Hindi', 'Bhojpuri'] }]
  expect(withDataOptions(['MBA', 'PhD'], rows, 'education')).toEqual(['MBA', 'PhD', 'B.Tech (IT)'])
  expect(withDataOptions(['Hindi'], rows, 'languages_spoken')).toEqual(['Hindi', 'Bhojpuri'])
  expect(withDataOptions(['MBA'], null, 'education')).toEqual(['MBA'])
})
