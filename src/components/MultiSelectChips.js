import React from 'react'
import { Check } from 'lucide-react'

// Chhota reusable component — checkboxes ki list, optional max-limit ke
// saath (jaise Hobbies mein max 5). Grouped bhi ho sakta hai (jaise
// Hobbies ke "Creative/Fun/Fitness/Other" categories).

export default function MultiSelectChips({ options, selected, onChange, maxSelect, groups }) {
  const toggle = (value) => {
    const isSelected = selected.includes(value)
    if (isSelected) {
      onChange(selected.filter(v => v !== value))
    } else {
      if (maxSelect && selected.length >= maxSelect) return // limit hit, ignore
      onChange([...selected, value])
    }
  }

  const renderChip = (opt) => {
    const isSelected = selected.includes(opt)
    const disabled = !isSelected && maxSelect && selected.length >= maxSelect
    return (
      <button
        key={opt}
        type="button"
        onClick={() => toggle(opt)}
        disabled={disabled}
        style={{
          padding: '7px 14px', borderRadius: 50, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
          border: isSelected ? '1px solid var(--primary)' : '1px solid var(--gray2)',
          background: isSelected ? 'var(--primary-soft)' : '#fff',
          color: isSelected ? 'var(--primary)' : disabled ? '#ccc' : 'var(--ink)',
          fontWeight: isSelected ? 600 : 400,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          transition: 'all 0.2s var(--ease)',
          margin: '3px 4px 3px 0',
        }}
      >
        {isSelected && <Check size={12} />}{opt}
      </button>
    )
  }

  return (
    <div>
      {maxSelect && (
        <div style={{fontSize:11, color: selected.length >= maxSelect ? '#dc2626' : '#8e8e8e', marginBottom:6}}>
          {selected.length}/{maxSelect} selected
        </div>
      )}
      {groups ? (
        Object.keys(groups).map(groupName => (
          <div key={groupName} style={{marginBottom:10}}>
            <div style={{fontSize:11, fontWeight:600, color:'#8e8e8e', marginBottom:4}}>{groupName}</div>
            <div style={{display:'flex', flexWrap:'wrap'}}>
              {groups[groupName].map(renderChip)}
            </div>
          </div>
        ))
      ) : (
        <div style={{display:'flex', flexWrap:'wrap'}}>
          {options.map(renderChip)}
        </div>
      )}
    </div>
  )
}
