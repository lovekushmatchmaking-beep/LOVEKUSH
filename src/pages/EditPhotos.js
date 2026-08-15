import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { compressImage } from '../utils/compressImage'
import SignedImage from '../components/SignedImage'

// PHOTO LIFECYCLE (poora): Select -> Validate -> Compress -> Upload to
// Storage -> Create DB record -> Display (signed URL) -> Set Primary ->
// Reorder -> Replace -> Delete. Har step pe error handle hota hai aur
// user ko clearly dikhta hai (chup-chaap fail nahi hota).

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
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [toast, setToast] = useState('')
  const fileRef = useRef()

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
    setPhotos(data || [])
    setLoading(false)
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const handleAddPhoto = async (file) => {
    if (!file) return
    if (photos.length >= 6) {
      showToast('Maximum 6 photos allowed')
      return
    }

    const validationError = validatePhotoFile(file)
    if (validationError) {
      showToast(validationError)
      return
    }

    setUploading(true)
    try {
      const compressed = await compressImage(file)
      const path = user.id + '/' + Date.now() + '.jpg'

      const { error: uploadError } = await supabase.storage
        .from('lovekush-photos')
        .upload(path, compressed, { contentType: 'image/jpeg' })

      if (uploadError) throw new Error('Upload failed: ' + uploadError.message)

      const isPrimary = photos.length === 0
      const { error: insertError } = await supabase.from('photos').insert({
        profile_id: profileId,
        storage_path: path,
        is_primary: isPrimary,
        photo_type: isPrimary ? 'profile' : 'general',
        display_order: photos.length,
      })
      if (insertError) throw new Error('Could not save photo record: ' + insertError.message)

      showToast('Photo uploaded!')
      loadPhotos()
    } catch (err) {
      showToast(err.message)
    }
    setUploading(false)
  }

  const handleDelete = async (photo) => {
    try {
      const { error: delError } = await supabase.from('photos').delete().eq('id', photo.id)
      if (delError) throw new Error('Delete failed: ' + delError.message)

      if (photo.storage_path) {
        await supabase.storage.from('lovekush-photos').remove([photo.storage_path])
      }

      if (photo.is_primary) {
        const remaining = photos.filter(p => p.id !== photo.id)
        if (remaining.length > 0) {
          await supabase.from('photos').update({ is_primary: true, photo_type: 'profile' }).eq('id', remaining[0].id)
        }
      }

      showToast('Photo deleted')
      loadPhotos()
    } catch (err) {
      showToast(err.message)
    }
  }

  const handleSetPrimary = async (photo) => {
    try {
      await supabase.from('photos').update({ is_primary: false, photo_type: 'general' }).eq('profile_id', profileId)
      const { error } = await supabase.from('photos').update({ is_primary: true, photo_type: 'profile' }).eq('id', photo.id)
      if (error) throw new Error('Could not set primary: ' + error.message)
      showToast('Main photo set!')
      loadPhotos()
    } catch (err) {
      showToast(err.message)
    }
  }

  const handleReplace = async (photo, file) => {
    if (!file) return
    const validationError = validatePhotoFile(file)
    if (validationError) {
      showToast(validationError)
      return
    }

    setUploading(true)
    try {
      const compressed = await compressImage(file)
      const path = user.id + '/' + Date.now() + '-replaced.jpg'

      const { error: uploadError } = await supabase.storage
        .from('lovekush-photos')
        .upload(path, compressed, { contentType: 'image/jpeg' })
      if (uploadError) throw new Error('Upload failed: ' + uploadError.message)

      const { error: updateError } = await supabase.from('photos').update({ storage_path: path }).eq('id', photo.id)
      if (updateError) throw new Error('Could not update photo record: ' + updateError.message)

      if (photo.storage_path) {
        await supabase.storage.from('lovekush-photos').remove([photo.storage_path])
      }

      showToast('Photo replaced!')
      loadPhotos()
    } catch (err) {
      showToast(err.message)
    }
    setUploading(false)
  }

  const movePhoto = async (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= photos.length) return
    setReordering(true)
    try {
      const a = photos[index]
      const b = photos[targetIndex]
      await supabase.from('photos').update({ display_order: b.display_order ?? targetIndex }).eq('id', a.id)
      await supabase.from('photos').update({ display_order: a.display_order ?? index }).eq('id', b.id)
      await loadPhotos()
    } catch (err) {
      showToast('Reorder failed: ' + err.message)
    }
    setReordering(false)
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
        <span style={{fontSize:12,color:'#8e8e8e',marginLeft:'auto'}}>{photos.length}/6 photos</span>
      </div>

      <div style={{maxWidth:480,margin:'0 auto',padding:'20px'}}>

        <div className="notice" style={{marginBottom:20}}>
          First photo is your <strong>main profile photo</strong>. Use ↑↓ to reorder, set any as main, replace, or delete.
        </div>

        {photos.length === 0 && (
          <div style={{textAlign:'center',padding:'32px 0',color:'#8e8e8e',fontSize:13}}>
            No photos yet — add your first one below
          </div>
        )}

        {photos.length > 0 && (
          <div style={{marginBottom:24}}>
            <div className="section-label" style={{marginBottom:14}}>Your Photos</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {photos.map((photo, idx) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  idx={idx}
                  total={photos.length}
                  onDelete={handleDelete}
                  onSetPrimary={handleSetPrimary}
                  onReplace={handleReplace}
                  onMove={movePhoto}
                  uploading={uploading}
                  reordering={reordering}
                />
              ))}
            </div>
          </div>
        )}

        {photos.length < 6 && (
          <div>
            <div className="section-label" style={{marginBottom:14}}>
              Add Photo ({6 - photos.length} remaining)
            </div>
            <div
              style={{border:'2px dashed #ddd',borderRadius:16,padding:'32px',textAlign:'center',cursor:uploading?'not-allowed':'pointer',opacity:uploading?0.6:1}}
              onClick={()=>!uploading&&fileRef.current.click()}
            >
              <div style={{fontSize:36,marginBottom:8}}>📷</div>
              <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>
                {uploading ? 'Uploading...' : 'Add Photo'}
              </div>
              <div style={{fontSize:12,color:'#8e8e8e'}}>
                JPG/PNG, up to 15MB — auto compressed
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{display:'none'}}
                onChange={e=>{handleAddPhoto(e.target.files[0]); e.target.value=''}}
              />
            </div>
          </div>
        )}

        {photos.length === 6 && (
          <div style={{textAlign:'center',padding:'16px',background:'#f5f5f5',borderRadius:12,fontSize:13,color:'#8e8e8e'}}>
            Maximum 6 photos reached. Delete a photo to add new one.
          </div>
        )}
      </div>
    </div>
  )
}

