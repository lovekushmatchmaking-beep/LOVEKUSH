import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, Share2, ChevronDown, ChevronUp, Phone } from 'lucide-react'
import { EVENT_LABELS, DEFAULT_MESSAGES, fillTemplate, fetchTemplates, logNotification, waLinkFor } from '../utils/notifications'
import { buildTelLink, buildWaMeLink } from '../utils/shareProfile'
import MeetingCard from './MeetingCard'
import { generateMeetingCardImage } from '../utils/generateMeetingCardImage'

const WA_GREEN = '#16a34a'

// One-tap WhatsApp reminder for a trigger event — selfie requested, profile
// approved, match shared, meeting scheduled. Opens a small template picker
// (admin-editable whatsapp_templates, falls back to a built-in default),
// fills in {{name}}/{{otherName}}/{{when}} etc., then opens the same wa.me
// link pattern the rest of the admin panel already uses (ContactButtons/
// shareProfile.js) and logs the send to notification_log.
//
// Not a backend-automated push — no WhatsApp Business API/vendor is
// configured yet (see docs/product/future-whatsapp-plan.md). This is the
// one-tap, admin-triggered version until that vendor decision is made.
// `appendText`: a value (e.g. a share-link URL) that's always added after
// the template text, regardless of what the template itself says — used
// for match_shared so the link is never at the mercy of a template that
// doesn't happen to mention it (unlike {{vars}}, which a custom template
// can simply leave out). Unify-the-WhatsApp-sends audit, 2026-10-08: this
// event used to build its own hardcoded message instead of going through
// the same admin-editable template picker every other reminder uses.
export function WhatsAppReminderButton({ profile, eventType, vars, appendText, staffUserId, label, size = 'sm' }) {
  const [open, setOpen] = useState(false)
  const phone = profile?.client_phone
  if (!profile) return null
  const pad = size === 'sm' ? '6px 12px' : '9px 16px'
  return (
    <>
      <button type="button" className="btn btn-outline btn-sm"
        style={{ padding: pad, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, color: '#16a34a', borderColor: '#16a34a' }}
        title={phone ? (label || 'Send a WhatsApp reminder') : 'No phone number saved for this profile'}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}>
        <MessageCircle size={13} />{size === 'md' && (label || 'Send via WhatsApp')}
      </button>
      {open && (
        <ReminderSheet profile={profile} eventType={eventType} vars={vars} appendText={appendText} staffUserId={staffUserId}
          onClose={() => setOpen(false)} />
      )}
    </>
  )
}

