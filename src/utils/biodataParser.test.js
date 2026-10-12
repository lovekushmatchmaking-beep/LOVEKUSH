import {
  parseBiodataText, BIODATA_CHATGPT_PROMPT, parseDob, parseHeight, parseEducation, parseIncome, parseSiblings, parseTime,
  parseRashi, parseNakshatra, extractLabeledValues,
} from './biodataParser'

const ENGLISH_BIODATA = `
BIODATA
Name : Kum. Shivani Kushwaha
Date of Birth : 12th May 1998
Time of Birth : 10:45 PM
Place of Birth : Lucknow
Height : 5'4"
Complexion : Fair
Education : B.Tech (CSE), MBA
Occupation : Software Engineer
Company : Infosys
Annual Income : 8 LPA
Religion : Hindu
Caste : Kushwaha
Gotra : Kashyap
Manglik : No
Rashi : Vrishabh
Nakshatra : Rohini
Mother Tongue : Hindi
Marital Status : Unmarried
Diet : Vegetarian

FAMILY DETAILS
Father's Name : Shri Ram Kushwaha
Father's Occupation : Retired Teacher
Mother's Name : Smt. Sita Devi
Mother's Occupation : Housewife
Brothers : 2 (1 married)
Sisters : 1 Married
Contact No : +91 98765 43210
`

test('parses a typical English biodata', () => {
  const { values, unmatched } = parseBiodataText(ENGLISH_BIODATA, { includeContact: true })
  expect(values).toMatchObject({
    first_name: 'Shivani', last_name: 'Kushwaha', date_of_birth: '1998-05-12', birth_time: '22:45',
    birth_place: 'Lucknow', height: '5\'4" (163 cm)', complexion: 'Fair', education: 'Post Graduation',
    degree: 'MBA', profession: 'IT & Software Engineering', employer: 'Infosys', annual_income: '₹8–9L',
    religion: 'Hindu', community: 'Kushwaha', manglik: 'Non-Manglik', rashi: 'Vrishabha (Taurus)',
    nakshatra: 'Rohini', mother_tongue: 'Hindi', marital_status: 'Never Married', diet: 'Vegetarian',
    father_profession: 'Retired', mother_profession: 'Homemaker',
    brothers_count: 2, brothers_married_count: 1, sisters_count: 1, sisters_married_count: 1,
    client_phone: '9876543210',
  })
  expect(values.gotra === 'Kashyap' || values.gotra === 'Other').toBe(true)
  expect(unmatched).toEqual([])
})

test('father/mother name lines do not leak into name or mother tongue', () => {
  const v = extractLabeledValues("Name of Father : Ram Prasad\nMother Tongue : Bhojpuri\nName : Rahul Verma")
  expect(v.name).toBe('Rahul Verma')
  expect(v.mother_tongue).toBe('Bhojpuri')
})

test('contact details are skipped unless asked for', () => {
  const { values } = parseBiodataText(ENGLISH_BIODATA)
  expect(values.client_phone).toBeUndefined()
})

test('parses Hindi labels', () => {
  const { values } = parseBiodataText('नाम : प्रिया शर्मा\nजन्म तिथि : १५/०८/१९९६\nकद : 5 फीट 2 इंच\nधर्म : हिन्दू\nराशि : मेष\nमांगलिक : नहीं')
  expect(values).toMatchObject({
    first_name: 'प्रिया', last_name: 'शर्मा', date_of_birth: '1996-08-15', height: '5\'2" (157 cm)',
    religion: 'Hindu', rashi: 'Mesha (Aries)', manglik: 'Non-Manglik',
  })
})

test('unrecognised values go to unmatched instead of being guessed', () => {
  const { values, unmatched } = parseBiodataText('Height : tall\nRashi : unknown')
  expect(values.height).toBeUndefined()
  expect(unmatched.map(u => u.key)).toEqual(['height', 'rashi'])
})

test('value parsers', () => {
  expect(parseDob('05-11-1995')).toBe('1995-11-05')
  expect(parseDob('1995-11-05')).toBe('1995-11-05')
  expect(parseDob('March 3, 1994')).toBe('1994-03-03')
  expect(parseDob('31/02/1995')).toBeNull()
  expect(parseTime('6:05 am')).toBe('06:05')
  expect(parseHeight('165 cm')).toBe('5\'5" (165 cm)')
  expect(parseHeight('5.10')).toBe('5\'10" (178 cm)')
  expect(parseEducation('12th pass')).toEqual({ education: 'Class 12th' })
  expect(parseEducation('MBBS')).toEqual({ education: 'Professional Degree', degree: 'MBBS' })
  expect(parseEducation('M.Sc Chemistry')).toEqual({ education: 'Post Graduation', degree: 'M.Sc' })
  expect(parseIncome('50,000 per month')).toBe('₹6–7L')
  expect(parseIncome('1.5 crore')).toBe('₹1Cr+')
  expect(parseSiblings('None')).toEqual({ count: 0, married: 0 })
  expect(parseRashi('Simha')).toBe('Simha (Leo)')
  expect(parseNakshatra('Purva Phalguni')).toBe('Purva Phalguni')
  expect(parseNakshatra('Uttara Ashadha')).toBe('Uttara Ashadha')
})

