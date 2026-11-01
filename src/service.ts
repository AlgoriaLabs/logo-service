// The paid service, defined with provider-kit (Provider Standard v1).
//
// charge "on-success": the buyer pays only when the logos were delivered and the output matches
// outputSchema [S1]. A job takes ~15–40 s; expectedDurationSeconds stays ≤ maxTimeoutSeconds / 2 [S2].
// The handler never sees payment data, and its error messages never reach the client [E2].

import { defineService } from "@stellar-agent-services/provider-kit";
import type { JsonObject } from "@stellar-agent-services/protocol";
import { runPipeline, type PipelineDeps } from "./pipeline/index.js";
import { REPO_URL_PATTERN } from "./pipeline/repo.js";
import { STYLES, type JobInput } from "./pipeline/types.js";

export const MAX_TIMEOUT_SECONDS = 180;
export const EXPECTED_DURATION_SECONDS = 60;

const hex = { type: "string", pattern: "^#[0-9A-F]{6}$" };
const url = { type: "string", format: "uri" };

export const inputSchema = {
  type: "object",
  required: ["repoUrl", "style"],
  additionalProperties: false,
  properties: {
    repoUrl: { type: "string", pattern: REPO_URL_PATTERN, maxLength: 160, description: "A public GitHub repository, https://github.com/<owner>/<repo>" },
    style: { type: "string", enum: [...STYLES], description: "Logo style" },
    count: { type: "integer", minimum: 1, maximum: 6, default: 3, description: "How many logo concepts, 1 to 6" },
    brandName: { type: "string", minLength: 1, maxLength: 32, description: "Optional: the name to write in the logos (default: from the repository)" },
  },
};

export const outputSchema = {
  type: "object",
  required: ["project", "style", "logos", "presentationPdfUrl", "designer"],
  properties: {
    project: {
      type: "object",
      required: ["name", "tagline", "summary", "keywords", "repoUrl"],
      properties: { name: { type: "string" }, tagline: { type: "string" }, summary: { type: "string" }, keywords: { type: "array", items: { type: "string" } }, repoUrl: url },
    },
    style: { type: "string" },
    logos: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        required: ["id", "title", "rationale", "layout", "font", "palette", "svgUrl", "svgDarkUrl"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          rationale: { type: "string" },
          layout: { type: "string" },
          font: { type: "string" },
          palette: { type: "object", required: ["primary", "secondary", "ink", "background"], properties: { primary: hex, secondary: hex, ink: hex, background: hex } },
          svgUrl: url,
          svgDarkUrl: url,
          markSvgUrl: url,
        },
      },
    },
    presentationPdfUrl: url,
    designer: { type: "string", description: "Which model designed the concepts, or heuristic" },
  },
};

const EXAMPLE_INPUT: JsonObject = { repoUrl: "https://github.com/berkingurcan/stellar-agent-search", style: "minimal", count: 1 };
const EXAMPLE_OUTPUT: JsonObject = {
  project: { name: "Stellar Agent Search", tagline: "Find and vet AI agents on Stellar", summary: "A read-only discovery layer for agents registered on Stellar 8004.", keywords: ["stellar", "agents", "search"], repoUrl: "https://github.com/berkingurcan/stellar-agent-search" },
  style: "minimal",
  logos: [
    {
      id: "logo-1",
      title: "Sparkles circle",
      rationale: "A spark in a calm circle: discovery made simple.",
      layout: "horizontal",
      font: "inter-500",
      palette: { primary: "#0F766E", secondary: "#5EEAD4", ink: "#111827", background: "#FFFFFF" },
      svgUrl: "https://logo.example.com/files/0123456789abcdef0123456789abcdef/logo-1.svg",
      svgDarkUrl: "https://logo.example.com/files/0123456789abcdef0123456789abcdef/logo-1-dark.svg",
      markSvgUrl: "https://logo.example.com/files/0123456789abcdef0123456789abcdef/logo-1-mark.svg",
    },
  ],
  presentationPdfUrl: "https://logo.example.com/files/0123456789abcdef0123456789abcdef/presentation.pdf",
  designer: "groq:openai/gpt-oss-120b",
};

export function logoService(options: { price: string; deps: PipelineDeps }) {
  return defineService<JsonObject, JsonObject>({
    name: "logo-design",
    title: "Logo designer",
    // Plain description: what it does, when to use it, its limits. No prices, URLs or instructions (§3.4).
    description:
      "Designs logo concepts for a software project from its public GitHub repository. It reads the repository, then returns 1 to 6 logos in the chosen style as SVG files (light, dark and symbol versions) and a PDF presentation. Use it for a first logo set for an open-source project. Public github.com repositories only; logos are built from open icons and fonts.",
    price: options.price,
    charge: "on-success",
    expectedDurationSeconds: EXPECTED_DURATION_SECONDS,
    timeoutSeconds: 85,
    // Free LLM tiers allow ~8k tokens/min; two jobs at once is the safe ceiling.
    capacity: { concurrency: 2, maxQueued: 6, maxQueueWaitSeconds: 60 },
    maxInputBytes: 4096,
    tags: ["logo", "design", "branding", "svg", "pdf", "github"],
    // Also used by `verifier check` to probe the 402 challenge (C3) and load (C7).
    examples: [{ input: EXAMPLE_INPUT, output: EXAMPLE_OUTPUT }],
    inputSchema,
    outputSchema,
    handler: async (raw, { signal, jobId }) => {
      const input: JobInput = {
        repoUrl: raw["repoUrl"] as string,
        style: raw["style"] as JobInput["style"],
        count: typeof raw["count"] === "number" ? raw["count"] : 3,
        ...(typeof raw["brandName"] === "string" ? { brandName: raw["brandName"] } : {}),
      };
      return (await runPipeline(input, options.deps, { jobId, signal })) as unknown as JsonObject;
    },
  });
}
