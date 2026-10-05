// Supabase Edge Function: delete-account
//
// Aryan ka audit (gap #8): account delete sirf profiles row delete karta
// tha (aur FK constraints ki wajah se kabhi fail bhi ho jaata tha — ab
// migration 20261005_full_account_delete.sql se fix). Login credentials
// (auth.users) client se kabhi delete nahi ho sakte the — woh service-role
// key maangta hai, jo browser mein kabhi nahi rakhte. Yeh edge function
// wahi missing piece hai: caller apna hi account delete kar sakta hai,
// koi admin privilege client ko nahi milta.
//
// auth.users delete hote hi public.profiles.user_id FK (ON DELETE CASCADE,
// already pehle se) profile row aur usse juda sab kuch (photos row, match_
// actions, introductions, notes, reports, blocks, share_links, etc — sab
// migrations se cascade) khud saaf kar deta hai. Sirf storage ki photos
// (actual files) is se pehle client khud delete karta hai, jaisa pehle se
// hota tha.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: cors })
    }

    // Caller ki identity unki hi JWT se nikalte hain (anon key client) —
    // isse koi dusre ka account delete nahi kar sakta.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: cors })
    }

    // Service-role admin client — sirf yahi auth.users delete kar sakta hai.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { error: delErr } = await adminClient.auth.admin.deleteUser(userData.user.id)
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message }), { status: 500, headers: cors })
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors })
  }
})
