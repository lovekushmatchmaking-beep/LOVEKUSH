# Screen Flow Diagrams

## Phase 1A Customer Onboarding Flow

```text
/register
  ↓
/setup/welcome
  ↓
/onboarding
  ↓
/onboarding/basic
  ↓ autosave
/onboarding/background
  ↓ autosave
/onboarding/education-career
  ↓ autosave
/onboarding/family
  ↓ autosave
/onboarding/lifestyle
  ↓ autosave
/onboarding/preferences
  ↓ autosave
/onboarding/photos
  ↓ autosave
/onboarding/verification
  ↓
/onboarding/preview
  ↓
/onboarding/submitted
  ↓
/dashboard
```

## Resume Flow

```text
/login
  ↓
if no profile: /setup/welcome
if draft profile: /onboarding
if submitted profile: /dashboard/review-status
if active profile: /dashboard
```

## Section-Based Editing Flow

```text
/dashboard/profile
  ↓
/edit-profile
  ├─ /edit-profile/basic
  ├─ /edit-profile/background
  ├─ /edit-profile/education-career
  ├─ /edit-profile/family
  ├─ /edit-profile/lifestyle
  ├─ /edit-profile/preferences
  ├─ /edit-profile/photos
  └─ /edit-profile/verification
```

## Minimal Admin Flow

```text
/admin/login
  ↓
/admin
  ↓
/admin/review-queue
  ↓
/admin/profiles/:id
  ├─ approve
  ├─ needs changes
  ├─ block
  └─ audit log
```

## Screen Design Rules

- One primary CTA per screen
- Save state visible on onboarding screens
- Never show irreversible actions without confirmation
- Explain sensitive data usage before asking for it
- Keep mobile width and thumb-friendly bottom action area
