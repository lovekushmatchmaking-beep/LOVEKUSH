import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import CheckboxDropdown from './CheckboxDropdown'
import { PROFILE_FILTER_GROUPS, fieldsForScope, activeFilterKeys, recencyLabel, withDataOptions } from '../utils/profileFilters'

// Universal "More filters" block — every structured profile field from
// utils/profileFilters.js, grouped (Personal / Religion / Career / Location
// / Family / Lifestyle / CRM) into small collapsible sections so the panel
// stays short on a phone. Same CheckboxDropdown multi-select the existing
// filter panels already use. `exclude` hides fields a screen already shows
// in its own (older) filter rows, so nothing appears twice. `optionRows`
// (loaded profiles) adds values that exist in real data but not in the
// fixed option lists.
export default function ProfileFilterGroups({ values, onChange, scope = 'admin', exclude = [], optionRows }) {
  const allowed = new Set(fieldsForScope(scope, exclude).map(f => f.key))
  const active = new Set(activeFilterKeys(values))
  const [open, setOpen] = useState(() => new Set())
  const set = (k, v) => onChange({ ...values, [k]: v })
  const toggle = (title) => setOpen(prev => {
    const next = new Set(prev)
    next.has(title) ? next.delete(title) : next.add(title)
    return next
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {PROFILE_FILTER_GROUPS.map(g => {
        const fields = g.fields.filter(f => allowed.has(f.key))
        if (fields.length === 0) return null
        const activeCount = fields.filter(f => active.has(f.key)).length
        const isOpen = open.has(g.title) || false
        return (
          <div key={g.title} style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, background: '#fff' }}>
            <button type="button" onClick={() => toggle(g.title)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'inherit' }}>
              <span>
                {g.title}
                <span style={{ fontWeight: 400, color: '#8e8e8e', marginLeft: 6 }}>{fields.length} fields</span>
                {activeCount > 0 && <span className="chip chip-primary" style={{ marginLeft: 8, padding: '1px 8px', fontSize: 11 }}>{activeCount} on</span>}
              </span>
              <ChevronDown size={15} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#8e8e8e' }} />
            </button>
            {isOpen && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, padding: '0 12px 12px' }}>
                {fields.map(f => (
                  <div key={f.key} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: '#8e8e8e', marginBottom: 3 }}>{f.label}</div>
                    {(f.type === 'multi' || f.type === 'array') && (
                      <CheckboxDropdown options={withDataOptions(f.options, optionRows, f.key)} selected={values[f.key] || []}
                        onChange={v => set(f.key, v)} placeholder="Any" />
                    )}
                    {f.type === 'text' && (
                      <input className="form-input" placeholder="Contains..." value={values[f.key] || ''}
                        onChange={e => set(f.key, e.target.value)} />
                    )}
                    {f.type === 'recency' && (
                      <select className="form-select" value={values[f.key] || ''}
                        onChange={e => set(f.key, e.target.value ? Number(e.target.value) : null)}>
                        <option value="">Any time</option>
                        {f.options.map(d => <option key={d} value={d}>{recencyLabel(d)}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
