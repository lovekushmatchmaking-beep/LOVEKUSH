import React, { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { AuthBrand } from '../components/BrandLogo'

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email:'', password:'', confirm:'' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkEmail, setCheckEmail] = useState(false)

  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  // OTP verification step hata diya gaya hai (2026-10-10) — woh step kaam
  // nahi kar raha tha aur naye users signup chhod kar bhaag rahe the.
  // Ab signUp() ke baad, agar Supabase turant session de deta hai
  // (Dashboard me "Confirm email" off hai), seedha Create Profile pe bhej
  // dete hain. Agar confirm-email abhi bhi on hai to Supabase session
  // nahi dega — tab user ko email check karne ko kehte hain.
  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    if(form.password !== form.confirm) return setError('Passwords do not match')
    if(form.password.length < 6) return setError('Password must be at least 6 characters')
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })
    if(error) { setLoading(false); return setError(error.message) }

    const newUserId = data?.user?.id
    const hasSession = !!data?.session

    if (hasSession && newUserId) {
      // Agar Admin ne pehle se is email ke liye ek profile bana rakhi hai
      // (Admin-Assisted Matchmaking se), usse yahan "claim" kar lete hain —
      // taaki dobara khaali profile na bane, jo already bhari hui hai wahi
      // ab is naye account se link ho jaaye.
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .is('user_id', null)
        .eq('client_email', form.email)
        .eq('is_admin_managed', true)
        .maybeSingle()

      let claimedExisting = false
      if (existingProfile) {
        const { error: claimError } = await supabase
          .from('profiles')
          .update({ user_id: newUserId })
          .eq('id', existingProfile.id)
        if (!claimError) claimedExisting = true
      }

      setLoading(false)
      navigate(claimedExisting ? '/dashboard' : '/create-profile')
      return
    }

    // Session nahi mila — matlab Supabase project me "Confirm email" abhi
    // bhi on hai. Us case me email confirm hone tak login nahi ho sakta.
    setLoading(false)
    setCheckEmail(true)
  }

  return (
    <div className="auth-screen">

      <div className="page-container auth-page">
        <div style={{textAlign:'center',marginBottom:32}}>
          <AuthBrand />
        </div>

        {checkEmail ? (
          <div style={{textAlign:'center'}}>
            <div className="form-hint" style={{marginBottom:20,fontSize:14}}>
              {`Your account has been created. Open the confirmation link sent to ${form.email} to verify your email, then log in.`}
            </div>
            <Link to="/login" className="btn btn-black btn-full btn-lg">Go to Login</Link>
          </div>
        ) : (
          <form onSubmit={handleRegister}>
            <input className="form-input" type="email" placeholder="Email address" aria-label="Email address" autoComplete="email"
              value={form.email} onChange={e=>set('email',e.target.value)} required style={{marginBottom:10}} />
            <input className="form-input" type="password" placeholder="Password (min 6 characters)" aria-label="Password" autoComplete="new-password"
              value={form.password} onChange={e=>set('password',e.target.value)} required style={{marginBottom:10}} />
            <input className="form-input" type="password" placeholder="Confirm password" aria-label="Confirm password" autoComplete="new-password"
              value={form.confirm} onChange={e=>set('confirm',e.target.value)} required style={{marginBottom:14}} />

            {error && <div className="form-error" style={{marginBottom:12}}>{error}</div>}

            <div style={{marginBottom:16,fontSize:12,color:'#8e8e8e',lineHeight:1.6,textAlign:'center'}}>
              By registering, you agree to our{' '}
              <span style={{color:'var(--primary)',cursor:'pointer',textDecoration:'underline'}}>Terms of Service</span>
              {' '}and{' '}
              <span style={{color:'var(--primary)',cursor:'pointer',textDecoration:'underline'}}>Privacy Policy</span>.
            </div>

            <button className="btn btn-black btn-full btn-lg" type="submit" disabled={loading}>
              {loading ? 'Signing up...' : 'Sign up'} <ArrowRight size={18} />
            </button>
          </form>
        )}
      </div>
      <div className="auth-foot">
        Have an account?{' '}
        <Link to="/login" style={{color:'var(--primary)',fontWeight:600,textDecoration:'none'}}>Log in</Link>
      </div>
    </div>
  )
}
