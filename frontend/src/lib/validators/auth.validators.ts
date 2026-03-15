/**
 * Auth input validators — TypeBox AOT compiled at module level.
 * Rule: TypeCompiler.Compile() must be called once per schema, at module level only.
 */

import { FormatRegistry, Type } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

// Register string formats used in auth schemas
if (!FormatRegistry.Has("email")) {
  FormatRegistry.Set("email", (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
}
if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set("uuid", (v) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  );
}

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
