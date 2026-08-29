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
