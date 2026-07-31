# Technical Roadmap

## Phase 1A: Guided Onboarding

### Objective

Improve user conversion and profile quality.

### Implementation modules

1. Onboarding shell
2. Profile setup checklist
3. Draft save and resume
4. Section-based forms
5. Profile preview
6. Section-based edit profile
7. Mobile UX polish

### Success metrics

- Draft-to-submitted conversion
- Time to first draft save
- Section completion rate
- Mobile completion rate

## Phase 1B: Essential Security Foundation

### Objective

Support onboarding/admin safely without large backend redesign.

### Implementation modules

1. Staff users and roles
2. Admin auth
3. RLS foundation
4. Audit logs
5. Profile lifecycle statuses

## Phase 2: Profile Quality, Privacy, Verification, Photos

### Objective

Improve trust and data quality.

### Implementation modules

1. Profile quality scoring
2. Privacy settings
3. Verification basics
4. Photo categories and moderation
5. Private storage plan
6. Profile lifecycle queues

## Phase 3: CRM and Relationship Managers

### Objective

Operate Lovekush like a managed matchmaking business.

### Implementation modules

1. Review queues
2. RM dashboard
3. Follow-up tasks
4. Call logs
5. Notes
6. Manual match suggestions

## Phase 4: AI and Matching Engine

### Objective

Assist humans with quality, recommendations, and explanations.

### Implementation modules

1. Missing info AI
2. Biodata parser
3. Profile summary
4. Match scoring
5. Match explanations
6. Duplicate/risk detection

## Phase 5: Sharing, Monetization, Analytics

### Objective

Support business growth and secure profile sharing.

### Implementation modules

1. Secure share cards
2. PDF biodata
3. Watermarked exports
4. Short links and QR codes
5. Plans/subscriptions/payments
6. Business analytics

## Engineering principles

- Small commits
- Feature-by-feature PRs
- No large rewrite without business reason
- Reuse existing code where safe
- Protect user privacy before public sharing
- Validate RLS before exposing admin/customer data
