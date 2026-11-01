# Setup guide

> Just want it running? [DEPLOY.md](DEPLOY.md) is the one-page version. This is the long one.

> **TL;DR** — `make setup` → `make demo` → `make wallet` → push to GitHub (CD publishes the image) →
> `make apply` → `make register` → `make try`. Mainnet later: `make release V=1.0.0` + `make switch NET=mainnet`.

One step at a time. Each step has a ⏱ time, the commands, and a ✅ "done when" line.
Tick the box, take a break if you want, come back to the next box. 🧯 = what to do if it breaks.

```
 [1] Laptop ─▶ [2] Accounts ─▶ [3] GitHub + CD ─▶ [4] Server ─▶ [5] Register ─▶ [6] Pay yourself ─▶ [7] Mainnet
   10 min        10 min           10 min           15 min       5 min           2 min              10 min
```

**No Stellar secret key anywhere.** Your own wallet (Freighter, xBull, Albedo, Ledger…) is the payout account.
The two owner steps — USDC trustline and 8004 registration — open a page on your laptop where you approve them in
that wallet. The server only ever knows your public `G…` address.

---

## 1 · Run it on your laptop ⏱ 10 min

- [ ] **1.1 Tools.** Node 22.13+ (24 recommended), git, make. (Terraform for step 4.)
- [ ] **1.2 Install.**

  ```bash
  git clone https://github.com/AlgoriaLabs/logo-service.git && cd logo-service
  make setup
  ```

  ✅ `npm install` finishes and `.env` exists. (The stellar-agent-services kit is already in `vendor/`.)

- [ ] **1.3 Draw logos (no payment, no keys).**

  ```bash
  make demo STYLE=geometric COUNT=3
  ```

  ✅ Prints `Files are in …/out/<time>` — open `presentation.pdf` there.
  This used the free heuristic designer. Add `GROQ_API_KEY` to `.env` (step 2.2) and run it again for the LLM version.

- [ ] **1.4 Tests.** `make test` ✅ all green (offline, including a full 402 → pay → logos job).

---

## 2 · Accounts and keys ⏱ 10 min

All free. Paste each value into a scratch note.

- [ ] **2.1 Payout account, in your wallet.**

  ```bash
  make wallet          # = provider-kit trustline --network testnet
  ```

  A page opens on your laptop. Connect your wallet (tip: add a separate account just for this service), approve
  the USDC trustline. A new testnet account gets test XLM from Friendbot first.
  ✅ It prints `PAY_TO=G…` → 📝 `pay_to_testnet`. Put it in `.env` as `PAY_TO_TESTNET` too, for local runs.

- [ ] **2.2 LLM keys** (free tiers; one is enough, two gives a fallback).
  Groq → console.groq.com/keys → 📝 `groq_api_key` · Gemini → aistudio.google.com/apikey → 📝 `gemini_api_key`

- [ ] **2.3 GitHub token** (optional, recommended): fine-grained, *Public repositories (read-only)* → 📝 `github_token`.
  Lifts the GitHub API limit from 60 to 5,000 calls/hour.

- [ ] **2.4 Oracle Cloud** — sign up at cloud.oracle.com (card check, no charge). Pick a **home region** with Ampere
  capacity; it can't change later. Then `oci setup config` (`brew install oci-cli` or `pip install oci-cli`) and upload
  the public key it makes. 📝 `tenancy_ocid`, `oci_region` (both in `~/.oci/config`).

- [ ] **2.5 Cloudflare** — a domain on Cloudflare. API token: *My Profile → API Tokens → Create → Custom* with
  `Account › Cloudflare Tunnel › Edit` and `Zone › DNS › Edit`.
  📝 `cloudflare_api_token`, `cloudflare_account_id`, `cloudflare_zone_id`, `hostname` (e.g. `logo.yourdomain.com`).

- [ ] **2.6 Your IP** for SSH: `curl -4 ifconfig.me` → 📝 `admin_cidr = "<ip>/32"`.

