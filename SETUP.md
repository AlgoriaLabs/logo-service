# Setup: on your laptop

> See logos first, before any cloud. ⏱ 5 min. To put it online: [DEPLOY.md](DEPLOY.md).

You need: **Node.js 24**. Nothing else for steps 1–2.

---

## 1 · Install · 1 min

```bash
git clone https://github.com/AlgoriaLabs/logo-service.git
cd logo-service
npm ci
cp .env.example .env
```

✅ `npm ci` finishes. The Provider Kit is already in `vendor/`.

---

## 2 · Draw logos · 1 min

```bash
npm run demo -- https://github.com/AlgoriaLabs/stellar-agent-services geometric 3
```

✅ It prints `Files are in …/out/<time>`. Open `presentation.pdf` there.

- Styles: `minimal` `geometric` `lettermark` `wordmark` `emblem` `playful` `tech`. Count: 1–6.
- Without an AI key it uses the built-in designer. Put `GEMINI_API_KEY=…` in `.env` and run it again for the AI
  version.
- Optional: `--name "Brand"` sets the name written in the logos.

---

## 3 · Run the paid service · 3 min

Needs a wallet address that can receive test USDC:

```bash
npm run wallet         # a page opens: connect your wallet (on Testnet), approve
npm run dev            # the service on http://localhost:8787
```

In another terminal:

```bash
npm run try            # pays 0.10 test USDC from a throwaway account, shows the logos
npm run check          # the self-check, and how agents will find you
```

✅ `try` ends with logo links and `payTo received 0.10 USDC`.

---

## Tests

```bash
npm test               # offline, including a full 402 → pay → logos job
```

## What's where

| Path | What |
| --- | --- |
| `src/` | The service: repo reader, designer, SVG renderer, PDF |
| `deploy/` | Terraform for the server (Oracle Always Free + Caddy HTTPS) |
| `scripts/` | `npm run wallet / check / try / register / deploy / ci:setup` |
| `vendor/` | The stellar-agent-services kit, packed (`npm run update-kit`) |
| `.env` | Local settings (git-ignored). The server's come from `deploy/terraform/terraform.tfvars`. |
