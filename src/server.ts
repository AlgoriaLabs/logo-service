// Entry point: the paid logo-design provider.
//
// Routes: provider-kit owns the manifest and job endpoints; this file adds GET /files/* (outputs),
// GET /healthz, and a tiny landing page. Config is public values + LLM keys; never a Stellar secret.

import { mkdir } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { createProvider, httpFacilitator, sqliteStore } from "@stellar-agent-services/provider-kit";
import { Hono } from "hono";
import { loadConfig } from "./config.js";
import { FileStore } from "./pipeline/files.js";
import { logoService, MAX_TIMEOUT_SECONDS } from "./service.js";

const config = loadConfig();
await mkdir(config.filesDir, { recursive: true });
const files = new FileStore(config.filesDir, config.publicOrigin);
const log = (line: string) => console.log(line);

const { network } = config;
const provider = createProvider({
  baseUrl: config.publicOrigin,
  dev: config.dev,
  network: network.caip2,
  payTo: network.payTo,
  facilitator: httpFacilitator(network.facilitatorUrl, {
    dev: config.dev,
    settleTimeoutSeconds: MAX_TIMEOUT_SECONDS + 30,
    ...(network.facilitatorApiKey ? { headers: { Authorization: `Bearer ${network.facilitatorApiKey}` } } : {}),
  }),
  maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
  retentionSeconds: config.retentionSeconds,
  provider: {
    name: "Stellar Logo Agent",
    description: "Logo designer agent: turns a GitHub repository into logo concepts (SVG) and a PDF presentation. Paid per job in USDC.",
    ...(network.agentId === undefined ? {} : { agentId: network.agentId }),
    dataUse: { storesInputs: false, trainsOnInputs: false },
  },
  services: [logoService({ price: config.priceUsdc, deps: { files, llm: config.llm, heuristicFallback: config.heuristicFallback, githubToken: config.githubToken, log } })],
  store: sqliteStore(config.jobDbPath),
  ...(network.rpcUrl ? { rpc: network.rpcUrl } : {}),
  ...(config.rateLimit
    ? {
        rateLimit: {
          ...config.rateLimit,
          // Behind Cloudflare Tunnel every request comes from cloudflared; the real client is this header.
          key: (request: Request) => request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
        },
      }
    : {}),
});

// Checks the facilitator settles this network, and resumes jobs a restart left behind. If it fails
// (facilitator down, wrong API key), the server still starts: create-job answers 503 and charges
// nothing, and the kit retries readiness on the next request.
await provider.ready().catch((error: unknown) => {
  console.error(`[startup] payments are not ready yet: ${(error as Error).message}. Create-job answers 503 until this clears.`);
});

const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true, network: network.name }));

app.get("/files/:bundle/:name", async (c) => {
  const file = await files.read(c.req.param("bundle"), c.req.param("name"));
  if (!file) return c.text("Not found", 404);
  return c.body(new Uint8Array(file.body), 200, {
    "Content-Type": file.type,
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "Access-Control-Allow-Origin": "*",
    ...(file.type === "application/pdf" ? { "Content-Disposition": `inline; filename="${c.req.param("name")}"` } : {}),
  });
});

app.get("/", (c) =>
  c.text(
    `Stellar Logo Agent (${network.name})\n\nA paid agent service: give it a public GitHub repo, a style and a count; get SVG logos and a PDF.\nManifest: ${provider.manifestUrl}\nPay with any Provider Standard v1 client, e.g. stellar-pay.\n`,
  ),
);

app.all("*", (c) => provider.fetch(c.req.raw));

// Delete output bundles once their jobs have expired.
const sweepFiles = () => void files.sweep(config.retentionSeconds + 3600).then((removed) => removed && log(`[files] removed ${removed} expired bundle(s)`));
sweepFiles();
const sweeper = setInterval(sweepFiles, 3600_000);

const server = serve({ fetch: app.fetch, port: config.port }, () => {
  log(`Stellar Logo Agent on ${network.name} (${network.caip2})`);
  log(`  listening  ${config.publicOrigin} (port ${config.port})`);
  log(`  manifest   ${provider.manifestUrl}`);
  log(`  payTo      ${network.payTo}`);
  log(`  agentId    ${network.agentId ?? "not registered yet"}`);
  log(`  designers  ${config.llm.map((llm) => `${llm.id}:${llm.model}`).join(" → ") || "none"}${config.heuristicFallback ? " → heuristic" : ""}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    clearInterval(sweeper);
    server.close(() => void provider.close().then(() => process.exit(0)));
  });
}
