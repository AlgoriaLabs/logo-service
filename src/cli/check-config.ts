// Checks the environment the way the server will read it, without starting anything.
// The deploy runs it on the new release before switching to it: a missing or wrong value stops the deploy
// with its name, and the running release keeps serving.
//
//   node --env-file=<file> dist/cli/check-config.js

import { ConfigError, loadConfig } from "../config.js";

try {
  const config = loadConfig();
  const { network } = config;
  console.log(`✓ config ok: ${network.name} (${network.caip2}), ${config.publicOrigin}`);
  console.log(`  payTo ${network.payTo}, agent ${network.agentId ?? "not registered yet"}, price ${config.priceUsdc} USDC`);
  console.log(`  designers: ${config.llm.map((llm) => llm.id).join(" → ") || "none"}${config.heuristicFallback ? " → heuristic" : ""}`);
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
  throw error;
}
