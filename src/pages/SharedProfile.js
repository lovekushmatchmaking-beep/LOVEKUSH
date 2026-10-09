import React, { useState, useEffect } from 'react'
import { Lock, ThumbsUp, Check } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { BrandLockup } from '../components/BrandLogo'
import { markShareLinkInterest } from '../utils/shareLinks'

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
  const [interestState, setInterestState] = useState(null) // null | 'sending' | 'done' | 'error'

  const markInterested = async () => {
    if (interestState) return
    setInterestState('sending')
    try {
      await markShareLinkInterest(token)
      setInterestState('done')
    } catch (err) {
      setInterestState('error')
    }
  }

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
      document.title = `${data[0].masked_name || 'Profile'} — LOVEKUSH`
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
      <div className="empty-state-icon" style={{margin:0}}><Lock size={28} /></div>
      <div style={{fontSize:16,fontWeight:600}}>Link Not Available</div>
      <div style={{fontSize:13,color:'#8e8e8e',maxWidth:320}}>{error}</div>
    </div>
  )

  // Puri biodata — contact (phone/email) ke siwa — Aryan, 2026-10-09.
  // Section split BiodataView.js jaisa hi hai, jo member ko khud ki
  // profile dikhata hai; reuse-first, naya layout nahi banaya.
  const personalRows = [
    ['Age', profile.age ? profile.age + ' years' : null],
    ['Height', profile.height],
    ['Weight', profile.weight],
    ['Marital Status', profile.marital_status],
    ['Complexion', profile.complexion],
    ['Body Type', profile.body_type],
    ['Nationality', profile.nationality],
    ['Mother Tongue', profile.mother_tongue],
  ].filter(([,v])=>v)

  const religiousRows = [
    ['Religion', profile.religion],
    ['Community', profile.community],
    ['Sub-Caste', profile.sub_caste],
    ['Gotra', profile.gotra],
    ['Manglik', profile.manglik],
    ['Rashi', profile.rashi],
    ['Nakshatra', profile.nakshatra],
  ].filter(([,v])=>v)

  const careerRows = [
    ['Living In', [profile.city, profile.state, profile.country].filter(Boolean).join(', ')],
    ['Education', profile.education],
    ['Degree', profile.degree],
    ['College', profile.college_name],
    ['Employer', profile.employer],
    ['Profession', profile.occupation],
    ['Annual Income', profile.annual_income],
    ['Diet', profile.diet],
  ].filter(([,v])=>v)

  const familyRows = [
    ['Family Type', profile.family_type],
    ["Father's Profession", profile.father_profession],
    ["Mother's Profession", profile.mother_profession],
    ['Family Financial Status', profile.family_financial_status],
  ].filter(([,v])=>v)

  const renderRows = (rows) => rows.map(([k,v])=>(
    <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid rgba(0,0,0,0.06)',fontSize:14}}>
      <span style={{color:'#8e8e8e'}}>{k}</span>
      <span style={{fontWeight:500,textAlign:'right'}}>{v}</span>
    </div>
  ))

  return (
    <div style={{minHeight:'100vh',background:'#fff'}}>
      <div style={{maxWidth:480,margin:'0 auto',padding:'40px 20px'}}>
        <div style={{textAlign:'center',marginBottom:30}}>
          <BrandLockup size={30} />
        </div>

        {/* "Suggested for" — share_links.client_profile_id already recorded
            who a link was generated for (Model 2, 2026-10-06), it just
            never showed here, so the page read as a stranger's bio with
            no sense it was picked for this specific person (audit
            2026-10-08, P1 #12). */}
        {profile.client_masked_name && (
          <div style={{fontSize:12,color:'#8e8e8e',textAlign:'center',marginBottom:14}}>
            Suggested for <strong style={{color:'#111'}}>{profile.client_masked_name}</strong>
            {(profile.client_age || profile.client_city) && (
              <> · {[profile.client_age ? profile.client_age + ' years' : null, profile.client_city].filter(Boolean).join(', ')}</>
            )}
          </div>
        )}

        <div style={{background:'#f9f9f9',borderRadius:16,padding:24}}>
          <div style={{fontSize:20,fontWeight:600,marginBottom:4}}>{profile.masked_name}</div>
          <div style={{fontSize:12,color:'#8e8e8e',marginBottom:20,fontFamily:'monospace'}}>{profile.profile_code}</div>

          {profile.about_me && (
            <div style={{marginBottom:16,fontSize:13,color:'#333',lineHeight:1.6,fontStyle:'italic'}}>"{profile.about_me}"</div>
          )}

          {personalRows.length > 0 && <>
            <div style={{fontSize:11,fontWeight:600,color:'#8e8e8e',textTransform:'uppercase',letterSpacing:'0.04em',marginTop:4,marginBottom:2}}>Personal Details</div>
            {renderRows(personalRows)}
          </>}
          {religiousRows.length > 0 && <>
            <div style={{fontSize:11,fontWeight:600,color:'#8e8e8e',textTransform:'uppercase',letterSpacing:'0.04em',marginTop:14,marginBottom:2}}>Religious Background</div>
            {renderRows(religiousRows)}
          </>}
          {careerRows.length > 0 && <>
            <div style={{fontSize:11,fontWeight:600,color:'#8e8e8e',textTransform:'uppercase',letterSpacing:'0.04em',marginTop:14,marginBottom:2}}>Education & Career</div>
            {renderRows(careerRows)}
          </>}
          {familyRows.length > 0 && <>
            <div style={{fontSize:11,fontWeight:600,color:'#8e8e8e',textTransform:'uppercase',letterSpacing:'0.04em',marginTop:14,marginBottom:2}}>Family Details</div>
            {renderRows(familyRows)}
          </>}

          <button
            onClick={markInterested}
            disabled={interestState === 'sending' || interestState === 'done'}
            style={{
              marginTop:16, width:'100%', padding:'12px 0', borderRadius:10, border:'none',
              fontSize:14, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              background: interestState === 'done' ? '#ecfdf5' : '#111',
              color: interestState === 'done' ? '#16a34a' : '#fff',
              cursor: interestState === 'done' ? 'default' : 'pointer',
            }}>
            {interestState === 'done'
              ? (<><Check size={14} /> Marked as Interested — we'll be in touch</>)
              : (<><ThumbsUp size={14} /> {interestState === 'sending' ? 'Sending...' : 'Interested'}</>)}
          </button>
          {interestState === 'error' && (
            <div style={{marginTop:6,fontSize:11,color:'#dc2626',textAlign:'center'}}>
              Could not send. Please try again, or contact LOVEKUSH directly.
            </div>
          )}
        </div>

        <div style={{marginTop:20,fontSize:12,color:'#8e8e8e',textAlign:'center',lineHeight:1.6}}>
          Contact details and photos are shared confidentially — please reach your Relationship Manager.<br/>
          {(profile.rm_name || profile.rm_phone || profile.rm_email) ? (
            <>
              {profile.rm_name && <strong style={{color:'#111'}}>{profile.rm_name}</strong>}
              {profile.rm_name && (profile.rm_phone || profile.rm_email) && ' · '}
              {profile.rm_phone && <a href={`tel:${profile.rm_phone.replace(/\s+/g,'')}`} style={{color:'inherit'}}>{profile.rm_phone}</a>}
              {profile.rm_phone && profile.rm_email && ' · '}
              {profile.rm_email && <a href={`mailto:${profile.rm_email}`} style={{color:'inherit'}}>{profile.rm_email}</a>}
            </>
          ) : 'Please contact LOVEKUSH Global Matchmaking Services.'}
        </div>

        <div style={{marginTop:16,fontSize:10,color:'#bbb',textAlign:'center'}}>
          This link expires on {new Date(profile.expires_at).toLocaleDateString('en-IN')} • Confidential, not for public distribution
        </div>
      </div>
    </div>
  )
}
