// The whole job: read the repo → design (one LLM call, heuristic fallback) → render SVGs → PDF → store.

import type { LlmProviderSettings } from "../config.js";
import { design } from "./design.js";
import type { FileStore } from "./files.js";
import { buildPresentation, type PresentationLogo } from "./pdf.js";
import { renderLogo } from "./render.js";
import { readRepo } from "./repo.js";
import type { JobInput, Palette, ProjectDigest } from "./types.js";

export interface LogoOutput {
  id: string;
  title: string;
  rationale: string;
  layout: string;
  font: string;
  palette: Palette;
  svgUrl: string;
  svgDarkUrl: string;
  markSvgUrl?: string;
}

export interface JobOutput {
  project: { name: string; tagline: string; summary: string; keywords: string[]; repoUrl: string };
  style: string;
  logos: LogoOutput[];
  presentationPdfUrl: string;
  designer: string;
  [key: string]: unknown;
}

export interface PipelineDeps {
  files: FileStore;
  llm: readonly LlmProviderSettings[];
  heuristicFallback: boolean;
  githubToken: string | undefined;
  log?: ((line: string) => void) | undefined;
  /** Replaces the GitHub reader (tests and offline demos). */
  readDigest?: (repoUrl: string) => Promise<ProjectDigest>;
}

export async function runPipeline(input: JobInput, deps: PipelineDeps, context: { jobId: string; signal?: AbortSignal | undefined }): Promise<JobOutput> {
  const started = Date.now();
  const digest = deps.readDigest ? await deps.readDigest(input.repoUrl) : await readRepo(input.repoUrl, { token: deps.githubToken, signal: context.signal });
  const result = await design(digest, input, { llm: deps.llm, heuristicFallback: deps.heuristicFallback, seed: `${context.jobId}:${digest.owner}/${digest.repo}:${input.style}`, signal: context.signal, log: deps.log });
  context.signal?.throwIfAborted();

  const bundle = await deps.files.newBundle();
  const presentation: PresentationLogo[] = [];
  const logos: LogoOutput[] = [];
  for (const [index, spec] of result.specs.entries()) {
    const id = `logo-${index + 1}`;
    const label = `${result.brief.name} logo, concept ${index + 1}`;
    const light = renderLogo(spec, "light", label)!;
    const dark = renderLogo(spec, "dark", label)!;
    const mark = renderLogo(spec, "mark", label);
    const output: LogoOutput = {
      id,
      title: spec.title,
      rationale: spec.rationale,
      layout: spec.layout,
      font: spec.wordmark.font,
      palette: spec.palette,
      svgUrl: await bundle.put(`${id}.svg`, light.svg),
      svgDarkUrl: await bundle.put(`${id}-dark.svg`, dark.svg),
    };
    if (mark) output.markSvgUrl = await bundle.put(`${id}-mark.svg`, mark.svg);
    logos.push(output);
    presentation.push({ spec, light, dark, mark });
  }

  const pdf = await buildPresentation({ brief: result.brief, repoUrl: digest.url, style: input.style, generator: result.generator, createdAt: new Date(), logos: presentation });
  const presentationPdfUrl = await bundle.put("presentation.pdf", pdf);
  deps.log?.(`[job ${context.jobId}] ${digest.owner}/${digest.repo} ${input.style}×${input.count} by ${result.generator} in ${Date.now() - started} ms`);

  return {
    project: { ...result.brief, repoUrl: digest.url },
    style: input.style,
    logos,
    presentationPdfUrl,
    designer: result.generator,
  };
}
