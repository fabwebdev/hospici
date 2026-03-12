# RUNBOOK.md — Hospici Operations Runbook

> **Audience:** On-call engineers, DevOps, and Site Reliability
> **Classification:** Internal — Confidential
> **Version:** 2.0 | **Date:** 2026-03-11

---

## On-Call Escalation

| Severity | Response Time | Escalation |
|----------|--------------|-----------|
| P0 — Production down | 15 minutes | On-call engineer → Lead → CTO |
| P1 — Billing system impaired | 30 minutes | On-call engineer → Billing lead |
| P2 — Feature degraded | 2 hours | On-call engineer |
| P3 — Non-urgent | Next business day | Ticket queue |

---

## Health Checks

```bash
# Application
curl https://api.hospici.com/health
# Expected: {"status":"ok","version":"x.x.x","fhir":"4.0","db":"connected","valkey":"connected"}

# Database
psql $DATABASE_URL -c "SELECT 1;"

# Valkey
redis-cli -h $VALKEY_HOST -p 6379 -a $VALKEY_PASSWORD PING
# Expected: PONG

# Verify RedisJSON module
redis-cli MODULE LIST | grep ReJSON
```

---

## Valkey Failover Procedures

### Scenario: Single Valkey Node Failure (Cluster Mode)

1. Cluster auto-elects a new primary (< 5 seconds)
2. Verify: `redis-cli CLUSTER INFO | grep cluster_state`
3. If `cluster_state: fail` persists after 60 seconds, proceed to manual failover

```bash
# Manual cluster failover
redis-cli -h $FAILING_NODE_HOST -p 6379 CLUSTER FAILOVER

# Verify cluster health
redis-cli CLUSTER INFO
redis-cli CLUSTER NODES
```

### Scenario: Total Valkey Cluster Loss

This triggers the `storage/framework/sessions/` fallback path (file-based sessions). Performance will degrade but the application remains operational.

```bash
# 1. Spin up replacement Valkey cluster
docker compose -f docker/valkey/docker-compose-recovery.yml up -d

# 2. Wait for RedisJSON and RedisSearch modules to load
redis-cli MODULE LIST

# 3. Restart application (forces iovalkey reconnect)
pm2 restart hospici-api
# or: kubectl rollout restart deployment/hospici-api

# 4. Verify BullMQ queues reattach
curl https://api.hospici.com/admin/queue-health
```

### Scenario: BullMQ Dead Letter Queue Alert

When ops receives a DLQ alert (`{queue-name}-dlq` received a job):

```bash
# 1. Inspect DLQ contents
redis-cli LRANGE bull:claim-processing-dlq:failed 0 -1

# 2. View failed job details (use Bull Board UI or CLI)
# https://api.hospici.com/admin/queues (requires admin role)

# 3. After fixing underlying issue, requeue
curl -X POST https://api.hospici.com/admin/queues/claim-processing-dlq/{jobId}/requeue \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 4. Document the incident in incident-log.md
```

---

## PostgreSQL Procedures

### Scenario: Primary Database Failure

```bash
# 1. Check replica lag
psql $REPLICA_DATABASE_URL -c "SELECT now() - pg_last_xact_replay_timestamp() AS lag;"

# 2. Promote replica to primary
pg_ctl promote -D /var/lib/postgresql/data

# 3. Update DATABASE_URL in secrets manager to point to promoted replica
aws secretsmanager update-secret --secret-id hospici/prod/database-url \
  --secret-string "postgresql://hospici:$PASS@$NEW_PRIMARY:5432/hospici_prod"

# 4. Restart application with new connection
pm2 restart hospici-api

# 5. Spin up new replica from the promoted primary
pg_basebackup -h $NEW_PRIMARY -U replication -D /var/lib/postgresql/replica -Fp -Xs -P -R
```

### Point-in-Time Recovery (PITR)

