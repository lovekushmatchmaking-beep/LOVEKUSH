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
community_privacy text        -- default 'Members Only'
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
field_of_study text
occupation text
employer text
annual_income text
diet text
smoking text
drinking text
hobbies text
about_me text
family_type text
family_values text
father_profession text
mother_profession text
siblings text
property_type text            -- structured, replaces old property_details UI (column kept for backward compat)
property_ownership text
property_city text
property_state text
property_country text
property_size text
property_privacy text         -- default 'Members Only'
vehicle_ownership text        -- structured, replaces old vehicle_details UI (column kept for backward compat)
vehicle_model text            -- optional free-text model name (e.g. "Hyundai Creta")
business_asset_type text
business_detail text
business_privacy text         -- default 'Hidden'
family_city text
partner_age_min int
partner_age_max int
partner_religion text
partner_location text
partner_education text
partner_notes text
submitted_at timestamptz
reviewed_at timestamptz
reviewed_by uuid
review_notes text
created_at timestamptz
updated_at timestamptz
```

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
