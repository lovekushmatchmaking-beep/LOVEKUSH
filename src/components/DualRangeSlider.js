import React from 'react'

// Do-handle range slider — Age aur Partner Height preference dono ke
// liye reuse hota hai. Do overlapping native <input type="range">
// elements ka standard lightweight dual-slider pattern hai, koi nayi
// dependency nahi.
export default function DualRangeSlider({ min, max, valueMin, valueMax, onChange, formatLabel }) {
  const fmt = formatLabel || (v => v)
  const pctMin = ((valueMin - min) / (max - min)) * 100
  const pctMax = ((valueMax - min) / (max - min)) * 100

  const handleMinChange = (e) => {
    const v = Math.min(Number(e.target.value), valueMax)
    onChange(v, valueMax)
  }
  const handleMaxChange = (e) => {
    const v = Math.max(Number(e.target.value), valueMin)
    onChange(valueMin, v)
  }

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:500, marginBottom:8}}>
        <span>{fmt(valueMin)}</span>
        <span>{fmt(valueMax)}</span>
      </div>
      <div style={{position:'relative', height:32}}>
        <div style={{position:'absolute', top:14, left:0, right:0, height:4, borderRadius:2, background:'rgba(0,0,0,0.1)'}} />
        <div style={{position:'absolute', top:14, height:4, borderRadius:2, background:'#000',
          left:pctMin+'%', width:(pctMax-pctMin)+'%'}} />
        <input type="range" min={min} max={max} value={valueMin} onChange={handleMinChange}
          style={{position:'absolute', width:'100%', top:0, margin:0, background:'transparent', pointerEvents:'none'}}
          className="dual-range-thumb" />
        <input type="range" min={min} max={max} value={valueMax} onChange={handleMaxChange}
          style={{position:'absolute', width:'100%', top:0, margin:0, background:'transparent', pointerEvents:'none'}}
          className="dual-range-thumb" />
      </div>
      <style>{`
        .dual-range-thumb::-webkit-slider-thumb { pointer-events: auto; }
        .dual-range-thumb::-moz-range-thumb { pointer-events: auto; }
      `}</style>
    </div>
  )
}