```bash
# 1. Identify recovery target time (UTC)
# e.g., 2026-03-11T14:30:00Z

# 2. Create recovery instance from base backup + WAL
pg_restore \
  --target-time="2026-03-11 14:30:00 UTC" \
  --recovery-target-action=promote \
  -D /var/lib/postgresql/recovery \
  /backup/latest/base.tar.gz

# 3. Apply WAL segments from S3
# (configured via restore_command in postgresql.conf)

# 4. Verify data integrity before promoting
psql $RECOVERY_URL -c "SELECT count(*) FROM patients;"
psql $RECOVERY_URL -c "SELECT count(*) FROM audit_logs;"

# 5. Switch application traffic ONLY after clinical lead sign-off
```

### RLS Context Debugging

If queries return empty results unexpectedly:

```sql
-- Check current RLS context
SHOW app.current_user_id;
SHOW app.current_location_id;
SHOW app.current_role;

-- If empty, the preHandler hook is not setting context
-- Check: is the request authenticated? Is the session valid in Valkey?

-- Temporarily disable RLS for debugging (NEVER in production without approval)
SET row_security = off;
SELECT count(*) FROM patients;  -- If results appear, RLS context is the issue
SET row_security = on;
```

---

## Migration Emergency Procedures

### Rolling Back a Failed Migration

```bash
# 1. Stop application traffic
kubectl scale deployment hospici-api --replicas=0

# 2. Take database backup
pg_dump $DATABASE_URL > backup_pre_rollback_$(date +%Y%m%d_%H%M%S).sql

# 3. Apply down migration
psql $DATABASE_URL < database/migrations/drizzle/XXXX_feature_name_down.sql

# 4. Verify schema integrity
npm run db:check-tables

# 5. Restart application
kubectl scale deployment hospici-api --replicas=3

# 6. Verify health check passes
curl https://api.hospici.com/health
```

---

## CMS Compliance Incident Procedures

### Scenario: NOE Deadline Missed (Billing Critical)

```bash
# 1. Identify affected NOEs
psql $DATABASE_URL -c "
  SELECT id, patient_id, election_date, filing_deadline, status
  FROM notice_of_election
  WHERE status = 'draft'
  AND filing_deadline < NOW()
  ORDER BY filing_deadline ASC;
"

# 2. Notify billing team immediately (P1)

# 3. Document with late filing reason (required for CMS)
# Billing team must file corrected NOE with justification

# 4. Check if NOE deadline alert job is running
redis-cli LLEN bull:noe-deadline-check:wait
```

### Scenario: Cap Year Boundary Alert (Nov 1)

The cap recalculation job runs on November 2. If it fails:

```bash
# Check DLQ
redis-cli LRANGE bull:cap-dlq:failed 0 -1

# Manually trigger cap recalculation for affected hospice
curl -X POST https://api.hospici.com/admin/jobs/cap-recalculation \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"hospiceId": "{id}", "capYear": 2026}'
```

---

## Audit Log Integrity Check

Run monthly or after any security incident:

```bash
# Verify audit log continuity (no gaps in append-only table)
psql $DATABASE_URL -c "
  SELECT
    date_trunc('day', timestamp) AS day,
    count(*) AS entries,
    min(timestamp) AS first,
    max(timestamp) AS last
  FROM audit_logs
  WHERE timestamp > NOW() - INTERVAL '30 days'
  GROUP BY 1
  ORDER BY 1 DESC;
"

# Check for any UPDATE or DELETE on audit_logs (should always be zero)
psql $DATABASE_URL -c "
  SELECT count(*) FROM pg_stat_activity
  WHERE query ILIKE '%UPDATE%audit_logs%'
  OR query ILIKE '%DELETE%audit_logs%';
"
```

---

## Monitoring & Alerts

| Alert | Threshold | Response |
|-------|-----------|---------|
| Valkey memory > 80% | Immediate | Scale cluster or evict non-critical keys |
| DLQ receives job | Immediate | Follow DLQ runbook above |
| NOE within 24h of deadline, status=draft | Immediate | Notify billing team |
| Cap utilization > 80% | Daily digest | Notify billing lead |
| Aide supervision overdue by 1 day | Immediate | Notify clinical supervisor |
| Failed login attempts > 10/min | Immediate | Review IPs, consider block |
| Break-glass access | Within 5 min | Notify supervisor for review |
| Audit log insert rate drop > 50% | Immediate | Investigate middleware |

---

_RUNBOOK.md v2.0 — Hospici Operations Runbook_
