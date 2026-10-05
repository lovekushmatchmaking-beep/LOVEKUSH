// Supabase Edge Function: notify-email
//
// Aryan ka audit (gap #9): koi notification channel nahi tha — client ko
// naye match/introduction/meeting-schedule ka pata sirf app khol ke chalta
// tha. Woh WhatsApp/SMS abhi scope se bahar hain (vendor decide nahi hua),
// par email ke liye koi naya paid vendor nahi chahiye — Supabase Auth ke
// liye already configurable SMTP ko yahan reuse karte hain.
//
// Trigger: public.notify_profile_owner() (jo har coordination_request_
// received / meeting_scheduled par already chalta hai, in-app bell ke
// liye — PR "in-app notifications") ab ek pg_net async HTTP call se yeh
// function bhi fire karta hai. Yeh function khud SMTP se email bhejta hai.
//
// SMTP secrets abhi set NAHI hain (Aryan ko Supabase Dashboard > Edge
// Functions > Secrets mein SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
// SMTP_FROM daalne hain — jo bhi SMTP account Auth emails ke liye use
// karte hain, wahi credentials yahan reuse ho sakte hain). Jab tak set
// nahi hote, yeh function safely no-op karta hai — kisi bhi existing flow
// ko block/fail nahi karta.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const EMAIL_SUBJECTS: Record<string, string> = {
  coordination_request_received: 'New request on LOVEKUSH',
  meeting_scheduled: 'Your meeting/call has been scheduled — LOVEKUSH',
}

// Is endpoint ko koi real user call nahi karta — sirf Postgres trigger
// (notify_profile_owner, pg_net se) internally call karta hai. Supabase
// ka anon/publishable key public hai (frontend bundle mein already), isliye
// verify_jwt=true akela kaafi nahi — ek shared secret bhi check karte hain
// jo sirf is function aur DB trigger ko pata hai (hardcoded, low-value
// internal token — service-role key jaisa secret kabhi nahi, kyunki woh
// Postgres ko is session se expose nahi ho sakta). Compromise ho jaaye to
// dono jagah (yahan + migration) badal ke redeploy karna.
const SHARED_SECRET = '7cd4b6a65a3841dfaaa1207b6cbcc18b4494b5f5f93b566681550e5619b514e'

Deno.serve(async (req: Request) => {
  try {
    if (req.headers.get('x-notify-secret') !== SHARED_SECRET) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    }
    const { user_id, type, message } = await req.json()
    if (!user_id || !message) {
      return new Response(JSON.stringify({ error: 'Missing user_id/message' }), { status: 400 })
    }

    const smtpHost = Deno.env.get('SMTP_HOST')
    const smtpUser = Deno.env.get('SMTP_USER')
    const smtpPass = Deno.env.get('SMTP_PASS')
    const smtpFrom = Deno.env.get('SMTP_FROM') || smtpUser
    if (!smtpHost || !smtpUser || !smtpPass) {
      // SMTP abhi configure nahi hua — safe no-op, kisi ko fail nahi karna.
      return new Response(JSON.stringify({ skipped: true, reason: 'SMTP not configured' }), { status: 200 })
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: userData, error: userErr } = await adminClient.auth.admin.getUserById(user_id)
    const email = userData?.user?.email
    if (userErr || !email) {
      return new Response(JSON.stringify({ skipped: true, reason: 'No email on file' }), { status: 200 })
    }

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: Number(Deno.env.get('SMTP_PORT') || '587'),
        tls: true,
        auth: { username: smtpUser, password: smtpPass },
      },
    })
    await client.send({
      from: smtpFrom,
      to: email,
      subject: EMAIL_SUBJECTS[type] || 'Update from LOVEKUSH',
      content: message,
    })
    await client.close()

    return new Response(JSON.stringify({ sent: true }), { status: 200 })
  } catch (e) {
    // Best-effort — email failure kabhi bhi caller (DB trigger) ko fail
    // nahi karni chahiye.
    console.error('notify-email failed:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 })
  }
})
