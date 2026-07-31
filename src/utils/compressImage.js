export const compressImage = (file, options = {}) => {
  const {
    maxSizeKB = 800,
    maxWidth = 1200,
    maxHeight = 1200,
    initialQuality = 0.85,
    minQuality = 0.3,
  } = options

  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onerror = () => reject(new Error('Unable to read image file'))
    img.onerror = () => reject(new Error('Unable to load image file'))

    reader.onload = (event) => {
      img.src = event.target.result
    }

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

      let quality = initialQuality
      const tryCompress = () => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Image compression failed'))
            return
          }

          if (blob.size / 1024 > maxSizeKB && quality > minQuality) {
            quality -= 0.1
            tryCompress()
            return
          }

          resolve(new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          }))
        }, 'image/jpeg', quality)
      }

      tryCompress()
    }

    reader.readAsDataURL(file)
  })
}
