# Information Architecture

## Customer App

```text
Public
├─ Landing
├─ Register
└─ Login

Onboarding
├─ Welcome Setup
├─ Profile Setup Home
├─ Basic Details
├─ Religion & Community
├─ Education & Career
├─ Family Background
├─ Lifestyle
├─ Partner Preferences
├─ Photos
├─ Verification Basics
├─ Profile Preview
└─ Submit for Review

Customer Dashboard
├─ Home
├─ Profile
│  ├─ Public Preview
│  ├─ Edit Sections
│  └─ Completion Checklist
├─ Photos
├─ Review Status
├─ Help
└─ Later: Matches, Shortlist, Interests, Sharing
```

## Admin CRM

```text
Admin
├─ Staff Login
├─ Dashboard
├─ Profile Review Queue
├─ Verification Queue
├─ Incomplete Profiles
├─ Customer Profile Detail
│  ├─ Timeline
│  ├─ Notes
│  ├─ Calls
│  ├─ Follow-ups
│  ├─ Documents
│  ├─ Photos
│  └─ Matches
├─ Relationship Manager Workspace
├─ Manual Match Suggestions
├─ Premium Management
├─ Analytics
└─ Audit Logs
```

## AI Layer

```text
AI Workbench
├─ Biodata Extraction
├─ Missing Information Detection
├─ Profile Quality Score
├─ AI Summary
├─ Duplicate Detection
├─ Risk Detection
├─ Match Score Explanation
└─ Human Review Queue
```

## Business Layer

```text
Business
├─ Lead Funnel
├─ Subscriptions
├─ Payments
├─ Renewals
├─ Referrals
├─ Revenue Reports
└─ Conversion Analytics
```

## Navigation principle

Do not show all modules to every user. Navigation must change by lifecycle stage:

- Draft users see onboarding and checklist.
- Submitted users see review status.
- Active users see matches, shortlist, and sharing.
- Staff users see queues and assigned customers.
