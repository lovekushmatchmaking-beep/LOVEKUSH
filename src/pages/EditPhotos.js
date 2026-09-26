import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { compressImage } from '../utils/compressImage'
import SignedImage from '../components/SignedImage'

// PHOTO LIFECYCLE (poora): Select -> Validate -> Compress -> Upload to
// Storage -> Create DB record -> Display (signed URL) -> Replace/Delete.
// Har step pe error handle hota hai aur user ko clearly dikhta hai
// (chup-chaap fail nahi hota).
//
// Fixed 2-slot model: Profile (is_primary=true) aur Secondary
// (is_primary=false). Profile sirf Replace ho sakta hai (Delete nahi,
// kam-se-kam 1 photo hamesha rahegi). Secondary Add/Replace/Delete sab
// kar sakta hai.

function validatePhotoFile(file) {
  if (!file.type.startsWith('image/')) {
    return 'Please select an image file (JPG, PNG, etc.)'
  }
  if (file.size > 15 * 1024 * 1024) {
    return 'Image too large (max 15MB). Please choose a smaller photo.'
  }
  return null
}

export default function EditPhotos({ user, profileId, onBack }) {
  const [profilePhoto, setProfilePhoto] = useState(null)
  const [secondaryPhoto, setSecondaryPhoto] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(null) // 'profile' | 'secondary' | null
  const [toast, setToast] = useState('')
  const profileFileRef = useRef()
  const secondaryFileRef = useRef()

  useEffect(() => {
    loadPhotos()
  }, [])

  const loadPhotos = async () => {
    const { data } = await supabase
      .from('photos')
      .select('*')
      .eq('profile_id', profileId)
      .order('is_primary', { ascending: false })
      .order('display_order', { ascending: true })

    const rows = data || []
    setProfilePhoto(rows.find(p => p.is_primary) || null)
    setSecondaryPhoto(rows.find(p => !p.is_primary) || null)
    setLoading(false)
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const handleAddSecondary = async (file) => {
    if (!file) return
    const validationError = validatePhotoFile(file)
    if (validationError) {
      showToast(validationError)
      return
    }

    setUploading('secondary')
    try {
      const compressed = await compressImage(file)
      const path = user.id + '/' + Date.now() + '.jpg'

      const { error: uploadError } = await supabase.storage
        .from('lovekush-photos')
        .upload(path, compressed, { contentType: 'image/jpeg' })
      if (uploadError) throw new Error('Upload failed: ' + uploadError.message)

      const { error: insertError } = await supabase.from('photos').insert({
        profile_id: profileId,
        storage_path: path,
        is_primary: false,
        photo_type: 'secondary',
        display_order: 1,
      })
      if (insertError) throw new Error('Could not save photo record: ' + insertError.message)

      showToast('Photo uploaded!')
      loadPhotos()
    } catch (err) {
      showToast(err.message)
    }
    setUploading(null)
  }

  const handleAddOrReplaceProfile = async (file) => {
    if (!file) return
    const validationError = validatePhotoFile(file)
    if (validationError) {
      showToast(validationError)
      return
    }

    setUploading('profile')
    try {
      const compressed = await compressImage(file)
      const path = user.id + '/' + Date.now() + '-profile.jpg'

      const { error: uploadError } = await supabase.storage
        .from('lovekush-photos')
        .upload(path, compressed, { contentType: 'image/jpeg' })
      if (uploadError) throw new Error('Upload failed: ' + uploadError.message)

      if (profilePhoto) {
        const { error: updateError } = await supabase.from('photos')
          .update({ storage_path: path }).eq('id', profilePhoto.id)
        if (updateError) throw new Error('Could not update photo record: ' + updateError.message)
        if (profilePhoto.storage_path) {
          await supabase.storage.from('lovekush-photos').remove([profilePhoto.storage_path])
        }
        showToast('Profile photo replaced!')
      } else {
        const { error: insertError } = await supabase.from('photos').insert({
          profile_id: profileId,
          storage_path: path,
          is_primary: true,
          photo_type: 'profile',
          display_order: 0,
        })
        if (insertError) throw new Error('Could not save photo record: ' + insertError.message)
        showToast('Profile photo added!')
      }

      loadPhotos()
    } catch (err) {
      showToast(err.message)
    }
    setUploading(null)
  }

  const handleReplaceSecondary = async (file) => {
    if (!file || !secondaryPhoto) return
    const validationError = validatePhotoFile(file)
    if (validationError) {
      showToast(validationError)
      return
    }

    setUploading('secondary')
    try {
      const compressed = await compressImage(file)
      const path = user.id + '/' + Date.now() + '-replaced.jpg'

      const { error: uploadError } = await supabase.storage
        .from('lovekush-photos')
        .upload(path, compressed, { contentType: 'image/jpeg' })
      if (uploadError) throw new Error('Upload failed: ' + uploadError.message)

      const { error: updateError } = await supabase.from('photos')
        .update({ storage_path: path }).eq('id', secondaryPhoto.id)
      if (updateError) throw new Error('Could not update photo record: ' + updateError.message)

      if (secondaryPhoto.storage_path) {
        await supabase.storage.from('lovekush-photos').remove([secondaryPhoto.storage_path])
      }

      showToast('Photo replaced!')
      loadPhotos()
    } catch (err) {
      showToast(err.message)
    }
    setUploading(null)
  }

  const handleDeleteSecondary = async () => {
    if (!secondaryPhoto) return
    try {
      const { error: delError } = await supabase.from('photos').delete().eq('id', secondaryPhoto.id)
      if (delError) throw new Error('Delete failed: ' + delError.message)

      if (secondaryPhoto.storage_path) {
        await supabase.storage.from('lovekush-photos').remove([secondaryPhoto.storage_path])
      }

      showToast('Photo deleted')
      loadPhotos()
    } catch (err) {
      showToast(err.message)
    }
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <div style={{fontSize:13,opacity:0.4}}>Loading photos...</div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'#fff',paddingBottom:40}}>
      <div className={'toast ' + (toast?'show':'')}>{toast}</div>

      <div style={{position:'sticky',top:0,zIndex:90,background:'rgba(255,255,255,0.97)',backdropFilter:'blur(12px)',borderBottom:'1px solid rgba(0,0,0,0.06)',padding:'14px 20px',display:'flex',alignItems:'center',gap:12}}>
        <button onClick={onBack} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',lineHeight:1}}>←</button>
        <span style={{fontFamily:'DM Sans',fontSize:15,fontWeight:500}}>Manage Photos</span>
      </div>

      <div style={{maxWidth:480,margin:'0 auto',padding:'20px'}}>

        <div className="notice" style={{marginBottom:20}}>
          <strong>Photo Guidelines:</strong> Photo <strong>full standing</strong> honi chahiye (sirf face/headshot nahi) — bina kisi filter ke, natural lighting mein, bina sunglasses/edited-image ke. Yeh isliye zaroori hai taaki family/partner ko aapki real, honest tasveer dikhe.
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:16}}>

          <PhotoSlot
            label="Profile Photo *"
            required
            photo={profilePhoto}
            uploading={uploading==='profile'}
            onPick={()=>profileFileRef.current.click()}
            fileRef={profileFileRef}
            onFileSelected={handleAddOrReplaceProfile}
          />

          <PhotoSlot
            label="Secondary Photo"
            photo={secondaryPhoto}
            uploading={uploading==='secondary'}
            onPick={()=>secondaryFileRef.current.click()}
            onReplace={()=>secondaryFileRef.current.click()}
            onDelete={handleDeleteSecondary}
            fileRef={secondaryFileRef}
            onFileSelected={secondaryPhoto ? handleReplaceSecondary : handleAddSecondary}
          />

        </div>
      </div>
    </div>
  )
}

