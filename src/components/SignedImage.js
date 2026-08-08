import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'

// PEHLE: photos "public" bucket mein the — jo bhi URL jaanta tha, dekh
// sakta tha, hamesha ke liye. AB: bucket private hai, aur yeh component
// har baar ek NAYA, temporary (1 ghante ke liye valid) link banata hai —
// database (RLS) check karta hai ki dekhne wale ko permission hai ya
// nahi (khud ki photo / staff / active-profile-browsing).
//
// USE: <SignedImage path={photo.storage_path} alt="" style={{...}} />

const urlCache = new Map() // isi session ke andar baar-baar same photo ke liye dobara call na ho

export default function SignedImage({ path, fallback, style, alt }) {
  const [url, setUrl] = useState(urlCache.get(path) || null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!path) { setFailed(true); return }
    if (urlCache.has(path)) { setUrl(urlCache.get(path)); return }

    supabase.storage.from('lovekush-photos').createSignedUrl(path, 3600).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) { setFailed(true); return }
      urlCache.set(path, data.signedUrl)
      setUrl(data.signedUrl)
    })
    return () => { cancelled = true }
  }, [path])

  if (failed || !path) {
    return fallback || (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f0f0' }}>
        <span style={{ fontSize: 20 }}>👤</span>
      </div>
    )
  }

  if (!url) {
    return <div style={{ ...style, background: '#f0f0f0' }} />
  }

  return <img src={url} alt={alt || ''} style={style} />
}
