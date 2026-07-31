# Future WhatsApp Integration Plan

WhatsApp is not part of Phase 1 implementation, but architecture should allow it later.

## Future use cases

- Draft profile reminders
- Missing information reminders
- Photo/document requests
- Profile review updates
- Interest request updates
- Meeting reminders
- Follow-up summaries
- Relationship manager communication
- Secure profile share link delivery

## Event-driven design

Design internal events now so WhatsApp can subscribe later:

```text
profile.draft_started
profile.section_completed
profile.missing_fields_detected
profile.submitted
profile.needs_changes
profile.approved
match.suggested
interest.sent
meeting.scheduled
renewal.due
```

## Future tables

```text
notification_events
notification_templates
message_delivery_logs
whatsapp_conversations
```

## Privacy rules

- Do not send sensitive profile details directly in WhatsApp unless explicitly approved.
- Prefer secure links over raw data.
- Log all outbound messages.
- Respect opt-out and consent.
