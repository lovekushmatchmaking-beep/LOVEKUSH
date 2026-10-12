import { supabase } from '../supabase'

// Admin ki banayi profile ke liye user-site login banata/jodta hai aur ek
// "set password" link lautata hai (edge function: provision-client-login).
// Returns { email, link, created }.
export async function provisionClientLogin(profileId) {
  const { data, error } = await supabase.functions.invoke('provision-client-login', {
    body: { profile_id: profileId, redirect_to: window.location.origin + '/reset-password' },
  })
  if (error) {
    // Function ka apna error message (e.g. "Add a valid client email…")
    // response body mein hota hai, generic "non-2xx" nahi dikhana.
    let message = error.message
    try { message = (await error.context.json()).error || message } catch { /* keep generic */ }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export function loginLinkMessage(name, email, link) {
  return [
    `Hi${name ? ' ' + name.split(' ')[0] : ''}, your LOVEKUSH profile is ready.`,
    `Login email: ${email}`,
    `Set your password here (link works once, valid for a short time): ${link}`,
    `Later you can always use "Forgot password" on the login page.`,
  ].join('\n')
}
