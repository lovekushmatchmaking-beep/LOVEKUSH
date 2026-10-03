import { supabase } from '../supabase'

// Ek naya secure share-link banata hai (7 din valid, revoke-able,
// view-count track hoti hai). Return: poora URL jo share kiya ja sake.
export async function generateShareLink(profileId, userId) {
  const { data, error } = await supabase
    .from('share_links')
    .insert({ profile_id: profileId, created_by: userId })
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
export async function generateShareBundle(profileIds, userId) {
  const bytes = new Uint8Array(16)
  window.crypto.getRandomValues(bytes)
  const bundleToken = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

  const { data, error } = await supabase
    .from('share_links')
    .insert(profileIds.map(profile_id => ({ profile_id, created_by: userId, bundle_token: bundleToken })))
    .select()

  if (error) throw new Error('Could not create share link: ' + error.message)

  return { bundleToken, links: data || [], url: `${window.location.origin}/share/m/${bundleToken}` }
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
