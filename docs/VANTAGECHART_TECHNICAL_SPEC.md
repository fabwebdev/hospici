# VantageChart Technical Specification
## Hospici's RapidChart®-Equivalent Implementation

**Version:** 1.0  
**Date:** March 11, 2026  
**Status:** Technical Specification — Implementation Ready  
**Target:** Match Firenote's 9-minute routine visit documentation

---

## 1. Executive Summary

VantageChart is Hospici's clinician-directed narrative generation system that transforms structured clinical input into complete, compliant documentation without relying on generative AI or LLMs for core functionality. It matches Firenote's RapidChart® capability while adding FHIR-native architecture and optional AI enhancement.

### Key Performance Targets

| Metric | Firenote RapidChart® | Hospici VantageChart Target |
|--------|---------------------|---------------------------|
| Routine RN Visit | 9 minutes | **< 12 minutes** |
| Admission Visit | 50 minutes | **< 60 minutes** |
| Recertification | 40 minutes | **< 45 minutes** |
| Narrative Quality | Compliant, traceable | Compliant, traceable + FHIR-enriched |
| User Clicks | Minimal | **< 50 clicks per routine visit** |

---

## 2. Core Architecture

### 2.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VANTAGECHART ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                 │
│  │   CLINICIAN  │────▶│   STRUCTURED │────▶│   TEMPLATE   │                 │
│  │    INPUT     │     │   SELECTIONS │     │   RESOLVER   │                 │
│  └──────────────┘     └──────────────┘     └──────┬───────┘                 │
│         │                                         │                          │
│         │         ┌───────────────────────────────┘                          │
│         │         │                                                          │
│         │    ┌────▼──────────┐     ┌──────────────┐     ┌──────────────┐    │
│         └───▶│   CONTEXT     │────▶│   NARRATIVE  │────▶│   CLINICIAN  │    │
│              │   RESOLVER    │     │   ASSEMBLER  │     │   REVIEW     │    │
│              └───────────────┘     └──────────────┘     └──────┬───────┘    │
│                    │                                           │            │
│                    │    ┌──────────────────────────────────────┘            │
│                    │    │                                                  │
│                    ▼    ▼                                                  │
│              ┌──────────────────────────────────────┐                      │
│              │   FHIR RESOURCES (Patient History)   │                      │
│              └──────────────────────────────────────┘                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Breakdown

#### 2.2.1 Clinician Input Layer

**Purpose:** Capture structured clinical data with minimal friction

**Input Methods:**
1. **Visual Analog Scales** — Pain, symptom severity
2. **Checkbox Grids** — Presenting problems, interventions provided
3. **Smart Dropdowns** — Auto-complete with hospice-specific terminology
4. **Toggle Buttons** — Yes/No/NA for common assessments
5. **Voice-to-Structured** — Speech → discrete data elements

**TypeBox Schema:**

```typescript
// contexts/clinical/schemas/vantagechart-input.schema.ts

import { Type, Static } from "@sinclair/typebox";

export const VantageChartInputSchema = Type.Object({
  // Visit Context
  visitType: Type.Enum({
    routine_rn: "routine_rn",
    admission: "admission",
    recertification: "recertification",
    supervisory: "supervisory",
    prn: "prn",
    discharge: "discharge",
  }),
  
  // Patient Status
  patientStatus: Type.Object({
    overallCondition: Type.Enum({
      stable: "stable",
      declining: "declining",
      improving: "improving",
      critical: "critical",
      deceased: "deceased",
    }),
    isAlertAndOriented: Type.Boolean(),
    orientationLevel: Type.Optional(Type.Enum({
      x0: "x0", x1: "x1", x2: "x2", x3: "x3", x4: "x4",
    })),
  }),
  
  // Pain Assessment
  painAssessment: Type.Object({
    hasPain: Type.Boolean(),
    painScale: Type.Optional(Type.Number({ minimum: 0, maximum: 10 })),
    painLocation: Type.Optional(Type.String()),
    painQuality: Type.Optional(Type.Array(Type.Enum({
      sharp: "sharp", dull: "dull", aching: "aching",
      burning: "burning", throbbing: "throbbing",
    }))),
    painManagementEffective: Type.Optional(Type.Boolean()),
    breakthroughPain: Type.Optional(Type.Boolean()),
  }),
  
  // Symptoms (ESAS-inspired)
  symptoms: Type.Array(Type.Object({
    symptom: Type.Enum({
      pain: "pain", dyspnea: "dyspnea", fatigue: "fatigue",
      nausea: "nausea", depression: "depression", anxiety: "anxiety",
      drowsiness: "drowsiness", appetite: "appetite", wellbeing: "wellbeing",
    }),
    severity: Type.Number({ minimum: 0, maximum: 10 }),
    isNew: Type.Boolean(),
    isWorsening: Type.Boolean(),
    interventionProvided: Type.Boolean(),
  })),
  
  // Interventions Provided
  interventions: Type.Array(Type.Object({
    category: Type.Enum({
      medication_admin: "medication_admin",
      wound_care: "wound_care",
      symptom_management: "symptom_management",
      psychosocial_support: "psychosocial_support",
      spiritual_care: "spiritual_care",
      caregiver_education: "caregiver_education",
      safety_assessment: "safety_assessment",
      equipment: "equipment",
    })),
    description: Type.String(),
    patientResponse: Type.Enum({
      positive: "positive", neutral: "neutral", negative: "negative",
    }),
  })),
  
  // Psychosocial
  psychosocial: Type.Object({
    caregiverCoping: Type.Enum({
      well: "well", adequate: "adequate", struggling: "struggling",
      crisis: "crisis",
    }),
    patientMood: Type.Enum({
      calm: "calm", anxious: "anxious", depressed: "depressed",
      agitated: "agitated", peaceful: "peaceful",
    }),
    spiritualConcerns: Type.Optional(Type.Boolean()),
  }),
  
  // Care Plan Adherence
  carePlan: Type.Object({
    frequenciesFollowed: Type.Boolean(),
    medicationCompliance: Type.Enum({
      compliant: "compliant", partial: "partial", noncompliant: "noncompliant",
    }),
    barriers: Type.Optional(Type.Array(Type.String())),
  }),
  
  // Safety & Environment
  safety: Type.Object({
    fallRisk: Type.Enum({ low: "low", moderate: "moderate", high: "high" }),
    equipmentNeeds: Type.Optional(Type.Array(Type.String())),
    environmentConcerns: Type.Optional(Type.Array(Type.String())),
  }),
  
  // Plan Changes
  planChanges: Type.Array(Type.Object({
    type: Type.Enum({
      new_order: "new_order", discontinue: "discontinue",
      frequency_change: "frequency_change", medication_change: "medication_change",
    }),
    description: Type.String(),
    requiresPhysician: Type.Boolean(),
  })),
  
  // Free-text additions (optional, clinician-controlled)
  additionalNotes: Type.Optional(Type.String({ maxLength: 1000 })),
  
  // Metadata
  recordedAt: Type.String({ format: "date-time" }),
  inputMethod: Type.Enum({
    touch: "touch", voice: "voice", mixed: "mixed",
  }),
});

export type VantageChartInput = Static<typeof VantageChartInputSchema>;
```

