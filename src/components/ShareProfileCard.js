import React from 'react'
import { Lock, ThumbsUp, Check, ThumbsDown, Phone, MessageCircle, ShieldCheck } from 'lucide-react'
import { BrandLockup } from './BrandLogo'
import { shareSafeAboutMe } from '../utils/shareProfile'
import ZoomablePhoto from './ZoomablePhoto'

// Shared look for the public share-link pages (SharedProfile = one
// profile, SharedMatches = several in one link). Pehle dono pages mein
// apna-apna copy tha; ab same card, same sections, same RM box — sirf
// presentation hai, data wahi get_shared_profile / get_shared_bundle se
// aata hai aur fields bhi wahi hain (Aryan, 2026-10-11: "link khule to
// aur attractive lage").

export function shareSections(p) {
  const sections = [
    ['Personal Details', [
      ['Age', p.age ? p.age + ' years' : null],
      ['Height', p.height],
      ['Weight', p.weight],
      ['Marital Status', p.marital_status],
      ['Complexion', p.complexion],
      ['Body Type', p.body_type],
      ['Nationality', p.nationality],
      ['Mother Tongue', p.mother_tongue],
    ]],
    ['Religious Background', [
      ['Religion', p.religion],
      ['Community', p.community],
      ['Sub-Caste', p.sub_caste],
      ['Gotra', p.gotra],
      ['Manglik', p.manglik],
      ['Rashi', p.rashi],
      ['Nakshatra', p.nakshatra],
    ]],
    ['Education & Career', [
      ['Living In', [p.city, p.state, p.country].filter(Boolean).join(', ')],
      ['Education', p.education],
      ['Degree', p.degree],
      ['College', p.college_name],
      ['Employer', p.employer],
      ['Profession', p.occupation],
      ['Annual Income', p.annual_income],
      ['Diet', p.diet],
    ]],
    ['Family Details', [
      ['Family Type', p.family_type],
      ["Father's Profession", p.father_profession],
      ["Mother's Profession", p.mother_profession],
      ['Family Financial Status', p.family_financial_status],
    ]],
  ]
  return sections
    .map(([title, rows]) => [title, rows.filter(([, v]) => v)])
    .filter(([, rows]) => rows.length > 0)
}

export function ShareLoading() {
  return (
    <div className="share-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 13, opacity: 0.5 }}>Loading...</div>
    </div>
  )
}

export function ShareError({ message }) {
  return (
    <div className="share-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 20, textAlign: 'center' }}>
      <div className="empty-state-icon" style={{ margin: 0 }}><Lock size={28} /></div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>Link Not Available</div>
      <div style={{ fontSize: 13, color: '#8e8e8e', maxWidth: 320 }}>{message}</div>
    </div>
  )
}

// Page frame: brand, headline, "Suggested for" (share_links.client_profile_id
// — audit 2026-10-08, P1 #12), then the cards, RM box and expiry line.
export function ShareShell({ headline, client, rm, expiresAt, children }) {
  return (
    <div className="share-page">
      <div className="share-hero-band" />
      <div className="share-wrap">
        <div className="share-head">
          <BrandLockup size={30} />
          <div className="share-headline">{headline}</div>
          {client?.client_masked_name && (
            <div className="share-for">
              Suggested for <strong>{client.client_full_name || client.client_masked_name}</strong>
              {(client.client_age || client.client_city) && (
                <> · {[client.client_age ? client.client_age + ' years' : null, client.client_city].filter(Boolean).join(', ')}</>
              )}
            </div>
          )}
        </div>
        {children}
        <ShareRmCard rm={rm} />
        <div className="share-foot">
          <ShieldCheck size={12} />
          {expiresAt ? <>This link expires on {new Date(expiresAt).toLocaleDateString('en-IN')} · </> : null}
          Confidential, not for public distribution
        </div>
      </div>
    </div>
  )
}

