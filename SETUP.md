# Setup guide

> **TL;DR** — `make setup` → `make demo` → fill `terraform.tfvars` → `make tf-init apply` → `make register` →
> `make pay`. Mainnet later: `make switch NET=mainnet`.

One step at a time. Each step has a ⏱ time, the commands, and a ✅ "done when" line.
Tick the box, take a break if you want, come back to the next box. 🧯 = what to do if it breaks.

```
 [1] Laptop ─▶ [2] Accounts ─▶ [3] Deploy ─▶ [4] Register ─▶ [5] Pay yourself ─▶ [6] Mainnet
   10 min        15 min          15 min        10 min           5 min            10 min
```

---

## 1 · Run it on your laptop ⏱ 10 min

- [ ] **1.1 Tools.** Node 22.13+ (24 recommended), git, make.
- [ ] **1.2 Install.**

  ```bash
  git clone https://github.com/<you>/stellar-logo-agent.git && cd stellar-logo-agent
  make setup
  ```

  ✅ Ends with `✓ provider-kit built at 5f400b1`.

- [ ] **1.3 Draw logos (no payment, no keys).**

  ```bash
  make demo REPO=https://github.com/berkingurcan/stellar-agent-search STYLE=geometric COUNT=3
  ```

  ✅ Prints `Files are in …/out/<time>` — open `presentation.pdf` there.
  This used the free heuristic designer. Add `GROQ_API_KEY` to `.env` (step 2.4) and run it again to see the LLM version.

- [ ] **1.4 Tests.** `make test` ✅ all green (they never touch the network).

---

## 2 · Accounts and keys ⏱ 15 min

All free. Paste each value into a scratch note; step 3 needs them.

- [ ] **2.1 Oracle Cloud** — sign up at cloud.oracle.com (card check, no charge).
  Pick a **home region** with Ampere capacity; you can't change it later.

  ```bash
  brew install oci-cli   # or: pip install oci-cli
  oci setup config       # creates ~/.oci/config + an API key; upload the public key in the console when asked
  ```

  📝 `tenancy_ocid`, `oci_region` (both are in `~/.oci/config`).

- [ ] **2.2 Cloudflare** — a domain on Cloudflare (the only possible cost: the domain itself).
  Create an API token: *My Profile → API Tokens → Create → Custom*:
  `Account › Cloudflare Tunnel › Edit` and `Zone › DNS › Edit` (your zone).

  📝 `cloudflare_api_token`, `cloudflare_account_id`, `cloudflare_zone_id` (zone Overview page, right side), `hostname` (e.g. `logo.yourdomain.com`).

