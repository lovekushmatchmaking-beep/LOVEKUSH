import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://wgzoabobdfvxvyuczhdz.supabase.co'
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_8tBAukER_NmWA8o89RWPZg_gDueT4Wo'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export const generateProfileCode = (gender, religion) => {
  const g = gender === 'Male' ? 'M' : 'F'
  const r = { Hindu:'H', Muslim:'M', Sikh:'S', Christian:'C', Jain:'J', Buddhist:'B' }[religion] || 'O'
  const y = new Date().getFullYear().toString().slice(-2)
  const n = Math.floor(1000 + Math.random() * 9000)
  return "LK-" + g + r + y + "-" + n
}
