import React, { useId } from 'react'

// LOVEKUSH brand — Trinity logo + gradient wordmark, Aryan ke brand
// formula ke hisaab se (Purple #6A1B9A → Pink #D81B60 → Magenta #E1306C
// → Orange #F56040 → Gold #F6C177). Dono pure SVG hain, koi image file
// nahi — har size par crisp.

// ---- Trinity knot geometry (computed once) ----
// Teen outer tips ek equilateral triangle par hain. Har circle-arc ek tip
// se doosre tip tak jaata hai aur center ke paas se guzarta hai; teen arcs
// mil kar ek continuous interlaced knot banate hain. Tips par round
// line-join hai, isliye koi tikha kona nahi.
const TIPS = [-90, 150, 30].map(d => {
  const a = (d * Math.PI) / 180
  return [Math.cos(a), Math.sin(a)]
})
const INNER_REACH = 0.42 // arc center ke kitna paas se guzarta hai

function arcPoints(from, to, away, steps = 64) {
  // `away` = woh tip jiski taraf arc jhukta hai (opposite tip)
  const ux = away[0], uy = away[1]
  const s = (1 - INNER_REACH * INNER_REACH) / (2 * INNER_REACH + 1)
  const cx = -s * ux, cy = -s * uy
  const R = INNER_REACH + s
  const a0 = Math.atan2(from[1] - cy, from[0] - cx)
  let a1 = Math.atan2(to[1] - cy, to[0] - cx)
  const mid = Math.atan2(INNER_REACH * uy - cy, INNER_REACH * ux - cx)
  // jo direction `mid` se guzarti hai wahi choose karo
  const norm = x => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const ccw = norm(mid - a0) < norm(a1 - a0)
  if (ccw) { while (a1 < a0) a1 += 2 * Math.PI } else { while (a1 > a0) a1 -= 2 * Math.PI }
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = a0 + ((a1 - a0) * i) / steps
    pts.push([cx + R * Math.cos(t), cy + R * Math.sin(t)])
  }
  return pts
}

const [T0, T1, T2] = TIPS
const ARCS = [arcPoints(T0, T2, T1), arcPoints(T2, T1, T0), arcPoints(T1, T0, T2)]

function crossing(a, b) {
  let best = null, bd = Infinity
  for (let i = 4; i < a.length - 4; i++) for (let j = 4; j < b.length - 4; j++) {
    const d = (a[i][0] - b[j][0]) ** 2 + (a[i][1] - b[j][1]) ** 2
    if (d < bd) { bd = d; best = { i, p: a[i] } }
  }
  return best
}
// Over/under weave: har arc ek crossing par upar, ek par neeche
const OVERS = [[0, 1], [1, 2], [2, 0]].map(([over, under]) => ({ over, ...crossing(ARCS[over], ARCS[under]) }))

const f = n => n.toFixed(4)
const toPath = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L')
const KNOT_PATH = toPath([...ARCS[0], ...ARCS[1].slice(1), ...ARCS[2].slice(1)]) + 'Z'
const OVER_PATHS = OVERS.map(({ over, i }) => toPath(ARCS[over].slice(Math.max(0, i - 14), i + 15)))

