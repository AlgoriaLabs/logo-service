// A minimal OpenAI-compatible chat client with provider fallback.
//
// Every provider in the list is tried in order (Groq → Gemini → OpenRouter by default). A 429, a
// timeout or a reply that is not a JSON object moves on to the next one. API keys are only ever sent
// to the provider they belong to.

import type { LlmProviderSettings } from "../config.js";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmAnswer {
  provider: string;
  json: Record<string, unknown>;
}

export class LlmError extends Error {
  override name = "LlmError";
}

/** Finds the JSON object in a reply, tolerating code fences or chatter around it. */
export function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const candidates = [trimmed];
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (value !== null && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

async function callOne(provider: LlmProviderSettings, messages: ChatMessage[], options: { maxTokens: number; timeoutMs: number; signal?: AbortSignal | undefined }): Promise<Record<string, unknown>> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const response = await fetch(`${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: 0.8,
      max_tokens: options.maxTokens,
      response_format: { type: "json_object" },
      ...provider.extraBody,
    }),
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  if (!response.ok) {
    // Never echo the body: some providers reflect request headers in errors.
    throw new LlmError(`${provider.id} answered HTTP ${response.status}`);
  }
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new LlmError(`${provider.id} returned no message`);
  const json = parseJsonObject(content);
  if (json === undefined) throw new LlmError(`${provider.id} did not return a JSON object`);
  return json;
}

export async function chatJson(
  providers: readonly LlmProviderSettings[],
  messages: ChatMessage[],
  options: { maxTokens?: number; timeoutMs?: number; signal?: AbortSignal | undefined; log?: ((line: string) => void) | undefined } = {},
): Promise<LlmAnswer> {
  const failures: string[] = [];
  for (const provider of providers) {
    if (options.signal?.aborted) break;
    try {
      const json = await callOne(provider, messages, { maxTokens: options.maxTokens ?? 3000, timeoutMs: options.timeoutMs ?? 25_000, signal: options.signal });
      return { provider: `${provider.id}:${provider.model}`, json };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(reason);
      options.log?.(`[llm] ${provider.id} failed: ${reason}`);
    }
  }
  throw new LlmError(failures.length ? `no LLM answered (${failures.join("; ")})` : "no LLM provider is configured");
}
