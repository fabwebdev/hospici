/**
 * Auth input validators — TypeBox AOT compiled at module level.
 * Rule: TypeCompiler.Compile() must be called once per schema, at module level only.
 */

import { Type } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

const LoginInputSchema = Type.Object({
  email: Type.String({ format: "email", minLength: 3, maxLength: 254 }),
  password: Type.String({ minLength: 12, maxLength: 128 }),
});

export const LoginInputValidator = TypeCompiler.Compile(LoginInputSchema);

const BreakGlassInputSchema = Type.Object({
  patientId: Type.String({ format: "uuid" }),
  reason: Type.String({ minLength: 20, maxLength: 1000 }),
});

export const BreakGlassInputValidator = TypeCompiler.Compile(BreakGlassInputSchema);