function PhotoSlot({ label, required, photo, uploading, onPick, onReplace, onDelete, fileRef, onFileSelected }) {
  return (
    <div>
      <div className="section-label" style={{marginBottom:10}}>{label}</div>

      {photo ? (
        <div style={{display:'flex',gap:12,alignItems:'center',padding:'12px',background:'#f9f9f9',borderRadius:14}}>
          <div style={{width:80,height:80,borderRadius:10,overflow:'hidden',flexShrink:0,background:'#e0e0e0',opacity:uploading?0.5:1}}>
            <SignedImage path={photo.storage_path} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
          </div>
          <div style={{flex:1,display:'flex',gap:8,flexWrap:'wrap'}}>
            <button
              disabled={uploading}
              style={{background:'none',border:'1px solid #ddd',borderRadius:8,padding:'8px 14px',cursor:uploading?'not-allowed':'pointer',fontSize:13}}
              onClick={onReplace || onPick}
            >
              {uploading ? 'Uploading...' : '🔄 Replace'}
            </button>
            {onDelete && (
              <button
                disabled={uploading}
                style={{background:'none',border:'1px solid #ddd',borderRadius:8,padding:'8px 14px',cursor:uploading?'not-allowed':'pointer',fontSize:13,color:'#e53e3e'}}
                onClick={onDelete}
              >
                🗑 Delete
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{border:'2px dashed #ddd',borderRadius:16,padding:'28px',textAlign:'center',cursor:uploading?'not-allowed':'pointer',opacity:uploading?0.6:1}}
          onClick={()=>!uploading&&onPick()}
        >
          <div style={{fontSize:32,marginBottom:6}}>📷</div>
          <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>
            {uploading ? 'Uploading...' : (required ? 'Add Profile Photo' : 'Add Secondary Photo')}
          </div>
          <div style={{fontSize:12,color:'#8e8e8e'}}>
            JPG/PNG, up to 15MB — auto compressed, full standing, no filters
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{display:'none'}}
        onChange={e=>{onFileSelected(e.target.files[0]); e.target.value=''}}
      />
    </div>
  )
}
