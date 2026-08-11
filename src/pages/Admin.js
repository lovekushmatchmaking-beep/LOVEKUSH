import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import SignedImage from '../components/SignedImage'

// PEHLE: yahan "const ADMIN_PASS = 'lovekush@admin2025'" tha — hardcoded
// password, jo public GitHub repo mein tha, isliye koi bhi browser
// se dekh sakta tha. AB: real Supabase Auth login + staff_users table
// check hota hai. Staff banane ke liye migration SQL file ke end mein
// instructions hain.

export default function Admin({ staffUser }) {
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState([])
  const [photos, setPhotos] = useState({})
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [stats, setStats] = useState({ total: 0, pending: 0, active: 0, blocked: 0 })
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (error) {
      console.error('Failed to load profiles:', error.message)
      setLoading(false)
      return
    }
    if (data) {
      setProfiles(data)
      setStats({
        total: data.length,
        pending: data.filter(p => p.profile_status === 'pending').length,
        active: data.filter(p => p.profile_status === 'active').length,
        blocked: data.filter(p => p.profile_status === 'blocked').length,
      })
      const photoMap = {}
      for (const p of data) {
        const { data: ph } = await supabase.from('photos').select('*').eq('profile_id', p.id).eq('is_primary', true).single()
        if (ph) photoMap[p.id] = ph.storage_path
      }
      setPhotos(photoMap)
    }
    setLoading(false)
  }

  const logAuditEntry = async (action, entityId, metadata) => {
    // Audit log — best-effort hai, agar fail ho to bhi main action ruknа nahi chahiye
    try {
      await supabase.from('audit_logs').insert({
        actor_user_id: staffUser.user_id,
        actor_role: staffUser.role,
        action,
        entity_type: 'profile',
        entity_id: entityId,
        metadata: metadata || {},
      })
    } catch (e) {
      console.warn('Audit log failed (non-critical):', e.message)
    }
  }

  const updateStatus = async (id, status) => {
    const { error } = await supabase.from('profiles').update({ profile_status: status }).eq('id', id)
    if (error) {
      alert('Update failed: ' + error.message)
      return
    }
    await logAuditEntry('profile_status_change', id, { new_status: status })
    loadData()
    setSelected(null)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const filtered = profiles.filter(p => {
    if (activeTab === 'pending' && p.profile_status !== 'pending') return false
    if (activeTab === 'active' && p.profile_status !== 'active') return false
    if (activeTab === 'blocked' && p.profile_status !== 'blocked') return false

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const haystack = [p.profile_code, p.full_name, p.city, p.state, p.religion, p.occupation]
        .filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <nav className="navbar">
        <span style={{ fontFamily: 'DM Sans', fontSize: 15, fontWeight: 200, letterSpacing: '0.35em' }}>ADMIN</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: '#8e8e8e' }}>{staffUser.role === 'admin' ? 'Admin' : 'Relationship Manager'}</span>
          <button className="btn btn-outline" style={{ fontSize: 11, padding: '6px 14px' }} onClick={logout}>Logout</button>
        </div>
      </nav>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total', val: stats.total, bg: '#f5f5f5' },
            { label: 'Pending', val: stats.pending, bg: '#fff8e1' },
            { label: 'Active', val: stats.active, bg: '#f0fdf4' },
            { label: 'Blocked', val: stats.blocked, bg: '#fef2f2' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontFamily: 'Cormorant Garamond', fontSize: 28, fontWeight: 300 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: '#8e8e8e', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <input
            type="text"
            placeholder="Search by Profile ID, name, city, religion, occupation..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.12)', fontSize: 13, outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid rgba(0,0,0,0.08)', paddingBottom: 0 }}>
          {['all', 'pending', 'active', 'blocked'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{
                padding: '8px 16px', border: 'none', background: 'transparent',
                fontSize: 13, fontWeight: activeTab === t ? 600 : 400,
                color: activeTab === t ? '#000' : '#8e8e8e',
                borderBottom: activeTab === t ? '2px solid #000' : '2px solid transparent',
                cursor: 'pointer', textTransform: 'capitalize', letterSpacing: '0.03em'
              }}>
              {t}
            </button>
          ))}
          <button className="btn btn-black btn-sm" style={{ marginLeft: 'auto', marginBottom: 4 }} onClick={loadData}>
            {loading ? 'Loading...' : '↺ Refresh'}
          </button>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#8e8e8e', fontSize: 14 }}>
            No profiles in this category
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(p => (
              <div key={p.id} style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'background 0.2s' }}
                onClick={() => setSelected(selected?.id === p.id ? null : p)}
                onMouseEnter={e => e.currentTarget.style.background = '#f9f9f9'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#f0f0f0', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {photos[p.id]
                      ? <SignedImage path={photos[p.id]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 18 }}>👤</span>
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{p.full_name}</div>
                    <div style={{ fontSize: 12, color: '#8e8e8e' }}>{p.age}y · {p.city} · {p.religion} · {p.occupation}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <div className={"badge badge-" + p.profile_status} style={{ fontSize: 10 }}>{p.profile_status}</div>
                    <div style={{ fontSize: 10, color: '#8e8e8e', fontFamily: 'monospace' }}>{p.profile_code}</div>
                  </div>
                </div>

                {selected?.id === p.id && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14, fontSize: 13 }}>
                      {[
                        ['Education', p.education],
                        ['Income', p.annual_income],
                        ['Family', p.family_type],
                        ['Diet', p.diet],
                        ['Completeness', p.profile_completeness + '%'],
                        ['Registered', new Date(p.created_at).toLocaleDateString('en-IN')],
                        ['Gender', p.gender],
                        ['Marital Status', p.marital_status],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <span style={{ color: '#8e8e8e' }}>{k}: </span>
                          <span style={{ fontWeight: 500 }}>{v || '—'}</span>
                        </div>
                      ))}
                    </div>
                    {p.about_me && <div style={{ fontSize: 13, color: '#555', background: '#f9f9f9', padding: '10px 12px', borderRadius: 8, marginBottom: 14, lineHeight: 1.6 }}>{p.about_me}</div>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {p.profile_status !== 'active' && (
                        <button className="btn btn-black btn-sm" onClick={e => { e.stopPropagation(); updateStatus(p.id, 'active') }}>✓ Approve</button>
                      )}
                      {p.profile_status !== 'blocked' && (
                        <button className="btn btn-outline btn-sm" style={{ color: '#dc2626', borderColor: '#dc2626' }}
                          onClick={e => { e.stopPropagation(); updateStatus(p.id, 'blocked') }}>✕ Block</button>
                      )}
                      {p.profile_status !== 'pending' && (
                        <button className="btn btn-outline btn-sm"
                          onClick={e => { e.stopPropagation(); updateStatus(p.id, 'pending') }}>↩ Set Pending</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
