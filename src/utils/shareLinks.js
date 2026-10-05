import { supabase } from '../supabase'

// Ek naya secure share-link banata hai (7 din valid, revoke-able,
// view-count track hoti hai). clientProfileId (optional) = jis client ke
// liye yeh match banaya gaya — taaki baad mein "client interested" signal
// par admin ko pata chale yeh kiske liye tha (audit gap, 2026-10-05).
export async function generateShareLink(profileId, userId, clientProfileId) {
  const { data, error } = await supabase
    .from('share_links')
    .insert({ profile_id: profileId, created_by: userId, client_profile_id: clientProfileId || null })
    .select()
    .single()

  if (error) throw new Error('Could not create share link: ' + error.message)

  const baseUrl = window.location.origin
  return { ...data, url: `${baseUrl}/share/${data.token}` }
}

export async function revokeShareLink(linkId) {
  const { error } = await supabase.from('share_links').update({ revoked: true }).eq('id', linkId)
  if (error) throw new Error('Could not revoke link: ' + error.message)
}

export async function getMyShareLinks(userId) {
  const { data, error } = await supabase
    .from('share_links')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

// Ek saath kai profiles (jaise ek client ke liye chune gaye 5-6 matches)
// ek hi link mein — har profile ki apni share_links row banti hai (expiry,
// revoke, view count pehle jaise), sab ek common bundle_token se jude hote
// hain. Link: /share/m/<bundle_token>
export async function generateShareBundle(profileIds, userId, clientProfileId) {
  const bytes = new Uint8Array(16)
  window.crypto.getRandomValues(bytes)
  const bundleToken = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

  const { data, error } = await supabase
    .from('share_links')
    .insert(profileIds.map(profile_id => ({ profile_id, created_by: userId, bundle_token: bundleToken, client_profile_id: clientProfileId || null })))
    .select()

  if (error) throw new Error('Could not create share link: ' + error.message)

  return { bundleToken, links: data || [], url: `${window.location.origin}/share/m/${bundleToken}` }
}

// Client (no login) ne shared link/bundle mein ek profile par "👍
// Interested" tap kiya — SharedMatches.js se, apne hi token ke saath.
export async function markShareLinkInterest(token) {
  const { error } = await supabase.rpc('mark_share_link_interest', { p_token: token })
  if (error) throw new Error(error.message)
}

// Admin ne interest signal dekh/action le liya — "needs attention" se hata
// deta hai, record khud rehta hai.
export async function acknowledgeShareLinkInterest(linkId) {
  const { error } = await supabase.from('share_links').update({ interest_acknowledged_at: new Date().toISOString() }).eq('id', linkId)
  if (error) throw new Error('Could not update: ' + error.message)
}

// Phone par native share sheet kholta hai (WhatsApp ke recent chats sabse
// upar dikhte hain — wahi jo Paytm/UPI receipt share karte waqt dikhta
// hai). Jahan share sheet nahi hai (desktop), false return karta hai taaki
// caller wa.me fallback use kare.
export async function nativeShare({ title, text, url }) {
  if (!navigator.share) return false
  try {
    await navigator.share({ title, text, url })
  } catch (e) {
    if (e?.name !== 'AbortError') return false
  }
  return true
}
