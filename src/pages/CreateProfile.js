import React, { useState, useRef } from 'react'
import { FormLabel } from '../components/ui'
import { iconForLabel } from '../components/fieldIcons'
import {
  User, Landmark, GraduationCap, Coffee, Users, Camera, Check, ChevronLeft, ArrowRight,
  RefreshCw, X, Plus, Info, ShieldCheck, Sparkles,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase, generateProfileCode } from '../supabase'

import {
  EDUCATIONS,
  DEGREE_OPTIONS,
  HEIGHT_RANGES,
  INCOME_RANGES,
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
  COUNTRIES,
  MANGLIK_OPTIONS,
  EMPLOYMENT_TYPES,
  USD_INCOME_RANGES,
  PROFESSION_CATEGORIES,
  LANGUAGES_SPOKEN,
  HAVE_CHILDREN_OPTIONS,
  CHILDREN_LIVING_WITH_OPTIONS,
  PARTNER_HEIGHT_MIN_INCHES,
  PARTNER_HEIGHT_MAX_INCHES,
  PARTNER_INCOME_BOUNDS,
  PROFILE_FOR_OPTIONS,
  PROFILE_FOR_GENDER,
  SCHOOL_ONLY_EDUCATIONS,
} from '../constants/profileOptions'
import CheckboxDropdown from '../components/CheckboxDropdown'
import { compressImage } from '../utils/compressImage'
import { calculateAge, validateAge, dobInputBounds } from '../utils/ageUtils'
import { calculateSectionCompleteness } from '../utils/completeness'
import SignupComplete from './SignupComplete'
import { BrandLockup } from '../components/BrandLogo'

// Single-choice fields render as a native <select> dropdown — keeps the
// screen compact instead of spreading every option out as chips. Long
// lists (castes, gotras, countries, degrees, mother tongues...) already
// use <select>; this makes short lists (manglik, gotra, etc.) consistent
// with them instead of taking up the whole screen as chips.
function ChipSelect({ options, value, onChange, includeEmpty, emptyLabel }) {
  return (
    <select className="form-select" value={value || ''} onChange={e=>onChange(e.target.value)}>
      {includeEmpty && <option value="">{emptyLabel || 'Not specified'}</option>}
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  )
}

const STEPS = ['Personal','Religion & Community','Education','Lifestyle','Family','Photos']
// Har step ka icon — step tabs aur question badge dono mein use hota hai
const STEP_ICONS = [User, Landmark, GraduationCap, Coffee, Users, Camera]
const SIBLING_COUNT_OPTIONS = Array.from({length:11}, (_,i)=>i) // 0-10

// Personal Details ab ek-ek sawaal karke (Jeevansathi jaisa one-question-
// per-screen) poocha jaata hai — har entry ek chhoti screen hai. `skip`
// function decide karta hai ki current form state me yeh question dikhana
// hai ya nahi (jaise "Children Living With" sirf tab jab have_children
// 'Yes' ho).
// Pehla sawaal "Who is this profile for?" hai, uske baad poora naam (First,
// Middle, Last) ek hi screen pe. Son/Daughter/Brother/Sister chunne par
// gender apne aap set ho jaata hai, isliye gender wali screen skip hoti hai.
const PERSONAL_QUESTIONS = [
  { key:'profile_for', label:'Who is this profile for?', type:'chips', required:true, options:PROFILE_FOR_OPTIONS },
  { key:'first_name', label:'What is your name?', type:'name', required:true },
  { key:'date_of_birth', label:'When were you born?', type:'date', required:true },
  { key:'gender', label:'What is your gender?', type:'chips', required:true, options:['Male','Female'],
    skip: f=>!!PROFILE_FOR_GENDER[f.profile_for] },
  { key:'height', label:'What is your height?', type:'select', options:HEIGHT_RANGES },
  { key:'marital_status', label:'What is your marital status?', type:'select', options:MARITAL_STATUSES },
  { key:'nationality', label:'What is your nationality?', type:'select', options:COUNTRIES.filter(c=>c!=='Open to All') },
  { key:'have_children', label:'Do you have children?', type:'select', options:HAVE_CHILDREN_OPTIONS,
    skip: f=>f.marital_status==='Never Married' },
  { key:'children_living_with', label:'Who do your children live with?', type:'select', options:CHILDREN_LIVING_WITH_OPTIONS,
    skip: f=>f.have_children!=='Yes' },
  { key:'languages_spoken', label:'Which languages do you speak?', type:'multiselect', options:LANGUAGES_SPOKEN, placeholder:'Select languages...' },
]
// Weight, Complexion, Body Type, Blood Group, Health Information, Grew Up In
// and Physical Disability were removed from the signup wizard (user's ask:
// too many screens for a new signup) — these still exist as DB columns and
// can be filled in later via Edit Profile.

