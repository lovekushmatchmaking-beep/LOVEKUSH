// Section-wise profile-completeness — sirf ek overall number nahi,
// har section ka apna % + suggestions ki list ("iska aur karo").

const SECTIONS = {
  Personal: ['first_name', 'last_name', 'date_of_birth', 'gender', 'height', 'weight', 'complexion', 'body_type', 'marital_status', 'nationality'],
  'Religion & Community': ['religion', 'community', 'sub_caste', 'gotra', 'mother_tongue', 'manglik'],
  Location: ['city', 'state', 'native_place', 'current_address'],
  Education: ['education', 'field_of_study', 'specialization'],
  Career: ['occupation', 'designation', 'industry', 'employment_type', 'annual_income'],
  Family: ['family_type', 'family_values', 'father_profession', 'mother_profession', 'siblings', 'own_house', 'family_income_range'],
  Lifestyle: ['diet', 'smoking', 'drinking', 'hobbies', 'about_me'],
  Preferences: ['partner_age_min', 'partner_age_max', 'partner_religion', 'partner_education', 'partner_location'],
}

const SUGGESTIONS = {
  photo: 'Add a primary photo',
  about_me: 'Write a short "About Me"',
  family_income_range: 'Add family income range',
  hobbies: 'Add your hobbies/interests',
  partner_age_min: 'Complete your partner preferences',
  mother_tongue: 'Add your mother tongue',
  gotra: 'Add your Gotra (if applicable)',
}

export function calculateSectionCompleteness(profile, photoCount) {
  const sectionScores = {}
  let totalFilled = 0
  let totalFields = 0

  Object.keys(SECTIONS).forEach(section => {
    const fields = SECTIONS[section]
    const filled = fields.filter(f => profile[f] !== undefined && profile[f] !== null && profile[f] !== '').length
    sectionScores[section] = Math.round((filled / fields.length) * 100)
    totalFilled += filled
    totalFields += fields.length
  })

  // Photos aur Verification alag se (yeh "profile" object ke fields nahi hain)
  sectionScores['Photos'] = photoCount > 0 ? 100 : 0
  sectionScores['Verification'] = profile.verification_status === 'verified' ? 100 : (profile.id_document_uploaded ? 40 : 0)

  totalFilled += photoCount > 0 ? 1 : 0
  totalFields += 1

  const overall = totalFields > 0 ? Math.round((totalFilled / totalFields) * 100) : 0

  // Suggestions — jo important fields khaali hain unke liye
  const suggestions = []
  if (photoCount === 0) suggestions.push(SUGGESTIONS.photo)
  Object.keys(SUGGESTIONS).forEach(key => {
    if (key !== 'photo' && (!profile[key] || profile[key] === '')) {
      suggestions.push(SUGGESTIONS[key])
    }
  })

  return { overall, sections: sectionScores, suggestions: suggestions.slice(0, 5) }
}
