# ENVIRONMENT_SETUP.md — Hospici Local Development Setup

> **Status:** Required reading before running any `npm` command in this project.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22+ LTS | `nvm install 22` |
| Docker | 24+ | [docker.com](https://docker.com) |
| Docker Compose | v2+ | Included with Docker Desktop |
| PostgreSQL client | 18+ | `brew install postgresql@18` or `apt install postgresql-client-18` |

---

## 1. Clone and Install

### Backend

```bash
git clone https://github.com/hospici/backend.git
cd Backend
npm install
```

> **Verify:** After `npm install`, confirm `iovalkey` is installed (not `iovalis`):
> ```bash
> cat node_modules/.package-lock.json | grep '"iovalkey"'
> ```

### Frontend

```bash
git clone https://github.com/hospici/frontend.git  # or: cd ../Frontend in the monorepo
cd Frontend
npm install
```

> **Verify:** After `npm install`, confirm TanStack Start is present:
> ```bash
> cat node_modules/.package-lock.json | grep '"@tanstack/react-start"'
> ```

---

## 2. Environment Variables

### Backend `.env`

Copy the example file and fill in your local values:

```bash
cp .env.example .env
```

#### `.env.example` (Backend)

```env
# ─── Database ────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://hospici:hospici_dev@localhost:5432/hospici_dev
DATABASE_URL_TEST=postgresql://hospici:hospici_dev@localhost:5432/hospici_test
DIRECT_DATABASE_URL=postgresql://hospici:hospici_dev@localhost:5432/hospici_dev

# ─── Valkey (iovalkey) ───────────────────────────────────────────────────
VALKEY_HOST=localhost
VALKEY_PORT=6379
VALKEY_PASSWORD=valkey_dev_password

# ─── Application ─────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# ─── Better Auth ─────────────────────────────────────────────────────────
BETTER_AUTH_SECRET=replace_with_32_char_secret_minimum
BETTER_AUTH_URL=http://localhost:3000

# ─── Encryption (PHI at rest) ────────────────────────────────────────────
PHI_ENCRYPTION_KEY=replace_with_256_bit_hex_key_64_chars
PHI_ENCRYPTION_IV=replace_with_128_bit_hex_iv_32_chars

# ─── FHIR ────────────────────────────────────────────────────────────────
FHIR_BASE_URL=http://localhost:3000/fhir/r4
FHIR_VERSION_DEFAULT=4.0

# ─── SMART on FHIR ───────────────────────────────────────────────────────
SMART_JWKS_URL=http://localhost:3000/.well-known/jwks.json
SMART_CLIENT_ID=hospici-local-dev

# ─── Email (Direct Secure Messaging / Notifications) ────────────────────
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@hospici.local
# BAA required for production SMTP provider

# ─── eRx (DoseSpot) ──────────────────────────────────────────────────────
DOSESPOT_API_URL=https://staging.dosespot.com/api
DOSESPOT_API_KEY=replace_with_dosespot_staging_key
DOSESPOT_CLINIC_ID=
# BAA required — do not use production credentials locally

# ─── Feature Flags ───────────────────────────────────────────────────────
FEATURE_FHIR_R6_ENABLED=false
FEATURE_BULK_EXPORT_ENABLED=false
FEATURE_AI_CLINICAL_NOTES=false
```

### Frontend `.env`

```bash
cp .env.example .env  # inside the Frontend package
```

#### `.env.example` (Frontend)

```env
# ─── API ─────────────────────────────────────────────────────────────────
# Server-only — used inside createServerFn handlers, never sent to browser
HOSPICI_API_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace_with_same_secret_as_backend

# ─── Client-safe (VITE_ prefix — available via import.meta.env) ──────────
VITE_SOCKET_URL=ws://localhost:3000
VITE_APP_VERSION=3.0.0
VITE_HEALTH_URL=http://localhost:3000
```

> **Important:** Variables without `VITE_` prefix are **server-only**. Vite will never include them in the browser bundle. Never prefix `HOSPICI_API_URL` or `BETTER_AUTH_SECRET` with `VITE_`.

> **Security:** Never commit `.env` files to version control. The `.gitignore` excludes them. If you accidentally commit secrets, rotate them immediately and notify the security lead.

---

## 3. Start Local Infrastructure

```bash
# Start PostgreSQL 18 + Valkey 8 + MailHog (dev SMTP)
docker compose up -d

# Verify services
docker compose ps
# All three services should show "running"
```

### docker-compose.yml (excerpt)

```yaml
services:
  postgres:
    image: postgres:18
    environment:
      POSTGRES_USER: hospici
      POSTGRES_PASSWORD: hospici_dev
      POSTGRES_DB: hospici_dev
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./setup-database.sql:/docker-entrypoint-initdb.d/setup.sql

  valkey:
    image: valkey/valkey:8.0
    command: valkey-server /etc/valkey/valkey.conf
    volumes:
      - ./docker/valkey/valkey.conf:/etc/valkey/valkey.conf
      - valkey_data:/data
    ports:
      - "6379:6379"

  mailhog:
    image: mailhog/mailhog:latest
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # Web UI
```

---

## 4. Database Setup

```bash
# Run all migrations
npm run db:migrate

# Verify schema
npm run db:check-tables

# Compile TypeBox validators (post-migration hook)
npm run db:compile-validators

# Seed development data (synthetic HIPAA-safe patients)
npm run db:seed:dev
```

---

## 5. Start the Application

### Backend

```bash
# Development mode with hot reload
cd Backend
npm run dev

# Check it's running
curl http://localhost:3000/health
# Expected: {"status":"ok","version":"x.x.x","fhir":"4.0"}
```

### Frontend

```bash
# Install shadcn/ui components (first time — see docs/design-system.md §12 for full list)
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button checkbox dialog table calendar badge alert sonner

# Generate TypeScript types from the running backend's OpenAPI spec
cd Frontend
npm run generate:types
# Generates src/types/hospici-api.d.ts from http://localhost:3000/openapi.json
# Run this once after cloning and whenever the backend schema changes

# Start dev server
npm run dev
# → http://localhost:5173 (Vite default)
```

> **Start order:** Backend must be running before `npm run generate:types` can succeed. In development, always start the backend first.

---

## 6. Useful Development Commands

### Backend

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests (requires Docker services running)
npm run test:integration

# Run RLS policy tests
npm run test:rls

# Run schema tests
npm run test:schemas

# Generate a new migration
npm run db:generate

# Get next safe migration number
npm run db:next-migration-number

# Schema file count report
npm run db:schema-report

# Lint (Biome)
npm run lint

# Type check
npm run typecheck

# Check for AOT compilation violations (TypeCompiler.Compile inside functions)
npm run lint:no-compile-in-handler
```

### Frontend

```bash
# Generate TypeScript types from backend OpenAPI spec
npm run generate:types

# Generate from staging instead of local
npm run generate:types:staging

# Watch mode — regenerates types on openapi.yaml change
npm run watch:types

# Start dev server
npm run dev

# Production build
npm run build

# Serve production build locally
npm run start

# Type check
npm run typecheck

# Lint (Biome)
npm run lint

# Run contract tests (requires backend running)
npm run test:contract
```

---

## 7. Common Setup Issues

### Issue: `iovalkey` not found

```bash
npm install  # Reinstall — ensure package.json references iovalkey not iovalis
```

### Issue: `dialect` error from drizzle-kit

Ensure `drizzle.config.ts` uses `dialect: "postgresql"`, not `driver: "pg"`. The deprecated config breaks migration generation.

### Issue: RLS permission denied

Your PostgreSQL session does not have the `app.current_user_id` config set. This is set by the Fastify `preHandler` hook. When testing manually, set it:

```sql
SELECT set_config('app.current_user_id', 'your-user-uuid', false);
SELECT set_config('app.current_location_id', 'your-location-uuid', false);
SELECT set_config('app.current_role', 'admin', false);
```

### Issue: Valkey connection refused

```bash
docker compose up valkey -d
# Verify RedisJSON module is loaded:
docker exec -it hospici-valkey-1 valkey-cli PING
docker exec -it hospici-valkey-1 valkey-cli MODULE LIST
```

### Issue: TypeBox validation errors on startup

A validator is being compiled at runtime (inside a function). Find it:

```bash
npm run lint:no-compile-in-handler
```

Move all `TypeCompiler.Compile()` calls to `src/config/typebox-compiler.ts`.

### Issue: Frontend type generation fails — `ECONNREFUSED`

The backend is not running. Start it first:

```bash
cd Backend && npm run dev
# Wait for "Server running on http://localhost:3000"
cd Frontend && npm run generate:types
```

### Issue: Frontend env var not defined at runtime

Client-side variables must be prefixed with `VITE_`. Variables without this prefix are server-only and will be `undefined` in the browser. Check:

```typescript
// ✅ Client-safe — accessible in browser
import.meta.env.VITE_SOCKET_URL

// ✅ Server-only — only accessible in createServerFn handlers
process.env.HOSPICI_API_URL

// ❌ Wrong — will be undefined in browser, should use import.meta.env.VITE_*
process.env.VITE_SOCKET_URL
```

### Issue: Socket.IO `auth: token is null`

The access token was not set in memory before `initSocket()` was called. Ensure `setSocketToken(accessToken)` is called immediately after a successful `loginFn` response, before `initSocket()`.

---

## 8. BAA Vendor List

Before integrating with any third-party service, a signed Business Associate Agreement (BAA) must be on file. Current BAA status:

| Vendor | Service | BAA Status | Contact |
|--------|---------|-----------|---------|
| Valkey hosting (prod) | Cache/Queue | Required before production | ops@hospici.com |
| DoseSpot | eRx | Required before eRx feature launch | compliance@hospici.com |
| SMTP provider (prod) | Email | Required before email notifications | compliance@hospici.com |
| CHAP/Press Ganey | CAHPS surveys | Required before survey launch | compliance@hospici.com |

See `docs/compliance/baa-registry.md` for the full registry.

---

_ENVIRONMENT_SETUP.md v3.0 — Hospici Local Development Guide_