// Profile kisi aur ke liye ban rahi ho to sawaal "your" ki jagah "their"
// mein poochhe jaate hain ("What is their name?").
const questionLabel = (label, form) => (!form.profile_for || form.profile_for === 'Myself')
  ? label
  : label.replace(/\bwere you\b/g, 'were they').replace(/\bdo you\b/g, 'do they').replace(/\byour\b/g, 'their')

// Default partner age range: ladke ke liye apni umar se thoda chhota
// (age-7 .. age+2), ladki ke liye thoda bada (age-2 .. age+8). Legal
// minimum (ladki 18, ladka 21) se neeche nahi jaata.
function defaultPartnerAgeRange(age, gender) {
  if (!age) return { partner_age_min: 18, partner_age_max: 40 }
  const clamp = v => Math.max(18, Math.min(70, v))
  return gender === 'Female'
    ? { partner_age_min: clamp(Math.max(21, age - 2)), partner_age_max: clamp(age + 8) }
    : { partner_age_min: clamp(age - 7), partner_age_max: clamp(age + 2) }
}

// Bada soft icon badge — har question screen ke upar (Jeevansathi/IG style)
function QuestionBadge({ label, fallback }) {
  const Icon = (label && iconForLabel(label)) || fallback
  return Icon ? <div className="q-badge"><Icon size={24} /></div> : null
}

