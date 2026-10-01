import React, { useState } from 'react'
import { supabase } from '../supabase'
import { PRIVACY_LEVELS } from '../constants/profileOptions'

const HIDE_DURATIONS = [
  { label: '7 days', days: 7 },
  { label: '15 days', days: 15 },
  { label: '30 days', days: 30 },
]

export default function AccountSettings({ profile, user, onProfileUpdate, onBack, onDeleted }) {
  const [view, setView] = useState('menu') // 'menu' | 'privacy' | 'password' | 'hidedelete'
  const [toast, setToast] = useState('')

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const back = () => (view === 'menu' ? onBack() : setView('menu'))

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
        <button onClick={back} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',lineHeight:1}}>←</button>
        <h2 style={{fontFamily:'Cormorant Garamond',fontSize:24,fontWeight:300,margin:0}}>
          {view === 'menu' ? 'Account & Settings'
            : view === 'privacy' ? 'Privacy Settings'
            : view === 'password' ? 'Change Password'
            : 'Hide / Delete Profile'}
        </h2>
      </div>

      <div className={'toast ' + (toast?'show':'')}>{toast}</div>

      {view === 'menu' && (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <button className="card" style={{textAlign:'left',cursor:'pointer',border:'1px solid rgba(0,0,0,0.1)'}} onClick={()=>setView('privacy')}>
            <div style={{fontWeight:600,fontSize:15,marginBottom:2}}>Privacy Settings</div>
            <div style={{fontSize:12,color:'#8e8e8e'}}>Control who sees your Community, Income, Contact & more</div>
          </button>
          <button className="card" style={{textAlign:'left',cursor:'pointer',border:'1px solid rgba(0,0,0,0.1)'}} onClick={()=>setView('password')}>
            <div style={{fontWeight:600,fontSize:15,marginBottom:2}}>Change Password</div>
            <div style={{fontSize:12,color:'#8e8e8e'}}>Update your login password</div>
          </button>
          <button className="card" style={{textAlign:'left',cursor:'pointer',border:'1px solid rgba(0,0,0,0.1)'}} onClick={()=>setView('hidedelete')}>
            <div style={{fontWeight:600,fontSize:15,marginBottom:2}}>Hide / Delete Profile</div>
            <div style={{fontSize:12,color:'#8e8e8e'}}>Temporarily hide your profile or permanently delete it</div>
          </button>
        </div>
      )}

      {view === 'privacy' && (
        <PrivacySettingsView profile={profile} onSave={onProfileUpdate} showToast={showToast} />
      )}

      {view === 'password' && (
        <ChangePasswordView showToast={showToast} />
      )}

      {view === 'hidedelete' && (
        <HideDeleteView profile={profile} user={user} onProfileUpdate={onProfileUpdate} onDeleted={onDeleted} showToast={showToast} />
      )}
    </div>
  )
}

