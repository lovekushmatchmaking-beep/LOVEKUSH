import React, { useState } from 'react'
import { FormLabel, SectionLabel, PageHeader } from '../components/ui'
import { supabase } from '../supabase'
import { PRIVACY_LEVELS } from '../constants/profileOptions'
import { Lock, KeyRound, EyeOff, ChevronRight, Trash2, Eye, Check, FileText } from 'lucide-react'
import TermsAndConditions from '../components/TermsAndConditions'

const HIDE_DURATIONS = [
  { label: '7 days', days: 7 },
  { label: '15 days', days: 15 },
  { label: '30 days', days: 30 },
]

export default function AccountSettings({ profile, user, onProfileUpdate, onBack, onDeleted, initialView }) {
  const [view, setView] = useState(initialView || 'menu') // 'menu' | 'privacy' | 'password' | 'hidedelete' | 'terms'
  const [toast, setToast] = useState('')

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // Drawer se seedha kisi sub-view pe aaye ho to back = wahin wapas
  const back = () => (view === 'menu' || view === initialView ? onBack() : setView('menu'))

  return (
    <div>
      <PageHeader onBack={back} title={view === 'menu' ? 'Settings'
        : view === 'privacy' ? 'Privacy'
        : view === 'password' ? 'Password'
        : view === 'terms' ? 'Terms & Conditions'
        : 'Hide / Delete'} />

      <div className={'toast ' + (toast?'show':'')}>{toast}</div>

      {view === 'menu' && (
        <div className="menu-list">
          {[
            { v:'privacy', icon:Lock, title:'Privacy', sub:'Who sees your community, income, contact' },
            { v:'password', icon:KeyRound, title:'Password', sub:'Change your login password' },
            { v:'terms', icon:FileText, title:'Terms & Conditions', sub:'The consent you agreed to at signup' },
            { v:'hidedelete', icon:EyeOff, title:'Hide / Delete', sub:'Pause or remove your profile' },
          ].map(({v,icon:Icon,title,sub})=>(
            <button key={v} className="menu-row" onClick={()=>setView(v)}>
              <Icon size={20} className="menu-row-icon" />
              <div>
                <div>{title}</div>
                <div className="menu-row-sub">{sub}</div>
              </div>
              <ChevronRight size={18} className="chev" />
            </button>
          ))}
        </div>
      )}

      {view === 'privacy' && (
        <PrivacySettingsView profile={profile} onSave={onProfileUpdate} showToast={showToast} />
      )}

      {view === 'password' && (
        <ChangePasswordView showToast={showToast} userEmail={user?.email} />
      )}

      {view === 'terms' && (
        <div className="card" style={{marginBottom:16}}>
          <SectionLabel style={{marginBottom:14}}>Terms & Conditions</SectionLabel>
          <TermsAndConditions />
          {profile.terms_accepted_at && (
            <div className="form-hint" style={{marginTop:10}}>
              You agreed to this on {new Date(profile.terms_accepted_at).toLocaleDateString('en-IN')}.
            </div>
          )}
        </div>
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
            <FormLabel>Who can see your {label}?</FormLabel>
            <select className="form-select" value={form[key]} onChange={e=>set(key,e.target.value)}>
              {PRIVACY_LEVELS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
        <Check size={16} /> {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}

function ChangePasswordView({ showToast, userEmail }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  // Aryan ka audit (gap 2): pehle current password re-enter kiye bina seedha
  // naya password set ho jaata tha. Ab Supabase ka apna re-login current
  // password verify karta hai (signInWithPassword), tabhi updateUser chalta
  // hai — koi nayi table/column nahi chahiye.
  const handleSave = async () => {
    if (!currentPassword) { showToast('Enter your current password'); return }
    if (password.length < 6) { showToast('Password must be at least 6 characters'); return }
    if (password !== confirm) { showToast('Passwords do not match'); return }
    setSaving(true)
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: userEmail, password: currentPassword })
    if (verifyError) {
      setSaving(false)
      showToast('Current password is incorrect')
      return
    }
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) { showToast('Could not change password: ' + error.message); return }
    setCurrentPassword('')
    setPassword('')
    setConfirm('')
    showToast('Password changed successfully!')
  }

  return (
    <div>
      <div className="card" style={{marginBottom:16}}>
        <div className="form-group">
          <FormLabel>Current Password</FormLabel>
          <input className="form-input" type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} placeholder="Enter current password" />
        </div>
        <div className="form-group">
          <FormLabel>New Password</FormLabel>
          <input className="form-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" />
        </div>
        <div className="form-group">
          <FormLabel>Confirm New Password</FormLabel>
          <input className="form-input" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
        <KeyRound size={16} /> {saving ? 'Saving...' : 'Change Password'}
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

      // Aryan ka audit (gap #8): delete pehle sirf profiles row delete
      // karta tha (jo FK constraint se kabhi fail bhi ho jaata tha — ab
      // saare profiles.id FKs CASCADE hain, migration 20261005), aur login
      // credentials (auth.users) kabhi delete nahi hote the — client ke
      // paas service-role key nahi hota. Ab "delete-account" edge function
      // (service-role) auth.users delete karta hai, jo profiles row +
      // uske saath cascade hone wala sab kuch khud saaf kar deta hai.
      const { error: fnError } = await supabase.functions.invoke('delete-account')
      if (fnError) throw fnError

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
        <SectionLabel icon={EyeOff} style={{marginBottom:6}}>Hide Profile</SectionLabel>
        <p style={{fontSize:13,color:'var(--gray3)',marginBottom:14}}>
          Hidden from matches. Unhide anytime.
        </p>
        {isHidden ? (
          <>
            <div className="notice" style={{marginBottom:14}}>
              Hidden until {new Date(profile.hidden_until).toLocaleDateString('en-IN')}.
            </div>
            <button className="btn btn-outline btn-full" onClick={unhideProfile} disabled={hiding}>
              <Eye size={16} /> {hiding ? 'Please wait...' : 'Unhide'}
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
              <EyeOff size={16} /> {hiding ? 'Please wait...' : 'Hide'}
            </button>
          </>
        )}
      </div>

      <div className="card" style={{marginBottom:16,borderColor:'#f1c6c6'}}>
        <SectionLabel icon={Trash2} style={{marginBottom:6,color:'var(--danger)'}}>Delete Profile</SectionLabel>
        <p style={{fontSize:13,color:'var(--gray3)',marginBottom:14}}>
          This will permanently delete your profile, photos, matches and requests. This cannot be undone.
        </p>
        <label style={{display:'flex',alignItems:'flex-start',gap:8,fontSize:13,marginBottom:14,cursor:'pointer'}}>
          <input type="checkbox" checked={deleteConfirmed} onChange={e=>setDeleteConfirmed(e.target.checked)} style={{marginTop:2}} />
          <span>I understand this is permanent.</span>
        </label>
        <button
          className="btn btn-full"
          style={{background:'var(--danger)',color:'#fff'}}
          disabled={!deleteConfirmed || deleting}
          onClick={deleteProfile}
        >
          <Trash2 size={16} /> {deleting ? 'Deleting...' : 'Delete permanently'}
        </button>
      </div>
    </div>
  )
}
