
# AGENTS.md — Hospici Monorepo

> Read this file first. Then read the package-specific rules before touching any code in that package.

---

## Monorepo Structure

```
hospici/
├── backend/          # Fastify API — @hospici/backend
├── frontend/         # TanStack Start (Vinxi) — @hospici/frontend
├── packages/
│   └── shared-types/ # Published types/validators — @hospici/shared-types
├── docker-compose.yml
└── pnpm-workspace.yaml
```

**Package managers:** pnpm ≥ 9, Node ≥ 22. Never use npm or yarn.

**Workspace commands:**

```bash
pnpm dev              # runs all packages in parallel
pnpm -r build         # builds all packages
pnpm -r typecheck     # type-checks all packages
pnpm --filter @hospici/backend <cmd>    # target backend only
pnpm --filter @hospici/frontend <cmd>  # target frontend only
```

---

## Package-Specific Rules

- **Backend** → see [`backend/CLAUDE.md`](backend/CLAUDE.md) — full rules for Fastify, Drizzle, TypeBox, RLS, CMS compliance, PHI/HIPAA, migrations
- **Frontend** → TanStack Start (not Next.js). See Section 2.5 in `backend/CLAUDE.md` for the full framework rule table
- **shared-types** → consumed by both backend and frontend; types here must be framework-agnostic and have zero runtime dependencies

---

## Cross-Package Rules (apply everywhere)

### Never cross package boundaries directly

```typescript
// ✅ CORRECT — frontend imports from shared-types workspace package
import type { PatientSchema } from "@hospici/shared-types";

// ❌ WRONG — frontend must never reach into backend source
import type { PatientSchema } from "../../backend/src/schemas/patient.schema";
```

### Linter

All packages use **Biome** (`biome.json` per package). Never generate ESLint or Prettier config.

### TypeScript

Strict mode everywhere. No `any`. `verbatimModuleSyntax` enabled. No barrel `index.ts` re-exports.

### No secrets in source

No hardcoded API keys, connection strings, or credentials anywhere in the repo. All secrets via environment variables.

### Console logging

- Backend: use `fastify.log` / Pino — never `console.log`
- Frontend: `console.log` is acceptable in dev, but never commit logs that print PHI

---

## Adding a New Feature (checklist)

1. Define TypeBox schema in `packages/shared-types` if shared, or in `backend/src/schemas/` if backend-only
2. Run `pnpm --filter @hospici/backend db:next-migration-number` before creating a migration
3. Every new table → RLS policies in the same migration file
4. Compile new validators in `backend/src/config/typebox-compiler.ts`
5. Add contract tests in `frontend/tests/contract/` for any new server function
6. Regenerate frontend API types if OpenAPI spec changed: `pnpm --filter @hospici/frontend generate:types`

---

_Root CLAUDE.md — Hospici Monorepo — delegates detail to backend/CLAUDE.md_
