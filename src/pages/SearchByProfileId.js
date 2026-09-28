import React, { useState } from 'react'
import { supabase } from '../supabase'
import SignedImage from '../components/SignedImage'

export default function SearchByProfileId({ onView, onBack }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState(undefined) // undefined = not searched yet, null = not found, object = found
  const [error, setError] = useState('')

  const handleSearch = async () => {
    const code = query.trim().toUpperCase()
    if (!code) { setError('Profile ID daaliye'); return }
    setError('')
    setSearching(true)
    setResult(undefined)

    const { data: found } = await supabase
      .from('profiles_public_view')
      .select('*')
      .eq('profile_code', code)
      .maybeSingle()

    if (!found) {
      setResult(null)
      setSearching(false)
      return
    }

    const { data: photo } = await supabase
      .from('photos')
      .select('storage_path')
      .eq('profile_id', found.id)
      .eq('is_primary', true)
      .maybeSingle()

    setResult({ ...found, primaryPhotoPath: photo?.storage_path || null })
    setSearching(false)
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
        <button onClick={onBack} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',lineHeight:1}}>←</button>
        <h2 style={{fontFamily:'Cormorant Garamond',fontSize:24,fontWeight:300,margin:0}}>Search by Profile ID</h2>
      </div>

      <p className="page-subtitle" style={{marginBottom:20}}>Agar aapko kisi ka Profile ID pata hai (jaise SAWU4935), yaha search karke unka profile dekh sakte hain.</p>

      <div className="form-group">
        <label className="form-label">Profile ID</label>
        <input className="form-input" placeholder="e.g. SAWU4935" value={query}
          onChange={e=>setQuery(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter') handleSearch() }} autoFocus />
        {error && <div className="form-error">{error}</div>}
      </div>

      <button className="btn btn-black btn-full" onClick={handleSearch} disabled={searching}>
        {searching ? 'Searching...' : 'Search'}
      </button>

      {result === null && (
        <div style={{textAlign:'center',padding:'40px 0',color:'#8e8e8e'}}>
          <div style={{fontSize:36,marginBottom:10}}>🔍</div>
          <div style={{fontSize:13}}>Is Profile ID se koi profile nahi mila. ID check karke dobara try karein.</div>
        </div>
      )}

      {result && (
        <div className="card" style={{marginTop:20,display:'flex',gap:14,alignItems:'center'}}>
          <div style={{width:56,height:56,borderRadius:'50%',background:'#e0e0e0',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
            {result.primaryPhotoPath
              ? <SignedImage path={result.primaryPhotoPath} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
              : <span style={{fontSize:22}}>👤</span>
            }
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,fontSize:15}}>{result.full_name}</div>
            <div style={{fontSize:12,color:'#8e8e8e'}}>{result.age} years • {result.city}</div>
            <div className="profile-code" style={{display:'inline-block',marginTop:4}}>{result.profile_code}</div>
          </div>
          <button className="btn btn-black btn-sm" onClick={()=>onView(result)}>View</button>
        </div>
      )}
    </div>
  )
}
