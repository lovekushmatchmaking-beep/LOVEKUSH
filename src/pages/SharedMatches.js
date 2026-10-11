import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { markShareLinkInterest, markShareLinkNotInterested } from '../utils/shareLinks'
import { ShareShell, ShareProfileCard, ShareLoading, ShareError } from '../components/ShareProfileCard'

// Ek hi link mein kai matches (Admin "Find Matches" se chune hue) — bina
// login ke khulta hai. SharedProfile jaisa hi: data "get_shared_bundle"
// Postgres function se aata hai jo expiry/revoke khud check karta hai aur
// naam masked hota hai ("A. Kushwaha" format), par dono saved photos
// (zoom karke) ab dikhti hain (Aryan, 2026-10-10 — pehle kabhi nahi dikhti thi).

export default function SharedMatches() {
  const { token } = useParams()
  const [profiles, setProfiles] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  // token -> null | 'int-sending' | 'int-done' | 'int-error' | 'ni-sending' | 'ni-done'
  // Client (no login) ke action ko server mein likhta hai (audit gap, 2026-10-05).
  const [actionStates, setActionStates] = useState({})

  const markInterested = async (tok) => {
    if (actionStates[tok]) return
    setActionStates(prev => ({ ...prev, [tok]: 'int-sending' }))
    try {
      await markShareLinkInterest(tok)
      setActionStates(prev => ({ ...prev, [tok]: 'int-done' }))
    } catch (err) {
      setActionStates(prev => ({ ...prev, [tok]: 'int-error' }))
    }
  }

  const markNotInterested = async (tok) => {
    if (actionStates[tok]) return
    setActionStates(prev => ({ ...prev, [tok]: 'ni-sending' }))
    try {
      await markShareLinkNotInterested(tok)
      setActionStates(prev => ({ ...prev, [tok]: 'ni-done' }))
    } catch (err) {
      // Silently ignore errors — client doesn't need to know
      setActionStates(prev => ({ ...prev, [tok]: 'ni-done' }))
    }
  }

  useEffect(() => {
    const load = async () => {
      const { data, error: err } = await supabase.rpc('get_shared_bundle', { p_token: token })
      if (err) {
        setError(err.message.includes('invalid') || err.message.includes('expired')
          ? 'This link has expired or is no longer available. Please ask LOVEKUSH to share a fresh link.'
          : 'Could not load these profiles: ' + err.message)
      } else if (!data || data.length === 0) {
        setError('This link is invalid.')
      } else {
        setProfiles(data)
        document.title = `${data.length} Matches — LOVEKUSH`
      }
      setLoading(false)
    }
    load()
  }, [token])

  if (loading) return <ShareLoading />
  if (error) return <ShareError message={error} />

  const expiresAt = profiles.reduce((min, p) => (!min || new Date(p.expires_at) < min ? new Date(p.expires_at) : min), null)

  // Same card as SharedProfile (ShareProfileCard) — every row in a bundle
  // carries the same client/RM, so those show once in the shell.
  return (
    <ShareShell headline={`${profiles.length} ${profiles.length === 1 ? 'match' : 'matches'} handpicked for you`}
      client={profiles[0]} rm={profiles[0]} expiresAt={expiresAt}>
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        {profiles.map(p => (
          <ShareProfileCard key={p.token} p={p} state={actionStates[p.token]}
            onInterested={()=>markInterested(p.token)} onNotInterested={()=>markNotInterested(p.token)}
            errorHint="Could not send. Please try again, or reply with the Profile ID." />
        ))}
      </div>
    </ShareShell>
  )
}
