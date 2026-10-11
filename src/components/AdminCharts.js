import React, { useState } from 'react'

// Small dependency-free SVG charts for the admin Dashboard (Aryan,
// 2026-10-11: "funnel, height breakdown graph / pie chart se dikhe").
// Colours are a fixed categorical order — a slot always means the same
// entity, never its rank. Values/labels stay in text colours, the coloured
// mark beside them carries identity, and every chart has a legend.

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
export const GENDER_COLORS = { Male: '#2a78d6', Female: '#e87ba4' }
const OTHER = '#b4b2ab'

// Top N slices, the rest folded into "Other" (never a generated 9th hue).
export function topSlices(rows, n = 5) {
  const sorted = [...rows].filter(r => r.value > 0).sort((a, b) => b.value - a.value)
  const head = sorted.slice(0, n).map((r, i) => ({ ...r, color: r.color || SERIES[i] }))
  const rest = sorted.slice(n).reduce((s, r) => s + r.value, 0)
  return rest > 0 ? [...head, { label: 'Other', value: rest, color: OTHER }] : head
}

// ===== DONUT — share-of-whole for ≤6 slices, legend with value + %.
export function DonutChart({ data, size = 132, centerLabel }) {
  const [hover, setHover] = useState(null)
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = size / 2 - 8
  const stroke = 18
  const c = 2 * Math.PI * r
  let offset = 0
  if (total === 0) return <div style={{ fontSize: 12, color: '#8e8e8e' }}>No data yet.</div>
  const shown = hover !== null ? data[hover] : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={data.map(d => `${d.label} ${d.value}`).join(', ')} style={{ flexShrink: 0 }}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {data.map((d, i) => {
            const len = (d.value / total) * c
            // 2px surface gap between slices
            const dash = Math.max(0, len - (data.length > 1 ? 2 : 0))
            const el = (
              <circle key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color}
                strokeWidth={hover === i ? stroke + 4 : stroke} strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset}
                style={{ cursor: 'pointer', transition: 'stroke-width .15s' }}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}>
                <title>{`${d.label}: ${d.value} (${Math.round((d.value / total) * 100)}%)`}</title>
              </circle>
            )
            offset += len
            return el
          })}
        </g>
        <text x="50%" y="48%" textAnchor="middle" style={{ fontSize: 20, fontWeight: 700, fill: '#111' }}>{shown ? shown.value : total}</text>
        <text x="50%" y="62%" textAnchor="middle" style={{ fontSize: 10.5, fill: '#777' }}>
          {shown ? `${Math.round((shown.value / total) * 100)}%` : (centerLabel || 'total')}
        </text>
      </svg>
      <div className="chart-legend">
        {data.map((d, i) => (
          <div key={d.label} className="chart-legend-row" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            style={{ fontWeight: hover === i ? 600 : 400 }}>
            <span className="swatch" style={{ background: d.color }} />
            <span className="lbl" title={d.label}>{d.label}</span>
            <span className="val">{d.value} · {Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ===== COLUMNS — ordered buckets (age, height) stacked Male/Female.
// rows: [{ label, male, female, total }]
export function StackedColumns({ rows, height = 150 }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...rows.map(r => r.total))
  if (rows.length === 0) return <div style={{ fontSize: 12, color: '#8e8e8e' }}>No data yet.</div>
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, marginBottom: 8, color: '#555' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span className="swatch" style={{ width: 10, height: 10, borderRadius: 3, background: GENDER_COLORS.Male }} />Male</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span className="swatch" style={{ width: 10, height: 10, borderRadius: 3, background: GENDER_COLORS.Female }} />Female</span>
        {hover !== null && <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#111' }}>{rows[hover].label}: {rows[hover].total} (M {rows[hover].male} · F {rows[hover].female})</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height, borderBottom: '1px solid #e5e5e5' }}>
        {rows.map((r, i) => {
          const other = Math.max(0, r.total - r.male - r.female)
          // Top-most segment gets the 4px rounded data-end; 2px gap between segments.
          const segs = [[other, '#b4b2ab'], [r.female, GENDER_COLORS.Female], [r.male, GENDER_COLORS.Male]].filter(([v]) => v > 0)
          return (
            <div key={r.label} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'pointer', opacity: hover === null || hover === i ? 1 : 0.55 }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}
              title={`${r.label}: ${r.total} (M ${r.male} · F ${r.female})`}>
              <div style={{ fontSize: 10.5, textAlign: 'center', color: '#555', marginBottom: 2 }}>{r.total || ''}</div>
              <div style={{ height: `${(r.total / max) * 82}%`, display: 'flex', flexDirection: 'column', gap: segs.length > 1 ? 2 : 0 }}>
                {segs.map(([v, color], k) => (
                  <div key={k} style={{ flex: v, background: color, borderRadius: k === 0 ? '4px 4px 0 0' : 0, minHeight: 2 }} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {rows.map(r => (
          <div key={r.label} style={{ flex: 1, minWidth: 0, fontSize: 10, color: '#777', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</div>
        ))}
      </div>
    </div>
  )
}

// ===== FUNNEL — centred bars narrowing stage by stage, with drop-off %.
// stages: [{ key, label, count, conversionPct }]
export function FunnelChart({ stages }) {
  const max = Math.max(1, ...stages.map(s => s.count))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {stages.map((s, i) => (
        <div key={s.key}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div title={`${s.label}: ${s.count}`} style={{
              width: `${Math.max(14, (s.count / max) * 100)}%`, background: SERIES[0], opacity: 1 - i * 0.13,
              color: '#fff', borderRadius: 8, padding: '8px 10px', textAlign: 'center', fontSize: 13, fontWeight: 700,
              transition: 'width .3s',
            }}>{s.count}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555', marginTop: 3 }}>
            <span>{s.label}</span>
            {s.conversionPct !== null && <span style={{ color: '#555' }}>{s.conversionPct}% of previous</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== HORIZONTAL BARS — any count-ordered breakdown (religion, city...).
export function HBarChart({ rows }) {
  const max = Math.max(1, ...rows.map(r => r.total))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(r => (
        <div key={r.label} title={`${r.label}: ${r.total} (M ${r.male} · F ${r.female})`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{r.label}</span>
            <span style={{ color: '#555', flexShrink: 0, marginLeft: 8 }}>{r.total} <span style={{ color: '#8e8e8e' }}>(M {r.male} · F {r.female})</span></span>
          </div>
          <div style={{ display: 'flex', gap: 2, height: 8, width: `${(r.total / max) * 100}%`, minWidth: 4 }}>
            {r.male > 0 && <div style={{ flex: r.male, background: GENDER_COLORS.Male, borderRadius: r.female > 0 ? '4px 0 0 4px' : 4 }} />}
            {r.female > 0 && <div style={{ flex: r.female, background: GENDER_COLORS.Female, borderRadius: r.male > 0 ? '0 4px 4px 0' : 4 }} />}
            {r.male === 0 && r.female === 0 && <div style={{ flex: 1, background: OTHER, borderRadius: 4 }} />}
          </div>
        </div>
      ))}
    </div>
  )
}
