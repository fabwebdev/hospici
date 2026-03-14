# Drizzle Deep Analysis

Four analysis areas run on every review. Each produces findings with severity and fix guidance.

---

## 1. N+1 Query Detection

### What to look for
Any loop (for, forEach, map, Promise.all over array) that contains a Drizzle query inside it,
where the query could be replaced with a single batched query.

### Patterns to flag

```typescript
// 🔴 CRITICAL N+1 — query inside patient loop
for (const patient of patients) {
  const visits = await db.select().from(visits).where(eq(visits.patientId, patient.id))
}

// 🔴 CRITICAL N+1 — Promise.all still executes N queries
const results = await Promise.all(
  patients.map(p => db.select().from(episodes).where(eq(episodes.patientId, p.id)))
)

// 🟡 WARNING — conditional query inside loop (may not always fire but still risky)
for (const ep of episodes) {
  if (ep.requiresMedication) {
    const meds = await db.query.medications.findMany(...)
  }
}
```

### Correct patterns

```typescript
// Use inArray for batch fetching
const patientIds = patients.map(p => p.id)
const allVisits = await db.select().from(visits).where(inArray(visits.patientId, patientIds))

// Use Drizzle relational queries with nested includes
const patientsWithEpisodes = await db.query.patients.findMany({
  with: { episodes: { with: { visits: true } } },
  where: eq(patients.organizationId, orgId)
})
```

### Clinical tables to watch (highest risk)
`patients`, `episodes`, `visits`, `medications`, `care_plans`, `diagnoses`,
`symptoms`, `bereavement_contacts`, `attending_physicians`, `claims`

---

## 2. Missing Index Analysis

### What to check in Drizzle schema files (`db/schema/*.ts`)

For every foreign key column, verify a corresponding index exists:

```typescript
// 🟡 WARNING — FK without index
patientId: uuid('patient_id').notNull().references(() => patients.id)
// Missing: index('episodes_patient_id_idx').on(table.patientId)

// ✅ OK
patientId: uuid('patient_id').notNull().references(() => patients.id),
...
}, (table) => ({
  patientIdIdx: index('episodes_patient_id_idx').on(table.patientId),
}))
```

### High-priority index candidates
Flag any table missing indexes on these column patterns:
- `*_patient_id` — always index
- `*_organization_id` / `*_tenant_id` — always index (multitenancy)
- `*_episode_id` — always index
- `status` columns on large clinical tables — consider partial index
- `created_at` on audit/log tables — index for time-range queries
- `claim_number`, `mrn`, `npi` — unique indexes required

### Composite index opportunities
Flag tables where queries frequently filter on multiple columns:
```typescript
// If queries do WHERE organization_id = ? AND status = ? AND created_at > ?
// Suggest: composite index (organization_id, status, created_at)
```

---

## 3. Destructive Migration Detection

### What to scan in `migrations/` directory

Flag any migration file containing these operations:

```sql
-- 🔴 CRITICAL — data loss risk
DROP TABLE ...
DROP COLUMN ...
TRUNCATE ...
DELETE FROM ... (without WHERE)

-- 🟡 WARNING — potential breakage
ALTER TABLE ... ALTER COLUMN ... TYPE ...   -- type change on existing column
ALTER TABLE ... RENAME COLUMN ...           -- breaks existing queries
ALTER TABLE ... RENAME TO ...              -- breaks all references
DROP INDEX ...                             -- performance regression
```

### Required safety checks for destructive migrations

Every destructive migration MUST include:
1. A comment explaining why the change is safe
2. A backup verification step or manual confirmation note
3. For column drops: confirmation that no application code references the column
4. For type changes: confirmation of data compatibility

```sql
-- ✅ Safe destructive migration template
-- SAFETY CHECK: Verified no application references to `legacy_field` as of 2025-01-15
-- BACKUP: pg_dump taken before applying this migration
-- ROLLBACK: See rollback/0042_rollback.sql

ALTER TABLE patients DROP COLUMN IF EXISTS legacy_field;
```

### Flag migrations with no rollback file
Every migration in `migrations/` should have a corresponding entry in `migrations/rollbacks/`.
Flag if `migrations/XXXX_name.sql` exists but `migrations/rollbacks/XXXX_rollback.sql` does not.

---

## 4. RLS Policy Coverage Gaps

### What to verify

For every table in `db/schema/*.ts` that contains patient or clinical data, verify:

1. **RLS is enabled** on the table in PostgreSQL:
```sql
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
```

2. **At minimum these policies exist**:
   - `SELECT` policy scoped to `organization_id = current_setting('app.organization_id')`
   - `INSERT` policy scoped to `organization_id`
   - `UPDATE` policy scoped to `organization_id`
   - `DELETE` policy restricted to admin role

3. **No bypass** — application DB user must NOT have `BYPASSRLS` privilege

### Tables requiring RLS (flag if missing)
```
patients                care_plans
episodes                diagnoses
visits                  symptoms
medications             bereavement_contacts
clinical_notes          claims
billing_records         audit_logs (append-only policy)
attending_physicians    idg_meeting_notes
```

### RLS policy template
```sql
-- SELECT: tenant-scoped
CREATE POLICY "patients_select_org" ON patients
  FOR SELECT USING (organization_id = current_setting('app.organization_id')::uuid);

-- INSERT: tenant-scoped + set org automatically
CREATE POLICY "patients_insert_org" ON patients
  FOR INSERT WITH CHECK (organization_id = current_setting('app.organization_id')::uuid);

-- UPDATE: tenant-scoped
CREATE POLICY "patients_update_org" ON patients
  FOR UPDATE USING (organization_id = current_setting('app.organization_id')::uuid);

-- DELETE: admin only
CREATE POLICY "patients_delete_admin" ON patients
  FOR DELETE USING (
    organization_id = current_setting('app.organization_id')::uuid
    AND current_setting('app.user_role') = 'admin'
  );
```

### Check in application code
Verify every Fastify request handler sets the RLS context variable before querying:
```typescript
// Required before any DB query in a request handler
await db.execute(sql`SELECT set_config('app.organization_id', ${orgId}, true)`)
await db.execute(sql`SELECT set_config('app.user_role', ${userRole}, true)`)
```
Flag any route handler that queries clinical tables without first setting these config values.