test('tolerates OCR misreading the colon', () => {
  expect(extractLabeledValues('Rashi + Vrishabh\nManglik No').rashi).toBe('Vrishabh')
  expect(extractLabeledValues('Rashi + Vrishabh\nManglik No').manglik).toBe('No')
})

test('pasted ChatGPT-style text (bold, bullets, numbering, table) parses', () => {
  const md = [
    '## 🌸 Biodata',
    '**Name:** Rahul Kushwaha',
    '- **Date of Birth:** 15/08/1996',
    '1. Height: 5\'8"',
    '| Education | B.Tech |',
    '|---|---|',
    '| Annual Income | 8 LPA |',
    '* City: Lucknow, UP',
    'About Me: Simple, family-oriented person working in Bangalore.',
  ].join('\n')
  const { values } = parseBiodataText(md)
  expect(values.first_name).toBe('Rahul')
  expect(values.last_name).toBe('Kushwaha')
  expect(values.date_of_birth).toBe('1996-08-15')
  expect(values.height).toBeTruthy()
  expect(values.degree).toBeTruthy()
  expect(values.annual_income).toBeTruthy()
  expect(values.city).toBe('Lucknow')
  expect(values.about_me).toMatch(/^Simple/)
})

test('every label in the ChatGPT prompt is recognised', () => {
  const sample = `Name: Priya Sharma
Gender: Female
Date of Birth: 02/03/1998
Birth Time: 10:30 AM
Birth Place: Kanpur
Height: 5'3"
Marital Status: Never Married
Have Children: No
Religion: Hindu
Caste: Kushwaha
Sub Caste: Maurya
Caste No Bar: Yes
Gotra: Kashyap
Manglik: No
Kundli Available: Yes
Rashi: Mesh
Nakshatra: Ashwini
Mother Tongue: Hindi
Languages Known: Hindi, English
Education: MBA
Occupation: Software Engineer
Company: Infosys
Employment Type: Private Sector
Annual Income: 12 LPA
Complexion: Fair
Body Type: Average
Diet: Vegetarian
Blood Group: B+
Father's Occupation: Retired
Mother's Occupation: Homemaker
Brothers: 2, 1 married
Sisters: 1
City: Lucknow
Native Place: Gorakhpur
Residency Status: Citizen
Relocation Preference: Flexible
Nationality: Indian
Mobile: +91 98765 43210
Email: priya@example.com
Weight: 55 kg
Smoking: Never
Drinking: Never
College: Lucknow University
State: Uttar Pradesh
Family Type: Nuclear
Family City: Lucknow
Own House: Yes
Vehicle: Car
Hobbies: Reading
About Me: Cheerful and grounded.
Partner Age: 27-32
Partner Height: 5'6" - 6'0"
Partner Income: 10 LPA+
Partner Religion: Hindu
Partner Caste: Kushwaha, Maurya
Partner Education: Post Graduation
Partner Occupation: Government, Private Sector
Partner Marital Status: Never married
Partner Complexion: Fair
Partner City: Lucknow
Partner State: Uttar Pradesh
Partner Country: India
Partner Expectations: Well educated, kind.`
  const { found, unmatched } = parseBiodataText(sample, { includeContact: true })
  const keys = found.map(f => f.key)
  const promptLabels = BIODATA_CHATGPT_PROMPT.split('Biodata:')[0].split('\n').filter(l => /^[A-Z][^:]*:( \(.*\))?$/.test(l))
  expect(keys.length + unmatched.length).toBe(promptLabels.length)
  expect(unmatched).toEqual([])
})

test('reads the new NRI / family / lifestyle fields', () => {
  const { values } = parseBiodataText(`Name: Rahul Kushwaha
Marital Status: Never Married
Languages Known: Hindi, English and Bhojpuri
Employment Type: Government
Body Type: Athletic
Caste No Bar: Yes
Kundli Available: Will arrange if needed
Residency Status: Work Visa
Relocation Preference: Open to relocation abroad`)
  expect(values).toMatchObject({
    languages_spoken: expect.arrayContaining(['Hindi', 'English', 'Bhojpuri']),
    employment_type: 'Government', body_type: 'Athletic', caste_no_bar: 'Yes',
    kundli_available: 'Will arrange if needed', residency_status: 'Work Permit / Work Visa',
    relocation_preference: 'Open to relocation abroad',
  })
})

test('children question is only asked when married', () => {
  const married = parseBiodataText('Marital Status: Divorced\nHave Children: Yes\nChildren Living With: Me')
  expect(married.values.have_children).toBe('Yes')
  expect(married.values.children_living_with).toBe('Me')

  const single = parseBiodataText('Marital Status: Never Married\nHave Children: No')
  expect(single.values.have_children).toBe('No')
  expect(single.values.children_living_with).toBeUndefined()
})