function PrivacySettingsView({ profile, onSave, showToast }) {
  const [form, setForm] = useState({
    community_privacy: profile.community_privacy || 'Matches Only',
    college_privacy: profile.college_privacy || 'Matches Only',
    company_privacy: profile.company_privacy || 'Matches Only',
    income_privacy: profile.income_privacy || 'Private',
    contact_privacy: profile.contact_privacy || 'Matches Only',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const FIELDS = [
    ['community_privacy', 'Community / Caste'],
    ['college_privacy', 'College / Institution Name'],
    ['company_privacy', 'Company Name'],
    ['income_privacy', 'Income'],
    ['contact_privacy', 'Mobile Number Visibility'],
  ]

  const handleSave = async () => {
    setSaving(true)
    const { data, error } = await supabase.from('profiles').update(form).eq('id', profile.id).select().single()
    setSaving(false)
    if (error) { showToast('Could not save: ' + error.message); return }
    onSave(data)
    showToast('Privacy settings saved!')
  }

  return (
    <div>
      <div className="card" style={{marginBottom:16}}>
        {FIELDS.map(([key, label]) => (
          <div className="form-group" key={key}>
            <label className="form-label">Who can see your {label}?</label>
            <select className="form-select" value={form[key]} onChange={e=>set(key,e.target.value)}>
              {PRIVACY_LEVELS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        ))}
      </div>
      <button className="btn btn-black btn-full" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  )
}

function ChangePasswordView({ showToast }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (password.length < 6) { showToast('Password must be at least 6 characters'); return }
    if (password !== confirm) { showToast('Passwords do not match'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) { showToast('Could not change password: ' + error.message); return }
    setPassword('')
    setConfirm('')
    showToast('Password changed successfully!')
  }

  return (
    <div>
      <div className="card" style={{marginBottom:16}}>
        <div className="form-group">
          <label className="form-label">New Password</label>
          <input className="form-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" />
        </div>
        <div className="form-group">
          <label className="form-label">Confirm New Password</label>
          <input className="form-input" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-black btn-full" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Change Password'}
      </button>
    </div>
  )
}

function HideDeleteView({ profile, user, onProfileUpdate, onDeleted, showToast }) {
  const [days, setDays] = useState(15)
  const [hiding, setHiding] = useState(false)
  const [deleteConfirmed, setDeleteConfirmed] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isHidden = profile.hidden_until && new Date(profile.hidden_until) > new Date()

  const hideProfile = async () => {
    setHiding(true)
    const until = new Date(Date.now() + days*24*60*60*1000).toISOString()
    const { data, error } = await supabase.from('profiles').update({ hidden_until: until }).eq('id', profile.id).select().single()
    setHiding(false)
    if (error) { showToast('Could not hide profile: ' + error.message); return }
    onProfileUpdate(data)
    showToast('Profile hidden for ' + days + ' days')
  }

  const unhideProfile = async () => {
    setHiding(true)
    const { data, error } = await supabase.from('profiles').update({ hidden_until: null }).eq('id', profile.id).select().single()
    setHiding(false)
    if (error) { showToast('Could not unhide profile: ' + error.message); return }
    onProfileUpdate(data)
    showToast('Profile is visible again')
  }

  const deleteProfile = async () => {
    if (!window.confirm('This will permanently delete your profile and all your data. This cannot be undone. Continue?')) return
    setDeleting(true)
    try {
      const { data: photoRows } = await supabase.from('photos').select('storage_path').eq('profile_id', profile.id)
      const paths = (photoRows || []).map(p => p.storage_path).filter(Boolean)
      if (paths.length > 0) await supabase.storage.from('lovekush-photos').remove(paths)

      await supabase.from('photos').delete().eq('profile_id', profile.id)
      await supabase.from('match_actions').delete().eq('actor_profile_id', profile.id)
      await supabase.from('match_actions').delete().eq('target_profile_id', profile.id)
      await supabase.from('introductions').delete().eq('from_profile', profile.id)
      await supabase.from('introductions').delete().eq('to_profile', profile.id)
      const { error: delErr } = await supabase.from('profiles').delete().eq('id', profile.id)
      if (delErr) throw delErr

      await supabase.auth.signOut()
      onDeleted()
    } catch (err) {
      setDeleting(false)
      showToast('Could not delete profile: ' + err.message)
    }
  }

  return (
    <div>
      <div className="card" style={{marginBottom:16}}>
        <div className="section-label" style={{marginBottom:10}}>Hide Profile</div>
        <p style={{fontSize:13,color:'#8e8e8e',marginBottom:14}}>
          Your profile won't be shown in matches while hidden. You can unhide anytime.
        </p>
        {isHidden ? (
          <>
            <div className="notice" style={{marginBottom:14}}>
              Hidden until {new Date(profile.hidden_until).toLocaleDateString('en-IN')}.
            </div>
            <button className="btn btn-outline btn-full" onClick={unhideProfile} disabled={hiding}>
              {hiding ? 'Please wait...' : 'Unhide Now'}
            </button>
          </>
        ) : (
          <>
            <div className="radio-group" style={{marginBottom:14}}>
              {HIDE_DURATIONS.map(d => (
                <label key={d.days} className={'radio-option ' + (days===d.days?'selected':'')} onClick={()=>setDays(d.days)}>
                  {d.label}
                </label>
              ))}
            </div>
            <button className="btn btn-outline btn-full" onClick={hideProfile} disabled={hiding}>
              {hiding ? 'Please wait...' : 'Hide My Profile'}
            </button>
          </>
        )}
      </div>

      <div className="card" style={{marginBottom:16,borderColor:'#e53e3e'}}>
        <div className="section-label" style={{marginBottom:10,color:'#e53e3e'}}>Delete Profile</div>
        <p style={{fontSize:13,color:'#8e8e8e',marginBottom:14}}>
          This will permanently delete your profile, photos, matches and requests. This cannot be undone.
        </p>
        <label style={{display:'flex',alignItems:'flex-start',gap:8,fontSize:13,marginBottom:14,cursor:'pointer'}}>
          <input type="checkbox" checked={deleteConfirmed} onChange={e=>setDeleteConfirmed(e.target.checked)} style={{marginTop:2}} />
          <span>I understand this action is permanent and cannot be undone.</span>
        </label>
        <button
          className="btn btn-full"
          style={{background:'#e53e3e',color:'#fff'}}
          disabled={!deleteConfirmed || deleting}
          onClick={deleteProfile}
        >
          {deleting ? 'Deleting...' : 'Yes, Delete My Profile Permanently'}
        </button>
      </div>
    </div>
  )
}
