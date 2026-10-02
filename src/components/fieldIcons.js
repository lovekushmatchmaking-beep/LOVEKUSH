import {
  User, CalendarDays, Ruler, Weight, Heart, Globe, Baby, Languages, MapPin, Home,
  GraduationCap, Briefcase, Building2, Wallet, Utensils, Cigarette, Wine, Music,
  BookOpen, Shirt, Dumbbell, Car, Users, Landmark, Sparkles, Moon, Clock, Droplet,
  HeartPulse, Accessibility, Mail, Phone, Lock, Camera, Palette, PersonStanding,
  NotebookPen, Plane, Coffee, Smile, Hash, KeyRound, ShieldCheck, Star, TriangleAlert,
  Gem, Footprints, SlidersHorizontal,
} from 'lucide-react'

// Ek hi jagah se field-label → icon mapping, taaki Create Profile aur
// Edit Profile (aur MatchSearch) mein har field ke aage same icon aaye.
// Order matters — pehla matching rule jeet-ta hai, isliye specific rules
// (jaise "Father's Profession") generic rules (jaise "Profession") se
// pehle hain.
const RULES = [
  [/who can see|privacy|sensitive/i, Lock],
  [/password/i, KeyRound],
  [/email/i, Mail],
  [/phone|whatsapp|contact/i, Phone],
  [/father|mother's|brother|sister|sibling|family/i, Users],
  [/first name|middle name|last name|surname|your name|name\b/i, User],
  [/language|mother tongue/i, Languages],
  [/date of birth|born|\bage\b/i, CalendarDays],
  [/birth time|time of birth/i, Clock],
  [/birth place|country of birth/i, MapPin],
  [/gender/i, PersonStanding],
  [/height/i, Ruler],
  [/weight/i, Weight],
  [/marital/i, Gem],
  [/horoscope match|kundli|manglik|gotra|horoscope/i, Moon],
  [/nationality|country|ethnic/i, Globe],
  [/children/i, Baby],
  [/zip|pin code/i, Hash],
  [/relocation/i, Plane],
  [/city|state|native place|location|grew up|address/i, MapPin],
  [/own house|house type|living with parents/i, Home],
  [/college|institution/i, Building2],
  [/education|degree|school of thought/i, GraduationCap],
  [/employer|company/i, Building2],
  [/profession|employment|career|occupation|work/i, Briefcase],
  [/income|currency|financial|assets/i, Wallet],
  [/diet|cuisine/i, Utensils],
  [/smok/i, Cigarette],
  [/drink/i, Wine],
  [/music/i, Music],
  [/book/i, BookOpen],
  [/dress/i, Shirt],
  [/sport|activit/i, Dumbbell],
  [/hobbies|interests/i, Smile],
  [/lifestyle/i, Coffee],
  [/vehicle/i, Car],
  [/religion|religious|denomination|sect|shia|madhab|community|caste|division/i, Landmark],
  [/blood/i, Droplet],
  [/health/i, HeartPulse],
  [/disability/i, Accessibility],
  [/complexion/i, Palette],
  [/body type/i, Footprints],
  [/photo/i, Camera],
  [/about|notes|bio/i, NotebookPen],
  [/strong match/i, Star],
  [/needs discussion|delete/i, TriangleAlert],
  [/partner|preference|looking for/i, Heart],
  [/why lovekush/i, Gem],
  [/personal|profile/i, User],
  [/hide/i, ShieldCheck],
  [/interest/i, Sparkles],
  [/filter/i, SlidersHorizontal],
]

// React children (string / number / nested array) se plain text nikaalta
// hai, taaki "{RELIGION_HIERARCHY[x].label}" jaise dynamic labels ka bhi
// icon mil sake.
export function textOf(children) {
  if (children == null || typeof children === 'boolean') return ''
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(textOf).join('')
  if (children.props) return textOf(children.props.children)
  return ''
}

export function iconForLabel(text) {
  if (!text) return null
  const hit = RULES.find(([re]) => re.test(text))
  return hit ? hit[1] : null
}