function PhotoCard({ photo, idx, total, onDelete, onSetPrimary, onReplace, onMove, uploading, reordering }) {
  const [showMenu, setShowMenu] = useState(false)
  const replaceRef = useRef()

  return (
    <div style={{display:'flex',gap:10,alignItems:'center',padding:'12px',background:'#f9f9f9',borderRadius:14,position:'relative'}}>
      <div style={{display:'flex',flexDirection:'column',gap:2}}>
        <button disabled={idx===0||reordering} onClick={()=>onMove(idx,-1)}
          style={{background:'none',border:'none',cursor:idx===0?'not-allowed':'pointer',opacity:idx===0?0.25:1,fontSize:14,padding:2}}>▲</button>
        <button disabled={idx===total-1||reordering} onClick={()=>onMove(idx,1)}
          style={{background:'none',border:'none',cursor:idx===total-1?'not-allowed':'pointer',opacity:idx===total-1?0.25:1,fontSize:14,padding:2}}>▼</button>
      </div>

      <div style={{width:72,height:72,borderRadius:10,overflow:'hidden',flexShrink:0,background:'#e0e0e0'}}>
        <SignedImage path={photo.storage_path} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
      </div>

      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>
          {photo.is_primary ? 'Main Photo ⭐' : 'Photo ' + (idx + 1)}
        </div>
        {photo.is_primary && (
          <div style={{fontSize:11,color:'#16a34a',background:'#f0fdf4',padding:'2px 8px',borderRadius:20,display:'inline-block'}}>
            Profile Photo
          </div>
        )}
      </div>

      <div style={{position:'relative'}}>
        <button
          style={{background:'none',border:'1px solid #ddd',borderRadius:8,padding:'6px 10px',cursor:'pointer',fontSize:16}}
          onClick={()=>setShowMenu(!showMenu)}
        >
          ⋮
        </button>

        {showMenu && (
          <div style={{position:'absolute',right:0,top:'110%',background:'#fff',border:'1px solid #eee',borderRadius:12,boxShadow:'0 4px 20px rgba(0,0,0,0.12)',zIndex:100,minWidth:160,overflow:'hidden'}}>

            {!photo.is_primary && (
              <button
                style={{width:'100%',padding:'12px 16px',background:'none',border:'none',textAlign:'left',cursor:'pointer',fontSize:13,borderBottom:'1px solid #f0f0f0'}}
                onClick={()=>{onSetPrimary(photo);setShowMenu(false)}}
              >
                ⭐ Set as Main Photo
              </button>
            )}

            <button
              style={{width:'100%',padding:'12px 16px',background:'none',border:'none',textAlign:'left',cursor:'pointer',fontSize:13,borderBottom:'1px solid #f0f0f0'}}
              onClick={()=>{replaceRef.current.click();setShowMenu(false)}}
              disabled={uploading}
            >
              🔄 Replace Photo
            </button>

            <button
              style={{width:'100%',padding:'12px 16px',background:'none',border:'none',textAlign:'left',cursor:'pointer',fontSize:13,color:'#e53e3e'}}
              onClick={()=>{onDelete(photo);setShowMenu(false)}}
            >
              🗑 Delete Photo
            </button>

            <input
              ref={replaceRef}
              type="file"
              accept="image/*"
              style={{display:'none'}}
              onChange={e=>{onReplace(photo, e.target.files[0]); e.target.value=''}}
            />
          </div>
        )}
      </div>
    </div>
  )
}
