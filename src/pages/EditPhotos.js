import React, { useState, useEffect, useRef } from 'react'
import { SectionLabel, PageHeader } from '../components/ui'
import { Camera, ImagePlus, RefreshCw, Trash2, Info } from 'lucide-react'
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
    <div style={{paddingBottom:40}}>
      <div className={'toast ' + (toast?'show':'')}>{toast}</div>

      <PageHeader title="Photos" onBack={onBack} />

      <div>

        <div className="notice" style={{marginBottom:20,display:'flex',gap:10}}>
          <Info size={18} style={{color:'var(--primary)',flexShrink:0,marginTop:2}} />
          <span><strong>Full standing</strong> photo · no filters · natural light · no sunglasses</span>
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
      <SectionLabel style={{marginBottom:10}}>{label}</SectionLabel>

      {photo ? (
        <div className="card" style={{display:'flex',gap:14,alignItems:'center',padding:12,marginBottom:0}}>
          <div style={{width:88,height:88,borderRadius:'var(--radius)',overflow:'hidden',flexShrink:0,background:'var(--gray1)',opacity:uploading?0.5:1}}>
            <SignedImage path={photo.storage_path} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
          </div>
          <div style={{flex:1,display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="btn btn-outline btn-sm" disabled={uploading} onClick={onReplace || onPick}>
              <RefreshCw size={14} /> {uploading ? 'Uploading...' : 'Replace'}
            </button>
            {onDelete && (
              <button className="btn btn-danger-outline btn-sm" disabled={uploading} onClick={onDelete}>
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="photo-slot"
          style={{aspectRatio:'auto',padding:'28px 16px',cursor:uploading?'not-allowed':'pointer',opacity:uploading?0.6:1}}
          onClick={()=>!uploading&&onPick()}
        >
          <span className="avatar" style={{width:52,height:52,marginBottom:6}}>{required ? <Camera size={22} /> : <ImagePlus size={22} />}</span>
          <div style={{fontSize:14,fontWeight:500}}>
            {uploading ? 'Uploading...' : 'Add photo'}
          </div>
          <div style={{fontSize:12,color:'var(--gray3)'}}>JPG / PNG · up to 15MB</div>
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
