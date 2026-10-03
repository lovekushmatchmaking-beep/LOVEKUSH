import { normalizePhone, buildTelLink, buildWaChatLink, buildWaMeLink } from './shareProfile'

test('normalizePhone handles common Indian and NRI formats', () => {
  expect(normalizePhone('98765 43210')).toBe('919876543210')
  expect(normalizePhone('+91-98765-43210')).toBe('919876543210')
  expect(normalizePhone('09876543210')).toBe('919876543210')
  expect(normalizePhone('+1 (415) 555-0123')).toBe('14155550123')
  expect(normalizePhone('0044 7700 900123')).toBe('447700900123')
  expect(normalizePhone('12345')).toBeNull()
  expect(normalizePhone('')).toBeNull()
  expect(normalizePhone(null)).toBeNull()
})

test('call and WhatsApp links', () => {
  expect(buildTelLink('9876543210')).toBe('tel:+919876543210')
  expect(buildWaChatLink('9876543210')).toBe('https://wa.me/919876543210')
  expect(buildWaMeLink('9876543210', 'hi there')).toBe('https://wa.me/919876543210?text=hi%20there')
  expect(buildTelLink('abc')).toBeNull()
  expect(buildWaChatLink(undefined)).toBeNull()
})
