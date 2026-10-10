import React, { useRef, useState } from 'react'
import { ChevronLeft, Share2, Download, Link2 } from 'lucide-react'
import SignedImage from '../components/SignedImage'
import { generateBiodataPdf } from '../utils/generateBiodataPdf'
import { generateShareLink, nativeShare } from '../utils/shareLinks'
import { buildWaChooserLink } from '../utils/shareProfile'

// Redesigned single visual biodata template (Jeevansathi-style formal
// biodata) with a real one-tap PDF download + native share, replacing the
// old print-dialog-only version. SignedImage's <img> can be tainted for
// html2canvas since Supabase Storage signed URLs don't send CORS headers
// reliably in every setup — so we resolve the photo to a same-origin data
// URL first (fetch as blob -> FileReader) before rendering it into the
// captured node, avoiding a blank/broken photo in the exported PDF.
function useDataUrlForPhoto(photo) {
  const [dataUrl, setDataUrl] = useState(null)
  React.useEffect(() => {
    let cancelled = false
    setDataUrl(null)
    if (!photo) return
    ;(async () => {
      try {
        const { supabase } = await import('../supabase')
        const { data } = await supabase.storage.from('lovekush-photos').createSignedUrl(photo.storage_path, 300)
        if (!data?.signedUrl) return
        const res = await fetch(data.signedUrl)
        const blob = await res.blob()
        const reader = new FileReader()
        reader.onloadend = () => { if (!cancelled) setDataUrl(reader.result) }
        reader.readAsDataURL(blob)
      } catch (e) { /* photo optional, ignore failures */ }
    })()
    return () => { cancelled = true }
  }, [photo])
  return dataUrl
}

