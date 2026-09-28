import React, { useState } from 'react'
import SignedImage from '../components/SignedImage'

// Jeevansathi ke "Activity" tab jaisa — Profile Visits / Shortlisted /
// Interests Received stat tiles + Received/Sent/Accepted lists.
// LOVEKUSH me "Contact Views" ka koi concept nahi hai (phone number kisi
// aur ko dikhta hi nahi), isliye uski jagah "Interests Received" hai —
// aur koi explicit Accept/Decline action nahi hai (RM-mediated model),
// isliye "Accepted" = mutual like (dono taraf se like/super_like).

const ACTIVE_ACTIONS = ['like', 'super_like']

export default function ActivityTab({ myActions, receivedActions, matches, profileViewsCount, onViewProfile }) {
  const [tab, setTab] = useState('Received')

  const sentActions = (myActions || []).filter(a => ACTIVE_ACTIONS.includes(a.action))
  const shortlistedCount = sentActions.length

  const sentIds = new Set(sentActions.map(a => a.target_profile_id))
  const receivedIds = new Set((receivedActions || []).map(a => a.actor_profile_id))
  const acceptedIds = [...sentIds].filter(id => receivedIds.has(id))

  const resolveFromMatches = (profileId) => (matches || []).find(m => m.id === profileId) || null

  const sentRows = sentActions.map(a => {
    const p = resolveFromMatches(a.target_profile_id)
    return { id: a.target_profile_id, action: a.action, profile: p }
  })

  const acceptedRows = acceptedIds.map(id => {
    const p = resolveFromMatches(id)
    return { id, profile: p }
  })

  return (
    <div>
      <h2 style={{fontFamily:'Cormorant Garamond',fontSize:26,fontWeight:300,marginBottom:20}}>Activity</h2>

      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-num">{profileViewsCount}</span>
          <span className="stat-label">Profile Visits</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{shortlistedCount}</span>
          <span className="stat-label">Shortlisted Profiles</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{(receivedActions || []).length}</span>
          <span className="stat-label">Interests Received</span>
        </div>
      </div>

      <div className="section-label" style={{marginBottom:10}}>Interests</div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        {['Received', 'Accepted', 'Sent'].map(t => (
          <div key={t} className={'radio-option ' + (tab===t?'selected':'')} onClick={()=>setTab(t)} style={{flex:1,textAlign:'center'}}>
            {t}
          </div>
        ))}
      </div>

      {tab === 'Received' && (
        (receivedActions || []).length === 0 ? (
          <EmptyState text="Abhi tak koi interest nahi mila." />
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {receivedActions.map(r => (
              <ActivityRow key={r.actor_profile_id}
                name={r.actorProfile?.full_name || 'Profile'}
                sub={r.actorProfile ? `${r.actorProfile.age || ''} years • ${r.actorProfile.city || ''}` : ''}
                photoPath={r.actorPhotoPath}
                badge={r.action === 'super_like' ? '⭐ Super Like' : '👍 Like'}
                onClick={() => r.actorProfile && onViewProfile({ ...r.actorProfile, primaryPhotoPath: r.actorPhotoPath })} />
            ))}
          </div>
        )
      )}

      {tab === 'Accepted' && (
        acceptedRows.length === 0 ? (
          <EmptyState text="Koi mutual interest nahi hai abhi." />
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {acceptedRows.map(r => (
              <ActivityRow key={r.id}
                name={r.profile?.full_name || 'Profile'}
                sub={r.profile ? `${r.profile.age || ''} years • ${r.profile.city || ''}` : ''}
                photoPath={r.profile?.primaryPhotoPath}
                badge="✓ Mutual"
                onClick={() => r.profile && onViewProfile(r.profile)} />
            ))}
          </div>
        )
      )}

      {tab === 'Sent' && (
        sentRows.length === 0 ? (
          <EmptyState text="Aapne abhi tak koi interest nahi bheja." />
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {sentRows.map(r => (
              <ActivityRow key={r.id}
                name={r.profile?.full_name || 'Profile'}
                sub={r.profile ? `${r.profile.age || ''} years • ${r.profile.city || ''}` : ''}
                photoPath={r.profile?.primaryPhotoPath}
                badge={r.action === 'super_like' ? '⭐ Super Like' : '👍 Like'}
                onClick={() => r.profile && onViewProfile(r.profile)} />
            ))}
          </div>
        )
      )}
    </div>
  )
}

function ActivityRow({ name, sub, photoPath, badge, onClick }) {
  return (
    <div style={{display:'flex',gap:12,alignItems:'center',padding:'10px 12px',background:'#f5f5f5',borderRadius:12,cursor: onClick ? 'pointer' : 'default'}}
      onClick={onClick}>
      <div style={{width:48,height:48,borderRadius:'50%',background:'#e0e0e0',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
        {photoPath
          ? <SignedImage path={photoPath} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
          : <span style={{fontSize:18}}>👤</span>
        }
      </div>
      <div style={{flex:1}}>
        <div style={{fontWeight:600,fontSize:14}}>{name}</div>
        {sub && <div style={{fontSize:12,color:'#8e8e8e'}}>{sub}</div>}
      </div>
      <div style={{fontSize:11,color:'#4a5568',flexShrink:0}}>{badge}</div>
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e'}}>
      <div style={{fontSize:36,marginBottom:10}}>💌</div>
      <div style={{fontSize:13}}>{text}</div>
    </div>
  )
}
