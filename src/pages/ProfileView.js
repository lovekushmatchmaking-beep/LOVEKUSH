import React, { useState } from 'react'
import SignedImage from '../components/SignedImage'

const TABS = ['About', 'Career & Education', 'Family & Lifestyle']

export default function ProfileView({ match: m, viewerIsPremium, myAction, introSent, onSetAction, onSendIntro, onBack }) {
  const [tab, setTab] = useState('About')
  const [showIntroChoice, setShowIntroChoice] = useState(false)
  const [introJustSent, setIntroJustSent] = useState(false)

  const matchedCount = (m.matchStrengths || []).length
  const totalCount = matchedCount + (m.matchNeedsDiscussion || []).length

  const handleIntro = (type) => {
    onSendIntro(type)
    setShowIntroChoice(false)
    setIntroJustSent(true)
  }

  const requestSent = introSent || introJustSent

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

      <div style={{maxWidth:480,margin:'0 auto',padding:'16px 20px'}}>

        <div style={{display:'flex',gap:6,marginBottom:16}}>
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

        <div style={{display:'flex',gap:4,borderBottom:'1px solid rgba(0,0,0,0.08)',marginBottom:16,overflowX:'auto'}}>
          {TABS.map(t=>(
            <div key={t} onClick={()=>setTab(t)}
              style={{padding:'10px 4px',marginRight:18,fontSize:13,fontWeight:600,whiteSpace:'nowrap',cursor:'pointer',
                color: tab===t ? '#000' : '#8e8e8e', borderBottom: tab===t ? '2px solid #000' : '2px solid transparent'}}>
              {t}
            </div>
          ))}
        </div>

        {tab === 'About' && (
          <div>
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
                <div className="section-label" style={{marginBottom:8}}>About {m.full_name?.split(' ')[0]}</div>
                <p style={{fontSize:13,lineHeight:1.7,color:'#333'}}>{m.about_me}</p>
              </div>
            )}

            <FactCard fields={[
              ['Height', m.height], ['Weight', m.weight], ['Complexion', m.complexion], ['Body Type', m.body_type],
              ['Marital Status', m.marital_status], ['Nationality', m.nationality],
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
        )}

        {tab === 'Career & Education' && (
          <div>
            <FactCard title="Career" fields={[
              ['Occupation', m.occupation],
              ['Company', viewerIsPremium ? m.employer : (m.employer ? '🔒 Premium only' : null)],
              ['Annual Income', m.annual_income],
            ]} />
            <FactCard title="Education" fields={[
              ['Highest Education', m.education],
              ['College', viewerIsPremium ? m.college_name : (m.college_name ? '🔒 Premium only' : null)],
            ]} />
          </div>
        )}

        {tab === 'Family & Lifestyle' && (
          <div>
            <FactCard title="Religion & Community" fields={[
              ['Religion', m.religion], ['Community / Caste', m.community], ['Sub-Caste', m.sub_caste],
              ['Gotra', m.gotra], ['Manglik', m.manglik], ['Mother Tongue', m.mother_tongue],
            ]} />
            <FactCard title="Family" fields={[
              ['Family Type', m.family_type], ['Family Values', m.family_values],
            ]} />
            <FactCard title="Lifestyle" fields={[
              ['Diet', m.diet], ['Smoking', m.smoking], ['Drinking', m.drinking],
              ['Relocation Preference', m.relocation_preference],
            ]} />
          </div>
        )}

        <div style={{marginTop:20}}>
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
