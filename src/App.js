import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import CreateProfile from './pages/CreateProfile'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import SharedProfile from './pages/SharedProfile'
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) checkStaffStatus(session.user.id)
      else { setStaffUser(null); setLoading(false) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'serif', fontSize: 28, letterSpacing: '0.5em', marginBottom: 8 }}>LOVEKUSH</div>
        <div style={{ fontSize: 12, opacity: 0.4, letterSpacing: '0.2em' }}>Loading...</div>
      </div>
    </div>
  )

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing user={user} />} />
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/register" element={!user ? <Register /> : <Navigate to="/dashboard" />} />
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
                    <div style={{ fontSize: 40 }}>🔒</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>Access Restricted</div>
                    <div style={{ fontSize: 13, color: '#8e8e8e', maxWidth: 320 }}>Yeh page sirf LOVEKUSH staff ke liye hai. Agar aap staff hain aur yeh galti se dikh raha hai, apne administrator se sampark karein.</div>
                  </div>
          }
        />
        {/* Public — koi login nahi chahiye, family member seedha khol sakta hai */}
        <Route path="/share/:token" element={<SharedProfile />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}
