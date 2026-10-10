import React, { useRef, useState } from 'react'
import { FileText, Check, X, ClipboardPaste, Copy } from 'lucide-react'
import { extractTextFromBiodata } from '../utils/biodataExtract'
import { parseBiodataText, BIODATA_CHATGPT_PROMPT } from '../utils/biodataParser'

// Signup ke pehle screen par: "Biodata hai? Upload karo, jo fields mil
// sakein woh apne aap bhar denge." User pehle dekh leta hai kya mila (har
// field ke saath checkbox), phir "Fill" dabata hai — kuch bhi bina dikhaye
// nahi bharta. Baaki wizard pehle jaisa hi chalta hai, bas jawab pehle se
// bhare milte hain jinhe badla ja sakta hai.
// Admin ke liye "Paste text" bhi: ChatGPT se saaf kiya hua (ya WhatsApp se
// copy kiya) biodata text daalo, wahi parser chalta hai — OCR ki zaroorat nahi.

export default function BiodataAutofill({ onApply, includeContact }) {
  const fileRef = useRef(null)
  const [state, setState] = useState('idle') // idle | busy | paste | review | done | error
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState(null)
  const [unchecked, setUnchecked] = useState([])
  const [error, setError] = useState('')
  const [filledCount, setFilledCount] = useState(0)
  const [pasted, setPasted] = useState('')
  const [copied, setCopied] = useState(false)

  const review = (text, emptyMsg, failState = 'error') => {
    const parsed = parseBiodataText(text, { includeContact })
    if (parsed.found.length === 0) { setError(emptyMsg); setState(failState); return }
    setResult(parsed); setUnchecked([]); setState('review')
  }

  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(BIODATA_CHATGPT_PROMPT); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { setError('Could not copy, please select the prompt text manually.') }
  }

  const handleFile = async (file) => {
    if (!file) return
    if (file.size > 15 * 1024 * 1024) { setError('File too large (max 15MB).'); setState('error'); return }
    setState('busy'); setError(''); setProgress('Reading biodata...')
    try {
      const text = await extractTextFromBiodata(file, setProgress)
      review(text, "Couldn't find any details in this file. A clear, straight photo or the original PDF works best — or just fill the form below.")
    } catch (e) {
      setError(e.message || 'Could not read this file.')
      setState('error')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const apply = () => {
    const values = {}
    result.found.filter(f => !unchecked.includes(f.key)).forEach(f => {
      f.fields.forEach(k => { values[k] = result.values[k] })
    })
    onApply(values)
    setFilledCount(result.found.length - unchecked.length)
    setState('done')
  }

  const toggle = (key) => setUnchecked(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const box = { background: '#f9f9f9', borderRadius: 12, padding: 14, marginBottom: 20 }

  return (
    <div style={box}>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files[0])} />

      {(state === 'idle' || state === 'error') && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <FileText size={22} style={{ flexShrink: 0, color: 'var(--primary)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Have a biodata already?</div>
            <div style={{ fontSize: 12, color: 'var(--gray3)' }}>Upload the PDF or a photo, or paste the biodata text, and we'll fill in what we can. Nothing is uploaded, it's read on this device.</div>
            {state === 'error' && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{error}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>Upload</button>
            <button className="btn btn-outline btn-sm" onClick={() => { setError(''); setState('paste') }}><ClipboardPaste size={14} /> Paste text</button>
          </div>
        </div>
      )}

      {state === 'paste' && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Paste biodata text</div>
          <div style={{ fontSize: 12, color: 'var(--gray3)', marginBottom: 8 }}>
            Any "Label : Value" text works (English or Hindi). For messy biodata, copy our ChatGPT prompt, paste it in ChatGPT with the biodata, then paste ChatGPT's answer here.
          </div>
          <textarea className="form-textarea" autoFocus value={pasted} onChange={e => setPasted(e.target.value)}
            placeholder={"Name: Rahul Kushwaha\nDate of Birth: 15/08/1996\nHeight: 5'8\"\nEducation: B.Tech\nCity: Lucknow\n..."}
            style={{ minHeight: 200, fontSize: 13 }} />
          {error && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-black btn-sm" disabled={!pasted.trim()}
              onClick={() => review(pasted, "Couldn't find any details. Put each detail on its own line like \"Height: 5'6\"\", or use the ChatGPT prompt.", 'paste')}>
              Read details
            </button>
            <button className="btn btn-outline btn-sm" onClick={copyPrompt}>
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy ChatGPT prompt</>}
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => { setError(''); setState('idle') }}><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      {state === 'busy' && (
        <div style={{ fontSize: 13, color: 'var(--gray3)' }}>{progress}</div>
      )}

      {state === 'review' && result && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Found {result.found.length} details — untick anything that's wrong</div>
          {result.found.map(f => {
            const on = !unchecked.includes(f.key)
            return (
              <div key={f.key} onClick={() => toggle(f.key)}
                style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.05)', cursor: 'pointer', opacity: on ? 1 : 0.45 }}>
                <span style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--primary)' : '#fff', color: '#fff', flexShrink: 0 }}>
                  {on && <Check size={12} />}
                </span>
                <span style={{ fontSize: 12, color: 'var(--gray3)', width: 110, flexShrink: 0 }}>{f.label}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{f.shown}</span>
              </div>
            )
          })}
          {result.unmatched.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--gray3)', marginTop: 8 }}>
              Please pick these yourself on their screens: {result.unmatched.map(u => `${u.label} ("${u.raw}")`).join(', ')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-black btn-sm" onClick={apply} disabled={unchecked.length === result.found.length}>
              Fill {result.found.length - unchecked.length} fields
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setState('idle')}><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      {state === 'done' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
          <Check size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{filledCount} fields filled from your biodata. Check each screen as you go.</span>
          <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>Another file</button>
          <button className="btn btn-outline btn-sm" onClick={() => { setPasted(''); setError(''); setState('paste') }}>Paste text</button>
        </div>
      )}
    </div>
  )
}
