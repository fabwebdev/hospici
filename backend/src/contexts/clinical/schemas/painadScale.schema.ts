// contexts/clinical/schemas/painadScale.schema.ts
// PAINAD (Pain Assessment in Advanced Dementia) — for non-verbal/dementia patients

import { type Static, Type } from "@sinclair/typebox";

export const PainadScaleSchema = Type.Object(
  {
    // 0=normal, 1=occasional labored breathing, 2=noisy labored breathing/long periods hyperventilation
    breathing: Type.Number({ minimum: 0, maximum: 2 }),
    // 0=none, 1=occasional moan/groan, 2=repeated troubled calling out/loud moaning
    negativeVocalization: Type.Number({ minimum: 0, maximum: 2 }),
    // 0=smiling or inexpressive, 1=sad/frightened/frown, 2=grimacing
    facialExpression: Type.Number({ minimum: 0, maximum: 2 }),
    // 0=relaxed, 1=tense/distressed pacing, 2=rigid/fists clenched
    bodyLanguage: Type.Number({ minimum: 0, maximum: 2 }),
    // 0=no need to console, 1=distracted by voice or touch, 2=unable to console/distract
    consolability: Type.Number({ minimum: 0, maximum: 2 }),
    // Computed total (0-10)
    totalScore: Type.Number({ minimum: 0, maximum: 10 }),
  },
  { additionalProperties: false },
);

export type PainadScale = Static<typeof PainadScaleSchema>;
