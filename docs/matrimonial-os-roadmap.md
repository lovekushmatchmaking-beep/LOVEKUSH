# Lovekush Matrimonial Operating System Roadmap

Lovekush is not intended to be a swipe-based dating product. The product direction is an AI-assisted matrimonial operating system for managing the complete marriage journey with strong privacy, CRM discipline, family context, and consultant workflows.

## Product principles

1. Families should feel guided, not overwhelmed.
2. Every important data point should become structured and searchable over time.
3. Sensitive information must be private by default and revealed only through consent-based workflows.
4. AI should assist relationship managers and families, not replace human judgement.
5. The system should support the full journey from lead to marriage confirmation and archive.

## Operating journey

```text
Lead
→ Registration
→ Verification
→ Profile Completion
→ Profile Quality Review
→ Data Normalization
→ Duplicate Detection
→ Privacy Controls
→ Matching
→ Consultant Review
→ Family Discussion
→ Interest Sharing
→ Meeting
→ Feedback
→ Negotiation
→ Marriage Confirmation
→ Success Story
→ Archive
```

## Near-term foundation

- Move configuration and secrets out of hardcoded application code.
- Version database schema and Supabase policies in the repository.
- Replace frontend-only admin access with authenticated staff roles.
- Add audit logs for admin, consultant, privacy, matching, and profile actions.
- Convert repeated frontend lists into centralized master data modules first, then database master tables.
- Make photo and document access private-by-default with controlled reveal workflows.

## Core modules

### Customer profile

- Personal details
- Religion/community/caste/gotra
- Education and career
- Lifestyle
- Family background
- Partner preferences
- Photos
- Documents
- Consent and privacy settings

### CRM

- Leads
- Customers
- Family contacts
- Relationship manager assignment
- Notes
- Follow-ups
- Call history
- Meetings
- Status pipeline

### Matching intelligence

- Hard filters
- Weighted scoring
- Dealbreakers
- Family compatibility
- Lifestyle compatibility
- Location flexibility
- Consultant shortlisting
- AI match explanation
- Feedback learning loop

### Privacy and trust

- Masked profiles
- Photo access control
- Document verification
- Contact reveal requests
- Consent logs
- Data correction/deletion requests
- Internal access audit trail

### AI assistance

- Biodata extraction
- Missing information detection
- Profile cleanup and normalization
- Profile quality scoring
- Match explanations
- Consultant summary generation
- Risk and inconsistency detection

## Recommended implementation phases

1. Foundation and security
2. Parent-friendly onboarding
3. CRM backbone
4. Matching engine v1
5. AI-assisted profile intelligence
6. Subscriptions, payments, and analytics
