# BAA Registry — Hospici

> **Required reading before any third-party integration.**
> Every vendor that may access, store, or transmit PHI must have a signed BAA on file before going to production.

| Vendor | Service | BAA Status | Signed Date | Renewal Date | Contact |
|--------|---------|-----------|-------------|--------------|---------|
| Valkey (prod hosting) | Cache / Queue | ⚠️ Required before production | — | — | ops@hospici.com |
| DoseSpot | eRx | ⚠️ Required before eRx launch | — | — | compliance@hospici.com |
| SMTP provider (prod) | Email notifications | ⚠️ Required before email launch | — | — | compliance@hospici.com |
| CHAP / Press Ganey | CAHPS surveys | ⚠️ Required before survey launch | — | — | compliance@hospici.com |

## Adding a New Vendor

1. Confirm the vendor offers a HIPAA BAA
2. Obtain and sign the BAA
3. Add a row to this table with the signed date and renewal date
4. Notify the security lead (Petra / compliance@hospici.com)
5. Add the vendor to your deployment runbook

## Vendors Confirmed BAA-Not-Required (Development Only)

| Vendor | Reason |
|--------|--------|
| MailHog (local SMTP) | Dev only — no PHI touches it |
| GitHub (source control) | No PHI in source — enforced by `.gitignore` and PHI redaction rules |