---

## 3. Template System

### 3.1 Narrative Template Structure

Templates use **Handlebars-style** syntax with **conditional logic** and **variable substitution**.

```typescript
// contexts/clinical/schemas/narrative-template.schema.ts

export const NarrativeTemplateSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  name: Type.String(),
  version: Type.Number(),
  visitType: Type.Enum({
    routine_rn: "routine_rn",
    admission: "admission",
    recertification: "recertification",
  }),
  
  // Template sections
  sections: Type.Array(Type.Object({
    id: Type.String(),
    title: Type.String(),
    order: Type.Number(),
    
    // Conditional rendering
    condition: Type.Optional(Type.String()), // e.g., "painAssessment.hasPain"
    
    // Narrative fragments
    fragments: Type.Array(Type.Object({
      id: Type.String(),
      template: Type.String(), // e.g., "Patient reports {{painDescription}}."
      condition: Type.Optional(Type.String()),
      priority: Type.Number(), // Assembly order
      
      // Variable mappings
      variables: Type.Record(Type.String(), Type.Object({
        source: Type.String(), // Path in VantageChartInput
        transform: Type.Optional(Type.Enum({
          lowerCase: "lowerCase",
          upperCase: "upperCase",
          capitalize: "capitalize",
          joinWithComma: "joinWithComma",
          numericToWord: "numericToWord",
        })),
        fallback: Type.Optional(Type.String()),
      })),
    })),
    
    // Alternative phrasings for variety
    alternativeTemplates: Type.Optional(Type.Array(Type.Object({
      template: Type.String(),
      condition: Type.String(), // When to use this alternative
    }))),
  })),
  
  // Hospice-specific context rules
  contextRules: Type.Array(Type.Object({
    trigger: Type.String(),
    action: Type.Enum({
      addPhrase: "addPhrase",
      modifyTemplate: "modifyTemplate",
      addSection: "addSection",
    }),
    value: Type.String(),
  })),
  
  // Compliance requirements
  complianceTags: Type.Array(Type.String()), // e.g., [" medicare_required", "hospice_specific"]
  
  // Audit trail
  createdBy: Type.String(),
  createdAt: Type.String({ format: "date-time" }),
  lastModified: Type.String({ format: "date-time" }),
});
```

### 3.2 Example Template: Routine RN Visit

