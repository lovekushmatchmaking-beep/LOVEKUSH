// WhatsApp / Telegram / Facebook jaise link-preview bots JavaScript nahi
// chalate, isliye React app (SPA) ka har page unhe sirf "Lovekush" title
// dikhata tha — preview card khaali aata tha. vercel.json in bots ko
// (user-agent se pehchaan ke) /share/... par yahan bhejta hai; yeh
// function masked data se Open Graph meta tags wala chhota HTML deta hai,
// taaki WhatsApp mein UPI receipt jaisa proper card dikhe. Insaan (browser)
// ko pehle jaisa hi React page milta hai — yeh function unke liye chalta
// hi nahi.
//
// Privacy: naam hamesha "A. Kushwaha" format (DB ka mask_full_name), photo
// kabhi nahi (photos request-gated hain) — card mein sirf brand logo jaata
// hai. Data get_share_preview RPC se aata hai jo view_count nahi badhata.

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://wgzoabobdfvxvyuczhdz.supabase.co'
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_8tBAukER_NmWA8o89RWPZg_gDueT4Wo'

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function fetchPreview(token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_share_preview`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  })
  if (!res.ok) return null
  const rows = await res.json()
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

function buildCard(p) {
  if (!p) {
    return {
      title: 'LOVEKUSH Matchmaking Services',
      description: 'This link has expired or is no longer available. Please ask LOVEKUSH to share a fresh link.',
    }
  }
  const place = [p.city, p.state].filter(Boolean).join(', ')
  const details = [
    p.height,
    p.education,
    p.occupation,
    [p.religion, p.community].filter(Boolean).join(' • '),
  ].filter(Boolean).join(' · ')
  if (p.kind === 'bundle' && p.profile_count > 1) {
    const who = p.gender === 'Male' ? 'Groom' : p.gender === 'Female' ? 'Bride' : 'Profile'
    return {
      title: `${p.profile_count} ${who} Matches for You — LOVEKUSH`,
      description: `Handpicked by your LOVEKUSH relationship manager. First: ${[p.masked_name, p.age ? p.age + ' yrs' : '', place].filter(Boolean).join(', ')}. Tap to view all.`,
    }
  }
  return {
    title: [p.masked_name, p.age ? `${p.age} yrs` : '', place].filter(Boolean).join(' · '),
    description: `${details ? details + '. ' : ''}Profile shared by LOVEKUSH Matchmaking Services.`,
  }
}

module.exports = async (req, res) => {
  const token = String((req.query && (req.query.token || req.query.bundle)) || '').slice(0, 100)
  const isBundle = !!(req.query && req.query.bundle)
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const origin = `https://${host}`
  const pageUrl = `${origin}/share/${isBundle ? 'm/' : ''}${encodeURIComponent(token)}`

  let preview = null
  try { if (/^[A-Za-z0-9_-]+$/.test(token)) preview = await fetchPreview(token) } catch (e) { preview = null }
  const card = buildCard(preview)
  const image = `${origin}/brand/icon-512.png`

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>${esc(card.title)}</title>
<meta name="description" content="${esc(card.description)}" />
<meta name="robots" content="noindex, nofollow" />
<meta property="og:type" content="profile" />
<meta property="og:site_name" content="LOVEKUSH Matchmaking Services" />
<meta property="og:title" content="${esc(card.title)}" />
<meta property="og:description" content="${esc(card.description)}" />
<meta property="og:url" content="${esc(pageUrl)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:image:width" content="512" />
<meta property="og:image:height" content="512" />
<meta property="og:image:alt" content="LOVEKUSH" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${esc(card.title)}" />
<meta name="twitter:description" content="${esc(card.description)}" />
<meta name="twitter:image" content="${esc(image)}" />
</head><body>
<h1>${esc(card.title)}</h1>
<p>${esc(card.description)}</p>
<p><a href="${esc(pageUrl)}">View on LOVEKUSH</a></p>
</body></html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Revoke/expiry jaldi reflect ho, isliye lamba cache nahi.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300')
  res.status(200).send(html)
}
