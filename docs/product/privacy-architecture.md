# Privacy Architecture

## Privacy principles

1. Contact details are hidden by default.
2. Photos are private by default in the long-term architecture.
3. Sensitive documents are never public.
4. Public/share views should be masked.
5. Every access to sensitive data should be auditable.
6. Consent should be explicit, purpose-based, and revocable.

## Sensitive fields

- Phone
- WhatsApp
- Email
- Exact address
- Company name when sensitive
- Documents
- Verification photos
- Original photos
- Family contact details
- Internal notes

## Public profile masking

Example public view:

```text
A*** K***
28 years
Delhi
Hindu
Graduate
Software Professional
Contact hidden
Photos protected
```

## Storage privacy

### Phase 1

- Continue current photo flow if required for speed.
- Add metadata and policy plan for private storage migration.

### Phase 2

- Move original photos to private bucket.
- Generate thumbnails.
- Use signed URLs.
- Add blurred preview support.
- Add photo access logs.

## Consent records

Future `consents` table:

```text
id
user_id
consent_type
purpose
status
granted_at
withdrawn_at
metadata
```

## DPDP-aware flows

- Privacy notice before sensitive data collection
- Purpose explanation near each sensitive field
- Data correction request
- Data deletion request
- Export request
- Internal access audit
- Revocable profile sharing

## Sharing rules

- No phone/email/address in shared biodata by default
- Share links expire
- Exports are watermarked
- Export events are logged
- Contact unlock requires approval/consent workflow