```typescript
// templates/routine-rn-visit.template.ts

export const RoutineRNVisitTemplate = {
  id: "template-routine-rn-v1",
  name: "Routine RN Visit - Standard",
  version: 1.0,
  visitType: "routine_rn",
  
  sections: [
    {
      id: "opening",
      title: "Visit Opening",
      order: 1,
      fragments: [
        {
          id: "visit-context",
          template: "RN visit conducted at {{visitLocation}}. Patient is {{overallCondition}}.",
          variables: {
            visitLocation: { source: "metadata.visitLocation", fallback: "residence" },
            overallCondition: { source: "patientStatus.overallCondition" },
          },
          priority: 1,
        },
        {
          id: "orientation-status",
          template: " Patient is {{orientationStatus}}.",
          condition: "patientStatus.isAlertAndOriented !== null",
          variables: {
            orientationStatus: { 
              source: "patientStatus.orientationLevel",
              transform: "numericToWord",
              fallback: "alert and oriented"
            },
          },
          priority: 2,
        },
      ],
    },
    
    {
      id: "pain-assessment",
      title: "Pain Assessment",
      order: 2,
      condition: "painAssessment.hasPain === true",
      fragments: [
        {
          id: "pain-present",
          template: " Patient reports pain rated {{painScale}}/10 located {{painLocation}}. Pain described as {{painQualities}}.",
          variables: {
            painScale: { source: "painAssessment.painScale" },
            painLocation: { source: "painAssessment.painLocation" },
            painQualities: { 
              source: "painAssessment.painQuality",
              transform: "joinWithComma",
            },
          },
          priority: 1,
        },
        {
          id: "pain-managed",
          template: " Pain is well-managed with current regimen.",
          condition: "painAssessment.painManagementEffective === true && painAssessment.painScale <= 3",
          priority: 2,
        },
        {
          id: "pain-unmanaged",
          template: " Pain management is suboptimal. Breakthrough pain noted. Recommend PRN medication review.",
          condition: "painAssessment.painManagementEffective === false || painAssessment.painScale > 3",
          priority: 2,
        },
        {
          id: "breakthrough-pain",
          template: " Patient experiencing breakthrough pain between scheduled medications.",
          condition: "painAssessment.breakthroughPain === true",
          priority: 3,
        },
      ],
    },
    
    {
      id: "symptom-review",
      title: "Symptom Review",
      order: 3,
      condition: "symptoms.length > 0",
      fragments: [
        {
          id: "symptom-summary",
          template: " Symptom review reveals {{symptomList}}.",
          variables: {
            symptomList: {
              source: "symptoms",
              transform: "formatSymptoms", // Custom transform
            },
          },
          priority: 1,
        },
        {
          id: "worsening-symptoms",
          template: " Notable worsening in {{worseningSymptoms}}. Care plan adjustments may be warranted.",
          condition: "symptoms.some(s => s.isWorsening)",
          variables: {
            worseningSymptoms: {
              source: "symptoms.filter(s => s.isWorsening).map(s => s.symptom)",
              transform: "joinWithComma",
            },
          },
          priority: 2,
        },
      ],
    },
    
    {
      id: "interventions",
      title: "Interventions Provided",
      order: 4,
      condition: "interventions.length > 0",
      fragments: [
        {
          id: "intervention-list",
          template: " Interventions provided: {{interventionDescriptions}}.",
          variables: {
            interventionDescriptions: {
              source: "interventions.map(i => i.description)",
              transform: "joinWithSemicolon",
            },
          },
          priority: 1,
        },
        {
          id: "positive-response",
          template: " Patient responded positively to interventions.",
          condition: "interventions.every(i => i.patientResponse === 'positive')",
          priority: 2,
        },
      ],
    },
    
    {
      id: "psychosocial",
      title: "Psychosocial Assessment",
      order: 5,
      fragments: [
        {
          id: "caregiver-status",
          template: " Caregiver is {{copingStatus}} with patient's condition.",
          variables: {
            copingStatus: { source: "psychosocial.caregiverCoping" },
          },
          priority: 1,
        },
        {
          id: "patient-mood",
          template: " Patient mood is {{mood}}.",
          variables: {
            mood: { source: "psychosocial.patientMood" },
          },
          priority: 2,
        },
        {
          id: "spiritual-concerns",
          template: " Spiritual concerns identified. Chaplain referral recommended.",
          condition: "psychosocial.spiritualConcerns === true",
          priority: 3,
        },
      ],
    },
    
    {
      id: "care-plan",
      title: "Care Plan Compliance",
      order: 6,
      fragments: [
        {
          id: "frequencies-followed",
          template: " Care plan frequencies being followed.",
          condition: "carePlan.frequenciesFollowed === true",
          priority: 1,
        },
        {
          id: "frequencies-not-followed",
          template: " Care plan frequencies NOT being followed. Barriers: {{barriers}}. IDG discussion needed.",
          condition: "carePlan.frequenciesFollowed === false",
          variables: {
            barriers: {
              source: "carePlan.barriers",
              transform: "joinWithComma",
              fallback: "unknown",
            },
          },
          priority: 1,
        },
        {
          id: "medication-compliance",
          template: " Medication compliance: {{compliance}}.",
          variables: {
            compliance: { source: "carePlan.medicationCompliance" },
          },
          priority: 2,
        },
      ],
    },
    
    {
      id: "plan-changes",
      title: "Plan Changes",
      order: 7,
      condition: "planChanges.length > 0",
      fragments: [
        {
          id: "changes-intro",
          template: " The following care plan changes are recommended:",
          priority: 1,
        },
        {
          id: "change-list",
          template: " {{changeDescription}} ({{physicianNotification}})",
          condition: "planChanges.length > 0",
          variables: {
            changeDescription: { source: "planChange.description" },
            physicianNotification: {
              source: "planChange.requiresPhysician",
              transform: "booleanToNotificationPhrase",
            },
          },
          priority: 2,
        },
      ],
    },
    
    {
      id: "closing",
      title: "Visit Closing",
      order: 100,
      fragments: [
        {
          id: "next-visit",
          template: " Next RN visit per care plan frequency. Continue to monitor.",
          priority: 1,
        },
        {
          id: "safety-concerns",
          template: " SAFETY CONCERNS: {{concerns}}. Immediate attention required.",
          condition: "safety.fallRisk === 'high' || safety.environmentConcerns.length > 0",
          variables: {
            concerns: {
              source: "safety",
              transform: "formatSafetyConcerns",
            },
          },
          priority: 99, // High priority when present
        },
      ],
    },
  ],
  
  contextRules: [
    {
      trigger: "patientStatus.overallCondition === 'critical'",
      action: "addPhrase",
      value: " CRITICAL CONDITION - Notify physician of status change.",
    },
    {
      trigger: "painAssessment.painScale >= 7",
      action: "addPhrase",
      value: " SEVERE PAIN - Immediate intervention required.",
    },
    {
      trigger: "symptoms.some(s => s.severity >= 8)",
      action: "addSection",
      value: "urgent-symptom-management",
    },
  ],
  
  complianceTags: ["medicare_required", "hospice_cop_compliant", "idg_ready"],
};
```

