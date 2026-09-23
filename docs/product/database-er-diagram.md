# Database ER Diagram

This is the target data model direction. Phase 1 should implement only the smallest subset required for guided onboarding, draft save, roles, RLS, audit logs, and profile lifecycle.

## Phase 1 Core ERD

```text
auth.users
  │
  ├── profiles
  │     ├── profile_completion_sections
  │     ├── photos
  │     └── audit_logs
  │
  └── staff_users
        └── audit_logs
```

## Phase 1 Tables

### profiles

```text
id uuid pk
user_id uuid fk auth.users.id
profile_code text unique
profile_status text
onboarding_step text
profile_completeness int
full_name text
age int
gender text
date_of_birth date
city text
state text
country text
religion text
community text
community_privacy text        -- 3-tier: Public / Matches Only / Private, default 'Matches Only'
islamic_denomination text     -- religion === 'Muslim' only (Sunni/Shia/etc.)
islamic_school_of_thought text -- Sunni Madhab (Hanafi/Shafi/Maliki/Hanbali)
islamic_shia_branch text      -- Shia branch (Ithna Ashari/Ismaili/Zaydi/etc.)
islamic_sub_caste_division text -- optional 3rd tier below Community (e.g. Sheikh -> Farooqui/Hashmi)
christian_denomination text   -- religion === 'Christian' only (Catholic/Orthodox/Protestant/etc. groups)
religion_denomination text    -- generic Denomination/Tradition field for Jain/Sikh/Buddhist/Zoroastrian/Jewish/Shinto/Taoist
religion_denomination_2 text  -- Zoroastrian's second field only (Religious Calendar)
custom_caste_text text        -- free-text "Others / Not in list" entry for community/caste
mother_tongue text
height text
marital_status text
education text
degree text                   -- specific qualification (B.Tech/MBBS/LLB/etc.), grouped dropdown in DEGREE_OPTIONS
degree_other text              -- free-text "Others / Not in list" entry for degree
college_name text              -- free-text, own field separate from college_privacy (who can see it)
field_of_study text            -- legacy, kept for backward compat, no longer shown in UI
specialization text            -- legacy, kept for backward compat, no longer shown in UI
occupation text
designation text               -- legacy, kept for backward compat, no longer shown in UI (was a free-text duplicate of Occupation/Working As)
industry text                  -- legacy, kept for backward compat, no longer shown in UI (was a duplicate of Profession Category)
working_with text              -- legacy, kept for backward compat, no longer shown in UI (was a duplicate of Employment Type)
employer text
annual_income text
annual_income_currency text    -- 'INR' | 'USD', default 'INR' -- swaps which range list Annual Income shows
income_privacy text           -- 3-tier: Public / Matches Only / Private, default 'Private'
company_privacy text          -- 3-tier: Public / Matches Only / Private, default 'Matches Only'
college_privacy text          -- 3-tier: Public / Matches Only / Private, default 'Matches Only'
contact_privacy text          -- 3-tier: Public / Matches Only / Private, default 'Matches Only'
diet text
smoking text
drinking text
hobbies text
about_me text
family_type text
family_values text
father_profession text         -- dropdown (PROFESSION_CATEGORIES + Retired/Other/Passed Away); when 'Other', the free-text UI value is resolved into this same column before save
father_profession_other text   -- present but unused by the app (the UI's "Other" free-text is stripped and resolved into father_profession before save, same pattern as community_other/gotra_other)
mother_profession text         -- dropdown (Homemaker + PROFESSION_CATEGORIES + Retired/Other/Passed Away); when 'Other', the free-text UI value is resolved into this same column before save
mother_profession_other text   -- present but unused by the app (see father_profession_other)
siblings text                  -- legacy free-text, kept for backward compat, no longer shown in UI
brothers_count int             -- 0-10, clamped client-side
brothers_married_count int     -- clamped to <= brothers_count
sisters_count int              -- 0-10, clamped client-side
sisters_married_count int      -- clamped to <= sisters_count
property_type text            -- structured, replaces old property_details UI (column kept for backward compat)
property_ownership text
property_city text
property_state text
property_country text
property_size text
property_privacy text         -- 3-tier: Public / Matches Only / Private, default 'Matches Only'
vehicle_ownership text        -- structured, replaces old vehicle_details UI (column kept for backward compat)
vehicle_model text            -- optional free-text model name (e.g. "Hyundai Creta")
business_asset_type text
business_detail text
business_privacy text         -- 3-tier: Public / Matches Only / Private, default 'Private'
family_city text
family_income_currency text    -- 'INR' | 'USD', default 'INR' -- swaps which range list Family Income Range shows
languages_spoken text[]        -- multi-select, same list as mother_tongue (LANGUAGES_SPOKEN alias of MOTHER_TONGUES)
have_children text             -- 'No' | 'Yes' | 'Prefer not to say'
children_living_with text      -- 'Me' | 'Ex-Spouse' | 'Jointly' | 'Other', only shown/relevant when have_children = 'Yes'
grew_up_in text                -- 'Metro City' | 'Urban / City' | 'Semi-Urban / Town' | 'Rural / Village' | 'Abroad'
partner_age_min int
partner_age_max int
partner_height_min int         -- total inches (53-84, same 4'5"-7'0" range as HEIGHT_OPTIONS_DETAILED); matching.js hard filter (symmetric, both sides)
partner_height_max int
partner_income_min int         -- currency-scaled per partner_income_currency; informational only, not a matching.js hard filter
partner_income_max int
partner_income_currency text   -- 'INR' | 'USD', default 'INR'
partner_city_preference text   -- free text
partner_state_preference text  -- free text
partner_country_preference text -- dropdown, COUNTRIES list (+ 'Open to All'), default 'Open to All'
partner_religion text
partner_community_ids text[]  -- multi-select; may include 'Any Community / No Bar' flag (skips community filtering in matching.js)
partner_location text          -- broad category (Same city/state/Anywhere in My Country/Global); distinct from the granular partner_city/state_preference above
partner_education text          -- legacy single-select, kept for backward compat, no longer shown in UI
partner_degree_preferences text[]              -- legacy, kept for backward compat, no longer shown in UI (removed for bad chip-list UX with the full DEGREE_OPTIONS list)
partner_education_level_preferences text[]     -- multi-select, EDUCATIONS values; empty = no preference
partner_notes text
is_premium boolean            -- default false; manual admin-set flag (no real payment system yet), drives "premium look" UI (blurred photo, locked company/college) in matches list
hidden_until timestamptz      -- set 15 days out when user hides their profile; profiles_public_view excludes rows where this is in the future
submitted_at timestamptz
reviewed_at timestamptz
reviewed_by uuid
review_notes text
created_at timestamptz
updated_at timestamptz
```

