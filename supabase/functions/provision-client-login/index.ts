// Supabase Edge Function: provision-client-login
//
// Bug (Aryan, 2026-10-12): admin ki banayi profile (CreateProfile adminMode)
// sirf public.profiles mein row banati thi, user_id = null. Supabase Auth
// (auth.users) mein us email ka koi account hi nahi banta tha — isliye
// user-site par na login hota tha ("Invalid login credentials"), na
// Forgot Password ka email aata tha (Supabase unknown email par chupchaap
// 200 deta hai, mail nahi bhejta).
//
// Yeh function wahi missing step hai. Sirf active staff call kar sakta hai:
//   1. profile ki client_email se auth user banata hai (email pehle se
//      confirmed — admin ne khud verify karke daali hai), ya agar us email
//      ka account pehle se hai (client ne khud register kiya tha par profile
//      nahi banayi) to wahi use karta hai,
//   2. profiles.user_id us account se jod deta hai,
//   3. ek "set password" (recovery) link bana ke admin ko lauta deta hai,
//      jo admin WhatsApp par bhej sakta hai. Email nahi bhejta — Supabase
//      ka default mailer client emails tak bharose se nahi pahunchta; client
//      baad mein khud bhi "Forgot password" use kar sakta hai.
//
// Service-role key sirf yahin (server par) rehti hai, browser mein kabhi nahi.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !callerData?.user) return json({ error: 'Not authenticated' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: staff } = await admin.from('staff_users').select('user_id')
      .eq('user_id', callerData.user.id).eq('active', true).maybeSingle()
    if (!staff) return json({ error: 'Only staff can create client logins' }, 403)

    const { profile_id, redirect_to } = await req.json()
    if (!profile_id) return json({ error: 'Missing profile_id' }, 400)

    const { data: profile, error: pErr } = await admin.from('profiles')
      .select('id, user_id, client_email, full_name, profile_code').eq('id', profile_id).maybeSingle()
    if (pErr) return json({ error: pErr.message }, 500)
    if (!profile) return json({ error: 'Profile not found' }, 404)

    let userId: string | null = profile.user_id
    let email: string | null = null
    let created = false

    if (userId) {
      // Login pehle se juda hai — sirf naya set-password link chahiye.
      const { data: u, error: uErr } = await admin.auth.admin.getUserById(userId)
      if (uErr || !u?.user?.email) return json({ error: 'Linked login account not found' }, 500)
      email = u.user.email
    } else {
      email = String(profile.client_email || '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: 'Add a valid client email on this profile first' }, 400)
      }

      const { data: newUser, error: cErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: profile.full_name, created_by_staff: callerData.user.id },
      })
      if (newUser?.user) {
        userId = newUser.user.id
        created = true
      } else {
        // Email pehle se registered ho sakti hai (client ne khud signup
        // kiya tha) — us case mein wahi account dhoondh ke jodte hain.
        const existing = await findUserByEmail(admin, email)
        if (!existing) return json({ error: cErr?.message || 'Could not create login' }, 500)
        userId = existing.id

        const { data: isStaff } = await admin.from('staff_users').select('user_id').eq('user_id', userId).maybeSingle()
        if (isStaff) return json({ error: 'This email belongs to a staff account. Use the client\'s own email.' }, 409)

        const { data: other } = await admin.from('profiles').select('profile_code')
          .eq('user_id', userId).neq('id', profile.id).limit(1).maybeSingle()
        if (other) return json({ error: `This email already has its own profile (${other.profile_code || 'another profile'})` }, 409)
      }

      const { error: linkErr } = await admin.from('profiles').update({ user_id: userId })
        .eq('id', profile.id).is('user_id', null)
      if (linkErr) {
        if (created) await admin.auth.admin.deleteUser(userId!)
        return json({ error: linkErr.message }, 500)
      }
    }

    const { data: linkData, error: gErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: email!,
      options: redirect_to ? { redirectTo: String(redirect_to) } : undefined,
    })
    if (gErr) return json({ error: gErr.message, linked: true, created, email }, 500)

    return json({ success: true, created, email, link: linkData?.properties?.action_link || null })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

// auth-js mein email se seedha lookup nahi hai; user base chhota hai, isliye
// pages mein scan karna theek hai.
async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data?.users?.length) return null
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === email)
    if (hit) return hit
    if (data.users.length < 1000) return null
  }
  return null
}
