import React, { useState, useRef, useEffect } from 'react'

// Click-to-open multi-select dropdown — ek checklist jo panel ke andar
// khulti hai, upar ek chhota search box (lambi lists, jaise 330+
// languages, ko usable banane ke liye). MultiSelectChips (button-chips)
// se alag — yahan "closed" state ek dropdown jaisa hi dikhta hai.
export default function CheckboxDropdown({ options, selected, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onEscape = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [])

  const toggle = (opt) => {
    onChange(selected.includes(opt) ? selected.filter(v => v !== opt) : [...selected, opt])
  }

  const filtered = options.filter(o => o.toLowerCase().includes(filter.toLowerCase()))
  const summary = selected.length === 0 ? (placeholder || 'Select...')
    : selected.length <= 3 ? selected.join(', ')
    : selected.length + ' selected'

  return (
    <div ref={ref} style={{position:'relative'}}>
      <button type="button" className="form-select" style={{textAlign:'left', cursor:'pointer', color: selected.length ? '#000' : '#8e8e8e'}}
        onClick={()=>setOpen(o=>!o)}>
        {summary}
      </button>
      {open && (
        <div style={{position:'absolute', zIndex:20, top:'calc(100% + 4px)', left:0, right:0,
          background:'#fff', border:'1px solid rgba(0,0,0,0.15)', borderRadius:10,
          boxShadow:'0 8px 24px rgba(0,0,0,0.12)', maxHeight:280, display:'flex', flexDirection:'column'}}>
          <input className="form-input" placeholder="Search..." autoFocus
            style={{margin:8, width:'calc(100% - 16px)'}}
            value={filter} onChange={e=>setFilter(e.target.value)} />
          <div style={{overflowY:'auto', padding:'0 8px 8px'}}>
            {filtered.length === 0 && (
              <div style={{fontSize:12, color:'#8e8e8e', padding:'6px 4px'}}>No matches</div>
            )}
            {filtered.map(opt => (
              <label key={opt} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 4px', fontSize:13, cursor:'pointer'}}>
                <input type="checkbox" checked={selected.includes(opt)} onChange={()=>toggle(opt)} />
                {opt}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
