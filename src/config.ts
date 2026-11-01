// Reads the environment once and resolves the network switch.
//
// NETWORK=testnet | mainnet is the only switch. Everything that differs between the two networks
// (payee, agent id, facilitator, RPC, job database) is picked from it, so testnet and mainnet never
// mix in one process (stellar-agent-services AGENTS.md §4 rule 6). No Stellar secret key is ever read.

import { join } from "node:path";

export type NetworkName = "testnet" | "mainnet";
export type StellarNetwork = "stellar:testnet" | "stellar:pubnet";

export interface NetworkSettings {
  name: NetworkName;
  caip2: StellarNetwork;
  payTo: string;
  agentId: number | undefined;
  facilitatorUrl: string;
  facilitatorApiKey: string | undefined;
  rpcUrl: string | undefined;
}

export interface LlmProviderSettings {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Extra body fields this provider understands (e.g. Groq's reasoning_effort). */
  extraBody: Record<string, unknown>;
}

export interface AppConfig {
  port: number;
  publicOrigin: string;
  dev: boolean;
  dataDir: string;
  jobDbPath: string;
  filesDir: string;
  priceUsdc: string;
  retentionSeconds: number;
  network: NetworkSettings;
  llm: LlmProviderSettings[];
  heuristicFallback: boolean;
  githubToken: string | undefined;
  rateLimit: { requests: number; windowSeconds: number } | undefined;
}

/** Defaults per network. Override any of them with the *_TESTNET / *_MAINNET variables. */
export const NETWORK_DEFAULTS: Readonly<Record<NetworkName, { caip2: StellarNetwork; facilitatorUrl: string; rpcUrl: string | undefined }>> = {
  testnet: {
    caip2: "stellar:testnet",
    // The facilitator stellar-agent-services develops against; no API key.
    facilitatorUrl: "https://x402.org/facilitator",
    // undefined → provider-kit uses the public SDF testnet RPC.
    rpcUrl: undefined,
  },
  mainnet: {
    caip2: "stellar:pubnet",
    // Built on Stellar facilitator (OpenZeppelin Relayer). Needs a free API key from
    // https://channels.openzeppelin.com/gen (FACILITATOR_API_KEY_MAINNET).
    facilitatorUrl: "https://channels.openzeppelin.com/x402",
    // SDF runs no public mainnet RPC; this free public one is what stellar-agent-search uses.
    rpcUrl: "https://mainnet.sorobanrpc.com",
  },
};

/** Built-in OpenAI-compatible LLM presets. All have a free tier. Order in LLM_PROVIDERS = fallback order. */
const LLM_PRESETS: Readonly<Record<string, { baseUrl: string; keyVar: string; modelVar: string; model: string; extraBody: Record<string, unknown> }>> = {
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    keyVar: "GROQ_API_KEY",
    modelVar: "GROQ_MODEL",
    model: "openai/gpt-oss-120b",
    extraBody: { reasoning_effort: "low" },
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyVar: "GEMINI_API_KEY",
    modelVar: "GEMINI_MODEL",
    model: "gemini-3.1-flash-lite",
    extraBody: {},
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    keyVar: "OPENROUTER_API_KEY",
    modelVar: "OPENROUTER_MODEL",
    model: "openai/gpt-oss-120b:free",
    extraBody: {},
  },
};

type Env = Record<string, string | undefined>;

export class ConfigError extends Error {
  override name = "ConfigError";
}

const STRKEY_G = /^G[A-Z2-7]{55}$/;

