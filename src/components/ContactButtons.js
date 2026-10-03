import React, { useState } from 'react'
import { Phone, MessageCircle, Pencil } from 'lucide-react'
import { supabase } from '../supabase'
import { buildTelLink, buildWaChatLink, normalizePhone } from '../utils/shareProfile'

// ADMIN-ONLY quick contact — profile ke number (profiles.client_phone) par
// ek tap mein Call ya WhatsApp. Members ko ek-doosre ka number kabhi nahi
// dikhta (privacy-rules), isliye yeh sirf Admin screens par use hota hai.

const WA_GREEN = '#16a34a'

// Chhote icon buttons — list rows ke liye (expand kiye bina call/WhatsApp).
export function ContactButtons({ phone, onAction, size = 'sm' }) {
  const tel = buildTelLink(phone)
  const wa = buildWaChatLink(phone)
  if (!tel) return null
  const pad = size === 'sm' ? '4px 8px' : '6px 12px'
  const stop = (kind) => (e) => { e.stopPropagation(); onAction && onAction(kind) }
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <a href={tel} onClick={stop('call')} className="btn btn-outline btn-sm" title={'Call ' + phone}
        style={{ padding: pad, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Phone size={14} />{size !== 'sm' && ' Call'}
      </a>
      <a href={wa} onClick={stop('whatsapp')} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" title={'WhatsApp ' + phone}
        style={{ padding: pad, display: 'inline-flex', alignItems: 'center', gap: 4, color: WA_GREEN, borderColor: WA_GREEN }}>
        <MessageCircle size={14} />{size !== 'sm' && ' WhatsApp'}
      </a>
    </span>
  )
}

// Expanded profile ke liye — number + Call/WhatsApp, aur number na ho ya
// galat ho to wahin save/edit (same client_phone column jo CreateProfile
// aur Find Matches pehle se use karte hain).
export function ProfileContact({ profile, onSaved, onAction }) {
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
            ? <ContactButtons phone={phone} onAction={onAction} size="md" />
            : <span style={{ color: '#dc2626' }}>Number looks incomplete</span>}
          <button className="btn btn-outline btn-sm" style={{ padding: '4px 8px' }} title="Edit number"
            onClick={() => setEditing(true)}><Pencil size={12} /></button>
        </>
      )}
      {error && <div style={{ width: '100%', fontSize: 11, color: '#dc2626' }}>{error}</div>}
    </div>
  )
}
