// DOB se age calculate karta hai (poori tarah accurate — sirf saal ka
// farak nahi, mahine/din bhi dhyan mein rakhta hai).
export function calculateAge(dobString) {
  if (!dobString) return null
  const dob = new Date(dobString)
  if (isNaN(dob.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--
  }
  return age
}

// India ke hisaab se legal minimum marriageable age: Female 18, Male 21.
// (Agar future mein law badle, sirf yahan numbers update karne honge.)
export const MIN_AGE = { Female: 18, Male: 21 }
export const MAX_AGE = 75 // sanity upper-bound, matrimonial site ke liye reasonable

export function validateAge(dobString, gender) {
  const age = calculateAge(dobString)
  if (age === null) return { valid: false, age: null, message: 'Date of Birth daalo' }

  const minAge = MIN_AGE[gender] || 18
  if (age < minAge) {
    return { valid: false, age, message: `${gender === 'Female' ? 'Ladki' : 'Ladka'} ki minimum legal marriageable age ${minAge} saal hai (India ke hisaab se). Aapki age: ${age} saal.` }
  }
  if (age > MAX_AGE) {
    return { valid: false, age, message: `Age ${age} lagta hai — kripya Date of Birth check karein.` }
  }
  return { valid: true, age, message: '' }
}

// DOB input ke "max" attribute ke liye — future date select hi na ho
// sake (aaj se pehle ki date honi chahiye), aur "min" ke liye ek
// reasonable purani date (100 saal pehle).
export function dobInputBounds() {
  const today = new Date()
  const maxDate = new Date(today.getFullYear() - MIN_AGE.Female, today.getMonth(), today.getDate())
  const minDate = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate())
  const fmt = (d) => d.toISOString().split('T')[0]
  return { min: fmt(minDate), max: fmt(maxDate) }
}
