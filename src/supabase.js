import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://wgzoabobdfvxvyuczhdz.supabase.co'
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_8tBAukER_NmWA8o89RWPZg_gDueT4Wo'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Public Profile ID — fully random, 8 uppercase alphanumeric characters,
// no prefix/dash, and never derived from name/gender/DOB/religion/city
// (the old "LK-{gender}{religion}{yy}-nnnn" format leaked those via the
// ID itself). Confusing characters (0/O, 1/I/L) are excluded so the ID
// is easy to read/say aloud. Checks the DB for a collision and retries
// until a unique code is found (8 chars from a 31-symbol alphabet is
// ~8.5e11 combinations, so collisions are rare, but we never assume).
const PROFILE_ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const PROFILE_ID_LENGTH = 8

const randomProfileId = () => {
  let id = ''
  for (let i = 0; i < PROFILE_ID_LENGTH; i++) {
    id += PROFILE_ID_ALPHABET[Math.floor(Math.random() * PROFILE_ID_ALPHABET.length)]
  }
  return id
}

export const generateProfileCode = async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = randomProfileId()
    const { data } = await supabase.from('profiles').select('id').eq('profile_code', candidate).maybeSingle()
    if (!data) return candidate
  }
  throw new Error('Could not generate a unique Profile ID, please try again.')
}
