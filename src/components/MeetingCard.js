import React from 'react'
import { CalendarClock, MapPin } from 'lucide-react'

const BRAND_GRADIENT = 'linear-gradient(135deg, #6A1B9A 0%, #D81B60 42%, #E1306C 58%, #F56040 82%, #F6C177 100%)'

// Offscreen-rendered, then captured with html2canvas into a shareable PNG
// (see utils/generateMeetingCardImage) — Aryan asked for meeting details to
// go out as a proper designed card, not a plain WhatsApp sentence, and to
// be shareable anywhere, not locked to one specific WhatsApp chat
// (2026-10-11). Hardcoded hex colors, not CSS variables — html2canvas
// doesn't reliably resolve custom properties from a stylesheet.
const MeetingCard = React.forwardRef(function MeetingCard(
  { name, otherName, otherAge, otherCity, date, time, location, requestId }, ref
) {
  return (
    <div ref={ref} style={{ width: 360, fontFamily: "'Inter', system-ui, sans-serif", background: '#fff', borderRadius: 20, overflow: 'hidden', border: '1px solid #ededed' }}>
      <div style={{ background: BRAND_GRADIENT, padding: '22px 24px', color: '#fff' }}>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', opacity: 0.9 }}>LOVEKUSH Matchmaking</div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 22, fontWeight: 600, marginTop: 6 }}>Meeting Confirmed</div>
      </div>
      <div style={{ padding: '22px 24px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8e8e8e', marginBottom: 4 }}>For</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#1F1720', marginBottom: 16 }}>{name}</div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8e8e8e', marginBottom: 4 }}>Meeting with</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#1F1720', marginBottom: 18 }}>
          {otherName}
          {(otherAge || otherCity) && (
            <span style={{ fontWeight: 400, fontSize: 14, color: '#8e8e8e' }}>
              {' '}({[otherAge && `${otherAge} yrs`, otherCity].filter(Boolean).join(', ')})
            </span>
          )}
        </div>
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
              <MapPin size={16} color="#D81B60" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1F1720' }}>{location}</div>
          </div>
        )}
      </div>
      <div style={{ padding: '12px 24px', background: '#FBF9F5', fontSize: 11, color: '#877C83', textAlign: 'center' }}>
        Please be on time. Contact LOVEKUSH to reschedule.{requestId ? ` · ${requestId}` : ''}
      </div>
    </div>
  )
})

export default MeetingCard
