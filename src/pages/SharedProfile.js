import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'

// Yeh page KISI KO BHI (bina login ke) khulti hai jab woh secure share
// link kholega. Data seedha "get_shared_profile" Postgres function se
// aata hai (SQL migration mein bana hai) — yeh function khud check
// karta hai ki link valid/expired/revoked hai ya nahi, aur sirf MASKED
// info deta hai (naam bhi "Priya S." jaisa masked hota hai).

export default function SharedProfile() {
  const { token } = useParams()
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSharedProfile()
  }, [token])

  const loadSharedProfile = async () => {
    const { data, error: err } = await supabase.rpc('get_shared_profile', { p_token: token })
    if (err) {
      setError(err.message.includes('invalid') || err.message.includes('expired')
        ? 'This link has expired or is no longer available. Please ask LOVEKUSH to share a fresh link.'
        : 'Could not load this profile: ' + err.message)
    } else if (!data || data.length === 0) {
      setError('This link is invalid.')
    } else {
      setProfile(data[0])
    }
    setLoading(false)
  }

  if (loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{fontSize:13,opacity:0.5}}>Loading...</div>
    </div>
  )

  if (error) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,padding:20,textAlign:'center'}}>
      <div style={{fontSize:40}}>🔒</div>
      <div style={{fontSize:16,fontWeight:600}}>Link Not Available</div>
      <div style={{fontSize:13,color:'#8e8e8e',maxWidth:320}}>{error}</div>
    </div>
  )

  const rows = [
    ['Age', profile.age ? profile.age + ' years' : null],
    ['Height', profile.height],
    ['City', [profile.city, profile.state].filter(Boolean).join(', ')],
    ['Religion', profile.religion],
    ['Community', profile.community],
    ['Education', profile.education],
    ['Occupation', profile.occupation],
    ['Annual Income', profile.annual_income],
    ['Diet', profile.diet],
    ['Complexion', profile.complexion],
  ].filter(([,v])=>v)

  return (
    <div style={{minHeight:'100vh',background:'#fff'}}>
      <div style={{maxWidth:480,margin:'0 auto',padding:'40px 20px'}}>
        <div style={{textAlign:'center',marginBottom:30}}>
          <div style={{fontFamily:'serif',fontSize:22,letterSpacing:'0.3em'}}>LOVEKUSH</div>
          <div style={{fontSize:10,opacity:0.5,letterSpacing:'0.15em',marginTop:4}}>GLOBAL MATCHMAKING SERVICES</div>
        </div>

        <div style={{background:'#f9f9f9',borderRadius:16,padding:24}}>
          <div style={{fontSize:20,fontWeight:600,marginBottom:4}}>{profile.masked_name}</div>
          <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20,fontFamily:'monospace'}}>{profile.profile_code}</div>

          {rows.map(([k,v])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid rgba(0,0,0,0.06)',fontSize:14}}>
              <span style={{color:'#8e8e8e'}}>{k}</span>
              <span style={{fontWeight:500}}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{marginTop:20,fontSize:12,color:'#8e8e8e',textAlign:'center',lineHeight:1.6}}>
          Contact details, photos and full information are shared confidentially.<br/>
          For complete profile details, please contact LOVEKUSH Global Matchmaking Services.
        </div>

        <div style={{marginTop:16,fontSize:10,color:'#bbb',textAlign:'center'}}>
          This link expires on {new Date(profile.expires_at).toLocaleDateString('en-IN')} • Confidential, not for public distribution
        </div>
      </div>
    </div>
  )
}
