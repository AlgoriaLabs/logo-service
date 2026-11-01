# Stellar Logo Agent

A paid AI agent service on Stellar. Give it a **public GitHub repository**, a **style** and a **count** (1–6); it
reads the project and returns **SVG logos** (light, dark and symbol versions) plus a **PDF presentation**.
Buyers pay per job in USDC through x402, and find it with [stellar-agent-search](https://github.com/berkingurcan/stellar-agent-search).

Built on [stellar-agent-services](https://github.com/AlgoriaLabs/stellar-agent-services) Provider Standard v1, with
`provider-kit`. Runs on testnet or mainnet: one variable switches it. Runs for $0/month on free tiers.

👉 **Deploying it: [DEPLOY.md](DEPLOY.md)** (one page) · the long version: [SETUP.md](SETUP.md).

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

With Terraform, it's `network = "mainnet"` in `terraform.tfvars` and `terraform apply` (or `make switch NET=mainnet`).

## CI/CD

```
git push main ──▶ ci (typecheck, tests, offline render, terraform validate, shellcheck)
                   └─▶ image: ghcr.io/algorialabs/stellar-logo-agent :main :sha-<7>   (amd64 + arm64)
                         └─▶ server timer pulls it (≤ 2 min, pull-based: CI holds no server credentials)
                               └─▶ verify: /healthz reports the new version → verifier check
                                     → provider-kit check → provider-kit try (one real testnet payment, optional)
git tag v1.2.0 ──▶ same, tagged :1.2.0 :stable  (the mainnet server follows stable)
```

| Workflow | Runs on | Does |
| --- | --- | --- |
| `.github/workflows/ci.yml` | pull requests, branch pushes, and as CD's first stage | tests, render, Terraform `fmt`/`validate`, shellcheck, image build |
| `.github/workflows/cd.yml` | push to `main`, `v*` tags, manual | publishes the image, then verifies the live service when `DEPLOY_URL` is set |

The server follows one image tag (`app_tag`): `main` (testnet), `stable` (mainnet) or `sha-<7>` to pin a build.
Rolling back is `make rollback TAG=sha-abc1234`. Infrastructure changes stay a reviewed `make apply` from your machine.

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
| `infra/terraform/` | Oracle Always Free VM + Cloudflare Tunnel + the server's `.env` and updater |
| `infra/server/` | Production compose (image + cloudflared) and the 2-minute auto-update timer |
| `.github/workflows/` | CI and CD |
| `Dockerfile`, `compose.yaml` | App image (amd64/arm64) and a local container run |
| `vendor/`, `KIT_REF` | The stellar-agent-services kit, packed (`scripts/vendor-kit.sh`, `make kit`) |
| `test/` | Offline tests, including a full 402 → pay → result job |

## Development

```bash
make setup        # install; the kit is already in vendor/
make test         # offline tests
make demo         # draw logos without payments
make dev          # the paid service on http://localhost:8787
make try-local    # pay it once with test money: no wallet to set up
make check-local  # Provider Standard self-check + how agents see you
```

### The stellar-agent-services kit

The kit isn't on npm yet, so `vendor/` holds its packages (`protocol`, `payment-client`, `provider-kit`,
`verifier`) packed at the commit in `KIT_REF`, the same way `npm create stellar-service` vendors it. The npm
`overrides` in `package.json` keep one copy of the Stellar SDK, as the kit requires. To update:

```bash
make kit REF=main    # clone + build + pack at that ref, reinstall, run the tests
```

## Security

- **No Stellar secret key anywhere**: the server knows only public `payTo` addresses. The owner steps (USDC
  trustline, 8004 registration, validation requests) are approved in your own wallet on a page `provider-kit`
  opens on your laptop. CI holds no secrets either: the server pulls images instead of CI pushing to it.
- Repository content is untrusted: it is labelled as such in the prompt, and nothing the model returns is used
  unless it matches the catalog.
- SVGs contain no `<text>` (it is outlined), scripts, links or external references; files are served with a sandboxing CSP.
- Output URLs use random 128-bit ids, independent of job ids.

## Credits

Icons: [Lucide](https://lucide.dev) (ISC). Fonts: Google Fonts via [Fontsource](https://fontsource.org) (SIL OFL).
Payments and standard: [stellar-agent-services](https://github.com/AlgoriaLabs/stellar-agent-services) (MIT).

## License

MIT
