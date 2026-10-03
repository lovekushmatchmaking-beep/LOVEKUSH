// Supabase Edge Function: astrology-chart
//
// Profile ki birth date/time/place se kundli vendor ko call karta hai aur
// Moon Rashi, Nakshatra, Pada (+ Manglik agar vendor de) profiles table
// mein likhta hai. Guna Milan scoring frontend mein hoti hai
// (src/utils/astrology.js) — yeh function sirf inputs bharta hai.
//
// ABHI DEPLOY NAHI HAI. Vendor choose karne ke baad sirf `callVendor()`
// bharna hai — README.md dekho.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Frontend ke exact spellings (src/utils/astrology.js) — vendor jo bhi
// spelling de, normalize karke inhi mein convert hota hai.
const RASHIS = [
  'Mesha (Aries)', 'Vrishabha (Taurus)', 'Mithuna (Gemini)', 'Karka (Cancer)',
  'Simha (Leo)', 'Kanya (Virgo)', 'Tula (Libra)', 'Vrischika (Scorpio)',
  'Dhanu (Sagittarius)', 'Makara (Capricorn)', 'Kumbha (Aquarius)', 'Meena (Pisces)',
]
const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta',
  'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
]

type MoonChart = {
  rashiIndex: number      // 0 = Mesha/Aries ... 11 = Meena/Pisces
  nakshatraIndex: number  // 0 = Ashwini ... 26 = Revati
  pada: number | null     // 1-4
  manglik?: 'Manglik' | 'Non-Manglik' | null
  raw: unknown            // vendor ka poora response, astro_api_payload mein jaata hai
}

type BirthInput = {
  date: string            // YYYY-MM-DD (profiles.date_of_birth)
  time: string            // HH:MM 24h (profiles.birth_time)
  place: string           // free text city (profiles.birth_place)
  country: string | null  // profiles.country_of_birth
}

// ======================= VENDOR ADAPTER =======================
// TODO(vendor): yahan chosen kundli API ko call karo. Zyadatar vendors ko
// latitude/longitude + timezone chahiye; agar vendor place-name accept
// nahi karta to pehle geocode karna padega (vendor ka apna geo endpoint
// ya koi geocoding API). Moon sign/nakshatra hamesha SIDEREAL (Lahiri
// ayanamsa) hone chahiye, tropical/western nahi.
async function callVendor(input: BirthInput, apiKey: string): Promise<MoonChart> {
  void input; void apiKey
  throw new Error('Astrology vendor not configured yet — fill callVendor() in supabase/functions/astrology-chart/index.ts')
}
// ==============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const apiKey = Deno.env.get('ASTROLOGY_API_KEY')
    if (!apiKey) return json({ error: 'Astrology API key not set (ASTROLOGY_API_KEY secret)' }, 503)

    const { profile_id } = await req.json()
    if (!profile_id) return json({ error: 'profile_id required' }, 400)

    // User ke apne JWT se client — RLS decide karta hai ki woh yeh profile
    // dekh/badal sakta hai ya nahi (owner ya staff).
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: profile, error } = await supabase.from('profiles')
      .select('id, date_of_birth, birth_time, birth_place, country_of_birth, astrology_consent')
      .eq('id', profile_id).single()
    if (error || !profile) return json({ error: 'Profile not found or not allowed' }, 404)
    if (!profile.date_of_birth || !profile.birth_time || !profile.birth_place) {
      return json({ error: 'Birth date, time and place are required' }, 400)
    }
    if (!profile.astrology_consent) {
      return json({ error: 'Please tick the astrology consent box in Edit Profile first' }, 400)
    }

    const chart = await callVendor({
      date: profile.date_of_birth, time: profile.birth_time,
      place: profile.birth_place, country: profile.country_of_birth,
    }, apiKey)

    const update: Record<string, unknown> = {
      rashi: RASHIS[chart.rashiIndex] ?? null,
      nakshatra: NAKSHATRAS[chart.nakshatraIndex] ?? null,
      nakshatra_pada: chart.pada,
      astro_source: 'api',
      astro_updated_at: new Date().toISOString(),
      astro_api_payload: chart.raw ?? null,
    }
    if (chart.manglik) update.manglik = chart.manglik

    const { data: saved, error: upErr } = await supabase.from('profiles')
      .update(update).eq('id', profile_id)
      .select('rashi, nakshatra, nakshatra_pada, manglik').single()
    if (upErr) return json({ error: upErr.message }, 400)
    return json({ profile: saved })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