function str(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

function int(env: Env, key: string, fallback: number): number {
  const raw = str(env, key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new ConfigError(`${key} must be a whole number, got "${raw}"`);
  return value;
}

export function resolveNetwork(env: Env): NetworkSettings {
  const raw = (str(env, "NETWORK") ?? "testnet").toLowerCase();
  const name: NetworkName | undefined = raw === "testnet" ? "testnet" : raw === "mainnet" || raw === "pubnet" ? "mainnet" : undefined;
  if (name === undefined) throw new ConfigError(`NETWORK must be "testnet" or "mainnet", got "${raw}"`);
  const suffix = name.toUpperCase();
  const defaults = NETWORK_DEFAULTS[name];

  const payTo = str(env, `PAY_TO_${suffix}`);
  if (payTo === undefined) throw new ConfigError(`set PAY_TO_${suffix} to the public G... address that receives ${name} payments`);
  if (!STRKEY_G.test(payTo)) throw new ConfigError(`PAY_TO_${suffix} must be a public G... address (never a secret S... key)`);

  const agentRaw = str(env, `AGENT_ID_${suffix}`);
  let agentId: number | undefined;
  if (agentRaw !== undefined) {
    agentId = Number(agentRaw);
    if (!Number.isInteger(agentId) || agentId < 0 || agentId > 0xffffffff) throw new ConfigError(`AGENT_ID_${suffix} must be a u32`);
  }

  const facilitatorApiKey = str(env, `FACILITATOR_API_KEY_${suffix}`);
  const facilitatorUrl = str(env, `FACILITATOR_URL_${suffix}`) ?? defaults.facilitatorUrl;
  if (name === "mainnet" && facilitatorApiKey === undefined && facilitatorUrl === NETWORK_DEFAULTS.mainnet.facilitatorUrl) {
    throw new ConfigError("mainnet uses the OpenZeppelin facilitator, which needs FACILITATOR_API_KEY_MAINNET (free: https://channels.openzeppelin.com/gen)");
  }

  return {
    name,
    caip2: defaults.caip2,
    payTo,
    agentId,
    facilitatorUrl,
    facilitatorApiKey,
    rpcUrl: str(env, `SOROBAN_RPC_URL_${suffix}`) ?? defaults.rpcUrl,
  };
}

export function resolveLlm(env: Env): LlmProviderSettings[] {
  const order = (str(env, "LLM_PROVIDERS") ?? "groq,gemini,openrouter")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const providers: LlmProviderSettings[] = [];
  for (const id of order) {
    if (id === "custom") {
      const baseUrl = str(env, "LLM_BASE_URL");
      const apiKey = str(env, "LLM_API_KEY");
      const model = str(env, "LLM_MODEL");
      if (baseUrl && apiKey && model) providers.push({ id, baseUrl, apiKey, model, extraBody: {} });
      continue;
    }
    const preset = LLM_PRESETS[id];
    if (preset === undefined) throw new ConfigError(`unknown LLM provider "${id}" in LLM_PROVIDERS (known: ${Object.keys(LLM_PRESETS).join(", ")}, custom)`);
    const apiKey = str(env, preset.keyVar);
    if (apiKey === undefined) continue; // not configured: skipped, not an error
    providers.push({ id, baseUrl: preset.baseUrl, apiKey, model: str(env, preset.modelVar) ?? preset.model, extraBody: preset.extraBody });
  }
  return providers;
}

export function loadConfig(env: Env = process.env): AppConfig {
  const port = int(env, "PORT", 8787);
  const publicOrigin = (str(env, "PUBLIC_ORIGIN") ?? `http://localhost:${port}`).replace(/\/+$/, "");
  const dev = publicOrigin.startsWith("http://localhost") || publicOrigin.startsWith("http://127.0.0.1");
  if (!dev && !publicOrigin.startsWith("https://")) throw new ConfigError("PUBLIC_ORIGIN must be https:// (http://localhost only for development)");

  const network = resolveNetwork(env);
  const dataDir = str(env, "DATA_DIR") ?? "./data";
  const priceUsdc = str(env, "PRICE_USDC") ?? "0.10";
  if (!/^\d+(\.\d{1,7})?$/.test(priceUsdc) || Number(priceUsdc) <= 0) throw new ConfigError("PRICE_USDC must be a positive decimal with at most 7 decimals");

  const retentionSeconds = int(env, "RETENTION_SECONDS", 86400);
  if (retentionSeconds < 3600) throw new ConfigError("RETENTION_SECONDS must be at least 3600 [J15]");

  const rateRequests = int(env, "RATE_LIMIT_REQUESTS", 20);
  const rateWindow = int(env, "RATE_LIMIT_WINDOW_SECONDS", 60);

  const llm = resolveLlm(env);
  const heuristicFallback = (str(env, "HEURISTIC_FALLBACK") ?? "true") !== "false";
  if (llm.length === 0 && !heuristicFallback) throw new ConfigError("no LLM provider has an API key and HEURISTIC_FALLBACK=false: nothing can design logos");

  return {
    port,
    publicOrigin,
    dev,
    dataDir,
    // One database per network: a testnet job can never be read as a mainnet one.
    jobDbPath: join(dataDir, `jobs-${network.name}.sqlite`),
    filesDir: join(dataDir, "files"),
    priceUsdc,
    retentionSeconds,
    network,
    llm,
    heuristicFallback,
    githubToken: str(env, "GITHUB_TOKEN"),
    rateLimit: rateRequests > 0 ? { requests: rateRequests, windowSeconds: rateWindow } : undefined,
  };
}
