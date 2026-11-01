// Runs the logo pipeline locally, without payments, and writes the files to ./out/<timestamp>/.
//
//   npm run demo -- https://github.com/owner/repo [style] [count] [--name "Brand"] [--digest digest.json]
//
// --digest skips GitHub and reads a ProjectDigest JSON instead (offline runs, tests).

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveLlm } from "../config.js";
import { FileStore } from "../pipeline/files.js";
import { runPipeline } from "../pipeline/index.js";
import { STYLES, type ProjectDigest, type Style } from "../pipeline/types.js";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
};
const brandName = flag("--name");
const digestPath = flag("--digest");
const [repoUrl, styleArg = "minimal", countArg = "3"] = args;

if (!repoUrl) {
  console.error(`usage: npm run demo -- <https://github.com/owner/repo> [${STYLES.join("|")}] [1-6] [--name "Brand"] [--digest file.json]`);
  process.exit(2);
}
if (!(STYLES as readonly string[]).includes(styleArg)) {
  console.error(`style must be one of: ${STYLES.join(", ")}`);
  process.exit(2);
}

const outDir = resolve("out", new Date().toISOString().replace(/[:.]/g, "-"));
const files = new FileStore(outDir, pathToFileURL(outDir).href);
const llm = resolveLlm(process.env);
console.log(`Designing with ${llm.map((p) => p.id).join(" → ") || "the heuristic designer (no LLM key set)"}...`);

const output = await runPipeline(
  { repoUrl, style: styleArg as Style, count: Math.min(6, Math.max(1, Number(countArg) || 3)), ...(brandName ? { brandName } : {}) },
  {
    files,
    llm,
    heuristicFallback: true,
    githubToken: process.env["GITHUB_TOKEN"],
    log: (line) => console.log(line),
    ...(digestPath ? { readDigest: async () => JSON.parse(await readFile(digestPath, "utf8")) as ProjectDigest } : {}),
  },
  { jobId: `demo-${Date.now()}` },
);

console.log(JSON.stringify(output, null, 2));
console.log(`\nFiles are in ${outDir}`);
