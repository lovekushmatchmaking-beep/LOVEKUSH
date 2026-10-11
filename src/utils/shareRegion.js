// ===== SHARE REGION — Aryan (2026-10-11): shared links / profile cards
// showed the exact locality ("Rani Bagh", "Shakurpur Village") which lets
// another bureau trace the family directly. Anything that leaves the app
// now shows only the Indian STATE (or the country, for profiles abroad).
// Admin's own screens keep the full city.
//
// The same logic lives server-side in public.share_region()
// (migration 20261011_share_state_only_location.sql) so the public RPCs
// never even send the city. Keep the two lists in sync.

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal',
  // Union territories
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]

const STATE_ALIASES = {
  'new delhi': 'Delhi', 'nct delhi': 'Delhi', 'delhi ncr': 'Delhi', 'ncr': 'Delhi',
  'up': 'Uttar Pradesh', 'u.p.': 'Uttar Pradesh', 'u.p': 'Uttar Pradesh',
  'mp': 'Madhya Pradesh', 'm.p.': 'Madhya Pradesh', 'orissa': 'Odisha',
  'uttaranchal': 'Uttarakhand', 'pondicherry': 'Puducherry', 'j&k': 'Jammu and Kashmir',
  'jammu & kashmir': 'Jammu and Kashmir', 'hp': 'Himachal Pradesh', 'wb': 'West Bengal',
  'tamilnadu': 'Tamil Nadu', 'chattisgarh': 'Chhattisgarh',
}