test('reads the extra profile fields from the ChatGPT prompt format', () => {
  const { values } = parseBiodataText(`Name: Rahul Kushwaha
Weight: 72 kg
Smoking: Never
Drinking: Occasionally
State: Uttar Pradesh
Family Type: Joint
Family City: Varanasi
Own House: Yes
Vehicle: Car and bike
College: IIT Kanpur
Hobbies: Cricket, music
Partner Expectations: Educated girl from a cultured family.`)
  expect(values).toMatchObject({
    weight: '65–75kg', smoking: 'Never', drinking: 'Occasionally', state: 'Uttar Pradesh',
    family_type: 'Joint', family_city: 'Varanasi', own_house: 'Yes', vehicle_ownership: 'Both',
    college_name: 'IIT Kanpur', hobbies: 'Cricket, music', partner_notes: 'Educated girl from a cultured family.',
  })
})

test('reads partner preferences into the Partner Preferences fields', () => {
  const { values, unmatched } = parseBiodataText(`Name: Priya Sharma
Religion: Hindu
Partner Age: 27 to 32 years
Partner Height: 5'6" - 6'0"
Partner Income: 10-20 LPA
Partner Religion: Hindu
Partner Caste: Brahmin, Kushwaha
Partner Education: MBA / B.Tech
Partner Occupation: Govt job or MNC
Partner Marital Status: Unmarried
Partner Complexion: Fair
Partner City: Delhi
Partner Country: Indian
Partner Expectations: Family oriented.`)
  expect(values).toMatchObject({
    partner_age_min: 27, partner_age_max: 32, partner_height_min: 66, partner_height_max: 72,
    partner_income_min: 1000000, partner_income_max: 2000000, partner_religion: 'Hindu',
    partner_education_level_preferences: ['Post Graduation', 'Graduation'],
    partner_employment_type_preferences: ['Government', 'Private Sector'],
    partner_marital_status_preference: 'Never married', partner_complexion_preference: 'Fair',
    partner_city_preference: 'Delhi', partner_country_preference: 'India', partner_notes: 'Family oriented.',
  })
  expect(values.partner_community_ids).toEqual(expect.arrayContaining(['Kushwaha']))
  expect(values.religion).toBe('Hindu')
  expect(unmatched.map(u => u.key)).not.toContain('partner_age')
})

test('partner preferences: open-ended and single-bound values', () => {
  const { values } = parseBiodataText(`Religion: Sikh
Partner Age: 28+
Partner Income: above 15 lakh
Partner Caste: No bar
Partner Religion: Any`)
  expect(values).toMatchObject({ partner_age_min: 28, partner_income_min: 1500000, partner_religion: 'Any',
    partner_community_ids: ['Any Community / No Bar'] })
  expect(values.partner_age_max).toBeUndefined()
})

test('Punjabi alone does not become Hindu: religion is left for the admin', () => {
  const { values, unmatched } = parseBiodataText(`Name: Simran Arora
Caste: Punjabi
Mother Tongue: Punjabi`)
  expect(values.religion).toBeUndefined()
  expect(values.community).toBeUndefined()
  expect(unmatched.find(u => u.key === 'religion').raw).toMatch(/Hindu or Sikh/)
})

test('"Religion: Punjabi" is not a religion either', () => {
  const { values, unmatched } = parseBiodataText(`Name: Rohit Khanna
Religion: Punjabi`)
  expect(values.religion).toBeUndefined()
  expect(unmatched.filter(u => u.key === 'religion')).toHaveLength(1)
})

test('clear Sikh cues set religion Sikh and use the Sikh community list', () => {
  const kaur = parseBiodataText(`Name: Harpreet Kaur
Caste: Ramgarhia`)
  expect(kaur.values).toMatchObject({ religion: 'Sikh', community: 'Ramgarhia' })

  const singh = parseBiodataText(`Name: Gurpreet Singh Sandhu
Caste: Jat Sikh
Mother Tongue: Punjabi`)
  expect(singh.values).toMatchObject({ religion: 'Sikh', community: 'Others / Not in list', custom_caste_text: 'Jat Sikh' })

  const explicit = parseBiodataText(`Name: Aman Arora
Religion: Sikh
Caste: Arora`)
  expect(explicit.values).toMatchObject({ religion: 'Sikh', community: 'Arora' })
})

test('Singh without any Punjabi/Sikh cue is not assumed Sikh', () => {
  const { values } = parseBiodataText(`Name: Rahul Singh
Caste: Rajput`)
  expect(values.religion).toBeUndefined()
  expect(values.community).toMatch(/Rajput/)
})

test('explicit Hindu religion is kept for Punjabi Hindus', () => {
  const { values } = parseBiodataText(`Name: Neha Khanna
Religion: Hindu
Caste: Khatri
Mother Tongue: Punjabi`)
  expect(values.religion).toBe('Hindu')
})

test('a partner religion line is not a cue for own religion', () => {
  const { values } = parseBiodataText(`Name: Neha Khanna
Caste: Khatri
Partner Religion: Sikh`)
  expect(values.religion).toBeUndefined()
  expect(values.partner_religion).toBe('Sikh')
})
