// contexts/clinical/schemas/wongBakerScale.schema.ts
// Wong-Baker FACES Pain Rating Scale — pediatric verbal patients

import { type Static, Type } from "@sinclair/typebox";

// Only even integers 0-10 correspond to the 6 faces:
// 0=no hurt, 2=hurts little bit, 4=hurts little more,
// 6=hurts even more, 8=hurts whole lot, 10=hurts worst
export const WongBakerScaleSchema = Type.Object(
  {
    score: Type.Union([
      Type.Literal(0),
      Type.Literal(2),
      Type.Literal(4),
      Type.Literal(6),
      Type.Literal(8),
      Type.Literal(10),
    ]),
  },
  { additionalProperties: false },
);

export type WongBakerScale = Static<typeof WongBakerScaleSchema>;
