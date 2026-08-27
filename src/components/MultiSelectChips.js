import React from 'react'

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
          padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
          border: isSelected ? '1px solid #000' : '1px solid rgba(0,0,0,0.15)',
          background: isSelected ? '#000' : '#fff',
          color: isSelected ? '#fff' : disabled ? '#ccc' : '#333',
          margin: '3px 4px 3px 0',
        }}
      >
        {isSelected ? '✓ ' : ''}{opt}
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