---

## 4. Context Resolver

### 4.1 Prior Visit Data Integration

The Context Resolver enriches current input with historical data for intelligent pre-population.

```typescript
// contexts/clinical/services/context-resolver.service.ts

import { db } from "@/db/client.js";
import { eq, desc } from "drizzle-orm";
import { encounters, painAssessments } from "@/db/schema";

interface ContextResolutionResult {
  // Pre-population suggestions
  suggestions: Map<string, unknown>;
  
  // Trend analysis
  trends: {
    painTrend: "improving" | "worsening" | "stable" | "insufficient_data";
    symptomBurdenScore: number;
    functionalDeclineRate: number;
  };
  
  // Alerts
  alerts: Array<{
    type: "warning" | "info" | "critical";
    message: string;
    sourceData: string;
  }>;
  
  // IDG-relevant summary
  idgRelevance: {
    significantChanges: boolean;
    topicsForDiscussion: string[];
  };
}

export class ContextResolverService {
  async resolveContext(
    patientId: string,
    currentInput: VantageChartInput,
  ): Promise<ContextResolutionResult> {
    const result: ContextResolutionResult = {
      suggestions: new Map(),
      trends: {
        painTrend: "insufficient_data",
        symptomBurdenScore: 0,
        functionalDeclineRate: 0,
      },
      alerts: [],
      idgRelevance: {
        significantChanges: false,
        topicsForDiscussion: [],
      },
    };

    // Fetch prior encounters
    const priorEncounters = await db
      .select()
      .from(encounters)
      .where(eq(encounters.patientId, patientId))
      .orderBy(desc(encounters.visitedAt))
      .limit(5);

    // Fetch prior pain assessments
    const priorPainAssessments = await db
      .select()
      .from(painAssessments)
      .where(eq(painAssessments.patientId, patientId))
      .orderBy(desc(painAssessments.assessedAt))
      .limit(5);

    // Analyze pain trend
    if (priorPainAssessments.length >= 2) {
      const painScores = priorPainAssessments.map(p => p.totalScore).filter(Boolean);
      if (painScores.length >= 2) {
        const recentAvg = painScores.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
        const olderAvg = painScores.slice(-2).reduce((a, b) => a + b, 0) / 2;
        
        if (recentAvg > olderAvg + 2) {
          result.trends.painTrend = "worsening";
          result.alerts.push({
            type: "warning",
            message: `Pain trend worsening: ${olderAvg.toFixed(1)} → ${recentAvg.toFixed(1)}`,
            sourceData: "prior_pain_assessments",
          });
          result.idgRelevance.topicsForDiscussion.push("Pain management review");
        } else if (recentAvg < olderAvg - 2) {
          result.trends.painTrend = "improving";
        } else {
          result.trends.painTrend = "stable";
        }
      }
    }

    // Pre-populate likely unchanged fields
    const lastEncounter = priorEncounters[0];
    if (lastEncounter) {
      const daysSinceLastVisit = Math.floor(
        (Date.now() - new Date(lastEncounter.visitedAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Suggest caregiver coping if < 7 days since last visit
      if (daysSinceLastVisit < 7) {
        result.suggestions.set("psychosocial.caregiverCoping", lastEncounter.data?.caregiverCoping);
      }

      // Alert if > 7 days since last RN visit and frequencies require more
      if (daysSinceLastVisit > 7) {
        result.alerts.push({
          type: "info",
          message: `${daysSinceLastVisit} days since last RN visit - verify visit frequency orders`,
          sourceData: "encounter_history",
        });
      }
    }

    // Calculate symptom burden score
    const allSymptoms = priorEncounters.flatMap(e => e.data?.symptoms || []);
    if (allSymptoms.length > 0) {
      const avgSeverity = allSymptoms.reduce((sum, s) => sum + (s.severity || 0), 0) / allSymptoms.length;
      result.trends.symptomBurdenScore = Math.round(avgSeverity * 10) / 10;
    }

    // Detect significant changes for IDG
    result.idgRelevance.significantChanges = result.alerts.some(a => a.type === "warning");

    return result;
  }
}
```

---

## 5. Narrative Assembler

### 5.1 Assembly Algorithm

