# Biome Integration

Hospici uses Biome as the all-in-one linter and formatter (replaces ESLint + Prettier).
The review skill runs Biome as a gate and surfaces its findings in the unified report.

---

## Running Biome

```bash
# Full check with JSON output for parsing
npx biome check --reporter=json . 2>/dev/null

# Format check only (no fixes)
npx biome format --write=false .

# Lint check only
npx biome lint .

# CI mode (exits non-zero on any error)
npx biome ci .
```

## Parsing Biome JSON Output

```typescript
interface BiomeOutput {
  diagnostics: BiomeDiagnostic[]
  summary: { errorCount: number; warningCount: number; infoCount: number }
}

interface BiomeDiagnostic {
  category: string        // e.g. "lint/suspicious/noExplicitAny"
  severity: "error" | "warning" | "information"
  description: string
  location: {
    path: { file: string }
    span: { start: { line: number; character: number } }
  }
}
```

Map Biome severity to review severity:
- `error` → 🔴 Critical (blocks commit)
- `warning` → 🟡 Warning
- `information` → 🔵 Info

---

## Hospici-Specific Biome Rules

The following Biome rules are especially important in a HIPAA EHR context.
Flag violations with extra context beyond Biome's default message:

### lint/suspicious/noExplicitAny
**Extra context**: Untyped clinical data is a runtime risk. PHI in `any`-typed fields
cannot be tracked or audited. Always define explicit types for patient-related objects.

### lint/correctness/noUnusedVariables
**Extra context**: Unused imports in route handlers often indicate dead code paths that
may have originally handled PHI cleanup or audit logging — verify before removing.

### lint/security/noGlobalEval
**Extra context**: Critical in EHR — `eval()` with user-supplied data is an injection risk.

### lint/nursery/noConsole
**Extra context**: `console.log` in production EHR code risks PHI leakage to log aggregators.
Enforce use of structured logger (`pino`) with PHI-safe field filtering.

### lint/style/useConst
**Extra context**: Mutable `let` for patient objects risks accidental mutation of clinical data
mid-request. Prefer `const` and immutable patterns.

---

## Biome Config Validation

Check that `biome.json` at repo root includes these required settings for Hospici:

```json
{
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "error"
      },
      "nursery": {
        "noConsole": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "files": {
    "ignore": ["node_modules", "dist", "migrations", "*.generated.ts"]
  }
}
```

Flag if `biome.json` is missing or `noExplicitAny` is not set to `error` → 🟡 Warning

---

## Deduplication with Base Checklist

Do NOT create duplicate findings. If a Biome error overlaps with a base checklist finding:
- Keep the base checklist finding (it has more EHR-specific context)
- Drop the Biome finding from the report
- Note in terminal: `[BIOME] 2 findings merged with base checklist`

Overlap cases:
- Biome `noConsole` + base checklist W-02 (console.log with patient fields) → keep W-02
- Biome `noExplicitAny` + base checklist I-02 (any type) → keep I-02
