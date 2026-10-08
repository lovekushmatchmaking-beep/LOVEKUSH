import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { supabase } from '../supabase'

// Generic in-app notification bell — used in both the member header
// (AppChrome.TopBar) and the admin panel nav. Reads the `notifications`
// table (one row per event, written by DB triggers on the existing
// events — see supabase/migrations/20261005_in_app_notifications.sql).
// No new push infra: same "poll on an interval" pattern already used
// elsewhere in this app (Admin.js's stats auto-refresh), just at a
// shorter interval since this is meant to feel closer to live.
const POLL_MS = 30000
const PAGE_SIZE = 20

// One emoji per event type — purely a visual hint in the dropdown list,
// never the only way to tell events apart (the message text always says
// what happened).
const TYPE_EMOJI = {
  profile_approved: '✅',
  profile_blocked: '⛔',
  selfie_requested: '🤳',
  selfie_submitted: '🤳',
  photo_request_received: '📷',
  photo_request_approved: '📷',
  coordination_request_received: '🤝',
  meeting_scheduled: '📅',
  report_filed: '🚩',
  caste_suggestion_reviewed: '🏷️',
  share_link_interest: '👍',
  profile_liked: '❤️',
  mutual_interest: '💞',
}

export default function NotificationBell({ userId, onNavigate, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const boxRef = useRef(null)

  const load = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase.from('notifications').select('*')
      .eq('recipient_user_id', userId).order('created_at', { ascending: false }).limit(PAGE_SIZE)
    if (!error) setItems(data || [])
  }, [userId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const unreadCount = items.filter(n => !n.is_read).length

  const markRead = async (ids) => {
    if (ids.length === 0) return
    setItems(prev => prev.map(n => ids.includes(n.id) ? { ...n, is_read: true } : n))
    await supabase.from('notifications').update({ is_read: true }).in('id', ids)
  }

  const markAllRead = (e) => {
    e.stopPropagation()
    markRead(items.filter(n => !n.is_read).map(n => n.id))
  }

  const handleItemClick = (n) => {
    if (!n.is_read) markRead([n.id])
    setOpen(false)
    if (onNavigate) onNavigate(n)
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={() => setOpen(o => !o)} aria-label="Notifications">
        <Bell size={22} />
        {unreadCount > 0 && <span className="nav-dot" style={{ top: 8, right: 9 }} />}
      </button>
      {open && (
        <div className="card" style={{
          position: 'absolute', top: '120%', [align]: 0, width: 320, maxWidth: '90vw',
          maxHeight: 420, overflowY: 'auto', padding: 0, zIndex: 80,
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #ededed', position: 'sticky', top: 0, background: 'var(--white, #fff)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Notifications</span>
            {unreadCount > 0 && (
              <button className="btn btn-outline btn-sm" style={{ padding: '4px 8px', fontSize: 11 }} onClick={markAllRead}>
                <CheckCheck size={12} style={{ verticalAlign: '-2px', marginRight: 3 }} />Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--gray3)', fontSize: 13 }}>No notifications yet</div>
          ) : items.map(n => (
            <button key={n.id} onClick={() => handleItemClick(n)}
              style={{
                display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '10px 14px',
                border: 'none', borderBottom: '1px solid #f5f5f5', background: n.is_read ? 'transparent' : '#f0f7ff',
                cursor: 'pointer', font: 'inherit',
              }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{TYPE_EMOJI[n.type] || '🔔'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, display: 'block', color: '#1a1a1a' }}>{n.message}</span>
                <span style={{ fontSize: 11, color: 'var(--gray3)' }}>
                  {new Date(n.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </span>
              {!n.is_read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: 4 }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
