import React, { useState } from 'react'
import { supabase } from '../supabase'
import DualRangeSlider from '../components/DualRangeSlider'
import CheckboxDropdown from '../components/CheckboxDropdown'
import {
  RELIGIONS, CASTES, ISLAMIC_COMMUNITIES, CHRISTIAN_COMMUNITIES, RELIGION_HIERARCHY,
  PARTNER_COMMUNITY_SPECIAL_OPTIONS, PARTNER_COMMUNITY_NO_BAR, EDUCATIONS, LOCATION_PREFERENCES,
  COUNTRIES, CURRENCIES, PARTNER_HEIGHT_MIN_INCHES, PARTNER_HEIGHT_MAX_INCHES, formatHeightFromInches,
  PARTNER_INCOME_BOUNDS,
} from '../constants/profileOptions'

// Single-choice fields render as a native <select> dropdown (duplicated
// module-scope, same as CreateProfile.js/Dashboard.js — not exported
// as a shared component, matching the existing pattern). Keeps the screen
// compact instead of spreading every option out as chips.
function ChipSelect({ options, value, onChange, includeEmpty, emptyLabel }) {
  return (
    <select className="form-select" value={value || ''} onChange={e=>onChange(e.target.value)}>
      {includeEmpty && <option value="">{emptyLabel || 'Not specified'}</option>}
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function AccordionSection({ title, icon, defaultOpen, children }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', cursor: 'pointer' }}>
        <div className="section-label" style={{ margin: 0 }}>{icon ? icon + ' ' : ''}{title}</div>
        <span style={{ fontSize: 16, color: '#8e8e8e', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>⌄</span>
      </div>
      {open && <div style={{ padding: '0 18px 18px' }}>{children}</div>}
    </div>
  )
}

export default function MatchSearch({ profile, onSearch, onBack }) {
  const [form, setForm] = useState({
    partner_age_min: profile.partner_age_min || 18,
    partner_age_max: profile.partner_age_max || 40,
    partner_height_min: profile.partner_height_min || PARTNER_HEIGHT_MIN_INCHES,
    partner_height_max: profile.partner_height_max || PARTNER_HEIGHT_MAX_INCHES,
    partner_location: profile.partner_location || '',
    partner_city_preference: profile.partner_city_preference || '',
    partner_state_preference: profile.partner_state_preference || '',
    partner_country_preference: profile.partner_country_preference || 'Open to All',
    partner_education_level_preferences: profile.partner_education_level_preferences || [],
    partner_income_currency: profile.partner_income_currency || 'INR',
    partner_income_min: profile.partner_income_min ?? PARTNER_INCOME_BOUNDS.INR.min,
    partner_income_max: profile.partner_income_max ?? PARTNER_INCOME_BOUNDS.INR.max,
    partner_religion: profile.partner_religion || 'Any',
    partner_community_ids: profile.partner_community_ids || [],
    partner_notes: profile.partner_notes || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

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

  // "Current Preferences" summary chip — short human-readable snapshot of
  // the most-relevant fields, purely informational.
  const summaryParts = []
  if (form.partner_age_min || form.partner_age_max) summaryParts.push(`${form.partner_age_min}-${form.partner_age_max} yrs`)
  if (form.partner_religion && form.partner_religion !== 'Any') summaryParts.push(form.partner_religion)
  if (form.partner_location) summaryParts.push(form.partner_location)

  const handleSearch = async () => {
    setSaving(true)
    const { data, error } = await supabase.from('profiles').update(form).eq('id', profile.id).select().single()
    setSaving(false)
    if (error) { alert('Could not save: ' + error.message); return }
    onSearch(data)
  }

  const communityOptions = [
    ...(form.partner_religion === 'Muslim' ? ISLAMIC_COMMUNITIES
      : form.partner_religion === 'Christian' ? CHRISTIAN_COMMUNITIES
      : RELIGION_HIERARCHY[form.partner_religion]?.community.options
      || CASTES
    ).filter(c => !/^(other|others|don'?t)/i.test(c)),
    ...PARTNER_COMMUNITY_SPECIAL_OPTIONS,
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>←</button>
        <h2 style={{ fontFamily: 'Cormorant Garamond', fontSize: 24, fontWeight: 300, margin: 0 }}>Tell us what you're looking for</h2>
      </div>

      {summaryParts.length > 0 && (
        <div style={{ display: 'inline-block', margin: '10px 0 16px', padding: '6px 14px', borderRadius: 20, background: '#fff0f3', border: '1px solid #fde0e6', fontSize: 12, color: '#b4536b' }}>
          Current Preferences: {summaryParts.join(' • ')}
        </div>
      )}

      <AccordionSection title="Basic Details" icon="👤" defaultOpen>
        <div className="form-group">
          <label className="form-label">Age range</label>
          <DualRangeSlider min={18} max={70} valueMin={form.partner_age_min} valueMax={form.partner_age_max}
            onChange={(lo, hi) => setForm(p => ({ ...p, partner_age_min: lo, partner_age_max: hi }))}
            formatLabel={v => v + ' yrs'} />
        </div>
        <div className="form-group">
          <label className="form-label">Height range</label>
          <DualRangeSlider min={PARTNER_HEIGHT_MIN_INCHES} max={PARTNER_HEIGHT_MAX_INCHES}
            valueMin={form.partner_height_min} valueMax={form.partner_height_max}
            onChange={(lo, hi) => setForm(p => ({ ...p, partner_height_min: lo, partner_height_max: hi }))}
            formatLabel={formatHeightFromInches} />
        </div>
        <div className="form-group">
          <label className="form-label">Location Preference</label>
          <ChipSelect options={LOCATION_PREFERENCES} value={form.partner_location} onChange={v => set('partner_location', v)} includeEmpty />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">City Preference</label>
            <input className="form-input" placeholder="Optional" value={form.partner_city_preference} onChange={e => set('partner_city_preference', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">State Preference</label>
            <input className="form-input" placeholder="Optional" value={form.partner_state_preference} onChange={e => set('partner_state_preference', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Country Preference</label>
          <select className="form-select" value={form.partner_country_preference} onChange={e => set('partner_country_preference', e.target.value)}>
            {COUNTRIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </AccordionSection>

      <AccordionSection title="Education & Occupation" icon="🎓">
        <div className="form-group">
          <label className="form-label">Education Level Preference</label>
          <CheckboxDropdown options={EDUCATIONS} selected={form.partner_education_level_preferences}
            onChange={v => set('partner_education_level_preferences', v)} placeholder="Select education levels..." />
          <div className="form-hint">Khaali chhodne par sab education levels acceptable maane jaayenge</div>
        </div>
        <div className="form-group">
          <label className="form-label">Income range</label>
          <select className="form-select" value={form.partner_income_currency} onChange={e => {
            const bounds = PARTNER_INCOME_BOUNDS[e.target.value]
            setForm(p => ({ ...p, partner_income_currency: e.target.value, partner_income_min: bounds.min, partner_income_max: bounds.max }))
          }} style={{ marginBottom: 8, maxWidth: 140 }}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c === 'INR' ? '₹ INR' : '$ USD'}</option>)}
          </select>
          <DualRangeSlider min={PARTNER_INCOME_BOUNDS[form.partner_income_currency].min}
            max={PARTNER_INCOME_BOUNDS[form.partner_income_currency].max}
            valueMin={form.partner_income_min} valueMax={form.partner_income_max}
            onChange={(lo, hi) => setForm(p => ({ ...p, partner_income_min: lo, partner_income_max: hi }))}
            formatLabel={v => {
              const symbol = form.partner_income_currency === 'INR' ? '₹' : '$'
              const isMax = v === PARTNER_INCOME_BOUNDS[form.partner_income_currency].max
              return symbol + v.toLocaleString(form.partner_income_currency === 'INR' ? 'en-IN' : 'en-US') + (isMax ? '+' : '')
            }} />
        </div>
      </AccordionSection>

      <AccordionSection title="Religion and Ethnicity" icon="🕉️">
        <div className="form-group">
          <label className="form-label">Religion Preference</label>
          <select className="form-select" value={form.partner_religion} onChange={e => set('partner_religion', e.target.value)}>
            <option value="Any">Any / Open to all</option>
            {RELIGIONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        {form.partner_religion !== 'Any' && (
          <div className="form-group">
            <label className="form-label">Preferred Community</label>
            <CheckboxDropdown options={communityOptions} selected={form.partner_community_ids} onChange={setPartnerCommunity} placeholder="Select communities..." />
            <div className="form-hint">"Any Community / No Bar" select karne par baaki communities apne aap unselect ho jaayengi</div>
          </div>
        )}
      </AccordionSection>

      <AccordionSection title="Additional Preferences" icon="📝">
        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea className="form-textarea" placeholder="Any other preferences or expectations..."
            value={form.partner_notes} onChange={e => set('partner_notes', e.target.value)} />
        </div>
      </AccordionSection>

      <div style={{ position: 'sticky', bottom: 0, background: '#fff', paddingTop: 12, paddingBottom: 4 }}>
        <button className="btn btn-black btn-full btn-lg" onClick={handleSearch} disabled={saving}>
          {saving ? 'Searching...' : 'Search'}
        </button>
      </div>
    </div>
  )
}
