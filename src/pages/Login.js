import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { AuthBrand } from '../components/BrandLogo'

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
    <div className="auth-screen">
      <div className="page-container auth-page">
        <AuthBrand />

        <form onSubmit={handleLogin}>
          <input className="form-input" type="email" placeholder="Email address" aria-label="Email address" autoComplete="email"
            value={form.email} onChange={e=>set('email',e.target.value)} required style={{marginBottom:10}} />
          <input className="form-input" type="password" placeholder="Password" aria-label="Password" autoComplete="current-password"
            value={form.password} onChange={e=>set('password',e.target.value)} required style={{marginBottom:14}} />

          {error && <div className="form-error" style={{marginBottom:12}}>{error}</div>}

          <button className="btn btn-black btn-full btn-lg" type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <div style={{textAlign:'center',marginTop:18}}>
          <Link to="/forgot-password" style={{fontSize:13,color:'var(--ink)',fontWeight:500,textDecoration:'none'}}>Forgot password?</Link>
        </div>
      </div>

      <div className="auth-foot">
        Don't have an account?{' '}
        <Link to="/register" style={{color:'var(--primary)',fontWeight:600,textDecoration:'none'}}>Sign up</Link>
      </div>
    </div>
  )
}
