import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { Phone, MessageCircle, Pencil, Building2 } from 'lucide-react'
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
// `externalBureauName`: profile.external_bureau_name (profile source bureau
// ka naam, e.g. "X.MB") — jab number hi nahi hai (external bureau profiles
// aksar contact details nahi dete), yeh buttons silently gayab hone ke
// jagah ek chhota "No contact — external bureau" note dikhate hain, taaki
// koi socha na le ki number save karna bhool gaye (Aryan's ask, 2026-10-09).
export function ContactButtons({ phone, onAction, logProfile, introductionId, size = 'sm', externalBureauName }) {
  const [logKind, setLogKind] = useState(null)
  const tel = buildTelLink(phone)
  const wa = buildWaChatLink(phone)
  if (!tel) {
    if (!externalBureauName) return null
    return (
      <span style={{ fontSize: 11, color: '#b45309', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        title={`Sourced from ${externalBureauName} — they haven't shared this client's contact details`}>
        <Building2 size={12} /> No contact — external ({externalBureauName})
      </span>
    )
  }
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
        <Phone size={14} />
      </a>
      <a href={wa} onClick={stop('whatsapp')} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" title={'WhatsApp ' + phone}
        style={{ padding: pad, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: WA_GREEN, borderColor: WA_GREEN }}>
        <MessageCircle size={14} />
      </a>
      {logKind && <QuickCallLog profile={logProfile} kind={logKind} introductionId={introductionId} onClose={() => setLogKind(null)} />}
    </span>
  )
}

// Freestanding "Add note" — same bottom sheet as the Call/WhatsApp log, for
// logging something that wasn't a call/WhatsApp tap (a meeting outcome, a
// reschedule reason, anything mid-coordination). Used inside Coordination
// Requests so the back-and-forth isn't only captured at final Close/Feedback.
export function AddNoteButton({ profile, introductionId, label }) {
  const [open, setOpen] = useState(false)
  if (!profile?.id) return null
  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" style={{ padding: '3px 8px', fontSize: 11 }}
        title="Add note" onClick={(e) => { e.stopPropagation(); setOpen(true) }}><Pencil size={12} /></button>
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
// `showContactButtons`: false jahan screen already apna Call/WhatsApp pair
// dikha chuki hai (Profiles list's own top quick-actions row) — number ko
// phir bhi yahan hi edit kiya ja sakta hai, bas dusra Call/WhatsApp jodaa
// nahi dikhta (Aryan's audit, 2026-10-08: duplicate Call/WhatsApp buttons).
export function ProfileContact({ profile, onSaved, onAction, onBureauSaved, logCalls = false, introductionId, staffUser, showContactButtons = true }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile.client_phone || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const phone = profile.client_phone
  const valid = !!normalizePhone(phone)
  const bureau = profile.external_bureau_name
  const [editingBureau, setEditingBureau] = useState(false)
  const [bureauDraft, setBureauDraft] = useState(bureau || '')
  const [bureauSaving, setBureauSaving] = useState(false)

  const save = async () => {
    if (!normalizePhone(draft)) { setError('Enter a valid number (10 digits, or with country code)'); return }
    setSaving(true)
    const { error: err } = await supabase.from('profiles').update({ client_phone: draft.trim() }).eq('id', profile.id)
    setSaving(false)
    if (err) { setError('Could not save: ' + err.message); return }
    // Client phone edit kahin audit log nahi likhta tha — Aryan ka audit
    // gap #7. staffUser prop na ho (ab jo call-site pass nahi karte) to
    // bhi fail nahi hota, bas log skip ho jaata hai.
    if (staffUser) {
      supabase.from('audit_logs').insert({
        actor_user_id: staffUser.user_id, actor_role: staffUser.role,
        action: 'client_phone_edit', entity_type: 'profile', entity_id: profile.id,
        metadata: { new_phone: draft.trim() },
      }).then(({ error: logErr }) => { if (logErr) console.warn('Audit log failed (non-critical):', logErr.message) })
    }
    setError(''); setEditing(false)
    onSaved && onSaved(draft.trim())
  }

  // Bureau name — jab bhi set ho, "No number saved yet" ki jagah yeh batata
  // hai KYUN number nahi hai (woh dusra bureau client ka contact nahi deta).
  const saveBureau = async (raw = bureauDraft) => {
    setBureauSaving(true)
    const value = (raw || '').trim() || null
    const { error: err } = await supabase.from('profiles').update({ external_bureau_name: value }).eq('id', profile.id)
    setBureauSaving(false)
    if (err) { setError('Could not save: ' + err.message); return }
    setError(''); setEditingBureau(false); setBureauDraft(value || '')
    onBureauSaved && onBureauSaved(value)
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8, fontSize: 12 }}>
        <Phone size={14} color="#8e8e8e" />
        {editing || !phone ? (
          <>
            <input className="form-input" placeholder="WhatsApp / mobile number" value={draft} inputMode="tel"
              onChange={e => setDraft(e.target.value)} style={{ flex: '1 1 160px', fontSize: 12, maxWidth: 220 }} />
            <button className="btn btn-outline btn-sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save number'}</button>
            {phone && <button className="btn btn-outline btn-sm" onClick={() => { setEditing(false); setDraft(phone); setError('') }}>Cancel</button>}
            {!phone && (
              <span style={{ color: bureau ? '#b45309' : '#8e8e8e' }}>
                {bureau ? `No contact — external bureau profile (${bureau})` : 'No number saved yet'}
              </span>
            )}
          </>
        ) : (
          <>
            <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{phone}</span>
            {!valid && <span style={{ color: '#dc2626' }}>Number looks incomplete</span>}
            {valid && showContactButtons &&
              <ContactButtons phone={phone} onAction={onAction} logProfile={logCalls ? profile : undefined} introductionId={introductionId} size="md" />}
            <button className="btn btn-outline btn-sm" style={{ padding: '4px 8px' }} title="Edit number"
              onClick={() => setEditing(true)}><Pencil size={12} /></button>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12, fontSize: 12 }}>
        <Building2 size={13} color="#8e8e8e" />
        {editingBureau ? (
          <>
            <input className="form-input" placeholder='Bureau name, e.g. "X.MB"' value={bureauDraft}
              onChange={e => setBureauDraft(e.target.value)} style={{ flex: '1 1 160px', fontSize: 12, maxWidth: 220 }} autoFocus />
            <button className="btn btn-outline btn-sm" disabled={bureauSaving} onClick={saveBureau}>{bureauSaving ? 'Saving…' : 'Save'}</button>
            <button className="btn btn-outline btn-sm" onClick={() => { setEditingBureau(false); setBureauDraft(bureau || '') }}>Cancel</button>
          </>
        ) : bureau ? (
          <>
            <span className="badge" style={{ fontSize: 12, background: '#fff7ed', color: '#b45309' }}
              title="Sourced from another marriage bureau — their contact details are typically missing/restricted">🔗 External — {bureau}</span>
            <button className="btn btn-outline btn-sm" style={{ padding: '4px 8px' }} title="Edit bureau name"
              onClick={() => setEditingBureau(true)}><Pencil size={12} /></button>
            <button className="btn btn-outline btn-sm" style={{ padding: '4px 8px', fontSize: 11, color: '#8e8e8e' }}
              title="Not external — clear this tag" onClick={() => saveBureau('')}>Clear</button>
          </>
        ) : (
          <button className="btn btn-outline btn-sm" style={{ padding: '3px 8px', fontSize: 11, color: '#8e8e8e' }}
            onClick={() => setEditingBureau(true)}>+ Mark as external bureau profile</button>
        )}
      </div>
      {error && <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 8 }}>{error}</div>}
    </div>
  )
}
