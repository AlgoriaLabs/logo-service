#!/usr/bin/env node
// Short commands around the provider-kit CLI, so nobody types the manifest URL:
//
//   npm run wallet [-- mainnet]   set up the wallet buyers pay (USDC trustline), approved in your browser wallet;
//                                 saves its address to deploy/terraform/terraform.tfvars and .env
//   npm run check                 check the service, and see how agents find it
//   npm run try                   pay for one logo job with test money (testnet only)
//   npm run register              register on Stellar 8004, approved in your browser wallet; saves the agent id
//                                 to deploy/terraform/terraform.tfvars (then: npm run deploy)
//   npm run verify                the external standard check (C1–C7), without paying
//   npm run kit -- <anything>     the provider-kit CLI itself
//
// The service is found in this order: $MANIFEST, then `terraform output` in deploy/terraform, then the local
// server (npm run dev). Every command signs in your own wallet or not at all: this script never sees a key.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { payToFromOutput, registeredAgentFromOutput, setEnvVar, setTfvar, TFVARS } from "./lib/deploy-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KIT = join(root, "node_modules/@stellar-agent-services/provider-kit/dist/cli/index.js");
const VERIFIER = join(root, "node_modules/@stellar-agent-services/verifier/dist/cli/index.js");
const TFVARS_EXAMPLE = join(root, "deploy/terraform/terraform.tfvars.example");
const DOTENV = join(root, ".env");
const SERVICE = "logo-design";

const [command = "help", ...rest] = process.argv.slice(2);

function requireKit(cli) {
  if (!existsSync(cli)) {
    console.error("✗ The kit isn't installed. Run: npm install");
    process.exit(1);
  }
}

function run(cli, args) {
  requireKit(cli);
  const result = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", cli, ...args], { stdio: "inherit", cwd: root });
  process.exit(result.status ?? 1);
}

/**
 * Runs a provider-kit command with its output shown as it comes (the approval page's link must show at once, in
 * case no browser opens), then hands the whole output to `after`.
 */
function stream(args, after) {
  requireKit(KIT);
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", KIT, ...args], {
    stdio: ["inherit", "pipe", "inherit"],
    cwd: root,
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
  // Ctrl+C reaches the child too (same process group); let it cancel cleanly.
  process.on("SIGINT", () => {});
  child.on("close", (status) => {
    after(status ?? 1, output);
    process.exit(status ?? 1);
  });
}

/** terraform.tfvars, created from the example the first time something is saved to it. */
function saveTfvar(key, value) {
  if (!existsSync(TFVARS)) copyFileSync(TFVARS_EXAMPLE, TFVARS);
  writeFileSync(TFVARS, setTfvar(readFileSync(TFVARS, "utf8"), key, value));
}

function afterWallet(network) {
  return (status, output) => {
    const address = payToFromOutput(output);
    if (status !== 0 || address === undefined) return;
    saveTfvar(`pay_to_${network}`, address);
    if (existsSync(DOTENV)) writeFileSync(DOTENV, setEnvVar(readFileSync(DOTENV, "utf8"), `PAY_TO_${network.toUpperCase()}`, address));
    console.log(`\n✓ Saved pay_to_${network} = "${address}" to deploy/terraform/terraform.tfvars${existsSync(DOTENV) ? " and .env" : ""}`);
  };
}

function afterRegister(status, output) {
  const found = registeredAgentFromOutput(output);
  if (status !== 0 || found === undefined) return;
  const key = `agent_id_${found.network}`;
  saveTfvar(key, found.id);
  console.log(`\n✓ Saved ${key} = "${found.id}" to deploy/terraform/terraform.tfvars`);
  console.log("  Next: npm run deploy   (publishes the id, ~1 min; also updates GitHub when CI/CD is on)");
}

function findManifest() {
  if (process.env.MANIFEST) return { url: process.env.MANIFEST, from: "$MANIFEST" };
  const tf = spawnSync("terraform", ["-chdir=deploy/terraform", "output", "-raw", "manifest_url"], { cwd: root, encoding: "utf8", timeout: 30_000 });
  if (tf.status === 0 && tf.stdout.startsWith("https://")) return { url: tf.stdout.trim(), from: "terraform output" };
  const port = process.env.PORT ?? "8787";
  return { url: `http://localhost:${port}/.well-known/stellar-agent-services.json`, from: "local server (npm run dev)" };
}

function withManifest(args) {
  const { url, from } = findManifest();
  console.log(`→ service: ${url}  (${from})\n`);
  const dev = url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1") ? ["--dev"] : [];
  return ["--manifest", url, ...args, ...dev];
}

switch (command) {
  case "wallet": {
    const network = rest[0] === "mainnet" ? "mainnet" : "testnet";
    console.log(`→ Opening a page to connect your wallet (${network}). Switch the wallet itself to ${network === "mainnet" ? "Mainnet" : "Testnet"} too.\n`);
    stream(["trustline", "--network", network, ...rest.filter((a) => a !== "mainnet" && a !== "testnet")], afterWallet(network));
    break;
  }
  case "check":
    run(KIT, ["check", ...withManifest(rest)]);
    break;
  case "try":
    // --dev isn't a try flag: it reads the provider as it is.
    run(KIT, ["try", SERVICE, ...withManifest(rest).filter((a) => a !== "--dev")]);
    break;
  case "register": {
    // A registration publishes the service's public URL on chain, so it needs the deployed server.
    if (findManifest().url.startsWith("http://")) {
      console.error("✗ Nothing deployed yet: registration needs the public server. Run npm run deploy first (DEPLOY.md step 4).");
      process.exit(1);
    }
    stream(["register", ...withManifest(rest).filter((a) => a !== "--dev")], afterRegister);
    break;
  }
  case "verify": {
    const { url, from } = findManifest();
    console.log(`→ service: ${url}  (${from})\n`);
    const dev = url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1") ? ["--dev"] : [];
    run(VERIFIER, ["check", url, ...rest, ...dev]);
    break;
  }
  case "kit":
    run(KIT, rest);
    break;
  default:
    console.log("Commands: wallet [mainnet] · check · try · register · verify · kit -- <args>");
    process.exit(command === "help" ? 0 : 2);
}