---

## 3 · GitHub and CD ⏱ 10 min

The pipeline: **push → CI tests → image on GHCR → server pulls it within ~2 min → CD checks the live service.**
CI never logs in to the server; the server pulls.

- [ ] **3.1 Push** to `AlgoriaLabs/logo-service` (empty repo, no README):

  ```bash
  git remote add origin git@github.com:AlgoriaLabs/logo-service.git
  git push -u origin main
  ```

  ✅ *Actions → cd* goes green: `ci` → `publish image`. (`verify` is skipped until 3.3.)

- [ ] **3.2 Make the image public** (once): *AlgoriaLabs → Packages → logo-service → Package settings →
  Change visibility → Public*. The server then pulls with no credentials.
  🧯 Must stay private? Create a classic token with `read:packages` → 📝 `ghcr_username`, `ghcr_token`.

- [ ] **3.3 Repository variables** (*Settings → Secrets and variables → Actions → Variables*):

  | Name | Value |
  | --- | --- |
  | `DEPLOY_URL` | `https://<hostname>` — turns on the verify stage |
  | `DEPLOY_CHANNEL` | `main` (testnet now; `stable` once mainnet runs releases) |
  | `SMOKE_PAY` | `true` — CD also makes one real paid testnet call (`provider-kit try`) |

---

## 4 · Server ⏱ 15 min (mostly waiting)

- [ ] **4.1 Fill the variables.**

  ```bash
  cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
  $EDITOR infra/terraform/terraform.tfvars    # paste the 📝 values; keep network = "testnet", app_tag = "main"
  ```

- [ ] **4.2 Create everything.**

  ```bash
  make tf-init
  make apply      # review the plan, type yes
  ```

  It creates: VCN + SSH-only firewall, one Always Free Ampere VM, a Cloudflare Tunnel, a DNS record. Then it installs
  `.env`, the compose file and the 2-minute auto-update timer, and starts the app from the published image.
  ✅ Ends with `Running ghcr.io/algorialabs/logo-service:main on testnet`.

- [ ] **4.3 Look at it.** `https://<hostname>/healthz` → `{"ok":true,"network":"testnet","version":"<sha>"}`.

🧯 `Out of host capacity` → `availability_domain_index = 1` (or 2), `make apply` again.
🧯 Not starting → `make deploy-logs` (the updater) and `make logs` (the app).

---

## 5 · Register on Stellar 8004 ⏱ 5 min

Your on-chain identity: it points at your manifest, and its wallet is `payTo`. It publishes the provider's **name
and description — the only text search matches.**

- [ ] **5.1 See how agents see you.** `make check` ✅ every line passes except `8004 [I2]` (not registered yet),
  and *How agents see you* has no `!` lines.
- [ ] **5.2 Register.** `make register` → a page opens; connect the **payTo** account and approve.
  ✅ Prints `Registered agent <id> on stellar:testnet`.
  🧯 On a machine without a browser: `make register ARGS=--no-open` and forward the printed port.
- [ ] **5.3 Put the id in.** `agent_id_testnet = "<id>"` in `terraform.tfvars` → `make apply`.
- [ ] **5.4 Check again.** `make check` ✅ all pass, including 8004.

---

## 6 · Pay yourself ⏱ 2 min

```bash
make try          # = provider-kit try --manifest <your manifest>
```

It shows the exact price and payee, asks, then pays from a throwaway testnet account it funds itself (Friendbot +
testnet DEX). No wallet to create. ✅ `logo-design succeeded`, the result with `svgUrl`s and `presentationPdfUrl`, and
`payTo received 0.1 USDC` with an explorer link.

🧯 "the testnet DEX has no USDC for sale" → try later. Nothing was paid.

🎉 **Testnet is live**, and every push to `main` deploys itself. Stop here as long as you like.

---

## 7 · Mainnet ⏱ 10 min

Same server, same code. Mainnet follows **releases** (`stable`), testnet follows `main`. Each network keeps its own
job database, so they never mix.

