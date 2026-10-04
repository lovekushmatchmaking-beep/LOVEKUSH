import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { Phone, MessageCircle, Pencil } from 'lucide-react'
import { supabase } from '../supabase'
import { buildTelLink, buildWaChatLink, normalizePhone } from '../utils/shareProfile'

// ADMIN-ONLY quick contact — profile ke number (profiles.client_phone) par
// ek tap mein Call ya WhatsApp. Members ko ek-doosre ka number kabhi nahi
// dikhta (privacy-rules), isliye yeh sirf Admin screens par use hota hai.

const WA_GREEN = '#16a34a'

// ===== CALL LOG OUTCOME — profile_notes.call_outcome (free-text note ke
// saath optional structured tag), taaki "kal kitni calls lagi, kitni
// answer hui" jaisa jaldi dikh sake, bina har note padhe.
export const CALL_OUTCOME_LABELS = {
  answered: '✅ Answered',
  no_answer: '📵 No answer',
  call_back: '⏳ Asked to call back',
  not_interested: '🙅 Not interested',
}
export const CALL_OUTCOME_COLORS = {
  answered: { bg: '#f0fdf4', fg: '#16a34a' },
  no_answer: { bg: '#f5f5f5', fg: '#8e8e8e' },
  call_back: { bg: '#fff8e1', fg: '#b45309' },
  not_interested: { bg: '#fef2f2', fg: '#dc2626' },
}

export const contactLogPrefix = (kind) => (kind === 'call' ? '📞 Called: ' : kind === 'whatsapp' ? '💬 WhatsApp: ' : '')

