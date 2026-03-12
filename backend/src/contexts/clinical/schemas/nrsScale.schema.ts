// contexts/clinical/schemas/nrsScale.schema.ts
// NRS (Numeric Rating Scale) — standard 0-10 adult verbal pain scale

import { type Static, Type } from "@sinclair/typebox";

export const NrsScaleSchema = Type.Object(
  {
    // 0 = no pain, 10 = worst imaginable pain
    score: Type.Integer({ minimum: 0, maximum: 10 }),
    // Optional: patient's verbal description of pain quality
    description: Type.Optional(Type.String({ maxLength: 500 })),
  },
  { additionalProperties: false },
);

export type NrsScale = Static<typeof NrsScaleSchema>;
