import React, { useState } from 'react'
import { FormLabel, PageHeader, EmptyState } from '../components/ui'
import { Search, SearchX, UserRound, ChevronRight } from 'lucide-react'
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
      <PageHeader title="Profile ID" onBack={onBack} />

      <div className="form-group">
        <FormLabel>Profile ID</FormLabel>
        <input className="form-input" placeholder="e.g. SAWU4935" value={query}
          onChange={e=>setQuery(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter') handleSearch() }} autoFocus />
        {error && <div className="form-error">{error}</div>}
      </div>

      <button className="btn btn-primary btn-full" onClick={handleSearch} disabled={searching}>
        <Search size={16} /> {searching ? 'Searching...' : 'Search'}
      </button>

      {result === null && (
        <EmptyState icon={SearchX} title="No profile found" text="Check the ID and try again" />
      )}

      {result && (
        <div className="match-card page-enter" style={{marginTop:20,display:'flex',gap:14,alignItems:'center',padding:14,cursor:'pointer'}} onClick={()=>onView(result)}>
          <div className="avatar" style={{width:56,height:56}}>
            {result.primaryPhotoPath
              ? <SignedImage path={result.primaryPhotoPath} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
              : <UserRound size={22} />
            }
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,fontSize:15}}>{result.full_name}</div>
            <div style={{fontSize:12,color:'var(--gray3)'}}>{result.age} yrs · {result.city}</div>
            <div className="profile-code" style={{marginTop:4}}>{result.profile_code}</div>
          </div>
          <ChevronRight size={20} style={{color:'var(--gray3)'}} aria-label="View" />
        </div>
      )}
    </div>
  )
}
