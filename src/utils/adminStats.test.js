import { breakdown, filterProfiles } from './adminStats'

const P = [
  { gender: 'Male', age: 27, height: '5\'9" (175 cm)', religion: 'Hindu', profile_status: 'active', created_at: '2026-10-02T10:00:00Z' },
  { gender: 'Female', age: 24, height: '5\'3" (160 cm)', religion: 'Hindu', profile_status: 'pending', created_at: '2026-09-01T10:00:00Z' },
  { gender: 'Male', date_of_birth: '1980-01-01', height: null, religion: '', profile_status: 'active', created_at: '2026-08-15T10:00:00Z' },
]

test('age buckets in fixed order with M/F split', () => {
  const rows = breakdown(P, 'age')
  expect(rows.map(r => r.label)).toEqual(['22–25', '26–29', '42–49'])
  expect(rows[0]).toMatchObject({ total: 1, male: 0, female: 1 })
})

test('height buckets, missing height goes last', () => {
  const rows = breakdown(P, 'height')
  expect(rows.map(r => r.label)).toEqual(['5\'0"–5\'3"', '5\'8"–5\'11"', 'Not filled'])
})

test('category dimension sorts by count, blanks last', () => {
  expect(breakdown(P, 'religion')).toEqual([
    { label: 'Hindu', total: 2, male: 1, female: 1 },
    { label: 'Not filled', total: 1, male: 1, female: 0 },
  ])
})

test('filters by gender, status and joined window', () => {
  const now = new Date('2026-10-03T12:00:00Z').getTime()
  expect(filterProfiles(P, { gender: 'Male' }, now)).toHaveLength(2)
  expect(filterProfiles(P, { status: 'pending' }, now)).toHaveLength(1)
  expect(filterProfiles(P, { joined: '7d' }, now)).toHaveLength(1)
  expect(filterProfiles(P, { joined: '90d', gender: 'Male' }, now)).toHaveLength(2)
})
