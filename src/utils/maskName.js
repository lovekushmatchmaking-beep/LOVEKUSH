// Name privacy — dusre members ko kabhi poora naam nahi dikhta (Instagram /
// social media pe dhoondhne se bachane ke liye). "Aryan Kushwaha" →
// "A. Kushwaha"; sirf ek word ho to "A.". Database ka profiles_public_view
// bhi yahi masked naam deta hai; yeh helper UI mein har jagah same format
// rakhta hai (already-masked naam pe dobara chalane se kuch nahi badalta).
export function maskName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const initial = parts[0].charAt(0).toUpperCase() + '.'
  return parts.length > 1 ? `${initial} ${parts[parts.length - 1]}` : initial
}
