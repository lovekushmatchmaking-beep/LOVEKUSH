import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, generateProfileCode } from '../supabase'

const STEPS = ['Personal','Education','Lifestyle','Family','Preferences','Photos']

const religions = ['Hindu','Muslim','Sikh','Christian','Jain','Buddhist','Other']
const educations = ['Class 10th','Class 12th','Graduation','Post Graduation','Professional Degree','Doctorate']
const incomes = ['No income','Below ₹1L','₹1–3L','₹3–5L','₹5–10L','Above ₹10L']
const diets = ['Vegetarian','Eggetarian','Non-Vegetarian','Vegan','Jain']
const habits = ['Never','Occasionally','Yes']
const famTypes = ['Nuclear','Joint','Extended']
const famValues = ['Traditional','Moderate','Liberal']

export default function CreateProfile({ user }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [photos, setPhotos] = useState(Array(6).fill(null))
  const [photoFiles, setPhotoFiles] = useState(Array(6).fill(null))
  const fileRefs = useRef(Array(6).fill(null).map(()=>React.createRef()))
  const [toast, setToast] = useState('')

  const [form, setForm] = useState({
    full_name:'', gender:'Male', age:'', date_of_birth:'',
    city:'', state:'', country:'India', religion:'Hindu',
    community:'', mother_tongue:'', height:'', body_type:'Average',
    marital_status:'Never Married',
    education:'Graduation', field_of_study:'', occupation:'',
    employer:'', annual_income:'₹3–5L',
    diet:'Vegetarian', smoking:'Never', drinking:'Never',
    hobbies:'', about_me:'',
    family_type:'Nuclear', family_values:'Moderate',
    father_profession:'', mother_profession:'', siblings:'',
    family_city:'',
    partner_age_min:'', partner_age_max:'',
    partner_religion:'Any', partner_location:'Open to relocation',
    partner_education:'Any', partner_notes:''
  })

  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(()=>setToast(''),3000)
  }

  const handlePhotoSelect = (idx, file) => {
    if(!file) return
    const url = URL.createObjectURL(file)
    const newPhotos = [...photos]; newPhotos[idx] = url
    const newFiles = [...photoFiles]; newFiles[idx] = file
    setPhotos(newPhotos); setPhotoFiles(newFiles)
  }

  const removePhoto = (idx) => {
    const newPhotos = [...photos]; newPhotos[idx] = null
    const newFiles = [...photoFiles]; newFiles[idx] = null
    setPhotos(newPhotos); setPhotoFiles(newFiles)
  }

  const completeness = () => {
    let score = 0
    if(form.full_name) score+=10
    if(form.age) score+=5
    if(form.city) score+=5
    if(form.about_me?.length > 30) score+=15
    if(photos.filter(Boolean).length > 0) score+=20
    if(form.education) score+=10
    if(form.occupation) score+=10
    if(form.family_type) score+=10
    if(form.partner_age_min) score+=10
    if(form.hobbies) score+=5
    return Math.min(score, 100)
  }

  const handleSubmit = async () => {
    if(!form.full_name || !form.age || !form.city) {
      showToast('Please fill required fields'); return
    }
    setSaving(true)
    try {
      const code = generateProfileCode(form.gender, form.religion)

      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          profile_code: code,
          ...form,
          age: parseInt(form.age),
          partner_age_min: parseInt(form.partner_age_min) || null,
          partner_age_max: parseInt(form.partner_age_max) || null,
          profile_completeness: completeness()
        })
        .select().single()

      if(pErr) throw pErr

      const photoUploads = photoFiles.filter(Boolean)
      for(let i=0; i<photoUploads.length; i++){
        const file = photoUploads[i]
        const ext = file.name.split('.').pop()
        const path = user.id + "/" + Date.now() + "-" + i + "." + ext
        const { data: uploadData } = await supabase.storage
          .from('lovekush-photos')
          .upload(path, file, { upsert: true })
        if(uploadData) {
          const { data: urlData } = supabase.storage
            .from('lovekush-photos')
            .getPublicUrl(path)
          await supabase.from('photos').insert({
            profile_id: profile.id,
            photo_url: urlData.publicUrl,
            is_primary: i===0,
            photo_type: i===0 ? 'profile' : 'general'
          })
        }
      }

      showToast('Profile created! Code: ' + code)
      setTimeout(()=>navigate('/dashboard'), 1500)
    } catch(err) {
      showToast('Error: ' + err.message)
    }
    setSaving(false)
  }

  const pct = Math.round(((step+1)/STEPS.length)*100)

  return (
    <div style={{minHeight:'100vh',background:'#fff'}}>
      <div className={"toast " + (toast?'show':'')}>{toast}</div>

      <div style={{position:'sticky',top:0,zIndex:90,background:'rgba(255,255,255,0.97)',backdropFilter:'blur(12px)',borderBottom:'1px solid rgba(0,0,0,0.06)',padding:'12px 20px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div style={{fontFamily:'DM Sans',fontSize:14,fontWeight:200,letterSpacing:'0.3em'}}>LOVEKUSH</div>
          <div style={{fontSize:12,color:'#8e8e8e'}}>Step {step+1} of {STEPS.length}</div>
        </div>
        <div className="progress-wrap"><div className="progress-fill" style={{width:pct+'%'}}></div></div>
        <div className="step-tabs">
          {STEPS.map((s,i)=>(
            <div key={s} className={"step-tab " + (i===step?'active':i<step?'done':'')}
              onClick={()=>i<step&&setStep(i)}>
              {i<step?'✓ ':''}{s}
            </div>
          ))}
        </div>
      </div>

      <div className="page-container">

        {step===0 && (
          <div>
            <h2 className="page-title">Personal Details</h2>
            <p className="page-subtitle">Tell us about yourself</p>

            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-input" placeholder="As per records" value={form.full_name}
                onChange={e=>set('full_name',e.target.value)} autoFocus />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Age *</label>
                <input className="form-input" type="number" min="18" max="70" placeholder="25"
                  value={form.age} onChange={e=>set('age',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Gender *</label>
                <select className="form-select" value={form.gender} onChange={e=>set('gender',e.target.value)}>
                  <option>Male</option><option>Female</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Date of Birth</label>
              <input className="form-input" type="date" value={form.date_of_birth}
                onChange={e=>set('date_of_birth',e.target.value)} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">City *</label>
                <input className="form-input" placeholder="Mumbai" value={form.city}
                  onChange={e=>set('city',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">State</label>
                <input className="form-input" placeholder="Maharashtra" value={form.state}
                  onChange={e=>set('state',e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Country</label>
                <input className="form-input" value={form.country}
                  onChange={e=>set('country',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Religion *</label>
                <select className="form-select" value={form.religion} onChange={e=>set('religion',e.target.value)}>
                  {religions.map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Community</label>
                <input className="form-input" placeholder="Optional" value={form.community}
                  onChange={e=>set('community',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Mother Tongue</label>
                <input className="form-input" placeholder="Hindi" value={form.mother_tongue}
                  onChange={e=>set('mother_tongue',e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Height</label>
                <select className="form-select" value={form.height} onChange={e=>set('height',e.target.value)}>
                  <option value="">Select</option>
                  {["Below 5'0\"","5'0\"–5'2\"","5'3\"–5'5\"","5'6\"–5'8\"","5'9\"–6'0\"","Above 6'0\""].map(h=><option key={h}>{h}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Marital Status</label>
                <select className="form-select" value={form.marital_status} onChange={e=>set('marital_status',e.target.value)}>
                  {['Never Married','Divorced','Widowed','Separated'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {step===1 && (
          <div>
            <h2 className="page-title">Education & Career</h2>
            <p className="page-subtitle">Your professional background</p>

            <div className="form-group">
              <label className="form-label">Highest Education *</label>
              <select className="form-select" value={form.education} onChange={e=>set('education',e.target.value)}>
                {educations.map(e=><option key={e}>{e}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Field of Study</label>
              <input className="form-input" placeholder="Engineering, Medicine, Arts..." value={form.field_of_study}
                onChange={e=>set('field_of_study',e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Current Occupation *</label>
              <input className="form-input" placeholder="Software Engineer, Doctor..." value={form.occupation}
                onChange={e=>set('occupation',e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Employer / Company</label>
              <input className="form-input" placeholder="TCS, Infosys, Self-employed..." value={form.employer}
                onChange={e=>set('employer',e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Annual Income</label>
              <select className="form-select" value={form.annual_income} onChange={e=>set('annual_income',e.target.value)}>
                {incomes.map(i=><option key={i}>{i}</option>)}
              </select>
            </div>
          </div>
        )}

        {step===2 && (
          <div>
            <h2 className="page-title">Lifestyle</h2>
            <p className="page-subtitle">Help us understand you better</p>

            <div className="form-group">
              <label className="form-label">Diet *</label>
              <div className="radio-group">
                {diets.map(d=>(
                  <div key={d} className={"radio-option " + (form.diet===d?'selected':'')} onClick={()=>set('diet',d)}>
                    {form.diet===d?'◉':'○'} {d}
                  </div>
                ))}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Smoking</label>
                <select className="form-select" value={form.smoking} onChange={e=>set('smoking',e.target.value)}>
                  {habits.map(h=><option key={h}>{h}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Drinking</label>
                <select className="form-select" value={form.drinking} onChange={e=>set('drinking',e.target.value)}>
                  {habits.map(h=><option key={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Hobbies & Interests</label>
              <input className="form-input" placeholder="Reading, Travel, Music, Cricket..." value={form.hobbies}
                onChange={e=>set('hobbies',e.target.value)} />
              <div className="form-hint">Separate with commas</div>
            </div>

            <div className="form-group">
              <label className="form-label">About Me *</label>
              <textarea className="form-textarea" placeholder="Tell us about yourself, your personality, what you're looking for..."
                value={form.about_me} onChange={e=>set('about_me',e.target.value)} style={{minHeight:120}} />
              <div className="form-hint">{form.about_me?.length||0} characters (minimum 50)</div>
            </div>
          </div>
        )}

        {step===3 && (
          <div>
            <h2 className="page-title">Family Background</h2>
            <p className="page-subtitle">Family details for better matching</p>

            <div className="form-group">
              <label className="form-label">Family Type *</label>
              <div className="radio-group">
                {famTypes.map(f=>(
                  <div key={f} className={"radio-option " + (form.family_type===f?'selected':'')} onClick={()=>set('family_type',f)}>
                    {form.family_type===f?'◉':'○'} {f} Family
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Family Values</label>
              <div className="radio-group">
                {famValues.map(f=>(
                  <div key={f} className={"radio-option " + (form.family_values===f?'selected':'')} onClick={()=>set('family_values',f)}>
                    {form.family_values===f?'◉':'○'} {f}
                  </div>
                ))}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Father's Profession</label>
                <input className="form-input" placeholder="Business, Retired..." value={form.father_profession}
                  onChange={e=>set('father_profession',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Mother's Profession</label>
                <input className="form-input" placeholder="Homemaker, Teacher..." value={form.mother_profession}
                  onChange={e=>set('mother_profession',e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Siblings</label>
                <input className="form-input" placeholder="1 brother, 2 sisters..." value={form.siblings}
                  onChange={e=>set('siblings',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Family City</label>
                <input className="form-input" placeholder="Delhi, Mumbai..." value={form.family_city}
                  onChange={e=>set('family_city',e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {step===4 && (
          <div>
            <h2 className="page-title">Partner Preferences</h2>
            <p className="page-subtitle">More flexibility = more matches</p>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Age Min</label>
                <input className="form-input" type="number" min="18" max="70" placeholder="22"
                  value={form.partner_age_min} onChange={e=>set('partner_age_min',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Age Max</label>
                <input className="form-input" type="number" min="18" max="70" placeholder="30"
                  value={form.partner_age_max} onChange={e=>set('partner_age_max',e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Religion Preference</label>
              <select className="form-select" value={form.partner_religion} onChange={e=>set('partner_religion',e.target.value)}>
                <option value="Any">Any / Open to all</option>
                {religions.map(r=><option key={r}>{r}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Location Preference</label>
              <select className="form-select" value={form.partner_location} onChange={e=>set('partner_location',e.target.value)}>
                {['Same city','Same state','Anywhere in India','Open to relocation','Global'].map(l=><option key={l}>{l}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Education Preference</label>
              <select className="form-select" value={form.partner_education} onChange={e=>set('partner_education',e.target.value)}>
                <option value="Any">Any</option>
                {educations.map(e=><option key={e}>{e}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Additional Notes</label>
              <textarea className="form-textarea" placeholder="Any other preferences or expectations..."
                value={form.partner_notes} onChange={e=>set('partner_notes',e.target.value)} />
            </div>
          </div>
        )}

        {step===5 && (
          <div>
            <h2 className="page-title">Your Photos</h2>
            <p className="page-subtitle">Add up to 6 photos. First photo is your profile picture.</p>

            <div className="notice" style={{marginBottom:20}}>
              <strong>Photo Guidelines:</strong> Natural, clear photos only. No filters, sunglasses, or edited images. Families prefer honest, natural presentation.
            </div>

            <div className="photo-grid">
              {photos.map((photo, idx)=>(
                <div key={idx} className={"photo-slot " + (photo?'filled':'')}
                  onClick={()=>!photo&&fileRefs.current[idx].current.click()}>
                  {photo ? (
                    <>
                      <img src={photo} alt="" />
                      <button className="remove-btn" onClick={e=>{e.stopPropagation();removePhoto(idx)}}>✕</button>
                      {idx===0&&<div style={{position:'absolute',bottom:4,left:4,background:'rgba(0,0,0,0.7)',color:'#fff',fontSize:9,padding:'2px 6px',borderRadius:4,letterSpacing:'0.1em'}}>MAIN</div>}
                    </>
                  ) : (
                    <>
                      <span style={{fontSize:24,opacity:0.25}}>+</span>
                      <span style={{fontSize:9,opacity:0.35,letterSpacing:'0.1em'}}>{idx===0?'MAIN':'PHOTO '+(idx+1)}</span>
                    </>
                  )}
                  <input ref={fileRefs.current[idx]} type="file" accept="image/*" style={{display:'none'}}
                    onChange={e=>handlePhotoSelect(idx,e.target.files[0])} />
                </div>
              ))}
            </div>

            <div style={{marginBottom:24}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:12,color:'#8e8e8e'}}>Profile Completeness</span>
                <span style={{fontSize:12,fontWeight:600}}>{completeness()}%</span>
              </div>
              <div className="progress-wrap">
                <div className="progress-fill" style={{width:completeness()+'%'}}></div>
              </div>
            </div>

            <div className="notice">
              <strong>After submission:</strong> Our team will review your profile within 24-48 hours before it becomes visible to potential matches.
            </div>
          </div>
        )}

        <div style={{display:'flex',gap:10,marginTop:24}}>
          {step>0&&(
            <button className="btn btn-outline" style={{flex:1}} onClick={()=>setStep(s=>s-1)}>← Back</button>
          )}
          {step<STEPS.length-1 ? (
            <button className="btn btn-black" style={{flex:2}} onClick={()=>{
              if(step===0&&!form.full_name) return showToast('Please enter your name')
              if(step===0&&!form.age) return showToast('Please enter your age')
              if(step===0&&!form.city) return showToast('Please enter your city')
              setStep(s=>s+1)
            }}>
              Continue →
            </button>
          ) : (
            <button className="btn btn-black" style={{flex:2}} onClick={handleSubmit} disabled={saving}>
              {saving ? 'Submitting...' : '✓ Submit Profile'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