```typescript
// contexts/clinical/services/narrative-assembler.service.ts

import Handlebars from "handlebars";
import { get } from "lodash-es";

interface AssemblyResult {
  narrative: string;
  sectionMap: Map<string, string>;
  metadata: {
    sectionCount: number;
    fragmentCount: number;
    wordCount: number;
    estimatedReadingTime: number;
    complianceScore: number;
  };
  traceability: Array<{
    narrativeSegment: string;
    sourceFragment: string;
    inputData: string;
  }>;
}

export class NarrativeAssemblerService {
  private handlebars: typeof Handlebars;

  constructor() {
    this.handlebars = Handlebars.create();
    this.registerHelpers();
  }

  private registerHelpers(): void {
    // Join array with commas
    this.handlebars.registerHelper("join", (arr: string[], separator = ", ") => {
      if (!Array.isArray(arr)) return "";
      return arr.join(separator);
    });

    // Convert number to word
    this.handlebars.registerHelper("numberToWord", (num: number) => {
      const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
      return words[num] || num.toString();
    });

    // Capitalize first letter
    this.handlebars.registerHelper("capitalize", (str: string) => {
      if (!str) return "";
      return str.charAt(0).toUpperCase() + str.slice(1);
    });

    // Format symptom list
    this.handlebars.registerHelper("formatSymptoms", (symptoms: Array<{symptom: string; severity: number}>) => {
      if (!symptoms?.length) return "no significant symptoms";
      return symptoms
        .filter(s => s.severity > 0)
        .map(s => `${s.symptom} (${s.severity}/10)`)
        .join(", ");
    });
  }

  async assembleNarrative(
    template: NarrativeTemplate,
    input: VantageChartInput,
    context: ContextResolutionResult,
  ): Promise<AssemblyResult> {
    const result: AssemblyResult = {
      narrative: "",
      sectionMap: new Map(),
      metadata: {
        sectionCount: 0,
        fragmentCount: 0,
        wordCount: 0,
        estimatedReadingTime: 0,
        complianceScore: 0,
      },
      traceability: [],
    };

    const assembledSections: string[] = [];

    // Sort sections by order
    const sortedSections = [...template.sections].sort((a, b) => a.order - b.order);

    for (const section of sortedSections) {
      // Check section condition
      if (section.condition && !this.evaluateCondition(section.condition, input)) {
        continue;
      }

      const sectionFragments: string[] = [];
      
      // Sort fragments by priority
      const sortedFragments = [...section.fragments].sort((a, b) => a.priority - b.priority);

      for (const fragment of sortedFragments) {
        // Check fragment condition
        if (fragment.condition && !this.evaluateCondition(fragment.condition, input)) {
          continue;
        }

        // Resolve variables
        const variableValues: Record<string, unknown> = {};
        for (const [varName, varConfig] of Object.entries(fragment.variables || {})) {
          let value = get(input, varConfig.source);
          
          // Apply transform
          if (varConfig.transform && value !== undefined) {
            value = this.applyTransform(value, varConfig.transform);
          }
          
          // Apply fallback
          if (value === undefined || value === null || value === "") {
            value = varConfig.fallback;
          }
          
          variableValues[varName] = value;
        }

        // Compile and render template
        const compiled = this.handlebars.compile(fragment.template);
        const rendered = compiled(variableValues).trim();

        if (rendered) {
          sectionFragments.push(rendered);
          
          // Track traceability
          result.traceability.push({
            narrativeSegment: rendered,
            sourceFragment: fragment.id,
            inputData: JSON.stringify(variableValues),
          });
          
          result.metadata.fragmentCount++;
        }
      }

      // Combine fragments into section
      if (sectionFragments.length > 0) {
        const sectionText = sectionFragments.join("");
        assembledSections.push(sectionText);
        result.sectionMap.set(section.id, sectionText);
        result.metadata.sectionCount++;
      }
    }

    // Apply context rules
    for (const rule of template.contextRules || []) {
      if (this.evaluateCondition(rule.trigger, input)) {
        switch (rule.action) {
          case "addPhrase":
            assembledSections.push(value);
            break;
          case "addSection":
            // Load and append additional section template
            break;
        }
      }
    }

    // Final assembly
    result.narrative = assembledSections.join("\n\n");
    
    // Calculate metadata
    result.metadata.wordCount = result.narrative.split(/\s+/).length;
    result.metadata.estimatedReadingTime = Math.ceil(result.metadata.wordCount / 200); // 200 WPM
    result.metadata.complianceScore = this.calculateComplianceScore(template, input);

    return result;
  }

  private evaluateCondition(condition: string, input: VantageChartInput): boolean {
    // Safe evaluation of simple conditions
    // In production, use a proper expression evaluator
    try {
      const fn = new Function("input", `return ${condition}`);
      return fn(input);
    } catch {
      return false;
    }
  }

  private applyTransform(value: unknown, transform: string): unknown {
    switch (transform) {
      case "lowerCase":
        return String(value).toLowerCase();
      case "upperCase":
        return String(value).toUpperCase();
      case "capitalize":
        return String(value).charAt(0).toUpperCase() + String(value).slice(1);
      case "joinWithComma":
        return Array.isArray(value) ? value.join(", ") : value;
      case "numericToWord":
        const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
        const num = Number(value);
        return words[num] || String(value);
      default:
        return value;
    }
  }

  private calculateComplianceScore(template: NarrativeTemplate, input: VantageChartInput): number {
    let score = 0;
    const maxScore = template.sections.length;
    
    for (const section of template.sections) {
      if (!section.condition || this.evaluateCondition(section.condition, input)) {
        score++;
      }
    }
    
    return Math.round((score / maxScore) * 100);
  }
}
```