export default function BiodataView({ profile: p, photo, onBack }) {
  const nodeRef = useRef(null)
  const [busy, setBusy] = useState('') // '' | 'download' | 'share'
  const [toast, setToast] = useState('')
  const [shareLink, setShareLink] = useState(null) // { url, text } jab share sheet na khul paaye
  const photoDataUrl = useDataUrlForPhoto(photo)

  const rows = (pairs) => pairs.filter(([, v]) => v).map(([k, v]) => (
    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: 13 }}>
      <span style={{ color: '#8e8e8e' }}>{k}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{v}</span>
    </div>
  ))

  const fileName = `${(p.full_name || 'Biodata').replace(/\s+/g, '_')}_${p.profile_code || ''}_Biodata.pdf`

  const handleDownload = async () => {
    setBusy('download')
    try {
      const pdf = await generateBiodataPdf(nodeRef.current)
      pdf.save(fileName)
    } catch (e) {
      setToast('Could not create PDF, please try again.')
    } finally {
      setBusy('')
    }
  }

  const handleShare = async () => {
    setBusy('share')
    try {
      const pdf = await generateBiodataPdf(nodeRef.current)
      const blob = pdf.output('blob')
      const file = new File([blob], fileName, { type: 'application/pdf' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Matrimonial Biodata', text: `${p.full_name}'s Biodata — LOVEKUSH` })
      } else {
        pdf.save(fileName)
        setToast('Sharing is not supported in this browser, so the PDF was downloaded instead.')
      }
    } catch (e) {
      if (e?.name !== 'AbortError') setToast('Could not share, please try again.')
    } finally {
      setBusy('')
    }
  }

  // PDF ke alawa ek secure link bhi — WhatsApp mein paste karne par profile
  // card (masked naam, umar, city, education) ka preview dikhta hai, photo
  // ya contact nahi. 7 din valid, Admin revoke kar sakta hai.
  const handleShareLink = async () => {
    setBusy('link')
    try {
      const link = await generateShareLink(p.id, p.user_id)
      const text = `My profile on LOVEKUSH (${p.profile_code})`
      const shared = await nativeShare({ title: 'LOVEKUSH Profile', text, url: link.url })
      // Share sheet na khule (desktop, ya browser ne await ke baad block
      // kiya) to link yahin dikhate hain — WhatsApp/Copy button ke saath.
      if (!shared) setShareLink({ url: link.url, text })
    } catch (e) {
      setToast('Could not create link, please try again.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button className="btn btn-outline" style={{ flex: '0 0 auto', padding: '11px 14px' }} onClick={onBack} aria-label="Back"><ChevronLeft size={18} /></button>
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={handleShare} disabled={!!busy}>
          <Share2 size={16} /> {busy === 'share' ? 'Generating...' : 'Share'}
        </button>
        {p.user_id && (
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={handleShareLink} disabled={!!busy}>
            <Link2 size={16} /> {busy === 'link' ? 'Creating...' : 'Link'}
          </button>
        )}
        <button className="btn btn-black" style={{ flex: 1 }} onClick={handleDownload} disabled={!!busy}>
          <Download size={16} /> {busy === 'download' ? 'Generating...' : 'PDF'}
        </button>
      </div>

      {shareLink && (
        <div className="notice no-print" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, wordBreak: 'break-all' }}>{shareLink.url}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="btn btn-black btn-sm" href={buildWaChooserLink(`${shareLink.text}:\n${shareLink.url}`)} target="_blank" rel="noreferrer">Send via WhatsApp</a>
            <button className="btn btn-outline btn-sm" onClick={() => navigator.clipboard?.writeText(shareLink.url).then(() => setToast('Link copied'))}>Copy link</button>
          </div>
        </div>
      )}

      {toast && (
        <div className="notice no-print" style={{ marginBottom: 16 }}>{toast}</div>
      )}

      <div ref={nodeRef} style={{
        position: 'relative', background: '#fff', padding: 30,
        border: '1px solid #000', borderRadius: 2,
      }}>
        {/* decorative corner flourishes */}
        <div style={{ position: 'absolute', top: 8, left: 8, width: 28, height: 28, borderTop: '2px solid #000', borderLeft: '2px solid #000' }} />
        <div style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderTop: '2px solid #000', borderRight: '2px solid #000' }} />
        <div style={{ position: 'absolute', bottom: 8, left: 8, width: 28, height: 28, borderBottom: '2px solid #000', borderLeft: '2px solid #000' }} />
        <div style={{ position: 'absolute', bottom: 8, right: 8, width: 28, height: 28, borderBottom: '2px solid #000', borderRight: '2px solid #000' }} />

        <div style={{ textAlign: 'center', marginBottom: 22, paddingBottom: 16, borderBottom: '2px solid #000' }}>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 32, fontWeight: 300, letterSpacing: '0.06em' }}>LOVEKUSH</div>
          <div style={{ fontSize: 11, color: '#8e8e8e', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Matrimonial Biodata</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ width: 130, height: 160, borderRadius: 8, background: '#f0f0f0', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)' }}>
            {photoDataUrl
              ? <img src={photoDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42 }}>👤</div>
            }
          </div>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontWeight: 500, fontSize: 26, marginTop: 12 }}>{p.full_name}</div>
          <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
            {p.age ? p.age + ' years' : ''}{p.height ? ' • ' + p.height : ''}
          </div>
          <div style={{ fontSize: 13, color: '#555' }}>{p.city}{p.state ? ', ' + p.state : ''}</div>
          <div className="profile-code" style={{ marginTop: 8 }}>{p.profile_code}</div>
        </div>

        {p.about_me && (
          <div style={{ marginBottom: 18, fontSize: 13, color: '#333', lineHeight: 1.6, fontStyle: 'italic', textAlign: 'center' }}>
            "{p.about_me}"
          </div>
        )}

        <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>Personal Details</div>
        {rows([
          ['Marital Status', p.marital_status], ['Complexion', p.complexion], ['Body Type', p.body_type],
          ['Nationality', p.nationality], ['Mother Tongue', p.mother_tongue],
        ])}

        <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>Religious Background</div>
        {rows([
          ['Religion', p.religion], ['Community', p.community], ['Sub-Caste', p.sub_caste],
          ['Gotra', p.gotra], ['Manglik', p.manglik],
          ['Rashi', p.rashi], ['Nakshatra', p.nakshatra],
        ])}

        <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>Education & Career</div>
        {rows([
          ['Living In', [p.city, p.state, p.country].filter(Boolean).join(', ')],
          ['Highest Qualification', p.education], ['Degree', p.degree], ['College', p.college_name],
          ['Employer', p.employer], ['Annual Income', p.annual_income],
        ])}

        <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>Family Details</div>
        {rows([
          ['Family Type', p.family_type], ["Father's Profession", p.father_profession],
          ["Mother's Profession", p.mother_profession], ['Family Financial Status', p.family_financial_status],
        ])}

        <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>Contact</div>
        {rows([
          ['Contact No.', p.client_phone], ['Email ID', p.client_email || p.alternate_email],
        ])}

        <div style={{ textAlign: 'center', marginTop: 22, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.08)', fontSize: 10, color: '#b0b0b0' }}>
          Generated via LOVEKUSH Matchmaking
        </div>
      </div>
    </div>
  )
}
