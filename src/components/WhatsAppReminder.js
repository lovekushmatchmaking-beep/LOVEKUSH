import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle } from 'lucide-react'
import { EVENT_LABELS, DEFAULT_MESSAGES, fillTemplate, fetchTemplates, logNotification, waLinkFor } from '../utils/notifications'

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
export function WhatsAppReminderButton({ profile, eventType, vars, staffUserId, label, size = 'sm' }) {
  const [open, setOpen] = useState(false)
  const phone = profile?.client_phone
  if (!profile) return null
  const pad = size === 'sm' ? '6px 12px' : '9px 16px'
  return (
    <>
      <button type="button" className="btn btn-outline btn-sm"
        style={{ padding: pad, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16a34a', borderColor: '#16a34a' }}
        title={phone ? 'Send a WhatsApp reminder' : 'No phone number saved for this profile'}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}>
        <MessageCircle size={13} /> {label || 'Remind'}
      </button>
      {open && (
        <ReminderSheet profile={profile} eventType={eventType} vars={vars} staffUserId={staffUserId}
          onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function ReminderSheet({ profile, eventType, vars, staffUserId, onClose }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [templateId, setTemplateId] = useState('default')
  const [text, setText] = useState('')
  const phone = profile?.client_phone
  const fullVars = { name: profile?.full_name || 'there', ...vars }

  useEffect(() => {
    let active = true
    fetchTemplates(eventType).then(rows => {
      if (!active) return
      setTemplates(rows)
      setLoading(false)
      const first = rows[0]
      setText(fillTemplate(first ? first.message : DEFAULT_MESSAGES[eventType], fullVars))
      setTemplateId(first ? first.id : 'default')
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType])

  const pickTemplate = (id) => {
    setTemplateId(id)
    const t = templates.find(x => x.id === id)
    setText(fillTemplate(t ? t.message : DEFAULT_MESSAGES[eventType], fullVars))
  }

  const send = async () => {
    const link = waLinkFor(phone, text)
    if (link) window.open(link, '_blank', 'noopener,noreferrer')
    await logNotification({ profileId: profile.id, eventType, staffUserId, messagePreview: text })
    onClose()
  }

  return createPortal(
    <div onClick={e => { e.stopPropagation(); onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', width: '100%', maxWidth: 520, borderRadius: '14px 14px 0 0', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {EVENT_LABELS[eventType] || 'Reminder'} — {profile.full_name || 'profile'}
        </div>
        {!phone && (
          <div style={{ fontSize: 12, color: '#dc2626' }}>No phone number saved — WhatsApp will ask which chat to open.</div>
        )}
        {!loading && templates.length > 0 && (
          <select className="form-select" value={templateId} onChange={e => pickTemplate(e.target.value)} style={{ fontSize: 12 }}>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <textarea className="form-input" value={text} onChange={e => setText(e.target.value)}
          rows={4} style={{ fontSize: 13, resize: 'vertical' }} autoFocus />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-black btn-sm" onClick={send}>📱 Send via WhatsApp</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
