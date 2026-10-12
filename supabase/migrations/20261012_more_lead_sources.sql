-- More lead sources (Aryan, 2026-10-12): every realistic acquisition
-- channel, not just Marriage Bureau. Must match LEAD_SOURCE_OPTIONS in
-- src/constants/profileOptions.js. Existing values are all kept.
alter table public.profiles drop constraint if exists profiles_lead_source_check;
alter table public.profiles add constraint profiles_lead_source_check
  check (lead_source is null or lead_source in (
    'Referral', 'Friends & Family', 'Marriage Bureau', 'Walk-in',
    'Website', 'Website Ad', 'Online Ads', 'Google Search', 'Facebook / Instagram', 'WhatsApp', 'YouTube',
    'Leaflet / Pamphlet', 'Visiting Card', 'Newspaper Ad', 'Hoarding / Banner', 'Event / Mela',
    'Phone Call', 'Other'
  ));
