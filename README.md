# Hospici — Cloud-Native Hospice EHR

[![Stack](https://img.shields.io/badge/stack-Fastify%205%20%7C%20TanStack%20Start%20%7C%20TypeBox-blue)](https://hospici.com)
[![CMS Compliant](https://img.shields.io/badge/CMS-42%20CFR%20%C2%A7418-green)](https://www.cms.gov)
[![HIPAA](https://img.shields.io/badge/HIPAA-compliant-blueviolet)](https://www.hhs.gov/hipaa)

A modern, cloud-native Electronic Health Record system built specifically for hospice care, adhering to CMS Conditions of Participation (CoP) per 42 CFR Part 418, HIPAA Security Rule, and 21st Century Cures Act interoperability mandates.

## Architecture Highlights

- **Schema-First**: TypeBox as single source of truth for validation, types, and OpenAPI
- **AOT Compilation**: All validators compiled at startup — zero runtime compilation
- **Multi-Tenant RLS**: PostgreSQL Row-Level Security with parameterized context injection
- **FHIR R4/R6**: Dual-mode FHIR support with transformation adapters
- **CMS Compliance**: Built-in business rules for NOE deadlines, benefit periods, IDG meetings, aide supervision

## Quick Start

### Prerequisites

- Node.js 22+ LTS
- Docker 24+
- pnpm 9+

### 1. Clone and Install

```bash
git clone https://github.com/hospici/hospici.git
cd hospici
pnpm install
```

### 2. Configure Environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your values

# Frontend
cp frontend/.env.example frontend/.env
# Edit frontend/.env with your values
```

### 3. Start Infrastructure

```bash
docker compose up -d
```

This starts:
- PostgreSQL 18 (port 5432)
- Valkey 8 (port 6379)
- MailHog (SMTP on 1025, Web UI on 8025)

### 4. Run Migrations

```bash
cd backend
pnpm run db:migrate
pnpm run db:seed:dev
```

### 5. Start Development

```bash
# Terminal 1 - Backend
cd backend
pnpm run dev

# Terminal 2 - Frontend
cd frontend
pnpm run generate:types
pnpm run dev
```

- Backend: http://localhost:3000
- Frontend: http://localhost:5173
- API Docs: http://localhost:3000/docs

## Project Structure

```
hospici/
├── backend/                    # Fastify 5 API
│   ├── src/
│   │   ├── contexts/          # DDD bounded contexts
│   │   │   ├── identity/      # Auth, ABAC, Audit
│   │   │   ├── clinical/      # Patients, Assessments, Pain
│   │   │   ├── billing/       # NOE, Benefit Periods, Cap
│   │   │   ├── scheduling/    # IDG, Visits, Aide Supervision
│   │   │   └── ...
│   │   ├── shared-kernel/     # Value objects, shared types
│   │   ├── config/            # Environment, TypeBox compiler
│   │   ├── middleware/        # RLS, Auth
│   │   └── plugins/           # Valkey, etc.
│   ├── database/
│   │   └── migrations/        # Drizzle migrations
│   └── docker/                # Valkey config, setup scripts
├── frontend/                   # TanStack Start
│   ├── src/
│   │   ├── routes/            # File-based routing
│   │   ├── functions/         # createServerFn wrappers
│   │   ├── server/            # Server-only code
│   │   ├── middleware/        # Auth, RLS middleware
│   │   └── lib/               # Query client, socket
│   └── app.config.ts          # TanStack Start config
└── packages/
    └── shared-types/          # Shared TypeBox schemas, socket types
```

## CMS Compliance Features

| Feature | Implementation | CMS Rule |
|---------|---------------|----------|
| NOE 5-Day Rule | Business day calculation with Friday edge case | 42 CFR §418.21 |
| Benefit Periods | 90d/90d/60d/60d... with F2F requirement | 42 CFR §418.22 |
| IDG Meetings | 15-day hard block for care plan updates | 42 CFR §418.56 |
| Aide Supervision | 14-day enforcement | 42 CFR §418.76 |
| Hospice Cap | Monthly calculation, Nov 1 cap year | CMS Cap Manual |

## Development Workflow

### Branch Naming
```
feat/HOS-142-noe-friday-edge-case
fix/HOS-203-cap-year-boundary
migration/HOS-611-aide-supervision-table
```

### Key Commands

```bash
# Backend
pnpm run db:generate           # Generate migration
pnpm run db:migrate            # Run migrations
pnpm run lint:no-compile-in-handler  # Critical lint rule
pnpm run test:rls              # RLS policy tests

# Frontend
pnpm run generate:types        # Generate from OpenAPI
pnpm run typecheck             # TypeScript check
```

## Security

- **PHI Encryption**: AES-256 at rest (pgcrypto), TLS 1.3 in transit
- **RLS**: Parameterized `set_config` — no string interpolation
- **Auth**: Better Auth with httpOnly cookies, ABAC policies
- **Audit**: Immutable, partitioned audit logs (6-year retention)

## Documentation

### Architecture
- [Backend Specification](docs/architecture/backend-specification.md) — Fastify 5, TypeBox, DDD
- [Frontend Contract](docs/architecture/frontend-contract.md) — TanStack Start integration
- [Database Architecture](docs/architecture/database-architecture.md) — Schema-first design
- [Drizzle ORM Reference](docs/architecture/drizzle-orm-reference.md) — ORM patterns
- [Security Model](docs/architecture/security-model.md) — RLS, ABAC, encryption

### Operations
- [Runbook](docs/operations/runbook.md) — On-call procedures, failover, incident response

### Development
- [Environment Setup](docs/development/environment-setup.md) — Local development guide
- [Contributing Guide](CONTRIBUTING.md) — Workflow, branch naming, CI gates

## License

Private - All rights reserved.

---

Built with ❤️ for hospice care teams everywhere.
