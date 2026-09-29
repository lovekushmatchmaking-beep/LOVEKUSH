import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// Renders a DOM node (the biodata template) into a single-page-fitting A4 PDF.
// Returns the jsPDF instance — caller decides .save(...) (download) or
// .output('blob') (share via Web Share API).
export async function generateBiodataPdf(node) {
  const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
  const imgData = canvas.toDataURL('image/jpeg', 0.95)

  const pdf = new jsPDF('p', 'pt', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  if (imgHeight <= pageHeight) {
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight)
  } else {
    // Taller than one page — split across multiple pages.
    let heightLeft = imgHeight
    let position = 0
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }
  }

  return pdf
}