// Exported so a caller that has to do async work first (e.g. create the
// share link that goes in appendText) can open the same sheet itself.
// `card`: optional meeting-card fields ({name, otherName, otherAge,
// otherCity, date, time, location, requestId}) — when given (only the
// meeting_scheduled caller passes this), the sheet leads with a real
// visual card (MeetingCard, captured to a PNG) and a generic "Share" button
// instead of a bare WhatsApp text message. Aryan: the plain-text template
// looked "ganda" (ugly), and sharing shouldn't be locked to one specific
// WhatsApp number — any app, any chat (2026-10-11). The text-template send
// still exists underneath for when a plain message is what's wanted.
export function ReminderSheet({ profile, eventType, vars, appendText, staffUserId, onClose, onSent, card }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [templateId, setTemplateId] = useState('default')
  const [text, setText] = useState('')
  const [textOpen, setTextOpen] = useState(!card)
  const [cardBusy, setCardBusy] = useState(false)
  const [cardError, setCardError] = useState('')
  const cardRef = useRef(null)
  const phone = profile?.client_phone
  const fullVars = { name: profile?.full_name || 'there', ...vars }
  const withAppend = (body) => appendText ? body + '\n\n' + appendText : body

  useEffect(() => {
    let active = true
    fetchTemplates(eventType).then(rows => {
      if (!active) return
      setTemplates(rows)
      setLoading(false)
      const first = rows[0]
      setText(withAppend(fillTemplate(first ? first.message : DEFAULT_MESSAGES[eventType], fullVars)))
      setTemplateId(first ? first.id : 'default')
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType])

  const pickTemplate = (id) => {
    setTemplateId(id)
    const t = templates.find(x => x.id === id)
    setText(withAppend(fillTemplate(t ? t.message : DEFAULT_MESSAGES[eventType], fullVars)))
  }

  const send = async () => {
    const link = waLinkFor(phone, text)
    if (link) window.open(link, '_blank', 'noopener,noreferrer')
    await logNotification({ profileId: profile.id, eventType, staffUserId, messagePreview: text })
    // Caller-supplied persistence hook — e.g. mark the share link's
    // "Send interest" button as sent, so it still shows ✓ after a reload
    // (Aryan, 2026-10-09). Best-effort: a failure here should never stop
    // the WhatsApp send from having already happened.
    if (onSent) {
      try { await onSent() } catch (e) { console.warn('onSent failed (non-critical):', e.message) }
    }
    onClose()
  }

  // Generic share — native share sheet (any app, any chat), not a direct
  // wa.me link to one number. Falls back to downloading the PNG when the
  // browser can't share files (desktop Chrome, older browsers).
  const shareCard = async () => {
    setCardBusy(true); setCardError('')
    try {
      const blob = await generateMeetingCardImage(cardRef.current)
      const file = new File([blob], `Meeting_${card.requestId || profile.id}.png`, { type: 'image/png' })
      await logNotification({ profileId: profile.id, eventType, staffUserId, messagePreview: 'Meeting details card shared' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Meeting Confirmed — LOVEKUSH' })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = file.name; a.click()
        URL.revokeObjectURL(url)
        setCardError('Sharing is not supported here, so the card was downloaded instead.')
      }
      if (onSent) {
        try { await onSent() } catch (e) { console.warn('onSent failed (non-critical):', e.message) }
      }
    } catch (e) {
      if (e?.name !== 'AbortError') setCardError('Could not create the card, please try again.')
    } finally {
      setCardBusy(false)
    }
  }

  return createPortal(
    <div onClick={e => { e.stopPropagation(); onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', borderRadius: '14px 14px 0 0', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {EVENT_LABELS[eventType] || 'Reminder'} — {profile.full_name || 'profile'}
        </div>
        {!phone && (
          <div style={{ fontSize: 12, color: '#dc2626' }}>No phone number saved — WhatsApp will ask which chat to open.</div>
        )}
        {card && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
              <MeetingCard ref={cardRef} {...card} />
            </div>
            {/* Actionable RM contact — same Call/WhatsApp pattern as the
                share-link RM box (ShareProfileCard.js), but WhatsApp opens
                with a pre-filled message naming the profile ID instead of a
                blank chat (Aryan, 2026-10-11: "what's app dabane par kuch
                khaas comment open ho sake"). Lives outside the captured card
                node — buttons can't be "actionable" inside a shared PNG. */}
            {card.rmPhone && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <a className="btn btn-outline btn-sm" href={buildTelLink(card.rmPhone)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <Phone size={13} /> Call {card.rmName || 'RM'}
                </a>
                <a className="btn btn-outline btn-sm" target="_blank" rel="noreferrer"
                  href={buildWaMeLink(card.rmPhone, `Hi, I'd like to know more about profile ID ${card.otherCode || card.requestId || ''}.`)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: WA_GREEN, borderColor: WA_GREEN }}>
                  <MessageCircle size={13} /> Ask on WhatsApp
                </a>
              </div>
            )}
            {cardError && <div style={{ fontSize: 12, color: '#dc2626' }}>{cardError}</div>}
            <button className="btn btn-black btn-sm" onClick={shareCard} disabled={cardBusy}>
              <Share2 size={14} /> {cardBusy ? 'Preparing…' : 'Share meeting card'}
            </button>
            <button type="button" className="btn btn-outline btn-sm" style={{ color: '#8e8e8e', alignSelf: 'flex-start' }}
              onClick={() => setTextOpen(v => !v)}>
              {textOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Or send as plain text instead
            </button>
          </>
        )}
        {textOpen && (
          <>
            {!loading && templates.length > 0 && (
              <select className="form-select" value={templateId} onChange={e => pickTemplate(e.target.value)} style={{ fontSize: 12 }}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <textarea className="form-input" value={text} onChange={e => setText(e.target.value)}
              rows={4} style={{ fontSize: 13, resize: 'vertical' }} autoFocus={!card} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
              <button className="btn btn-black btn-sm" onClick={send}>📱 Send via WhatsApp</button>
            </div>
          </>
        )}
        {!textOpen && (
          <button className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
        )}
      </div>
    </div>,
    document.body
  )
}