export function TrinityLogo({ size = 96, bg = 'var(--bg)', style, className }) {
  const id = useId().replace(/:/g, '')
  const W = 0.17 // stroke ~9% of logo width (brand formula: 8-10%)
  const GAP = 0.05
  // Halo (background color) chhote clip mein, colored strand bade clip mein —
  // isse clip ki edge par koi hairline seam nahi dikhti.
  const layer = (d, key, k) => (
    <g key={key}>
      {k != null && <path d={d} stroke={bg} strokeWidth={W + GAP * 2} clipPath={`url(#${id}c${k})`} />}
      <g clipPath={k == null ? undefined : `url(#${id}d${k})`}>
        <path d={d} stroke={`url(#${id}a)`} strokeWidth={W} />
        <path d={d} stroke={`url(#${id}b)`} strokeWidth={W} />
      </g>
    </g>
  )
  return (
    <svg width={size} height={size} viewBox="-1.25 -1.2 2.5 2.5" className={className} style={style}
      role="img" aria-label="Lovekush logo" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        {/* Diagonal: Purple (top-left) → Magenta (center) → Gold (bottom-right) */}
        <linearGradient id={`${id}a`} gradientUnits="userSpaceOnUse" x1="-0.9" y1="-0.9" x2="0.9" y2="0.7">
          <stop offset="0" stopColor="#6A1B9A" />
          <stop offset="0.5" stopColor="#E1306C" />
          <stop offset="1" stopColor="#F6C177" />
        </linearGradient>
        {/* Cross blend: Pink (top-right) … Orange (bottom-left) */}
        <linearGradient id={`${id}b`} gradientUnits="userSpaceOnUse" x1="0.9" y1="-0.9" x2="-0.9" y2="0.7">
          <stop offset="0" stopColor="#D81B60" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#E1306C" stopOpacity="0" />
          <stop offset="0.55" stopColor="#E1306C" stopOpacity="0" />
          <stop offset="1" stopColor="#F56040" stopOpacity="0.9" />
        </linearGradient>
        {OVERS.map(({ p }, k) => (
          <React.Fragment key={k}>
            <clipPath id={`${id}c${k}`}><circle cx={f(p[0])} cy={f(p[1])} r="0.24" /></clipPath>
            <clipPath id={`${id}d${k}`}><circle cx={f(p[0])} cy={f(p[1])} r="0.32" /></clipPath>
          </React.Fragment>
        ))}
      </defs>
      {layer(KNOT_PATH, 'base')}
      {OVER_PATHS.map((d, k) => layer(d, 'o' + k, k))}
    </svg>
  )
}

// Gradient wordmark — geometric sans, all caps, wide spacing, aur "E"
// ka unique three-bar style (upar ki bar alag, neeche stem + 2 bars).
const LETTERS = ['L', 'O', 'V', 'E', 'K', 'U', 'S', 'H']
export function Wordmark({ height = 28, style, className }) {
  const id = useId().replace(/:/g, '')
  const slot = 100, capTop = 22, base = 78, bar = 7.5
  return (
    <svg viewBox={`0 0 ${slot * LETTERS.length} 100`} height={height} className={className} style={style}
      role="img" aria-label="LOVEKUSH">
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={slot * LETTERS.length} y2="0">
          <stop offset="0" stopColor="#6A1B9A" />
          <stop offset="0.42" stopColor="#D81B60" />
          <stop offset="0.75" stopColor="#FF6A00" />
          <stop offset="1" stopColor="#FFC107" />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`}>
        {LETTERS.map((ch, i) => {
          const cx = slot * i + slot / 2
          if (ch !== 'E') {
            return (
              <text key={i} x={cx} y={base} textAnchor="middle" fontSize="78"
                fontFamily="'Montserrat', 'Poppins', sans-serif" fontWeight="400">{ch}</text>
            )
          }
          const x0 = cx - 26, w = 52
          return (
            <g key={i}>
              <rect x={x0} y={capTop} width={w} height={bar} rx="1.5" />
              <rect x={x0} y={(capTop + base) / 2 - bar / 2 + 2} width={w * 0.88} height={bar} rx="1.5" />
              <rect x={x0} y={(capTop + base) / 2 - bar / 2 + 2} width={bar} height={base - (capTop + base) / 2 - 2} rx="1.5" />
              <rect x={x0} y={base - bar} width={w} height={bar} rx="1.5" />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

// App-open splash — beech mein logo, sabse neeche wordmark.
export function SplashScreen({ leaving }) {
  return (
    <div className={'splash' + (leaving ? ' leaving' : '')}>
      <div className="splash-logo"><TrinityLogo size={132} bg="var(--ivory)" /></div>
      <div className="splash-foot">
        <Wordmark height={26} />
        <div className="splash-tag">Global Matchmaking Services</div>
      </div>
    </div>
  )
}

// Navbar ke liye chhota lockup — logo mark + gradient wordmark.
export function BrandLockup({ size = 30, onClick }) {
  return (
    <span className="brand-lockup nav-brand" onClick={onClick} role={onClick ? 'button' : undefined}>
      <TrinityLogo size={size} />
      <Wordmark height={Math.round(size * 0.58)} />
    </span>
  )
}