export default function CreateProfile({ user, adminMode, onComplete }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [personalQ, setPersonalQ] = useState(0) // one-question-per-screen index within the Personal Details step
  const [subQ, setSubQ] = useState(0) // one-question-per-screen index for steps 1-7
  const [saving, setSaving] = useState(false)
  const [celebrating, setCelebrating] = useState(false) // true after a successful non-admin submit, shows SignupComplete
  const [createdProfile, setCreatedProfile] = useState(null)
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
    living_with_parents:'',
    zip_code:'', ethnic_origin:'',
    country_of_birth:'', time_of_birth_accuracy:'',
    caste_no_bar:'', favourite_music:[], favourite_books:[], dress_style:'',
    family_financial_status:'',
    company_privacy:'Matches Only', college_privacy:'Matches Only',
    vehicle_ownership:'', vehicle_model:'',
    income_privacy:'Private', contact_privacy:'Matches Only',
    profile_for:'', first_name:'', middle_name:'', last_name:'', gender:'Male', date_of_birth:'',
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
    native_place:'', relocation_preference:'',
    education:'Graduation', degree:'', degree_other:'', college_name:'',
    employment_type:'',
    employer:'', annual_income:'₹3–5L', annual_income_currency:'INR',
    diet:'Vegetarian', smoking:'Never', drinking:'Never',
    hobbies:'', about_me:'',
    family_type:'Nuclear', family_values:'Moderate',
    father_profession:'', father_profession_other:'', mother_profession:'', mother_profession_other:'', siblings:'',
    brothers_count:0, brothers_married_count:0, sisters_count:0, sisters_married_count:0,
    family_city:'', own_house:'', house_type:'',
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

  // Nationality badalne par income currency apne aap sync hoti hai — India
  // ke liye INR, kisi aur country ke liye USD (dono currencies dropdown mein
  // available rehti hain, yeh sirf ek sensible default set karta hai).
  const set = (k,v) => setForm(p=>{
    const next = {...p,[k]:v}
    if (k === 'profile_for' && PROFILE_FOR_GENDER[v]) next.gender = PROFILE_FOR_GENDER[v]
    if (k === 'education' && SCHOOL_ONLY_EDUCATIONS.includes(v)) { next.degree = ''; next.degree_other = '' }
    if (k === 'nationality') {
      const curr = v === 'India' ? 'INR' : 'USD'
      if (p.annual_income_currency !== curr) { next.annual_income_currency = curr; next.annual_income = '' }
      if (p.family_income_currency !== curr) { next.family_income_currency = curr; next.family_income_range = '' }
      if (p.partner_income_currency !== curr) {
        next.partner_income_currency = curr
        next.partner_income_min = PARTNER_INCOME_BOUNDS[curr].min
        next.partner_income_max = PARTNER_INCOME_BOUNDS[curr].max
      }
    }
    return next
  })

  const setCommunity = (v) => setForm(p=>({
    ...p,
    community: v,
    community_privacy: (SENSITIVE_COMMUNITIES.includes(v) && p.community_privacy === 'Matches Only')
      ? 'Private'
      : p.community_privacy,
  }))

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
    if (q.type==='name' && (!form.first_name.trim() || !form.last_name.trim())) { showToast('Please enter first name and last name'); return }
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
            <FormLabel>Religion *</FormLabel>
            <select className="form-select" value={form.religion} onChange={e=>set('religion',e.target.value)}>
              {RELIGIONS.map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <FormLabel>Mother Tongue</FormLabel>
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
            <FormLabel>Denomination / Sect</FormLabel>
            <ChipSelect options={ISLAMIC_DENOMINATIONS} value={form.islamic_denomination} onChange={v=>set('islamic_denomination',v)} includeEmpty />
          </div>
          {form.islamic_denomination === 'Sunni' && (
            <div className="form-group">
              <FormLabel>School of Thought (Madhab)</FormLabel>
              <ChipSelect options={SUNNI_SCHOOLS_OF_THOUGHT} value={form.islamic_school_of_thought} onChange={v=>set('islamic_school_of_thought',v)} includeEmpty />
            </div>
          )}
          {form.islamic_denomination === 'Shia' && (
            <div className="form-group">
              <FormLabel>Shia Branch</FormLabel>
              <ChipSelect options={SHIA_BRANCHES} value={form.islamic_shia_branch} onChange={v=>set('islamic_shia_branch',v)} includeEmpty />
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
            <FormLabel>Denomination</FormLabel>
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
              <FormLabel>{RELIGION_HIERARCHY[form.religion].denomination.label}</FormLabel>
              <select className="form-select" value={form.religion_denomination}
                onChange={e=>set('religion_denomination',e.target.value)}>
                <option value="">Select</option>
                {RELIGION_HIERARCHY[form.religion].denomination.options.map(d=><option key={d}>{d}</option>)}
              </select>
            </div>
          )}
          {form.religion === 'Zoroastrian' && (
            <div className="form-group">
              <FormLabel>{RELIGION_HIERARCHY[form.religion].community.label}</FormLabel>
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
            <FormLabel>
              {RELIGION_HIERARCHY[form.religion]?.community.label || 'Community / Caste'}
            </FormLabel>
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
            <FormLabel>Sub-Caste</FormLabel>
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
              <FormLabel>Gotra</FormLabel>
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
            <FormLabel>Manglik</FormLabel>
            <ChipSelect options={MANGLIK_OPTIONS} value={form.manglik} onChange={v=>set('manglik',v)} includeEmpty />
          </div>
        </div>
      ),
    },
  ]
  // Caste No Bar, Kundli Available, Birth Time, Birth Place, Horoscope
  // Match Required and Astrology Consent were removed from the signup
  // wizard (too many screens for a new signup) — fields still exist and
  // can be filled in later via Edit Profile.

  // The entire Location step (City & State, Country & Native Place,
  // Current Address, Zip Code & Ethnic Origin, Relocation Preference) was
  // removed from the signup wizard per the user's ask — "only citizenship
  // hi rakho" (Nationality is already asked in Personal Details). These
  // fields still exist and can be filled in later via Edit Profile.

  const educationBlocks = () => [
    {
      title: 'Highest Education',
      render: () => (
        <div className="form-group">
          <ChipSelect options={EDUCATIONS} value={form.education} onChange={v=>set('education',v)} />
        </div>
      ),
    },
    {
      title: 'Degree',
      skip: () => SCHOOL_ONLY_EDUCATIONS.includes(form.education),
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
      title: 'Employment Type',
      render: () => (
        <div className="form-group">
          <ChipSelect options={EMPLOYMENT_TYPES} value={form.employment_type} onChange={v=>set('employment_type',v)} includeEmpty />
        </div>
      ),
    },
    {
      title: 'Annual Income',
      render: () => (
        <div className="form-group">
          <select className="form-select" value={form.annual_income}
            onChange={e=>set('annual_income',e.target.value)}>
            <option value="">Select</option>
            {(form.annual_income_currency === 'USD' ? USD_INCOME_RANGES : INCOME_RANGES).map(i=><option key={i}>{i}</option>)}
          </select>
        </div>
      ),
    },
  ]
  // College/Institution Name, Occupation (+ Working As), Employer & Work
  // Location, and the Currency toggle (defaults to INR) were removed from
  // the signup wizard — fields still exist and can be filled in later via
  // Edit Profile.

  const lifestyleBlocks = () => [
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
  // Diet, Favourite Cuisines, Sports & Activities, Favourite Music,
  // Favourite Books, Smoking & Drinking, Hobbies & Interests (free text +
  // chips), and Dress Style were removed from the signup wizard — fields
  // still exist and can be filled in later via Edit Profile.

  const familyBlocks = () => [
    {
      title: "Father's & Mother's Profession",
      render: () => (
        <div className="form-row">
          <div className="form-group">
            <FormLabel>Father's Profession</FormLabel>
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
            <FormLabel>Mother's Profession</FormLabel>
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
            <FormLabel>Brothers</FormLabel>
            <select className="form-select" value={form.brothers_count}
              onChange={e=>setSiblingCount('brothers_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="form-group">
            <FormLabel>Brothers Married</FormLabel>
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
            <FormLabel>Sisters</FormLabel>
            <select className="form-select" value={form.sisters_count}
              onChange={e=>setSiblingCount('sisters_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="form-group">
            <FormLabel>Sisters Married</FormLabel>
            <select className="form-select" value={form.sisters_married_count}
              onChange={e=>setSiblingCount('sisters_married_count',e.target.value)}>
              {SIBLING_COUNT_OPTIONS.filter(n=>n<=form.sisters_count).map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      ),
    },
  ]
  // Family City, Family Type, Family Values, Family Income Range, Assets
  // (Own Vehicle / Own House), Family Financial Status and Living With
  // Parents are not asked in the signup wizard — they can be filled in
  // later via Edit Profile. Property, Business and Vehicle Details fields
  // were removed entirely. "Profile Managed By" is now the first signup
  // question ("Who is this profile for?", profiles.profile_for).

  // The entire Partner Preferences step (Age/Height/Income Preference,
  // Religion/Community/Location Preference, Partner City-State-Country
  // Preference, Education Level Preference, Additional Notes) was removed
  // from the signup wizard per the user's ask — fields still exist and
  // can be filled in later via Edit Profile.

  // All Privacy toggles (Community/College/Company/Income/Property/
  // Business/Contact) were removed from the signup wizard per the user's
  // ask — they keep their existing default values and can be managed
  // later via Account & Settings → Privacy Settings.

  const getStepBlocks = (s) => {
    if (s===1) return religionBlocks()
    if (s===2) return educationBlocks()
    if (s===3) return lifestyleBlocks()
    if (s===4) return familyBlocks()
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
    if(!form.first_name || !form.last_name || !form.date_of_birth) {
      showToast('Please fill required fields (First Name, Last Name, Date of Birth)'); return
    }

    const ageCheck = validateAge(form.date_of_birth, form.gender)
    if (!ageCheck.valid) {
      showToast(ageCheck.message)
      return
    }

    setSaving(true)
    try {
      const fullName = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ')
      const code = await generateProfileCode()
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
          // Partner Preferences signup mein nahi poochhi jaati, isliye age
          // range profile ke data se logically set hoti hai (baad mein Edit
          // Profile se badal sakte hain).
          ...defaultPartnerAgeRange(ageCheck.age, form.gender),
          partner_height_min: parseInt(form.partner_height_min) || null,
          partner_height_max: parseInt(form.partner_height_max) || null,
          partner_income_min: parseInt(form.partner_income_min) || null,
          partner_income_max: parseInt(form.partner_income_max) || null,
          profile_completeness: completeness(),
          completeness_breakdown: calculateSectionCompleteness(form, photoFiles.filter(Boolean).length)
        })
        .select().single()

      if(pErr) throw pErr

      // Profile ID metadata — admin-only audit record (kab bani, kaise
      // bani, kis admin ne banayi) alag table mein, taaki normal users
      // ko kabhi na dikhe (RLS staff-only hai).
      await supabase.from('profile_id_metadata').insert({
        profile_id: profile.id,
        source: adminMode ? 'admin-added' : 'self-registered',
        created_by: adminMode ? user.id : null,
      })

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
        if (adminMode) setTimeout(finish, 3500)
        else { setCreatedProfile(profile); setCelebrating(true) }
      } else {
        showToast('Profile created! Code: ' + code)
        if (adminMode) setTimeout(finish, 1500)
        else { setCreatedProfile(profile); setCelebrating(true) }
      }
    } catch(err) {
      showToast('Error: ' + err.message)
    }
    setSaving(false)
  }

  const stepBlocksForPct = (step>=1 && step<=4) ? getStepBlocks(step) : null
  const pct = step===0
    ? Math.round((((personalQ+1)/PERSONAL_QUESTIONS.length)/STEPS.length)*100)
    : stepBlocksForPct
    ? Math.round((((Math.min(subQ,stepBlocksForPct.length-1)+1)/stepBlocksForPct.length)/STEPS.length + step/STEPS.length)*100)
    : Math.round(((step+1)/STEPS.length)*100)

  if (celebrating) {
    return (
      <SignupComplete profile={createdProfile} photoPreview={photos[0]}
        onContinue={()=>navigate('/dashboard')} />
    )
  }

  return (
    <div style={{minHeight:'100vh',background:'#fff'}}>
      <div className={'toast ' + (toast?'show':'')}>{toast}</div>

      <div style={{position:'sticky',top:0,zIndex:90,background:'rgba(255,255,255,0.92)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',borderBottom:'1px solid var(--border)',padding:'12px 20px 4px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,maxWidth:480,marginLeft:'auto',marginRight:'auto'}}>
          <BrandLockup size={26} />
          <div style={{fontSize:12,color:'var(--gray3)'}}>{step+1}/{STEPS.length}</div>
        </div>
        <div className="progress-wrap"><div className="progress-fill" style={{width:pct+'%'}}></div></div>
        <div className="step-tabs">
          {STEPS.map((s,i)=>{
            const Icon = i<step ? Check : STEP_ICONS[i]
            return (
              <div key={s} className={'step-tab ' + (i===step?'active':i<step?'done':'')} title={s}
                onClick={()=>{ if(i<step){ setStep(i); setSubQ(0) } }}>
                <Icon size={14} />{i===step && <span>{s}</span>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="page-container">

        {step===0 && (() => {
          const q = PERSONAL_QUESTIONS[personalQ]
          return (
          <div>
            <QuestionBadge label={q.label} fallback={User} />
            <div style={{fontSize:11,color:'var(--gray3)',marginBottom:6}}>{personalQ+1} / {PERSONAL_QUESTIONS.length}</div>
            <h2 className="page-title">{questionLabel(q.label, form)}{q.required?' *':''}</h2>
            {q.hint && <p className="page-subtitle">{q.hint}</p>}

            {personalQ===0 && adminMode && (
              <div style={{background:'#fff8e1',borderRadius:12,padding:14,marginBottom:20}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:10}}>Client Contact (internal — used to share matches, never shown on public profile)</div>
                <div className="form-row">
                  <div className="form-group">
                    <FormLabel>Client Phone / WhatsApp</FormLabel>
                    <input className="form-input" placeholder="9876543210" value={form.client_phone}
                      onChange={e=>set('client_phone',e.target.value)} />
                  </div>
                  <div className="form-group">
                    <FormLabel>Client Email</FormLabel>
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

              {q.type==='name' && (
                <>
                  <FormLabel>First Name *</FormLabel>
                  <input className="form-input" placeholder="As per records" value={form.first_name}
                    onChange={e=>set('first_name',e.target.value)} autoFocus />
                  <FormLabel style={{marginTop:14}}>Middle Name</FormLabel>
                  <input className="form-input" placeholder="Optional" value={form.middle_name}
                    onChange={e=>set('middle_name',e.target.value)} />
                  <FormLabel style={{marginTop:14}}>Last Name / Surname *</FormLabel>
                  <input className="form-input" placeholder="As per records" value={form.last_name}
                    onChange={e=>set('last_name',e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter') goToNextPersonalQ() }} />
                </>
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
                      <span className="radio-dot">{form[q.key]===o && <Check size={12} />}</span> {o}
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

        {step>=1 && step<=4 && (() => {
          const blocks = getStepBlocks(step)
          const idx = Math.min(subQ, blocks.length-1)
          const blk = blocks[idx]
          return (
            <div>
              <QuestionBadge label={blk.title} fallback={STEP_ICONS[step]} />
              <div style={{fontSize:11,color:'var(--gray3)',marginBottom:6}}>{idx+1} / {blocks.length}</div>
              <h2 className="page-title">{blk.title}</h2>
              {blk.subtitle && <p className="page-subtitle">{blk.subtitle}</p>}
              {blk.render()}
            </div>
          )
        })()}
        {step===5 && (
          <div>
            <QuestionBadge fallback={Camera} />
            <h2 className="page-title">Your Photos</h2>
            <p className="page-subtitle">1 required · 1 optional</p>

            <div className="notice" style={{marginBottom:20,display:'flex',gap:10}}>
              <Info size={18} style={{color:'var(--primary)',flexShrink:0,marginTop:2}} />
              <span><strong>Full standing</strong> photo · no filters · natural light · no sunglasses</span>
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
                        <button className="remove-btn" onClick={e=>{e.stopPropagation();fileRefs.current[idx].current.click()}} title="Change Photo" aria-label="Change photo"><RefreshCw size={13} /></button>
                      ) : (
                        <button className="remove-btn" aria-label="Remove photo" onClick={e=>{e.stopPropagation();removePhoto(idx)}}><X size={13} /></button>
                      )}
                      <div style={{position:'absolute',bottom:6,left:6,background:'rgba(0,0,0,0.65)',backdropFilter:'blur(4px)',color:'#fff',fontSize:9,padding:'3px 8px',borderRadius:20,letterSpacing:'0.1em'}}>{idx===0?'PROFILE':'SECONDARY'}</div>
                    </>
                  ) : (
                    <>
                      <span className="avatar" style={{width:44,height:44}}>{idx===0 ? <Camera size={20} /> : <Plus size={20} />}</span>
                      <span style={{fontSize:11,color:'var(--gray3)'}}>{idx===0?'Profile *':'Secondary'}</span>
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
                <span style={{fontSize:12,color:'var(--gray3)',display:'flex',alignItems:'center',gap:6}}><Sparkles size={14} style={{color:'var(--primary)'}} /> Profile strength</span>
                <span style={{fontSize:12,fontWeight:600}}>{completeness()}%</span>
              </div>
              <div className="progress-wrap">
                <div className="progress-fill" style={{width:completeness()+'%'}}></div>
              </div>
            </div>

            <div className="notice" style={{display:'flex',gap:10,alignItems:'center'}}>
              <ShieldCheck size={18} style={{color:'var(--primary)',flexShrink:0}} />
              <span>Reviewed by our team in <strong>24-48 hrs</strong></span>
            </div>
          </div>
        )}

        <div style={{display:'flex',gap:10,marginTop:24}}>
          {step===0 ? (
            personalQ>0 && (
              <button className="btn btn-outline" style={{flex:1}} onClick={goToPrevPersonalQ} aria-label="Back"><ChevronLeft size={18} /> Back</button>
            )
          ) : step>=1 && step<=4 ? (
            <button className="btn btn-outline" style={{flex:1}} onClick={goBackOverall} aria-label="Back"><ChevronLeft size={18} /> Back</button>
          ) : (
            step>0&&(
              <button className="btn btn-outline" style={{flex:1}} onClick={()=>setStep(s=>s-1)} aria-label="Back"><ChevronLeft size={18} /> Back</button>
            )
          )}
          {step===0 ? (
            <button className="btn btn-primary" style={{flex:2}} onClick={goToNextPersonalQ}>
              Continue <ArrowRight size={18} />
            </button>
          ) : step<STEPS.length-1 ? (
            <button className="btn btn-primary" style={{flex:2}} onClick={goNextOverall}>
              Continue <ArrowRight size={18} />
            </button>
          ) : (
            <button className="btn btn-primary" style={{flex:2}} onClick={handleSubmit} disabled={saving || compressingIdx!==null}>
              {saving ? 'Submitting...' : compressingIdx!==null ? 'Processing photo...' : <><Check size={18} /> Submit Profile</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
