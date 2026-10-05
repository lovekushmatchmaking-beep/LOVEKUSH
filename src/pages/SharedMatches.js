import React, { useState, useEffect } from 'react'
import { Lock, ThumbsUp, Check } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { BrandLockup } from '../components/BrandLogo'
import { markShareLinkInterest } from '../utils/shareLinks'

// Ek hi link mein kai matches (Admin "Find Matches" se chune hue) — bina
// login ke khulta hai. SharedProfile jaisa hi: data "get_shared_bundle"
// Postgres function se aata hai jo expiry/revoke khud check karta hai aur
// sirf MASKED info deta hai (naam "A. Kushwaha" format, photo kabhi nahi).

export default function SharedMatches() {
  const { token } = useParams()
  const [profiles, setProfiles] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  // token -> 'sending' | 'done' | error message — client (no login) ke
  // "👍 Interested" tap ko server mein likhta hai (audit gap, 2026-10-05):
  // pehle yahan koi action hi nahi tha, sirf "Profile ID reply karo" text.
  const [interest, setInterest] = useState({})

  const markInterested = async (token) => {
    if (interest[token]) return
    setInterest(prev => ({ ...prev, [token]: 'sending' }))
    try {
      await markShareLinkInterest(token)
      setInterest(prev => ({ ...prev, [token]: 'done' }))
    } catch (err) {
      setInterest(prev => ({ ...prev, [token]: 'error' }))
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

        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {profiles.map(p => {
            const rows = [
              ['Age', p.age ? p.age + ' years' : null],
              ['Height', p.height],
              ['City', [p.city, p.state].filter(Boolean).join(', ')],
              ['Religion', [p.religion, p.community].filter(Boolean).join(' • ')],
              ['Education', p.education],
              ['Profession', p.occupation],
              ['Annual Income', p.annual_income],
              ['Diet', p.diet],
            ].filter(([,v])=>v)
            return (
              <div key={p.token} style={{background:'#f9f9f9',borderRadius:16,padding:20}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
                  <div style={{fontSize:18,fontWeight:600}}>{p.masked_name}</div>
                  <div style={{fontSize:11,color:'#8e8e8e',fontFamily:'monospace'}}>{p.profile_code}</div>
                </div>
                {rows.map(([k,v])=>(
                  <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid rgba(0,0,0,0.06)',fontSize:13}}>
                    <span style={{color:'#8e8e8e'}}>{k}</span>
                    <span style={{fontWeight:500,textAlign:'right'}}>{v}</span>
                  </div>
                ))}
                <button
                  onClick={()=>markInterested(p.token)}
                  disabled={interest[p.token] === 'sending' || interest[p.token] === 'done'}
                  style={{
                    marginTop:14, width:'100%', padding:'11px 0', borderRadius:10, border:'none',
                    fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    background: interest[p.token] === 'done' ? '#ecfdf5' : '#111',
                    color: interest[p.token] === 'done' ? '#16a34a' : '#fff',
                    cursor: interest[p.token] === 'done' ? 'default' : 'pointer',
                  }}>
                  {interest[p.token] === 'done'
                    ? (<><Check size={14} /> Marked as Interested — we'll be in touch</>)
                    : (<><ThumbsUp size={14} /> {interest[p.token] === 'sending' ? 'Sending...' : 'Interested'}</>)}
                </button>
                {interest[p.token] === 'error' && (
                  <div style={{marginTop:6,fontSize:11,color:'#dc2626',textAlign:'center'}}>
                    Could not send. Please try again, or reply with the Profile ID.
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{marginTop:20,fontSize:12,color:'#8e8e8e',textAlign:'center',lineHeight:1.6}}>
          Contact details, photos and full information are shared confidentially.<br/>
          Tap "Interested" on a profile, or reply to LOVEKUSH with the Profile ID.
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
