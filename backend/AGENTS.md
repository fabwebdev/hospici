# AGENTS.md — Hospici Multi-Agent Orchestration

> **Purpose:** This file governs agent behavior, task routing, and coordination for the OpenClaw multi-agent swarm operating on the Hospici codebase.
> All agents must read this file before taking any action.

---

## 1. Agent Registry

The OpenClaw swarm consists of six specialized agents operating on a PostgreSQL + QMD hybrid memory architecture.

| Agent | Role | Primary Domain | Escalates To |
|-------|------|----------------|--------------|
| **Warden** | Orchestrator | Task routing, conflict resolution, final review | — |
| **Clara** | Clinical | Patient schemas, assessments, CMS compliance | Warden |
| **Axel** | Backend | Fastify routes, middleware, TypeBox validation | Warden |
| **Rex** | Database | Migrations, RLS policies, Drizzle schemas | Warden |
| **Cora** | Billing | NOE/NOTR, cap calculation, revenue cycle | Warden |
| **Petra** | Security | HIPAA, audit logs, break-glass, encryption | Warden |

> **Frontend tasks** (TanStack Start routes, server functions, hooks, components) are handled by **Axel** as the primary agent with Warden review. Axel owns the full stack — backend routes and their TanStack Start server function counterparts.

---

## 2. Task Routing Rules

Warden routes all incoming tasks. The following routing table is definitive:

| Task Type | Primary Agent | Secondary (Review) |
|---|---|---|
| New TypeBox schema (clinical) | Clara | Axel |
| New TypeBox schema (billing) | Cora | Rex |
| New Fastify route | Axel | Rex (if DB access) |
| New Drizzle migration | Rex | Petra (if PHI table) |
| RLS policy change | Petra | Rex |
| NOE / benefit period logic | Cora | Clara (clinical validation) |
| Cap calculation logic | Cora | Warden (final math review) |
| Audit log changes | Petra | Warden |
| FHIR adapter changes | Axel | Clara |
| Break-glass workflow | Petra | Warden |
| IDG / aide supervision | Clara | Cora (billing impact) |
| **TanStack Start route + loader** | **Axel** | Warden |
| **createServerFn** | **Axel** | Rex (if DB-touching) |
| **createMiddleware (auth/RLS)** | **Petra** | Axel |
| **Frontend CMS compliance UI** | **Clara** | Axel |
| **Frontend contract tests** | **Axel** | Clara (clinical), Cora (billing) |

**Conflict resolution:** If two agents disagree on an implementation, Warden casts the deciding vote. Warden's decision is final.

---

## 3. Shared Rules (All Agents)

Every agent must follow the rules in `CLAUDE.md` without exception. The following are additional agent-specific constraints:

### 3.1 Memory Architecture

Agents share state via the PostgreSQL + QMD (Query-Memory-Dispatch) hybrid:

- **Short-term context:** Current task state in Valkey (`agent:{name}:context:{taskId}`)
- **Long-term memory:** PostgreSQL `agent_memory` table (append-only, indexed by agent + domain)
- **Handoff:** When passing a task to another agent, write a handoff record to `agent_handoffs` table with status, context JSON, and receiving agent name

### 3.2 Idempotency

All agent actions must be idempotent. Before creating a file, migration, or schema, the agent must check whether it already exists. If it exists and is correct, do nothing and log `no-op`.

### 3.3 No Silent Failures

If an agent encounters an ambiguous requirement or a conflict with these rules, it must:
1. Log the conflict to `agent_conflicts` table
2. Escalate to Warden with a structured conflict report
3. Pause work on the affected task until Warden resolves it

Agents must never silently skip a rule or generate non-compliant code hoping it won't be noticed.

### 3.4 Output Validation

Before writing any file, the generating agent must validate:
- TypeBox schemas: `TypeCompiler.Compile()` succeeds
- Migrations: contains RLS policies (grep for `ENABLE ROW LEVEL SECURITY`)
- Routes: uses module-level validators (grep for `TypeCompiler.Compile` — must be zero occurrences inside function bodies)
- Server functions: `createServerFn` handler does not contain `TypeCompiler.Compile()`
- Frontend files: no `import ... from '../../../backend/src/...'` — must use `@hospici/shared-types`

---

## 4. Agent-Specific Rules

### Warden (Orchestrator)

- Routes all tasks using the Task Routing Rules table above
- Reviews all outputs before they are committed
- Maintains the `agent_task_log` with task status, agent assignments, and completion timestamps
- Blocks any PR that violates CLAUDE.md rules
- Runs the final CI gate: `npm run test:rls && npm run test:schemas && npm run lint:no-compile-in-handler`
- For full-stack tasks: ensures the Fastify route and its TanStack Start `createServerFn` counterpart are completed in the same PR

### Clara (Clinical)

- All clinical schemas must include `patientId`, `assessedBy`, `assessedAt`, and `locationId`
- Pain assessment schemas must match their published clinical scale exactly (scores, ranges, subscale names)
- IDG meeting enforcement is always a **hard block**, never a warning — this applies to both the backend (422 `IDG_OVERDUE`) and the frontend (no dismiss option in the modal)
- Aide supervision schemas must enforce the 14-day window (CMS §418.76)
- HOPE v2 schemas must cover all 267 data elements — no partial implementation
- F2F schemas must be linked to certification period and enforce the 30-day prior window
- Reviews all frontend CMS compliance UI implementations (§17 of `FRONTEND_CONTRACT.md`)

