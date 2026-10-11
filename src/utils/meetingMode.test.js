import { isVirtualMeeting, meetingLinkHref, looksLikeContactDetail } from './meetingMode'

test('isVirtualMeeting', () => {
  expect(isVirtualMeeting({ meeting_mode: 'virtual' })).toBe(true)
  expect(isVirtualMeeting({ meeting_mode: 'in_person' })).toBe(false)
  expect(isVirtualMeeting({})).toBe(false)
})

test('meetingLinkHref', () => {
  expect(meetingLinkHref('https://zoom.us/j/123')).toBe('https://zoom.us/j/123')
  expect(meetingLinkHref('meet.google.com/abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij')
  expect(meetingLinkHref('Zoom https://zoom.us/j/9 pass 1')).toBe('https://zoom.us/j/9')
  expect(meetingLinkHref('Zoom, ID 123 456')).toBe(null)
  expect(meetingLinkHref('')).toBe(null)
})

test('looksLikeContactDetail', () => {
  expect(looksLikeContactDetail('+91 98765 43210')).toBe(true)
  expect(looksLikeContactDetail('9876543210')).toBe(true)
  expect(looksLikeContactDetail('call me at someone@gmail.com')).toBe(true)
  expect(looksLikeContactDetail('https://zoom.us/j/98765432101?pwd=x')).toBe(false)
  expect(looksLikeContactDetail('Zoom ID 845 123 4567')).toBe(false)
  expect(looksLikeContactDetail('https://meet.google.com/abc-defg-hij')).toBe(false)
})
