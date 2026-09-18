import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

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
    if (error) return setError('Kuch galat ho gaya, dobara try karein.')
    setSent(true)
  }

  return (
    <div style={{minHeight:'100vh',background:'#fff'}}>
      <nav className="navbar">
        <Link to="/" className="nav-brand">LOVEKUSH</Link>
        <Link to="/login" className="btn btn-black" style={{fontSize:12,padding:'8px 16px'}}>Login</Link>
      </nav>

      <div className="page-container">
        <div style={{textAlign:'center',marginBottom:32}}>
          <svg width="40" height="40" viewBox="0 0 60 60" fill="none" style={{margin:'0 auto 12px',display:'block'}}>
            <g stroke="black" strokeWidth="2.2" strokeLinecap="round" fill="none">
              <path d="M30 6C36 6,44 14,44 22C44 29,38 34,33 37C40 39,51 46,51 55C51 59,44 62,37 58C33 55,31 51,30 47C29 51,27 55,23 58C16 62,9 59,9 55C9 46,20 39,27 37C22 34,16 29,16 22C16 14,24 6,30 6Z"/>
              <circle cx="30" cy="37" r="2.5" fill="black"/>
            </g>
          </svg>
          <h1 className="page-title">Forgot Password</h1>
          <p className="page-subtitle">Apni email daalein, hum aapko reset link bhej denge</p>
        </div>

        {sent ? (
          <div style={{textAlign:'center'}}>
            <div className="form-hint" style={{marginBottom:20,fontSize:14}}>
              Agar yeh email Lovekush par registered hai, aapko thodi der mein password reset ka link mil jayega. Apna inbox (aur spam folder) check karein.
            </div>
            <Link to="/login" className="btn btn-black btn-full btn-lg">Back to Login</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" placeholder="your@email.com"
                value={email} onChange={e=>setEmail(e.target.value)} required autoFocus />
            </div>

            {error && <div className="form-error" style={{marginBottom:12}}>{error}</div>}

            <button className="btn btn-black btn-full btn-lg" type="submit" disabled={loading} style={{marginBottom:12}}>
              {loading ? 'Sending...' : 'Send Reset Link →'}
            </button>
          </form>
        )}

        <div className="divider">or</div>

        <div style={{textAlign:'center',fontSize:14,color:'#8e8e8e'}}>
          Remembered your password?{' '}
          <Link to="/login" style={{color:'#000',fontWeight:500,textDecoration:'none'}}>Login</Link>
        </div>
      </div>
    </div>
  )
}
