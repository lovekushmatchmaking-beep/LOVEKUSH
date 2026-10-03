import { findDuplicateLeads, matchingLeads } from './duplicateLeads'

const profiles = [
  { id: '1', full_name: 'A', client_phone: '9876543210', client_email: 'a@x.com', created_at: '2026-10-01T00:00:00Z' },
  { id: '2', full_name: 'B', client_phone: '09876543210', client_email: 'b@x.com', created_at: '2026-10-02T00:00:00Z' },
  { id: '3', full_name: 'C', client_phone: '9999999999', client_email: 'A@X.com', created_at: '2026-10-03T00:00:00Z' },
  { id: '4', full_name: 'D', client_phone: '', client_email: '', created_at: '2026-10-04T00:00:00Z' },
]

test('finds a phone duplicate across different formats', () => {
  const groups = findDuplicateLeads(profiles)
  const phoneGroup = groups.find(g => g.type === 'phone')
  expect(phoneGroup.profiles.map(p => p.id)).toEqual(['2', '1']) // newest first
})

test('finds an email duplicate case-insensitively', () => {
  const groups = findDuplicateLeads(profiles)
  const emailGroup = groups.find(g => g.type === 'email')
  expect(emailGroup.profiles.map(p => p.id)).toEqual(['3', '1'])
})

test('profiles with no phone/email never form a group', () => {
  const groups = findDuplicateLeads([profiles[3], { ...profiles[3], id: '5' }])
  expect(groups).toHaveLength(0)
})

test('matchingLeads finds existing profiles sharing a phone or email, excluding self', () => {
  expect(matchingLeads(profiles, { phone: '9876543210' }).map(p => p.id).sort()).toEqual(['1', '2'])
  expect(matchingLeads(profiles, { phone: '9876543210', excludeId: '1' }).map(p => p.id)).toEqual(['2'])
  expect(matchingLeads(profiles, { email: 'a@x.com' }).map(p => p.id).sort()).toEqual(['1', '3'])
  expect(matchingLeads(profiles, { phone: '1234567890' })).toEqual([])
})
