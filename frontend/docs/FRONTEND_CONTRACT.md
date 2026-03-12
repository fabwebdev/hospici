# Hospici Frontend Contract Specification
## Frontend–Backend Integration API Contract

**Version:** 3.0
**Date:** 2026-03-11
**Status:** Canonical Reference — Pre-Production
**OpenAPI Version:** 3.1.0 (generated from TypeBox)
**Documentation:** Scalar UI (self-hosted at `/docs`)
**Stack:** TanStack Start (RC) · TanStack Router · TanStack Query v5 · TypeBox · Socket.IO · Better Auth

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [TanStack Start Architecture](#2-tanstack-start-architecture)
3. [Project Structure](#3-project-structure)
4. [OpenAPI & Type Generation](#4-openapi--type-generation)
5. [Server Functions — Primary Integration Pattern](#5-server-functions--primary-integration-pattern)
6. [Authentication & Session Management](#6-authentication--session-management)
7. [Route-Level Data Loading](#7-route-level-data-loading)
8. [API Endpoint Structure](#8-api-endpoint-structure)
9. [Request / Response Contract](#9-request--response-contract)
10. [TanStack Query Integration](#10-tanstack-query-integration)
11. [Real-Time Communication (Socket.IO)](#11-real-time-communication-socketio)
12. [Error Handling Contract](#12-error-handling-contract)
13. [FHIR Resource Handling](#13-fhir-resource-handling)
14. [File Upload Contract](#14-file-upload-contract)
15. [Offline Support & Sync](#15-offline-support--sync)
16. [Security Requirements](#16-security-requirements)
17. [CMS Compliance UI Contracts](#17-cms-compliance-ui-contracts)
18. [API Versioning & Breaking Changes](#18-api-versioning--breaking-changes)
19. [Development Workflow](#19-development-workflow)
20. [Quick Reference](#20-quick-reference)

---

## 1. Executive Summary

This document defines the complete **API Contract** between the Hospici Frontend (TanStack Start) and Backend (Fastify 5 + TypeBox). TanStack Start is client-first — SSR only on first load, then pure SPA. Its `createServerFn` primitive replaces most traditional REST client boilerplate while preserving full TypeScript end-to-end safety.

### Contract Philosophy

| Principle | Implementation |
|-----------|---------------|
| **Server Functions First** | `createServerFn` is the primary integration pattern — not a REST client wrapper |
| **Type Safety** | TypeBox schemas → OpenAPI → `openapi-typescript` → server function return types → components |
| **Auth via Router Context** | Session is read server-side in `__root.tsx` `beforeLoad`, injected into every route's `context` |
| **No Token in localStorage** | httpOnly cookies for session (Better Auth); access token in memory only for Socket.IO |
| **Real-Time** | Socket.IO with typed event contracts from `packages/shared-types/socket` |
| **Offline-Capable** | IndexedDB sync queue for field visits |
| **CMS-Aware** | `beforeLoad` enforces IDG hard blocks; components enforce NOE warnings and cap alerts |

### Framework Key Facts

- **TanStack Start RC** — feature-complete, production-usable; pin your version (`@tanstack/react-start`)
- **No React Server Components** — uses SSR on first request, then full SPA navigation
- **File-based routing** — `src/routes/` auto-generates `routeTree.gen.ts`; do not edit that file
- **Vite** under the hood — `vite.config.ts` + `app.config.ts`, not `next.config.ts`
- **`createServerFn`** runs exclusively on the server, callable from loaders and components
- **`useServerFn`** wraps a server function for use inside TanStack Query's `queryFn`

---

## 2. TanStack Start Architecture

### How It Differs from a Typical Next.js Setup

| Concern | Next.js 15 | TanStack Start |
|---------|-----------|----------------|
| Routing | App Router, nested layouts | `createFileRoute`, file-based, `__root.tsx` |
| Server logic | Server Actions / Route Handlers | `createServerFn` + `createMiddleware` |
| Data loading | `fetch` in Server Components / `use server` | `loader` in route definition, calls `createServerFn` |
| Auth guard | `middleware.ts` + `redirect()` | `beforeLoad` in `_authed.tsx` layout route |
| Type generation | `next.config.ts` | `vite.config.ts` with `tanstackStart()` plugin |
| API client | External `fetch` wrapper class | `createServerFn` replaces most API client calls |
| Config | `next.config.ts` | `vite.config.ts` + `app.config.ts` |
| RSC | Supported | Not yet — planned |

### Request Lifecycle

```
Browser request
    ↓
TanStack Start SSR server (Vite / Nitro)
    ↓
Route matched → __root.tsx beforeLoad → _authed.tsx beforeLoad → route beforeLoad
    ↓
createServerFn called (server-side during SSR; RPC over HTTP during SPA nav)
    ↓
createMiddleware chain: authMiddleware → rlsMiddleware
    ↓
Hospici Fastify backend (fetch from server function)
    ↓
Data returned → injected into router context / loader data
    ↓
Component renders with typed loader data
    ↓
Hydration → SPA mode for subsequent navigations
```

### Integration Decision: Server Functions vs. Direct Browser Fetch

| Pattern | When to use |
|---------|-------------|
| `createServerFn` | All data reads and mutations — patients, billing, clinical, scheduling, admin |
| Direct browser `fetch` | File uploads (multipart streaming), Socket.IO connection (WebSocket) |
| FHIR `fetch` inside server fn | FHIR endpoints — called server-side, result returned to component |

---

## 3. Project Structure

```
Frontend/
├── app.config.ts               # TanStack Start app config
├── vite.config.ts              # Vite + tanstackStart() plugin
├── tsconfig.json               # moduleResolution: "Bundler", jsx: "react-jsx"
├── src/
│   ├── routes/                 # File-based routing — auto-generates routeTree.gen.ts
│   │   ├── __root.tsx          # Root route — providers, head, session load
│   │   ├── _authed.tsx         # Layout route — auth guard for all child routes
│   │   ├── _authed/
│   │   │   ├── dashboard.tsx
│   │   │   ├── patients/
│   │   │   │   ├── index.tsx          # /patients list
│   │   │   │   └── $patientId/
│   │   │   │       ├── index.tsx      # /patients/:patientId
│   │   │   │       ├── pain.tsx
│   │   │   │       └── care-plan.tsx
│   │   │   ├── billing/
│   │   │   │   ├── noe.tsx
│   │   │   │   └── cap.tsx
│   │   │   ├── scheduling/
│   │   │   │   └── idg.tsx
│   │   │   └── admin/
│   │   │       └── audit-logs.tsx
│   │   └── login.tsx           # Public route
│   │
│   ├── server/                 # Server-only code (.server.ts) — never imported on client
│   │   ├── auth.server.ts      # Better Auth session reading
│   │   ├── patients.server.ts  # Raw fetch calls to Hospici backend
│   │   └── billing.server.ts
│   │
│   ├── functions/              # createServerFn wrappers (.functions.ts) — safe to import anywhere
│   │   ├── auth.functions.ts
│   │   ├── patients.functions.ts
│   │   ├── billing.functions.ts
│   │   └── scheduling.functions.ts
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts  # createMiddleware — session validation
│   │   └── rls.middleware.ts   # createMiddleware — location scope headers
│   │
│   ├── lib/
│   │   ├── query-client.ts
│   │   └── realtime/socket.ts
│   │
│   ├── hooks/
│   │   ├── use-patient.ts
│   │   └── use-socket-event.ts
│   │
│   ├── components/
│   │   └── compliance/         # CMS-required UI components
│   │
│   └── types/
│       └── hospici-api.d.ts    # Generated — do not edit
│
└── routeTree.gen.ts            # Auto-generated — do not edit
```

### File Naming Conventions

| Suffix | Purpose | Importable from client? |
|--------|---------|------------------------|
| `.server.ts` | Server-only — DB calls, env secrets, raw backend fetch | No |
| `.functions.ts` | `createServerFn` wrappers | Yes (Vite splits server code automatically) |
| `.ts` / `.tsx` | Client-safe — types, constants, components | Yes |

---

## 4. OpenAPI & Type Generation

### TypeBox → OpenAPI Flow

```
TypeBox Schema (Hospici Backend — single source of truth)
    ↓
@fastify/swagger → /openapi.json
    ↓
openapi-typescript (npm script in Frontend package)
    ↓
src/types/hospici-api.d.ts
    ↓
Used in: server functions · route loaders · components
```

### Commands

```bash
# Generate from local backend (use during development)
npm run generate:types
# script: openapi-typescript http://localhost:3000/openapi.json --output src/types/hospici-api.d.ts

# Generate from staging (use before releases)
npm run generate:types:staging

# Watch mode — regenerates when backend openapi.yaml changes
npm run watch:types
# script: chokidar '../backend/docs/openapi.yaml' -c 'npm run generate:types'
```

### Using Generated Types

```typescript
// Import types only — no runtime values from the generated file
import type { paths, components } from '@/types/hospici-api';

type Patient        = components['schemas']['Patient'];
type NOE            = components['schemas']['NOE'];
type FlaccScale     = components['schemas']['FlaccScale'];
type PainAssessmentInput = components['schemas']['PainAssessmentInput'];
```

### Shared TypeBox Validators (Frontend Form Validation)

```typescript
// ✅ CORRECT — import from shared workspace package
import { FlaccScaleSchema } from '@hospici/shared-types/clinical';
import { TypeCompiler } from '@sinclair/typebox/compiler';

// Compile once at module level (same rule as backend)
const FlaccValidator = TypeCompiler.Compile(FlaccScaleSchema);

export function validateFlacc(data: unknown) {
  if (FlaccValidator.Check(data)) return { valid: true, data };
  return { valid: false, errors: [...FlaccValidator.Errors(data)].map(e => ({
    field: e.path, message: e.message,
  }))};
}

// ❌ WRONG — direct backend import couples frontend to backend file structure
// import { FlaccScaleSchema } from '../../../backend/src/contexts/clinical/schemas';
```

---

## 5. Server Functions — Primary Integration Pattern

All reads and mutations go through `createServerFn`. They run on the server, have access to the session cookie, and are called transparently from loaders or components.

### Middleware Chain

```typescript
// src/middleware/auth.middleware.ts
import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { redirect } from '@tanstack/react-router';
import { auth } from '@/server/auth.server';

export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await auth.api.getSession({ headers: getRequest().headers });

    if (!session) {
      throw redirect({ to: '/login' });
    }

    return next({
      context: {
        session: {
          userId:     session.user.id,
          role:       session.user.role,
          locationId: session.session.activeLocationId,
          locationIds: session.user.locationIds,
          permissions: session.user.permissions,
          breakGlass:  session.session.breakGlass ?? false,
        },
      },
    });
  },
);

// src/middleware/rls.middleware.ts
// Adds location/user headers so the Hospici backend can set its RLS context
export const rlsMiddleware = createMiddleware({ type: 'function' })
  .middleware([authMiddleware])
  .server(async ({ next, context }) =>
    next({
      context: {
        ...context,
        backendHeaders: {
          'X-User-ID':    context.session.userId,
          'X-User-Role':  context.session.role,
          'X-Location-ID': context.session.locationId,
          'X-Request-ID': crypto.randomUUID(),
        },
      },
    }),
  );
```

### Patient Server Functions

```typescript
// src/server/patients.server.ts  ← server-only
import type { components } from '@/types/hospici-api';

type Patient = components['schemas']['Patient'];

export async function fetchPatient(
  patientId: string,
  headers: HeadersInit,
): Promise<Patient> {
  const res = await fetch(
    `${process.env.HOSPICI_API_URL}/v1/patients/${patientId}`,
    { headers },
  );
  if (!res.ok) throw await res.json();
  return (await res.json()).data as Patient;
}
```

```typescript
// src/functions/patients.functions.ts  ← safe to import from components/hooks
import { createServerFn } from '@tanstack/react-start';
import { rlsMiddleware } from '@/middleware/rls.middleware';
import { fetchPatient } from '@/server/patients.server';
import type { components } from '@/types/hospici-api';

type PainAssessmentInput = components['schemas']['PainAssessmentInput'];

export const getPatientFn = createServerFn({ method: 'GET' })
  .middleware([rlsMiddleware])
  .validator((data: { patientId: string }) => data)
  .handler(async ({ data, context }) =>
    fetchPatient(data.patientId, context.backendHeaders),
  );

export const getPainAssessmentsFn = createServerFn({ method: 'GET' })
  .middleware([rlsMiddleware])
  .validator((data: { patientId: string; page?: number }) => data)
  .handler(async ({ data, context }) => {
    const params = new URLSearchParams({ page: String(data.page ?? 1) });
    const res = await fetch(
      `${process.env.HOSPICI_API_URL}/v1/patients/${data.patientId}/pain?${params}`,
      { headers: context.backendHeaders },
    );
    if (!res.ok) throw await res.json();
    return (await res.json()).data;
  });

export const createPainAssessmentFn = createServerFn({ method: 'POST' })
  .middleware([rlsMiddleware])
  .validator((data: { patientId: string; assessment: PainAssessmentInput; idempotencyKey: string }) => data)
  .handler(async ({ data, context }) => {
    const res = await fetch(
      `${process.env.HOSPICI_API_URL}/v1/patients/${data.patientId}/pain`,
      {
        method: 'POST',
        headers: {
          ...context.backendHeaders,
          'Content-Type': 'application/json',
          'Idempotency-Key': data.idempotencyKey,
        },
        body: JSON.stringify(data.assessment),
      },
    );
    if (!res.ok) throw await res.json();
    return (await res.json()).data;
  });
```

### Billing Server Functions

```typescript
// src/functions/billing.functions.ts
import { createServerFn } from '@tanstack/react-start';
import { rlsMiddleware } from '@/middleware/rls.middleware';
import type { components } from '@/types/hospici-api';

type NOEInput = components['schemas']['NOEInput'];

// Caller supplies idempotencyKey — NOE is a once-only CMS filing
export const fileNOEFn = createServerFn({ method: 'POST' })
  .middleware([rlsMiddleware])
  .validator((data: { noe: NOEInput; idempotencyKey: string }) => data)
  .handler(async ({ data, context }) => {
    const res = await fetch(`${process.env.HOSPICI_API_URL}/v1/billing/noe`, {
      method: 'POST',
      headers: {
        ...context.backendHeaders,
        'Content-Type': 'application/json',
        'Idempotency-Key': data.idempotencyKey,
      },
      body: JSON.stringify(data.noe),
    });

    const body = await res.json();

    // Return structured error for CMS violations (recoverable)
    if (!res.ok) {
      const code = body?.error?.code;
      if (code === 'NOE_LATE_FILING' || code === 'VALIDATION_ERROR') {
        return { success: false as const, error: body.error };
      }
      throw body; // Fatal — surfaces to route errorComponent
    }

    return { success: true as const, data: body.data };
  });

export const getCapUtilizationFn = createServerFn({ method: 'GET' })
  .middleware([rlsMiddleware])
  .handler(async ({ context }) => {
    const res = await fetch(`${process.env.HOSPICI_API_URL}/v1/billing/cap`, {
      headers: context.backendHeaders,
    });
    if (!res.ok) throw await res.json();
    return (await res.json()).data;
  });
```

---

## 6. Authentication & Session Management

### Token Storage Model

| Token | Storage | How it's read |
|-------|---------|---------------|
| Session | **httpOnly cookie** | `auth.api.getSession({ headers: getRequest().headers })` inside server fn |
| Access token (Socket.IO only) | **Memory** (JS variable) | Set after `loginFn` resolves; never in `localStorage` |

Server functions never need an access token from the client — they read the session cookie directly. The in-memory access token is only for the Socket.IO connection handshake.

### Login / Logout Server Functions

```typescript
// src/functions/auth.functions.ts
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { redirect } from '@tanstack/react-router';
import { auth } from '@/server/auth.server';

export const loginFn = createServerFn({ method: 'POST' })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const result = await auth.api.signInEmail({
      body: { email: data.email, password: data.password },
      headers: getRequest().headers,
      asResponse: false,
    });

    if (!result?.session) return { error: 'Invalid credentials' };

    // Better Auth sets the httpOnly session cookie on the response automatically
    return {
      success: true,
      user: {
        id:              result.user.id,
        email:           result.user.email,
        role:            result.user.role,
        locationIds:     result.user.locationIds,
        currentLocationId: result.session.activeLocationId,
        permissions:     result.user.permissions,
      },
    };
  });

export const logoutFn = createServerFn({ method: 'POST' })
  .handler(async () => {
    await auth.api.signOut({ headers: getRequest().headers });
    throw redirect({ to: '/login' });
  });

export const getCurrentSessionFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    const session = await auth.api.getSession({ headers: getRequest().headers });
    if (!session) return null;
    return {
      userId:     session.user.id,
      email:      session.user.email,
      role:       session.user.role,
      locationId: session.session.activeLocationId,
      locationIds: session.user.locationIds,
      permissions: session.user.permissions,
      breakGlass:  session.session.breakGlass ?? false,
    };
  });

export const breakGlassFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((data: { patientId: string; reason: string }) => {
    if (data.reason.length < 20) throw new Error('Reason must be at least 20 characters');
    return data;
  })
  .handler(async ({ data, context }) => {
    const res = await fetch(`${process.env.HOSPICI_API_URL}/v1/auth/break-glass`, {
      method: 'POST',
      headers: { ...context.backendHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await res.json();
    return (await res.json()).data;
  });
```

### Router Context — Session in `__root.tsx`

```typescript
// src/routes/__root.tsx
import { createRootRouteWithContext, Outlet, HeadContent, Scripts } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { getCurrentSessionFn } from '@/functions/auth.functions';

export interface RouterContext {
  queryClient: QueryClient;
  session: Awaited<ReturnType<typeof getCurrentSessionFn>>;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // Runs on every navigation — session is available in ALL child routes via context
  beforeLoad: async () => {
    const session = await getCurrentSessionFn();
    return { session };
  },
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body><Outlet /><Scripts /></body>
    </html>
  );
}
```

### Protected Layout Route

```typescript
// src/routes/_authed.tsx
// Every route under _authed/ is automatically protected
import { createFileRoute, redirect, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: () => <Outlet />,
});
```

### Role-Based Route Guard

```typescript
// src/routes/_authed/admin/audit-logs.tsx
export const Route = createFileRoute('/_authed/admin/audit-logs')({
  beforeLoad: ({ context }) => {
    if (!['admin', 'super_admin'].includes(context.session?.role ?? '')) {
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: () => getAuditLogsFn({ data: { page: 1, limit: 50 } }),
  component: AuditLogsPage,
});
```

---

## 7. Route-Level Data Loading

Route loaders call server functions. Data is available in the component via `Route.useLoaderData()` — fully typed, no extra fetch on the client.

```typescript
// src/routes/_authed/patients/$patientId/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { getPatientFn, getPainAssessmentsFn } from '@/functions/patients.functions';

export const Route = createFileRoute('/_authed/patients/$patientId/')({
  loader: async ({ params }) => {
    // Parallel — no waterfall
    const [patient, painAssessments] = await Promise.all([
      getPatientFn({ data: { patientId: params.patientId } }),
      getPainAssessmentsFn({ data: { patientId: params.patientId } }),
    ]);
    return { patient, painAssessments };
  },
  errorComponent: ({ error }) => <PatientLoadError error={error} />,
  pendingComponent: () => <PatientDetailSkeleton />,
  component: PatientDetailPage,
});

function PatientDetailPage() {
  const { patient, painAssessments } = Route.useLoaderData();
  const params = Route.useParams();
  const createPainMutation = useCreatePainAssessment(params.patientId);

  return (
    <>
      <PatientHeader patient={patient} />
      <PainAssessmentList assessments={painAssessments} />
      <PainAssessmentForm
        onSubmit={(data) => createPainMutation.mutateAsync(data)}
      />
    </>
  );
}
```

### Seeding TanStack Query from Loader (for Real-Time Updates)

When a resource needs socket-driven invalidation, seed the query cache from the loader:

```typescript
export const Route = createFileRoute('/_authed/patients/$patientId/')({
  loader: async ({ params, context }) => {
    // Seed the cache — component reads from cache, socket events invalidate it
    await context.queryClient.prefetchQuery({
      queryKey: patientKeys.detail(params.patientId),
      queryFn: () => getPatientFn({ data: { patientId: params.patientId } }),
    });
  },
  component: PatientDetailPage,
});

function PatientDetailPage() {
  const params = Route.useParams();
  const { data: patient } = usePatient(params.patientId); // reads from seeded cache
  usePatientSocketSync(params.patientId);                  // invalidates on socket events
  // ...
}
```

---

## 8. API Endpoint Structure

### Environment Variables

```env
# Server-only (.env) — NOT prefixed with VITE_, never sent to browser
HOSPICI_API_URL=http://localhost:3000   # Used inside createServerFn handlers
BETTER_AUTH_SECRET=...
DATABASE_URL=...

# Client-safe (.env) — VITE_ prefix, accessible via import.meta.env
VITE_SOCKET_URL=ws://localhost:3000
VITE_APP_VERSION=3.0.0
```

> `HOSPICI_API_URL` is server-only. The Hospici backend does not need a public URL when TanStack Start is deployed as a BFF — the server function runner can reach it on the internal network.

### Base URLs

| Environment | Hospici API (server-side) | Frontend Origin | Socket (browser) |
|-------------|--------------------------|-----------------|------------------|
| Production | `https://api.hospici.com` | `https://app.hospici.com` | `wss://realtime.hospici.com` |
| Staging | `https://staging-api.hospici.com` | `https://staging.hospici.com` | `wss://staging-realtime.hospici.com` |
| Development | `http://localhost:3000` | `http://localhost:5173` | `ws://localhost:3000` |

### Internal API Endpoints (called from `createServerFn` handlers)

```
/v1/
├── auth/
│   ├── POST /login
│   ├── POST /logout
│   └── POST /break-glass
├── patients/
│   ├── GET  /                          (paginated, RLS-scoped)
│   ├── POST /                          (admit patient, triggers NOE + benefit period)
│   ├── GET  /{patientId}
│   ├── PUT  /{patientId}
│   ├── GET  /{patientId}/pain
│   ├── POST /{patientId}/pain
│   ├── GET  /{patientId}/symptoms
│   ├── POST /{patientId}/symptoms
│   ├── GET  /{patientId}/medications
│   ├── POST /{patientId}/medications
│   ├── GET  /{patientId}/documents
│   ├── POST /{patientId}/documents     ← multipart — direct browser fetch via upload token
│   ├── GET  /{patientId}/care-plan
│   └── GET  /{patientId}/certifications
├── clinical/
│   ├── POST /assessments/hope
│   ├── POST /assessments/wound
│   └── GET  /scales/pain
├── billing/
│   ├── GET  /noe
│   ├── POST /noe                       ← Idempotency-Key required
│   ├── GET  /noe/{noeId}
│   ├── PUT  /noe/{noeId}
│   ├── GET  /benefit-periods
│   ├── GET  /cap
│   └── GET  /claims
├── scheduling/
│   ├── GET  /idg
│   ├── POST /idg
│   ├── GET  /visits
│   └── POST /aide-supervision
├── documents/
│   ├── GET  /notes
│   ├── POST /notes
│   └── POST /sign
├── reports/
│   ├── GET  /qapi
│   ├── GET  /cap
│   └── GET  /cahps
└── admin/
    ├── GET  /users
    ├── GET  /audit-logs
    └── GET  /queues
```

### FHIR Endpoints (called inside server functions)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/fhir/r4/{Resource}` | GET, POST, PUT | FHIR R4 resources |
| `/fhir/r4/{Resource}/{id}/$everything` | GET | Full patient bundle |
| `/fhir/metadata` | GET | CapabilityStatement |
| `/.well-known/smart-configuration` | GET | SMART on FHIR discovery |

---

## 9. Request / Response Contract

### Standard Response Envelope

```typescript
// Every non-FHIR response from the Hospici backend uses this shape.
// createServerFn handlers unwrap `data` before returning to the component.

interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
  links?: PaginationLinks;
}

interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Array<{ field: string; message: string; code: string }>;
    requestId: string;
    timestamp: string;
  };
}

interface PaginationMeta {
  page: number; limit: number; total: number; totalPages: number; hasMore: boolean;
}
```

### Idempotency

All POST/PUT server functions include an `Idempotency-Key`. For NOE filing — where duplicate submission has CMS consequences — the key is generated in the component and passed as a server function argument:

```typescript
// In the NOE filing component — key is stable for this mount
const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

const handleFileNOE = async (noeData: NOEInput) => {
  const result = await fileNOEFn({ data: { noe: noeData, idempotencyKey } });
  if (!result.success) handleApiError(result.error);
};
```

### ETag Concurrency Control

```typescript
// src/functions/clinical.functions.ts

export const getCarePlanFn = createServerFn({ method: 'GET' })
  .middleware([rlsMiddleware])
  .validator((data: { patientId: string }) => data)
  .handler(async ({ data, context }) => {
    const res = await fetch(
      `${process.env.HOSPICI_API_URL}/v1/patients/${data.patientId}/care-plan`,
      { headers: context.backendHeaders },
    );
    const etag = res.headers.get('ETag') ?? '';
    return { carePlan: (await res.json()).data, etag };
  });

export const updateCarePlanFn = createServerFn({ method: 'POST' })
  .middleware([rlsMiddleware])
  .validator((data: { patientId: string; carePlan: CarePlanInput; etag: string }) => data)
  .handler(async ({ data, context }) => {
    const res = await fetch(
      `${process.env.HOSPICI_API_URL}/v1/patients/${data.patientId}/care-plan`,
      {
        method: 'PUT',
        headers: {
          ...context.backendHeaders,
          'Content-Type': 'application/json',
          'If-Match': data.etag,   // 409 if another user saved first
        },
        body: JSON.stringify(data.carePlan),
      },
    );
    if (res.status === 409) return { success: false as const, error: { code: 'ETAG_MISMATCH' } };
    if (!res.ok) throw await res.json();
    return { success: true as const, data: (await res.json()).data };
  });
```

---

## 10. TanStack Query Integration

### Query Client

```typescript
// src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: (count, error: any) => {
        if (error?.error?.code) return false; // API errors — don't retry
        return count < 2;
      },
    },
    mutations: {
      retry: false, // Never auto-retry — risk of duplicate clinical submissions
    },
  },
});
```

### Router Context Setup

```typescript
// src/router.tsx
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { queryClient } from './lib/query-client';

export function getRouter() {
  return createRouter({
    routeTree,
    context: { queryClient, session: null },
    scrollRestoration: true,
  });
}
```

### Query Key Factory + Hooks

```typescript
// src/hooks/use-patient.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import {
  getPatientFn,
  getPainAssessmentsFn,
  createPainAssessmentFn,
} from '@/functions/patients.functions';
import type { components } from '@/types/hospici-api';

type PainAssessmentInput = components['schemas']['PainAssessmentInput'];

// Centralised key factory — no magic strings in components
export const patientKeys = {
  all:       () => ['patients'] as const,
  list:      (q?: object)  => [...patientKeys.all(), 'list', q] as const,
  detail:    (id: string)  => [...patientKeys.all(), 'detail', id] as const,
  pain:      (id: string)  => [...patientKeys.detail(id), 'pain'] as const,
  symptoms:  (id: string)  => [...patientKeys.detail(id), 'symptoms'] as const,
  carePlan:  (id: string)  => [...patientKeys.detail(id), 'care-plan'] as const,
};

export function usePatient(patientId: string) {
  const fn = useServerFn(getPatientFn);
  return useQuery({
    queryKey: patientKeys.detail(patientId),
    queryFn:  () => fn({ data: { patientId } }),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePainAssessments(patientId: string) {
  const fn = useServerFn(getPainAssessmentsFn);
  return useQuery({
    queryKey: patientKeys.pain(patientId),
    queryFn:  () => fn({ data: { patientId } }),
    staleTime: 60 * 1000,
  });
}

export function useCreatePainAssessment(patientId: string) {
  const queryClient = useQueryClient();
  const fn = useServerFn(createPainAssessmentFn);

  return useMutation({
    mutationFn: (assessment: PainAssessmentInput) =>
      fn({ data: { patientId, assessment, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.pain(patientId) });
      queryClient.invalidateQueries({ queryKey: patientKeys.detail(patientId) });
    },
  });
}

// Invalidate queries on socket events — keeps UI live
export function usePatientSocketSync(patientId: string) {
  const queryClient = useQueryClient();
  useSocketEvent('patient:updated',     ({ patientId: id }) => {
    if (id === patientId) queryClient.invalidateQueries({ queryKey: patientKeys.detail(patientId) });
  });
  useSocketEvent('pain:assessment:new', ({ patientId: id }) => {
    if (id === patientId) queryClient.invalidateQueries({ queryKey: patientKeys.pain(patientId) });
  });
}
```

---

## 11. Real-Time Communication (Socket.IO)

Socket.IO connects from the **browser** directly to the Hospici backend WebSocket server. It is the only integration path that does not go through TanStack Start server functions.

### Event Type Contracts

```typescript
// packages/shared-types/src/socket.ts — imported by both Backend and Frontend

export interface ServerToClientEvents {
  // Clinical
  'patient:updated':         (d: { patientId: string; updatedBy: string; timestamp: string }) => void;
  'pain:assessment:new':     (d: { patientId: string; patientName: string; urgent: boolean; alertMessage?: string }) => void;
  'medication:administered': (d: { patientId: string; medicationName: string; administeredBy: string; timestamp: string }) => void;

  // CMS Compliance Alerts
  'noe:deadline:warning':     (d: { noeId: string; patientId: string; patientName: string; deadline: string; businessDaysRemaining: number }) => void;
  'idg:due:warning':          (d: { patientId: string; patientName: string; daysOverdue: number }) => void;
  'cap:threshold:alert':      (d: { locationId: string; capYear: number; utilizationPercent: number; projectedOverage: number }) => void;
  'aide:supervision:overdue': (d: { aideId: string; aideName: string; patientId: string; daysOverdue: number }) => void;

  // IDG
  'idg:meeting:started': (d: { meetingId: string; attendees: Array<{ userId: string; name: string; role: string }> }) => void;
  'idg:meeting:ended':   (d: { meetingId: string }) => void;

  // Notifications
  'notification:new': (d: { id: string; type: 'alert' | 'warning' | 'info'; title: string; message: string; requiresAcknowledgement: boolean }) => void;

  // System
  'system:maintenance': (d: { scheduledAt: string; durationMinutes: number }) => void;
  'session:expiring':   (d: { expiresInSeconds: number }) => void;
}

export interface ClientToServerEvents {
  'presence:join':       (d: { locationId: string }) => void;
  'presence:leave':      () => void;
  'presence:heartbeat':  () => void;
  'note:editing:start':  (d: { noteId: string }) => void;
  'note:editing:stop':   (d: { noteId: string }) => void;
  'idg:join':            (d: { meetingId: string }) => void;
  'idg:leave':           (d: { meetingId: string }) => void;
  'notification:acknowledge': (d: { notificationId: string }) => void;
}
```

### Socket Client (Browser-Side)

```typescript
// src/lib/realtime/socket.ts
import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@hospici/shared-types/socket';

type HospiciSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let _socket: HospiciSocket | null = null;
let _accessToken: string | null = null; // Memory only — never localStorage

export function setSocketToken(token: string) { _accessToken = token; }
export function clearSocketToken()            { _accessToken = null;  }

export function initSocket(): HospiciSocket {
  if (_socket?.connected) return _socket;

  _socket = io(import.meta.env.VITE_SOCKET_URL, {
    auth:                { token: _accessToken },
    transports:          ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay:    1000,
  });

  _socket.on('session:expiring', ({ expiresInSeconds }) => {
    // Trigger a silent refresh before the socket auth token expires
    if (expiresInSeconds < 90) window.dispatchEvent(new Event('auth:refresh'));
  });

  return _socket;
}

export function getSocket(): HospiciSocket {
  if (!_socket) throw new Error('Socket not initialized — call initSocket() after login');
  return _socket;
}

export function disconnectSocket() { _socket?.disconnect(); _socket = null; }
```

### Socket Event Hook

```typescript
// src/hooks/use-socket-event.ts
import { useEffect } from 'react';
import { getSocket } from '@/lib/realtime/socket';
import type { ServerToClientEvents } from '@hospici/shared-types/socket';

export function useSocketEvent<K extends keyof ServerToClientEvents>(
  event: K,
  handler: ServerToClientEvents[K],
) {
  useEffect(() => {
    const socket = getSocket();
    socket.on(event, handler as never);
    return () => { socket.off(event, handler as never); };
  }, [event, handler]);
}
```

---

## 12. Error Handling Contract

### Error Code Registry

| Code | HTTP | Meaning | Server Function Action |
|------|------|---------|----------------------|
| `UNAUTHORIZED` | 401 | Session missing / expired | `throw redirect({ to: '/login' })` |
| `FORBIDDEN` | 403 | Permission denied | Throw — `beforeLoad` or `errorComponent` handles |
| `NOT_FOUND` | 404 | Resource doesn't exist | Return `null` or throw — route `errorComponent` |
| `VALIDATION_ERROR` | 400 | TypeBox schema violation | Return structured error — form shows field errors |
| `RLS_VIOLATION` | 403 | Cross-location access | Throw — triggers security event |
| `CMS_VIOLATION` | 422 | Business rule violation | Return structured error — compliance UI |
| `NOE_LATE_FILING` | 422 | NOE after 5-day deadline | Return — form shows reason input |
| `IDG_OVERDUE` | 422 | Care plan blocked | Return — triggers IDG scheduling modal |
| `ETAG_MISMATCH` | 409 | Concurrent edit | Return — component shows merge dialog |
| `RATE_LIMITED` | 429 | Too many requests | Throw — retry after `Retry-After` header |
| `SERVER_ERROR` | 500 | Unhandled backend error | Throw — route `errorComponent` shows `requestId` |

### Client Error Handler

```typescript
// src/lib/errors/handler.ts
import { toast } from 'sonner';

export function handleApiError(error: { code: string; message: string; requestId?: string }) {
  switch (error.code) {
    case 'VALIDATION_ERROR':
      return { type: 'validation' as const };

    case 'NOE_LATE_FILING':
    case 'IDG_OVERDUE':
    case 'CMS_VIOLATION':
      toast.warning(`CMS Compliance: ${error.message}`, {
        duration: 12000,
        action: { label: 'Learn more', onClick: () => window.open('/docs/cms-rules', '_blank') },
      });
      return { type: 'cms' as const };

    case 'ETAG_MISMATCH':
      toast.error('This record was updated by someone else. Please reload and try again.');
      return { type: 'conflict' as const };

    case 'RLS_VIOLATION':
      toast.error('Security Alert: Unauthorized access attempt has been logged.');
      console.error('[SECURITY EVENT]', error);
      return { type: 'security' as const };

    case 'SERVER_ERROR':
      toast.error(`Server error. Reference: ${error.requestId}`);
      return { type: 'server' as const };

    default:
      toast.error(error.message || 'An unexpected error occurred.');
      return { type: 'unknown' as const };
  }
}
```

---

## 13. FHIR Resource Handling

FHIR requests are made inside server functions — the browser never calls FHIR endpoints directly.

```typescript
// src/functions/fhir.functions.ts
import { createServerFn } from '@tanstack/react-start';
import { rlsMiddleware } from '@/middleware/rls.middleware';

export const getFhirPatientFn = createServerFn({ method: 'GET' })
  .middleware([rlsMiddleware])
  .validator((data: { patientId: string; fhirVersion?: '4.0' | '6.0' }) => data)
  .handler(async ({ data, context }) => {
    const version = data.fhirVersion ?? '4.0';
    const res = await fetch(
      `${process.env.HOSPICI_API_URL}/fhir/r4/Patient/${data.patientId}`,
      {
        headers: {
          ...context.backendHeaders,
          'Accept': `application/fhir+json; fhirVersion=${version}`,
        },
      },
    );
    if (!res.ok) throw await res.json(); // FhirOperationOutcome
    return res.json();
  });

export const getPatientEverythingFn = createServerFn({ method: 'GET' })
  .middleware([rlsMiddleware])
  .validator((data: { patientId: string }) => data)
  .handler(async ({ data, context }) => {
    const res = await fetch(
      `${process.env.HOSPICI_API_URL}/fhir/r4/Patient/${data.patientId}/$everything`,
      { headers: context.backendHeaders },
    );
    if (!res.ok) throw await res.json();
    return res.json(); // FhirBundle
  });
```

---

## 14. File Upload Contract

File uploads are the one case where the browser fetches directly — server functions don't handle streaming multipart well. The browser gets a short-lived upload token via server function, then sends the file directly.

```typescript
// src/functions/documents.functions.ts
export const getUploadTokenFn = createServerFn({ method: 'POST' })
  .middleware([rlsMiddleware])
  .validator((data: { patientId: string; fileType: string; fileSizeBytes: number }) => data)
  .handler(async ({ data, context }) => {
    const res = await fetch(
      `${process.env.HOSPICI_API_URL}/v1/patients/${data.patientId}/documents/upload-token`,
      {
        method: 'POST',
        headers: { ...context.backendHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
    if (!res.ok) throw await res.json();
    return (await res.json()).data as { uploadToken: string; uploadUrl: string };
  });
```

```typescript
// src/lib/upload.ts — browser-side
export async function uploadDocument(
  patientId: string,
  file: File,
  metadata: { type: string; description: string },
  onProgress?: (pct: number) => void,
): Promise<{ documentId: string }> {
  const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'text/xml'];
  if (!ALLOWED.includes(file.type)) throw new Error(`File type ${file.type} not allowed`);
  if (file.size > 50 * 1024 * 1024)  throw new Error('File exceeds 50 MB limit');

  const { uploadToken, uploadUrl } = await getUploadTokenFn({
    data: { patientId, fileType: file.type, fileSizeBytes: file.size },
  });

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify(metadata));

    const xhr = new XMLHttpRequest();
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText).data);
      else reject(new Error(`Upload failed: ${xhr.status}`));
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));

    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${uploadToken}`);
    xhr.setRequestHeader('X-Request-ID', crypto.randomUUID());
    // No Content-Type header — browser sets it with multipart boundary automatically
    xhr.send(formData);
  });
}
```

---

## 15. Offline Support & Sync

```typescript
// src/lib/offline/sync.ts
import { openDB } from 'idb';

interface SyncOperation {
  id?: number;
  idempotencyKey: string;   // Prevents double-submit when sync runs after reconnect
  endpoint: string;
  method: 'POST' | 'PUT';
  body: unknown;
  timestamp: number;
  retryCount: number;
  patientId?: string;
}

const db = await openDB('hospici-offline', 2, {
  upgrade(db) {
    const store = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
    store.createIndex('by-timestamp', 'timestamp');
  },
});

export async function queueOperation(
  op: Omit<SyncOperation, 'id' | 'retryCount' | 'timestamp'>,
) {
  await db.add('syncQueue', { ...op, retryCount: 0, timestamp: Date.now() });
}

// Replay queued operations when connectivity returns
window.addEventListener('online', async () => {
  const ops = await db.getAllFromIndex('syncQueue', 'by-timestamp');
  for (const op of ops) {
    try {
      const res = await fetch(op.endpoint, {
        method: op.method,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': op.idempotencyKey, // Safe to re-send — backend deduplicates
        },
        credentials: 'include',
        body: JSON.stringify(op.body),
      });

      if (res.ok || res.status === 409) {
        await db.delete('syncQueue', op.id!);
      } else if (res.status >= 500) {
        await db.put('syncQueue', { ...op, retryCount: op.retryCount + 1 });
      } else {
        await db.delete('syncQueue', op.id!); // Client error — surface to user
        window.dispatchEvent(new CustomEvent('sync:error', { detail: op }));
      }
    } catch { /* network error — keep in queue */ }
  }
});

// PHI hygiene: clear offline data on logout
export async function clearOfflineData() {
  await db.clear('syncQueue');
}
```

> **HIPAA note:** IndexedDB is not encrypted. Only cache minimum necessary data. Never cache SSN, full DOB, or MRN. Call `clearOfflineData()` in `logoutFn` and on `visibilitychange` when the session has ended.

---

## 16. Security Requirements

### CORS Policy

```yaml
allowed_origins:
  production:  [https://app.hospici.com]
  staging:     [https://staging.hospici.com]
  development: [http://localhost:5173]

allowed_methods:  [GET, POST, PUT, PATCH, DELETE, OPTIONS]
allowed_headers:  [Authorization, Content-Type, X-Request-ID, Idempotency-Key, If-Match, X-Location-ID]
expose_headers:   [ETag, X-Request-ID, Retry-After]
credentials: true
max_age: 86400
```

### Content Security Policy (TanStack Start / Vite)

```typescript
// app.config.ts
import { defineConfig } from '@tanstack/react-start/config';

export default defineConfig({
  server: {
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        `connect-src 'self' wss://realtime.hospici.com`,
        "img-src 'self' data: blob: https:",
        "font-src 'self'",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "upgrade-insecure-requests",
      ].join('; '),
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  },
});
```

### Token Security Summary

| Concern | Mitigation |
|---------|-----------|
| Session theft via XSS | httpOnly cookie — JS cannot read it; Better Auth sets `SameSite=Strict` |
| CSRF | SameSite=Strict; server functions POST by default; no cookie-only auth for mutations |
| Token in localStorage | Never — server functions read the cookie; access token lives in a JS closure |
| Offline PHI in IndexedDB | `clearOfflineData()` on logout; no sensitive identifiers cached |

---

## 17. CMS Compliance UI Contracts

These are non-optional UI behaviors. They are the frontend expression of the CMS rules enforced by the backend.

### 17.1 NOE 5-Day Warning Banner

Triggered by `noe:deadline:warning` socket event or polling in the `billing/noe` loader.

- `businessDaysRemaining === 0` → **red persistent banner**, blocks navigation away from billing
- `businessDaysRemaining === 1` → amber banner with "File Now" CTA
- `businessDaysRemaining <= 2` → yellow informational banner

### 17.2 Late NOE Filing — Justification Required

When `fileNOEFn` returns `{ success: false, error: { code: 'NOE_LATE_FILING' } }`:
- Show a `<textarea>` inline in the NOE form (minLength 20, validated client-side)
- Re-submit with `lateFilingReason` populated
- Never disable the form entirely — the clinician must be able to file with a reason

### 17.3 IDG Overdue — Hard Block

When `updateCarePlanFn` returns `{ success: false, error: { code: 'IDG_OVERDUE' } }`:
- Show a modal: *"Care plan update blocked — IDG meeting is X days overdue"*
- One action only: **"Schedule IDG Meeting"** → `router.navigate({ to: '/scheduling/idg/new' })`
- No dismiss option — this is a hard CMS block

### 17.4 Hospice Cap Alert

When `cap:threshold:alert` fires with `utilizationPercent >= 80`:
- Persistent badge in billing sidebar: *"Cap: 82.4% — $12,400 projected overage"*
- Links to `/reports/cap`
- Informational only — no workflow blocked

### 17.5 Aide Supervision Overdue

When `aide:supervision:overdue` fires:
- Red badge on the aide's schedule card
- Blocks new aide visit documentation for that patient until supervision is recorded
- Does not block other clinician workflows

---

## 18. API Versioning & Breaking Changes

| Version | Status | Sunset |
|---------|--------|--------|
| v2 | **Current** | — |
| v1 | Deprecated | 2026-09-01 |

Version check runs in `__root.tsx` `beforeLoad`:

```typescript
export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const session = await getCurrentSessionFn();

    const health = await fetch(`${import.meta.env.VITE_HEALTH_URL}/health`).then(r => r.json());
    if (health.minClientVersion && semverLt(import.meta.env.VITE_APP_VERSION, health.minClientVersion)) {
      window.location.reload(); // Pick up new assets
    }

    return { session };
  },
});
```

---

## 19. Development Workflow

### Setup

```bash
# From monorepo root
npm install

# Start Hospici backend first (port 3000 — needed for type generation)
cd Backend && npm run dev &

# Generate frontend types
cd Frontend && npm run generate:types

# Start TanStack Start dev server
npm run dev
# → http://localhost:5173
```

### vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';

export default defineConfig({
  plugins: [tanstackStart(), react()],
  resolve: { alias: { '@': '/src' } },
});
```

### Key Scripts

```bash
npm run dev                    # Vite HMR dev server
npm run build                  # Production build
npm run start                  # Serve production build
npm run generate:types         # openapi-typescript ← localhost:3000
npm run generate:types:staging # openapi-typescript ← staging
npm run watch:types            # Regenerate on openapi.yaml change
npm run typecheck              # tsc --noEmit
npm run lint                   # Biome lint + format check
```

### Contract Testing

```typescript
// tests/contract/patient.test.ts
import { test, expect } from 'vitest';
import { getPatientFn } from '@/functions/patients.functions';
import { PatientValidator } from '@hospici/shared-types/clinical';

test('getPatientFn response satisfies PatientSchema', async () => {
  const patient = await getPatientFn({ data: { patientId: 'test-uuid' } });
  const valid = PatientValidator.Check(patient);
  if (!valid) {
    throw new Error(
      `Contract violation:\n${JSON.stringify([...PatientValidator.Errors(patient)], null, 2)}`,
    );
  }
  expect(valid).toBe(true);
});
```

---

## 20. Quick Reference

### HTTP Status Codes

| Code | Meaning | Action in server function |
|------|---------|--------------------------|
| 200 | OK | Unwrap `data` field and return |
| 201 | Created | Unwrap `data`, caller invalidates list query |
| 204 | No Content | Return `undefined` |
| 400 | Validation error | Return structured error; form shows `error.details` |
| 401 | Unauthorized | `throw redirect({ to: '/login' })` |
| 403 | Forbidden / RLS | Throw — `errorComponent` or security handler |
| 404 | Not found | Return `null` or throw |
| 409 | ETag conflict | Return `{ success: false, error: { code: 'ETAG_MISMATCH' } }` |
| 422 | CMS violation | Return structured error; compliance UI renders |
| 429 | Rate limited | Throw — `Retry-After` header present |
| 500 | Server error | Throw — `errorComponent` shows `requestId` |

### Required Backend Headers (set inside server functions)

| Header | Required | Value |
|--------|----------|-------|
| `X-Request-ID` | Yes | `crypto.randomUUID()` |
| `Content-Type` | Yes (POST/PUT) | `application/json` |
| `Idempotency-Key` | Yes (POST/PUT) | Caller-supplied UUID |
| `If-Match` | Yes (PUT clinical) | ETag from prior GET |
| `X-Location-ID` | Auto via `rlsMiddleware` | From session |
| `Accept` | FHIR only | `application/fhir+json; fhirVersion=4.0` |

### Environment Variables

```env
# Server-only (no VITE_ prefix — never in browser bundle)
HOSPICI_API_URL=http://localhost:3000
BETTER_AUTH_SECRET=...
DATABASE_URL=...

# Client-safe (VITE_ prefix — available via import.meta.env)
VITE_SOCKET_URL=ws://localhost:3000
VITE_APP_VERSION=3.0.0
VITE_HEALTH_URL=http://localhost:3000
```

### Pre-Integration Checklist

- [ ] `tanstackStart()` plugin present in `vite.config.ts`
- [ ] `npm run generate:types` succeeds with no errors
- [ ] All protected routes live under `src/routes/_authed/`
- [ ] `_authed.tsx` has session guard in `beforeLoad`
- [ ] Router context typed via `createRootRouteWithContext<RouterContext>()`
- [ ] Session read via `getCurrentSessionFn` (server fn) — not localStorage
- [ ] All backend calls use `createServerFn` — no raw `fetch` in components
- [ ] `useServerFn` wraps server functions used in `useQuery` / `useMutation`
- [ ] `idempotencyKey` passed to all POST mutations, caller-generated for NOE
- [ ] ETag captured in loader, passed back to update server function
- [ ] Socket.IO initialized after login; access token in memory only
- [ ] Socket events call `queryClient.invalidateQueries()` — not direct state mutation
- [ ] CMS compliance UI patterns implemented (§17)
- [ ] `clearOfflineData()` called on logout
- [ ] Server-only secrets have no `VITE_` prefix
- [ ] Contract tests passing against local backend

---

_Hospici Frontend Contract v3.0 — TanStack Start · TypeBox-first · CMS-compliant · HIPAA-secure_
