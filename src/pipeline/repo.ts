// Reads a public GitHub repository through the REST API (no clone) and condenses it into a small
// digest: metadata, a cleaned README excerpt, package manifest hints, keywords and colour hints.
//
// About 4–8 requests per job. Without GITHUB_TOKEN GitHub allows 60 requests an hour per IP; a free
// fine-grained token with no permissions raises that to 5,000. Everything read here is untrusted.

import type { ProjectDigest } from "./types.js";

export const REPO_URL_PATTERN = "^https://github\\.com/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}/?$";
const REPO_URL = new RegExp(REPO_URL_PATTERN);

const MANIFESTS = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "composer.json", "pubspec.yaml", "setup.cfg", "mix.exs", "Gemfile"];
const COLOR_FILES = /^(tailwind\.config\.(js|cjs|mjs|ts)|theme\.(json|css)|brand\.(json|css))$/i;
const MAX_TEXT_BYTES = 200_000;

export class RepoError extends Error {
  override name = "RepoError";
}

export function parseRepoUrl(url: string): { owner: string; repo: string } {
  if (!REPO_URL.test(url)) throw new RepoError("repoUrl must look like https://github.com/<owner>/<repo>");
  const [, , , owner, repo] = url.replace(/\/+$/, "").split("/");
  if (!owner || !repo) throw new RepoError("repoUrl must look like https://github.com/<owner>/<repo>");
  return { owner, repo: repo.replace(/\.git$/, "") };
}

interface Fetcher {
  json<T>(path: string): Promise<T | undefined>;
  text(path: string): Promise<string | undefined>;
}

function githubFetcher(token: string | undefined, signal: AbortSignal | undefined): Fetcher {
  const call = async (path: string, accept: string): Promise<Response | undefined> => {
    const timeout = AbortSignal.timeout(8000);
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: accept,
        "User-Agent": "stellar-logo-agent",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: "follow",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (response.status === 404) return undefined;
    if (response.status === 403 || response.status === 429) throw new RepoError("GitHub rate limit reached; set GITHUB_TOKEN");
    if (!response.ok) throw new RepoError(`GitHub answered ${response.status} for ${path}`);
    return response;
  };
  const readCapped = async (response: Response): Promise<string> => {
    const text = await response.text();
    return text.length > MAX_TEXT_BYTES ? text.slice(0, MAX_TEXT_BYTES) : text;
  };
  return {
    async json<T>(path: string) {
      const response = await call(path, "application/vnd.github+json");
      return response ? (JSON.parse(await readCapped(response)) as T) : undefined;
    },
    async text(path: string) {
      const response = await call(path, "application/vnd.github.raw+json");
      return response ? readCapped(response) : undefined;
    },
  };
}

interface RepoMeta {
  name: string;
  full_name: string;
  description: string | null;
  topics?: string[];
  language: string | null;
  homepage: string | null;
  private: boolean;
  default_branch: string;
  html_url: string;
}

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in into is it its of on or that the this to with your you we our can will use using used via based built simple easy fast small tiny new more most any all not but also just than then so if when what which who how about over under up out one two get set run make like only own other each lets let docs doc readme license mit apache version install npm yarn pnpm pip cargo run build test tests example examples usage api sdk app apps project projects tool tools library lib package packages repo repository github http https www com org io dev src code file files support supports supported features feature open source free node python rust go typescript javascript ts js see more need needs".split(
    " ",
  ),
);

export function extractKeywords(texts: readonly string[], limit = 15): string[] {
  const counts = new Map<string, number>();
  texts.forEach((text, index) => {
    const weight = index === 0 ? 4 : index === 1 ? 3 : 1; // name/topics and description count more
    for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length < 3 || raw.length > 20 || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + weight);
    }
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([word]) => word);
}

/** Strips HTML, badges, images, code blocks and link targets; keeps headings and prose. */
export function cleanReadme(markdown: string, maxChars = 2500): string {
  const lines = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "" && !/^\|?[-:| ]+\|?$/.test(line) && !/shields\.io|badge/i.test(line));
  let out = "";
  for (const line of lines) {
    if (out.length + line.length > maxChars) break;
    out += `${line}\n`;
  }
  return out.trim();
}

export function extractColors(text: string, limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const match of text.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const hex = `#${match[1]!.toUpperCase()}`;
    if (hex === "#FFFFFF" || hex === "#000000") continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([hex]) => hex);
}

function manifestHints(file: string, text: string): string[] {
  const hints: string[] = [];
  try {
    if (file.endsWith(".json")) {
      const json = JSON.parse(text) as Record<string, unknown>;
      for (const key of ["name", "description"]) if (typeof json[key] === "string") hints.push(json[key] as string);
      if (Array.isArray(json["keywords"])) hints.push(...(json["keywords"] as unknown[]).filter((k): k is string => typeof k === "string"));
      return hints;
    }
  } catch {
    return hints;
  }
  for (const match of text.matchAll(/^\s*(name|description|keywords)\s*[=:]\s*(.+)$/gim)) hints.push(match[2]!.replace(/["'[\]]/g, " ").trim());
  return hints.slice(0, 6);
}

export async function readRepo(url: string, options: { token?: string | undefined; signal?: AbortSignal | undefined } = {}): Promise<ProjectDigest> {
  const { owner, repo } = parseRepoUrl(url);
  const gh = githubFetcher(options.token, options.signal);
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  const meta = await gh.json<RepoMeta>(base);
  if (meta === undefined) throw new RepoError("repository not found, or it is private (only public repositories are supported)");
  if (meta.private) throw new RepoError("only public repositories are supported");

  const [readme, listing] = await Promise.all([
    gh.text(`${base}/readme`).catch(() => undefined),
    gh.json<{ name: string; type: string }[]>(`${base}/contents?ref=${encodeURIComponent(meta.default_branch)}`).catch(() => undefined),
  ]);
  const files = (Array.isArray(listing) ? listing : []).map((entry) => entry.name).slice(0, 80);

  const extraFiles = [...files.filter((name) => MANIFESTS.includes(name)).slice(0, 2), ...files.filter((name) => COLOR_FILES.test(name)).slice(0, 2)];
  const extras = await Promise.all(
    extraFiles.map(async (name) => ({ name, text: (await gh.text(`${base}/contents/${encodeURIComponent(name)}?ref=${encodeURIComponent(meta.default_branch)}`).catch(() => undefined)) ?? "" })),
  );

  const readmeText = readme ?? "";
  const hints = extras.filter((extra) => MANIFESTS.includes(extra.name)).flatMap((extra) => manifestHints(extra.name, extra.text.slice(0, 20_000)));
  const description = (meta.description ?? "").trim().slice(0, 300);
  const topics = (meta.topics ?? []).slice(0, 12);
  const excerpt = cleanReadme(readmeText);
  const keywords = extractKeywords([`${meta.name} ${topics.join(" ")}`, `${description} ${hints.join(" ")}`, excerpt]);
  const colorHints = extractColors([...extras.filter((extra) => COLOR_FILES.test(extra.name)).map((extra) => extra.text), readmeText].join("\n"));

  return {
    owner,
    repo: meta.name,
    url: meta.html_url,
    name: meta.name,
    description,
    topics,
    language: meta.language ?? undefined,
    homepage: meta.homepage ?? undefined,
    keywords,
    readmeExcerpt: excerpt,
    colorHints,
    files,
  };
}