---

## 6. User Interface Workflow

### 6.1 VantageChart UI Component Structure

```typescript
// frontend/src/components/vantagechart/VantageChartContainer.tsx

interface VantageChartContainerProps {
  patientId: string;
  visitType: VisitType;
  onComplete: (note: AssembledNote) => void;
  onSaveDraft: (draft: VantageChartInput) => void;
}

export function VantageChartContainer({
  patientId,
  visitType,
  onComplete,
  onSaveDraft,
}: VantageChartContainerProps) {
  // State management
  const [currentStep, setCurrentStep] = useState<VantageChartStep>("patient-status");
  const [input, setInput] = useState<Partial<VantageChartInput>>({});
  const [preview, setPreview] = useState<NarrativePreview | null>(null);
  const [context, setContext] = useState<ContextResolutionResult | null>(null);
  const [isAssembling, setIsAssembling] = useState(false);

  // Steps for routine RN visit
  const steps: VantageChartStep[] = [
    "patient-status",
    "pain-assessment",
    "symptom-review",
    "interventions",
    "psychosocial",
    "care-plan",
    "safety",
    "plan-changes",
    "review",
  ];

  // Load context on mount
  useEffect(() => {
    loadContext();
  }, [patientId]);

  const loadContext = async () => {
    const contextData = await getPatientContextFn({ data: { patientId } });
    setContext(contextData);
    
    // Auto-suggest values from context
    if (contextData.suggestions) {
      setInput(prev => ({
        ...prev,
        ...Object.fromEntries(contextData.suggestions),
      }));
    }
  };

  // Real-time narrative preview
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (Object.keys(input).length > 0) {
        generatePreview();
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeout);
  }, [input]);

  const generatePreview = async () => {
    setIsAssembling(true);
    try {
      const preview = await previewNarrativeFn({
        data: {
          input: input as VantageChartInput,
          visitType,
        },
      });
      setPreview(preview);
    } finally {
      setIsAssembling(false);
    }
  };

  const handleComplete = async () => {
    const result = await finalizeNoteFn({
      data: {
        patientId,
        input: input as VantageChartInput,
        visitType,
      },
    });
    onComplete(result);
  };

  return (
    <div className="vantagechart-container">
      {/* Progress Indicator */}
      <StepProgress steps={steps} current={currentStep} />

      {/* Context Alerts */}
      {context?.alerts?.length > 0 && (
        <ContextAlerts alerts={context.alerts} />
      )}

      {/* Main Input Area */}
      <div className="vantagechart-main">
        <AnimatePresence mode="wait">
          <StepContent
            key={currentStep}
            step={currentStep}
            input={input}
            onChange={setInput}
            context={context}
          />
        </AnimatePresence>
      </div>

      {/* Live Preview Panel */}
      <div className="vantagechart-preview">
        <NarrativePreviewPanel
          preview={preview}
          isLoading={isAssembling}
          complianceScore={preview?.metadata.complianceScore}
        />
      </div>

      {/* Navigation */}
      <StepNavigation
        steps={steps}
        current={currentStep}
        onNext={() => setCurrentStep(getNextStep(steps, currentStep))}
        onPrevious={() => setCurrentStep(getPreviousStep(steps, currentStep))}
        onSaveDraft={() => onSaveDraft(input as VantageChartInput)}
        onComplete={handleComplete}
        canComplete={isInputComplete(input)}
      />
    </div>
  );
}
```

### 6.2 Step Components

```typescript
// frontend/src/components/vantagechart/steps/PainAssessmentStep.tsx

interface PainAssessmentStepProps {
  input: Partial<VantageChartInput>;
  onChange: (input: Partial<VantageChartInput>) => void;
  context: ContextResolutionResult | null;
}

export function PainAssessmentStep({ input, onChange, context }: PainAssessmentStepProps) {
  const pain = input.painAssessment || {};
  
  // Show trend if available
  const painTrend = context?.trends?.painTrend;

  return (
    <div className="step-pain-assessment">
      <h2>Pain Assessment</h2>
      
      {/* Trend Alert */}
      {painTrend === "worsening" && (
        <Alert type="warning">
          Pain trend worsening. Consider IDG discussion.
        </Alert>
      )}

      {/* Has Pain Toggle */}
      <ToggleGroup
        label="Is patient experiencing pain?"
        value={pain.hasPain}
        onChange={(value) => onChange({
          ...input,
          painAssessment: { ...pain, hasPain: value },
        })}
        options={[
          { value: false, label: "No Pain", icon: CheckCircle },
          { value: true, label: "Pain Present", icon: AlertCircle },
        ]}
      />

      {pain.hasPain && (
        <>
          {/* Pain Scale */}
          <VisualAnalogScale
            label="Pain Severity (0-10)"
            value={pain.painScale || 0}
            onChange={(value) => onChange({
              ...input,
              painAssessment: { ...pain, painScale: value },
            })}
            labels={{
              0: "No Pain",
              5: "Moderate",
              10: "Worst",
            }}
          />

          {/* Pain Location */}
          <SmartSelect
            label="Pain Location"
            value={pain.painLocation}
            onChange={(value) => onChange({
              ...input,
              painAssessment: { ...pain, painLocation: value },
            })}
            options={painLocationOptions}
            allowCustom
          />

          {/* Pain Quality */}
          <CheckboxGrid
            label="Pain Quality"
            values={pain.painQuality || []}
            onChange={(values) => onChange({
              ...input,
              painAssessment: { ...pain, painQuality: values },
            })}
            options={painQualityOptions}
            columns={3}
          />

          {/* Management Effectiveness */}
          <ToggleGroup
            label="Is current pain management effective?"
            value={pain.painManagementEffective}
            onChange={(value) => onChange({
              ...input,
              painAssessment: { ...pain, painManagementEffective: value },
            })}
            options={[
              { value: true, label: "Effective" },
              { value: false, label: "Not Effective" },
            ]}
          />

          {/* Breakthrough Pain */}
          <Checkbox
            label="Breakthrough pain between scheduled medications"
            checked={pain.breakthroughPain || false}
            onChange={(checked) => onChange({
              ...input,
              painAssessment: { ...pain, breakthroughPain: checked },
            })}
          />
        </>
      )}

      {/* Quick Actions */}
      <QuickActions
        actions={[
          {
            label: "No changes from last visit",
            onClick: () => copyFromLastVisit("painAssessment"),
          },
          {
            label: "Pain resolved",
            onClick: () => onChange({
              ...input,
              painAssessment: { hasPain: false },
            }),
          },
        ]}
      />
    </div>
  );
}
```

