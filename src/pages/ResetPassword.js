import React, { useState, useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { FormLabel } from '../components/ui'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { AuthBrand } from '../components/BrandLogo'

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
    if (password.length < 6) return setError('Password must be at least 6 characters')
    if (password !== confirmPassword) return setError('Passwords do not match')

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return setError('Password update failed, please try again.')
    setDone(true)
    setTimeout(() => navigate('/login'), 2000)
  }

  return (
    <div className="auth-screen">

      <div className="page-container auth-page">
        <div style={{textAlign:'center',marginBottom:32}}>
          <AuthBrand />
          <h1 className="page-title">Reset Password</h1>
          <p className="page-subtitle">Set your new password</p>
        </div>

        {linkInvalid ? (
          <div style={{textAlign:'center'}}>
            <div className="form-error" style={{marginBottom:20}}>
              This link is invalid or has expired. Please request a new reset link.
            </div>
            <Link to="/forgot-password" className="btn btn-black btn-full btn-lg">Request New Link</Link>
          </div>
        ) : done ? (
          <div style={{textAlign:'center'}}>
            <div className="form-hint" style={{marginBottom:20,fontSize:14}}>
              Password updated! Taking you to the login page...
            </div>
          </div>
        ) : ready ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <FormLabel>New Password</FormLabel>
              <input className="form-input" type="password" placeholder="Naya password"
                value={password} onChange={e=>setPassword(e.target.value)} required autoFocus />
            </div>

            <div className="form-group">
              <FormLabel>Confirm Password</FormLabel>
              <input className="form-input" type="password" placeholder="Re-enter password"
                value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required />
            </div>

            {error && <div className="form-error" style={{marginBottom:12}}>{error}</div>}

            <button className="btn btn-black btn-full btn-lg" type="submit" disabled={loading} style={{marginBottom:12}}>
              {loading ? 'Updating...' : 'Update Password'} <ArrowRight size={18} />
            </button>
          </form>
        ) : (
          <div style={{textAlign:'center',color:'#8e8e8e',fontSize:13}}>Checking link...</div>
        )}
      </div>
    </div>
  )
}
