# Deploy

> One page. Do one box, then look only at the next one.
> ⏱ about 40 min the first time, mostly waiting.

```
1 Get keys → 2 Wallet → 3 Publish → 4 Fill form → 5 Deploy → 6 Register → 7 Try it        later: Mainnet
  10 min      2 min      5 min       3 min         10 min      3 min         2 min
```

You need: **Node.js 24**, **Terraform 1.6+**, **make**, a **domain on Cloudflare** (free plan), and a **Stellar
browser wallet** (Freighter, xBull, Albedo, Hana, Ledger…).
No Stellar CLI. Your wallet signs everything, in your browser. No secret key is ever typed or saved.

---

## 1 · Get keys · 10 min

- [ ] **Oracle Cloud account**: [oracle.com/cloud/free](https://www.oracle.com/cloud/free/).
      Pick a home region near you. You can't change it later.
- [ ] **Oracle API key**: console → profile icon → **My profile** → **API keys** → **Add API key** →
      **Generate API key pair** → **Download private key** → **Add**.
      Copy the text box it shows into `~/.oci/config`. Fix its `key_file=` line to point at the downloaded key.
- [ ] **SSH key**: `ls ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519`
- [ ] **Cloudflare API token**: dash.cloudflare.com → profile → **API Tokens** → **Create Token** → **Custom**:
      `Account · Cloudflare Tunnel · Edit` and `Zone · DNS · Edit` (your domain). Also copy the **Account ID** and
      **Zone ID** from your domain's Overview page (right side).
- [ ] **AI key** (free): [aistudio.google.com](https://aistudio.google.com) → **Get API key** (Gemini), or
      [console.groq.com/keys](https://console.groq.com/keys) (Groq). One is enough.

---

## 2 · Wallet · 2 min

This is where buyers' money goes. Your own browser wallet works.

- [ ] In your wallet, switch the network to **Testnet**.
- [ ] Run:

```bash
git clone https://github.com/AlgoriaLabs/stellar-logo-agent.git
cd stellar-logo-agent
make setup
make wallet
```

A page opens. **Connect** your wallet, **approve**. It gets free test money and can now receive USDC.

✅ The terminal prints `PAY_TO=G...`. Copy that address.

---

## 3 · Publish · 5 min

The server runs the image GitHub builds. Do this once so the first image exists.

- [ ] Push to `main` (skip if the repo is already on GitHub with CI green).
- [ ] GitHub → **Actions** → `cd` → wait for **ci ✓ → publish image ✓**.
- [ ] Make the image public: GitHub → **AlgoriaLabs** → **Packages** → `stellar-logo-agent` → **Package settings** →
      **Change visibility** → **Public**.

---

## 4 · Fill the form · 3 min

```bash
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
curl -4 ifconfig.me        # your IP, for admin_cidr
```

Open `infra/terraform/terraform.tfvars`. Fill these lines:

```hcl
oci_region            = "eu-frankfurt-1"       # region= line in ~/.oci/config
tenancy_ocid          = "ocid1.tenancy.oc1..…" # tenancy= line in ~/.oci/config
admin_cidr            = "203.0.113.7/32"       # your IP from above, then /32
cloudflare_api_token  = "…"                    # from step 1
cloudflare_account_id = "…"
cloudflare_zone_id    = "…"
hostname              = "logo.example.com"     # any name under your Cloudflare domain
pay_to_testnet        = "G…"                   # from step 2
gemini_api_key        = "…"                    # or groq_api_key
```

---

## 5 · Deploy · 10 min

```bash
make tf-init
make apply            # shows the plan, type: yes
```

Minutes 2–8 show `Still creating…`. **Normal.** The server is installing Docker. Get water.

✅ You see `Running ghcr.io/algorialabs/stellar-logo-agent:main on testnet`.
Open `https://<hostname>/healthz` → `{"ok":true,"network":"testnet",…}`.

---

## 6 · Register · 3 min

Puts your service on the Stellar map, so agents can find it.

```bash
make register         # a page opens: connect the same wallet, approve
```

✅ It prints `Registered agent <id> on stellar:testnet`.
Put it in `terraform.tfvars` as `agent_id_testnet = "<id>"`, then:

```bash
make apply            # publishes the agent id, ~1 min
```

---

## 7 · Try it · 2 min

```bash
make try
```

It asks `Pay 0.10 USDC in test money?` → press **Enter**. Wait ~1 min.

✅ You get logo links and a `presentation.pdf` link. Open them. Your wallet received 0.10 test USDC.

```bash
make check            # every line green
```

🎉 **Live on testnet.** From now on, every `git push` to `main` deploys itself (the server picks up the new image
within ~2 min). Optional: GitHub → **Settings** → **Variables** → add `DEPLOY_URL` = `https://<hostname>` and the
`cd` run will also check the live service after each deploy.

> Still do these on your laptop: `make wallet` and `make register`. They need your wallet, on purpose:
> no wallet key and no server key ever goes into GitHub.

---

## Later · Mainnet · 10 min

- [ ] **Facilitator key** (free, shown once): [channels.openzeppelin.com/gen](https://channels.openzeppelin.com/gen)
- [ ] Your wallet on **Mainnet**, with ~3 XLM in it. Then: `make wallet NET=mainnet` → approve.
- [ ] In `terraform.tfvars`:

```hcl
pay_to_mainnet              = "G…"        # from make wallet NET=mainnet
facilitator_api_key_mainnet = "…"
```

```bash
make release V=1.0.0       # mainnet runs releases; wait for Actions → cd ✓
make follow TAG=stable     # the server follows releases
make switch NET=mainnet    # ← the switch
make register              # approve in your wallet (on Mainnet), copy the id
#   agent_id_mainnet = "<id>" in terraform.tfvars, then:
make apply
make check
```

Something missing? The deploy **stops before switching** and names it. The old version keeps running.
Back to testnet: `make switch NET=testnet` and `make follow TAG=main`.

---

## Cheat sheet

| I want to… | Run |
| --- | --- |
| Ship a code change | `git push` (testnet) · `make release V=1.2.0` (mainnet) |
| Undo a bad deploy | `make rollback TAG=sha-abc1234` (the tag is in Actions → cd) |
| Change price, keys, network | edit `terraform.tfvars` → `make apply` |
| Check the service | `make check` |
| Pay for one test job | `make try` |
| See deploys | GitHub → **Actions** · on the server: `make deploy-logs` |
| See server logs | `make logs` |
| Update the Provider Kit | `make kit REF=main` → commit → push |
| All commands | `make help` |
| Delete everything | `terraform -chdir=infra/terraform destroy` |

## 🆘 If this, then that

| You see | Do |
| --- | --- |
| The wallet page didn't open | Copy the `http://localhost:…` link from the terminal into your browser. |
| The wallet page refuses your account | Your wallet connected another account. Pick the `pay_to` account in the wallet. |
| `Out of host capacity` | Add `availability_domain_index = 1` (or `2`) to tfvars → `make apply`. Or retry in an hour. |
| `make apply` stuck on SSH / `timeout` | Your IP changed: update `admin_cidr` → `make apply`. |
| `Still creating…` over 15 min | `make ssh`, then `sudo tail -50 /var/log/cloud-init-output.log` |
| `Error: Resource precondition failed` | Read the line under it: it names the missing value. Fix tfvars → `make apply`. |
| `pull access denied` / `unauthorized` | The image isn't public (step 3), or no image yet: wait for Actions → cd ✓. |
| Org won't allow a public package | Add `ghcr_username` + `ghcr_token` (a token with `read:packages`) to tfvars → `make apply`. |
| `/healthz` doesn't load | Cloudflare → **Zero Trust** → **Networks** → **Tunnels**: should be **Healthy**. If not, `make logs`. |
| A push didn't deploy | `make deploy-logs`. Pinned to a `sha-…`? `make follow TAG=main`. |
| CI: `terraform fmt` failed | `terraform -chdir=infra/terraform fmt -recursive` → commit → push. |
| `make try`: no USDC for sale | The testnet market is empty right now. Try again later. Nothing was paid. |
| Jobs fail: `GitHub rate limit` | Add `github_token` to tfvars ([make one](https://github.com/settings/personal-access-tokens), public repos, no permissions) → `make apply`. |
| Results say `designer: heuristic` | Free AI quota used up. Logos still ship. Add the other AI key (`groq_api_key` or `gemini_api_key`) → `make apply`. |

Want to see logos on your laptop first, before any cloud? `make setup && make demo`. The long version of
everything is in [SETUP.md](SETUP.md).
