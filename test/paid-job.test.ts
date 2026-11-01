// A whole paid job through provider-kit, offline: 402 challenge → signed test payment → logos.
// The facilitator is a fake and payments are signed with a random keypair, as the kit's own tests do.

import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProvider, type Facilitator } from "@stellar-agent-services/provider-kit";
import { signTestPayment } from "@stellar-agent-services/provider-kit/testing";
import { describe, expect, it, vi } from "vitest";
import { FileStore } from "../src/pipeline/files.js";
import type { ProjectDigest } from "../src/pipeline/types.js";
import { logoService } from "../src/service.js";

// The Stellar SDK is a dependency of the kit; load the kit's copy so keys and transactions match.
const kitRequire = createRequire(createRequire(import.meta.url).resolve("@stellar-agent-services/provider-kit"));
const { Keypair } = kitRequire("@stellar/stellar-sdk") as typeof import("@stellar/stellar-sdk");

const digest = JSON.parse(readFileSync(new URL("./fixtures/digest-stellar-agent-search.json", import.meta.url), "utf8")) as ProjectDigest;
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "logo-agent-"));
  const files = new FileStore(dir, "http://localhost:8787");
  const settle = vi.fn<Facilitator["settle"]>(async (_payload, requirements) => ({ success: true, transaction: "a".repeat(64), network: requirements.network }));
  const facilitator: Facilitator = { verify: vi.fn(async () => ({ isValid: true })), settle };
  const provider = createProvider({
    baseUrl: "http://localhost:8787",
    dev: true,
    network: "stellar:testnet",
    payTo: Keypair.random().publicKey(),
    provider: { name: "Stellar Logo Agent" },
    services: [logoService({ price: "0.10", deps: { files, llm: [], heuristicFallback: true, githubToken: undefined, readDigest: async () => digest } })],
    facilitator,
    maxTimeoutSeconds: 180,
    rpc: false,
  });
  await provider.ready();
  return { provider, files, settle };
}

const post = (provider: Awaited<ReturnType<typeof setup>>["provider"], body: unknown, headers: Record<string, string> = {}) =>
  provider.fetch(new Request("http://localhost:8787/services/logo-design/jobs", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));

describe("paid logo-design job", () => {
  it("publishes a valid manifest with the flat price", async () => {
    const { provider } = await setup();
    const service = provider.manifest.services[0]!;
    expect(service).toMatchObject({ name: "logo-design", charge: "on-success", price: { amount: "1000000" } });
    await provider.close();
  });

  it("rejects bad input before asking for payment", async () => {
    const { provider, settle } = await setup();
    const response = await post(provider, { repoUrl: "https://evil.example/x", style: "minimal" });
    expect(response.status).toBe(400);
    expect(settle).not.toHaveBeenCalled();
    await provider.close();
  });

  it("402 → pay → SVGs and PDF, settled exactly once", async () => {
    const { provider, files, settle } = await setup();
    const input = { repoUrl: "https://github.com/berkingurcan/stellar-agent-search", style: "geometric", count: 2 };
    const ids = { "Idempotency-Key": "0192d3a4-7c1e-7b2a-9f00-3c5e8a1b2c3d", "Job-Token": "q7Zt3m0bX0s8b6f5JmS2kQ9xg3Y1rZcV4nL8pW2eA0c" };

    const challenge = await post(provider, input, ids);
    expect(challenge.status).toBe(402);
    const required = JSON.parse(Buffer.from(challenge.headers.get("PAYMENT-REQUIRED")!, "base64").toString()) as { accepts: Parameters<typeof signTestPayment>[0][] };
    const payment = await signTestPayment(required.accepts[0]!, Keypair.random());

    const paid = await post(provider, input, { ...ids, "PAYMENT-SIGNATURE": b64(payment) });
    let view = (await paid.json()) as { status: string; output?: Record<string, unknown>; charged: boolean };
    for (let i = 0; i < 100 && view.status !== "succeeded" && view.status !== "failed"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      view = (await (await provider.fetch(new Request(`http://localhost:8787/jobs/${ids["Idempotency-Key"]}/result`, { headers: { "Job-Token": ids["Job-Token"] } }))).json()) as typeof view;
    }
    expect(view.status).toBe("succeeded");
    expect(view.charged).toBe(true);
    expect(settle).toHaveBeenCalledTimes(1);

    const output = view.output as { logos: { svgUrl: string; svgDarkUrl: string }[]; presentationPdfUrl: string };
    expect(output.logos).toHaveLength(2);
    for (const url of [output.logos[0]!.svgUrl, output.logos[1]!.svgDarkUrl, output.presentationPdfUrl]) {
      const [, , , , bundle, name] = url.split("/");
      const file = await files.read(bundle!, name!);
      expect(file, url).toBeDefined();
    }

    // The same paid request again returns the same job and never settles twice [J5].
    const again = await post(provider, input, { ...ids, "PAYMENT-SIGNATURE": b64(payment) });
    expect([200, 202]).toContain(again.status);
    expect(settle).toHaveBeenCalledTimes(1);
    await provider.close();
  }, 30_000);
});
