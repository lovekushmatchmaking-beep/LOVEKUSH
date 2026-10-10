import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { PageHeader, EmptyState } from '../components/ui'
import SignedImage from '../components/SignedImage'
import { maskName } from '../utils/maskName'
import { Eye, Heart, Star, Inbox, Send, HeartHandshake, UserRound } from 'lucide-react'

// Jeevansathi ke "Activity" tab jaisa — Profile Visits / Shortlisted /
// Interests Received stat tiles + Received/Sent/Accepted lists.
// LOVEKUSH me "Contact Views" ka koi concept nahi hai (phone number kisi
// aur ko dikhta hi nahi), isliye uski jagah "Interests Received" hai —
// aur koi explicit Accept/Decline action nahi hai (RM-mediated model),
// isliye "Accepted" = mutual like (dono taraf se like/super_like).

const ACTIVE_ACTIONS = ['like', 'super_like']

export default function ActivityTab({ myActions, receivedActions, matches, profileViewsCount, onViewProfile, onLikeBack }) {
  const [tab, setTab] = useState('Received')

  const sentActions = (myActions || []).filter(a => ACTIVE_ACTIONS.includes(a.action))
  const shortlistedCount = sentActions.length

  const sentIds = new Set(sentActions.map(a => a.target_profile_id))
  const receivedIds = new Set((receivedActions || []).map(a => a.actor_profile_id))
  const acceptedIds = [...sentIds].filter(id => receivedIds.has(id))

  // Sent/Accepted rows pehle sirf current matches list se resolve hote the —
  // jo profile us list mein nahi (filter badla, 100 ki limit), woh khaali
  // "Profile" dikhta tha. Bache hue ids profiles_public_view se le aate hain
  // (photo nahi — woh photo-request approval ke bina nahi dikhti).
  const [extraProfiles, setExtraProfiles] = useState({})
  const sentKey = sentActions.map(a => a.target_profile_id).join(',')
  useEffect(() => {
    const known = new Set((matches || []).map(m => m.id))
    const missing = sentKey ? sentKey.split(',').filter(id => !known.has(id)) : []
    if (missing.length === 0) return
    supabase.from('profiles_public_view').select('*').in('id', missing).then(({ data }) => {
      const map = {}
      ;(data || []).forEach(p => { map[p.id] = p })
      setExtraProfiles(map)
    })
  }, [sentKey, matches])

  const resolveFromMatches = (profileId) => (matches || []).find(m => m.id === profileId) || extraProfiles[profileId] || null

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
      <PageHeader title="Activity" />

      <div className="stats-row" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
        {[
          { icon: Eye, n: profileViewsCount, l: 'Visits' },
          { icon: Heart, n: shortlistedCount, l: 'Liked' },
          { icon: Inbox, n: (receivedActions || []).length, l: 'Interests' },
        ].map(({ icon: Icon, n, l }) => (
          <div key={l} className="stat-card" style={{textAlign:'center',padding:'14px 6px'}}>
            <Icon size={18} className="stat-icon" />
            <span className="stat-num" style={{fontSize:20}}>{n}</span>
            <span className="stat-label">{l}</span>
          </div>
        ))}
      </div>

      <div className="pill-tabs" style={{marginBottom:16}}>
        {[['Received', Inbox], ['Accepted', HeartHandshake], ['Sent', Send]].map(([t, Icon]) => (
          <button key={t} className={'pill-tab ' + (tab===t?'active':'')} onClick={()=>setTab(t)}
            style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            <Icon size={15} /> {t}
          </button>
        ))}
      </div>

      {tab === 'Received' && (
        (receivedActions || []).length === 0 ? (
          <EmptyState icon={Inbox} title="No interests yet" />
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {receivedActions.map(r => (
              <ActivityRow key={r.actor_profile_id}
                name={maskName(r.actorProfile?.full_name) || 'Profile'}
                sub={r.actorProfile ? `${r.actorProfile.age || ''} yrs · ${r.actorProfile.city || ''}` : ''}
                photoPath={r.actorPhotoPath}
                badge={r.action === 'super_like' ? <Star size={18} style={{color:'var(--gold)',fill:'var(--gold)'}} aria-label="Super like" /> : <Heart size={18} style={{color:'var(--primary)',fill:'var(--primary)'}} aria-label="Like" />}
                // Pehle received interest dekhne ke liye profile kholna
                // zaroori tha phir wahan se like karna. Ab seedha yahin se
                // "Like back" — jisko already like kar chuka hai use nahi dikhta.
                action={!sentIds.has(r.actor_profile_id) && onLikeBack ? (
                  <button className="btn btn-primary btn-sm" onClick={(e)=>{ e.stopPropagation(); onLikeBack(r.actor_profile_id) }}>
                    <Heart size={13} /> Like back
                  </button>
                ) : null}
                onClick={() => r.actorProfile && onViewProfile({ ...r.actorProfile, primaryPhotoPath: r.actorPhotoPath })} />
            ))}
          </div>
        )
      )}

      {tab === 'Accepted' && (
        acceptedRows.length === 0 ? (
          <EmptyState icon={HeartHandshake} title="No mutual likes yet" />
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {acceptedRows.map(r => (
              <ActivityRow key={r.id}
                name={maskName(r.profile?.full_name) || 'Profile'}
                sub={r.profile ? `${r.profile.age || ''} yrs · ${r.profile.city || ''}` : ''}
                photoPath={r.profile?.primaryPhotoPath}
                badge={<HeartHandshake size={18} style={{color:'var(--primary)'}} aria-label="Mutual" />}
                onClick={() => r.profile && onViewProfile(r.profile)} />
            ))}
          </div>
        )
      )}

      {tab === 'Sent' && (
        sentRows.length === 0 ? (
          <EmptyState icon={Send} title="Nothing sent yet" />
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {sentRows.map(r => (
              <ActivityRow key={r.id}
                name={maskName(r.profile?.full_name) || 'Profile'}
                sub={r.profile ? `${r.profile.age || ''} yrs · ${r.profile.city || ''}` : ''}
                photoPath={r.profile?.primaryPhotoPath}
                badge={r.action === 'super_like' ? <Star size={18} style={{color:'var(--gold)',fill:'var(--gold)'}} aria-label="Super like" /> : <Heart size={18} style={{color:'var(--primary)',fill:'var(--primary)'}} aria-label="Like" />}
                onClick={() => r.profile && onViewProfile(r.profile)} />
            ))}
          </div>
        )
      )}
    </div>
  )
}

function ActivityRow({ name, sub, photoPath, badge, action, onClick }) {
  return (
    <div className={'list-row' + (onClick ? ' clickable' : '')} style={{display:'flex',gap:12,alignItems:'center'}}
      onClick={onClick}>
      <div className="avatar" style={{width:48,height:48}}>
        {photoPath
          ? <SignedImage path={photoPath} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
          : <UserRound size={20} />
        }
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:600,fontSize:15}}>{name}</div>
        {sub && <div style={{fontSize:12,color:'var(--gray3)'}}>{sub}</div>}
      </div>
      <div style={{flexShrink:0,display:'flex',alignItems:'center',gap:10}}>{badge}{action}</div>
    </div>
  )
}
