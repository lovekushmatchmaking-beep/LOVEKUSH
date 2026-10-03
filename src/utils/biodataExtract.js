// Biodata file (PDF ya photo) se text nikalta hai — poora browser mein,
// file kahin upload nahi hoti (privacy), koi paid API nahi.
//  - Text wala PDF: pdf.js se seedha text (fast, accurate).
//  - Photo / scanned PDF: tesseract.js OCR (English + Hindi). Pehli baar
//    language data (~kuch MB) CDN se download hota hai, isliye thoda time
//    lagta hai.
// Dono libraries dynamic import se sirf tab load hoti hain jab koi file
// chune — signup ka normal bundle chhota rehta hai.

const MAX_OCR_PAGES = 2

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf')
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.js`
  return pdfjs
}

// pdf.js text items ko unki y-position se lines mein jodta hai, taaki
// "Name" aur "Shivani" (alag items, ek hi line) ek line ban jaayein.
function itemsToLines(items) {
  const rows = []
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue
    const y = it.transform[5]
    const x = it.transform[4]
    let row = rows.find(r => Math.abs(r.y - y) < 3)
    if (!row) { row = { y, parts: [] }; rows.push(row) }
    row.parts.push({ x, str: it.str })
  }
  rows.sort((a, b) => b.y - a.y)
  return rows.map(r => r.parts.sort((a, b) => a.x - b.x).map(p => p.str.trim()).join(' ')).join('\n')
}

async function ocrImages(images, onProgress) {
  const { createWorker } = await import('tesseract.js')
  onProgress && onProgress('Reading text from image (first time can take a minute)...')
  const worker = await createWorker(['eng', 'hin'], 1, {
    logger: m => {
      if (onProgress && m.status === 'recognizing text') onProgress(`Reading text... ${Math.round((m.progress || 0) * 100)}%`)
    },
  })
  try {
    let text = ''
    for (const img of images) {
      const { data } = await worker.recognize(img)
      text += '\n' + (data.text || '')
    }
    return text
  } finally {
    await worker.terminate()
  }
}

async function extractFromPdf(file, onProgress) {
  onProgress && onProgress('Opening PDF...')
  const pdfjs = await loadPdfJs()
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  let text = ''
  for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += '\n' + itemsToLines(content.items)
  }
  if (text.replace(/\s/g, '').length >= 40) return text

  // Scanned PDF (sirf image) — pages ko canvas par render karke OCR
  const canvases = []
  for (let i = 1; i <= Math.min(pdf.numPages, MAX_OCR_PAGES); i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    canvases.push(canvas)
  }
  return ocrImages(canvases, onProgress)
}

export async function extractTextFromBiodata(file, onProgress) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return extractFromPdf(file, onProgress)
  if (file.type.startsWith('image/')) return ocrImages([file], onProgress)
  throw new Error('Please upload a PDF or a photo (JPG/PNG) of the biodata.')
}
