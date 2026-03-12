# CONTRIBUTING.md — Hospici Development Workflow

---

## Branch Naming

```
{type}/{ticket-id}-short-description

feat/HOS-142-noe-friday-edge-case
fix/HOS-203-cap-year-boundary
chore/HOS-301-cleanup-root-scripts
docs/HOS-404-update-smart-scope-registry
test/HOS-512-rls-tier2-coverage
migration/HOS-611-aide-supervision-table
frontend/HOS-712-patient-pain-route
```

**Types:** `feat`, `fix`, `chore`, `docs`, `test`, `migration`, `refactor`, `security`, `frontend`

**Rules:**
- Branch off `main` only
- One feature or fix per branch
- Migration branches must contain only migration files and the corresponding TypeBox schema
- Full-stack features (new endpoint + server function + route) are one branch, not split across backend/frontend

---

## Commit Message Convention (Conventional Commits)

```
{type}({scope}): {short description}

{body — optional, explain WHY not WHAT}

{footer — optional, closes ticket}
```

### Examples

```
feat(billing): add NOE Friday edge case validation

addBusinessDays() now skips US federal holidays in addition to weekends.
Election on Friday 2026-03-06 correctly generates deadline of 2026-03-13.

Closes HOS-142
```

```
fix(database): replace string-interpolated SET with parameterized set_config

Resolves SQL injection vector in RLS context injection.
All SET app.* statements now use sql tagged template.

Closes HOS-203
Security: critical
```

```
migration(scheduling): add aide_supervision table with RLS

0055_aide_supervision.sql: adds aide_supervision table,
location_id FK, RLS location_read and location_write policies.
BullMQ job schema added for 14-day deadline check.

Closes HOS-301
```

```
feat(frontend): add pain assessment route with createServerFn

Adds /_authed/patients/$patientId/pain route.
getPainAssessmentsFn and createPainAssessmentFn use rlsMiddleware.
useCreatePainAssessment hook with idempotency key pattern.
Contract test against local backend passing.

Closes HOS-412
```

**Scopes:** `clinical`, `billing`, `identity`, `interop`, `scheduling`, `docs`, `database`, `config`, `security`, `analytics`, `frontend`

---

## Pull Request Process

### PR Title

Same format as commit message: `feat(billing): add cap year Nov-1 boundary test`

### PR Description Template

```markdown
## What does this PR do?
<!-- One paragraph, plain English -->

## Why?
<!-- Link to ticket or explain the business requirement -->

## CMS / Compliance Impact
<!-- Does this affect NOE, cap calculation, IDG, F2F, aide supervision, FHIR, or HIPAA? -->
- [ ] No compliance impact
- [ ] Affects: [list CMS rules impacted]

## Backend Checklist
- [ ] TypeBox schema defined before Drizzle table
- [ ] All validators compiled at module level (no in-function TypeCompiler.Compile)
- [ ] RLS policies added to migration if new table
- [ ] Transactions used for all multi-table writes
- [ ] Unit tests added (valid + ≥2 invalid cases for schema)
- [ ] Integration tests added for new routes
- [ ] Edge case tests added for CMS business logic (Friday NOE, cap year, etc.)
- [ ] No string-interpolated SET statements
- [ ] No `console.log()` (use Pino logger)
- [ ] No `import Valkey from "iovalis"` (must be "iovalkey")
- [ ] No `driver: "pg"` in Drizzle config

## Frontend Checklist (if applicable)
- [ ] Server functions in `.functions.ts`, raw backend calls in `.server.ts`
- [ ] All server functions that access patient data use `rlsMiddleware`
- [ ] No `localStorage` / `sessionStorage` for tokens
- [ ] `useServerFn` used inside `useQuery` / `useMutation`
- [ ] Idempotency key passed to all POST mutations
- [ ] ETag captured from loader, passed back in update server function
- [ ] No Next.js imports or App Router conventions
- [ ] No `process.env.NEXT_PUBLIC_*` — uses `import.meta.env.VITE_*`
- [ ] No direct import from `../../../backend/src/...` — uses `@hospici/shared-types`
- [ ] CMS compliance UI patterns implemented if route touches NOE/IDG/cap/aide
- [ ] Contract test added (`tests/contract/`)
- [ ] `npm run generate:types` still passes after backend changes

## CI Gates
- [ ] `npm run lint:no-compile-in-handler` passes
- [ ] `npm run test:rls` passes
- [ ] `npm run typecheck` passes (both Backend and Frontend)
```

