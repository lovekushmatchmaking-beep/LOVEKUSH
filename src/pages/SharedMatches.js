import React, { useState, useEffect } from 'react'
import { Lock, ThumbsUp, Check, ThumbsDown } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { BrandLockup } from '../components/BrandLogo'
import { shareSafeAboutMe } from '../utils/shareProfile'
import { markShareLinkInterest, markShareLinkNotInterested } from '../utils/shareLinks'
import ZoomablePhoto from '../components/ZoomablePhoto'

// Ek hi link mein kai matches (Admin "Find Matches" se chune hue) — bina
// login ke khulta hai. SharedProfile jaisa hi: data "get_shared_bundle"
// Postgres function se aata hai jo expiry/revoke khud check karta hai aur
// naam masked hota hai ("A. Kushwaha" format), par dono saved photos
// (zoom karke) ab dikhti hain (Aryan, 2026-10-10 — pehle kabhi nahi dikhti thi).

export default function SharedMatches() {
  const { token } = useParams()
  const [profiles, setProfiles] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  // token -> null | 'int-sending' | 'int-done' | 'int-error' | 'ni-sending' | 'ni-done'
  // Client (no login) ke action ko server mein likhta hai (audit gap, 2026-10-05).
  const [actionStates, setActionStates] = useState({})

  const markInterested = async (tok) => {
    if (actionStates[tok]) return
    setActionStates(prev => ({ ...prev, [tok]: 'int-sending' }))
    try {
      await markShareLinkInterest(tok)
      setActionStates(prev => ({ ...prev, [tok]: 'int-done' }))
    } catch (err) {
      setActionStates(prev => ({ ...prev, [tok]: 'int-error' }))
    }
  }

  const markNotInterested = async (tok) => {
    if (actionStates[tok]) return
    setActionStates(prev => ({ ...prev, [tok]: 'ni-sending' }))
    try {
      await markShareLinkNotInterested(tok)
      setActionStates(prev => ({ ...prev, [tok]: 'ni-done' }))
    } catch (err) {
      // Silently ignore errors — client doesn't need to know
      setActionStates(prev => ({ ...prev, [tok]: 'ni-done' }))
    }
  }

  useEffect(() => {
    const load = async () => {
      const { data, error: err } = await supabase.rpc('get_shared_bundle', { p_token: token })
      if (err) {
        setError(err.message.includes('invalid') || err.message.includes('expired')
          ? 'This link has expired or is no longer available. Please ask LOVEKUSH to share a fresh link.'
          : 'Could not load these profiles: ' + err.message)
      } else if (!data || data.length === 0) {
        setError('This link is invalid.')
      } else {
        setProfiles(data)
        document.title = `${data.length} Matches — LOVEKUSH`
      }
      setLoading(false)
    }
    load()
  }, [token])

  if (loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{fontSize:13,opacity:0.5}}>Loading...</div>
    </div>
  )

  if (error) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,padding:20,textAlign:'center'}}>
      <div className="empty-state-icon" style={{margin:0}}><Lock size={28} /></div>
      <div style={{fontSize:16,fontWeight:600}}>Link Not Available</div>
      <div style={{fontSize:13,color:'#8e8e8e',maxWidth:320}}>{error}</div>
    </div>
  )

  const expiresAt = profiles.reduce((min, p) => (!min || new Date(p.expires_at) < min ? new Date(p.expires_at) : min), null)

  return (
    <div style={{minHeight:'100vh',background:'#fff'}}>
      <div style={{maxWidth:480,margin:'0 auto',padding:'40px 20px'}}>
        <div style={{textAlign:'center',marginBottom:12}}>
          <BrandLockup size={30} />
        </div>
        <div style={{textAlign:'center',fontSize:14,color:'#555',marginBottom:24}}>
          {profiles.length} {profiles.length === 1 ? 'match' : 'matches'} handpicked for you
        </div>

        {/* Same "suggested for" context as SharedProfile — every row in a
            bundle carries the same client_profile_id, so this only needs
            showing once (audit 2026-10-08, P1 #12). */}
        {profiles[0]?.client_masked_name && (
          <div style={{fontSize:12,color:'#8e8e8e',textAlign:'center',marginBottom:14}}>
            Suggested for <strong style={{color:'#111'}}>{profiles[0].client_full_name || profiles[0].client_masked_name}</strong>
            {(profiles[0].client_age || profiles[0].client_city) && (
              <> · {[profiles[0].client_age ? profiles[0].client_age + ' years' : null, profiles[0].client_city].filter(Boolean).join(', ')}</>
            )}
          </div>
        )}

        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {profiles.map(p => {
            // Puri biodata — contact chhod kar — SharedProfile.js (single
            // profile share) jaisa hi split, reuse-first (Aryan, 2026-10-09).
            const rows = [
              ['Age', p.age ? p.age + ' years' : null],
              ['Height', p.height],
              ['Weight', p.weight],
              ['Marital Status', p.marital_status],
              ['Complexion', p.complexion],
              ['Body Type', p.body_type],
              ['Nationality', p.nationality],
              ['Mother Tongue', p.mother_tongue],
              ['City', [p.city, p.state, p.country].filter(Boolean).join(', ')],
              ['Religion', [p.religion, p.community].filter(Boolean).join(' • ')],
              ['Sub-Caste / Gotra', [p.sub_caste, p.gotra].filter(Boolean).join(' / ')],
              ['Manglik', p.manglik],
              ['Rashi / Nakshatra', [p.rashi, p.nakshatra].filter(Boolean).join(' / ')],
              ['Education', p.education],
              ['Degree', p.degree],
              ['College', p.college_name],
              ['Employer', p.employer],
              ['Profession', p.occupation],
              ['Annual Income', p.annual_income],
              ['Diet', p.diet],
              ['Family Type', p.family_type],
              ["Father's Profession", p.father_profession],
              ["Mother's Profession", p.mother_profession],
              ['Family Financial Status', p.family_financial_status],
            ].filter(([,v])=>v)
            return (
              <div key={p.token} style={{background:'#f9f9f9',borderRadius:16,padding:20}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
                  <div style={{fontSize:18,fontWeight:600}}>{p.full_name || p.masked_name}</div>
                  <div style={{fontSize:11,color:'#8e8e8e',fontFamily:'monospace'}}>{p.profile_code}</div>
                </div>

                {/* Dono saved (already-compressed) photos — tap karke zoom
                    (Aryan, 2026-10-10). Reuses EditPhotos ki wahi photos
                    table/storage. */}
                {(p.photo_path || p.photo_path_2) && (
                  <div style={{display:'flex',gap:10,marginBottom:12}}>
                    {p.photo_path && <ZoomablePhoto path={p.photo_path} alt={p.masked_name} size={90} />}
                    {p.photo_path_2 && <ZoomablePhoto path={p.photo_path_2} alt={p.masked_name} size={90} />}
                  </div>
                )}

                {/* Poora naam (Aryan, 2026-10-09 — share link par full name, sirf
                    contact details nahi). About Me se client-import ka raw note aur
                    koi bhi phone/email hata ke dikhate hain. */}
                {shareSafeAboutMe(p.about_me) && (
                  <div style={{marginBottom:10,fontSize:13,color:'#333',lineHeight:1.5,fontStyle:'italic'}}>"{shareSafeAboutMe(p.about_me)}"</div>
                )}
                {rows.map(([k,v])=>(
                  <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid rgba(0,0,0,0.06)',fontSize:13}}>
                    <span style={{color:'#8e8e8e'}}>{k}</span>
                    <span style={{fontWeight:500,textAlign:'right'}}>{v}</span>
                  </div>
                ))}
                {/* Action buttons — same two-button pattern as SharedProfile
                    (Aryan, 2026-10-10). "Not for me" → neutral "Thanks for
                    browsing" so client never feels bad. */}
                {actionStates[p.token] === 'ni-done' ? (
                  <div style={{marginTop:14,padding:'11px 0',textAlign:'center',fontSize:13,color:'#8e8e8e'}}>
                    Thanks for browsing.
                  </div>
                ) : actionStates[p.token] === 'int-done' ? (
                  <button disabled style={{
                    marginTop:14, width:'100%', padding:'11px 0', borderRadius:10, border:'none',
                    fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    background:'#ecfdf5', color:'#16a34a', cursor:'default',
                  }}>
                    <Check size={14} /> Marked as Interested — we'll be in touch
                  </button>
                ) : (
                  <div style={{marginTop:14,display:'flex',gap:8}}>
                    <button
                      onClick={()=>markInterested(p.token)}
                      disabled={!!actionStates[p.token]}
                      style={{
                        flex:1, padding:'11px 0', borderRadius:10, border:'none',
                        fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                        background:'#111', color:'#fff', cursor: actionStates[p.token] ? 'default' : 'pointer',
                      }}>
                      <ThumbsUp size={14} /> {actionStates[p.token] === 'int-sending' ? 'Sending...' : 'Interested'}
                    </button>
                    <button
                      onClick={()=>markNotInterested(p.token)}
                      disabled={!!actionStates[p.token]}
                      style={{
                        padding:'11px 12px', borderRadius:10, border:'1px solid #e5e5e5',
                        fontSize:12, fontWeight:500, display:'flex', alignItems:'center', gap:5,
                        background:'#fff', color:'#8e8e8e', cursor: actionStates[p.token] ? 'default' : 'pointer',
                      }}
                      title="Not for me">
                      <ThumbsDown size={14} /> Not for me
                    </button>
                  </div>
                )}
                {actionStates[p.token] === 'int-error' && (
                  <div style={{marginTop:6,fontSize:11,color:'#dc2626',textAlign:'center'}}>
                    Could not send. Please try again, or reply with the Profile ID.
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* RM contact — highlighted box (Aryan, 2026-10-10: "bold aur
            highlight hona chahiye, dikhna chahiye acche se"). */}
        <div style={{marginTop:20,borderRadius:12,border:'1.5px solid #e5e5e5',background:'#fafafa',padding:'14px 16px',textAlign:'center'}}>
          <div style={{fontSize:11,color:'#8e8e8e',marginBottom:6,letterSpacing:'0.03em',textTransform:'uppercase',fontWeight:600}}>
            Your Relationship Manager
          </div>
          {(profiles[0]?.rm_name || profiles[0]?.rm_phone || profiles[0]?.rm_email) ? (
            <>
              {profiles[0].rm_name && (
                <div style={{fontSize:16,fontWeight:700,color:'#111',marginBottom:4}}>{profiles[0].rm_name}</div>
              )}
              <div style={{display:'flex',justifyContent:'center',gap:12,flexWrap:'wrap'}}>
                {profiles[0].rm_phone && (
                  <a href={`tel:${profiles[0].rm_phone.replace(/\s+/g,'')}`}
                    style={{fontSize:15,fontWeight:700,color:'#111',textDecoration:'none',letterSpacing:'0.02em'}}>
                    {profiles[0].rm_phone}
                  </a>
                )}
                {profiles[0].rm_email && (
                  <a href={`mailto:${profiles[0].rm_email}`}
                    style={{fontSize:13,fontWeight:500,color:'#555',textDecoration:'none'}}>
                    {profiles[0].rm_email}
                  </a>
                )}
              </div>
            </>
          ) : (
            <div style={{fontSize:13,color:'#555'}}>Please contact LOVEKUSH Matchmaking Services.</div>
          )}
        </div>

        {expiresAt && (
          <div style={{marginTop:16,fontSize:10,color:'#bbb',textAlign:'center'}}>
            This link expires on {expiresAt.toLocaleDateString('en-IN')} • Confidential, not for public distribution
          </div>
        )}
      </div>
    </div>
  )
}
