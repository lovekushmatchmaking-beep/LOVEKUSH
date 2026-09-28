import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, generateProfileCode } from '../supabase'

import {
  DIETS,
  EDUCATIONS,
  DEGREE_OPTIONS,
  FAMILY_TYPES,
  FAMILY_VALUES,
  HABITS,
  HEIGHT_RANGES,
  INCOME_RANGES,
  LOCATION_PREFERENCES,
  MARITAL_STATUSES,
  RELIGIONS,
  CASTES,
  GOTRAS,
  MOTHER_TONGUES,
  ISLAMIC_DENOMINATIONS,
  SUNNI_SCHOOLS_OF_THOUGHT,
  SHIA_BRANCHES,
  ISLAMIC_COMMUNITIES,
  ISLAMIC_SUB_CASTE_DIVISIONS,
  CHRISTIAN_DENOMINATION_GROUPS,
  CHRISTIAN_COMMUNITIES,
  RELIGION_HIERARCHY,
  NO_RELIGION_VALUES,
  JAIN_GOTRAS,
  SENSITIVE_COMMUNITIES,
  SENSITIVE_COMMUNITY_NOTE,
  COMPLEXIONS,
  BODY_TYPES,
  PROPERTY_TYPES,
  PROPERTY_OWNERSHIP,
  VEHICLE_OWNERSHIP,
  BUSINESS_ASSET_TYPES,
  PARTNER_COMMUNITY_SPECIAL_OPTIONS,
  PARTNER_COMMUNITY_NO_BAR,
  WEIGHT_RANGES,
  COUNTRIES,
  MANGLIK_OPTIONS,
  KUNDLI_AVAILABLE,
  RELOCATION_PREFERENCES,
  EMPLOYMENT_TYPES,
  OWN_HOUSE_OPTIONS,
  HOUSE_TYPES,
  FAMILY_INCOME_RANGES,
  USD_FAMILY_INCOME_RANGES,
  CURRENCIES,
  USD_INCOME_RANGES,
  PHYSICAL_DISABILITY_OPTIONS,
  PROFESSION_CATEGORIES,
  HEALTH_INFO_OPTIONS,
  BLOOD_GROUPS,
  PROFILE_MANAGED_BY,
  FAMILY_STATUS_OPTIONS,
  LIVING_WITH_PARENTS_OPTIONS,
  HOBBIES_INTERESTS,
  HOBBIES_MAX_SELECT,
  CUISINES,
  SPORTS_LIST,
  TIME_OF_BIRTH_ACCURACY,
  CASTE_NO_BAR_OPTIONS,
  PRIVACY_LEVELS,
  FAMILY_FINANCIAL_STATUS,
  WORKING_AS_OPTIONS,
  FAVOURITE_MUSIC,
  FAVOURITE_BOOKS,
  DRESS_STYLES,
  LANGUAGES_SPOKEN,
  HAVE_CHILDREN_OPTIONS,
  CHILDREN_LIVING_WITH_OPTIONS,
  GREW_UP_IN_OPTIONS,
  PARTNER_HEIGHT_MIN_INCHES,
  PARTNER_HEIGHT_MAX_INCHES,
  formatHeightFromInches,
  PARTNER_INCOME_BOUNDS,
} from '../constants/profileOptions'
import MultiSelectChips from '../components/MultiSelectChips'
import DualRangeSlider from '../components/DualRangeSlider'
import CheckboxDropdown from '../components/CheckboxDropdown'
import { compressImage } from '../utils/compressImage'
import { calculateAge, validateAge, dobInputBounds } from '../utils/ageUtils'
import { calculateSectionCompleteness } from '../utils/completeness'

const STEPS = ['Personal','Religion & Community','Location','Education','Lifestyle','Family','Preferences','Privacy','Photos']
const SIBLING_COUNT_OPTIONS = Array.from({length:11}, (_,i)=>i) // 0-10

// Personal Details ab ek-ek sawaal karke (Jeevansathi jaisa one-question-
// per-screen) poocha jaata hai — har entry ek chhoti screen hai. `skip`
// function decide karta hai ki current form state me yeh question dikhana
// hai ya nahi (jaise "Children Living With" sirf tab jab have_children
// 'Yes' ho).
const PERSONAL_QUESTIONS = [
  { key:'first_name', label:'What is your first name?', type:'text', required:true, placeholder:'As per records' },
  { key:'middle_name', label:'Middle name', hint:'Optional', type:'text', required:false, placeholder:'Optional' },
  { key:'last_name', label:'What is your last name / surname?', type:'text', required:true, placeholder:'As per records' },
  { key:'date_of_birth', label:'When were you born?', type:'date', required:true },
  { key:'gender', label:'What is your gender?', type:'chips', required:true, options:['Male','Female'] },
  { key:'height', label:'What is your height?', type:'select', options:HEIGHT_RANGES },
  { key:'weight', label:'What is your weight?', type:'select', options:WEIGHT_RANGES },
  { key:'complexion', label:'Your complexion', type:'select', options:COMPLEXIONS },
  { key:'body_type', label:'Your body type', type:'select', options:BODY_TYPES },
  { key:'marital_status', label:'What is your marital status?', type:'chips', options:MARITAL_STATUSES },
  { key:'nationality', label:'What is your nationality?', type:'select', options:COUNTRIES.filter(c=>c!=='Open to All') },
  { key:'have_children', label:'Do you have children?', type:'chips', options:HAVE_CHILDREN_OPTIONS },
  { key:'children_living_with', label:'Who do your children live with?', type:'chips', options:CHILDREN_LIVING_WITH_OPTIONS,
    skip: f=>f.have_children!=='Yes' },
  { key:'blood_group', label:'Your blood group', hint:'Optional', type:'select', options:BLOOD_GROUPS },
  { key:'health_info', label:'Any health information to share?', hint:'Optional', type:'select', options:HEALTH_INFO_OPTIONS },
  { key:'languages_spoken', label:'Which languages do you speak?', type:'multiselect', options:LANGUAGES_SPOKEN, placeholder:'Select languages...' },
  { key:'grew_up_in', label:'Where did you grow up?', type:'select', options:GREW_UP_IN_OPTIONS },
  { key:'physical_disability', label:'Do you have a physical disability?', type:'chips', options:PHYSICAL_DISABILITY_OPTIONS },
  { key:'disability_details', label:'Please share details', type:'text', placeholder:'Please provide details',
    skip: f=>f.physical_disability!=='Yes' },
]

