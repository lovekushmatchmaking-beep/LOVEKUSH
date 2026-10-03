// Kundli API ka integration point — abhi BAND hai.
//
// API key kabhi frontend mein nahi rakhni (browser mein sabko dikh jaati
// hai), isliye call Supabase edge function `astrology-chart` se hoti hai
// (supabase/functions/astrology-chart/index.ts). Woh function profile ki
// birth date/time/place se vendor ko call karke Rashi, Nakshatra, Pada
// (aur optional Manglik) profiles table mein likhta hai
// (astro_source = 'api'). Guna Milan (src/utils/astrology.js) wahi
// values use karta hai — matching code mein kuch badalna nahi padega.
//
// Chalu karne ke steps: supabase/functions/astrology-chart/README.md

export const isAstrologyApiEnabled = () => process.env.REACT_APP_ASTROLOGY_API_ENABLED === 'true'

// Returns the updated profile row ({ rashi, nakshatra, nakshatra_pada,
// manglik, ... }) or throws with a readable message.
export async function calculateMoonChartFromBirthDetails(supabase, profileId) {
  if (!isAstrologyApiEnabled()) throw new Error('Astrology API abhi connect nahi hui hai')
  const { data, error } = await supabase.functions.invoke('astrology-chart', { body: { profile_id: profileId } })
  if (error) throw new Error(error.message || 'Astrology API call failed')
  if (data?.error) throw new Error(data.error)
  return data.profile
}
