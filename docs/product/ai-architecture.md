# AI Architecture

## AI philosophy

AI assists relationship managers and families. AI does not make final marriage decisions and does not replace human review.

## AI modules

### Profile Quality Assistant

- Detect missing fields
- Suggest improvements
- Score profile strength
- Identify unclear descriptions

### Biodata Extraction

- Upload PDF/image
- Extract structured profile data
- Human confirms before saving

### AI Summary

- Generate short profile intro
- Generate family-friendly summary
- Human/customer approves text before publishing

### Duplicate Detection

- Compare names, DOB, phone, email, city, photos, and text similarity
- Flag possible duplicates for admin

### Risk Detection

- Inconsistent age/DOB
- Suspicious profile claims
- Poor photo quality
- Missing important family/contact details

### Match Explanation

- Explain why two profiles are compatible
- Separate strengths and watch points
- RM can approve/edit explanation

## AI workflow pattern

```text
Input data
→ AI job queued
→ AI output generated
→ human review required for sensitive output
→ approved output stored
→ user/admin sees result
→ audit log created
```

## AI tables

```text
ai_jobs
ai_outputs
ai_prompt_versions
ai_review_decisions
```

## Guardrails

- Never expose hidden contact details in AI output
- Never generate caste/community claims not present in data
- Never make deterministic marriage guarantees
- Mark AI suggestions as assistance, not truth
- Keep prompt versions auditable
