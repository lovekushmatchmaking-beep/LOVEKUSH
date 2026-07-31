# CRM Workflow

## CRM purpose

Lovekush is a managed matrimonial service. CRM should help relationship managers operate the business daily.

## Core CRM objects

- Lead
- Customer
- Family
- Profile
- Relationship Manager
- Follow-up Task
- Call Log
- Note
- Verification Item
- Match Suggestion
- Subscription

## Lead to Profile Flow

```text
Lead Created
→ Contact Attempted
→ Interested
→ Registered
→ Draft Profile
→ Submitted
→ Under Review
→ Needs Changes / Approved
→ Active
```

## Daily RM Dashboard

```text
Today
├─ Follow-ups due
├─ Incomplete profiles
├─ Profiles needing family info
├─ Profiles needing photos
├─ Pending interest responses
├─ Meetings to confirm
└─ Renewal reminders
```

## Profile Review Queue

```text
Submitted profiles
→ Check required fields
→ Check photos
→ Check verification basics
→ Check duplicate risk
→ Approve / Needs Changes / Block
```

## Notes and timeline

Every profile should have a timeline:

```text
Profile created
Draft updated
Photo uploaded
Profile submitted
Admin reviewed
Needs changes sent
Approved
Match suggested
Interest sent
Meeting scheduled
Feedback received
```

## RM principles

- RM should never depend on memory.
- Every conversation should become a note/call log.
- Every next action should become a follow-up task.
- Customer lifecycle should be visible at a glance.
