// The testnet/mainnet switch: one variable picks payee, facilitator, RPC and job database.

import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, resolveLlm } from "../src/config.js";

const G_TEST = "GBZSBASBFMV5RGKPRIPCB5QQVAJ35IXKMTF2A2766MOA4ZHQ7MLSIPXU";
const G_MAIN = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const base = { PAY_TO_TESTNET: G_TEST, PAY_TO_MAINNET: G_MAIN, AGENT_ID_TESTNET: "7", AGENT_ID_MAINNET: "42", FACILITATOR_API_KEY_MAINNET: "k" };

describe("network switch", () => {
  it("defaults to testnet with the x402.org facilitator and the public RPC", () => {
    const config = loadConfig({ ...base });
    expect(config.network).toMatchObject({ name: "testnet", caip2: "stellar:testnet", payTo: G_TEST, agentId: 7, facilitatorUrl: "https://x402.org/facilitator", rpcUrl: undefined });
    expect(config.jobDbPath).toMatch(/jobs-testnet\.sqlite$/);
    expect(config.dev).toBe(true);
  });

  it("NETWORK=mainnet switches payee, agent id, facilitator, RPC and database together", () => {
    const config = loadConfig({ ...base, NETWORK: "mainnet", PUBLIC_ORIGIN: "https://logo.example.com" });
    expect(config.network).toMatchObject({
      name: "mainnet",
      caip2: "stellar:pubnet",
      payTo: G_MAIN,
      agentId: 42,
      facilitatorUrl: "https://channels.openzeppelin.com/x402",
      facilitatorApiKey: "k",
      rpcUrl: "https://mainnet.sorobanrpc.com",
    });
    expect(config.jobDbPath).toMatch(/jobs-mainnet\.sqlite$/);
  });

  it("refuses mainnet on the default facilitator without its API key", () => {
    expect(() => loadConfig({ ...base, NETWORK: "mainnet", FACILITATOR_API_KEY_MAINNET: "" })).toThrow(/FACILITATOR_API_KEY_MAINNET/);
  });

  it("refuses a secret key, an unknown network, and http origins in production", () => {
    expect(() => loadConfig({ PAY_TO_TESTNET: "SBZSBASBFMV5RGKPRIPCB5QQVAJ35IXKMTF2A2766MOA4ZHQ7MLSIPXU" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, NETWORK: "futurenet" })).toThrow(/NETWORK/);
    expect(() => loadConfig({ ...base, PUBLIC_ORIGIN: "http://logo.example.com" })).toThrow(/https/);
  });

  it("per-network overrides win over defaults", () => {
    const config = loadConfig({ ...base, FACILITATOR_URL_TESTNET: "https://channels.openzeppelin.com/x402/testnet", SOROBAN_RPC_URL_TESTNET: "https://rpc.example.com" });
    expect(config.network.facilitatorUrl).toBe("https://channels.openzeppelin.com/x402/testnet");
    expect(config.network.rpcUrl).toBe("https://rpc.example.com");
  });
});

describe("LLM providers", () => {
  it("keeps the configured order and skips providers without a key", () => {
    const llm = resolveLlm({ LLM_PROVIDERS: "gemini,groq,openrouter", GROQ_API_KEY: "g", GEMINI_API_KEY: "m" });
    expect(llm.map((p) => p.id)).toEqual(["gemini", "groq"]);
    expect(llm[1]).toMatchObject({ model: "openai/gpt-oss-120b", baseUrl: "https://api.groq.com/openai/v1" });
  });

  it("rejects an unknown provider name", () => {
    expect(() => resolveLlm({ LLM_PROVIDERS: "nope" })).toThrow(/unknown LLM provider/);
  });
});
