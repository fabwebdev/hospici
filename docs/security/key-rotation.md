# Key Rotation Schedule — Hospici EHR

> **Classification:** Internal — Confidential
> **Owner:** Security Lead
> **Last Updated:** 2026-03-13

---

## Rotation Schedule

| Key | Purpose | Rotation Interval | Storage | Responsible Party |
|-----|---------|-------------------|---------|-------------------|
| `PHI_ENCRYPTION_KEY` | pgcrypto AES-256 PHI encryption | 90 days | AWS Secrets Manager / Vault | Security Lead |
| `BETTER_AUTH_SECRET` | Session cookie signing (HMAC) | 180 days | AWS Secrets Manager / Vault | Security Lead |
| SMART on FHIR JWKS private key | FHIR API auth (RS256) | 90 days | AWS Secrets Manager / Vault | Security Lead |
| `VALKEY_PASSWORD` | Cache auth (requirepass) | 180 days | AWS Secrets Manager / Vault | DevOps |
| Clearinghouse API credentials | 837I/835 EDI submission | On compromise or 1 year | AWS Secrets Manager | Billing Manager |
| Backup encryption key | Database backup decryption | 180 days | Offline secure storage | DevOps |

---

## `PHI_ENCRYPTION_KEY` — 90-Day Rotation Procedure

1. **Generate new key:** `openssl rand -base64 32`
2. **Store in secrets manager** under a versioned name, e.g. `hospici/phi-key-v2`
3. **Re-encrypt all PHI columns:**
   Run the re-encryption migration script:
   ```sql
   UPDATE patients SET
     first_name = pgp_sym_encrypt(
       pgp_sym_decrypt(first_name::bytea, $$OLD_KEY$$), $$NEW_KEY$$
     ),
     -- repeat for all PHI columns
   WHERE true;
   ```
4. **Update environment variable** in all deployment targets
5. **Restart application servers** in rolling fashion (zero downtime)
6. **Verify** via `GET /api/v1/health/phi-encryption` (127.0.0.1 only)
7. **Revoke old key** from secrets manager
8. **Log rotation** in vendor-governance system and audit log

> WARNING: Never rotate PHI_ENCRYPTION_KEY without first completing the re-encryption step. Data becomes unreadable if the key changes without re-encryption.

---

## `BETTER_AUTH_SECRET` — 180-Day Rotation Procedure

1. Generate: `openssl rand -base64 64`
2. Update secrets manager
3. Rolling restart (all existing sessions invalidated — users must log in again)
4. Notify users in advance if possible

---

## SMART JWKS Private Key — 90-Day Rotation

1. Generate new RSA-2048 key pair: `openssl genrsa -out jwks-private.pem 2048`
2. Update `/.well-known/jwks.json` to include **both** old and new public keys (grace period)
3. Update signing key in application config
4. After 24 hours (token TTL grace), remove old public key from JWKS
5. Revoke old private key

---

## Emergency Key Compromise Procedure

See `docs/security/incident-response.md` — Section 4: Credential Compromise.

Immediate actions:
1. Rotate affected key immediately
2. Invalidate all active sessions
3. Review audit logs for unauthorized access in 90-day window
4. Notify security lead and compliance officer within 1 hour
