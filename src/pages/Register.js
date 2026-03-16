import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email:'', password:'', confirm:'' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k,v) => setForm(p=>({...p,[k]:v}))

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
    navigate('/create-profile')
  }

  return (
    <div style={{minHeight:'100vh',background:'#fff'}}>
      <nav className="navbar">
        <Link to="/" className="nav-brand">LOVEKUSH</Link>
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
          <h1 className="page-title">Create Account</h1>
          <p className="page-subtitle">Begin your journey to finding a life partner</p>
        </div>

        <div className="notice">
          <strong>This service is for serious marriage seekers only.</strong> All profiles are reviewed by our team before activation.
        </div>

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-input" type="email" placeholder="your@email.com"
              value={form.email} onChange={e=>set('email',e.target.value)} required />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="Minimum 6 characters"
              value={form.password} onChange={e=>set('password',e.target.value)} required />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input className="form-input" type="password" placeholder="Repeat password"
              value={form.confirm} onChange={e=>set('confirm',e.target.value)} required />
          </div>

          {error && <div className="form-error" style={{marginBottom:12}}>{error}</div>}

          <div style={{marginBottom:16,fontSize:12,color:'#8e8e8e',lineHeight:1.6}}>
            By registering, you agree to our{' '}
            <span style={{color:'#000',cursor:'pointer',textDecoration:'underline'}}>Terms of Service</span>
            {' '}and{' '}
            <span style={{color:'#000',cursor:'pointer',textDecoration:'underline'}}>Privacy Policy</span>.
          </div>

          <button className="btn btn-black btn-full btn-lg" type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Free Account →'}
          </button>
        </form>

        <div className="divider">or</div>

        <div style={{textAlign:'center',fontSize:14,color:'#8e8e8e'}}>
          Already registered?{' '}
          <Link to="/login" style={{color:'#000',fontWeight:500,textDecoration:'none'}}>Login here</Link>
        </div>
      </div>
    </div>
  )
}
