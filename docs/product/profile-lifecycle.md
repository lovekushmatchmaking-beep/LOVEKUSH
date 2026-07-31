# Profile Lifecycle Diagram

## Lifecycle

```text
Draft
  ↓
Incomplete
  ↓
Submitted
  ↓
Under Review
  ├─ Needs Changes → Incomplete
  ├─ Blocked
  └─ Approved
        ↓
      Active
        ↓
      Matched
        ↓
      Meeting Scheduled
        ↓
      Married
        ↓
      Archived
```

## Status definitions

### Draft

User has started but not submitted.

### Incomplete

Required sections are missing or admin has requested changes.

### Submitted

User submitted for Lovekush review.

### Under Review

Admin/RM is checking quality, photos, and basic trust signals.

### Needs Changes

Profile cannot be approved until user fixes issues.

### Approved

Profile passed internal review but may not yet be visible.

### Active

Profile can participate in matching workflows.

### Matched

At least one serious match workflow is active.

### Meeting Scheduled

Families have agreed to meet or speak.

### Married

Success outcome confirmed.

### Archived

Profile is no longer active for matching.

## Lifecycle rules

- Only submitted profiles enter review queues.
- Only approved/active profiles appear in matching.
- Blocked profiles are excluded from all matching and sharing.
- Every lifecycle transition should create an audit log.
