import { normalizePhone, buildTelLink, buildWaChatLink, buildWaMeLink, shareSafeAboutMe } from './shareProfile'

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

test('shareSafeAboutMe hides import dumps and contact details', () => {
  expect(shareSafeAboutMe('Source sheet ID: MB00122 | Raw unclassified data (verify if needed): Unmarried | WhatsApp: 9911312410')).toBeNull()
  expect(shareSafeAboutMe('Love travel. WhatsApp: +91 98765 43210, mail a@b.com')).toBe('Love travel. , mail')
  expect(shareSafeAboutMe('Studied 2019-2021 in Delhi')).toBe('Studied 2019-2021 in Delhi')
  expect(shareSafeAboutMe('')).toBeNull()
})
