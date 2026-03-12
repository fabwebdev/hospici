# Hospici Design System

**Version:** 2.0
**Date:** 2026-03-11
**Status:** Canonical Reference — Pre-Production
**Stack:** shadcn/ui · Tailwind CSS · Radix UI · Lucide React · TanStack Start

> This is the single source of truth for all UI components, design tokens, and clinical interaction patterns in the Hospici frontend. Read before generating any component, styling rule, or layout.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Path Alias & Configuration](#2-path-alias--configuration)
3. [Design Tokens — OKLCH Color System](#3-design-tokens--oklch-color-system)
4. [Tailwind Configuration](#4-tailwind-configuration)
5. [Typography](#5-typography)
6. [Spacing System](#6-spacing-system)
7. [Core Components](#7-core-components)
8. [CMS Compliance UI Components](#8-cms-compliance-ui-components)
9. [Clinical Workflow Patterns](#9-clinical-workflow-patterns)
10. [Accessibility](#10-accessibility)
11. [Performance](#11-performance)
12. [Component Installation](#12-component-installation)
13. [File Structure](#13-file-structure)
14. [Change Log](#14-change-log)

---

## 1. Architecture Overview

| Concern | Technology |
|---------|-----------|
| Component library | shadcn/ui v2+ (Radix UI primitives, copy-owned) |
| Styling | Tailwind CSS v3 (v4 migration path in §4) |
| Color system | OKLCH design tokens via CSS custom properties |
| Typography | Inter (UI), JetBrains Mono (clinical numeric data) |
| Icons | Lucide React |
| Animations | `tailwindcss-animate` plugin |
| Toast | Sonner (not shadcn Toast) |
| Framework | TanStack Start — component imports use `@/` alias to `src/` |

### What "copy-owned" means
shadcn/ui components are **copied into `src/components/ui/`** — not installed as a node_module dependency. You own the code. Customizations go directly in those files; never edit `node_modules`.

---

## 2. Path Alias & Configuration

All component imports use the `@/` alias pointing to `frontend/src/`. This must be configured in both Vite and TypeScript:

**`vite.config.ts`**
```typescript
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**`tsconfig.json`**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Usage:
```typescript
// ✅ Correct — use @/ alias
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ❌ Wrong — relative paths for ui components
import { Button } from "../../components/ui/button";
```

---

## 3. Design Tokens — OKLCH Color System

All tokens are defined in `src/globals.css`. Tailwind CSS references them via `hsl(var(--token))` wrappers in `tailwind.config.ts`.

OKLCH provides perceptually uniform color progression and superior dark mode consistency over HSL.

```css
/* src/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* === Clinical Blue (Primary) === */
    --primary: oklch(0.623 0.214 259.8);
    --primary-foreground: oklch(1 0 0);

    /* === Slate (Secondary) === */
    --secondary: oklch(0.511 0.039 257.3);
    --secondary-foreground: oklch(1 0 0);

    /* === Surfaces === */
    --background: oklch(1 0 0);
    --foreground: oklch(0.228 0.037 265.8);

    --card: oklch(1 0 0);
    --card-foreground: oklch(0.228 0.037 265.8);

    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.228 0.037 265.8);

    /* === Muted & Accent === */
    --muted: oklch(0.965 0.009 264.5);
    --muted-foreground: oklch(0.511 0.039 257.3);
    --accent: oklch(0.965 0.009 264.5);
    --accent-foreground: oklch(0.228 0.037 265.8);

    /* === Semantic — Clinical Status === */
    --destructive: oklch(0.577 0.245 27.3);       /* Critical / error */
    --destructive-foreground: oklch(1 0 0);

    --warning: oklch(0.769 0.188 84.6);            /* Caution / overdue alerts */
    --warning-foreground: oklch(0.228 0.037 265.8);

    --success: oklch(0.527 0.154 150.1);           /* Stable / completed */
    --success-foreground: oklch(1 0 0);

    --clinical: oklch(0.591 0.126 181.3);          /* Healthcare CTA / informational */
    --clinical-foreground: oklch(1 0 0);

    /* === Borders & Inputs === */
    --border: oklch(0.903 0.014 264.5);
    --input: oklch(0.903 0.014 264.5);
    --ring: oklch(0.623 0.214 259.8);

    /* === Radius === */
    --radius: 0.5rem;
  }

  .dark {
    --primary: oklch(0.623 0.214 259.8);
    --primary-foreground: oklch(1 0 0);

    --secondary: oklch(0.295 0.031 257.3);
    --secondary-foreground: oklch(0.965 0.009 264.5);

    --background: oklch(0.228 0.037 265.8);
    --foreground: oklch(0.965 0.009 264.5);

    --card: oklch(0.228 0.037 265.8);
    --card-foreground: oklch(0.965 0.009 264.5);

    --popover: oklch(0.228 0.037 265.8);
    --popover-foreground: oklch(0.965 0.009 264.5);

    --muted: oklch(0.295 0.031 257.3);
    --muted-foreground: oklch(0.634 0.028 258.1);

    --accent: oklch(0.295 0.031 257.3);
    --accent-foreground: oklch(0.965 0.009 264.5);

    --destructive: oklch(0.432 0.189 27.3);
    --destructive-foreground: oklch(0.965 0.009 264.5);

    --warning: oklch(0.618 0.158 84.6);
    --warning-foreground: oklch(0.965 0.009 264.5);

    --success: oklch(0.432 0.126 150.1);
    --success-foreground: oklch(0.965 0.009 264.5);

    --clinical: oklch(0.489 0.106 181.3);
    --clinical-foreground: oklch(0.965 0.009 264.5);

    --border: oklch(0.295 0.031 257.3);
    --input: oklch(0.295 0.031 257.3);
    --ring: oklch(0.508 0.176 258.1);
  }
}
```

### Semantic Color Usage Guide

| Token | When to use |
|-------|-------------|
| `destructive` | Critical alerts, allergy warnings, hard blocks (IDG overdue), delete actions |
| `warning` | Overdue deadlines, approaching thresholds (cap year 80%), non-urgent caution |
| `success` | Completed assessments, saved records, passing status |
| `clinical` | Clinical decision support, FHIR resource indicators, informational prompts |
| `primary` | Primary actions (Save, Submit, Begin Assessment) |
| `muted` | Secondary text, timestamps, read-only labels |

---

## 4. Tailwind Configuration

**`tailwind.config.ts`** — note content paths point to `src/`, not `app/` or `pages/`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./app.config.ts",
    "./index.html",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        clinical: {
          DEFAULT: "hsl(var(--clinical))",
          foreground: "hsl(var(--clinical-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-subtle": "pulse-subtle 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

> **Tailwind v4 note:** If upgrading to Tailwind v4, the config moves into `src/globals.css` as `@theme` directives and `tailwind.config.ts` is removed. The OKLCH tokens above are natively supported in v4 without the `hsl()` wrapper.

---

## 5. Typography

| Font | Usage | Tailwind |
|------|-------|---------|
| Inter | All UI text, labels, headings | `font-sans` (default) |
| JetBrains Mono | Numeric clinical data: MRN, doses, vitals, lab values | `font-mono` |

```tsx
// MRN / identifiers
<span className="font-mono tracking-wide text-sm">{mrn}</span>

// Pain score (clinical numeric)
<span className="font-mono text-2xl font-bold tabular-nums">{painScore}/10</span>

// Standard body
<p className="text-sm text-muted-foreground leading-relaxed">{notes}</p>

// Section heading
<h2 className="text-lg font-semibold tracking-tight">{title}</h2>
```

---

## 6. Spacing System

4px base grid — consistent across all clinical forms and data tables:

| Token | Value | Common usage |
|-------|-------|-------------|
| `space-1` | 4px | Icon gaps, tight inline elements |
| `space-2` | 8px | Label-to-input, checkbox-to-label |
| `space-3` | 12px | Within form group, input internal padding |
| `space-4` | 16px | Card padding, section gaps |
| `space-6` | 24px | Between form sections |
| `space-8` | 32px | Major layout blocks |
| `space-12` | 48px | Page-level vertical rhythm |

---

## 7. Core Components

### 7.1 Button

```tsx
import { Button } from "@/components/ui/button";

// Variants
<Button variant="default">Save Record</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="destructive">Discharge Patient</Button>
<Button variant="outline">Export PDF</Button>
<Button variant="ghost">View History</Button>
```

**Healthcare variant rules:**

| Variant | Use for |
|---------|---------|
| `default` | Primary save, submit, begin assessment |
| `secondary` | Cancel, back navigation |
| `destructive` | Discharge, revoke election, delete — always requires confirmation dialog |
| `outline` | Print, export, secondary actions |
| `ghost` | Navigation, toggles, icon-only actions |

**Clinical Save Button — autosave-aware:**

```tsx
// src/components/clinical/clinical-save-button.tsx
import { Button } from "@/components/ui/button";
import { Loader2, Save, ShieldAlert } from "lucide-react";

interface ClinicalSaveButtonProps {
  patientId: string;
  hasEditPermission: boolean;
  autosaveStatus: "idle" | "saving" | "saved" | "error";
  onSaveNow: () => Promise<void>;
}

export function ClinicalSaveButton({
  patientId,
  hasEditPermission,
  autosaveStatus,
  onSaveNow,
}: ClinicalSaveButtonProps) {
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSave = async () => {
    if (!patientId || !hasEditPermission || autosaveStatus === "saving" || isSaving) return;
    setIsSaving(true);
    try {
      await onSaveNow();
    } finally {
      setIsSaving(false);
    }
  };

  const isDisabled = !hasEditPermission || autosaveStatus === "saving" || isSaving;

  return (
    <Button
      onClick={handleSave}
      disabled={isDisabled}
      variant={!hasEditPermission ? "outline" : "default"}
      className="min-w-[120px]"
    >
      {autosaveStatus === "saving" || isSaving ? (
        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
      ) : !hasEditPermission ? (
        <><ShieldAlert className="mr-2 h-4 w-4 text-destructive" />Read Only</>
      ) : autosaveStatus === "error" ? (
        <><ShieldAlert className="mr-2 h-4 w-4" />Retry Save</>
      ) : (
        <><Save className="mr-2 h-4 w-4" />Save Now</>
      )}
    </Button>
  );
}
```

---

### 7.2 Checkbox

```tsx
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Always pair with a Label — required for accessibility
<div className="flex items-center space-x-2">
  <Checkbox id="consent" checked={consent} onCheckedChange={setConsent} />
  <Label htmlFor="consent">Patient consent obtained</Label>
</div>

// Symptom checklist (clinical pattern)
{symptoms.map((symptom) => (
  <div key={symptom.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
    <div className="flex items-center space-x-2">
      <Checkbox id={symptom.id} />
      <Label htmlFor={symptom.id}>{symptom.label}</Label>
    </div>
    {symptom.severity >= 5 && (
      <span className="text-xs font-medium text-destructive">High Severity</span>
    )}
  </div>
))}
```

**Sizes:**

| Size | Dimensions | Classes | Use case |
|------|-----------|---------|---------|
| `sm` | 16×16px | `h-4 w-4` | Dense tables, medication lists |
| `default` | 20×20px | `h-5 w-5` | Standard forms |
| `lg` | 24×24px | `h-6 w-6` | Tablet / accessibility mode |

---

### 7.3 Radio Group

```tsx
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// Clinical pain scale (NRS 0–10)
<RadioGroup value={painLevel} onValueChange={setPainLevel} className="flex flex-wrap gap-2">
  {Array.from({ length: 11 }, (_, i) => i).map((level) => (
    <div key={level} className="flex flex-col items-center gap-1">
      <RadioGroupItem
        value={String(level)}
        id={`pain-${level}`}
        className={cn(
          "h-8 w-8 border-2",
          level >= 7 && "data-[state=checked]:border-destructive data-[state=checked]:bg-destructive",
          level >= 4 && level < 7 && "data-[state=checked]:border-warning data-[state=checked]:bg-warning",
        )}
      />
      <Label htmlFor={`pain-${level}`} className="text-xs tabular-nums">{level}</Label>
    </div>
  ))}
</RadioGroup>
```

---

### 7.4 Form Inputs

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Patient ID — monospace for clinical identifiers
<div className="grid gap-1.5">
  <Label htmlFor="mrn">
    Medical Record Number <span className="text-destructive">*</span>
  </Label>
  <Input
    id="mrn"
    placeholder="MRN-12345678"
    className="font-mono tracking-wide"
    aria-describedby="mrn-error"
  />
  {error && (
    <p id="mrn-error" role="alert" className="text-sm text-destructive">{error}</p>
  )}
</div>

// Vital signs — compound input
<div className="flex items-end gap-2">
  <div className="flex-1 grid gap-1.5">
    <Label htmlFor="systolic">Blood Pressure</Label>
    <Input id="systolic" type="number" className="text-right font-mono" placeholder="120" />
  </div>
  <span className="pb-2.5 text-muted-foreground">/</span>
  <div className="flex-1 grid gap-1.5">
    <Label htmlFor="diastolic" className="sr-only">Diastolic</Label>
    <Input id="diastolic" type="number" className="text-right font-mono" placeholder="80" />
  </div>
  <span className="pb-2.5 text-sm text-muted-foreground w-12">mmHg</span>
</div>
```

---

### 7.5 Select

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Admission status
<Select value={admissionStatus} onValueChange={setAdmissionStatus}>
  <SelectTrigger className="w-[200px]">
    <SelectValue placeholder="Select status" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="admitted">Admitted</SelectItem>
    <SelectItem value="discharged">Discharged</SelectItem>
    <SelectItem value="transferred">Transferred</SelectItem>
    <SelectItem value="revoked">Election Revoked</SelectItem>
    <SelectItem value="deceased" className="text-destructive focus:text-destructive">
      Deceased
    </SelectItem>
  </SelectContent>
</Select>
```

---

### 7.6 Date Picker

Used for NOE election dates, IDG meeting dates, recertification dates. Always display the business-day-adjusted deadline alongside the raw date.

```tsx
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { addBusinessDays } from "@/lib/clinical-utils"; // skips weekends + US federal holidays

interface NOEDatePickerProps {
  electionDate: Date | undefined;
  onElectionDateChange: (date: Date | undefined) => void;
}

export function NOEDatePicker({ electionDate, onElectionDateChange }: NOEDatePickerProps) {
  const noeDeadline = electionDate ? addBusinessDays(electionDate, 5) : null;

  return (
    <div className="grid gap-2">
      <Label>Election Date</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {electionDate ? format(electionDate, "PPP") : "Select election date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={electionDate}
            onSelect={onElectionDateChange}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {noeDeadline && (
        <p className="text-sm text-muted-foreground">
          NOE filing deadline:{" "}
          <span className="font-medium font-mono text-foreground">
            {format(noeDeadline, "PPP")}
          </span>{" "}
          <span className="text-xs">(5 business days)</span>
        </p>
      )}
    </div>
  );
}
```

---

### 7.7 Badge

Clinical status indicators:

| Status | Variant | When to use |
|--------|---------|-------------|
| Critical | `destructive` | Pain ≥7, critical allergy, overdue hard block |
| Warning | `warning` | Cap at 80%+, approaching deadlines |
| Stable | `secondary` | Routine monitoring |
| Completed | `success` (custom) | Signed documents, resolved issues |
| Pending | `default` | Awaiting action or result |
| Resolved | `outline` | Past issue, no action needed |

```tsx
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, CheckCircle2 } from "lucide-react";

// Pain score badge with dynamic severity
<Badge variant={painScore >= 7 ? "destructive" : painScore >= 4 ? "default" : "secondary"}>
  <AlertCircle className="mr-1 h-3 w-3" />
  Pain {painScore}/10
</Badge>

// Medication due time
<Badge variant="outline" className="gap-1 font-mono">
  <Clock className="h-3 w-3" />
  Due 14:00
</Badge>

// Completed assessment
<Badge className="gap-1 bg-success text-success-foreground">
  <CheckCircle2 className="h-3 w-3" />
  Signed
</Badge>
```

---

### 7.8 Alert

```tsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Ban, Info, Stethoscope } from "lucide-react";

// Critical allergy
<Alert variant="destructive">
  <Ban className="h-4 w-4" />
  <AlertTitle>Critical Allergy</AlertTitle>
  <AlertDescription>Severe reaction to Penicillin. Anaphylaxis risk documented.</AlertDescription>
</Alert>

// Clinical decision support
<Alert className="border-clinical/50 bg-clinical/10">
  <Stethoscope className="h-4 w-4 text-clinical" />
  <AlertTitle>Clinical Decision Support</AlertTitle>
  <AlertDescription>Patient meets criteria for hospice evaluation.</AlertDescription>
</Alert>

// Approaching cap threshold
<Alert className="border-warning/50 bg-warning/10">
  <AlertTriangle className="h-4 w-4 text-warning" />
  <AlertTitle>Cap Year Warning</AlertTitle>
  <AlertDescription>
    This patient has used 82% of their hospice cap benefit for the current cap year
    (Nov 1 – Oct 31).
  </AlertDescription>
</Alert>
```

---

### 7.9 Data Table

Patient lists and clinical data grids use the TanStack Table pattern with the shadcn table primitives:

```tsx
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useReactTable, getCoreRowModel, flexRender } from "@tanstack/react-table";

// Use React.memo on TableRow for long lists (virtualize >200 rows with @tanstack/react-virtual)
export function PatientTable({ data, columns }: { data: Patient[]; columns: ColumnDef<Patient>[] }) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="text-xs font-medium uppercase tracking-wide">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className="hover:bg-muted/50 cursor-pointer">
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-2 px-3 text-sm">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

### 7.10 Toast (Sonner)

Use **Sonner** (not the shadcn `Toast` primitive) — it has better stacking, positioning, and is already wired in the shadcn new-york style.

```tsx
import { toast } from "sonner";

// Success
toast.success("Record Saved", {
  description: "Patient data persisted successfully.",
});

// Error
toast.error("Save Failed", {
  description: "Network error. Please retry.",
});

// Warning (approaching deadline)
toast.warning("NOE Deadline Approaching", {
  description: `NOE must be filed by ${format(deadline, "PPP")}.`,
  duration: 8000,
});

// Never use toast for PHI — description must not contain patient-identifiable data
```

---

### 7.11 Dialog

Standard confirmation pattern — use for all `destructive` actions (discharge, revoke, delete):

```tsx
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm Discharge</DialogTitle>
      <DialogDescription>
        This will close the patient's hospice election. This action cannot be undone.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      <Button variant="destructive" onClick={handleDischarge}>Confirm Discharge</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

### 7.12 Patient Context Header

Sticky header required on all patient-scoped views. Displays identity, status, and save state at all times:

```tsx
// src/components/clinical/patient-header.tsx
import { Badge } from "@/components/ui/badge";
import { ClinicalSaveButton } from "@/components/clinical/clinical-save-button";

export function PatientHeader({ patient, saveProps }: PatientHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="font-semibold truncate">{patient.name}</h1>
          <Badge variant="outline" className="font-mono shrink-0">{patient.mrn}</Badge>
          <Badge
            variant={patient.status === "critical" ? "destructive" : "secondary"}
            className="shrink-0"
          >
            {patient.admissionStatus}
          </Badge>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {saveProps.autosaveStatus === "saved" && (
            <span className="text-xs text-muted-foreground">
              Autosaved {format(saveProps.lastSavedAt, "HH:mm")}
            </span>
          )}
          <ClinicalSaveButton {...saveProps} />
        </div>
      </div>
    </header>
  );
}
```

---

## 8. CMS Compliance UI Components

These components enforce business rules defined in `backend/CLAUDE.md` §3. They are non-negotiable — the UI must match the backend enforcement.

### 8.1 IDG Hard-Block Modal

When `updateCarePlanFn` returns `{ code: 'IDG_OVERDUE' }`, this modal must appear. **No dismiss option. No close X. One action only.**

```tsx
// src/components/clinical/idg-overdue-modal.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

interface IDGOverdueModalProps {
  open: boolean;
  daysSinceLastIDG: number;
}

export function IDGOverdueModal({ open, daysSinceLastIDG }: IDGOverdueModalProps) {
  const navigate = useNavigate();

  return (
    <Dialog
      open={open}
      // No onOpenChange — this modal cannot be dismissed
    >
      <DialogContent
        className="sm:max-w-md [&>button]:hidden" // hides the default close X
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-full bg-destructive/10 p-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle className="text-destructive">IDG Meeting Overdue</DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed">
            The Interdisciplinary Group (IDG) meeting is{" "}
            <span className="font-semibold text-foreground">{daysSinceLastIDG} days overdue</span>.
            Per 42 CFR §418.56, IDG meetings must occur at least every 15 days. Care plan
            updates are blocked until a meeting is scheduled and documented.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            className="w-full"
            onClick={() => navigate({ to: "/patients/$patientId/idg/schedule" })}
          >
            Schedule IDG Meeting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Rules:**
- `onInteractOutside` must call `e.preventDefault()` — no click-outside dismiss
- `onEscapeKeyDown` must call `e.preventDefault()` — no Escape key dismiss
- The close X button must be hidden (`[&>button]:hidden`)
- Only one CTA: navigate to IDG scheduling

---

### 8.2 Cap Year Warning Banner

```tsx
// src/components/clinical/cap-warning-banner.tsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface CapWarningBannerProps {
  utilizationPercent: number;
  capYearEnd: Date; // always Oct 31
}

export function CapWarningBanner({ utilizationPercent, capYearEnd }: CapWarningBannerProps) {
  if (utilizationPercent < 80) return null;

  const isOverCap = utilizationPercent >= 100;

  return (
    <Alert
      variant={isOverCap ? "destructive" : undefined}
      className={!isOverCap ? "border-warning/50 bg-warning/10" : undefined}
    >
      <AlertTriangle className={cn("h-4 w-4", !isOverCap && "text-warning")} />
      <AlertTitle>{isOverCap ? "Cap Exceeded" : "Approaching Cap Limit"}</AlertTitle>
      <AlertDescription>
        {utilizationPercent.toFixed(1)}% of hospice cap used for cap year ending{" "}
        {format(capYearEnd, "MMMM d, yyyy")}.
        {isOverCap && " New admissions may create overage liability."}
      </AlertDescription>
    </Alert>
  );
}
```

---

### 8.3 Break-Glass Access Indicator

When a clinician accesses a record via break-glass emergency access, the UI must clearly communicate the temporary, audited nature of access.

```tsx
// src/components/clinical/break-glass-banner.tsx
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface BreakGlassBannerProps {
  expiresAt: Date;   // always 4 hours from grant
  reason: string;    // min 20 chars, logged to audit
}

export function BreakGlassBanner({ expiresAt, reason }: BreakGlassBannerProps) {
  return (
    <Alert className="border-warning bg-warning/10 rounded-none border-x-0 border-t-0">
      <ShieldAlert className="h-4 w-4 text-warning" />
      <AlertDescription className="text-xs">
        <span className="font-semibold">Break-glass access active</span> — expires{" "}
        {formatDistanceToNow(expiresAt, { addSuffix: true })}. All actions are audited.
        Reason: {reason}
      </AlertDescription>
    </Alert>
  );
}
```

---

## 9. Clinical Workflow Patterns

### 9.1 Progressive Disclosure (Complex Assessments)

```tsx
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronsUpDown } from "lucide-react";

<Collapsible defaultOpen={hasValues}>
  <CollapsibleTrigger className="flex w-full items-center justify-between py-3 text-sm font-medium hover:bg-muted/50 rounded-md px-2">
    Comprehensive Pain Assessment
    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
  </CollapsibleTrigger>
  <CollapsibleContent className="space-y-4 pt-4 px-2">
    {/* Assessment fields */}
  </CollapsibleContent>
</Collapsible>
```

### 9.2 Data Density for Clinical Tables

```tsx
// Dense table rows for medication lists, vitals history
<TableRow className="hover:bg-muted/50">
  <TableCell className="py-2 px-3 font-mono text-sm tabular-nums">{vital.value}</TableCell>
  <TableCell className="py-2 px-3 text-xs text-muted-foreground">{vital.unit}</TableCell>
  <TableCell className="py-2 px-3 text-xs text-muted-foreground font-mono">
    {format(vital.recordedAt, "MM/dd HH:mm")}
  </TableCell>
</TableRow>
```

### 9.3 Autosave Status Indicator

```tsx
// src/hooks/use-autosave.ts
// Status should be shown in the patient header, not via toast
const autosaveLabel = {
  idle: null,
  saving: <><Loader2 className="h-3 w-3 animate-spin" />Saving...</>,
  saved: <><CheckCircle2 className="h-3 w-3 text-success" />Saved</>,
  error: <><AlertCircle className="h-3 w-3 text-destructive" />Save error</>,
};
```

---

## 10. Accessibility

All clinical UI must meet **WCAG 2.1 AA** minimum.

### Requirements

| Requirement | Standard | Implementation |
|-------------|----------|---------------|
| Touch targets | 44×44px minimum | `min-h-11 min-w-11` on interactive elements |
| Color contrast | ≥4.5:1 (normal text), ≥3:1 (large) | OKLCH tokens maintain ratio in light + dark |
| Focus indicators | Visible on all interactive elements | `focus-visible:ring-2 focus-visible:ring-ring` |
| Screen readers | Announce dynamic content | `role="alert"` on error/status messages |
| Form labels | Every input associated | `htmlFor` + `id` pairing, no placeholder-only labels |
| Keyboard nav | Full keyboard operability | Tab order follows visual flow; Escape closes modals (except IDG block) |

### Form Accessibility Pattern

```tsx
<div className="grid gap-1.5">
  <Label htmlFor="medication-dose">
    Dosage (mg) <span className="text-destructive" aria-label="required">*</span>
  </Label>
  <Input
    id="medication-dose"
    type="number"
    aria-describedby="dose-help dose-error"
    aria-invalid={!!error}
  />
  <p id="dose-help" className="text-xs text-muted-foreground">Enter numeric value only</p>
  {error && (
    <p id="dose-error" role="alert" className="text-sm text-destructive">{error}</p>
  )}
</div>
```

---

## 11. Performance

| Concern | Pattern |
|---------|---------|
| Long patient lists (>200 rows) | Virtualize with `@tanstack/react-virtual` |
| Heavy assessment forms | `React.lazy` + `Suspense` |
| Conditional class composition | `cn()` utility from `@/lib/utils` — never template literals |
| Memo | `React.memo` on pure table row components only |
| Avoid `@apply` | Prefer utility classes directly — `@apply` increases CSS bundle |

```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 12. Component Installation

```bash
# Initialize shadcn/ui (run from frontend/ directory)
pnpm dlx shadcn@latest init

# Core form components
pnpm dlx shadcn@latest add checkbox radio-group button input label select textarea badge alert

# Layout & navigation
pnpm dlx shadcn@latest add card collapsible separator sheet scroll-area sidebar

# Data display
pnpm dlx shadcn@latest add table tooltip skeleton

# Overlays & feedback
pnpm dlx shadcn@latest add dialog popover sonner command

# Date picker
pnpm dlx shadcn@latest add calendar popover

# Additional dependencies
pnpm add lucide-react sonner date-fns clsx tailwind-merge @tanstack/react-virtual
pnpm add -D tailwindcss-animate
```

> **CLI note:** The correct command is `shadcn@latest` (not `shadcn-ui@latest`). The old CLI is deprecated.

---

## 13. File Structure

```
frontend/src/
├── components/
│   ├── ui/                         # shadcn/ui components (copy-owned, customizable)
│   │   ├── button.tsx
│   │   ├── checkbox.tsx
│   │   ├── dialog.tsx
│   │   ├── calendar.tsx
│   │   ├── table.tsx
│   │   └── ...
│   ├── clinical/                   # Hospici-specific clinical components
│   │   ├── patient-header.tsx
│   │   ├── clinical-save-button.tsx
│   │   ├── idg-overdue-modal.tsx   # CMS hard block — see §8.1
│   │   ├── cap-warning-banner.tsx
│   │   ├── break-glass-banner.tsx
│   │   ├── noe-date-picker.tsx
│   │   ├── vital-signs-form.tsx
│   │   └── symptom-checklist.tsx
│   └── layout/
│       ├── app-sidebar.tsx
│       └── main-nav.tsx
├── hooks/
│   ├── use-autosave.ts
│   ├── use-permissions.ts          # CASL ABAC hook
│   ├── query/                      # TanStack Query hooks per domain
│   ├── realtime/                   # Socket.IO event hooks
│   └── offline/                    # IndexedDB sync hooks
├── lib/
│   ├── utils.ts                    # cn() utility
│   ├── clinical-utils.ts           # addBusinessDays(), cap year helpers
│   ├── env.client.ts               # import.meta.env.VITE_* only
│   └── env.server.ts               # process.env.* server-only
├── routes/
│   ├── __root.tsx
│   ├── _authed.tsx
│   └── _authed/
├── globals.css                     # OKLCH tokens, Tailwind directives
└── ...
```

---

## 14. Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-03-11 | 2.0 | Complete rewrite: OKLCH tokens, TanStack Start paths, IDG modal, cap banner, break-glass UI, NOE date picker, data table, Sonner toasts, correct shadcn CLI, removed MUI migration guide |
| 2026-03-11 | 1.0 | Initial — shadcn/ui migration from Material UI |

---

_design-system.md v2.0 — Hospici — Read before generating any frontend component_