- [ ] **7.1 Mainnet payout account.** Put ~3 XLM in the wallet account you'll use (exchange or another wallet), then:

  ```bash
  make wallet NET=mainnet     # approve the mainnet USDC trustline in your wallet
  ```

  📝 `pay_to_mainnet` = the printed `G…`.

- [ ] **7.2 Facilitator key** — channels.openzeppelin.com/gen (GitHub sign-in, free, shown once).
  📝 `facilitator_api_key_mainnet`. Fill both in `terraform.tfvars`.

- [ ] **7.3 Cut a release.** `make release V=1.0.0` ✅ *Actions → cd* publishes `:1.0.0` and `:stable`.
- [ ] **7.4 Follow it and switch.**

  ```bash
  make follow TAG=stable      # app_tag = "stable"
  make switch NET=mainnet     # network = "mainnet"
  ```

  ✅ `Running …:stable on mainnet`; `/healthz` says `"network":"mainnet"`. Set the repo variable `DEPLOY_CHANNEL=stable`.

- [ ] **7.5 Register on mainnet.** `make register` (connect the mainnet payTo account) → `agent_id_mainnet = "<id>"` →
  `make apply` → `make check` ✅.
- [ ] **7.6 Be findable.** `npx -y stellar-agent-search@0.1.0 find "logo designer"` lists you once the explorer has indexed it.

↩️ **Back to testnet:** `make switch NET=testnet` and `make follow TAG=main`.

---

## Daily cheat sheet

| I want to… | Run |
| --- | --- |
| ship code (testnet) | `git push` — CD does the rest; watch *Actions → cd* |
| ship to mainnet | `make release V=1.2.0` |
| roll back | `make rollback TAG=sha-abc1234` (any earlier build; `make follow TAG=stable` to undo) |
| change a setting / key / price | edit `terraform.tfvars` → `make apply` |
| switch network | `make switch NET=mainnet` (or `testnet`) |
| see logs / deploys | `make logs` / `make deploy-logs` |
| check it like an agent would | `make check` |
| pay it once with test money | `make try` |
| update the stellar-agent-services kit | `make kit REF=main` → commit `vendor/`, `KIT_REF`, lockfile |
| try a style locally | `make demo STYLE=emblem COUNT=4` |
| list commands | `make help` |

## What it costs

| Piece | Service | Cost |
| --- | --- | --- |
| Server, disk, network | Oracle Always Free (Ampere A1, 2 OCPU / 12 GB) | $0 |
| HTTPS + DNS | Cloudflare Tunnel, free plan | $0 (domain ~ $10/yr if you need one) |
| CI/CD + image registry | GitHub Actions + GHCR (public repo/package) | $0 |
| Designer | Groq / Gemini / OpenRouter free tiers, then a built-in heuristic | $0 |
| Payments | x402.org (testnet), OpenZeppelin channels (mainnet), fees sponsored | $0 |
| Mainnet account | XLM reserve for the trustline + registration | ~3 XLM, one time |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| CD `verify` waits, then fails | the server didn't pull: `make deploy-logs`. Private image? → 3.2. Pinned `app_tag`? → `make follow TAG=main` |
| `terraform fmt` fails in CI | run `terraform -chdir=infra/terraform fmt -recursive` and commit |
| create-job answers `503`, logs say `payments are not ready` | facilitator unreachable or mainnet key wrong; it retries by itself |
| `designer: heuristic` in results | no LLM answered (keys missing or rate limited); logos still ship |
| `GitHub rate limit reached` | set `github_token` → `make apply` |
| `make apply` hangs at the deploy step | SSH blocked: `admin_cidr` must match your current IP |

**Secrets note:** API keys and the tunnel token end up in Terraform state. Keep `terraform.tfstate` on your machine
(git-ignored) or in a private OCI Object Storage bucket (Always Free includes 20 GB). GitHub holds no secrets for CD.
