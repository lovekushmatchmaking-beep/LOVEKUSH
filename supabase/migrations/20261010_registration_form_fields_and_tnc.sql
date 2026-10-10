-- Fields extracted from Aryan's original Google Form (Indian + NRI/PRI
-- client registration, T&C, coordination workflow) that are useful here
-- and weren't already covered by an existing column. Reuse-first: most of
-- the form's fields (marital status, employment, family, astrology,
-- partner preferences, residency status, etc.) already exist and are
-- untouched. Everything below is a NEW, nullable, optional column — never
-- required, never blocks an existing flow.
--
-- No monetization/pricing fields from the form are included (explicitly
-- excluded by Aryan).

alter table profiles
  -- Terms & Conditions acceptance (signup gate) — set once, at signup,
  -- when the member ticks the mandatory consent checkbox.
  add column if not exists terms_accepted_at timestamptz,

  -- Seriousness / intent signals (admin prioritization, My Queue tiering)
  add column if not exists marriage_timeline text,          -- 'Within 6 months' | 'Within 1 year' | '1-2 years' | 'Just exploring'
  add column if not exists registration_reason text,        -- why they're registering

  -- Contact & communication preferences (who/how the RM should reach out)
  add column if not exists alternate_phone text,
  add column if not exists preferred_contact_mode text,     -- 'WhatsApp' | 'Call' | 'Both'
  add column if not exists decision_maker text,              -- who takes the final marriage decision
  add column if not exists communicate_with text,            -- who the RM should primarily talk to

  -- Trust / reference (optional, family-friend reference contact)
  add column if not exists reference_contact_name text,
  add column if not exists reference_contact_phone text,

  -- NRI-specific (shown only when country/nationality isn't India)
  add column if not exists willing_to_relocate_to_india text, -- 'Yes' | 'No' | 'Open to discussion'

  -- Verification ops
  add column if not exists open_to_video_verification text,  -- 'Yes' | 'No'

  -- Previously-married disclosure (kept separate from the free-text
  -- partner_notes/about_me so it reads clearly as a disclosure, not a
  -- preference)
  add column if not exists marriage_custody_details text,

  -- Partner preference additions (existing partner_* columns already
  -- cover age/height/income/religion/community/education/location/notes)
  add column if not exists partner_marital_status_preference text,
  add column if not exists partner_complexion_preference text,
  add column if not exists partner_living_arrangement text,   -- post-marriage living: 'With parents' | 'Separate' | 'Flexible'
  add column if not exists partner_lifestyle_preferences text[];

-- NOTE: profiles.id_document_type already exists (added in an earlier
-- migration) but was never wired into any UI — this PR wires it into
-- Edit Profile's Verification section (which government ID the member can
-- provide), reusing the existing column rather than adding a new one.