// RM contact — highlighted (Aryan, 2026-10-10: "bold aur highlight hona
// chahiye"), now with one-tap Call / WhatsApp.
function ShareRmCard({ rm }) {
  const digits = (rm?.rm_phone || '').replace(/\D/g, '')
  const waNumber = digits.length === 10 ? '91' + digits : digits
  return (
    <div className="share-rm">
      <div className="share-rm-label">Your Relationship Manager</div>
      {(rm?.rm_name || rm?.rm_phone || rm?.rm_email) ? (
        <>
          {rm.rm_name && <div className="share-rm-name">{rm.rm_name}</div>}
          {rm.rm_phone && <div className="share-rm-phone">{rm.rm_phone}</div>}
          {rm.rm_email && (
            <a href={`mailto:${rm.rm_email}`} style={{ fontSize: 13, color: '#555', textDecoration: 'none' }}>{rm.rm_email}</a>
          )}
          {digits && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              <a className="share-btn share-btn-outline" href={`tel:${rm.rm_phone.replace(/\s+/g, '')}`}><Phone size={14} /> Call</a>
              <a className="share-btn share-btn-wa" href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> WhatsApp</a>
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 13, color: '#555' }}>Please contact LOVEKUSH Matchmaking Services.</div>
      )}
    </div>
  )
}

// One profile. `state`: null | 'int-sending' | 'int-done' | 'int-error' |
// 'ni-sending' | 'ni-done'. "Not Interested" stays the quieter button, and
// after it the client only sees a neutral "Thanks for browsing".
export function ShareProfileCard({ p, state, onInterested, onNotInterested, errorHint }) {
  const about = shareSafeAboutMe(p.about_me)
  const facts = [
    p.age ? p.age + ' yrs' : null,
    p.height,
    p.city,
    p.occupation,
    p.education,
  ].filter(Boolean)
  return (
    <div className="share-card">
      <div className="share-card-top">
        {(p.photo_path || p.photo_path_2) && (
          <div className="share-photos">
            {p.photo_path && <ZoomablePhoto path={p.photo_path} alt={p.masked_name} size={112} />}
            {p.photo_path_2 && <ZoomablePhoto path={p.photo_path_2} alt={p.masked_name} size={112} />}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div className="share-name">{p.full_name || p.masked_name}</div>
          {p.profile_code && <div className="share-code">{p.profile_code}</div>}
        </div>
      </div>

      {facts.length > 0 && (
        <div className="share-facts">
          {facts.map(f => <span key={f} className="share-fact">{f}</span>)}
        </div>
      )}

      {about && <div className="share-about">"{about}"</div>}

      {shareSections(p).map(([title, rows]) => (
        <div key={title} className="share-section">
          <div className="share-section-title">{title}</div>
          <div className="share-rows">
            {rows.map(([k, v]) => (
              <div key={k} className="share-row">
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </div>
      ))}

      {state === 'ni-done' ? (
        <div style={{ marginTop: 16, padding: '12px 0', textAlign: 'center', fontSize: 13, color: '#8e8e8e' }}>
          Thanks for browsing.
        </div>
      ) : state === 'int-done' ? (
        <div className="share-btn share-btn-done" style={{ marginTop: 16 }}>
          <Check size={15} /> Marked as Interested — we'll be in touch
        </div>
      ) : (
        <div className="share-actions">
          <button className="share-btn share-btn-primary" onClick={onInterested} disabled={!!state}>
            <ThumbsUp size={15} /> {state === 'int-sending' ? 'Sending...' : 'Interested'}
          </button>
          <button className="share-btn share-btn-outline" onClick={onNotInterested} disabled={!!state} title="Not Interested">
            <ThumbsDown size={15} /> Not Interested
          </button>
        </div>
      )}
      {state === 'int-error' && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#dc2626', textAlign: 'center' }}>{errorHint}</div>
      )}
    </div>
  )
}
