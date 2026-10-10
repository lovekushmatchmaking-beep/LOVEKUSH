import { parseProfileIds, formatSharedMatchNote, parseSharedMatchNote, isSharedMatchNote } from './sharedMatchLog'

test('parseProfileIds splits on any separator, uppercases and de-dupes', () => {
  expect(parseProfileIds('ab12cd34, XY6FG2WW\nrv8p8tu2;  ab12CD34 #ZX7QB3JH')).toEqual(['AB12CD34', 'XY6FG2WW', 'RV8P8TU2', 'ZX7QB3JH'])
  expect(parseProfileIds('  ')).toEqual([])
  expect(parseProfileIds(null)).toEqual([])
})

test('note round-trips ids and remark', () => {
  const note = formatSharedMatchNote(['AB12CD34', 'XY6FG2WW'], ' sent on WhatsApp ')
  expect(isSharedMatchNote(note)).toBe(true)
  expect(parseSharedMatchNote(note)).toEqual({ ids: ['AB12CD34', 'XY6FG2WW'], remark: 'sent on WhatsApp' })
  expect(parseSharedMatchNote(formatSharedMatchNote(['RV8P8TU2']))).toEqual({ ids: ['RV8P8TU2'], remark: '' })
  expect(isSharedMatchNote('📞 Called: hi')).toBe(false)
})
