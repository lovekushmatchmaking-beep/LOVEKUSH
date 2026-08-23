import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, generateProfileCode } from '../supabase'

import {
  DIETS,
  EDUCATIONS,
  FAMILY_TYPES,
  FAMILY_VALUES,
  HABITS,
  HEIGHT_RANGES,
  INCOME_RANGES,
  LOCATION_PREFERENCES,
  MARITAL_STATUSES,
  RELIGIONS,
  CASTES,
  MOTHER_TONGUES,
  COMPLEXIONS,
  WEIGHT_RANGES,
  NATIONALITIES,
  MANGLIK_OPTIONS,
  KUNDLI_AVAILABLE,
  RELOCATION_PREFERENCES,
  EMPLOYMENT_TYPES,
  INDUSTRIES,
  OWN_HOUSE_OPTIONS,
  HOUSE_TYPES,
  FAMILY_INCOME_RANGES,
  PHYSICAL_DISABILITY_OPTIONS,
} from '../constants/profileOptions'
import { compressImage } from '../utils/compressImage'
import { calculateAge, validateAge, dobInputBounds } from '../utils/ageUtils'
import { calculateSectionCompleteness } from '../utils/completeness'

const STEPS = ['Personal','Religion & Location','Education','Lifestyle','Family','Preferences','Photos']

