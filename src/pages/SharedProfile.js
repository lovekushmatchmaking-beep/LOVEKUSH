import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { markShareLinkInterest, markShareLinkNotInterested, submitBureauReply } from '../utils/shareLinks'
import { ShareShell, ShareProfileCard, ShareLoading, ShareError, BureauReplyBox } from '../components/ShareProfileCard'

// Yeh page KISI KO BHI (bina login ke) khulti hai jab woh secure share
// link kholega. Data seedha "get_shared_profile" Postgres function se
// aata hai (SQL migration mein bana hai) — yeh function khud check
// karta hai ki link valid/expired/revoked hai ya nahi, aur sirf MASKED
// info deta hai (naam bhi "Priya S." jaisa masked hota hai).

export default function SharedProfile() {
  const { token } = useParams()
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  // null | 'int-sending' | 'int-done' | 'int-error' | 'ni-sending' | 'ni-done'
  const [actionState, setActionState] = useState(null)
  // Bureau share (Aryan, 2026-10-11): free-text reply instead of the
  // Interested/Not Interested buttons above. null | 'sending' | 'sent' | 'error'.
  const [bureauDraft, setBureauDraft] = useState('')
  const [bureauState, setBureauState] = useState(null)

  const sendBureauReply = async () => {
    if (bureauState === 'sending' || !bureauDraft.trim()) return
    setBureauState('sending')
    try {
      await submitBureauReply(token, bureauDraft)
      setBureauState('sent')
    } catch (err) {
      setBureauState('error')
    }
  }

  const markInterested = async () => {
    if (actionState) return
    setActionState('int-sending')
    try {
      await markShareLinkInterest(token)
      setActionState('int-done')
    } catch (err) {
      setActionState('int-error')
    }
  }

  const markNotInterested = async () => {
    if (actionState) return
    setActionState('ni-sending')
    try {
      await markShareLinkNotInterested(token)
      setActionState('ni-done')
    } catch (err) {
      // Silently ignore errors — client doesn't need to know
      setActionState('ni-done')
    }
  }

  useEffect(() => {
    loadSharedProfile()
  }, [token])

  const loadSharedProfile = async () => {
    const { data, error: err } = await supabase.rpc('get_shared_profile', { p_token: token })
    if (err) {
      setError(err.message.includes('invalid') || err.message.includes('expired')
        ? 'This link has expired or is no longer available. Please ask LOVEKUSH to share a fresh link.'
        : 'Could not load this profile: ' + err.message)
    } else if (!data || data.length === 0) {
      setError('This link is invalid.')
    } else {
      setProfile(data[0])
      document.title = `${data[0].masked_name || 'Profile'} — LOVEKUSH`
    }
    setLoading(false)
  }

  if (loading) return <ShareLoading />
  if (error) return <ShareError message={error} />

  // Puri biodata — contact (phone/email) ke siwa — Aryan, 2026-10-09.
  // Layout ShareProfileCard mein hai (SharedMatches ke saath shared).
  // Bureau share: headline/footer badalte hain (reply box, no
  // Interested/Not Interested — yeh client ke liye nahi hai).
  return (
    <ShareShell headline={profile.is_bureau_share ? 'A profile for your review' : 'A match handpicked for you'}
      client={profile} rm={profile} expiresAt={profile.expires_at}>
      <ShareProfileCard p={profile} state={actionState}
        onInterested={markInterested} onNotInterested={markNotInterested}
        errorHint="Could not send. Please try again, or contact LOVEKUSH directly."
        footer={profile.is_bureau_share ? (
          <BureauReplyBox state={bureauState} draft={bureauDraft} onDraftChange={setBureauDraft}
            onSubmit={sendBureauReply}
            errorHint="Could not send. Please try again, or contact LOVEKUSH directly." />
        ) : undefined} />
    </ShareShell>
  )
}
