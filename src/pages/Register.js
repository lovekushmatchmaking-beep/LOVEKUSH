import React, { useState } from 'react'
import { ArrowRight, ChevronLeft } from 'lucide-react'
import { FormLabel } from '../components/ui'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { AuthBrand } from '../components/BrandLogo'

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
    <div className="auth-screen">

      <div className="page-container auth-page">
        <div style={{textAlign:'center',marginBottom:32}}>
          <AuthBrand />
          {step === 'otp' && <>
            <h1 className="page-title">Verify Your Email</h1>
            <p className="page-subtitle">{`Hamne ${form.email} par ek verification code bheja hai`}</p>
          </>}
        </div>

        {step === 'details' ? (
          <>
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
                {loading ? 'Sending code...' : 'Sign up'}
              </button>
            </form>
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
      <div className="auth-foot">
        Have an account?{' '}
        <Link to="/login" style={{color:'var(--primary)',fontWeight:600,textDecoration:'none'}}>Log in</Link>
      </div>
    </div>
  )
}
