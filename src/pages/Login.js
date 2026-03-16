import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email:'', password:'' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email, password: form.password
    })
    setLoading(false)
    if(error) return setError('Invalid email or password')
    navigate('/dashboard')
  }

  return (
    <div style={{minHeight:'100vh',background:'#fff'}}>
      <nav className="navbar">
        <Link to="/" className="nav-brand">LOVEKUSH</Link>
        <Link to="/register" className="btn btn-black" style={{fontSize:12,padding:'8px 16px'}}>Register</Link>
      </nav>

      <div className="page-container">
        <div style={{textAlign:'center',marginBottom:32}}>
          <svg width="40" height="40" viewBox="0 0 60 60" fill="none" style={{margin:'0 auto 12px',display:'block'}}>
            <g stroke="black" strokeWidth="2.2" strokeLinecap="round" fill="none">
              <path d="M30 6C36 6,44 14,44 22C44 29,38 34,33 37C40 39,51 46,51 55C51 59,44 62,37 58C33 55,31 51,30 47C29 51,27 55,23 58C16 62,9 59,9 55C9 46,20 39,27 37C22 34,16 29,16 22C16 14,24 6,30 6Z"/>
              <circle cx="30" cy="37" r="2.5" fill="black"/>
            </g>
          </svg>
          <h1 className="page-title">Welcome Back</h1>
          <p className="page-subtitle">Login to your Lovekush account</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-input" type="email" placeholder="your@email.com"
              value={form.email} onChange={e=>set('email',e.target.value)} required autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="Your password"
              value={form.password} onChange={e=>set('password',e.target.value)} required />
          </div>

          {error && <div className="form-error" style={{marginBottom:12}}>{error}</div>}

          <button className="btn btn-black btn-full btn-lg" type="submit" disabled={loading} style={{marginBottom:12}}>
            {loading ? 'Logging in...' : 'Login →'}
          </button>
        </form>

        <div className="divider">or</div>

        <div style={{textAlign:'center',fontSize:14,color:'#8e8e8e'}}>
          New to Lovekush?{' '}
          <Link to="/register" style={{color:'#000',fontWeight:500,textDecoration:'none'}}>Create free account</Link>
        </div>
      </div>
    </div>
  )
}