---

## 7. Voice-to-Structured Input

### 7.1 Speech Recognition Pipeline

```typescript
// contexts/clinical/services/voice-structured.service.ts

interface VoiceParseResult {
  structuredData: Partial<VantageChartInput>;
  confidence: number;
  ambiguousFields: Array<{
    field: string;
    alternatives: string[];
  }>;
}

export class VoiceToStructuredService {
  private speechRecognizer: SpeechRecognitionAPI;
  private intentClassifier: IntentClassifier;

  constructor() {
    // Initialize with hospice-specific vocabulary
    this.intentClassifier = new IntentClassifier({
      modelPath: "./models/hospice-intent-classifier",
      vocabulary: [
        // Pain vocabulary
        "pain", "hurts", "aching", "burning", "sharp", "dull",
        "zero", "one", "two", "three", "four", "five",
        "six", "seven", "eight", "nine", "ten",
        
        // Symptom vocabulary
        "shortness of breath", "nausea", "fatigue", "tired",
        "anxiety", "depressed", "confused", "restless",
        
        // Location vocabulary
        "chest", "back", "abdomen", "head", "legs", "arms",
        
        // Response vocabulary
        "better", "worse", "same", "improved", "declined",
      ],
    });
  }

  async processSpeech(audioStream: AudioStream): Promise<VoiceParseResult> {
    // Step 1: Speech-to-text
    const transcript = await this.speechRecognizer.transcribe(audioStream, {
      medicalTerminology: true,
      speakerDiarization: false, // Single clinician
    });

    // Step 2: Intent extraction
    const intents = await this.intentClassifier.classify(transcript);

    // Step 3: Map to structured data
    const structuredData = this.mapIntentsToStructure(intents);

    // Step 4: Confidence calculation
    const confidence = this.calculateConfidence(intents);

    // Step 5: Identify ambiguities
    const ambiguousFields = this.identifyAmbiguities(intents);

    return {
      structuredData,
      confidence,
      ambiguousFields,
    };
  }

  private mapIntentsToStructure(intents: Intent[]): Partial<VantageChartInput> {
    const result: Partial<VantageChartInput> = {};

    for (const intent of intents) {
      switch (intent.type) {
        case "pain_report":
          result.painAssessment = {
            hasPain: true,
            painScale: this.parsePainScale(intent.entities),
            painLocation: intent.entities.find(e => e.type === "location")?.value,
            painQuality: intent.entities
              .filter(e => e.type === "pain_quality")
              .map(e => e.value),
          };
          break;

        case "symptom_report":
          const symptom = intent.entities.find(e => e.type === "symptom")?.value;
          const severity = this.parseSeverity(intent.entities);
          if (symptom) {
            result.symptoms = [
              ...(result.symptoms || []),
              {
                symptom,
                severity,
                isNew: false,
                isWorsening: intent.entities.some(e => 
                  e.type === "trend" && e.value === "worsening"
                ),
                interventionProvided: false,
              },
            ];
          }
          break;

        case "patient_status":
          result.patientStatus = {
            overallCondition: this.parseCondition(intent.entities),
            isAlertAndOriented: !intent.entities.some(e =>
              e.type === "mental_status" && e.value === "confused"
            ),
          };
          break;
      }
    }

    return result;
  }

  private parsePainScale(entities: Entity[]): number | undefined {
    const numberEntity = entities.find(e => e.type === "number");
    if (numberEntity) {
      return parseInt(numberEntity.value, 10);
    }
    
    // Parse word numbers
    const wordMap: Record<string, number> = {
      zero: 0, one: 1, two: 2, three: 3, four: 4,
      five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    };
    
    const wordEntity = entities.find(e => 
      e.type === "number_word" && wordMap[e.value] !== undefined
    );
    
    return wordEntity ? wordMap[wordEntity.value] : undefined;
  }
}
```

