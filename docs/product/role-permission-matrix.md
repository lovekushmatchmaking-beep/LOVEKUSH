# Role & Permission Matrix

## Roles

- Customer
- Admin
- Relationship Manager
- Verifier
- AI Reviewer
- Super Admin

## Matrix

| Capability | Customer | RM | Verifier | Admin | Super Admin |
|---|---:|---:|---:|---:|---:|
| Create own draft profile | Yes | No | No | No | No |
| Edit own draft profile | Yes | No | No | No | No |
| Submit own profile | Yes | No | No | No | No |
| View own review status | Yes | No | No | No | No |
| View assigned customer profiles | No | Yes | Limited | Yes | Yes |
| View verification documents | No | No | Yes | Yes | Yes |
| Approve profile | No | No | No | Yes | Yes |
| Mark needs changes | No | Yes | Yes | Yes | Yes |
| Block profile | No | No | No | Yes | Yes |
| Create call logs | No | Yes | No | Yes | Yes |
| Create follow-ups | No | Yes | No | Yes | Yes |
| View audit logs | No | No | No | Yes | Yes |
| Manage staff | No | No | No | No | Yes |
| Manage billing | No | No | No | Yes | Yes |

## Permission principles

- Staff permissions should be role-based, not route-based only.
- Customer data access must be enforced by RLS, not just frontend checks.
- Verification documents require stricter access than normal profile fields.
- Every sensitive staff action should create an audit log.
