import React, { useState, useEffect, useRef } from 'react'
import SignedImage from '../components/SignedImage'
import { supabase } from '../supabase'
import { formatHeightFromInches } from '../constants/profileOptions'

const TABS = ['About', 'Photos', 'Career', 'Education', 'Family', 'Horoscope', 'Looking For']

// Sticky tab-bar ki height (px) — scrollspy rootMargin aur section
// scroll-margin-top dono isi value se calculate hote hain, taaki jab
// kisi section pe scroll/click ho, woh sticky bar ke peeche chhupe nahi.
const TAB_BAR_OFFSET = 52

export default function ProfileView({ match: m, viewerIsPremium, viewerProfileId, myAction, introSent, onSetAction, onSendIntro, onBack }) {
  const [tab, setTab] = useState('About')
  const [showIntroChoice, setShowIntroChoice] = useState(false)
  const [introJustSent, setIntroJustSent] = useState(false)
  const [photos, setPhotos] = useState(null) // null = not loaded yet
  const sectionRefs = useRef({})
  const isClickScrolling = useRef(false)

  // Profile Visits — ek baar record karte hain jab yeh profile khula
  // (Activity tab ke "Profile Visits" stat ke liye). Fire-and-forget,
  // rendering ko block nahi karta. unique(profile_id, viewer_profile_id)
  // constraint hai, isliye repeat visits sirf viewed_at update karte hain,
  // count double nahi hota.
  useEffect(() => {
    if (!viewerProfileId || !m.id || viewerProfileId === m.id) return
    supabase.from('profile_views')
      .upsert({ profile_id: m.id, viewer_profile_id: viewerProfileId, viewed_at: new Date().toISOString() },
        { onConflict: 'profile_id,viewer_profile_id' })
      .then(({ error }) => { if (error) console.error('profile_views upsert failed:', error.message) })
  }, [m.id, viewerProfileId])

  // Photos tab ke liye — sirf jab profile khulta hai tab lazily fetch
  // karte hain (Profile + Secondary dono slots), Dashboard ke matches-list
  // load ko bulk photo-join se bhari nahi karna.
  useEffect(() => {
    if (!m.id) return
    supabase.from('photos').select('*').eq('profile_id', m.id)
      .then(({ data, error }) => { if (!error) setPhotos(data || []) })
  }, [m.id])

  // Scrollspy — jaise jaise user neeche scroll karta hai, upar ka tab bar
  // khud ba khud us section par highlight ho jaata hai jo abhi viewport
  // ke upar hisse mein dikh raha hai. Click se bhi tab badal sakte hain
  // (us case mein smooth-scroll khatam hone tak observer ko ignore karte
  // hain, taaki scroll-in-progress ke beech wala section galti se select
  // na ho jaaye).
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (isClickScrolling.current) return
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const t = entry.target.dataset.tab
          if (t) setTab(t)
        }
      })
    }, { rootMargin: `-${TAB_BAR_OFFSET + 10}px 0px -65% 0px`, threshold: 0 })

    Object.values(sectionRefs.current).forEach(el => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [photos]) // photos load hone ke baad Photos section ki height badalti hai, re-observe

  const goToTab = (t) => {
    setTab(t)
    const el = sectionRefs.current[t]
    if (!el) return
    isClickScrolling.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Smooth scroll ke khatam hone ka koi reliable event nahi hai, isliye
    // ek reasonable timeout ke baad scrollspy wapas chalu kar dete hain.
    setTimeout(() => { isClickScrolling.current = false }, 700)
  }

  const setSectionRef = (t) => (el) => { sectionRefs.current[t] = el }

  const matchedCount = (m.matchStrengths || []).length
  const totalCount = matchedCount + (m.matchNeedsDiscussion || []).length

  const handleIntro = (type) => {
    onSendIntro(type)
    setShowIntroChoice(false)
    setIntroJustSent(true)
  }

  const requestSent = introSent || introJustSent
  const firstName = m.full_name?.split(' ')[0] || 'them'

  const incomeLabel = (min, max, currency) => {
    if (min == null && max == null) return null
    const symbol = currency === 'USD' ? '$' : '₹'
    const fmt = v => symbol + Number(v).toLocaleString(currency === 'USD' ? 'en-US' : 'en-IN')
    return `${fmt(min || 0)} - ${fmt(max || 0)}`
  }

  return (
    <div style={{minHeight:'100vh',background:'#fff',paddingBottom:40}}>
      <div style={{position:'relative',width:'100%',aspectRatio:'4/5',background:'#e0e0e0'}}>
        {m.primaryPhotoPath
          ? <SignedImage path={m.primaryPhotoPath} alt="" style={{width:'100%',height:'100%',objectFit:'cover', filter: viewerIsPremium ? 'none' : 'blur(10px)'}} />
          : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:48}}>👤</div>
        }
        {!viewerIsPremium && m.primaryPhotoPath && (
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.15)'}}>
            <span style={{fontSize:32}}>🔒</span>
          </div>
        )}
        <div style={{position:'absolute',inset:0,background:'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 40%)'}} />
        <button onClick={onBack} style={{position:'absolute',top:16,left:16,width:36,height:36,borderRadius:'50%',background:'rgba(0,0,0,0.4)',border:'none',color:'#fff',fontSize:18,cursor:'pointer'}}>←</button>
        {photos !== null && photos.length > 0 && (
          <div style={{position:'absolute',top:16,right:16,padding:'6px 12px',borderRadius:20,background:'rgba(0,0,0,0.4)',color:'#fff',fontSize:12,display:'flex',alignItems:'center',gap:4}}>
            🖼️ {photos.length}
          </div>
        )}
        <div style={{position:'absolute',bottom:16,left:20,right:20,color:'#fff'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:24,fontWeight:600}}>{m.full_name}, {m.age}</span>
            {typeof m.matchScore === 'number' && (
              <span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,background:'rgba(255,255,255,0.9)', color: m.matchScore>=70?'#16a34a':m.matchScore>=40?'#b45309':'#555'}}>
                {m.matchScore}% match
              </span>
            )}
          </div>
          <div style={{fontSize:13,opacity:0.9,marginTop:2}}>{m.city}{m.state ? ', ' + m.state : ''}</div>
        </div>
      </div>

      <div style={{maxWidth:480,margin:'0 auto',padding:'0 20px'}}>

        <div style={{display:'flex',gap:6,margin:'16px 0'}}>
          <button className={myAction==='like' ? 'btn btn-black btn-sm' : 'btn btn-outline btn-sm'} style={{flex:1}}
            onClick={()=>onSetAction('like')}>👍 Like</button>
          <button className={myAction==='super_like' ? 'btn btn-black btn-sm' : 'btn btn-outline btn-sm'} style={{flex:1}}
            onClick={()=>onSetAction('super_like')}>⭐ Super Like</button>
          <button className="btn btn-outline btn-sm" style={{flex:1,color:'#dc2626',borderColor:'#dc2626'}}
            onClick={()=>onSetAction('dislike')}>👎 Dislike</button>
        </div>

        {totalCount > 0 && (
          <div className="notice" style={{marginBottom:16}}>
            You match {matchedCount}/{totalCount} preferences
          </div>
        )}

        {/* Sticky tab bar — scroll ke saath upar chipka rehta hai, aur
            jaise jaise neeche section scroll hote hain, upar wala
            IntersectionObserver effect isi ke "active" tab ko update
            karta rehta hai. */}
        <div style={{position:'sticky',top:0,zIndex:20,background:'#fff',display:'flex',gap:4,borderBottom:'1px solid rgba(0,0,0,0.08)',marginBottom:16,overflowX:'auto'}}>
          {TABS.map(t=>(
            <div key={t} onClick={()=>goToTab(t)}
              style={{padding:'14px 4px 10px',marginRight:18,fontSize:13,fontWeight:600,whiteSpace:'nowrap',cursor:'pointer',
                color: tab===t ? '#000' : '#8e8e8e', borderBottom: tab===t ? '2px solid #000' : '2px solid transparent'}}>
              {t}
            </div>
          ))}
        </div>

        <div ref={setSectionRef('About')} data-tab="About" style={{scrollMarginTop:TAB_BAR_OFFSET}}>
          {!viewerIsPremium && (
            <div style={{background:'#fff8e1',border:'1px solid #fde68a',borderRadius:10,padding:'10px 12px',marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:600,color:'#b45309',marginBottom:6}}>🔒 Premium members can see:</div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0'}}>
                <span style={{color:'#8e8e8e'}}>Photo (unblurred)</span>
                <span style={{fontWeight:500,filter:'blur(3px)',userSelect:'none'}}>••••••••</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0'}}>
                <span style={{color:'#8e8e8e'}}>Company Name</span>
                <span style={{fontWeight:500,filter:'blur(3px)',userSelect:'none'}}>••••••••</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0'}}>
                <span style={{color:'#8e8e8e'}}>College Name</span>
                <span style={{fontWeight:500,filter:'blur(3px)',userSelect:'none'}}>••••••••</span>
              </div>
              <button className="btn btn-black btn-sm" style={{marginTop:8,width:'100%'}}>👑 Go Premium Now</button>
            </div>
          )}

          {m.about_me && (
            <div className="card" style={{marginBottom:12}}>
              <div className="section-label" style={{marginBottom:8}}>About {firstName}</div>
              <p style={{fontSize:13,lineHeight:1.7,color:'#333'}}>{m.about_me}</p>
            </div>
          )}

          <FactCard fields={[
            ['Height', m.height], ['Weight', m.weight], ['Complexion', m.complexion], ['Body Type', m.body_type],
            ['Marital Status', m.marital_status], ['Nationality', m.nationality], ['Sub-Caste', m.sub_caste],
            ['Mother Tongue', m.mother_tongue],
          ]} />

          <FactCard title="Lifestyle" fields={[
            ['Diet', m.diet], ['Smoking', m.smoking], ['Drinking', m.drinking],
            ['Relocation Preference', m.relocation_preference],
          ]} />

          {m.matchStrengths && m.matchStrengths.length > 0 && (
            <div className="card" style={{marginBottom:12}}>
              <div className="section-label" style={{marginBottom:8,color:'#16a34a'}}>Strong Matches</div>
              {m.matchStrengths.map((s,i)=>(
                <div key={i} style={{fontSize:13,color:'#333',marginBottom:4}}>✓ {s}</div>
              ))}
            </div>
          )}
          {m.matchNeedsDiscussion && m.matchNeedsDiscussion.length > 0 && (
            <div className="card" style={{marginBottom:12}}>
              <div className="section-label" style={{marginBottom:8,color:'#b45309'}}>Needs Discussion</div>
              {m.matchNeedsDiscussion.map((s,i)=>(
                <div key={i} style={{fontSize:13,color:'#333',marginBottom:4}}>△ {s}</div>
              ))}
            </div>
          )}
        </div>

        <div ref={setSectionRef('Photos')} data-tab="Photos" style={{scrollMarginTop:TAB_BAR_OFFSET,minHeight:40}}>
          {photos === null ? (
            <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>Loading...</div>
          ) : photos.length === 0 ? (
            <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e',fontSize:13}}>No photos yet</div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:10,marginBottom:12}}>
              {photos.map(p => (
                <div key={p.id} style={{position:'relative',aspectRatio:'3/4',borderRadius:12,overflow:'hidden',background:'#e0e0e0'}}>
                  <SignedImage path={p.storage_path} alt="" style={{width:'100%',height:'100%',objectFit:'cover', filter: viewerIsPremium ? 'none' : 'blur(10px)'}} />
                  {!viewerIsPremium && (
                    <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.15)'}}>
                      <span style={{fontSize:24}}>🔒</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div ref={setSectionRef('Career')} data-tab="Career" style={{scrollMarginTop:TAB_BAR_OFFSET}}>
          <FactCard title="Career" fields={[
            ['Company', viewerIsPremium ? m.employer : (m.employer ? '🔒 Premium only' : null)],
            ['Annual Income', m.annual_income],
          ]} />
        </div>

        <div ref={setSectionRef('Education')} data-tab="Education" style={{scrollMarginTop:TAB_BAR_OFFSET}}>
          <FactCard title="Education" fields={[
            ['Highest Education', m.education],
            ['College', viewerIsPremium ? m.college_name : (m.college_name ? '🔒 Premium only' : null)],
          ]} />
        </div>

        <div ref={setSectionRef('Family')} data-tab="Family" style={{scrollMarginTop:TAB_BAR_OFFSET}}>
          <div className="card" style={{marginBottom:12}}>
            <div className="section-label" style={{marginBottom:12}}>Family</div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {m.father_profession && (
                <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                  <span style={{fontSize:18}}>👨</span>
                  <div>
                    <div style={{fontSize:11,color:'#8e8e8e'}}>Father</div>
                    <div style={{fontSize:13,fontWeight:500}}>{m.father_profession}</div>
                  </div>
                </div>
              )}
              {m.mother_profession && (
                <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                  <span style={{fontSize:18}}>👩</span>
                  <div>
                    <div style={{fontSize:11,color:'#8e8e8e'}}>Mother</div>
                    <div style={{fontSize:13,fontWeight:500}}>{m.mother_profession}</div>
                  </div>
                </div>
              )}
              {(m.brothers_count || m.sisters_count) && (
                <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                  <span style={{fontSize:18}}>👨‍👩‍👧‍👦</span>
                  <div>
                    <div style={{fontSize:11,color:'#8e8e8e'}}>Siblings</div>
                    {m.brothers_count ? <div style={{fontSize:13,fontWeight:500}}>{m.brothers_count} Brother(s) ({m.brothers_married_count || 0} Married)</div> : null}
                    {m.sisters_count ? <div style={{fontSize:13,fontWeight:500}}>{m.sisters_count} Sister(s) ({m.sisters_married_count || 0} Married)</div> : null}
                  </div>
                </div>
              )}
            </div>
          </div>
          <FactCard fields={[
            ['Family Type', m.family_type], ['Family Values', m.family_values], ['Family City', m.family_city],
          ]} />
        </div>

        <div ref={setSectionRef('Horoscope')} data-tab="Horoscope" style={{scrollMarginTop:TAB_BAR_OFFSET}}>
          <FactCard fields={[
            ['Manglik', m.manglik], ['Kundli Available', m.kundli_available],
            ['Date of Birth', m.age ? m.age + ' years' : null],
            ['Religion', m.religion], ['Gotra', m.gotra], ['Community / Caste', m.community],
          ]} />
        </div>

        <div ref={setSectionRef('Looking For')} data-tab="Looking For" style={{scrollMarginTop:TAB_BAR_OFFSET}}>
          <div style={{textAlign:'center',padding:'10px 0 18px'}}>
            <div style={{fontSize:16,fontWeight:600}}>Who is {firstName} looking for...</div>
            <div style={{fontSize:12,color:'#8e8e8e',marginTop:4}}>These are their desired partner preferences</div>
          </div>
          <FactCard title="Basic Details" fields={[
            ['Age', (m.partner_age_min || m.partner_age_max) ? `${m.partner_age_min || '18'} - ${m.partner_age_max || '70'} yrs` : null],
            ['Height', (m.partner_height_min && m.partner_height_max) ? `${formatHeightFromInches(m.partner_height_min)} - ${formatHeightFromInches(m.partner_height_max)}` : null],
            ['Location Preference', m.partner_location],
            ['City Preference', m.partner_city_preference],
            ['State Preference', m.partner_state_preference],
            ['Country Preference', m.partner_country_preference],
          ]} />
          <FactCard title="Education & Occupation" fields={[
            ['Education Level', (m.partner_education_level_preferences || []).join(', ') || null],
            ['Income', incomeLabel(m.partner_income_min, m.partner_income_max, m.partner_income_currency)],
          ]} />
          <FactCard title="Religion & Ethnicity" fields={[
            ['Religion', m.partner_religion && m.partner_religion !== 'Any' ? m.partner_religion : null],
            ['Community', (m.partner_community_ids || []).join(', ') || null],
          ]} />
          <FactCard title="Additional Preferences" fields={[
            ['Notes', m.partner_notes],
          ]} />
        </div>

        <div style={{marginTop:20,paddingBottom:20}}>
          {requestSent ? (
            <div className="notice" style={{color:'#16a34a'}}>✓ Request sent — our relationship manager will contact you to coordinate.</div>
          ) : showIntroChoice ? (
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-black" style={{flex:1}} onClick={()=>handleIntro('talk')}>Request to Talk</button>
              <button className="btn btn-black" style={{flex:1}} onClick={()=>handleIntro('meeting')}>Request a Meeting</button>
            </div>
          ) : (
            <button className="btn btn-outline btn-full" onClick={()=>setShowIntroChoice(true)}>Request to Talk / Meet</button>
          )}
        </div>
      </div>
    </div>
  )
}

function FactCard({ title, fields }) {
  const visible = fields.filter(([, v]) => v)
  if (visible.length === 0) return null
  return (
    <div className="card" style={{marginBottom:12}}>
      {title && <div className="section-label" style={{marginBottom:8}}>{title}</div>}
      {visible.map(([k,v]) => (
        <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid rgba(0,0,0,0.05)',fontSize:13}}>
          <span style={{color:'#8e8e8e'}}>{k}</span>
          <span style={{fontWeight:500,textAlign:'right'}}>{v}</span>
        </div>
      ))}
    </div>
  )
}
