import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import SignedImage from '../components/SignedImage'
import { RELIGIONS, CASTES, MARITAL_STATUSES, EDUCATIONS } from '../constants/profileOptions'

// SEARCH DESIGN NOTE: yeh search ab DATABASE se query karta hai (Supabase
// .ilike()/.eq()/.gte() ke saath), poore profiles table ko browser mein
// laake client-side filter nahi karta — isliye 100 profiles ho ya
// 100,000, search speed same rahegi. Pagination (Load More) bhi hai
// taaki ek baar mein poora table na load ho.

const PAGE_SIZE = 30

export default function Admin({ staffUser }) {
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState([])
  const [photos, setPhotos] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [stats, setStats] = useState({ total: 0, pending: 0, active: 0, blocked: 0 })
  const [selected, setSelected] = useState(null)

  // Search + Filters
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('') // debounced value that actually triggers query
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    religion: '', community: '', city: '', gender: '',
    ageMin: '', ageMax: '', maritalStatus: '', education: '',
  })

  // Debounce search input (400ms) — DB pe har keystroke pe query nahi maarte
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    loadStats()
  }, [])

  useEffect(() => {
    runQuery(0)
  }, [activeTab, search, filters])

  const loadStats = async () => {
    const counts = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('profile_status', 'pending'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('profile_status', 'active'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('profile_status', 'blocked'),
    ])
    setStats({
      total: counts[0].count || 0,
      pending: counts[1].count || 0,
      active: counts[2].count || 0,
      blocked: counts[3].count || 0,
    })
  }

  // Poora query builder — DB-level pe filter apply karta hai, client
  // pe nahi. Yehi "scale ke liye sahi" tareeka hai.
  const buildQuery = (from, to) => {
    let q = supabase.from('profiles').select('*').order('created_at', { ascending: false }).range(from, to)

    if (activeTab !== 'all') q = q.eq('profile_status', activeTab)

    if (search) {
      // PostgREST ke .or() syntax mein comma/bracket jaise characters
      // special meaning rakhte hain — search text se hata dete hain
      // taaki koi query-syntax error na aaye ya unexpected result na mile.
      const safeSearch = search.replace(/[,()%*]/g, '')
      if (safeSearch) {
        q = q.or(`profile_code.ilike.%${safeSearch}%,full_name.ilike.%${safeSearch}%`)
      }
    }
    if (filters.religion) q = q.eq('religion', filters.religion)
    if (filters.community) q = q.eq('community', filters.community)
    if (filters.city) q = q.ilike('city', `%${filters.city}%`)
    if (filters.gender) q = q.eq('gender', filters.gender)
    if (filters.maritalStatus) q = q.eq('marital_status', filters.maritalStatus)
    if (filters.education) q = q.eq('education', filters.education)
    if (filters.ageMin) q = q.gte('age', parseInt(filters.ageMin))
    if (filters.ageMax) q = q.lte('age', parseInt(filters.ageMax))

    return q
  }

  const runQuery = async (fromIndex) => {
    if (fromIndex === 0) setLoading(true)
    else setLoadingMore(true)

    const { data, error } = await buildQuery(fromIndex, fromIndex + PAGE_SIZE - 1)

    if (error) {
      console.error('Search query failed:', error.message)
      setLoading(false); setLoadingMore(false)
      return
    }

    const newRows = data || []
    setHasMore(newRows.length === PAGE_SIZE)

    if (fromIndex === 0) {
      setProfiles(newRows)
    } else {
      setProfiles(prev => [...prev, ...newRows])
    }

    await loadPhotosFor(newRows)
    setLoading(false); setLoadingMore(false)
  }

  const loadPhotosFor = async (rows) => {
    if (rows.length === 0) return
    const ids = rows.map(r => r.id)
    const { data: photoRows } = await supabase
      .from('photos').select('profile_id, storage_path').in('profile_id', ids).eq('is_primary', true)
    if (photoRows) {
      setPhotos(prev => {
        const next = { ...prev }
        photoRows.forEach(p => { next[p.profile_id] = p.storage_path })
        return next
      })
    }
  }

  const loadMore = () => {
    if (!hasMore || loadingMore) return
    runQuery(profiles.length)
  }

  const resetFilters = () => {
    setFilters({ religion:'', community:'', city:'', gender:'', ageMin:'', ageMax:'', maritalStatus:'', education:'' })
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  const logAuditEntry = async (action, entityId, metadata) => {
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
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, profile_status: status } : p))
    loadStats()
    setSelected(null)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

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

        {/* SEARCH BAR */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Search by Profile ID (e.g. LK-FH26-1073) or name..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.12)', fontSize: 13, outline: 'none',
            }}
          />
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setShowFilters(!showFilters)}
            style={{ position: 'relative' }}
          >
            ⚙ Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
        </div>

        {/* ADVANCED FILTERS PANEL */}
        {showFilters && (
          <div style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <select className="form-select" value={filters.religion} onChange={e=>setFilters(f=>({...f,religion:e.target.value}))}>
                <option value="">Any Religion</option>
                {RELIGIONS.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
              <select className="form-select" value={filters.community} onChange={e=>setFilters(f=>({...f,community:e.target.value}))}>
                <option value="">Any Community</option>
                {CASTES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <input className="form-input" placeholder="City" value={filters.city}
                onChange={e=>setFilters(f=>({...f,city:e.target.value}))} />
              <select className="form-select" value={filters.gender} onChange={e=>setFilters(f=>({...f,gender:e.target.value}))}>
                <option value="">Any Gender</option>
                <option>Male</option><option>Female</option>
              </select>
              <select className="form-select" value={filters.maritalStatus} onChange={e=>setFilters(f=>({...f,maritalStatus:e.target.value}))}>
                <option value="">Any Marital Status</option>
                {MARITAL_STATUSES.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
              <select className="form-select" value={filters.education} onChange={e=>setFilters(f=>({...f,education:e.target.value}))}>
                <option value="">Any Education</option>
                {EDUCATIONS.map(e=><option key={e} value={e}>{e}</option>)}
              </select>
              <input className="form-input" type="number" placeholder="Age Min" value={filters.ageMin}
                onChange={e=>setFilters(f=>({...f,ageMin:e.target.value}))} />
              <input className="form-input" type="number" placeholder="Age Max" value={filters.ageMax}
                onChange={e=>setFilters(f=>({...f,ageMax:e.target.value}))} />
            </div>
            {activeFilterCount > 0 && (
              <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={resetFilters}>Reset Filters</button>
            )}
          </div>
        )}

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
          <button className="btn btn-black btn-sm" style={{ marginLeft: 'auto', marginBottom: 4 }} onClick={() => runQuery(0)}>
            {loading ? 'Loading...' : '↺ Refresh'}
          </button>
        </div>

        {(search || activeFilterCount > 0) && !loading && (
          <div style={{ fontSize: 12, color: '#8e8e8e', marginBottom: 10 }}>
            {profiles.length} result{profiles.length !== 1 ? 's' : ''} found
            {search && ` for "${search}"`}
          </div>
        )}

        {!loading && profiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#8e8e8e', fontSize: 14 }}>
            {search || activeFilterCount > 0
              ? <>No profiles match your search. Try a different Profile ID, name, or fewer filters.</>
              : 'No profiles in this category'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {profiles.map(p => (
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
                        ['Community', p.community],
                        ['Sub-Caste / Gotra', [p.sub_caste, p.gotra].filter(Boolean).join(' / ') || null],
                        ['Manglik', p.manglik],
                        ['Education', p.education],
                        ['Occupation', p.occupation],
                        ['Income', p.annual_income],
                        ['Family Type', p.family_type],
                        ['Diet', p.diet],
                        ['Completeness', p.profile_completeness + '%'],
                        ['Registered', new Date(p.created_at).toLocaleDateString('en-IN')],
                        ['Gender', p.gender],
                        ['Marital Status', p.marital_status],
                      ].filter(([,v])=>v).map(([k, v]) => (
                        <div key={k}>
                          <span style={{ color: '#8e8e8e' }}>{k}: </span>
                          <span style={{ fontWeight: 500 }}>{v}</span>
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

            {hasMore && (
              <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
