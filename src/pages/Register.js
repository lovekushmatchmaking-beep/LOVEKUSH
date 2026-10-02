import React, { useState } from 'react'
import { ArrowRight, ChevronLeft } from 'lucide-react'
import { FormLabel } from '../components/ui'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { BrandLockup } from '../components/BrandLogo'

export default function Register() {
  const navigate = useNavigate()
  const [step, setStep] = useState('details') // 'details' | 'otp'
  const [form, setForm] = useState({ email:'', password:'', confirm:'' })
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendMsg, setResendMsg] = useState('')

  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  // Step 1 — account create karte hain lekin signUp() khud hi ek
  // confirmation email bhej deta hai (jisme OTP code hota hai, agar
  // Supabase ke "Confirm signup" email template me {{ .Token }} set hai).
  // User ko turant Create Profile pe navigate nahi karte — pehle woh OTP
  // verify kare, taaki koi bhi random/fake email daal ke signup na kar
  // sake.
  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    if(form.password !== form.confirm) return setError('Passwords do not match')
    if(form.password.length < 6) return setError('Password must be at least 6 characters')
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })
    setLoading(false)
    if(error) return setError(error.message)
    setStep('otp')
  }

  // Step 2 — email par aaya verification code verify karte hain (code ki
  // length Supabase Dashboard ke "Email OTP length" setting se control
  // hoti hai, isliye hardcode nahi karte). Success par
  // Supabase khud hi session bana deta hai (login ho jaata hai).
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setError('')
    if (!otp.trim()) return setError('Please enter the code sent to your email')
    setLoading(true)
    const { data, error } = await supabase.auth.verifyOtp({
      email: form.email,
      token: otp.trim(),
      type: 'signup',
    })
    if(error) { setLoading(false); return setError(error.message) }

    // Agar Admin ne pehle se is email ke liye ek profile bana rakhi hai
    // (Admin-Assisted Matchmaking se), usse yahan "claim" kar lete hain —
    // taaki dobara khaali profile na bane, jo already bhari hui hai wahi
    // ab is naye account se link ho jaaye.
    const newUserId = data?.user?.id
    let claimedExisting = false
    if (newUserId) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .is('user_id', null)
        .eq('client_email', form.email)
        .eq('is_admin_managed', true)
        .maybeSingle()

      if (existingProfile) {
        const { error: claimError } = await supabase
          .from('profiles')
          .update({ user_id: newUserId })
          .eq('id', existingProfile.id)
        if (!claimError) claimedExisting = true
      }
    }

    setLoading(false)
    navigate(claimedExisting ? '/dashboard' : '/create-profile')
  }

  const handleResend = async () => {
    setError(''); setResendMsg('')
    const { error } = await supabase.auth.resend({ type: 'signup', email: form.email })
    if (error) return setError(error.message)
    setResendMsg('Code dobara bhej diya gaya hai.')
  }

  return (
    <div style={{minHeight:'100vh',background:'#fff'}}>
      <nav className="navbar">
        <Link to="/" style={{ textDecoration: 'none' }}><BrandLockup size={28} /></Link>
        <Link to="/login" className="btn btn-outline" style={{fontSize:12,padding:'8px 16px'}}>Login</Link>
      </nav>

      <div className="page-container">
        <div style={{textAlign:'center',marginBottom:32}}>
          <svg width="40" height="40" viewBox="0 0 60 60" fill="none" style={{margin:'0 auto 12px',display:'block'}}>
            <g stroke="black" strokeWidth="2.2" strokeLinecap="round" fill="none">
              <path d="M30 6C36 6,44 14,44 22C44 29,38 34,33 37C40 39,51 46,51 55C51 59,44 62,37 58C33 55,31 51,30 47C29 51,27 55,23 58C16 62,9 59,9 55C9 46,20 39,27 37C22 34,16 29,16 22C16 14,24 6,30 6Z"/>
              <circle cx="30" cy="37" r="2.5" fill="black"/>
            </g>
          </svg>
          <h1 className="page-title">{step === 'details' ? 'Create Account' : 'Verify Your Email'}</h1>
          <p className="page-subtitle">
            {step === 'details'
              ? 'Begin your journey to finding a life partner'
              : `Hamne ${form.email} par ek verification code bheja hai`}
          </p>
        </div>

        {step === 'details' ? (
          <>
            <div className="notice">
              <strong>This service is for serious marriage seekers only.</strong> All profiles are reviewed by our team before activation.
            </div>

            <form onSubmit={handleRegister}>
              <div className="form-group">
                <FormLabel>Email Address</FormLabel>
                <input className="form-input" type="email" placeholder="your@email.com"
                  value={form.email} onChange={e=>set('email',e.target.value)} required />
              </div>

              <div className="form-group">
                <FormLabel>Password</FormLabel>
                <input className="form-input" type="password" placeholder="Minimum 6 characters"
                  value={form.password} onChange={e=>set('password',e.target.value)} required />
              </div>

              <div className="form-group">
                <FormLabel>Confirm Password</FormLabel>
                <input className="form-input" type="password" placeholder="Repeat password"
                  value={form.confirm} onChange={e=>set('confirm',e.target.value)} required />
              </div>

              {error && <div className="form-error" style={{marginBottom:12}}>{error}</div>}

              <div style={{marginBottom:16,fontSize:12,color:'#8e8e8e',lineHeight:1.6}}>
                By registering, you agree to our{' '}
                <span style={{color:'var(--primary)',cursor:'pointer',textDecoration:'underline'}}>Terms of Service</span>
                {' '}and{' '}
                <span style={{color:'var(--primary)',cursor:'pointer',textDecoration:'underline'}}>Privacy Policy</span>.
              </div>

              <button className="btn btn-black btn-full btn-lg" type="submit" disabled={loading}>
                {loading ? 'Sending code...' : 'Continue'} <ArrowRight size={18} />
              </button>
            </form>

            <div className="divider">or</div>

            <div style={{textAlign:'center',fontSize:14,color:'#8e8e8e'}}>
              Already registered?{' '}
              <Link to="/login" style={{color:'var(--primary)',fontWeight:500,textDecoration:'none'}}>Login here</Link>
            </div>
          </>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div className="form-group">
              <FormLabel>Verification Code</FormLabel>
              <input className="form-input" type="text" inputMode="numeric" placeholder="Enter verification code"
                value={otp} onChange={e=>setOtp(e.target.value)} autoFocus required />
            </div>

            {error && <div className="form-error" style={{marginBottom:12}}>{error}</div>}
            {resendMsg && <div className="form-hint" style={{marginBottom:12,color:'#16a34a'}}>{resendMsg}</div>}

            <button className="btn btn-black btn-full btn-lg" type="submit" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & Continue'} <ArrowRight size={18} />
            </button>

            <div style={{textAlign:'center',marginTop:16,fontSize:13,color:'#8e8e8e'}}>
              Code nahi mila?{' '}
              <span onClick={handleResend} style={{color:'var(--primary)',fontWeight:500,textDecoration:'underline',cursor:'pointer'}}>Resend</span>
            </div>
            <div style={{textAlign:'center',marginTop:8}}>
              <span onClick={()=>{ setStep('details'); setError(''); setOtp('') }}
                style={{color:'#8e8e8e',fontSize:12,textDecoration:'underline',cursor:'pointer'}}><ChevronLeft size={14} style={{verticalAlign:'-2px'}} /> Change email</span>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
