import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { SplashScreen } from './components/BrandLogo'
import { SUPPORT_EMAIL } from './components/ui'
import { supabase } from './supabase'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import CreateProfile from './pages/CreateProfile'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import SharedProfile from './pages/SharedProfile'
import SharedMatches from './pages/SharedMatches'
import './App.css'

// PEHLE: "/admin" route bina kisi real check ke Admin component render
// kar deta tha — andar ek client-side hardcoded-password prompt tha
// (jo asal mein security nahi hai, koi bhi browser se dekh sakta tha).
// AB: /admin sirf un logged-in users ko dikhta hai jo "staff_users"
// table mein active row rakhte hain — yeh check database (RLS ke
// saath) se hota hai, browser mein koi secret nahi.

export default function App() {
  const [user, setUser] = useState(null)
  const [staffUser, setStaffUser] = useState(null) // null = not staff, undefined = still checking
  const [loading, setLoading] = useState(true)
  // Blocked clients — admin "blocked" karta hai to sirf profiles.profile_status
  // flag set hota tha, login ko koi farq nahi padta tha (Aryan ka audit, gap 1).
  // Ab har login/session-restore par apna profile_status check karte hain;
  // blocked ho to turant sign-out karke yeh screen dikha dete hain.
  const [blocked, setBlocked] = useState(false)
  // Splash — har app-open par ek baar (session mein), kam se kam itni der
  // dikhta hai taaki logo flash na ho; phir smooth fade-out.
  const [splash, setSplash] = useState(() => {
    try { return sessionStorage.getItem('lk_splash') ? 'off' : 'on' } catch { return 'on' }
  })
  useEffect(() => {
    if (splash !== 'on') return
    const t = setTimeout(() => setSplash('min-done'), 1200)
    return () => clearTimeout(t)
  }, [splash])
  useEffect(() => {
    if (splash !== 'min-done' || loading) return
    setSplash('leaving')
    try { sessionStorage.setItem('lk_splash', '1') } catch {}
    const t = setTimeout(() => setSplash('off'), 450)
    return () => clearTimeout(t)
  }, [splash, loading])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) checkStaffStatus(session.user.id)
      else { setStaffUser(null); setLoading(false) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Safety net: agar kisi bhi wajah se (misconfigured redirect URL,
      // purana email link, etc.) recovery session kisi aur page par
      // land ho jaaye, use zabardasti /reset-password par bhej dete
      // hain — taaki koi user galti se "logged in dikhe lekin password
      // reset ka option na mile" wali situation mein na fase.
      if (_event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/reset-password') {
        window.location.replace('/reset-password')
        return
      }
      setUser(session?.user ?? null)
      if (session?.user) checkStaffStatus(session.user.id)
      else setStaffUser(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const checkStaffStatus = async (userId) => {
    const { data } = await supabase
      .from('staff_users')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()
    setStaffUser(data || null)
    // Staff ko block check se exempt rakhte hain (woh khud hi blocking karte
    // hain) — sirf member profile check karte hain jab user staff na ho.
    if (!data) await checkBlockedStatus(userId)
    else setLoading(false)
  }

  const checkBlockedStatus = async (userId) => {
    const { data: prof } = await supabase
      .from('profiles')
      .select('profile_status')
      .eq('user_id', userId)
      .maybeSingle()
    if (prof?.profile_status === 'blocked') {
      await supabase.auth.signOut()
      setUser(null)
      setBlocked(true)
    } else {
      setBlocked(false)
    }
    setLoading(false)
  }

  if (loading || splash === 'on' || splash === 'min-done') return <SplashScreen />

  if (blocked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, textAlign: 'center', padding: 20 }}>
        <div className="empty-state-icon" style={{ margin: 0 }}><Lock size={28} /></div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Account Blocked</div>
        <div style={{ fontSize: 13, color: '#8e8e8e', maxWidth: 320 }}>Your account has been blocked by the LOVEKUSH team. Please contact support.</div>
        <a className="btn btn-black btn-sm" style={{ textDecoration: 'none', marginTop: 8 }} href={`mailto:${SUPPORT_EMAIL}`}>Contact Support</a>
        <button className="btn btn-outline btn-sm" onClick={() => setBlocked(false)}>Back to Login</button>
      </div>
    )
  }

  return (
    <>
    {splash === 'leaving' && <SplashScreen leaving />}
    <BrowserRouter>
      <Routes>
        {/* Instagram jaisa: logged in ho to seedha account, warna seedha login */}
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/register" element={!user ? <Register /> : <Navigate to="/dashboard" />} />
        <Route path="/forgot-password" element={!user ? <ForgotPassword /> : <Navigate to="/dashboard" />} />
        {/* /reset-password ko !user se gate nahi karte — recovery link khud
            hi ek temporary session bana deta hai, jisse "user" set ho jaata
            hai, isliye yahan "user hai to redirect" wala pattern nahi chalega */}
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/create-profile" element={user ? <CreateProfile user={user} /> : <Navigate to="/login" />} />
        <Route path="/dashboard" element={user ? <Dashboard user={user} /> : <Navigate to="/login" />} />
        <Route
          path="/admin"
          element={
            !user
              ? <Navigate to="/login" />
              : staffUser
                ? <Admin staffUser={staffUser} />
                : <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, textAlign: 'center', padding: 20 }}>
                    <div className="empty-state-icon" style={{ margin: 0 }}><Lock size={28} /></div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>Access Restricted</div>
                    <div style={{ fontSize: 13, color: '#8e8e8e', maxWidth: 320 }}>This page is for LOVEKUSH staff only. If you are staff and see this by mistake, contact your administrator.</div>
                  </div>
          }
        />
        {/* Public — koi login nahi chahiye, family member seedha khol sakta hai */}
        <Route path="/share/m/:token" element={<SharedMatches />} />
        <Route path="/share/:token" element={<SharedProfile />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
    </>
  )
}
