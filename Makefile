# Short commands for everything in SETUP.md. `make help` lists them.

TF        := terraform -chdir=infra/terraform
MANIFEST  ?= $(shell $(TF) output -raw manifest_url 2>/dev/null)
NET       ?= testnet
KEY       ?= payto
REPO      ?= https://github.com/berkingurcan/stellar-agent-search
STYLE     ?= minimal
COUNT     ?= 3

.PHONY: help setup test demo dev check verify tf-init plan apply deploy switch logs ssh register register-dry pay

help: ## list commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-13s %s\n", $$1, $$2}'

# ── local ─────────────────────────────────────────────────────────────────────
setup: ## build the kit and install everything
	npm run setup:kit && npm install && cp -n .env.example .env || true

test: ## run the tests (offline)
	npm test

demo: ## draw logos locally, no payment: make demo REPO=<url> STYLE=tech COUNT=4
	npm run demo -- $(REPO) $(STYLE) $(COUNT)

dev: ## run the paid service on http://localhost:8787
	npm run dev

# ── infrastructure ────────────────────────────────────────────────────────────
tf-init: ## terraform init
	$(TF) init

plan: ## terraform plan
	$(TF) plan

apply: ## create / update the server and deploy
	$(TF) apply

deploy: ## ship the latest commit of app_git_ref
	$(TF) apply -replace=terraform_data.deploy

switch: ## switch network: make switch NET=mainnet
	@test "$(NET)" = testnet -o "$(NET)" = mainnet || (echo "NET must be testnet or mainnet" && exit 1)
	perl -pi -e 's/^network\s*=.*/network = "$(NET)"/' infra/terraform/terraform.tfvars
	$(TF) apply

logs: ## follow the app logs on the server
	@eval "$$($(TF) output -raw logs)"

ssh: ## open a shell on the server
	@eval "$$($(TF) output -raw ssh)"

# ── Stellar ───────────────────────────────────────────────────────────────────
check: ## Provider Standard self-check of the deployed service
	npm run provider-kit -- check --manifest $(MANIFEST)
	npm run verifier -- check $(MANIFEST)

register-dry: ## show the 8004 registration it would sign: make register-dry KEY=payto
	npm run provider-kit -- register --manifest $(MANIFEST) --source $(KEY) --dry-run

register: ## register on Stellar 8004 (signs with the Stellar CLI key KEY)
	npm run provider-kit -- register --manifest $(MANIFEST) --source $(KEY)

pay: ## pay for a real job with the stellar-pay test wallet
	npm run stellar-pay -- pay $(MANIFEST) logo-design '{"repoUrl":"$(REPO)","style":"$(STYLE)","count":$(COUNT)}'
