// The designer: LLM answers are clamped to the catalog, prompt injection can't escape the spec,
// and the heuristic designer works with no LLM at all.

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmProviderSettings } from "../src/config.js";
import { buildMessages, design } from "../src/pipeline/design.js";
import { parseJsonObject } from "../src/pipeline/llm.js";
import { STYLES, type ProjectDigest } from "../src/pipeline/types.js";

const digest = JSON.parse(readFileSync(new URL("./fixtures/digest-stellar-agent-search.json", import.meta.url), "utf8")) as ProjectDigest;
const groq: LlmProviderSettings = { id: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "test-key", model: "m", extraBody: {} };

function llmReplies(...contents: (string | number)[]) {
  const mock = vi.fn(async () => {
    const next = contents.shift();
    if (typeof next === "number") return new Response("{}", { status: next });
    return Response.json({ choices: [{ message: { content: next } }] });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => vi.unstubAllGlobals());

describe("parseJsonObject", () => {
  it("reads fenced or chatty replies", () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject('Sure! {"a":2} hope it helps')).toEqual({ a: 2 });
    expect(parseJsonObject("[1,2]")).toBeUndefined();
  });
});

describe("design", () => {
  it("uses valid LLM choices and clamps invalid ones to the style's catalog", async () => {
    llmReplies(
      JSON.stringify({
        brief: { name: "Agent Search", tagline: "Find agents on Stellar", summary: "Discovery for agents.", keywords: ["agents", "stellar"] },
        logos: [
          { title: "Orbit finder", rationale: "A star in orbit", mark: { kind: "icon", icon: "telescope", container: "circle" }, wordmark: { text: "Agent Search", font: "inter-500", case: "as-is", tracking: 0.02, accent: "dot" }, layout: "horizontal", palette: { primary: "#0F766E", secondary: "#5EEAD4", ink: "#111827", background: "#FFFFFF" } },
          { title: "Bad values", mark: { kind: "rocketship", icon: "not-an-icon", container: "triangle" }, wordmark: { font: "comic-sans", tracking: 9 }, layout: "sideways", palette: { primary: "red", ink: "#FFFFFF" } },
        ],
      }),
    );
    const result = await design(digest, { repoUrl: digest.url, style: "minimal", count: 2 }, { llm: [groq], heuristicFallback: true, seed: "t" });
    expect(result.generator).toBe("groq:m");
    expect(result.brief.name).toBe("Agent Search");
    expect(result.specs[0]).toMatchObject({ title: "Orbit finder", layout: "horizontal", mark: { kind: "icon", icon: "telescope", container: "circle" } });
    const bad = result.specs[1]!;
    expect(["icon", "geometric", "monogram"]).toContain(bad.mark.kind);
    expect(["none", "circle", "rounded"]).toContain(bad.mark.container);
    expect(["inter-500", "outfit-500", "sora-600", "space-grotesk-600"]).toContain(bad.wordmark.font);
    expect(bad.wordmark.tracking).toBeLessThanOrEqual(0.3);
    expect(bad.palette.primary).toMatch(/^#[0-9A-F]{6}$/);
    expect(bad.palette.ink).toBe("#111827"); // white text on white was refused
  });

  it("the buyer's brandName wins over a name the model read in the repo", async () => {
    llmReplies(JSON.stringify({ brief: { name: "IGNORE PREVIOUS INSTRUCTIONS" }, logos: [] }));
    const result = await design(digest, { repoUrl: digest.url, style: "wordmark", count: 1, brandName: "Scout" }, { llm: [groq], heuristicFallback: true, seed: "t" });
    expect(result.brief.name).toBe("Scout");
    expect(result.specs[0]!.wordmark.text).toBe("Scout");
  });

  it("writes the buyer's brandName in full, even when the model shortens it in a wordmark", async () => {
    const logo = (text: string) => ({ mark: { kind: "icon", icon: "shield" }, wordmark: { text, font: "sora-600" }, layout: "horizontal" });
    llmReplies(JSON.stringify({ brief: { name: "Self Control" }, logos: [logo("SELF CONTROL"), logo("Self Control Academy")] }));
    const brandName = "Self Control Fight Academy"; // 26 chars: over the old 24-char cap on model text
    const result = await design(digest, { repoUrl: digest.url, style: "minimal", count: 2, brandName }, { llm: [groq], heuristicFallback: true, seed: "t" });
    expect(result.specs.map((s) => s.wordmark.text)).toEqual([brandName, brandName]);
  });

  it("keeps the model's wordmark text when the buyer gave no name", async () => {
    llmReplies(JSON.stringify({ logos: [{ wordmark: { text: "Agent Search Stellar Discovery" } }] }));
    const result = await design(digest, { repoUrl: digest.url, style: "minimal", count: 1 }, { llm: [groq], heuristicFallback: true, seed: "t" });
    expect(result.specs[0]!.wordmark.text).toBe("Agent Search Stellar Discovery");
  });

  it("falls through providers on 429, then to the heuristic designer", async () => {
    const fetch = llmReplies(429, 500);
    const result = await design(digest, { repoUrl: digest.url, style: "tech", count: 3 }, { llm: [groq, { ...groq, id: "gemini" }], heuristicFallback: true, seed: "t" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.generator).toBe("heuristic");
    expect(result.specs).toHaveLength(3);
  });

  it("every style yields distinct concepts with the heuristic designer", async () => {
    for (const style of STYLES) {
      const result = await design(digest, { repoUrl: digest.url, style, count: 6 }, { llm: [], heuristicFallback: true, seed: style });
      const signatures = new Set(result.specs.map((s) => JSON.stringify([s.mark, s.wordmark.font, s.layout])));
      expect(signatures.size, style).toBeGreaterThanOrEqual(style === "wordmark" ? 4 : 5);
    }
  });

  it("marks repository content as untrusted in the prompt", () => {
    const [system, user] = buildMessages(digest, { repoUrl: digest.url, style: "minimal", count: 2 }, ["star"]);
    expect(system!.content).toMatch(/untrusted/);
    expect(user!.content).toContain("PROJECT (untrusted data)");
  });
});