export default function CreateProfile({ user, adminMode, onComplete }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [personalQ, setPersonalQ] = useState(0) // one-question-per-screen index within the Personal Details step
  const [subQ, setSubQ] = useState(0) // one-question-per-screen index for steps 1-7
  const [saving, setSaving] = useState(false)
  const [photos, setPhotos] = useState(Array(2).fill(null))
  const [photoFiles, setPhotoFiles] = useState(Array(2).fill(null))
  const fileRefs = useRef(Array(2).fill(null).map(()=>React.createRef()))
  const [toast, setToast] = useState('')

  const [form, setForm] = useState({
    client_phone:'', client_email:'', alternate_email:'',
    blood_group:'', health_info:'',
    birth_time:'', birth_place:'', astrology_consent:false, horoscope_match_required:'',
    profession:'',
    languages_spoken:[], have_children:'', children_living_with:'', grew_up_in:'',
    hobbies_interests:[], cuisines:[], sports:[],
    profile_managed_by:'', family_status:'', living_with_parents:'',
    working_as:'', zip_code:'', ethnic_origin:'',
    country_of_birth:'', time_of_birth_accuracy:'',
    caste_no_bar:'', favourite_music:[], favourite_books:[], dress_style:'',
    family_financial_status:'',
    company_privacy:'Matches Only', college_privacy:'Matches Only',
    property_type:'', property_ownership:'', property_city:'', property_state:'', property_country:'India',
    property_size:'', property_privacy:'Matches Only',
    vehicle_ownership:'', vehicle_model:'',
    business_asset_type:'', business_detail:'', business_privacy:'Private',
    income_privacy:'Private', contact_privacy:'Matches Only',
    first_name:'', middle_name:'', last_name:'', gender:'Male', date_of_birth:'',
    city:'', state:'', country:'India', religion:'Hindu',
    community:'', community_other:'', mother_tongue:'', mother_tongue_other:'',
    islamic_denomination:'', islamic_school_of_thought:'', islamic_shia_branch:'',
    islamic_sub_caste_division:'Not Applicable',
    christian_denomination:'',
    religion_denomination:'', religion_denomination_2:'',
    custom_caste_text:'', custom_caste_text_gotra:'',
    community_privacy:'Matches Only',
    height:'', weight:'', complexion:'', body_type:'Average',
    marital_status:'Never Married', nationality:'India',
    physical_disability:'No', disability_details:'',
    sub_caste:'', gotra:'', gotra_other:'', manglik:'', kundli_available:'',
    native_place:'', current_address:'', relocation_preference:'',
    education:'Graduation', degree:'', degree_other:'', college_name:'', occupation:'',
    employment_type:'', work_location:'',
    employer:'', annual_income:'₹3–5L', annual_income_currency:'INR',
    diet:'Vegetarian', smoking:'Never', drinking:'Never',
    hobbies:'', about_me:'',
    family_type:'Nuclear', family_values:'Moderate',
    father_profession:'', father_profession_other:'', mother_profession:'', mother_profession_other:'', siblings:'',
    brothers_count:0, brothers_married_count:0, sisters_count:0, sisters_married_count:0,
    family_city:'', own_house:'', house_type:'', property_details:'',
    vehicle_details:'', family_income_range:'', family_income_currency:'INR',
    partner_age_min:18, partner_age_max:40,
    partner_height_min:PARTNER_HEIGHT_MIN_INCHES, partner_height_max:PARTNER_HEIGHT_MAX_INCHES,
    partner_income_min:PARTNER_INCOME_BOUNDS.INR.min, partner_income_max:PARTNER_INCOME_BOUNDS.INR.max,
    partner_income_currency:'INR',
    partner_city_preference:'', partner_state_preference:'', partner_country_preference:'Open to All',
    partner_religion:'Any', partner_community_ids:[], partner_location:'Open to relocation',
    partner_education:'Any', partner_education_level_preferences:[],
    partner_notes:''
  })

  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  const setCommunity = (v) => setForm(p=>({
    ...p,
    community: v,
    community_privacy: (SENSITIVE_COMMUNITIES.includes(v) && p.community_privacy === 'Matches Only')
      ? 'Private'
      : p.community_privacy,
  }))

  // "Any Community / No Bar" ek exclusive flag hai — usse select karte
  // hi baaki sab communities unselect ho jaati hain, aur ussi ke baad
  // koi aur community select karo to No Bar apne aap hat jaata hai.
  const setPartnerCommunity = (newSelected) => {
    const wasNoBar = form.partner_community_ids.includes(PARTNER_COMMUNITY_NO_BAR)
    const isNoBar = newSelected.includes(PARTNER_COMMUNITY_NO_BAR)
    if (isNoBar && !wasNoBar) {
      set('partner_community_ids', [PARTNER_COMMUNITY_NO_BAR])
    } else if (isNoBar && newSelected.length > 1) {
      set('partner_community_ids', newSelected.filter(v => v !== PARTNER_COMMUNITY_NO_BAR))
    } else {
      set('partner_community_ids', newSelected)
    }
  }

  // Brothers/Sisters counts — hardcoded 0-10 range mein clamp karte hain
  // (sirf HTML max attribute pe bharosa nahi karte, kyunki user type karke
  // usse bypass kar sakta hai), aur married count kabhi total count se
  // zyada nahi ho sakta.
  const setSiblingCount = (field, rawValue) => {
    let n = parseInt(rawValue, 10)
    if (isNaN(n) || n < 0) n = 0
    if (n > 10) n = 10
    setForm(p => {
      const next = { ...p, [field]: n }
      if (field === 'brothers_count' && next.brothers_married_count > n) next.brothers_married_count = n
      if (field === 'sisters_count' && next.sisters_married_count > n) next.sisters_married_count = n
      if (field === 'brothers_married_count' && n > p.brothers_count) next.brothers_married_count = p.brothers_count
      if (field === 'sisters_married_count' && n > p.sisters_count) next.sisters_married_count = p.sisters_count
      return next
    })
  }

  // Personal Details one-question-per-screen navigation helpers.
  const isPersonalQVisible = (idx) => !(PERSONAL_QUESTIONS[idx].skip && PERSONAL_QUESTIONS[idx].skip(form))

  const goToNextPersonalQ = () => {
    const q = PERSONAL_QUESTIONS[personalQ]
    if (q.required && !form[q.key]) { showToast('Please answer this question'); return }
    if (q.key==='date_of_birth' && form.date_of_birth) {
      const check = validateAge(form.date_of_birth, form.gender)
      if (!check.valid) { showToast(check.message); return }
    }
    let next = personalQ + 1
    while (next < PERSONAL_QUESTIONS.length && !isPersonalQVisible(next)) next++
    if (next >= PERSONAL_QUESTIONS.length) { setStep(1); return }
    setPersonalQ(next)
  }

  const goToPrevPersonalQ = () => {
    let prev = personalQ - 1
    while (prev >= 0 && !isPersonalQVisible(prev)) prev--
    if (prev < 0) return // already at first question, nothing to go back to within this step
    setPersonalQ(prev)
  }


  // ---- Generic one-question-per-screen block builders for steps 1-7 ----
  // (Personal Details / step 0 uses PERSONAL_QUESTIONS above; Photos /
  // step 8 stays a single page.) Each block is { title, subtitle?, skip?,
  // validate?, render }. render() returns the exact original form-row/
  // form-group JSX for that field, just shown one block at a time instead
  // of all stacked on one long page.

  const religionBlocks = () => [
    {
      title: 'Religion & Mother Tongue',
      render: () => (
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
      ),
    },
    {
      title: 'Denomination / Sect',
      skip: () => form.religion !== 'Muslim',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Denomination / Sect</label>
            <select className="form-select" value={form.islamic_denomination}
              onChange={e=>set('islamic_denomination',e.target.value)}>
              <option value="">Select</option>
              {ISLAMIC_DENOMINATIONS.map(d=><option key={d}>{d}</option>)}
            </select>
          </div>
          {form.islamic_denomination === 'Sunni' && (
            <div className="form-group">
              <label className="form-label">School of Thought (Madhab)</label>
              <select className="form-select" value={form.islamic_school_of_thought}
                onChange={e=>set('islamic_school_of_thought',e.target.value)}>
                <option value="">Select</option>
                {SUNNI_SCHOOLS_OF_THOUGHT.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          )}
          {form.islamic_denomination === 'Shia' && (
            <div className="form-group">
              <label className="form-label">Shia Branch</label>
              <select className="form-select" value={form.islamic_shia_branch}
                onChange={e=>set('islamic_shia_branch',e.target.value)}>
                <option value="">Select</option>
                {SHIA_BRANCHES.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Denomination',
      skip: () => form.religion !== 'Christian',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Denomination</label>
            <select className="form-select" value={form.christian_denomination}
              onChange={e=>set('christian_denomination',e.target.value)}>
              <option value="">Select</option>
              {CHRISTIAN_DENOMINATION_GROUPS.map(g=>(
                <optgroup key={g.group} label={g.group}>
                  {g.options.map(d=><option key={d}>{d}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
      ),
    },
    {
      title: (RELIGION_HIERARCHY[form.religion] && RELIGION_HIERARCHY[form.religion].denomination)
        ? RELIGION_HIERARCHY[form.religion].denomination.label : 'Denomination',
      skip: () => !RELIGION_HIERARCHY[form.religion],
      render: () => (
        <div className="form-row">
          {RELIGION_HIERARCHY[form.religion]?.denomination && (
            <div className="form-group">
              <label className="form-label">{RELIGION_HIERARCHY[form.religion].denomination.label}</label>
              <select className="form-select" value={form.religion_denomination}
                onChange={e=>set('religion_denomination',e.target.value)}>
                <option value="">Select</option>
                {RELIGION_HIERARCHY[form.religion].denomination.options.map(d=><option key={d}>{d}</option>)}
              </select>
            </div>
          )}
          {form.religion === 'Zoroastrian' && (
            <div className="form-group">
              <label className="form-label">{RELIGION_HIERARCHY[form.religion].community.label}</label>
              <select className="form-select" value={form.religion_denomination_2}
                onChange={e=>set('religion_denomination_2',e.target.value)}>
                <option value="">Select</option>
                {RELIGION_HIERARCHY[form.religion].community.options.map(d=><option key={d}>{d}</option>)}
              </select>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Community / Caste',
      skip: () => NO_RELIGION_VALUES.includes(form.religion) || form.religion === 'Zoroastrian',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">
              {RELIGION_HIERARCHY[form.religion]?.community.label || 'Community / Caste'}
            </label>
            <select className="form-select" value={form.community} onChange={e=>setCommunity(e.target.value)}>
              <option value="">Select</option>
              {(form.religion === 'Muslim' ? ISLAMIC_COMMUNITIES
                : form.religion === 'Christian' ? CHRISTIAN_COMMUNITIES
                : RELIGION_HIERARCHY[form.religion]?.community.options
                || CASTES).map(c=><option key={c}>{c}</option>)}
            </select>
            {form.community === 'Other' && (
              <input className="form-input" style={{marginTop:8}} placeholder="Apni Caste/Community likhein"
                value={form.community_other} onChange={e=>set('community_other',e.target.value)} />
            )}
            {form.community === 'Others / Not in list' && (
              <input className="form-input" style={{marginTop:8}} placeholder="Apni jati/community ka naam likhein"
                value={form.custom_caste_text} onChange={e=>set('custom_caste_text',e.target.value)} />
            )}
            {SENSITIVE_COMMUNITIES.includes(form.community) && (
              <div className="form-hint">{SENSITIVE_COMMUNITY_NOTE}</div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Sub-Caste</label>
            <input className="form-input" placeholder="Optional" value={form.sub_caste}
              onChange={e=>set('sub_caste',e.target.value)} />
          </div>
        </div>
      ),
    },
    {
      title: 'Sub-Caste / Division',
      skip: () => form.religion !== 'Muslim',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.islamic_sub_caste_division}
            onChange={e=>set('islamic_sub_caste_division',e.target.value)}>
            {ISLAMIC_SUB_CASTE_DIVISIONS.map(s=><option key={s}>{s}</option>)}
          </select>
          <div className="form-hint">Optional — sab communities ke liye applicable nahi hota</div>
        </div>
      ),
    },
    {
      title: 'Gotra & Manglik',
      render: () => (
        <div className="form-row">
          {(form.religion === 'Hindu' || form.religion === 'Jain') && (
            <div className="form-group">
              <label className="form-label">Gotra</label>
              <select className="form-select" value={form.gotra} onChange={e=>set('gotra',e.target.value)}>
                <option value="">Select</option>
                {(form.religion === 'Hindu' ? GOTRAS : JAIN_GOTRAS).map(g=><option key={g}>{g}</option>)}
              </select>
              {form.gotra === 'Other' && (
                <input className="form-input" style={{marginTop:8}} placeholder="Apna Gotra likhein"
                  value={form.gotra_other} onChange={e=>set('gotra_other',e.target.value)} />
              )}
              {form.gotra === 'Others / Not in list' && (
                <input className="form-input" style={{marginTop:8}} placeholder="Apna Gotra likhein"
                  value={form.custom_caste_text_gotra} onChange={e=>set('custom_caste_text_gotra',e.target.value)} />
              )}
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Manglik</label>
            <select className="form-select" value={form.manglik} onChange={e=>set('manglik',e.target.value)}>
              <option value="">Select</option>
              {MANGLIK_OPTIONS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
      ),
    },
    {
      title: 'Caste No Bar?',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.caste_no_bar} onChange={e=>set('caste_no_bar',e.target.value)}>
            <option value="">Select</option>
            {CASTE_NO_BAR_OPTIONS.map(c=><option key={c}>{c}</option>)}
          </select>
          <div className="form-hint">"Yes" ka matlab aap doosri caste ke profiles bhi consider karenge</div>
        </div>
      ),
    },
    {
      title: 'Kundli Available?',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.kundli_available} onChange={e=>set('kundli_available',e.target.value)}>
            <option value="">Select</option>
            {KUNDLI_AVAILABLE.map(k=><option key={k}>{k}</option>)}
          </select>
        </div>
      ),
    },
    {
      title: 'Birth Time',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Birth Time</label>
            <input className="form-input" type="time" value={form.birth_time} onChange={e=>set('birth_time',e.target.value)} />
            <div style={{fontSize:11,color:'#8e8e8e',marginTop:4}}>Optional — exact time nahi pata to khaali chhod do</div>
          </div>
          <div className="form-group">
            <label className="form-label">Time of Birth Accuracy</label>
            <select className="form-select" value={form.time_of_birth_accuracy} onChange={e=>set('time_of_birth_accuracy',e.target.value)}>
              <option value="">Select</option>
              {TIME_OF_BIRTH_ACCURACY.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
      ),
    },
    {
      title: 'Birth Place',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Birth Place (City)</label>
            <input className="form-input" placeholder="City where born" value={form.birth_place} onChange={e=>set('birth_place',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Country of Birth</label>
            <select className="form-select" value={form.country_of_birth} onChange={e=>set('country_of_birth',e.target.value)}>
              <option value="">Select</option>
              {COUNTRIES.filter(c=>c!=='Open to All').map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
      ),
    },
    {
      title: 'Horoscope Match Required?',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.horoscope_match_required} onChange={e=>set('horoscope_match_required',e.target.value)}>
            <option value="">Select</option>
            <option>Yes</option>
            <option>No</option>
            <option>Flexible</option>
          </select>
        </div>
      ),
    },
    {
      title: 'Astrology Consent',
      render: () => (
        <div className="form-group" style={{display:'flex',alignItems:'flex-start',gap:8}}>
          <input type="checkbox" id="astro_consent" checked={form.astrology_consent}
            onChange={e=>set('astrology_consent',e.target.checked)} style={{marginTop:3}} />
          <label htmlFor="astro_consent" style={{fontSize:12,color:'#555',cursor:'pointer'}}>
            I consent to LOVEKUSH collecting, processing and analysing my astrology/birth details for kundli-matching purposes.
          </label>
        </div>
      ),
    },
  ]

  const locationBlocks = () => [
    {
      title: 'City & State',
      validate: () => !form.city ? 'Please enter your city' : null,
      render: () => (
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
      ),
    },
    {
      title: 'Country & Native Place',
      render: () => (
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
      ),
    },
    {
      title: 'Current Address',
      subtitle: 'Optional — used internally for verification',
      render: () => (
        <div className="form-group">
          <textarea className="form-textarea" placeholder="Optional — used internally for verification"
            value={form.current_address} onChange={e=>set('current_address',e.target.value)} />
        </div>
      ),
    },
    {
      title: 'Zip Code & Ethnic Origin',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Zip / PIN Code</label>
            <input className="form-input" value={form.zip_code} onChange={e=>set('zip_code',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Ethnic Origin</label>
            <input className="form-input" placeholder="e.g. Indian" value={form.ethnic_origin} onChange={e=>set('ethnic_origin',e.target.value)} />
          </div>
        </div>
      ),
    },
    {
      title: 'Relocation Preference',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.relocation_preference} onChange={e=>set('relocation_preference',e.target.value)}>
            <option value="">Select</option>
            {RELOCATION_PREFERENCES.map(r=><option key={r}>{r}</option>)}
          </select>
        </div>
      ),
    },
  ]

  const educationBlocks = () => [
    {
      title: 'Highest Education',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.education} onChange={e=>set('education',e.target.value)}>
            {EDUCATIONS.map(e=><option key={e}>{e}</option>)}
          </select>
        </div>
      ),
    },
    {
      title: 'Degree',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.degree} onChange={e=>set('degree',e.target.value)}>
            <option value="">Select</option>
            {Object.entries(DEGREE_OPTIONS).map(([cat, options]) => (
              <optgroup key={cat} label={cat}>
                {options.map(d=><option key={d}>{d}</option>)}
              </optgroup>
            ))}
          </select>
          {form.degree === 'Others / Not in list' && (
            <input className="form-input" style={{marginTop:8}} placeholder="Apni degree likhein"
              value={form.degree_other} onChange={e=>set('degree_other',e.target.value)} />
          )}
        </div>
      ),
    },
    {
      title: 'College / Institution Name',
      render: () => (
        <div className="form-group">
          <input className="form-input" placeholder="Optional" value={form.college_name}
            onChange={e=>set('college_name',e.target.value)} />
        </div>
      ),
    },
    {
      title: 'Employment Type & Profession',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Employment Type</label>
            <select className="form-select" value={form.employment_type} onChange={e=>set('employment_type',e.target.value)}>
              <option value="">Select</option>
              {EMPLOYMENT_TYPES.map(e=><option key={e}>{e}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Profession Category</label>
            <select className="form-select" value={form.profession} onChange={e=>set('profession',e.target.value)}>
              <option value="">Select</option>
              {PROFESSION_CATEGORIES.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      ),
    },
    {
      title: 'Occupation',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Current Occupation *</label>
            <input className="form-input" placeholder="Software Engineer, Doctor..." value={form.occupation}
              onChange={e=>set('occupation',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Working As</label>
            <select className="form-select" value={form.working_as} onChange={e=>set('working_as',e.target.value)}>
              <option value="">Select</option>
              {WORKING_AS_OPTIONS.map(w=><option key={w}>{w}</option>)}
            </select>
          </div>
        </div>
      ),
    },
    {
      title: 'Employer & Work Location',
      render: () => (
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
      ),
    },
    {
      title: 'Annual Income',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Annual Income</label>
            <select className="form-select" value={form.annual_income}
              onChange={e=>set('annual_income',e.target.value)}>
              {(form.annual_income_currency === 'USD' ? USD_INCOME_RANGES : INCOME_RANGES).map(i=><option key={i}>{i}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Currency</label>
            <select className="form-select" value={form.annual_income_currency} onChange={e=>{
              setForm(p=>({...p, annual_income_currency:e.target.value, annual_income:''}))
            }}>
              {CURRENCIES.map(c=><option key={c} value={c}>{c === 'INR' ? '₹ INR' : '$ USD'}</option>)}
            </select>
          </div>
        </div>
      ),
    },
  ]

  const lifestyleBlocks = () => [
    {
      title: 'Diet *',
      render: () => (
        <div className="form-group">
          <div className="radio-group">
            {DIETS.map(d=>(
              <div key={d} className={'radio-option ' + (form.diet===d?'selected':'')} onClick={()=>set('diet',d)}>
                {form.diet===d?'◉':'○'} {d}
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: 'Smoking & Drinking',
      render: () => (
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
      ),
    },
    {
      title: 'Hobbies & Interests',
      subtitle: 'Separate with commas',
      render: () => (
        <div className="form-group">
          <input className="form-input" placeholder="Reading, Travel, Music, Cricket..." value={form.hobbies}
            onChange={e=>set('hobbies',e.target.value)} />
        </div>
      ),
    },
    {
      title: `Interests (select up to ${HOBBIES_MAX_SELECT})`,
      render: () => (
        <div className="form-group">
          <MultiSelectChips
            groups={HOBBIES_INTERESTS}
            selected={form.hobbies_interests}
            onChange={(v)=>set('hobbies_interests',v)}
            maxSelect={HOBBIES_MAX_SELECT}
          />
        </div>
      ),
    },
    {
      title: 'Favourite Cuisines',
      render: () => (
        <div className="form-group">
          <MultiSelectChips
            options={CUISINES}
            selected={form.cuisines}
            onChange={(v)=>set('cuisines',v)}
          />
        </div>
      ),
    },
    {
      title: 'Sports & Activities',
      render: () => (
        <div className="form-group">
          <MultiSelectChips
            options={SPORTS_LIST}
            selected={form.sports}
            onChange={(v)=>set('sports',v)}
          />
        </div>
      ),
    },
    {
      title: 'Favourite Music',
      render: () => (
        <div className="form-group">
          <MultiSelectChips options={FAVOURITE_MUSIC} selected={form.favourite_music} onChange={(v)=>set('favourite_music',v)} />
        </div>
      ),
    },
    {
      title: 'Favourite Books',
      render: () => (
        <div className="form-group">
          <MultiSelectChips options={FAVOURITE_BOOKS} selected={form.favourite_books} onChange={(v)=>set('favourite_books',v)} />
        </div>
      ),
    },
    {
      title: 'Dress Style',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.dress_style} onChange={e=>set('dress_style',e.target.value)}>
            <option value="">Select</option>
            {DRESS_STYLES.map(d=><option key={d}>{d}</option>)}
          </select>
        </div>
      ),
    },
    {
      title: 'About Me *',
      render: () => (
        <div className="form-group">
          <textarea className="form-textarea" placeholder="Tell us about yourself, your personality, what you're looking for..."
            value={form.about_me} onChange={e=>set('about_me',e.target.value)} style={{minHeight:120}} />
          <div className="form-hint">{form.about_me?.length||0} characters (minimum 50)</div>
        </div>
      ),
    },
  ]

  const familyBlocks = () => [
    {
      title: 'Family Type *',
      render: () => (
        <div className="form-group">
          <div className="radio-group">
            {FAMILY_TYPES.map(f=>(
              <div key={f} className={'radio-option ' + (form.family_type===f?'selected':'')} onClick={()=>set('family_type',f)}>
                {form.family_type===f?'◉':'○'} {f} Family
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: 'Family Values',
      render: () => (
        <div className="form-group">
          <div className="radio-group">
            {FAMILY_VALUES.map(f=>(
              <div key={f} className={'radio-option ' + (form.family_values===f?'selected':'')} onClick={()=>set('family_values',f)}>
                {form.family_values===f?'◉':'○'} {f}
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "Father's & Mother's Profession",
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Father's Profession</label>
            <select className="form-select" value={form.father_profession} onChange={e=>set('father_profession',e.target.value)}>
              <option value="">Select</option>
              {PROFESSION_CATEGORIES.map(p=><option key={p}>{p}</option>)}
              <option value="Retired">Retired</option>
              <option value="Other">Other</option>
              <option value="Passed Away">Passed Away</option>
            </select>
            {form.father_profession === 'Other' && (
              <input className="form-input" style={{marginTop:8}} placeholder="Please specify"
                value={form.father_profession_other} onChange={e=>set('father_profession_other',e.target.value)} />
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Mother's Profession</label>
            <select className="form-select" value={form.mother_profession} onChange={e=>set('mother_profession',e.target.value)}>
              <option value="">Select</option>
              <option value="Homemaker">Homemaker</option>
              {PROFESSION_CATEGORIES.map(p=><option key={p}>{p}</option>)}
              <option value="Retired">Retired</option>
              <option value="Other">Other</option>
              <option value="Passed Away">Passed Away</option>
            </select>
            {form.mother_profession === 'Other' && (
              <input className="form-input" style={{marginTop:8}} placeholder="Please specify"
                value={form.mother_profession_other} onChange={e=>set('mother_profession_other',e.target.value)} />
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Brothers',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Brothers</label>
            <select className="form-select" value={form.brothers_count}
              onChange={e=>setSiblingCount('brothers_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Brothers Married</label>
            <select className="form-select" value={form.brothers_married_count}
              onChange={e=>setSiblingCount('brothers_married_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.filter(n=>n<=form.brothers_count).map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      ),
    },
    {
      title: 'Sisters',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Sisters</label>
            <select className="form-select" value={form.sisters_count}
              onChange={e=>setSiblingCount('sisters_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Sisters Married</label>
            <select className="form-select" value={form.sisters_married_count}
              onChange={e=>setSiblingCount('sisters_married_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.filter(n=>n<=form.sisters_count).map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      ),
    },
    {
      title: 'Family City',
      render: () => (
        <div className="form-group">
          <input className="form-input" placeholder="Delhi, Mumbai..." value={form.family_city}
            onChange={e=>set('family_city',e.target.value)} />
        </div>
      ),
    },
    {
      title: 'Own House',
      render: () => (
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
      ),
    },
    {
      title: 'Family Income Range',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Family Income Range</label>
            <select className="form-select" value={form.family_income_range} onChange={e=>set('family_income_range',e.target.value)}>
              <option value="">Select</option>
              {(form.family_income_currency === 'USD' ? USD_FAMILY_INCOME_RANGES : FAMILY_INCOME_RANGES).map(f=><option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Currency</label>
            <select className="form-select" value={form.family_income_currency} onChange={e=>{
              setForm(p=>({...p, family_income_currency:e.target.value, family_income_range:''}))
            }}>
              {CURRENCIES.map(c=><option key={c} value={c}>{c === 'INR' ? '₹ INR' : '$ USD'}</option>)}
            </select>
          </div>
        </div>
      ),
    },
    {
      title: 'Property',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Property Type</label>
            <select className="form-select" value={form.property_type} onChange={e=>set('property_type',e.target.value)}>
              <option value="">Select</option>
              {PROPERTY_TYPES.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Property Ownership</label>
            <select className="form-select" value={form.property_ownership} onChange={e=>set('property_ownership',e.target.value)}>
              <option value="">Select</option>
              {PROPERTY_OWNERSHIP.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      ),
    },
    {
      title: 'Property Location',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Property City</label>
            <input className="form-input" placeholder="Optional" value={form.property_city}
              onChange={e=>set('property_city',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Property State</label>
            <input className="form-input" placeholder="Optional" value={form.property_state}
              onChange={e=>set('property_state',e.target.value)} />
          </div>
        </div>
      ),
    },
    {
      title: 'Property Country & Size',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Property Country</label>
            <input className="form-input" value={form.property_country}
              onChange={e=>set('property_country',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Property Size</label>
            <input className="form-input" placeholder="Optional, e.g. 1200 sq.ft" value={form.property_size}
              onChange={e=>set('property_size',e.target.value)} />
          </div>
        </div>
      ),
    },
    {
      title: 'Vehicle',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Vehicle Ownership</label>
            <select className="form-select" value={form.vehicle_ownership} onChange={e=>set('vehicle_ownership',e.target.value)}>
              <option value="">Select</option>
              {VEHICLE_OWNERSHIP.map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Vehicle Details</label>
            <input className="form-input" placeholder="Optional, e.g. Hyundai Creta" value={form.vehicle_model}
              onChange={e=>set('vehicle_model',e.target.value)} />
          </div>
        </div>
      ),
    },
    {
      title: 'Business / Commercial Asset',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Business / Commercial Asset</label>
            <select className="form-select" value={form.business_asset_type} onChange={e=>set('business_asset_type',e.target.value)}>
              <option value="">Select</option>
              {BUSINESS_ASSET_TYPES.map(b=><option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Business Detail</label>
            <input className="form-input" placeholder="Optional, e.g. Garment Business" value={form.business_detail}
              onChange={e=>set('business_detail',e.target.value)} />
          </div>
        </div>
      ),
    },
    {
      title: 'Family Status',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Family Status</label>
            <select className="form-select" value={form.family_status} onChange={e=>set('family_status',e.target.value)}>
              <option value="">Select</option>
              {FAMILY_STATUS_OPTIONS.map(f=><option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Family Financial Status</label>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {FAMILY_FINANCIAL_STATUS.map(f=>{
                const isSelected = form.family_financial_status === f.label
                return (
                  <div key={f.label} onClick={()=>set('family_financial_status', f.label)}
                    style={{border:'1.5px solid ' + (isSelected ? '#000' : 'rgba(0,0,0,0.1)'), borderRadius:10, overflow:'hidden', cursor:'pointer'}}>
                    <div style={{padding:'12px 16px', fontWeight:600, fontSize:14,
                      background: isSelected ? '#000' : 'transparent', color: isSelected ? '#fff' : '#333'}}>
                      {isSelected ? '◉' : '○'} {f.label}
                    </div>
                    {isSelected && (
                      <div style={{padding:'10px 16px 14px', fontSize:12, color:'#555', lineHeight:1.6}}>
                        <div>{f.desc}</div>
                        <div style={{marginTop:4, fontWeight:500}}>Annual family income: {f.range}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Living With Parents?',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.living_with_parents} onChange={e=>set('living_with_parents',e.target.value)}>
            <option value="">Select</option>
            {LIVING_WITH_PARENTS_OPTIONS.map(l=><option key={l}>{l}</option>)}
          </select>
        </div>
      ),
    },
    {
      title: 'Profile Managed By',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Profile Managed By</label>
            <select className="form-select" value={form.profile_managed_by} onChange={e=>set('profile_managed_by',e.target.value)}>
              <option value="">Select</option>
              {PROFILE_MANAGED_BY.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Alternate Email</label>
            <input className="form-input" placeholder="Optional" value={form.alternate_email}
              onChange={e=>set('alternate_email',e.target.value)} />
          </div>
        </div>
      ),
    },
  ]

  const preferencesBlocks = () => [
    {
      title: 'Age Preference',
      render: () => (
        <div className="form-group">
          <DualRangeSlider min={18} max={70}
            valueMin={form.partner_age_min} valueMax={form.partner_age_max}
            onChange={(lo,hi)=>setForm(p=>({...p, partner_age_min:lo, partner_age_max:hi}))}
            formatLabel={v=>v+' yrs'} />
        </div>
      ),
    },
    {
      title: 'Height Preference',
      render: () => (
        <div className="form-group">
          <DualRangeSlider min={PARTNER_HEIGHT_MIN_INCHES} max={PARTNER_HEIGHT_MAX_INCHES}
            valueMin={form.partner_height_min} valueMax={form.partner_height_max}
            onChange={(lo,hi)=>setForm(p=>({...p, partner_height_min:lo, partner_height_max:hi}))}
            formatLabel={formatHeightFromInches} />
        </div>
      ),
    },
    {
      title: 'Income Preference',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.partner_income_currency} onChange={e=>{
            const bounds = PARTNER_INCOME_BOUNDS[e.target.value]
            setForm(p=>({...p, partner_income_currency:e.target.value, partner_income_min:bounds.min, partner_income_max:bounds.max}))
          }} style={{marginBottom:8, maxWidth:140}}>
            {CURRENCIES.map(c=><option key={c} value={c}>{c === 'INR' ? '₹ INR' : '$ USD'}</option>)}
          </select>
          <DualRangeSlider min={PARTNER_INCOME_BOUNDS[form.partner_income_currency].min}
            max={PARTNER_INCOME_BOUNDS[form.partner_income_currency].max}
            valueMin={form.partner_income_min} valueMax={form.partner_income_max}
            onChange={(lo,hi)=>setForm(p=>({...p, partner_income_min:lo, partner_income_max:hi}))}
            formatLabel={v=>{
              const symbol = form.partner_income_currency === 'INR' ? '₹' : '$'
              const isMax = v === PARTNER_INCOME_BOUNDS[form.partner_income_currency].max
              return symbol + v.toLocaleString(form.partner_income_currency === 'INR' ? 'en-IN' : 'en-US') + (isMax ? '+' : '')
            }} />
        </div>
      ),
    },
    {
      title: 'Religion Preference',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.partner_religion} onChange={e=>set('partner_religion',e.target.value)}>
            <option value="Any">Any / Open to all</option>
            {RELIGIONS.map(r=><option key={r}>{r}</option>)}
          </select>
        </div>
      ),
    },
    {
      title: 'Preferred Community',
      skip: () => form.partner_religion === 'Any',
      render: () => (
        <div className="form-group">
          <MultiSelectChips
            options={[
              ...(form.partner_religion === 'Muslim' ? ISLAMIC_COMMUNITIES
                : form.partner_religion === 'Christian' ? CHRISTIAN_COMMUNITIES
                : RELIGION_HIERARCHY[form.partner_religion]?.community.options
                || CASTES
              ).filter(c => !/^(other|others|don'?t)/i.test(c)),
              ...PARTNER_COMMUNITY_SPECIAL_OPTIONS,
            ]}
            selected={form.partner_community_ids}
            onChange={setPartnerCommunity}
          />
          <div className="form-hint">"Any Community / No Bar" select karne par baaki communities apne aap unselect ho jaayengi</div>
        </div>
      ),
    },
    {
      title: 'Location Preference',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.partner_location} onChange={e=>set('partner_location',e.target.value)}>
            {LOCATION_PREFERENCES.map(l=><option key={l}>{l}</option>)}
          </select>
        </div>
      ),
    },
    {
      title: 'Partner City & State Preference',
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Partner City Preference</label>
            <input className="form-input" placeholder="Optional" value={form.partner_city_preference}
              onChange={e=>set('partner_city_preference',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Partner State Preference</label>
            <input className="form-input" placeholder="Optional" value={form.partner_state_preference}
              onChange={e=>set('partner_state_preference',e.target.value)} />
          </div>
        </div>
      ),
    },
    {
      title: 'Partner Country Preference',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.partner_country_preference} onChange={e=>set('partner_country_preference',e.target.value)}>
            {COUNTRIES.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
      ),
    },
    {
      title: 'Education Level Preference',
      render: () => (
        <div className="form-group">
          <MultiSelectChips options={EDUCATIONS} selected={form.partner_education_level_preferences}
            onChange={v=>set('partner_education_level_preferences',v)} />
          <div className="form-hint">Khaali chhodne par sab education levels acceptable maane jaayenge</div>
        </div>
      ),
    },
    {
      title: 'Additional Notes',
      render: () => (
        <div className="form-group">
          <textarea className="form-textarea" placeholder="Any other preferences or expectations..."
            value={form.partner_notes} onChange={e=>set('partner_notes',e.target.value)} />
        </div>
      ),
    },
  ]

  const privacyBlocks = () => [
    { title: 'Who can see your Community/Caste?', render: () => (
      <div className="form-group">
        <select className="form-select" value={form.community_privacy} onChange={e=>set('community_privacy',e.target.value)}>
          {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
        </select>
      </div>
    )},
    { title: 'Who can see your College/Institution Name?', render: () => (
      <div className="form-group">
        <select className="form-select" value={form.college_privacy} onChange={e=>set('college_privacy',e.target.value)}>
          {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
        </select>
      </div>
    )},
    { title: 'Who can see your Company Name?', render: () => (
      <div className="form-group">
        <select className="form-select" value={form.company_privacy} onChange={e=>set('company_privacy',e.target.value)}>
          {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
        </select>
      </div>
    )},
    { title: 'Who can see your Income?', render: () => (
      <div className="form-group">
        <select className="form-select" value={form.income_privacy} onChange={e=>set('income_privacy',e.target.value)}>
          {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
        </select>
      </div>
    )},
    { title: 'Who can see your Property details?', render: () => (
      <div className="form-group">
        <select className="form-select" value={form.property_privacy} onChange={e=>set('property_privacy',e.target.value)}>
          {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
        </select>
      </div>
    )},
    { title: 'Who can see your Business/Commercial Asset details?', render: () => (
      <div className="form-group">
        <select className="form-select" value={form.business_privacy} onChange={e=>set('business_privacy',e.target.value)}>
          {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
        </select>
      </div>
    )},
    { title: 'Who can see your Contact Details?', render: () => (
      <div className="form-group">
        <select className="form-select" value={form.contact_privacy} onChange={e=>set('contact_privacy',e.target.value)}>
          {PRIVACY_LEVELS.map(p=><option key={p}>{p}</option>)}
        </select>
      </div>
    )},
  ]

  const getStepBlocks = (s) => {
    if (s===1) return religionBlocks()
    if (s===2) return locationBlocks()
    if (s===3) return educationBlocks()
    if (s===4) return lifestyleBlocks()
    if (s===5) return familyBlocks()
    if (s===6) return preferencesBlocks()
    if (s===7) return privacyBlocks()
    return []
  }

  const isBlockVisible = (blocks, idx) => !(blocks[idx].skip && blocks[idx].skip())
  const lastVisibleBlockIndex = (blocks) => {
    for (let i=blocks.length-1;i>=0;i--) if (isBlockVisible(blocks,i)) return i
    return 0
  }

  const goNextOverall = () => {
    const blocks = getStepBlocks(step)
    const idx = Math.min(subQ, blocks.length-1)
    const blk = blocks[idx]
    if (blk.validate) {
      const err = blk.validate()
      if (err) { showToast(err); return }
    }
    let next = idx+1
    while (next < blocks.length && !isBlockVisible(blocks, next)) next++
    if (next < blocks.length) { setSubQ(next); return }
    if (step < STEPS.length-1) { setStep(s=>s+1); setSubQ(0) }
  }

  const goBackOverall = () => {
    if (subQ > 0) {
      const blocks = getStepBlocks(step)
      let prev = subQ-1
      while (prev >= 0 && !isBlockVisible(blocks, prev)) prev--
      if (prev < 0) prev = 0
      setSubQ(prev)
      return
    }
    if (step > 0) {
      const prevStep = step-1
      setStep(prevStep)
      if (prevStep > 0) setSubQ(lastVisibleBlockIndex(getStepBlocks(prevStep)))
    }
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(()=>setToast(''),3000)
  }

  // "Others / Not in list" (community/gotra) — fire-and-forget, doesn't
  // block save. Increments times_suggested if the same name was already
  // suggested for this religion.
  const suggestCaste = ({ religion, denomination, suggested_name, field_type }) => {
    if (!suggested_name) return
    supabase.rpc('upsert_caste_suggestion', {
      p_religion: religion, p_denomination: denomination || null,
      p_suggested_name: suggested_name, p_field_type: field_type,
      p_submitted_by: null,
    }).then(({ error }) => { if (error) console.error(error.message) })
  }

  const [photoErrors, setPhotoErrors] = useState(Array(2).fill(null))
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
    if (idx === 0) return // Profile photo can only be replaced, not removed
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
      const communityIsOther = form.community === 'Other' || form.community === 'Others / Not in list'
      const finalCommunity = communityIsOther ? (form.community_other || form.custom_caste_text) : form.community
      const finalMotherTongue = form.mother_tongue === 'Other' ? form.mother_tongue_other : form.mother_tongue
      const gotraIsOther = form.gotra === 'Other' || form.gotra === 'Others / Not in list'
      const finalGotra = gotraIsOther ? (form.gotra_other || form.custom_caste_text_gotra) : form.gotra
      const degreeIsOther = form.degree === 'Others / Not in list'
      const finalDegree = degreeIsOther ? form.degree_other : form.degree
      const finalFatherProfession = form.father_profession === 'Other' ? form.father_profession_other : form.father_profession
      const finalMotherProfession = form.mother_profession === 'Other' ? form.mother_profession_other : form.mother_profession

      const denominationValue = form.islamic_denomination || form.christian_denomination || form.religion_denomination || null

      if (communityIsOther && (form.community_other || form.custom_caste_text)) {
        suggestCaste({
          religion: form.religion, denomination: denominationValue,
          suggested_name: form.community_other || form.custom_caste_text, field_type: 'caste',
        })
      }
      if (gotraIsOther && (form.gotra_other || form.custom_caste_text_gotra)) {
        suggestCaste({
          religion: form.religion, denomination: denominationValue,
          suggested_name: form.gotra_other || form.custom_caste_text_gotra, field_type: 'gotra',
        })
      }
      if (degreeIsOther && form.degree_other) {
        suggestCaste({
          religion: form.religion, denomination: denominationValue,
          suggested_name: form.degree_other, field_type: 'degree',
        })
      }

      // community_other/mother_tongue_other/gotra_other/custom_caste_text_gotra
      // sirf UI helper fields hain — "profiles" table mein aisa koi column
      // nahi hai (custom_caste_text aur degree_other real columns hain,
      // isliye unhe yahan nahi nikaala), isliye insert se pehle inhe
      // nikaal dete hain (warna database error aayega).
      const { community_other, mother_tongue_other, gotra_other, custom_caste_text_gotra,
        father_profession_other, mother_profession_other, ...formToSave } = form

      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .insert({
          user_id: adminMode ? null : user.id,
          is_admin_managed: !!adminMode,
          managed_by_staff_id: adminMode ? user.id : null,
          profile_status: adminMode ? 'active' : 'pending', // Admin khud bana/verify kar raha hai, isliye seedha Active — customer-submitted profiles abhi bhi review ke liye Pending rehti hain
          profile_code: code,
          ...formToSave,
          full_name: fullName,
          community: finalCommunity,
          mother_tongue: finalMotherTongue,
          gotra: finalGotra,
          degree: finalDegree,
          father_profession: finalFatherProfession,
          mother_profession: finalMotherProfession,
          age: ageCheck.age,
          partner_age_min: parseInt(form.partner_age_min) || null,
          partner_age_max: parseInt(form.partner_age_max) || null,
          partner_height_min: parseInt(form.partner_height_min) || null,
          partner_height_max: parseInt(form.partner_height_max) || null,
          partner_income_min: parseInt(form.partner_income_min) || null,
          partner_income_max: parseInt(form.partner_income_max) || null,
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
            photo_type: i===0 ? 'profile' : 'secondary'
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

  const stepBlocksForPct = (step>=1 && step<=7) ? getStepBlocks(step) : null
  const pct = step===0
    ? Math.round((((personalQ+1)/PERSONAL_QUESTIONS.length)/STEPS.length)*100)
    : stepBlocksForPct
    ? Math.round((((Math.min(subQ,stepBlocksForPct.length-1)+1)/stepBlocksForPct.length)/STEPS.length + step/STEPS.length)*100)
    : Math.round(((step+1)/STEPS.length)*100)

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
              onClick={()=>{ if(i<step){ setStep(i); setSubQ(0) } }}>
              {i<step?'✓ ':''}{s}
            </div>
          ))}
        </div>
      </div>

      <div className="page-container">

        {step===0 && (() => {
          const q = PERSONAL_QUESTIONS[personalQ]
          return (
          <div>
            {personalQ===0 && (
              <div style={{fontSize:12,color:'#8e8e8e',marginBottom:8}}>Personal Details</div>
            )}
            <div style={{fontSize:11,color:'#8e8e8e',marginBottom:6}}>Question {personalQ+1} of {PERSONAL_QUESTIONS.length}</div>
            <h2 className="page-title">{q.label}{q.required?' *':''}</h2>
            {q.hint && <p className="page-subtitle">{q.hint}</p>}

            {personalQ===0 && adminMode && (
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
              {q.type==='text' && (
                <input className="form-input" placeholder={q.placeholder} value={form[q.key]}
                  onChange={e=>set(q.key,e.target.value)} autoFocus
                  onKeyDown={e=>{ if(e.key==='Enter') goToNextPersonalQ() }} />
              )}

              {q.type==='date' && (
                <>
                  <input className="form-input" type="date" value={form.date_of_birth}
                    min={dobInputBounds().min} max={dobInputBounds().max}
                    onChange={e=>set('date_of_birth',e.target.value)} autoFocus />
                  {form.date_of_birth && (() => {
                    const check = validateAge(form.date_of_birth, form.gender)
                    return (
                      <div style={{fontSize:12, marginTop:4, color: check.valid ? '#16a34a' : '#dc2626'}}>
                        {check.valid ? `Age: ${check.age} years` : check.message}
                      </div>
                    )
                  })()}
                </>
              )}

              {q.type==='chips' && (
                <div className="radio-group">
                  {q.options.map(o=>(
                    <div key={o} className={'radio-option ' + (form[q.key]===o?'selected':'')} onClick={()=>set(q.key,o)}>
                      {form[q.key]===o?'◉':'○'} {o}
                    </div>
                  ))}
                </div>
              )}

              {q.type==='select' && (
                <select className="form-select" value={form[q.key]} onChange={e=>set(q.key,e.target.value)} autoFocus>
                  <option value="">Select</option>
                  {q.options.map(o=><option key={o}>{o}</option>)}
                </select>
              )}

              {q.type==='multiselect' && (
                <CheckboxDropdown options={q.options} selected={form[q.key]}
                  onChange={v=>set(q.key,v)} placeholder={q.placeholder} />
              )}
            </div>
          </div>
          )
        })()}

        {step>=1 && step<=7 && (() => {
          const blocks = getStepBlocks(step)
          const idx = Math.min(subQ, blocks.length-1)
          const blk = blocks[idx]
          return (
            <div>
              <div style={{fontSize:11,color:'#8e8e8e',marginBottom:6}}>Question {idx+1} of {blocks.length}</div>
              <h2 className="page-title">{blk.title}</h2>
              {blk.subtitle && <p className="page-subtitle">{blk.subtitle}</p>}
              {blk.render()}
            </div>
          )
        })()}
        {step===8 && (
          <div>
            <h2 className="page-title">Your Photos</h2>
            <p className="page-subtitle">Profile photo required, Secondary photo optional.</p>

            <div className="notice" style={{marginBottom:20}}>
              <strong>Photo Guidelines:</strong> Photo <strong>full standing</strong> honi chahiye (sirf face/headshot nahi) — bina kisi filter ke, natural lighting mein, bina sunglasses/edited-image ke. Yeh isliye zaroori hai taaki family/partner ko aapki real, honest tasveer dikhe.
            </div>

            <div className="photo-grid" style={{gridTemplateColumns:'repeat(2, 1fr)'}}>
              {photos.map((photo, idx)=>(
                <div key={idx} className={'photo-slot ' + (photo?'filled':'')}
                  onClick={()=>!photo&&fileRefs.current[idx].current.click()}>
                  {photo ? (
                    <>
                      <img src={photo} alt="" style={{opacity: compressingIdx===idx ? 0.5 : 1}} />
                      {compressingIdx===idx && (
                        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#fff',background:'rgba(0,0,0,0.3)'}}>Processing...</div>
                      )}
                      {idx===0 ? (
                        <button className="remove-btn" onClick={e=>{e.stopPropagation();fileRefs.current[idx].current.click()}} title="Change Photo">↻</button>
                      ) : (
                        <button className="remove-btn" onClick={e=>{e.stopPropagation();removePhoto(idx)}}>✕</button>
                      )}
                      <div style={{position:'absolute',bottom:4,left:4,background:'rgba(0,0,0,0.7)',color:'#fff',fontSize:9,padding:'2px 6px',borderRadius:4,letterSpacing:'0.1em'}}>{idx===0?'PROFILE':'SECONDARY'}</div>
                    </>
                  ) : (
                    <>
                      <span style={{fontSize:24,opacity:0.25}}>+</span>
                      <span style={{fontSize:9,opacity:0.35,letterSpacing:'0.1em'}}>{idx===0?'PROFILE PHOTO *':'SECONDARY PHOTO'}</span>
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
          {step===0 ? (
            personalQ>0 && (
              <button className="btn btn-outline" style={{flex:1}} onClick={goToPrevPersonalQ}>← Back</button>
            )
          ) : step>=1 && step<=7 ? (
            <button className="btn btn-outline" style={{flex:1}} onClick={goBackOverall}>← Back</button>
          ) : (
            step>0&&(
              <button className="btn btn-outline" style={{flex:1}} onClick={()=>setStep(s=>s-1)}>← Back</button>
            )
          )}
          {step===0 ? (
            <button className="btn btn-black" style={{flex:2}} onClick={goToNextPersonalQ}>
              Continue →
            </button>
          ) : step<STEPS.length-1 ? (
            <button className="btn btn-black" style={{flex:2}} onClick={goNextOverall}>
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
