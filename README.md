# Stellar Logo Agent

A paid AI agent service on Stellar. Give it a **public GitHub repository**, a **style** and a **count** (1–6); it
reads the project and returns **SVG logos** (light, dark and symbol versions) plus a **PDF presentation**.
Buyers pay per job in USDC through x402, and find it with [stellar-agent-search](https://github.com/berkingurcan/stellar-agent-search).

Built on [stellar-agent-services](https://github.com/AlgoriaLabs/stellar-agent-services) Provider Standard v1, with
`provider-kit`. Runs on testnet or mainnet: one variable switches it. Runs for $0/month on free tiers.

👉 **Deploying it: [DEPLOY.md](DEPLOY.md)** (one page) · on your laptop first: [SETUP.md](SETUP.md).

## How it works

```
buyer agent ──find──▶ stellar-agent-search (8004 registry)
     │
     └─POST /services/logo-design/jobs ──▶ 402 challenge ──▶ signed USDC payment (x402, on-success)
                                              │
              ┌───────────────────────────────┴───────────────────────────────┐
              │ 1 repo reader   GitHub REST API, no clone: meta, README, manifests, colours
              │ 2 designer      ONE LLM call → brief + N logo specs (JSON, catalog-only values)
              │                 Groq → Gemini → OpenRouter → built-in heuristic
              │ 3 renderer      specs → SVG (Lucide icons, OFL fonts as outlines, geometric marks)
              │ 4 presentation  PDF with vector logos (pdfkit + svg-to-pdfkit, no browser)
              └───────────────────────────────┬───────────────────────────────┘
                                              ▼
     job result: brief, logos[{svgUrl, svgDarkUrl, markSvgUrl, palette, font}], presentationPdfUrl
```

**Why specs instead of LLM-drawn SVG:** small free models draw SVG badly. Here the model only *chooses* from a
catalog (icons, fonts, shapes, layouts, colours) and code draws. Output is always valid and on-brand, a job is
one small LLM call, and a prompt injection in a README can't produce arbitrary SVG: every field is whitelisted.

## Service

| | |
| --- | --- |
| Service | `logo-design` |
| Price | flat `PRICE_USDC` (default 0.10) for 1–6 logos |
| Charge | `on-success`: failed work is never charged |
| Input | `repoUrl` (public `https://github.com/<owner>/<repo>`), `style`, `count` (default 3), optional `brandName` |
| Styles | `minimal` `geometric` `lettermark` `wordmark` `emblem` `playful` `tech` |
| Output | brief, logos with `svgUrl` / `svgDarkUrl` / `markSvgUrl`, `presentationPdfUrl`, `designer` |
| Files | kept for the job retention (24 h), then deleted |

## Networks

`NETWORK=testnet | mainnet` picks everything that differs:

| | testnet | mainnet |
| --- | --- | --- |
| CAIP-2 | `stellar:testnet` | `stellar:pubnet` |
| Payee | `PAY_TO_TESTNET` | `PAY_TO_MAINNET` |
| 8004 agent | `AGENT_ID_TESTNET` | `AGENT_ID_MAINNET` |
| Facilitator | `https://x402.org/facilitator` | `https://channels.openzeppelin.com/x402` + `FACILITATOR_API_KEY_MAINNET` |
| Soroban RPC | SDF public testnet | `https://mainnet.sorobanrpc.com` |
| Job database | `jobs-testnet.sqlite` | `jobs-mainnet.sqlite` |

On the server it's one line in `deploy/terraform/terraform.tfvars`: `stellar_network = "mainnet"`, then `npm run deploy`.

## Deployment and CI/CD

One Oracle Always Free Ampere VM (1 OCPU / 6 GB) with Caddy for HTTPS (Let's Encrypt, on `<ip>.sslip.io` or your
domain). Terraform zips this repo, uploads it over SSH, builds it on the server, checks the new config, then
switches releases. A wrong setting stops the deploy and the old release keeps serving.

```
npm run deploy  (laptop)  ┐
git push main   (CI/CD)   ┴─▶ terraform apply ─▶ upload + build on the VM ─▶ config check ─▶ switch ─▶ /healthz
                              state: private OCI bucket, shared and locked, so laptop and CI never collide
```

| Workflow | Runs on | Does |
| --- | --- | --- |
| `.github/workflows/ci-cd.yml` → `test` | every push and pull request | typecheck, tests, sample logos, `terraform validate` |
| `.github/workflows/ci-cd.yml` → `deploy` | push to `main`, once `npm run ci:setup` set `DEPLOY_ENABLED=true` | `scripts/deploy.mjs --ci`, then `npm run check` |

Step by step: [DEPLOY.md](DEPLOY.md).

## Layout

| Path | What |
| --- | --- |
| `src/server.ts` | Entry point: provider-kit provider, `/files/*`, `/healthz` |
| `src/config.ts` | Environment and the network switch |
| `src/service.ts` | The `logo-design` service: schemas, price, capacity |
| `src/pipeline/repo.ts` | GitHub reader → project digest |
| `src/pipeline/design.ts` | Prompt, LLM answer sanitizer, heuristic designer |
| `src/pipeline/llm.ts` | OpenAI-compatible client with provider fallback |
| `src/pipeline/catalog.ts` | Fonts, style rules, icon shortlist |
| `src/pipeline/render.ts` | Spec → SVG |
| `src/pipeline/pdf.ts` | PDF presentation |
| `src/pipeline/files.ts` | Output storage and expiry |
| `src/cli/demo.ts` | `npm run demo`: the pipeline without payments |
| `src/cli/check-config.ts` | The config check a deploy runs before switching releases |
| `deploy/terraform/` | The VM, network, reserved IP, Caddy and the deploy step |
| `deploy/state/` | The private bucket for Terraform state (created by the first `npm run deploy`) |
| `scripts/` | `deploy.mjs`, `ci-setup.mjs`, `kit.mjs` (wallet, check, try, register, verify), `vendor-kit.sh` |
| `vendor/`, `KIT_REF` | The stellar-agent-services kit, packed (`npm run update-kit`) |
| `test/` | Offline tests, including a full 402 → pay → result job |

## Development

```bash
npm ci            # the kit is already in vendor/
npm test          # offline tests
npm run demo      # draw logos without payments
npm run dev       # the paid service on http://localhost:8787
npm run try       # pay it once with test money: no wallet to set up
npm run check     # Provider Standard self-check + how agents see you
```

Laptop guide: [SETUP.md](SETUP.md).

### The stellar-agent-services kit

The kit isn't on npm yet, so `vendor/` holds its packages (`protocol`, `payment-client`, `provider-kit`,
`verifier`) packed at the commit in `KIT_REF`, the same way `npm create stellar-service` vendors it. The npm
`overrides` in `package.json` keep one copy of the Stellar SDK, as the kit requires. To update:

```bash
npm run update-kit -- main   # clone + build + pack at that ref; then npm install && npm test
```

## Security

- **No Stellar secret key anywhere**: the server knows only public `payTo` addresses. The owner steps (USDC
  trustline, 8004 registration, validation requests) are approved in your own wallet on a page `provider-kit`
  opens on your laptop, so no wallet key ever reaches CI or the server.
- Repository content is untrusted: it is labelled as such in the prompt, and nothing the model returns is used
  unless it matches the catalog.
- SVGs contain no `<text>` (it is outlined), scripts, links or external references; files are served with a sandboxing CSP.
- Output URLs use random 128-bit ids, independent of job ids.

## Credits

Icons: [Lucide](https://lucide.dev) (ISC). Fonts: Google Fonts via [Fontsource](https://fontsource.org) (SIL OFL).
Payments and standard: [stellar-agent-services](https://github.com/AlgoriaLabs/stellar-agent-services) (MIT).

## License

MIT
