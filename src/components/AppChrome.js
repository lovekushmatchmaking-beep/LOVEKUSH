import React, { useEffect } from 'react'
import {
  House, Search, Heart, Inbox, UserRound, Menu, X, Settings, Lock,
  CircleHelp, LogOut, ScanSearch, Ban, FileText, Images,
} from 'lucide-react'
import SignedImage from './SignedImage'
import { SUPPORT_EMAIL } from './ui'
import { BrandLockup } from './BrandLogo'
import NotificationBell from './NotificationBell'

// Top bar — brand left, Notifications (bell) + hamburger right. The bell
// now opens the real notification center (profile approved/blocked,
// selfie requested, photo requests, coordination/meeting, etc. — see
// NotificationBell); `bellDot` still covers the one thing that isn't in
// that table (unseen Activity-tab likes/interests, Dashboard.js's own
// localStorage-based "seen" tracking) and is folded into the same dot.
export function TopBar({ userId, onNotifNavigate, bellDot, onMenu }) {
  return (
    <nav className="navbar">
      <BrandLockup size={28} />
      <div className="nav-right">
        <NotificationBellWithExtraDot userId={userId} onNavigate={onNotifNavigate} extraDot={bellDot} />
        <button className="icon-btn" onClick={onMenu} aria-label="Menu">
          <Menu size={22} />
        </button>
      </div>
    </nav>
  )
}

// Thin wrapper so TopBar can still surface the pre-existing "unseen
// interest" dot without NotificationBell needing to know about it.
function NotificationBellWithExtraDot({ userId, onNavigate, extraDot }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <NotificationBell userId={userId} onNavigate={onNavigate} />
      {extraDot && <span className="nav-dot" style={{ top: 8, right: 9, background: 'var(--gold, #b45309)' }} />}
    </span>
  )
}

// Instagram-style bottom nav — sirf icons, active tab par chhota label.
// Profile tab par user ki apni photo (avatar) dikhti hai.
export const NAV_ITEMS = [
  { id: 'home', icon: House, label: 'Home' },
  { id: 'matchsearch', icon: Search, label: 'Search' },
  { id: 'matches', icon: Heart, label: 'Matches' },
  { id: 'requests', icon: Inbox, label: 'Requests' },
  { id: 'profile', icon: UserRound, label: 'Profile' },
]

export function BottomNav({ active, onChange, avatarPath, dots = {} }) {
  return (
    <div className="bottom-nav">
      {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
        const isActive = active === id
        return (
          <button key={id} className={'bottom-nav-item ' + (isActive ? 'active' : '')}
            onClick={() => onChange(id)} aria-label={label} aria-current={isActive ? 'page' : undefined}>
            <span className="nav-icon">
              {id === 'profile' && avatarPath ? (
                <span className="nav-avatar">
                  <SignedImage path={avatarPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </span>
              ) : (
                <Icon size={24} strokeWidth={isActive ? 2.2 : 1.8} style={isActive && id === 'matches' ? { fill: 'currentColor' } : undefined} />
              )}
            </span>
            {dots[id] && <span className="nav-dot" />}
            <span className="nav-label">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

// Slide-in settings drawer (right side). Body scroll lock jab tak khula hai.
export function SideDrawer({ open, onClose, profile, avatarPath, onNavigate, onLogout }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  const go = (tab) => { onClose(); onNavigate(tab) }
  const help = () => {
    onClose()
    if (SUPPORT_EMAIL) window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Help — ' + (profile?.profile_code || ''))}`
    else onNavigate('help')
  }

  const items = [
    { icon: Settings, label: 'Account Settings', onClick: () => go('accountsettings') },
    { icon: Lock, label: 'Privacy', onClick: () => go('privacy') },
    // This opens the Activity tab (likes/views), which is a different
    // list from the real notification center (the bell, top-right) — was
    // labelled "Notifications" before the bell existed and never updated,
    // so it misled taps looking for the actual notifications (audit
    // 2026-10-09: dead-end/wrong-destination notification entries).
    { icon: Heart, label: 'Activity', onClick: () => go('activity') },
    { sep: true },
    { icon: ScanSearch, label: 'Search by Profile ID', onClick: () => go('searchid') },
    { icon: Images, label: 'Manage Photos', onClick: () => go('editphotos') },
    { icon: FileText, label: 'Biodata', onClick: () => go('biodata') },
    { icon: Ban, label: 'Blocked Profiles', onClick: () => go('disliked') },
    { sep: true },
    { icon: CircleHelp, label: 'Help', onClick: help },
    { icon: LogOut, label: 'Logout', onClick: () => { onClose(); onLogout() }, danger: true },
  ]

  return (
    <>
      <div className={'drawer-overlay' + (open ? ' open' : '')} onClick={onClose} aria-hidden="true" />
      <aside className={'drawer' + (open ? ' open' : '')} aria-hidden={!open} aria-label="Menu">
        <div className="drawer-head">
          <div className="avatar" style={{ width: 48, height: 48 }}>
            {avatarPath
              ? <SignedImage path={avatarPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <UserRound size={22} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.full_name || 'Welcome'}</div>
            {profile?.profile_code && <div className="profile-code" style={{ marginTop: 4, fontSize: 11, padding: '2px 10px' }}>{profile.profile_code}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close menu"><X size={22} /></button>
        </div>
        {items.map((it, i) => it.sep ? <div key={i} className="drawer-sep" /> : (
          <button key={it.label} className={'drawer-item' + (it.danger ? ' danger' : '')} onClick={it.onClick} tabIndex={open ? 0 : -1}>
            <span className="drawer-item-icon"><it.icon size={19} /></span>
            <span>{it.label}</span>
          </button>
        ))}
      </aside>
    </>
  )
}
