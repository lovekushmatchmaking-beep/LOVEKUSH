-- Aryan (2026-10-09, voice note): "📲 Send interest to <name>" button ka
-- label itna lamba hai ki click karne ke baad pata nahi chalta bheja ki
-- nahi — dobara click karke dekhna padta tha. Button click ke baad "✓
-- Sent" dikhna chahiye, aur refresh/reload ke baad bhi yaad rahna chahiye.
--
-- Reuse-first: bilkul wahi pattern jo "→ Tell this profile" button ke
-- forwarded_at column ke liye already hai (same table, same shape) — koi
-- naya RPC/table nahi, sirf ek nullable timestamptz column jo WhatsApp
-- sheet se actual "Send" dabne par set hota hai (ReminderSheet ka send()),
-- taaki "Preparing..." jaisa hi, sirf fire karna "Sent" nahi maana jaaye.
alter table public.share_links
  add column if not exists interest_sent_at timestamptz;
