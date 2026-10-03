import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Ellipsis, Share2, Flag, Ban } from 'lucide-react'
import { iconForLabel, textOf } from './fieldIcons'
import { maskName } from '../utils/maskName'
import { supabase } from '../supabase'

// Shared, icon-first building blocks. Inline-styled pages purane hi rehte
// hain — yeh sirf woh chhote pieces hain jo har page pe repeat hote the
// (back button, form label, section label, empty state, three-dot menu).

// Form label + auto icon (label text se fieldIcons.js ka icon chunta hai).
// `icon` prop se override, `icon={false}` se icon band.
export function FormLabel({ children, icon, className = '', ...rest }) {
  const Icon = icon === false ? null : (icon || iconForLabel(textOf(children)))
  return (
    <label className={'form-label ' + className} {...rest}>
      {Icon && <Icon size={14} className="form-label-icon" aria-hidden="true" />}
      <span>{children}</span>
    </label>
  )
}

export function SectionLabel({ children, icon, style, className = '' }) {
  const Icon = icon === false ? null : (icon || iconForLabel(textOf(children)))
  return (
    <div className={'section-label ' + className} style={style}>
      {Icon && <Icon size={14} aria-hidden="true" />}
      <span>{children}</span>
    </div>
  )
}

// Round back button + page heading — har sub-page pe yahi pattern tha
// (pehle plain "←" text tha).
export function PageHeader({ title, onBack, right }) {
  return (
    <div className="page-header">
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
      )}
      <h2 className="page-heading">{title}</h2>
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
  )
}

// Empty state — bada soft icon, ek chhoti line, optional action.
export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="empty-state">
      {Icon && <div className="empty-state-icon"><Icon size={28} /></div>}
      {title && <div className="empty-state-title">{title}</div>}
      {text && <div className="empty-state-text">{text}</div>}
      {action}
    </div>
  )
}

// Generic popover menu — trigger pe click se khulta hai, bahar click ya
// Escape se band. items: [{ icon, label, onClick, danger }]
export function PopoverMenu({ items, label = 'More options', light }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="popover" ref={ref} onClick={e => e.stopPropagation()}>
      <button className={'icon-btn' + (light ? ' icon-btn-glass' : '')} aria-label={label} aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        <Ellipsis size={20} />
      </button>
      <div className={'popover-menu' + (open ? ' open' : '')} role="menu">
        {items.map(({ icon: Icon, label: l, onClick, danger }) => (
          <button key={l} role="menuitem" className={'popover-item' + (danger ? ' danger' : '')}
            onClick={() => { setOpen(false); onClick() }}>
            <Icon size={18} />
            <span>{l}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Support contact (Report / Help). Vercel env var REACT_APP_SUPPORT_EMAIL
// se override ho sakta hai, warna LOVEKUSH ka default support inbox.
export const SUPPORT_EMAIL = process.env.REACT_APP_SUPPORT_EMAIL || 'lovekushmatchmaking@gmail.com'

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

// Profile card ka three-dot menu: Share / Report / Block.
// Block = existing "dislike" action (profile matches se hat jaata hai,
// Drawer → Blocked profiles se undo ho sakta hai) — koi naya backend nahi.
// Report seedha profile_reports table mein jaata hai (Admin → Reports Queue),
// email sirf fallback hai agar insert fail ho.
export function ProfileActionsMenu({ profile, reporterProfileId, onBlock, onToast, light }) {
  const code = profile.profile_code || ''
  const share = async () => {
    const text = `LOVEKUSH profile ${code}`.trim()
    const url = window.location.origin
    if (navigator.share) {
      try { await navigator.share({ title: 'LOVEKUSH', text, url }) } catch { /* user cancelled */ }
      return
    }
    const ok = await copyText(`${text} — ${url}`)
    onToast && onToast(ok ? 'Profile ID copied' : code)
  }
  const report = async () => {
    const subject = `Report profile ${code}`
    if (reporterProfileId && profile.id) {
      const reason = window.prompt(`Why are you reporting ${maskName(profile.full_name) || 'this profile'}? (fake profile, misbehaviour, wrong details...)`)
      if (reason === null) return
      const { error } = await supabase.from('profile_reports').insert({
        reporter_profile_id: reporterProfileId,
        reported_profile_id: profile.id,
        reason: reason.trim() || 'No reason given',
        status: 'pending',
      })
      if (!error) { onToast && onToast('Reported — our team will review it'); return }
      console.error('profile_reports insert failed:', error.message)
    }
    if (SUPPORT_EMAIL) {
      window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
      return
    }
    await copyText(subject)
    onToast && onToast('Profile ID copied — please send it to our team')
  }
  const block = () => {
    if (window.confirm(`Block ${maskName(profile.full_name) || 'this profile'}? You won't see each other, and neither of you can send requests. You can unblock anytime from Blocked Profiles.`)) onBlock()
  }
  return (
    <PopoverMenu light={light} items={[
      { icon: Share2, label: 'Share', onClick: share },
      { icon: Flag, label: 'Report', onClick: report },
      { icon: Ban, label: 'Block', onClick: block, danger: true },
    ]} />
  )
}