export default function CreateProfile({ user, adminMode, onComplete }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [photos, setPhotos] = useState(Array(6).fill(null))
  const [photoFiles, setPhotoFiles] = useState(Array(6).fill(null))
  const fileRefs = useRef(Array(6).fill(null).map(()=>React.createRef()))
  const [toast, setToast] = useState('')

  const [form, setForm] = useState({
    client_phone:'', client_email:'',
    first_name:'', middle_name:'', last_name:'', gender:'Male', date_of_birth:'',
    city:'', state:'', country:'India', religion:'Hindu',
    community:'', community_other:'', mother_tongue:'', mother_tongue_other:'',
    height:'', weight:'', complexion:'', body_type:'Average',
    marital_status:'Never Married', nationality:'Indian',
    physical_disability:'No', disability_details:'',
    sub_caste:'', gotra:'', manglik:'', kundli_available:'',
    native_place:'', current_address:'', relocation_preference:'',
    education:'Graduation', field_of_study:'', specialization:'', occupation:'',
    designation:'', industry:'', employment_type:'', work_location:'',
    employer:'', annual_income:'₹3–5L',
    diet:'Vegetarian', smoking:'Never', drinking:'Never',
    hobbies:'', about_me:'',
    family_type:'Nuclear', family_values:'Moderate',
    father_profession:'', mother_profession:'', siblings:'',
    family_city:'', own_house:'', house_type:'', property_details:'',
    vehicle_details:'', family_income_range:'',
    partner_age_min:'', partner_age_max:'',
    partner_religion:'Any', partner_location:'Open to relocation',
    partner_education:'Any', partner_notes:''
  })

  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(()=>setToast(''),3000)
  }

  const [photoErrors, setPhotoErrors] = useState(Array(6).fill(null))
  const [compressingIdx, setCompressingIdx] = useState(null)

  const handlePhotoSelect = async (idx, file) => {
    if(!file) return

    // VALIDATE — pehle koi check hi nahi tha
    const newErrors = [...photoErrors]
    if (!file.type.startsWith('image/')) {
      newErrors[idx] = 'Please select an image file (JPG, PNG, etc.)'
      setPhotoErrors(newErrors)
      return
    }
    if (file.size > 15 * 1024 * 1024) { // 15MB raw limit, compress karega uske baad chhota ho jaayega
      newErrors[idx] = 'Image too large (max 15MB). Please choose a smaller photo.'
      setPhotoErrors(newErrors)
      return
    }
    newErrors[idx] = null
    setPhotoErrors(newErrors)

    // Show preview immediately
    const url = URL.createObjectURL(file)
    const newPhotos = [...photos]; newPhotos[idx] = url
    setPhotos(newPhotos)

    // Compress in background
    setCompressingIdx(idx)
    try {
      const compressed = await compressImage(file)
      const newFiles = [...photoFiles]; newFiles[idx] = compressed
      setPhotoFiles(newFiles)
    } catch (err) {
      const errs = [...photoErrors]
      errs[idx] = 'Could not process this image. Please try another.'
      setPhotoErrors(errs)
      const revertPhotos = [...photos]; revertPhotos[idx] = null
      setPhotos(revertPhotos)
    }
    setCompressingIdx(null)
  }

  const removePhoto = (idx) => {
    const newPhotos = [...photos]; newPhotos[idx] = null
    const newFiles = [...photoFiles]; newFiles[idx] = null
    const newErrors = [...photoErrors]; newErrors[idx] = null
    setPhotos(newPhotos); setPhotoFiles(newFiles); setPhotoErrors(newErrors)
  }

  const completeness = () => calculateSectionCompleteness(form, photos.filter(Boolean).length).overall

  const handleSubmit = async () => {
    if(!form.first_name || !form.last_name || !form.date_of_birth || !form.city) {
      showToast('Please fill required fields (First Name, Last Name, Date of Birth, City)'); return
    }

    const ageCheck = validateAge(form.date_of_birth, form.gender)
    if (!ageCheck.valid) {
      showToast(ageCheck.message)
      return
    }

    setSaving(true)
    try {
      const fullName = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ')
      const code = generateProfileCode(form.gender, form.religion)
      const finalCommunity = form.community === 'Other' ? form.community_other : form.community
      const finalMotherTongue = form.mother_tongue === 'Other' ? form.mother_tongue_other : form.mother_tongue

      // community_other/mother_tongue_other sirf UI helper fields hain
      // — "profiles" table mein aisa koi column nahi hai, isliye insert
      // se pehle inhe nikaal dete hain (warna database error aayega).
      const { community_other, mother_tongue_other, ...formToSave } = form

      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .insert({
          user_id: adminMode ? null : user.id,
          is_admin_managed: !!adminMode,
          managed_by_staff_id: adminMode ? user.id : null,
          profile_status: adminMode ? 'pending' : 'pending', // staff abhi bhi Approve karega (Admin list mein dikhega)
          profile_code: code,
          ...formToSave,
          full_name: fullName,
          community: finalCommunity,
          mother_tongue: finalMotherTongue,
          age: ageCheck.age,
          partner_age_min: parseInt(form.partner_age_min) || null,
          partner_age_max: parseInt(form.partner_age_max) || null,
          profile_completeness: completeness(),
          completeness_breakdown: calculateSectionCompleteness(form, photoFiles.filter(Boolean).length)
        })
        .select().single()

      if(pErr) throw pErr

      const photoUploads = photoFiles.filter(Boolean)
      const photoErrors = []
      for(let i=0; i<photoUploads.length; i++){
        const file = photoUploads[i]
        const path = user.id + '/' + Date.now() + '-' + i + '.jpg'
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('lovekush-photos')
          .upload(path, file, { upsert: true, contentType: 'image/jpeg' })

        if (uploadErr) {
          // PEHLE: yeh error yahan silently discard ho jaata tha — user
          // ko "Profile created!" hi dikhta tha chahe photo upload fail
          // ho jaaye. AB: error collect karke user ko clearly batate hain.
          photoErrors.push('Photo ' + (i+1) + ': ' + uploadErr.message)
          continue
        }
        if(uploadData) {
          const { error: insertErr } = await supabase.from('photos').insert({
            profile_id: profile.id,
            storage_path: path,
            is_primary: i===0,
            photo_type: i===0 ? 'profile' : 'general'
          })
          if (insertErr) photoErrors.push('Photo ' + (i+1) + ' record: ' + insertErr.message)
        }
      }

      const finish = () => {
        if (adminMode && onComplete) onComplete(profile)
        else navigate('/dashboard')
      }

      if (photoErrors.length > 0) {
        showToast('Profile created, but ' + photoErrors.length + ' photo(s) failed: ' + photoErrors.join(' | '))
        setTimeout(finish, 3500)
      } else {
        showToast('Profile created! Code: ' + code)
        setTimeout(finish, 1500)
      }
    } catch(err) {
      showToast('Error: ' + err.message)
    }
    setSaving(false)
  }

  const pct = Math.round(((step+1)/STEPS.length)*100)

  return (
    <div style={{minHeight:'100vh',background:'#fff'}}>
      <div className={'toast ' + (toast?'show':'')}>{toast}</div>

      <div style={{position:'sticky',top:0,zIndex:90,background:'rgba(255,255,255,0.97)',backdropFilter:'blur(12px)',borderBottom:'1px solid rgba(0,0,0,0.06)',padding:'12px 20px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div style={{fontFamily:'DM Sans',fontSize:14,fontWeight:200,letterSpacing:'0.3em'}}>LOVEKUSH</div>
          <div style={{fontSize:12,color:'#8e8e8e'}}>Step {step+1} of {STEPS.length}</div>
        </div>
        <div className="progress-wrap"><div className="progress-fill" style={{width:pct+'%'}}></div></div>
        <div className="step-tabs">
          {STEPS.map((s,i)=>(
            <div key={s} className={'step-tab ' + (i===step?'active':i<step?'done':'')}
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
            <p className="page-subtitle">{adminMode ? "Enter the client's details" : 'Tell us about yourself'}</p>

            {adminMode && (
              <div style={{background:'#fff8e1',borderRadius:12,padding:14,marginBottom:20}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:10}}>Client Contact (internal — used to share matches, never shown on public profile)</div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Client Phone / WhatsApp</label>
                    <input className="form-input" placeholder="9876543210" value={form.client_phone}
                      onChange={e=>set('client_phone',e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Client Email</label>
                    <input className="form-input" placeholder="client@email.com" value={form.client_email}
                      onChange={e=>set('client_email',e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">First Name *</label>
              <input className="form-input" placeholder="As per records" value={form.first_name}
                onChange={e=>set('first_name',e.target.value)} autoFocus />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Middle Name</label>
                <input className="form-input" placeholder="Optional" value={form.middle_name}
                  onChange={e=>set('middle_name',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name / Surname *</label>
                <input className="form-input" placeholder="As per records" value={form.last_name}
                  onChange={e=>set('last_name',e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date of Birth *</label>
                <input className="form-input" type="date" value={form.date_of_birth}
                  min={dobInputBounds().min} max={dobInputBounds().max}
                  onChange={e=>set('date_of_birth',e.target.value)} />
                {form.date_of_birth && (() => {
                  const check = validateAge(form.date_of_birth, form.gender)
                  return (
                    <div style={{fontSize:12, marginTop:4, color: check.valid ? '#16a34a' : '#dc2626'}}>
                      {check.valid ? `Age: ${check.age} years` : check.message}
                    </div>
                  )
                })()}
              </div>
              <div className="form-group">
                <label className="form-label">Gender *</label>
                <select className="form-select" value={form.gender} onChange={e=>set('gender',e.target.value)}>
                  <option>Male</option><option>Female</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Height</label>
                <select className="form-select" value={form.height} onChange={e=>set('height',e.target.value)}>
                  <option value="">Select</option>
                  {HEIGHT_RANGES.map(h=><option key={h}>{h}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Weight</label>
                <select className="form-select" value={form.weight} onChange={e=>set('weight',e.target.value)}>
                  <option value="">Select</option>
                  {WEIGHT_RANGES.map(w=><option key={w}>{w}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Complexion</label>
                <select className="form-select" value={form.complexion} onChange={e=>set('complexion',e.target.value)}>
                  <option value="">Select</option>
                  {COMPLEXIONS.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Body Type</label>
                <select className="form-select" value={form.body_type} onChange={e=>set('body_type',e.target.value)}>
                  <option>Slim</option><option>Average</option><option>Athletic</option><option>Heavy</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Marital Status</label>
                <select className="form-select" value={form.marital_status} onChange={e=>set('marital_status',e.target.value)}>
                  {MARITAL_STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Nationality</label>
                <select className="form-select" value={form.nationality} onChange={e=>set('nationality',e.target.value)}>
                  {NATIONALITIES.map(n=><option key={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Physical Disability</label>
              <div className="radio-group">
                {PHYSICAL_DISABILITY_OPTIONS.map(o=>(
                  <div key={o} className={'radio-option ' + (form.physical_disability===o?'selected':'')} onClick={()=>set('physical_disability',o)}>
                    {form.physical_disability===o?'◉':'○'} {o}
                  </div>
                ))}
              </div>
              {form.physical_disability === 'Yes' && (
                <input className="form-input" style={{marginTop:8}} placeholder="Please provide details"
                  value={form.disability_details} onChange={e=>set('disability_details',e.target.value)} />
              )}
            </div>
          </div>
        )}

        {step===1 && (
          <div>
            <h2 className="page-title">Religion & Location</h2>
            <p className="page-subtitle">Community and location help us find the right match</p>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Religion *</label>
                <select className="form-select" value={form.religion} onChange={e=>set('religion',e.target.value)}>
                  {RELIGIONS.map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Mother Tongue</label>
                <select className="form-select" value={form.mother_tongue} onChange={e=>set('mother_tongue',e.target.value)}>
                  <option value="">Select</option>
                  {MOTHER_TONGUES.map(m=><option key={m}>{m}</option>)}
                </select>
                {form.mother_tongue === 'Other' && (
                  <input className="form-input" style={{marginTop:8}} placeholder="Apni Mother Tongue likhein"
                    value={form.mother_tongue_other} onChange={e=>set('mother_tongue_other',e.target.value)} />
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Community / Caste</label>
                <select className="form-select" value={form.community} onChange={e=>set('community',e.target.value)}>
                  <option value="">Select</option>
                  {CASTES.map(c=><option key={c}>{c}</option>)}
                </select>
                {form.community === 'Other' && (
                  <input className="form-input" style={{marginTop:8}} placeholder="Apni Caste/Community likhein"
                    value={form.community_other} onChange={e=>set('community_other',e.target.value)} />
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Sub-Caste</label>
                <input className="form-input" placeholder="Optional" value={form.sub_caste}
                  onChange={e=>set('sub_caste',e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Gotra</label>
                <input className="form-input" placeholder="Optional" value={form.gotra}
                  onChange={e=>set('gotra',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Manglik</label>
                <select className="form-select" value={form.manglik} onChange={e=>set('manglik',e.target.value)}>
                  <option value="">Select</option>
                  {MANGLIK_OPTIONS.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Kundli Available?</label>
              <select className="form-select" value={form.kundli_available} onChange={e=>set('kundli_available',e.target.value)}>
                <option value="">Select</option>
                {KUNDLI_AVAILABLE.map(k=><option key={k}>{k}</option>)}
              </select>
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
                <label className="form-label">Native Place</label>
                <input className="form-input" placeholder="Original hometown" value={form.native_place}
                  onChange={e=>set('native_place',e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Current Address</label>
              <textarea className="form-textarea" placeholder="Optional — used internally for verification"
                value={form.current_address} onChange={e=>set('current_address',e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Relocation Preference</label>
              <select className="form-select" value={form.relocation_preference} onChange={e=>set('relocation_preference',e.target.value)}>
                <option value="">Select</option>
                {RELOCATION_PREFERENCES.map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
        )}

        {step===2 && (
          <div>
            <h2 className="page-title">Education & Career</h2>
            <p className="page-subtitle">Your professional background</p>

            <div className="form-group">
              <label className="form-label">Highest Education *</label>
              <select className="form-select" value={form.education} onChange={e=>set('education',e.target.value)}>
                {EDUCATIONS.map(e=><option key={e}>{e}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Field of Study</label>
              <input className="form-input" placeholder="Engineering, Medicine, Arts..." value={form.field_of_study}
                onChange={e=>set('field_of_study',e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Specialization</label>
              <input className="form-input" placeholder="Optional" value={form.specialization}
                onChange={e=>set('specialization',e.target.value)} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Current Occupation *</label>
                <input className="form-input" placeholder="Software Engineer, Doctor..." value={form.occupation}
                  onChange={e=>set('occupation',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Designation</label>
                <input className="form-input" placeholder="Senior Manager..." value={form.designation}
                  onChange={e=>set('designation',e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Industry</label>
                <select className="form-select" value={form.industry} onChange={e=>set('industry',e.target.value)}>
                  <option value="">Select</option>
                  {INDUSTRIES.map(i=><option key={i}>{i}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Employment Type</label>
                <select className="form-select" value={form.employment_type} onChange={e=>set('employment_type',e.target.value)}>
                  <option value="">Select</option>
                  {EMPLOYMENT_TYPES.map(e=><option key={e}>{e}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Employer / Company</label>
                <input className="form-input" placeholder="TCS, Infosys, Self-employed..." value={form.employer}
                  onChange={e=>set('employer',e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Work Location</label>
                <input className="form-input" placeholder="City where you work" value={form.work_location}
                  onChange={e=>set('work_location',e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Annual Income</label>
              <select className="form-select" value={form.annual_income} onChange={e=>set('annual_income',e.target.value)}>
                {INCOME_RANGES.map(i=><option key={i}>{i}</option>)}
              </select>
            </div>
          </div>
        )}

        {step===3 && (
          <div>
            <h2 className="page-title">Lifestyle</h2>
            <p className="page-subtitle">Help us understand you better</p>

            <div className="form-group">
              <label className="form-label">Diet *</label>
              <div className="radio-group">
                {DIETS.map(d=>(
                  <div key={d} className={'radio-option ' + (form.diet===d?'selected':'')} onClick={()=>set('diet',d)}>
                    {form.diet===d?'◉':'○'} {d}
                  </div>
                ))}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Smoking</label>
                <select className="form-select" value={form.smoking} onChange={e=>set('smoking',e.target.value)}>
                  {HABITS.map(h=><option key={h}>{h}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Drinking</label>
                <select className="form-select" value={form.drinking} onChange={e=>set('drinking',e.target.value)}>
                  {HABITS.map(h=><option key={h}>{h}</option>)}
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

        {step===4 && (
          <div>
            <h2 className="page-title">Family Background</h2>
            <p className="page-subtitle">Family details for better matching</p>

            <div className="form-group">
              <label className="form-label">Family Type *</label>
              <div className="radio-group">
                {FAMILY_TYPES.map(f=>(
                  <div key={f} className={'radio-option ' + (form.family_type===f?'selected':'')} onClick={()=>set('family_type',f)}>
                    {form.family_type===f?'◉':'○'} {f} Family
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Family Values</label>
              <div className="radio-group">
                {FAMILY_VALUES.map(f=>(
                  <div key={f} className={'radio-option ' + (form.family_values===f?'selected':'')} onClick={()=>set('family_values',f)}>
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

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Own House</label>
                <select className="form-select" value={form.own_house} onChange={e=>set('own_house',e.target.value)}>
                  <option value="">Select</option>
                  {OWN_HOUSE_OPTIONS.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">House Type</label>
                <select className="form-select" value={form.house_type} onChange={e=>set('house_type',e.target.value)}>
                  <option value="">Select</option>
                  {HOUSE_TYPES.map(h=><option key={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Family Income Range</label>
              <select className="form-select" value={form.family_income_range} onChange={e=>set('family_income_range',e.target.value)}>
                <option value="">Select</option>
                {FAMILY_INCOME_RANGES.map(f=><option key={f}>{f}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Property Details</label>
              <input className="form-input" placeholder="Optional" value={form.property_details}
                onChange={e=>set('property_details',e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Vehicle Details</label>
              <input className="form-input" placeholder="Optional" value={form.vehicle_details}
                onChange={e=>set('vehicle_details',e.target.value)} />
            </div>
          </div>
        )}

        {step===5 && (
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
                {RELIGIONS.map(r=><option key={r}>{r}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Location Preference</label>
              <select className="form-select" value={form.partner_location} onChange={e=>set('partner_location',e.target.value)}>
                {LOCATION_PREFERENCES.map(l=><option key={l}>{l}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Education Preference</label>
              <select className="form-select" value={form.partner_education} onChange={e=>set('partner_education',e.target.value)}>
                <option value="Any">Any</option>
                {EDUCATIONS.map(e=><option key={e}>{e}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Additional Notes</label>
              <textarea className="form-textarea" placeholder="Any other preferences or expectations..."
                value={form.partner_notes} onChange={e=>set('partner_notes',e.target.value)} />
            </div>
          </div>
        )}

        {step===6 && (
          <div>
            <h2 className="page-title">Your Photos</h2>
            <p className="page-subtitle">Add up to 6 photos. First photo is your profile picture.</p>

            <div className="notice" style={{marginBottom:20}}>
              <strong>Photo Guidelines:</strong> Natural, clear photos only. No filters, sunglasses, or edited images. Families prefer honest, natural presentation.
            </div>

            <div className="photo-grid">
              {photos.map((photo, idx)=>(
                <div key={idx} className={'photo-slot ' + (photo?'filled':'')}
                  onClick={()=>!photo&&fileRefs.current[idx].current.click()}>
                  {photo ? (
                    <>
                      <img src={photo} alt="" style={{opacity: compressingIdx===idx ? 0.5 : 1}} />
                      {compressingIdx===idx && (
                        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#fff',background:'rgba(0,0,0,0.3)'}}>Processing...</div>
                      )}
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
                    onChange={e=>{handlePhotoSelect(idx,e.target.files[0]); e.target.value=''}} />
                </div>
              ))}
            </div>

            {photoErrors.some(Boolean) && (
              <div style={{marginBottom:16}}>
                {photoErrors.map((err,idx)=>err && (
                  <div key={idx} style={{fontSize:12,color:'#dc2626',marginBottom:4}}>Photo {idx+1}: {err}</div>
                ))}
              </div>
            )}

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
              if(step===0&&!form.first_name) return showToast('Please enter your first name')
              if(step===0&&!form.last_name) return showToast('Please enter your last name')
              if(step===0&&!form.date_of_birth) return showToast('Please enter your date of birth')
              if(step===0&&form.date_of_birth&&!validateAge(form.date_of_birth,form.gender).valid) return showToast(validateAge(form.date_of_birth,form.gender).message)
              if(step===1&&!form.city) return showToast('Please enter your city')
              setStep(s=>s+1)
            }}>
              Continue →
            </button>
          ) : (
            <button className="btn btn-black" style={{flex:2}} onClick={handleSubmit} disabled={saving || compressingIdx!==null}>
              {saving ? 'Submitting...' : compressingIdx!==null ? 'Processing photo...' : '✓ Submit Profile'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