// Cities, towns and Delhi localities that show up in the data (or are
// common) → their state. A place not listed here simply isn't shown.
export const CITY_STATE = {
  // Delhi localities
  'delhi': 'Delhi', 'rani bagh': 'Delhi', 'ranibagh': 'Delhi', 'pitampura': 'Delhi', 'pitam pura': 'Delhi',
  'shalimar bagh': 'Delhi', 'uttam nagar': 'Delhi', 'shakurpur': 'Delhi', 'shakur pur': 'Delhi',
  'shakurpur village': 'Delhi', 'dilshad garden': 'Delhi', 'new ashok nagar': 'Delhi', 'rohini': 'Delhi',
  'dwarka': 'Delhi', 'janakpuri': 'Delhi', 'laxmi nagar': 'Delhi', 'mayur vihar': 'Delhi',
  'karol bagh': 'Delhi', 'saket': 'Delhi', 'narela': 'Delhi', 'najafgarh': 'Delhi',
  // Uttar Pradesh
  'agra': 'Uttar Pradesh', 'achnera': 'Uttar Pradesh', 'allahabad': 'Uttar Pradesh', 'prayagraj': 'Uttar Pradesh',
  'ayodhya': 'Uttar Pradesh', 'azamgarh': 'Uttar Pradesh', 'bareilly': 'Uttar Pradesh', 'firozabad': 'Uttar Pradesh',
  'noida': 'Uttar Pradesh', 'greater noida': 'Uttar Pradesh', 'ghaziabad': 'Uttar Pradesh', 'sambhal': 'Uttar Pradesh',
  'chhapraula': 'Uttar Pradesh', 'lucknow': 'Uttar Pradesh', 'kanpur': 'Uttar Pradesh', 'varanasi': 'Uttar Pradesh',
  'meerut': 'Uttar Pradesh', 'mathura': 'Uttar Pradesh', 'aligarh': 'Uttar Pradesh', 'moradabad': 'Uttar Pradesh',
  'gorakhpur': 'Uttar Pradesh', 'jhansi': 'Uttar Pradesh', 'etawah': 'Uttar Pradesh', 'mainpuri': 'Uttar Pradesh',
  'hapur': 'Uttar Pradesh', 'bulandshahr': 'Uttar Pradesh', 'saharanpur': 'Uttar Pradesh', 'muzaffarnagar': 'Uttar Pradesh',
  // Haryana
  'gurugram': 'Haryana', 'gurgaon': 'Haryana', 'faridabad': 'Haryana', 'old faridabad': 'Haryana', 'karnal': 'Haryana',
  'sonipat': 'Haryana', 'sonepat': 'Haryana', 'panipat': 'Haryana', 'rohtak': 'Haryana', 'hisar': 'Haryana',
  'ambala': 'Haryana', 'rewari': 'Haryana', 'bahadurgarh': 'Haryana', 'palwal': 'Haryana', 'jhajjar': 'Haryana',
  // Rajasthan
  'jaipur': 'Rajasthan', 'jodhpur': 'Rajasthan', 'udaipur': 'Rajasthan', 'kota': 'Rajasthan', 'ajmer': 'Rajasthan',
  'alwar': 'Rajasthan', 'bikaner': 'Rajasthan', 'behror': 'Rajasthan', 'kotputli': 'Rajasthan',
  'katputli behror': 'Rajasthan', 'kotputli behror': 'Rajasthan', 'bharatpur': 'Rajasthan',
  // Others
  'ludhiana': 'Punjab', 'amritsar': 'Punjab', 'jalandhar': 'Punjab', 'patiala': 'Punjab', 'mohali': 'Punjab',
  'mumbai': 'Maharashtra', 'pune': 'Maharashtra', 'nagpur': 'Maharashtra', 'nashik': 'Maharashtra', 'thane': 'Maharashtra',
  'bengaluru': 'Karnataka', 'bangalore': 'Karnataka', 'mysore': 'Karnataka', 'mysuru': 'Karnataka',
  'chennai': 'Tamil Nadu', 'coimbatore': 'Tamil Nadu', 'hyderabad': 'Telangana', 'kolkata': 'West Bengal',
  'ahmedabad': 'Gujarat', 'surat': 'Gujarat', 'vadodara': 'Gujarat', 'rajkot': 'Gujarat',
  'bhopal': 'Madhya Pradesh', 'indore': 'Madhya Pradesh', 'gwalior': 'Madhya Pradesh', 'jabalpur': 'Madhya Pradesh',
  'patna': 'Bihar', 'gaya': 'Bihar', 'dehradun': 'Uttarakhand', 'haridwar': 'Uttarakhand', 'rishikesh': 'Uttarakhand',
  'shimla': 'Himachal Pradesh', 'srinagar': 'Jammu and Kashmir', 'jammu': 'Jammu and Kashmir',
  'ranchi': 'Jharkhand', 'raipur': 'Chhattisgarh', 'bhubaneswar': 'Odisha', 'guwahati': 'Assam',
  'kochi': 'Kerala', 'thiruvananthapuram': 'Kerala', 'visakhapatnam': 'Andhra Pradesh', 'vijayawada': 'Andhra Pradesh',
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

const STATE_BY_NAME = Object.fromEntries(INDIAN_STATES.map(s => [s.toLowerCase(), s]))

// One piece of text ("Shri Nagar, Rani Bagh, Delhi", "New Delhi-110015")
// → a state, or null.
function stateFromText(text) {
  const t = norm(text)
  if (!t) return null
  const parts = t.split(/[,/|()\-–]|\d+/).map(x => x.trim()).filter(Boolean)
  for (const part of [t, ...parts]) {
    const hit = STATE_BY_NAME[part] || STATE_ALIASES[part] || CITY_STATE[part]
    if (hit) return hit
  }
  // A state name buried in free text ("Dilshad Garden Delhi")
  for (const [key, val] of Object.entries(STATE_BY_NAME)) {
    if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t)) return val
  }
  return null
}

const isIndia = (country) => !country || /india/i.test(country)

// Returns what a shared/external view should show for location: the Indian
// state ("Delhi", "Haryana"), the country for profiles abroad, or null.
export function shareRegion({ city, state, country } = {}) {
  if (!isIndia(country)) return String(country).trim()
  return stateFromText(state) || stateFromText(city) || null
}