---

## 8. Performance Optimization

### 8.1 Pre-compiled Templates

Templates are pre-compiled at build time:

```typescript
// config/vantagechart-compiler.ts

import { readdirSync, readFileSync, writeFileSync } from "fs";
import Handlebars from "handlebars";
import { TypeCompiler } from "@sinclair/typebox/compiler";

// Compile all templates at build time
export function compileTemplates() {
  const templateDir = "./templates/vantagechart";
  const templates = readdirSync(templateDir)
    .filter(f => f.endsWith(".template.ts"))
    .map(f => {
      const content = readFileSync(`${templateDir}/${f}`, "utf-8");
      const template = eval(content); // Safe: build-time only
      
      // Pre-compile Handlebars templates
      const compiledSections = template.sections.map((section: Section) => ({
        ...section,
        compiledFragments: section.fragments.map((fragment: Fragment) => ({
          ...fragment,
          render: Handlebars.compile(fragment.template),
        })),
      }));
      
      return {
        id: template.id,
        compiledSections,
      };
    });

  // Write compiled templates
  writeFileSync(
    "./src/compiled/vantagechart-templates.json",
    JSON.stringify(templates, null, 2),
  );
}
```

### 8.2 Caching Strategy

```typescript
// Cache context resolution for 5 minutes
const contextCache = new Map<string, { data: ContextResolutionResult; timestamp: number }>();

export async function getCachedContext(patientId: string): Promise<ContextResolutionResult> {
  const cached = contextCache.get(patientId);
  const now = Date.now();
  
  if (cached && now - cached.timestamp < 5 * 60 * 1000) {
    return cached.data;
  }
  
  const fresh = await contextResolver.resolveContext(patientId);
  contextCache.set(patientId, { data: fresh, timestamp: now });
  return fresh;
}
```

---

## 9. Quality Assurance

### 9.1 Compliance Validation

```typescript
// contexts/clinical/services/VantageChart-validator.service.ts

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  complianceScore: number;
}

export class VantageChartValidator {
  validate(input: VantageChartInput): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Required fields per visit type
    if (!input.patientStatus?.overallCondition) {
      errors.push({
        field: "patientStatus.overallCondition",
        message: "Patient condition status is required",
        severity: "blocking",
      });
    }

    // Pain assessment required if pain present
    if (input.painAssessment?.hasPain && input.painAssessment?.painScale === undefined) {
      errors.push({
        field: "painAssessment.painScale",
        message: "Pain scale required when pain is present",
        severity: "blocking",
      });
    }

    // Intervention documentation required
    if (!input.interventions || input.interventions.length === 0) {
      warnings.push({
        field: "interventions",
        message: "No interventions documented",
        severity: "warning",
      });
    }

    // Check for copy-paste indicators
    if (this.detectCopyPaste(input)) {
      warnings.push({
        field: "narrative",
        message: "Similarity to prior note detected - verify accuracy",
        severity: "info",
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      complianceScore: this.calculateScore(errors, warnings),
    };
  }

  private detectCopyPaste(input: VantageChartInput): boolean {
    // Implementation: Compare to prior notes
    // Return true if > 90% similarity
    return false;
  }
}
```

---

## 10. Metrics & Analytics

### 10.1 Performance Tracking

```typescript
// Track key metrics
interface VantageChartMetrics {
  // Time metrics
  avgTimeToComplete: number;
  timeByStep: Record<VantageChartStep, number>;
  
  // Quality metrics
  avgComplianceScore: number;
  editRate: number; // % of notes edited after generation
  
  // Usage metrics
  adoptionRate: number;
  voiceInputUsage: number;
  
  // Outcome metrics
  claimDenialRate: number;
  auditPassRate: number;
}
```

---

## 11. Implementation Checklist

### Week 1-2: Foundation
- [ ] Create TypeBox schemas (VantageChartInput, NarrativeTemplate)
- [ ] Set up Handlebars template engine
- [ ] Build template compiler
- [ ] Create test templates (Routine RN, Admission, Recert)

### Week 3-4: Core Engine
- [ ] Implement ContextResolver
- [ ] Implement NarrativeAssembler
- [ ] Build step-by-step UI components
- [ ] Integrate with patient data

### Week 5-6: UI/UX
- [ ] Build VantageChartContainer
- [ ] Create all step components
- [ ] Implement live preview panel
- [ ] Add navigation and progress

### Week 7-8: Advanced Features
- [ ] Voice-to-structured input
- [ ] Context alerts and suggestions
- [ ] Compliance validation
- [ ] Performance optimization

### Week 9-10: Integration & Testing
- [ ] Integrate with encounter workflow
- [ ] Build end-to-end tests
- [ ] Performance testing
- [ ] Clinician user testing

---

## 12. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Routine Visit Time | < 12 minutes | Timer from start to completion |
| Edit Rate | < 20% | % of notes modified after generation |
| User Satisfaction | > 4.5/5 | Post-visit survey |
| Compliance Score | > 90% | Automated validation |
| Adoption Rate | > 80% | % of visits using VantageChart |

---

**Specification Version:** 1.0  
**Last Updated:** March 11, 2026  
**Next Review:** Post-Week 2 Implementation
