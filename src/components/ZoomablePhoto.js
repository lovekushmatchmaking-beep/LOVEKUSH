import React, { useState, useEffect } from 'react'
import { X, ZoomIn } from 'lucide-react'
import { supabase } from '../supabase'

// Share-link page ke liye: SignedImage (EditPhotos.js) jaisa hi signed-URL
// fetch, bas yahan tap karne par full-screen overlay khulta hai jisme photo
// bada dikhti hai, aur usi photo ko dobara tap karne se aur zoom-in/out ho
// jaata hai (Aryan, 2026-10-10 — share link ki dono photos zoom karke dekh
// sakein). Site-wide pinch-zoom (public/index.html maximum-scale=1) ko
// isliye nahi chheda — yeh CSS transform se apna hi zoom karta hai.

export default function ZoomablePhoto({ path, alt, size = 96 }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!path) { setFailed(true); return }
    supabase.storage.from('lovekush-photos').createSignedUrl(path, 3600).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) { setFailed(true); return }
      setUrl(data.signedUrl)
    })
    return () => { cancelled = true }
  }, [path])

  const closeLightbox = () => { setOpen(false); setZoomed(false) }

  if (failed || !path) return null

  return (
    <>
      <div
        onClick={() => url && setOpen(true)}
        style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', background: '#eee', cursor: url ? 'zoom-in' : 'default', position: 'relative', flexShrink: 0 }}
      >
        {url
          ? <img src={url} alt={alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%' }} />}
        {url && (
          <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: 3, display: 'flex' }}>
            <ZoomIn size={12} color="#fff" />
          </div>
        )}
      </div>

      {open && url && (
        <div
          onClick={closeLightbox}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflow: 'auto' }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); closeLightbox() }}
            style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 20, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={18} color="#fff" />
          </button>
          <img
            src={url}
            alt={alt || ''}
            onClick={(e) => { e.stopPropagation(); setZoomed(z => !z) }}
            style={{
              maxWidth: zoomed ? 'none' : '100%',
              maxHeight: zoomed ? 'none' : '100%',
              width: zoomed ? 'auto' : undefined,
              transform: zoomed ? 'scale(2.2)' : 'scale(1)',
              transformOrigin: 'center',
              transition: 'transform 0.2s ease',
              objectFit: 'contain',
              borderRadius: 4,
              cursor: zoomed ? 'zoom-out' : 'zoom-in',
            }}
          />
        </div>
      )}
    </>
  )
}