// Chhote icon buttons — list rows ke liye (expand kiye bina call/WhatsApp).
// Call-log shortcut har jagah ek jaisa: agar screen apna note box rakhti hai
// (main Profiles list) to woh `onAction` deti hai; warna `logProfile` do aur
// tap ke baad yahi component ek chhota "Log this call" box khol deta hai
// ("📞 Called: " pehle se bhara, outcome chips + Save → profile_notes).
// `introductionId`: jab yeh buttons ek Coordination Request ke andar use ho
// rahe hon, saved note us request se bhi link ho jaati hai (profile_notes.
// introduction_id) — taaki request ki apni history mein bhi dikhe, na sirf
// profile ke Notes & Follow-ups mein.
// `size`: 'sm' still shows text now too (Aryan's audit — icon-only Call/
// WhatsApp in list rows made it hard to tell them apart at a glance without
// reading the icon carefully) — 'sm' just keeps the button a bit more
// compact than 'md' (used in the expanded profile), both are comfortably
// tappable (>=7px vertical padding, well over the old 4px).
export function ContactButtons({ phone, onAction, logProfile, introductionId, size = 'sm' }) {
  const [logKind, setLogKind] = useState(null)
  const tel = buildTelLink(phone)
  const wa = buildWaChatLink(phone)
  if (!tel) return null
  const pad = size === 'sm' ? '7px 12px' : '9px 16px'
  const stop = (kind) => (e) => {
    e.stopPropagation()
    if (onAction) onAction(kind)
    else if (logProfile?.id) setLogKind(kind)
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <a href={tel} onClick={stop('call')} className="btn btn-outline btn-sm" title={'Call ' + phone}
        style={{ padding: pad, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
        <Phone size={14} /> Call
      </a>
      <a href={wa} onClick={stop('whatsapp')} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" title={'WhatsApp ' + phone}
        style={{ padding: pad, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: WA_GREEN, borderColor: WA_GREEN }}>
        <MessageCircle size={14} /> WhatsApp
      </a>
      {logKind && <QuickCallLog profile={logProfile} kind={logKind} introductionId={introductionId} onClose={() => setLogKind(null)} />}
    </span>
  )
}

// Freestanding "Add note" — same bottom sheet as the Call/WhatsApp log, for
// logging something that wasn't a call/WhatsApp tap (a meeting outcome, a
// reschedule reason, anything mid-coordination). Used inside Coordination
// Requests so the back-and-forth isn't only captured at final Close/Feedback.
export function AddNoteButton({ profile, introductionId, label = '📝 Add note' }) {
  const [open, setOpen] = useState(false)
  if (!profile?.id) return null
  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" style={{ padding: '3px 10px', fontSize: 11 }}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}>{label}</button>
      {open && <QuickCallLog profile={profile} kind="note" introductionId={introductionId} onClose={() => setOpen(false)} />}
    </>
  )
}

// Bottom sheet — call/WhatsApp ke baad wapas app par aao to yeh khula
// milta hai. Same profile_notes table + call_outcome jo Profiles list ka
// "Notes & Follow-ups" box use karta hai, isliye note wahan bhi dikhega.
function QuickCallLog({ profile, kind, introductionId, onClose }) {
  const [note, setNote] = useState(contactLogPrefix(kind))
  const [outcome, setOutcome] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    const text = note.trim() === contactLogPrefix(kind).trim() ? '' : note.trim()
    if (!text && !outcome) { setError('Add a note or pick an outcome'); return }
    setSaving(true)
    const { data: auth } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('profile_notes').insert({
      profile_id: profile.id,
      staff_user_id: auth?.user?.id,
      note: text || (contactLogPrefix(kind) + CALL_OUTCOME_LABELS[outcome]),
      follow_up_at: followUp || null,
      call_outcome: outcome || null,
      introduction_id: introductionId || null,
    })
    setSaving(false)
    if (err) { setError('Could not save: ' + err.message); return }
    onClose()
  }

  const kindLabel = kind === 'call' ? 'call' : kind === 'whatsapp' ? 'WhatsApp' : 'note'
  // Portal: list rows can have transforms/overflow that would clip a fixed sheet
  return createPortal(
    <div onClick={e => { e.stopPropagation(); onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', width: '100%', maxWidth: 520, borderRadius: '14px 14px 0 0', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Log this {kindLabel} — {profile.full_name || 'profile'}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(CALL_OUTCOME_LABELS).map(([key, label]) => (
            <button key={key} type="button" className="btn btn-outline btn-sm"
              style={{ padding: '2px 8px', fontSize: 11,
                ...(outcome === key ? { background: CALL_OUTCOME_COLORS[key].bg, color: CALL_OUTCOME_COLORS[key].fg, borderColor: CALL_OUTCOME_COLORS[key].fg } : {}) }}
              onClick={() => setOutcome(prev => prev === key ? '' : key)}>{label}</button>
          ))}
        </div>
        <input className="form-input" value={note} onChange={e => setNote(e.target.value)} style={{ fontSize: 12 }} autoFocus />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8e8e8e' }}>
          Follow up on
          <input className="form-input" type="date" value={followUp} onChange={e => setFollowUp(e.target.value)} style={{ fontSize: 12, width: 150 }} />
        </div>
        {error && <div style={{ fontSize: 11, color: '#dc2626' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Skip</button>
          <button className="btn btn-black btn-sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save note'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Expanded profile ke liye — number + Call/WhatsApp, aur number na ho ya
// galat ho to wahin save/edit (same client_phone column jo CreateProfile
// aur Find Matches pehle se use karte hain).
export function ProfileContact({ profile, onSaved, onAction, logCalls = false, introductionId }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile.client_phone || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const phone = profile.client_phone
  const valid = !!normalizePhone(phone)

  const save = async () => {
    if (!normalizePhone(draft)) { setError('Enter a valid number (10 digits, or with country code)'); return }
    setSaving(true)
    const { error: err } = await supabase.from('profiles').update({ client_phone: draft.trim() }).eq('id', profile.id)
    setSaving(false)
    if (err) { setError('Could not save: ' + err.message); return }
    setError(''); setEditing(false)
    onSaved && onSaved(draft.trim())
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 12 }}
      onClick={e => e.stopPropagation()}>
      <Phone size={14} color="#8e8e8e" />
      {editing || !phone ? (
        <>
          <input className="form-input" placeholder="WhatsApp / mobile number" value={draft} inputMode="tel"
            onChange={e => setDraft(e.target.value)} style={{ flex: '1 1 160px', fontSize: 12, maxWidth: 220 }} />
          <button className="btn btn-outline btn-sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save number'}</button>
          {phone && <button className="btn btn-outline btn-sm" onClick={() => { setEditing(false); setDraft(phone); setError('') }}>Cancel</button>}
          {!phone && <span style={{ color: '#8e8e8e' }}>No number saved yet</span>}
        </>
      ) : (
        <>
          <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{phone}</span>
          {valid
            ? <ContactButtons phone={phone} onAction={onAction} logProfile={logCalls ? profile : undefined} introductionId={introductionId} size="md" />
            : <span style={{ color: '#dc2626' }}>Number looks incomplete</span>}
          <button className="btn btn-outline btn-sm" style={{ padding: '4px 8px' }} title="Edit number"
            onClick={() => setEditing(true)}><Pencil size={12} /></button>
        </>
      )}
      {error && <div style={{ width: '100%', fontSize: 11, color: '#dc2626' }}>{error}</div>}
    </div>
  )
}
