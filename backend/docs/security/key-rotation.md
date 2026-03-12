# Key Rotation — Hospici

> Managed by Security Lead (Petra). Review annually or after any suspected compromise.

## PHI Encryption Keys

| Key | Variable | Rotation Schedule | Last Rotated | Procedure |
|-----|----------|------------------|--------------|-----------|
| PHI encryption key | `PHI_ENCRYPTION_KEY` | Annually | — | See §1 below |
| PHI encryption IV | `PHI_ENCRYPTION_IV` | With key | — | See §1 below |
| Better Auth secret | `BETTER_AUTH_SECRET` | Annually or on breach | — | See §2 below |

## §1 PHI Key Rotation

1. Generate new key: `openssl rand -hex 32`
2. Generate new IV: `openssl rand -hex 16`
3. Deploy in re-encryption mode: old key decrypts, new key re-encrypts, transaction-wrapped
4. Verify all PHI fields decrypt correctly in staging
5. Update production secrets (never commit to git)
6. Update this table with rotation date

## §2 Better Auth Secret Rotation

1. Generate: `openssl rand -base64 32`
2. Deploy new secret — all existing sessions will be invalidated (users re-login)
3. Schedule during low-traffic window
4. Update this table with rotation date
