import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

// Auto compress any image to under 800KB
const compressImage = (file) => {
  return new Promise((resolve) => {
    const maxSizeKB = 800
    const maxWidth = 1200
    const maxHeight = 1200

    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => { img.src = e.target.result }

    img.onload = () => {
      let width = img.width
      let height = img.height

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      let quality = 0.85
      const tryCompress = () => {
        canvas.toBlob((blob) => {
          if (blob.size / 1024 > maxSizeKB && quality > 0.3) {
            quality -= 0.1
            tryCompress()
          } else {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            })
            resolve(compressedFile)
          }
        }, 'image/jpeg', quality)
      }
      tryCompress()
    }
    reader.readAsDataURL(file)
  })
}

export default function EditPhotos({ user, profileId, onBack }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
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
    setPhotos(data || [])
    setLoading(false)
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleAddPhoto = async (file) => {
    if (!file) return
    if (photos.length >= 6) {
      showToast('Maximum 6 photos allowed')
      return
    }
    setUploading(true)
    try {
      const compressed = await compressImage(file)
      const path = user.id + '/' + Date.now() + '.jpg'

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('lovekush-photos')
        .upload(path, compressed, { contentType: 'image/jpeg' })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('lovekush-photos')
        .getPublicUrl(path)

      const isPrimary = photos.length === 0

      await supabase.from('photos').insert({
        profile_id: profileId,
        photo_url: urlData.publicUrl,
        is_primary: isPrimary,
        photo_type: isPrimary ? 'profile' : 'general'
      })

      showToast('Photo uploaded!')
      loadPhotos()
    } catch (err) {
      showToast('Upload failed: ' + err.message)
    }
    setUploading(false)
  }

  const handleDelete = async (photo) => {
    try {
      await supabase.from('photos').delete().eq('id', photo.id)

      // Extract path from URL and delete from storage
      const urlParts = photo.photo_url.split('/lovekush-photos/')
      if (urlParts[1]) {
        await supabase.storage.from('lovekush-photos').remove([urlParts[1]])
      }

      // If deleted was primary, make first remaining photo primary
      if (photo.is_primary) {
        const remaining = photos.filter(p => p.id !== photo.id)
        if (remaining.length > 0) {
          await supabase.from('photos').update({ is_primary: true, photo_type: 'profile' }).eq('id', remaining[0].id)
        }
      }

      showToast('Photo deleted')
      loadPhotos()
    } catch (err) {
      showToast('Error: ' + err.message)
    }
  }

  const handleSetPrimary = async (photo) => {
    try {
      // Remove primary from all
      await supabase.from('photos').update({ is_primary: false, photo_type: 'general' }).eq('profile_id', profileId)
      // Set this as primary
      await supabase.from('photos').update({ is_primary: true, photo_type: 'profile' }).eq('id', photo.id)
      showToast('Main photo set!')
      loadPhotos()
    } catch (err) {
      showToast('Error: ' + err.message)
    }
  }

  const handleReplace = async (photo, file) => {
    if (!file) return
    setUploading(true)
    try {
      const compressed = await compressImage(file)
      const path = user.id + '/' + Date.now() + '-replaced.jpg'

      const { error: uploadError } = await supabase.storage
        .from('lovekush-photos')
        .upload(path, compressed, { contentType: 'image/jpeg' })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('lovekush-photos')
        .getPublicUrl(path)

      await supabase.from('photos').update({ photo_url: urlData.publicUrl }).eq('id', photo.id)

      // Delete old from storage
      const urlParts = photo.photo_url.split('/lovekush-photos/')
      if (urlParts[1]) {
        await supabase.storage.from('lovekush-photos').remove([urlParts[1]])
      }

      showToast('Photo replaced!')
      loadPhotos()
    } catch (err) {
      showToast('Error: ' + err.message)
    }
    setUploading(false)
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <div style={{fontSize:13,opacity:0.4}}>Loading photos...</div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'#fff',paddingBottom:40}}>
      <div className={'toast ' + (toast?'show':'')}>{toast}</div>

      {/* Header */}
      <div style={{position:'sticky',top:0,zIndex:90,background:'rgba(255,255,255,0.97)',backdropFilter:'blur(12px)',borderBottom:'1px solid rgba(0,0,0,0.06)',padding:'14px 20px',display:'flex',alignItems:'center',gap:12}}>
        <button onClick={onBack} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',lineHeight:1}}>←</button>
        <span style={{fontFamily:'DM Sans',fontSize:15,fontWeight:500}}>Manage Photos</span>
        <span style={{fontSize:12,color:'#8e8e8e',marginLeft:'auto'}}>{photos.length}/6 photos</span>
      </div>

      <div style={{maxWidth:480,margin:'0 auto',padding:'20px'}}>

        {/* Info */}
        <div className="notice" style={{marginBottom:20}}>
          First photo is your <strong>main profile photo</strong>. You can add up to 6 photos, set any as main, replace, or delete.
        </div>

        {/* Existing Photos */}
        {photos.length > 0 && (
          <div style={{marginBottom:24}}>
            <div className="section-label" style={{marginBottom:14}}>Your Photos</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {photos.map((photo, idx) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  idx={idx}
                  onDelete={handleDelete}
                  onSetPrimary={handleSetPrimary}
                  onReplace={handleReplace}
                  uploading={uploading}
                />
              ))}
            </div>
          </div>
        )}

        {/* Add New Photo */}
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
                Any size — auto compressed
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{display:'none'}}
                onChange={e=>handleAddPhoto(e.target.files[0])}
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

function PhotoCard({ photo, idx, onDelete, onSetPrimary, onReplace, uploading }) {
  const [showMenu, setShowMenu] = useState(false)
  const replaceRef = useRef()

  return (
    <div style={{display:'flex',gap:12,alignItems:'center',padding:'12px',background:'#f9f9f9',borderRadius:14,position:'relative'}}>
      {/* Photo */}
      <div style={{width:72,height:72,borderRadius:10,overflow:'hidden',flexShrink:0,background:'#e0e0e0'}}>
        <img src={photo.photo_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
      </div>

      {/* Info */}
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

      {/* Menu Button */}
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
              onChange={e=>onReplace(photo, e.target.files[0])}
            />
          </div>
        )}
      </div>
    </div>
  )
}

