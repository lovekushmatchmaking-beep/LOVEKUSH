import {
  parseBiodataText, parseDob, parseHeight, parseEducation, parseIncome, parseSiblings, parseTime,
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
