import html2canvas from 'html2canvas'

// Renders a DOM node (MeetingCard) into a shareable PNG blob — same
// html2canvas engine generateBiodataPdf.js already uses, just returned as
// an image instead of a PDF page. Used so meeting details can be shared as
// a real visual card instead of plain WhatsApp text (Aryan, 2026-10-11).
export async function generateMeetingCardImage(node) {
  const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}
