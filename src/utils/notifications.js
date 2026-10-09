// ===== WHATSAPP REMINDERS — admin events (selfie requested, profile
// approved, meeting scheduled, match shared) only ever changed a DB status;
// nothing reached the client. There is no WhatsApp Business API/vendor
// decided yet (docs/product/future-whatsapp-plan.md still lists this as
// "Future"), so this is the realistic near-term version: a one-tap
// pre-filled wa.me link per event, built from an admin-editable template
// (whatsapp_templates), with every send logged (notification_log) so "did
// we actually remind this client" is answerable later.
import { supabase } from '../supabase'
import { buildWaMeLink, buildWaChooserLink } from './shareProfile'

export const EVENT_LABELS = {
  selfie_requested: 'Selfie requested',
  profile_approved: 'Profile approved',
  match_shared: 'Match shared',
  meeting_scheduled: 'Meeting scheduled',
  interest_received: 'Interest received',
  general: 'General',
}

// Fallback text if the template table is empty or fails to load — the
// picker always has something to send, never a dead end.
export const DEFAULT_MESSAGES = {
  selfie_requested: 'Hi {{name}}, this is LOVEKUSH Global Matchmaking Services. To verify your profile and make it live, please upload a quick selfie from your dashboard. Thank you!',
  profile_approved: 'Hi {{name}}, good news — your LOVEKUSH profile has been verified and is now live. You can start viewing matches on your dashboard.',
  match_shared: 'Hi {{name}}, we just shared a match with you on LOVEKUSH. Please have a look and let us know if you\'d like us to set up a talk.',
  meeting_scheduled: 'Hi {{name}}, confirming your meeting/call with {{otherName}} on {{when}}. Please let us know if you need to reschedule.',
  // Share link par ek party ne "Interested" dabaya — doosri party ko
  // interested profile ka link bhejna (Aryan, 2026-10-09).
  interest_received: 'Hi {{name}}, good news from LOVEKUSH! {{otherName}} has shown interest in your profile. Please have a look at their profile below. Would you like to meet them or take this forward? Just reply here and we will arrange it.',
  general: 'Hi {{name}}, this is LOVEKUSH Global Matchmaking Services.',
}

// {{name}} / {{city}} / etc. — plain substitution, no templating engine.
export function fillTemplate(template, vars = {}) {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) => (vars[key] != null && vars[key] !== '' ? vars[key] : m))
}

export async function fetchTemplates(category) {
  const { data, error } = await supabase.from('whatsapp_templates').select('*').eq('category', category).order('created_at', { ascending: true })
  if (error) return []
  return data || []
}

// Best-effort — a logging failure should never block the admin from
// actually sending the WhatsApp message.
export async function logNotification({ profileId, eventType, staffUserId, messagePreview }) {
  try {
    await supabase.from('notification_log').insert({
      profile_id: profileId,
      event_type: eventType,
      staff_user_id: staffUserId,
      message_preview: (messagePreview || '').slice(0, 300),
    })
  } catch (e) {
    console.warn('Notification log failed (non-critical):', e.message)
  }
}

// Shared by the simple "fire and log" call sites (existing Send-via-
// WhatsApp links in match sharing) that don't need the template picker UI.
export function waLinkFor(phone, message) {
  return buildWaMeLink(phone, message) || buildWaChooserLink(message)
}
