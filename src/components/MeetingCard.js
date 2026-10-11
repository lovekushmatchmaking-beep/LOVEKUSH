import React from 'react'
import { CalendarClock, MapPin, Video } from 'lucide-react'
import { TrinityLogo, Wordmark } from './BrandLogo'

const BRAND_GRADIENT = 'linear-gradient(135deg, #6A1B9A 0%, #D81B60 42%, #E1306C 58%, #F56040 82%, #F6C177 100%)'

// Offscreen-rendered, then captured with html2canvas into a shareable PNG
// (see utils/generateMeetingCardImage) — Aryan asked for meeting details to
// go out as a proper designed card, not a plain WhatsApp sentence, and to
// be shareable anywhere, not locked to one specific WhatsApp chat
// (2026-10-11). Hardcoded hex colors, not CSS variables — html2canvas
// doesn't reliably resolve custom properties from a stylesheet.
// `otherCode`/`rmName`/`rmPhone`/`rmEmail`: Aryan's follow-up (2026-10-11)
// — the card looked "achha" but wanted the actual LOVEKUSH logo (not just
// the wordmark text), the meeting-with profile's ID, and the same RM
// contact box the share-link pages already show (ShareProfileCard.js) so
// recipients know who to reach even once this image leaves the app.
// Header redone again (2026-10-11, 2nd follow-up) — a solid gradient band
// with plain white caps text wasn't "real branding" per Aryan; the actual
// logo + gradient wordmark images (public/brand/*.png) only read correctly
// on a light background, same as the share-link pages' BrandLockup, so the
// header is now the same faint-gradient-wash-on-white treatment as
// ShareShell (App.css .share-hero-band) instead of a solid color block.
// `virtual` (Aryan, 2026-10-11): far-away families meet on Zoom / Google
// Meet — same card, "Virtual Meeting" title, a video icon and the meeting
// link (`location`) in place of the venue. A PNG can't hold a clickable
// link, so the link is printed in full here and also sent as text
// alongside the image (WhatsAppReminder.js shareCard). Still no client
// phone/email anywhere on the card — only the bureau's RM box.
const MeetingCard = React.forwardRef(function MeetingCard(
  { name, otherName, otherAge, otherCity, otherCode, date, time, location, virtual, requestId, rmName, rmPhone, rmEmail }, ref
) {
  const PlaceIcon = virtual ? Video : MapPin
  return (
    <div ref={ref} style={{ width: 360, fontFamily: "'Inter', system-ui, sans-serif", background: '#fff', borderRadius: 20, overflow: 'hidden', border: '1px solid #ededed' }}>
      <div style={{ position: 'relative', padding: '26px 24px 20px', textAlign: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 150, background: BRAND_GRADIENT, opacity: 0.14,
          WebkitMaskImage: 'linear-gradient(#000 40%, transparent)', maskImage: 'linear-gradient(#000 40%, transparent)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <TrinityLogo size={32} />
          <Wordmark height={22} />
        </div>
        <div style={{ position: 'relative', fontFamily: "'Montserrat', sans-serif", fontSize: 20, fontWeight: 600, marginTop: 14, color: '#1F1720' }}>
          {virtual ? 'Virtual Meeting Confirmed' : 'Meeting Confirmed'}
        </div>
        {virtual && (
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '4px 10px', borderRadius: 999, background: '#FDEEF3', color: '#D81B60', fontSize: 11, fontWeight: 600 }}>
            <Video size={12} color="#D81B60" /> Online video call
          </div>
        )}
      </div>
      <div style={{ padding: '22px 24px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8e8e8e', marginBottom: 4 }}>For</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#1F1720', marginBottom: 16 }}>{name}</div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8e8e8e', marginBottom: 4 }}>Meeting with</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#1F1720', marginBottom: otherCode ? 2 : 18 }}>
          {otherName}
          {(otherAge || otherCity) && (
            <span style={{ fontWeight: 400, fontSize: 14, color: '#8e8e8e' }}>
              {' '}({[otherAge && `${otherAge} yrs`, otherCity].filter(Boolean).join(', ')})
            </span>
          )}
        </div>
        {otherCode && (
          <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#8e8e8e', marginBottom: 18 }}>Profile ID: {otherCode}</div>
        )}
        <div style={{ height: 1, background: '#ededed', margin: '4px 0 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: location ? 12 : 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: '#FDEEF3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CalendarClock size={16} color="#D81B60" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1F1720' }}>{date}</div>
            <div style={{ fontSize: 13, color: '#8e8e8e' }}>{time}</div>
          </div>
        </div>
        {location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#FDEEF3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <PlaceIcon size={16} color="#D81B60" />
            </div>
            {virtual ? (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8e8e8e', marginBottom: 2 }}>Join link</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', wordBreak: 'break-all' }}>{location}</div>
              </div>
            ) : (
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1F1720' }}>{location}</div>
            )}
          </div>
        )}
        {(rmName || rmPhone || rmEmail) && (
          <div style={{ marginTop: 20, padding: '14px 16px', background: '#FBF6FB', border: '1px solid #F0E3F4', borderRadius: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8e8e8e', marginBottom: 4 }}>Your Relationship Manager</div>
            {rmName && <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1720' }}>{rmName}</div>}
            {rmPhone && <div style={{ fontSize: 13, color: '#555' }}>{rmPhone}</div>}
            {rmEmail && <div style={{ fontSize: 12, color: '#8e8e8e' }}>{rmEmail}</div>}
          </div>
        )}
      </div>
      <div style={{ padding: '12px 24px', background: '#FBF9F5', fontSize: 11, color: '#877C83', textAlign: 'center' }}>
        {virtual
          ? 'Join from the link above, on time. Please do not share personal phone numbers or emails on the call.'
          : 'Please be on time.'} Contact LOVEKUSH to reschedule.{requestId ? ` · ${requestId}` : ''}
      </div>
    </div>
  )
})

export default MeetingCard