- [ ] **2.3 Stellar testnet payee.** Install the [Stellar CLI](https://developers.stellar.org/docs/tools/cli), then:

  ```bash
  stellar keys generate payto --network testnet --fund
  stellar tx new change-trust --source-account payto --network testnet \
    --line USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
  stellar keys address payto
  ```

  📝 `pay_to_testnet` = the `G…` it prints. The secret stays in the Stellar CLI keychain — it never goes on the server.

- [ ] **2.4 LLM keys** (free tiers; one is enough, two gives a fallback).
  - Groq → console.groq.com/keys → 📝 `groq_api_key`
  - Gemini → aistudio.google.com/apikey → 📝 `gemini_api_key`

- [ ] **2.5 GitHub token** (optional, recommended): fine-grained token, *Public repositories (read-only)*, no permissions → 📝 `github_token`. Lifts the GitHub API limit from 60 to 5,000 calls/hour.

- [ ] **2.6 Push this repo** to your GitHub (public is simplest) → 📝 `app_repo_url`.

- [ ] **2.7 Your IP** for SSH: `curl -4 ifconfig.me` → 📝 `admin_cidr = "<ip>/32"`.

✅ You have every 📝 value.

---

## 3 · Deploy to testnet ⏱ 15 min (most of it waiting)

- [ ] **3.1 Fill the variables.**

  ```bash
  cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
  $EDITOR infra/terraform/terraform.tfvars    # paste the 📝 values; keep network = "testnet"
  ```

- [ ] **3.2 Create everything.**

  ```bash
  make tf-init
  make apply      # review the plan, type yes
  ```

  It creates: VCN + SSH-only firewall, one Always Free Ampere VM, a Cloudflare Tunnel, a DNS record.
  Then it waits for Docker, writes `.env` and starts the containers (first build on ARM ≈ 5 min).

  ✅ Ends with `Deployed <sha> on testnet` and prints `url` and `manifest_url`.

- [ ] **3.3 Look at it.** Open `https://<hostname>/healthz` → `{"ok":true,"network":"testnet"}`.

🧯 `Out of host capacity` → set `availability_domain_index = 1` (or 2) and `make apply` again; Ampere capacity comes and goes.
🧯 Something on the server → `make logs`.

---

## 4 · Register on Stellar 8004 ⏱ 10 min

Registration is your on-chain identity: it points to your manifest, and its wallet must equal `payTo`.
Registering **with the payTo key** sets both at once.

- [ ] **4.1 Self-check.** `make check` ✅ every line passes except `8004 [I2]` (not registered yet).
- [ ] **4.2 Preview, then sign.**

  ```bash
  make register-dry KEY=payto
  make register KEY=payto     # prints: Registered agent <id> on stellar:testnet
  ```

- [ ] **4.3 Put the id in.** `agent_id_testnet = "<id>"` in `terraform.tfvars`, then `make apply`.
- [ ] **4.4 Check again.** `make check` ✅ all checks pass, including 8004.

---

## 5 · Pay yourself ⏱ 5 min

`stellar-pay` is the kit's test buyer wallet (testnet only).

```bash
npm run stellar-pay -- wallet create
npm run stellar-pay -- wallet fund --usdc 2       # testnet USDC from the testnet DEX
make pay REPO=https://github.com/<you>/<some-repo> STYLE=tech COUNT=3
```

✅ You approve the price, it pays 0.10 USDC, and prints the job result with `svgUrl`s and `presentationPdfUrl`.
The transfer is on chain (stellar.expert, testnet).

🎉 **Testnet is live.** Stop here as long as you like.

---

## 6 · Switch to mainnet ⏱ 10 min

Same server, same code. Each network keeps its own job database, so they never mix.

- [ ] **6.1 Mainnet payee** (a separate key is cleaner):

  ```bash
  stellar keys generate payto-main
  stellar keys address payto-main            # send it ~3 XLM from any wallet/exchange
  stellar tx new change-trust --source-account payto-main --network mainnet \
    --line USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
  ```

  📝 `pay_to_mainnet`.
  🧯 `network mainnet not found` → `stellar network add mainnet --rpc-url https://mainnet.sorobanrpc.com --network-passphrase "Public Global Stellar Network ; September 2015"`

- [ ] **6.2 Facilitator key** — channels.openzeppelin.com/gen (GitHub sign-in, free). It's shown once. 📝 `facilitator_api_key_mainnet`.
- [ ] **6.3 Fill** `pay_to_mainnet` and `facilitator_api_key_mainnet` in `terraform.tfvars`.
- [ ] **6.4 Flip the switch.**

  ```bash
  make switch NET=mainnet     # edits network = "mainnet" and runs terraform apply
  ```

  ✅ `Deployed <sha> on mainnet`; `/healthz` says `"network":"mainnet"`.

- [ ] **6.5 Register on mainnet.** `make register KEY=payto-main` → `agent_id_mainnet = "<id>"` → `make apply` → `make check` ✅.
- [ ] **6.6 Be findable.** `npx -y stellar-agent-search@0.1.0 find "logo designer"` lists your agent once the explorer indexes it.

↩️ **Back to testnet any time:** `make switch NET=testnet`.

---

## Daily cheat sheet

| I want to… | Run |
| --- | --- |
| ship new commits | `git push` → `make deploy` |
| change a setting / key / price | edit `terraform.tfvars` → `make apply` |
| switch network | `make switch NET=mainnet` (or `testnet`) |
| see logs | `make logs` |
| get a shell | `make ssh` |
| conformance check | `make check` |
| try a style locally | `make demo STYLE=emblem COUNT=4` |
| list commands | `make help` |

## What it costs

| Piece | Service | Cost |
| --- | --- | --- |
| Server, disk, network | Oracle Always Free (Ampere A1, 2 OCPU / 12 GB) | $0 |
| HTTPS + DNS | Cloudflare Tunnel, free plan | $0 (domain ~ $10/yr if you don't have one) |
| Designer | Groq / Gemini / OpenRouter free tiers, then a built-in heuristic | $0 |
| Payments | x402.org (testnet), OpenZeppelin channels (mainnet), fees sponsored | $0 |
| Mainnet account | XLM reserve for the payee + trustline + registration | ~3 XLM, one time |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| create-job answers `503`, logs say `payments are not ready` | facilitator unreachable or mainnet API key wrong; it retries by itself |
| `designer: heuristic` in results | no LLM answered (keys missing or rate limited); logos still ship |
| `GitHub rate limit reached` | set `github_token` → `make apply` |
| `terraform apply` hangs at the deploy step | SSH blocked: check `admin_cidr` matches your current IP |
| tunnel shows *Inactive* in Cloudflare | `make logs` and check the `cloudflared` container: `make ssh` → `sudo docker compose ps` |

**Secrets note:** API keys and the tunnel token end up in Terraform state. Keep `terraform.tfstate` on your
machine (git-ignored) or in a private OCI Object Storage bucket (Always Free includes 20 GB).
