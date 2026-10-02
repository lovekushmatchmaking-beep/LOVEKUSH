import React from 'react'

// LOVEKUSH brand — Aryan ka bheja hua original logo aur wordmark, bina
// kisi badlaav ke (public/brand/*.png, sirf white background transparent
// kiya hai). Shape/color mein koi rounding ya redraw nahi.
const LOGO_SRC = process.env.PUBLIC_URL + '/brand/logo.png'
const WORDMARK_SRC = process.env.PUBLIC_URL + '/brand/wordmark.png'
const LOGO_RATIO = 496 / 512 // height / width
const WORDMARK_RATIO = 1200 / 140 // width / height

export function TrinityLogo({ size = 96, style, className }) {
  return (
    <img src={LOGO_SRC} alt="Lovekush logo" width={size} height={Math.round(size * LOGO_RATIO)}
      className={className} style={{ display: 'block', ...style }} draggable="false" />
  )
}

export function Wordmark({ height = 28, style, className }) {
  return (
    <img src={WORDMARK_SRC} alt="LOVEKUSH" height={height} width={Math.round(height * WORDMARK_RATIO)}
      className={className} style={{ display: 'block', maxWidth: '100%', height: 'auto', ...style }} draggable="false" />
  )
}

// Navbar ke liye chhota lockup — logo mark + wordmark.
export function BrandLockup({ size = 30, onClick }) {
  return (
    <span className="brand-lockup nav-brand" onClick={onClick} role={onClick ? 'button' : undefined}>
      <TrinityLogo size={size} />
      <Wordmark height={Math.round(size * 0.5)} />
    </span>
  )
}

// App-open splash (Instagram jaisa) — beech mein logo, sabse neeche
// sirf LOVEKUSH wordmark. Koi tagline ya extra text nahi.
export function SplashScreen({ leaving }) {
  return (
    <div className={'splash' + (leaving ? ' leaving' : '')}>
      <div className="splash-logo"><TrinityLogo size={112} /></div>
      <div className="splash-foot"><Wordmark height={22} /></div>
    </div>
  )
}

// Login / signup pages ke upar — Instagram jaisa, sirf logo + naam.
export function AuthBrand() {
  return (
    <div className="auth-brand">
      <TrinityLogo size={76} />
      <Wordmark height={20} style={{ marginTop: 16 }} />
    </div>
  )
}
