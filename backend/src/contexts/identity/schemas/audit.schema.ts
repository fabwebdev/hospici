// contexts/identity/schemas/audit.schema.ts
// HIPAA-compliant audit logging schemas

import { Type, Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

export const AuditActionSchema = Type.Enum({
	view: "view",
	create: "create",
	update: "update",
	delete: "delete",
	sign: "sign",
	export: "export",
	breakGlass: "break_glass",
	login: "login",
	logout: "logout",
});

export const AuditLogSchema = Type.Object(
	{
		id: Type.String({ format: "uuid" }),
		userId: Type.String({ format: "uuid" }),
		userRole: Type.String(),
		locationId: Type.String({ format: "uuid" }),
		action: AuditActionSchema,
		resourceType: Type.String(),
		resourceId: Type.String({ format: "uuid" }),
		ipAddress: Type.Optional(Type.String()),
		userAgent: Type.Optional(Type.String()),
		timestamp: Type.String({ format: "date-time" }),
		details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
	},
	{ additionalProperties: false },
);

export const AuditLogValidator = TypeCompiler.Compile(AuditLogSchema);

export type AuditAction = Static<typeof AuditActionSchema>;
export type AuditLog = Static<typeof AuditLogSchema>;
