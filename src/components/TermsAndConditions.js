import React from 'react'

// Extracted from Aryan's original Google Form's "Important Information,
// Terms & Consent" + declaration sections (2026-10-10) — kept in his own
// words/intent as far as possible, since he wrote these carefully to avoid
// any legal liability. No monetization/pricing language added (none exists
// in the product yet) — the fee lines from the form are phrased generally
// ("if applicable") so this stays accurate whether or not fees are ever
// introduced later.
export default function TermsAndConditions() {
  return (
    <div style={{fontSize:13, lineHeight:1.7, color:'#444'}}>
      <p>Please read this section carefully before proceeding.</p>
      <ul style={{paddingLeft:18, margin:'8px 0 14px'}}>
        <li>This service is for matrimonial assistance only.</li>
        <li>LOVEKUSH acts strictly as a facilitator, not a guarantor of marriage or match success.</li>
        <li>Registration and use of this service does <strong>not</strong> guarantee a match or marriage.</li>
        <li>All information is provided voluntarily by the applicant.</li>
        <li>Any false, hidden, or misleading information may result in rejection of the profile, without notice.</li>
        <li>Any fees (if and when applicable) are charged for service effort and coordination, not for outcomes, and will always be clearly disclosed before any payment is requested.</li>
        <li>The applicant confirms they are legally eligible for marriage under the laws applicable to them.</li>
        <li>Online/offline meetings arranged through LOVEKUSH may be chargeable in the future; no meeting is ever confirmed without the mutual consent of both parties.</li>
      </ul>

      <p><strong>Photographs & identity documents</strong></p>
      <ul style={{paddingLeft:18, margin:'8px 0 14px'}}>
        <li>Photographs are shared only with suitable families/matches, and never used publicly without consent.</li>
        <li>Identity verification documents are kept confidential and used only for internal verification — never shared with other families.</li>
      </ul>

      <p><strong>Outcomes & responsibility</strong></p>
      <ul style={{paddingLeft:18, margin:'8px 0 14px'}}>
        <li>Marriage outcome depends entirely on the mutual consent of both individuals and families involved.</li>
        <li>LOVEKUSH does not guarantee marriage, engagement, or any timeline, and does not influence or force any family's decision.</li>
        <li>LOVEKUSH cannot be held responsible for decisions taken independently by families after a meeting or introduction.</li>
      </ul>

      <p><strong>Case handling</strong></p>
      <ul style={{paddingLeft:18, margin:'8px 0 14px'}}>
        <li>LOVEKUSH reserves the right to pause, reject, or discontinue a case if information is incomplete or misleading, expectations are unrealistic, or cooperation is not maintained.</li>
      </ul>

      <p style={{marginTop:14}}>By ticking the box below, you confirm that you have read and understood the above, that you are legally eligible for marriage, that the information you provide is true to the best of your knowledge, and that you voluntarily agree to proceed with this matrimonial assistance service. This does not create any legal obligation, guarantee, or contractual promise of marriage.</p>
    </div>
  )
}

// Compact, reusable "read + tick" gate used at the end of signup. Renders
// the text above inside a scrollable box plus the mandatory checkbox.
// `accepted`/`onChange` are controlled by the parent so the Continue/
// Submit button can be disabled until it's ticked.
export function TermsGate({ accepted, onChange }) {
  return (
    <div className="notice" style={{display:'flex', flexDirection:'column', gap:12, textAlign:'left'}}>
      <div style={{maxHeight:260, overflowY:'auto', paddingRight:4}}>
        <TermsAndConditions />
      </div>
      <label style={{display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer', fontSize:13, fontWeight:600}}>
        <input type="checkbox" checked={!!accepted} onChange={e=>onChange(e.target.checked)} style={{marginTop:3}} />
        <span>I have read and understood the above, and I voluntarily agree to proceed with LOVEKUSH's matchmaking assistance service. *</span>
      </label>
    </div>
  )
}
