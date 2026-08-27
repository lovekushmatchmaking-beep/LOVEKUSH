export const RELIGIONS = ['Hindu', 'Muslim', 'Sikh', 'Christian', 'Jain', 'Buddhist', 'Other']

// STARTER LIST — bhiya, tumne bola tha ki tumhare paas alag se nikaali
// hui Caste/Community list hai — WOH FILE MUJHE BHEJ DENA, main isko
// tumhari poori list se replace kar dunga. Abhi ke liye ek reasonable
// starter list daal di hai (jo North-Indian Hindu matchmaking mein
// common hai) taaki dropdown turant kaam karna shuru kare, "Other"
// option bhi hai taaki koi bhi blocked na ho.
export const CASTES = [
  'Kushwaha', 'Gupta', 'Yadav', 'Sharma', 'Shakya', 'Shekhawat', 'Rajput', 'Thakur',
  'Brahmin', 'Jat', 'Baniya', 'Kayastha', 'Agrawal', 'Ahir', 'Bhumihar', 'Chaudhary',
  'Gujjar', 'Jaiswal', 'Khatri', 'Kurmi', 'Lodhi', 'Maheshwari', 'Mali', 'Nai',
  'Nishad', 'Pal', 'Prajapati', 'Sonar', 'Teli', 'Vaishya', 'Valmiki', 'Meena',
  'Patel', 'Reddy', 'Naidu', 'Nair', 'Iyer', 'Iyengar', 'Chettiar', 'Marwari',
  'Other',
]

// STARTER LIST — same as above, apni poori Mother Tongue list bhej dena.
export const MOTHER_TONGUES = [
  'Hindi', 'English', 'Punjabi', 'Gujarati', 'Marathi', 'Tamil', 'Telugu', 'Kannada',
  'Malayalam', 'Bengali', 'Odia', 'Assamese', 'Urdu', 'Sanskrit', 'Kashmiri', 'Konkani',
  'Sindhi', 'Bhojpuri', 'Haryanvi', 'Marwari', 'Maithili', 'Rajasthani', 'Chhattisgarhi',
  'Garhwali', 'Kumaoni', 'Other',
]

export const EDUCATIONS = [
  'Class 10th',
  'Class 12th',
  'Graduation',
  'Post Graduation',
  'Professional Degree',
  'Doctorate',
]

export const INCOME_RANGES = ['No income', 'Below ₹1L', '₹1–3L', '₹3–5L', '₹5–10L', 'Above ₹10L']

export const DIETS = ['Vegetarian', 'Non-Vegetarian', 'Occasionally Non-Vegetarian', 'Eggetarian', 'Jain', 'Vegan']

export const HABITS = ['Never', 'Occasionally', 'Yes']

export const FAMILY_TYPES = ['Nuclear', 'Joint', 'Extended']

export const FAMILY_VALUES = ['Orthodox', 'Conservative', 'Moderate', 'Liberal']

export const HEIGHT_RANGES = [
  'Below 5\'0"',
  '5\'0"–5\'2"',
  '5\'3"–5\'5"',
  '5\'6"–5\'8"',
  '5\'9"–6\'0"',
  'Above 6\'0"',
]

export const MARITAL_STATUSES = ['Never Married', 'Divorced', 'Widowed', 'Separated', 'Awaiting Divorce', 'Annulled']

export const LOCATION_PREFERENCES = [
  'Same city',
  'Same state',
  'Anywhere in India',
  'Open to relocation',
  'Global',
]

// ===================== PHASE 1 EXPANSION — naye fields ke liye =====================

export const COMPLEXIONS = ['Very Fair', 'Fair', 'Wheatish', 'Dark', 'Prefer not to say']

export const WEIGHT_RANGES = ['Below 45kg', '45–55kg', '55–65kg', '65–75kg', '75–85kg', 'Above 85kg']

export const NATIONALITIES = ['Indian', 'NRI - USA', 'NRI - UK', 'NRI - Canada', 'NRI - Australia', 'NRI - UAE/Gulf', 'NRI - Other', 'Other']

export const MANGLIK_OPTIONS = ['Manglik', 'Non-Manglik', "Don't Know"]

export const KUNDLI_AVAILABLE = ['Yes', 'No', 'Will arrange if needed']

export const RELOCATION_PREFERENCES = ['Not willing to relocate', 'Open to relocation within India', 'Open to relocation abroad', 'Flexible']

export const EMPLOYMENT_TYPES = ['Government', 'Private Sector', 'Business / Self-Employed', 'Not Working', 'Student', 'Retired']

export const INDUSTRIES = [
  'IT / Software', 'Banking / Finance', 'Healthcare / Medical', 'Education', 'Government / Public Sector',
  'Engineering / Manufacturing', 'Legal', 'Retail / Business', 'Media / Entertainment', 'Hospitality',
  'Agriculture', 'Real Estate', 'Defence / Armed Forces', 'Other',
]

