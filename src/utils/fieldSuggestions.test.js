import { withApprovedOptions, withApprovedDegreeOptions, fieldSuggestionLabel } from './fieldSuggestions'

jest.mock('../supabase', () => ({ supabase: {} }))

const approved = [
  { field_type: 'gotra', religion: 'Hindu', value: 'Mangal' },
  { field_type: 'gotra', religion: 'Jain', value: 'Jain Only' },
  { field_type: 'mother_tongue', religion: null, value: 'Haryanvi' },
  { field_type: 'degree', religion: null, value: 'B.Voc' },
  { field_type: 'degree', religion: null, value: 'b.tech' },
]

test('approved value goes in before the trailing Other entries', () => {
  expect(withApprovedOptions(['Bhardwaj', 'Other'], approved, 'gotra', 'Hindu'))
    .toEqual(['Bhardwaj', 'Mangal', 'Other'])
  expect(withApprovedOptions(['A', 'Others / Not in list', "Don't wish to specify"], approved, 'gotra', 'Jain'))
    .toEqual(['A', 'Jain Only', 'Others / Not in list', "Don't wish to specify"])
})

test('caste/gotra are per religion, other fields are not', () => {
  expect(withApprovedOptions(['X', 'Other'], approved, 'gotra', 'Sikh')).toEqual(['X', 'Other'])
  expect(withApprovedOptions(['Hindi', 'Other'], approved, 'mother_tongue', 'Sikh')).toEqual(['Hindi', 'Haryanvi', 'Other'])
})

test('no duplicate when the value is already in the list (case-insensitive)', () => {
  const list = ['mangal', 'Other']
  expect(withApprovedOptions(list, approved, 'gotra', 'Hindu')).toBe(list)
})

test('approved degrees land in the last group, skipping ones already listed', () => {
  const degrees = { Engineering: ['B.Tech'], Other: ['Others / Not in list'] }
  expect(withApprovedDegreeOptions(degrees, approved)).toEqual({
    Engineering: ['B.Tech'], Other: ['B.Voc', 'Others / Not in list'],
  })
})

test('labels', () => {
  expect(fieldSuggestionLabel('caste')).toBe('Community / Caste')
  expect(fieldSuggestionLabel('some_new_field')).toBe('some new field')
})