### Review Requirements

| PR Type | Required Approvals |
|---------|-------------------|
| Feature (non-PHI table) | 1 peer review |
| Feature (PHI table or RLS change) | 1 peer + security lead (Petra) |
| CMS business logic change | 1 peer + clinical lead (Clara) |
| Billing logic change | 1 peer + billing lead (Cora) |
| Security / audit log change | Security lead (Petra) + Warden |
| Migration | DB lead (Rex) + 1 peer |
| Frontend auth / middleware | Security lead (Petra) + Axel |
| Frontend CMS compliance UI | Clinical lead (Clara) + Axel |

---

## CI Gates (All Must Pass Before Merge)

### Backend

```bash
npm run typecheck                    # TypeScript strict mode
npm run lint                         # Biome
npm run lint:no-compile-in-handler   # No TypeCompiler.Compile inside functions
npm run test:unit                    # Vitest unit tests
npm run test:schemas                 # TypeBox schema validation
npm run test:rls                     # RLS policy tests
npm run test:integration             # API integration tests
npm run db:check-tables              # Schema integrity
```

### Frontend

```bash
npm run typecheck                    # TypeScript strict mode (tsc --noEmit)
npm run lint                         # Biome
npm run generate:types               # OpenAPI types generate without error
npm run test:contract                # Contract tests against backend
```

---

## Migration PRs — Additional Rules

1. Run `npm run db:next-migration-number` to get the correct sequential number
2. Migration file must include down migration (rollback SQL)
3. Every new table must have `location_id` + RLS policies in the same file
4. PR must include `npm run db:schema-report` output in the description
5. Migration branches are squash-merged to keep the git history clean

---

## Frontend-Specific Rules

### Server Function Conventions

```
src/server/patients.server.ts       ← server-only: raw fetch to Hospici backend
src/functions/patients.functions.ts ← createServerFn wrappers
```

- `.server.ts` files must never be imported from client components or hooks
- `.functions.ts` files are safe to import from anywhere — Vite handles the split
- Every server function that reads/writes patient data must include `rlsMiddleware`

### TanStack Start Patterns

```typescript
// ✅ Correct — useServerFn in query
const fn = useServerFn(getPatientFn);
useQuery({ queryKey: [...], queryFn: () => fn({ data: { patientId } }) });

// ❌ Wrong — calling server function directly in component without useServerFn
useQuery({ queryKey: [...], queryFn: () => getPatientFn({ data: { patientId } }) });
```

```typescript
// ✅ Correct — client env var
const socketUrl = import.meta.env.VITE_SOCKET_URL;

// ❌ Wrong — Next.js convention
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
```

### Type Generation

Whenever a backend schema changes, the frontend types must be regenerated before submitting the PR:

```bash
# With backend running on :3000
cd Frontend && npm run generate:types
# Commit the updated src/types/hospici-api.d.ts
```

If a backend PR and its frontend counterpart are in the same PR, the generated types file must be committed as part of that PR.

---

## Code Review Standards

**Reviewers must reject PRs that contain:**
- `import Valkey from "iovalis"` (must be `"iovalkey"`)
- `driver: "pg"` in any Drizzle config
- `TypeCompiler.Compile()` inside a function body
- String-interpolated SQL SET statements
- New tables without `location_id` and RLS policies
- Multi-table writes without `db.transaction()`
- `UPDATE` or `DELETE` policies on `audit_logs`
- `console.log()` anywhere in `src/`
- `localStorage` or `sessionStorage` for auth tokens (Frontend)
- `process.env.NEXT_PUBLIC_*` in the Frontend package
- Next.js imports (`next/navigation`, `next/headers`, App Router conventions) in the Frontend package
- Direct imports from `../../../backend/src/...` in Frontend files

---

_CONTRIBUTING.md v3.0 — Hospici Development Workflow_
