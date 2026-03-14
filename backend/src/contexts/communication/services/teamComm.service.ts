/**
 * TeamCommService — per-patient team communication (threads + messages).
 *
 * Features:
 *   - List threads with last message preview + total message count
 *   - Create thread (with optional first message in a single transaction)
 *   - List messages within a thread (ascending by sent_at)
 *   - Send a message (Socket.IO event emitted from the route layer)
 *
 * RLS: every operation runs inside db.transaction() with applyRlsContext().
 * PHI: logAudit() on every read/write.
 */

import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { teamCommMessages } from "@/db/schema/team-comm-messages.table.js";
import { teamCommThreads } from "@/db/schema/team-comm-threads.table.js";
import { and, asc, count, desc, eq, max, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type {
  CommMessageListResponse,
  CommMessageResponse,
  CommThreadListResponse,
  CommThreadResponse,
  CreateCommThreadBody,
  SendCommMessageBody,
} from "../schemas/teamComm.schema.js";

type UserCtx = NonNullable<FastifyRequest["user"]>;
type AuditDbCtx = { insert: (typeof db)["insert"] };

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

// ── Row → response mappers ────────────────────────────────────────────────────

function toMessageResponse(row: typeof teamCommMessages.$inferSelect): CommMessageResponse {
  const base: CommMessageResponse = {
    id: row.id,
    threadId: row.threadId,
    patientId: row.patientId,
    locationId: row.locationId,
    body: row.body,
    sentAt: row.sentAt.toISOString(),
  };
  if (row.authorUserId != null) base.authorUserId = row.authorUserId;
  return base;
}

// ── Thread operations ─────────────────────────────────────────────────────────

export async function listThreads(
  patientId: string,
  user: UserCtx,
): Promise<CommThreadListResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    // Aggregate last message timestamp + body + message count per thread
    const threadRows = await tx.select().from(teamCommThreads).where(
      eq(teamCommThreads.patientId, patientId),
    ).orderBy(desc(teamCommThreads.createdAt));

    const totalCount = await tx
      .select({ value: count() })
      .from(teamCommThreads)
      .where(eq(teamCommThreads.patientId, patientId));

    // For each thread, fetch the last message and message count
    // Executed via a single aggregation query per thread — acceptable for typical team sizes
    const threads: CommThreadResponse[] = await Promise.all(
      threadRows.map(async (thread) => {
        const [aggResult] = await tx
          .select({
            messageCount: count(teamCommMessages.id),
            lastMessageAt: max(teamCommMessages.sentAt),
          })
          .from(teamCommMessages)
          .where(eq(teamCommMessages.threadId, thread.id));

        // Fetch the body of the most recent message
        let lastMessageBody: string | undefined;
        if (aggResult?.lastMessageAt) {
          const [lastMsg] = await tx
            .select({ body: teamCommMessages.body })
            .from(teamCommMessages)
            .where(eq(teamCommMessages.threadId, thread.id))
            .orderBy(desc(teamCommMessages.sentAt))
            .limit(1);
          lastMessageBody = lastMsg?.body;
        }

        const base: CommThreadResponse = {
          id: thread.id,
          patientId: thread.patientId,
          locationId: thread.locationId,
          subject: thread.subject,
          createdAt: thread.createdAt.toISOString(),
          messageCount: Number(aggResult?.messageCount ?? 0),
        };
        if (thread.createdByUserId != null) base.createdByUserId = thread.createdByUserId;
        if (aggResult?.lastMessageAt != null)
          base.lastMessageAt = aggResult.lastMessageAt.toISOString();
        if (lastMessageBody != null) base.lastMessageBody = lastMessageBody;
        return base;
      }),
    );

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "comm_thread_list",
        details: { count: threadRows.length },
      },
      tx as unknown as AuditDbCtx,
    );

    return {
      threads,
      total: Number(totalCount[0]?.value ?? 0),
    };
  });
}

export async function createThread(
  patientId: string,
  body: CreateCommThreadBody,
  user: UserCtx,
): Promise<CommThreadResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const threadRows = await tx
      .insert(teamCommThreads)
      .values({
        patientId,
        locationId: user.locationId,
        subject: body.subject,
        createdByUserId: user.id,
      })
      .returning();

    const thread = threadRows[0];
    if (!thread) throw new Error("Insert returned no rows");

    // Optionally insert the first message in the same transaction
    let firstMessageAt: Date | undefined;
    let firstMessageBody: string | undefined;

    if (body.initialMessage) {
      const msgRows = await tx
        .insert(teamCommMessages)
        .values({
          threadId: thread.id,
          patientId,
          locationId: user.locationId,
          authorUserId: user.id,
          body: body.initialMessage,
        })
        .returning();
      const msg = msgRows[0];
      if (msg) {
        firstMessageAt = msg.sentAt;
        firstMessageBody = msg.body;
      }
    }

    await logAudit(
      "create",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "comm_thread",
        resourceId: thread.id,
        details: { subject: body.subject, hasInitialMessage: !!body.initialMessage },
      },
      tx as unknown as AuditDbCtx,
    );

    const response: CommThreadResponse = {
      id: thread.id,
      patientId: thread.patientId,
      locationId: thread.locationId,
      subject: thread.subject,
      createdAt: thread.createdAt.toISOString(),
      messageCount: firstMessageAt ? 1 : 0,
    };
    if (thread.createdByUserId != null) response.createdByUserId = thread.createdByUserId;
    if (firstMessageAt) response.lastMessageAt = firstMessageAt.toISOString();
    if (firstMessageBody) response.lastMessageBody = firstMessageBody;
    return response;
  });
}

// ── Message operations ────────────────────────────────────────────────────────

export async function listMessages(
  patientId: string,
  threadId: string,
  user: UserCtx,
): Promise<CommMessageListResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const threadFilter = and(
      eq(teamCommMessages.threadId, threadId),
      eq(teamCommMessages.patientId, patientId),
    );

    const [rows, countRows] = await Promise.all([
      tx
        .select()
        .from(teamCommMessages)
        .where(threadFilter)
        .orderBy(asc(teamCommMessages.sentAt)),
      tx.select({ value: count() }).from(teamCommMessages).where(threadFilter),
    ]);

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "comm_message_list",
        details: { threadId, count: rows.length },
      },
      tx as unknown as AuditDbCtx,
    );

    return {
      messages: rows.map(toMessageResponse),
      total: Number(countRows[0]?.value ?? 0),
    };
  });
}

export async function sendMessage(
  patientId: string,
  threadId: string,
  body: SendCommMessageBody,
  user: UserCtx,
): Promise<CommMessageResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .insert(teamCommMessages)
      .values({
        threadId,
        patientId,
        locationId: user.locationId,
        authorUserId: user.id,
        body: body.body,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Insert returned no rows");

    await logAudit(
      "create",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "comm_message",
        resourceId: row.id,
        details: { threadId },
      },
      tx as unknown as AuditDbCtx,
    );

    return toMessageResponse(row);
  });
}

export const TeamCommService = {
  listThreads,
  createThread,
  listMessages,
  sendMessage,
};