export const OWN_HOUSE_OPTIONS = ['Own House', 'Rented', 'Family House']

export const HOUSE_TYPES = ['Independent House', 'Apartment/Flat', 'Farmhouse', 'Other']

export const FAMILY_INCOME_RANGES = ['Below ₹5L', '₹5–10L', '₹10–20L', '₹20–50L', '₹50L+']

export const PHYSICAL_DISABILITY_OPTIONS = ['No', 'Yes']

// ===================== PHASE 7 — Shaadi.com/Jeevansathi research se =====================

export const PROFESSION_CATEGORIES = [
  'Accounting, Banking & Finance', 'Administration & HR', 'Advertising, Media & Entertainment',
  'Agriculture', 'Airline & Aviation', 'Architecture & Design', 'Artists, Animators & Web Designers',
  'Beauty, Fashion & Jewellery Designers', 'BPO, KPO & Customer Support', 'Civil Services / Law Enforcement',
  'Corporate Professionals', 'Defense', 'Education & Training', 'Engineering', 'Hotel & Hospitality',
  'IT & Software Engineering', 'Legal', 'Medical & Healthcare', 'Merchant Navy', 'Not Working',
  'Sales & Marketing', 'Science', 'Others',
]

export const WORKING_WITH_OPTIONS = ['Private Company', 'Government / Public Sector', 'Defense / Civil Services', 'Business / Self Employed', 'Not Working']

export const HEALTH_INFO_OPTIONS = ['No Health Problems', 'HIV Positive', 'Diabetes', 'Low BP', 'High BP', 'Heart Ailments', 'Other']

export const BLOOD_GROUPS = ["Don't Know", 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

export const PROFILE_MANAGED_BY = ['Self', 'Parent / Guardian', 'Sibling', 'Relative', 'Other']

export const FAMILY_STATUS_OPTIONS = ['Rich / Affluent', 'Upper Middle Class', 'Middle Class']

export const LIVING_WITH_PARENTS_OPTIONS = ['Yes', 'No', 'Not Applicable']

export const HOBBIES_INTERESTS = {
  Creative: ['Writing', 'Cooking', 'Singing', 'Photography', 'Playing instruments', 'Painting', 'DIY crafts', 'Dancing', 'Acting', 'Poetry', 'Gardening', 'Blogging', 'Content creation', 'Designing', 'Doodling'],
  Fun: ['Movies', 'Music', 'Travelling', 'Reading', 'Sports', 'Social media', 'Gaming', 'Binge-watching', 'Biking', 'Clubbing', 'Shopping', 'Theater & Events', 'Anime', 'Stand-ups'],
  Fitness: ['Running', 'Cycling', 'Yoga & Meditation', 'Walking', 'Working out', 'Trekking', 'Aerobics/Zumba', 'Swimming'],
  Other: ['Pets', 'Foodie', 'Vegan', 'News & Politics', 'Social service', 'Entrepreneurship', 'Home decor', 'Investments', 'Fashion & beauty'],
}
export const HOBBIES_MAX_SELECT = 5

export const CUISINES = [
  'North Indian', 'South Indian', 'Punjabi', 'Gujarati', 'Rajasthani', 'Bengali', 'Konkani',
  'Chinese', 'Continental', 'Mughlai', 'Italian', 'Arabic', 'Thai', 'Sushi', 'Mexican',
  'Lebanese', 'Latin American', 'Spanish', 'Fast Food',
]

export const SPORTS_LIST = [
  'Cricket', 'Football', 'Basketball', 'Tennis', 'Badminton', 'Swimming / Water Sports',
  'Jogging / Walking', 'Cycling', 'Yoga / Meditation', 'Gym / Weight Training', 'Chess',
  'Carrom', 'Card Games', 'Table Tennis', 'Adventure Sports',
]

// Fine-grained height dropdown, feet+inches WITH cm — Shaadi.com jaisa
export function generateHeightOptions() {
  const options = []
  for (let totalInches = 53; totalInches <= 84; totalInches++) { // 4'5" to 7'0"
    const feet = Math.floor(totalInches / 12)
    const inches = totalInches % 12
    const cm = Math.round(totalInches * 2.54)
    options.push(`${feet}ft ${inches}in — ${cm}cm`)
  }
  return options
}
export const HEIGHT_OPTIONS_DETAILED = generateHeightOptions()

// NOTE: "Not Filled" ≠ "No" — koi bhi field jo user ne bhari nahi hai,
// khaali/blank hi rehni chahiye database mein (kabhi bhi false/No
// auto-set nahi karna). Poore CreateProfile.js/EditProfileForm mein
// yeh already follow ho raha hai — sab dropdowns ka default
// <option value="">Select</option> hai, "No" nahi.
