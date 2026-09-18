import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [linkInvalid, setLinkInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Supabase JS reset-password link ke URL hash se recovery token khud
    // uthake ek temporary session bana deta hai — thoda time lagta hai
    // isliye foran "invalid" nahi bolte, PASSWORD_RECOVERY event ya
    // session ka thoda wait karte hain, tabhi invalid maante hain.
    let resolved = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        resolved = true
        setReady(true)
      }
    })
    const timer = setTimeout(() => {
      if (!resolved) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) setReady(true)
          else setLinkInvalid(true)
        })
      }
    }, 1500)
    return () => { subscription.unsubscribe(); clearTimeout(timer) }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError('Password kam se kam 6 characters ka hona chahiye')
    if (password !== confirmPassword) return setError('Dono password match nahi kar rahe')

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return setError('Password update nahi ho paaya, dobara try karein.')
    setDone(true)
    setTimeout(() => navigate('/login'), 2000)
  }

  return (
    <div style={{minHeight:'100vh',background:'#fff'}}>
      <nav className="navbar">
        <Link to="/" className="nav-brand">LOVEKUSH</Link>
      </nav>

      <div className="page-container">
        <div style={{textAlign:'center',marginBottom:32}}>
          <svg width="40" height="40" viewBox="0 0 60 60" fill="none" style={{margin:'0 auto 12px',display:'block'}}>
            <g stroke="black" strokeWidth="2.2" strokeLinecap="round" fill="none">
              <path d="M30 6C36 6,44 14,44 22C44 29,38 34,33 37C40 39,51 46,51 55C51 59,44 62,37 58C33 55,31 51,30 47C29 51,27 55,23 58C16 62,9 59,9 55C9 46,20 39,27 37C22 34,16 29,16 22C16 14,24 6,30 6Z"/>
              <circle cx="30" cy="37" r="2.5" fill="black"/>
            </g>
          </svg>
          <h1 className="page-title">Reset Password</h1>
          <p className="page-subtitle">Apna naya password set karein</p>
        </div>

        {linkInvalid ? (
          <div style={{textAlign:'center'}}>
            <div className="form-error" style={{marginBottom:20}}>
              Yeh link invalid ya expire ho chuka hai. Naya reset link mangwayein.
            </div>
            <Link to="/forgot-password" className="btn btn-black btn-full btn-lg">Request New Link</Link>
          </div>
        ) : done ? (
          <div style={{textAlign:'center'}}>
            <div className="form-hint" style={{marginBottom:20,fontSize:14}}>
              Password update ho gaya! Aapko login page par bheja ja raha hai...
            </div>
          </div>
        ) : ready ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input className="form-input" type="password" placeholder="Naya password"
                value={password} onChange={e=>setPassword(e.target.value)} required autoFocus />
            </div>

            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input className="form-input" type="password" placeholder="Password dobara likhein"
                value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required />
            </div>

            {error && <div className="form-error" style={{marginBottom:12}}>{error}</div>}

            <button className="btn btn-black btn-full btn-lg" type="submit" disabled={loading} style={{marginBottom:12}}>
              {loading ? 'Updating...' : 'Update Password →'}
            </button>
          </form>
        ) : (
          <div style={{textAlign:'center',color:'#8e8e8e',fontSize:13}}>Checking link...</div>
        )}
      </div>
    </div>
  )
}
