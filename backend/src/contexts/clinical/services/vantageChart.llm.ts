/**
 * VantageChart Layer 2 — optional LLM prose enhancement (Claude API).
 *
 * PHI RULE (non-negotiable):
 *   The payload sent to Claude MUST NOT contain patient identifiers.
 *   Only the assembled narrative text (draft) is sent — no name, no MRN,
 *   no date of birth, no SSN, no address, no facility name, no clinician name.
 *
 * Feature flag: only active when env.features.aiClinicalNotes === true.
 * Rate limit enforced at the route layer (10 requests/user/hour via Valkey).
 *
 * The original L1 draft is always preserved in the response — one-click revert.
 */

import { env } from "@/config/env.js";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `You are a clinical documentation editor for a hospice care organization.
You will receive a draft hospice visit note that was generated from structured clinical input.
Your task is to polish the prose for clarity and professional tone while:
1. Preserving ALL clinical facts exactly as stated — do not add, infer, or remove clinical information
2. Maintaining the same document structure and section order
3. Using appropriate clinical terminology
4. Keeping the note concise — do not pad with unnecessary words
5. The note must remain suitable for a Medicare/CMS audit

Do not add any information that was not in the draft. Do not remove any clinical observations.
Return ONLY the improved note text — no preamble, no explanation.`;

export interface LLMEnhanceResult {
  enhanced: string;
  original: string;
  tokensUsed: number;
}

export async function enhanceWithLLM(draft: string): Promise<LLMEnhanceResult> {
  if (!env.features.aiClinicalNotes) {
    throw new Error("AI clinical notes feature is disabled");
  }

  const claudeApiKey = process.env.ANTHROPIC_API_KEY;
  if (!claudeApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Please polish the following hospice visit note:\n\n${draft}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude API error ${response.status}: ${text}`);
  }

  const body = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const enhanced = body.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");

  return {
    enhanced,
    original: draft,
    tokensUsed: (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0),
  };
}

/**
 * Rate-limit check using Valkey sliding counter.
 * Returns true if the request is allowed, false if limit exceeded.
 * Key: vantage:rate:{userId}, TTL 3600s, max 10 per hour.
 */
export async function checkLLMRateLimit(
  valkey: { incr: (key: string) => Promise<number>; expire: (key: string, ttl: number) => Promise<number> },
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `vantage:rate:${userId}`;
  const count = await valkey.incr(key);
  if (count === 1) {
    // Set TTL on first increment (1 hour window)
    await valkey.expire(key, 3600);
  }
  const LIMIT = 10;
  return { allowed: count <= LIMIT, remaining: Math.max(0, LIMIT - count) };
}
