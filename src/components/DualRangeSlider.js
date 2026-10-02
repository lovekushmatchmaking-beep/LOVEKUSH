import React from 'react'

// Do-handle range slider — Age aur Partner Height preference dono ke
// liye reuse hota hai. Do overlapping native <input type="range">
// elements ka standard lightweight dual-slider pattern hai, koi nayi
// dependency nahi.
//
// `values` (optional): sorted list of allowed values, jaise income ke liye
// [0, 1L, 2L, 3L, 5L...]. Tab slider in values ke index pe chalta hai, to
// handle sirf in round values pe hi rukta hai. Purani saved value jo list
// mein nahi hai, nearest value pe snap ho jaati hai.
export default function DualRangeSlider({ min, max, valueMin, valueMax, onChange, formatLabel, values }) {
  const fmt = formatLabel || (v => v)
  const nearestIndex = (v) => {
    let best = 0
    values.forEach((x, i) => { if (Math.abs(x - v) < Math.abs(values[best] - v)) best = i })
    return best
  }
  const lo = values ? 0 : min
  const hi = values ? values.length - 1 : max
  const posMin = values ? nearestIndex(valueMin) : valueMin
  const posMax = values ? nearestIndex(valueMax) : valueMax
  const toValue = (pos) => values ? values[pos] : pos
  const pctMin = ((posMin - lo) / (hi - lo)) * 100
  const pctMax = ((posMax - lo) / (hi - lo)) * 100

  const handleMinChange = (e) => {
    const pos = Math.min(Number(e.target.value), posMax)
    onChange(toValue(pos), toValue(posMax))
  }
  const handleMaxChange = (e) => {
    const pos = Math.max(Number(e.target.value), posMin)
    onChange(toValue(posMin), toValue(pos))
  }

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:500, marginBottom:8}}>
        <span>{fmt(toValue(posMin))}</span>
        <span>{fmt(toValue(posMax))}</span>
      </div>
      <div style={{position:'relative', height:32}}>
        <div style={{position:'absolute', top:14, left:0, right:0, height:4, borderRadius:2, background:'var(--gray2)'}} />
        <div style={{position:'absolute', top:14, height:4, borderRadius:2, background:'var(--primary)',
          left:pctMin+'%', width:(pctMax-pctMin)+'%'}} />
        <input type="range" min={lo} max={hi} step={1} value={posMin} onChange={handleMinChange}
          style={{position:'absolute', width:'100%', top:0, margin:0, background:'transparent', pointerEvents:'none'}}
          className="dual-range-thumb" />
        <input type="range" min={lo} max={hi} step={1} value={posMax} onChange={handleMaxChange}
          style={{position:'absolute', width:'100%', top:0, margin:0, background:'transparent', pointerEvents:'none'}}
          className="dual-range-thumb" />
      </div>
      <style>{`
        .dual-range-thumb { -webkit-appearance: none; appearance: none; height: 32px; }
        .dual-range-thumb::-webkit-slider-runnable-track { background: transparent; }
        .dual-range-thumb::-webkit-slider-thumb { pointer-events: auto; -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 2px solid var(--primary); box-shadow: var(--shadow-md); cursor: grab; }
        .dual-range-thumb::-moz-range-thumb { pointer-events: auto; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 2px solid var(--primary); box-shadow: var(--shadow-md); cursor: grab; }
      `}</style>
    </div>
  )
}
