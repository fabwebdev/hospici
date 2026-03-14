/**
 * VantageChart Layer 2 — optional LLM prose enhancement.
 *
 * Provider priority (first configured wins):
 *   1. Claude  — set ANTHROPIC_API_KEY
 *   2. OpenAI  — set OPENAI_API_KEY
 *   3. Gemini  — set GEMINI_API_KEY
 *   4. Ollama  — set OLLAMA_BASE_URL (local, no key required)
 *
 * PHI RULE (non-negotiable):
 *   The payload sent to any LLM MUST NOT contain patient identifiers.
 *   Only the assembled narrative text (draft) is sent — no name, no MRN,
 *   no date of birth, no SSN, no address, no facility name, no clinician name.
 *
 * Feature flag: only active when env.features.aiClinicalNotes === true.
 * Rate limit enforced at the route layer (10 requests/user/hour via Valkey).
 *
 * The original L1 draft is always preserved in the response — one-click revert.
 */

import { env } from "@/config/env.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_TOKENS = 1024;

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-6";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

// ── Result type ───────────────────────────────────────────────────────────────

export interface LLMEnhanceResult {
  enhanced: string;
  original: string;
  tokensUsed: number;
  provider: "claude" | "openai" | "gemini" | "ollama";
  model: string;
}

// ── Provider implementations ──────────────────────────────────────────────────

async function enhanceWithClaude(draft: string, apiKey: string): Promise<LLMEnhanceResult> {
  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Please polish the following hospice visit note:\n\n${draft}` }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  return {
    enhanced: body.content.filter((c) => c.type === "text").map((c) => c.text).join(""),
    original: draft,
    tokensUsed: (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0),
    provider: "claude",
    model: CLAUDE_MODEL,
  };
}

async function enhanceWithOpenAI(draft: string, apiKey: string): Promise<LLMEnhanceResult> {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Please polish the following hospice visit note:\n\n${draft}` },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    enhanced: body.choices[0]?.message.content ?? "",
    original: draft,
    tokensUsed: (body.usage?.prompt_tokens ?? 0) + (body.usage?.completion_tokens ?? 0),
    provider: "openai",
    model: OPENAI_MODEL,
  };
}

async function enhanceWithGemini(draft: string, apiKey: string): Promise<LLMEnhanceResult> {
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: `Please polish the following hospice visit note:\n\n${draft}` }] }],
      generationConfig: { maxOutputTokens: MAX_TOKENS },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    usageMetadata: { promptTokenCount: number; candidatesTokenCount: number };
  };

  return {
    enhanced: body.candidates[0]?.content.parts.map((p) => p.text).join("") ?? "",
    original: draft,
    tokensUsed: (body.usageMetadata?.promptTokenCount ?? 0) + (body.usageMetadata?.candidatesTokenCount ?? 0),
    provider: "gemini",
    model: GEMINI_MODEL,
  };
}

async function enhanceWithOllama(draft: string, baseUrl: string, model: string): Promise<LLMEnhanceResult> {
  // Ollama's OpenAI-compatible endpoint (/api/chat)
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Please polish the following hospice visit note:\n\n${draft}` },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as {
    message: { content: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };

  return {
    enhanced: body.message.content,
    original: draft,
    tokensUsed: (body.prompt_eval_count ?? 0) + (body.eval_count ?? 0),
    provider: "ollama",
    model,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function enhanceWithLLM(draft: string): Promise<LLMEnhanceResult> {
  if (!env.features.aiClinicalNotes) {
    throw new Error("AI clinical notes feature is disabled");
  }

  if (env.anthropicApiKey) return enhanceWithClaude(draft, env.anthropicApiKey);
  if (env.openaiApiKey)    return enhanceWithOpenAI(draft, env.openaiApiKey);
  if (env.geminiApiKey)    return enhanceWithGemini(draft, env.geminiApiKey);
  if (env.ollamaBaseUrl)   return enhanceWithOllama(draft, env.ollamaBaseUrl, env.ollamaModel);

  throw new Error(
    "No LLM provider configured. Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or OLLAMA_BASE_URL.",
  );
}

/**
 * Rate-limit check using Valkey sliding counter.
 * Returns true if the request is allowed, false if limit exceeded.
 * Key: vantage:rate:{userId}, TTL 3600s, max 10 per hour.
 */
export async function checkLLMRateLimit(
  valkey: {
    incr: (key: string) => Promise<number>;
    expire: (key: string, ttl: number) => Promise<number>;
  },
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `vantage:rate:${userId}`;
  const count = await valkey.incr(key);
  if (count === 1) {
    await valkey.expire(key, 3600);
  }
  const LIMIT = 10;
  return { allowed: count <= LIMIT, remaining: Math.max(0, LIMIT - count) };
}