### profiles_public_view

Read-only view over `profiles`, `where profile_status = 'active' and (hidden_until is null or hidden_until < now())`. Used for browsing/matching other members — excludes sensitive columns (contact info, income privacy-gated fields, family/asset details) by only selecting a fixed safe column list. Includes `about_me`, `employer`, `college_name` (added for the match-card "About"/premium-look features) alongside the core biodata fields.

### profile_completion_sections

```text
id uuid pk
profile_id uuid fk profiles.id
section_key text
completion_percent int
is_required boolean
is_complete boolean
updated_at timestamptz
```

### staff_users

```text
id uuid pk
user_id uuid fk auth.users.id
role text
active boolean
created_at timestamptz
updated_at timestamptz
```

### audit_logs

```text
id uuid pk
actor_user_id uuid
actor_role text
action text
entity_type text
entity_id uuid
metadata jsonb
created_at timestamptz
```

### caste_suggestions

```text
id uuid pk
religion text
denomination text
suggested_name text
field_type text        -- 'caste' | 'denomination' | 'community' | 'gotra'
submitted_by_profile_id uuid fk profiles.id
times_suggested int
status text             -- default 'pending' -> 'approved' / 'rejected'
admin_notes text
created_at timestamptz
updated_at timestamptz
unique(religion, suggested_name)
```
"Others / Not in list" entries (community/caste/gotra) captured here for
admin review — see Admin panel's "Caste Suggestions" section. Increment
on duplicate handled by the `upsert_caste_suggestion` Postgres function
(atomic insert-or-increment), not client-side RLS.

## Future ERD

```text
profiles
├─ profile_religion_details
├─ profile_education_career
├─ profile_lifestyle
├─ profile_family_background
├─ profile_preferences
├─ verification_checks
├─ documents
├─ photos
├─ privacy_settings
├─ profile_share_links
├─ match_scores
├─ match_explanations
├─ interests
├─ meetings
└─ feedback

families
├─ family_members
├─ family_contacts
└─ relationship_manager_assignments

crm
├─ leads
├─ call_logs
├─ follow_up_tasks
├─ crm_notes
└─ status_history

business
├─ plans
├─ subscriptions
├─ payments
├─ invoices
└─ renewals
```

## Data principle

Phase 1 may keep profile fields flat for speed, but every schema choice must allow later normalization into master tables without data loss.
