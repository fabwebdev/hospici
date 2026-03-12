# CLAUDE.md — Hospici Frontend

> Also read: [`../CLAUDE.md`](../CLAUDE.md) for monorepo-wide rules.
> Do NOT read `../backend/CLAUDE.md` for frontend work — it is backend-specific.

---

## Framework: TanStack Start (Vinxi) — Not Next.js

This is **not** a Next.js app. Never generate Next.js patterns.

| Concern | Correct | Wrong |
|---------|---------|-------|
| Framework | `@tanstack/react-start` | `next` |
| Route files | `createFileRoute` / `createRootRouteWithContext` | App Router, `pages/` |
| Server logic | `createServerFn` + `createMiddleware` | Server Actions, Route Handlers |
| Data loading | `loader` in route + `createServerFn` | `fetch` in Server Components |
| Auth guard | `src/routes/_authed.tsx` `beforeLoad` | `middleware.ts` (Next.js style) |
| Config | `vite.config.ts` + `app.config.ts` | `next.config.ts` |
| Client env vars | `import.meta.env.VITE_*` | `process.env.NEXT_PUBLIC_*` |
| Dev server | `localhost:5173` | `localhost:3000` |
| RSC | Not supported | — |

---

## File Naming Conventions

```
src/
├── routes/
│   ├── __root.tsx          # Root layout + router context
│   ├── _authed.tsx         # Auth guard (beforeLoad check) — wrap all protected routes here
│   ├── _authed/            # Protected route subtree
│   └── login.tsx           # Public route
├── middleware/
│   ├── auth.middleware.ts  # Better Auth middleware (createMiddleware)
│   └── rls.middleware.ts   # RLS context middleware
├── lib/
│   ├── env.client.ts       # Client-side env (import.meta.env.VITE_*)
│   └── env.server.ts       # Server-side env (process.env.*) — server only
├── hooks/
│   ├── realtime/           # Socket.IO hooks
│   ├── query/              # TanStack Query hooks
│   ├── socket/             # Socket.IO connection hooks
└── functions/
    └── auth.functions.ts   # Example: createServerFn wrappers
```

### Suffix rules — strictly enforced
- `.server.ts` — server-only code. **Never import from a client component.**
- `.functions.ts` — `createServerFn` wrappers. Safe to import anywhere (client or server).
- No suffix — client-safe code only.

---

## Authentication & Token Storage

```typescript
// ✅ CORRECT — access token in memory (JS closure) only
const tokenStore = { token: null as string | null };

// ❌ WRONG — never store access tokens here
localStorage.setItem('token', accessToken);
sessionStorage.setItem('token', accessToken);
```

- **Access tokens:** memory only (JS closure)
- **Session/refresh tokens:** httpOnly cookie set by Better Auth — JS cannot read it
- **Socket.IO auth:** pass memory-stored access token in the `auth` option at connection time
- **On logout:** clear any in-memory token state (access token closure reset to null)

---

## Cross-Package Imports

```typescript
// ✅ CORRECT — use the shared-types workspace package
import type { PatientSchema } from "@hospici/shared-types";

// ❌ WRONG — never reach into backend source directly
import type { PatientSchema } from "../../backend/src/schemas/patient.schema";
```

---

## Environment Variables

```typescript
// ✅ Client-side (src/lib/env.client.ts)
const apiUrl = import.meta.env.VITE_API_URL;

// ✅ Server-side only (src/lib/env.server.ts or *.server.ts files)
const dbUrl = process.env.DATABASE_URL;

// ❌ Never use NEXT_PUBLIC_ prefix
const wrong = process.env.NEXT_PUBLIC_API_URL;
```

---

## Server Functions Pattern

```typescript
// ✅ CORRECT — createServerFn in a .functions.ts file
// src/functions/patient.functions.ts
import { createServerFn } from "@tanstack/react-start";

export const getPatientFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => PatientQueryValidator.Decode(data))
  .handler(async ({ data }) => {
    // server-only logic here
  });

// ❌ WRONG — never put createServerFn logic in route files or client components
```

---

## CMS Compliance UI Rules

- **IDG overdue response:** when a server function returns `{ code: 'IDG_OVERDUE' }`, show a modal with **one action only** — "Schedule IDG Meeting". No dismiss button, no close X.
- **NOE deadline display:** always show the business-day-adjusted deadline, never raw `+5 days`.
- **PHI fields:** never store in `localStorage` or `sessionStorage`.

---

## Testing

- **Contract tests:** `tests/contract/` — required for every new server function
- **Unit tests:** alongside source (`patient.functions.ts` → `patient.functions.test.ts`)
- **Test runner:** Vitest

---

## What Claude Must Never Do in This Package

- Generate `next`, `next/router`, `next/navigation`, or any Next.js import
- Generate `process.env.NEXT_PUBLIC_*` env vars
- Generate `localStorage.setItem` or `sessionStorage.setItem` for tokens or PHI
- Import from `../../backend/src/...` — use `@hospici/shared-types`
- Put `createServerFn` inside route files or component files
- Put server-only logic in a file without the `.server.ts` suffix
- Generate RSC (React Server Components) — not supported in TanStack Start

---

_frontend/CLAUDE.md — Hospici Frontend Rules_