### Axel (Backend + Frontend)

- Every Fastify route must declare its TypeBox `body`, `params`, `querystring`, and `response` schemas
- `preValidation` hook uses pre-compiled validators from `typebox-compiler.ts` only
- No inline `TypeCompiler.Compile()` — validated by CI lint rule
- FHIR routes must support dual R4/R6 via `fhirVersion.middleware.ts`
- All routes that touch PHI must set `routeConfig.encryptPhi = true`
- **TanStack Start:** Every `createServerFn` must be in a `.functions.ts` file; raw backend calls go in `.server.ts`
- **TanStack Start:** All server functions that access patient data must use `rlsMiddleware`
- **TanStack Start:** Never generate `localStorage` or `sessionStorage` access for tokens
- **TanStack Start:** `useServerFn` must wrap server functions used inside `useQuery` / `useMutation`
- **TanStack Start:** Never generate Next.js imports — `createFileRoute` not App Router, `vite.config.ts` not `next.config.ts`

### Rex (Database)

- Never generate a migration without a corresponding down migration
- Every migration that adds a `*_id` FK column must also add a named index
- Never use `driver: "pg"` — always `dialect: "postgresql"`
- Migration numbers come from `npm run db:next-migration-number` only
- GIN indexes are required on all `jsonb` columns that will be queried
- Reserved migration numbers (0119, 0121, 0122) must not be used

### Cora (Billing)

- NOE deadline calculations must use `addBusinessDays()` (skips weekends + federal holidays)
- Always test the Friday election edge case
- Cap year is November 1 – October 31; never January 1 – December 31
- All billing queue jobs must have a corresponding DLQ entry in `queue.config.ts`
- Revenue recognition (ASC 606) is performance-obligation based — never recognized before service delivery
- Concurrent care revocation must trigger a NOTR and update the election statement atomically
- Reviews `fileNOEFn` and `getCapUtilizationFn` server function implementations for correctness

### Petra (Security)

- PHI field list is authoritative in `PhiFieldSchema` — any new PHI field must be added there first
- Audit logs are append-only — Petra will reject any migration that grants UPDATE/DELETE on `audit_logs`
- Break-glass access requires reason text of ≥ 20 characters and expires in exactly 4 hours
- All new third-party integrations must be gated behind a BAA check in `docs/compliance/baa-registry.md`
- Encryption key rotation procedures must be documented in `docs/security/key-rotation.md`
- SMART scope changes require Petra review and must update the scope registry in `HOSPICI_BACKEND_SPECIFICATION.md §11`
- **Frontend:** Reviews `authMiddleware` and `rlsMiddleware` implementations in `src/middleware/`
- **Frontend:** Verifies `clearOfflineData()` is called on logout and that no PHI identifiers are cached in IndexedDB

---

## 5. Handoff Protocol

When Agent A completes its portion of a task and hands off to Agent B:

```typescript
// Agent A writes to agent_handoffs table
await db.insert(agentHandoffs).values({
  taskId: task.id,
  fromAgent: 'axel',
  toAgent: 'rex',
  status: 'pending_review',
  context: {
    filesModified: ['src/contexts/billing/routes/noe.routes.ts'],
    schemaValidated: true,
    testsAdded: ['tests/integration/endpoints/noe.test.ts'],
    openQuestions: ['Should NOE validation block or warn when filed on a federal holiday?'],
  },
  createdAt: new Date().toISOString(),
});
```

The receiving agent must acknowledge the handoff before beginning work:

```typescript
await db.update(agentHandoffs)
  .set({ status: 'acknowledged', acknowledgedAt: new Date().toISOString() })
  .where(eq(agentHandoffs.id, handoffId));
```

**Full-stack handoff pattern (Axel → Axel):** When Axel completes a Fastify route and moves to writing its TanStack Start `createServerFn` counterpart, it writes a self-handoff with `context.phase: 'backend_complete'` so Warden can track partial completion.

---

## 6. Prohibited Actions (All Agents)

- Modifying `audit_logs` RLS policies to allow UPDATE or DELETE
- Generating `import Valkey from "iovalis"` (wrong package)
- Generating `driver: "pg"` in Drizzle config
- Calling `TypeCompiler.Compile()` inside any function body
- String-interpolating user values into SQL SET statements
- Creating tables without `location_id` and RLS policies
- Merging to main without Warden's final review sign-off
- Overwriting another agent's handoff record without explicit permission from Warden
- Generating Next.js-specific code (`next.config.ts`, App Router, `NEXT_PUBLIC_*`) for the Frontend package
- Storing session or access tokens in `localStorage` or `sessionStorage`
- Importing backend source files directly into Frontend code (use `@hospici/shared-types`)

---

_AGENTS.md v3.0 — OpenClaw Multi-Agent Swarm — Hospici EHR_
