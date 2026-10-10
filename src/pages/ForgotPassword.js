import React, { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { FormLabel } from '../components/ui'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { AuthBrand } from '../components/BrandLogo'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password'
    })
    setLoading(false)
    // Chahe email registered ho ya na ho, same generic message dikhate
    // hain — warna koi bhi is form se pata laga sakta hai ki kaunsi
    // emails Lovekush par registered hain.
    if (error) return setError('Something went wrong, please try again.')
    setSent(true)
  }

  return (
    <div className="auth-screen">

      <div className="page-container auth-page">
        <div style={{textAlign:'center',marginBottom:32}}>
          <AuthBrand />
          <h1 className="page-title">Forgot Password</h1>
          <p className="page-subtitle">Enter your email and we will send you a reset link</p>
        </div>

        {sent ? (
          <div style={{textAlign:'center'}}>
            <div className="form-hint" style={{marginBottom:20,fontSize:14}}>
              If this email is registered with LOVEKUSH, you will get a password reset link shortly. Please check your inbox (and spam folder).
            </div>
            <Link to="/login" className="btn btn-black btn-full btn-lg">Back to Login</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <FormLabel>Email Address</FormLabel>
              <input className="form-input" type="email" placeholder="your@email.com"
                value={email} onChange={e=>setEmail(e.target.value)} required autoFocus />
            </div>

            {error && <div className="form-error" style={{marginBottom:12}}>{error}</div>}

            <button className="btn btn-black btn-full btn-lg" type="submit" disabled={loading} style={{marginBottom:12}}>
              {loading ? 'Sending...' : 'Send Reset Link'} <ArrowRight size={18} />
            </button>
          </form>
        )}

        <div className="divider">or</div>

        <div style={{textAlign:'center',fontSize:14,color:'#8e8e8e'}}>
          Remembered your password?{' '}
          <Link to="/login" style={{color:'var(--primary)',fontWeight:500,textDecoration:'none'}}>Login</Link>
        </div>
      </div>
    </div>
  )
}
