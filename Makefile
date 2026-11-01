# Short commands for everything in SETUP.md. `make help` lists them.

TF        := terraform -chdir=infra/terraform
PK        := npm run --silent provider-kit --
LOCAL     := http://localhost:8787/.well-known/stellar-agent-services.json
MANIFEST  ?= $(shell $(TF) output -raw manifest_url 2>/dev/null)
NET       ?= testnet
REPO      ?= https://github.com/berkingurcan/stellar-agent-search
STYLE     ?= minimal
COUNT     ?= 3

.PHONY: help setup test demo dev try-local check-local wallet tf-init plan apply switch release rollback follow \
        logs deploy-logs ssh check register validate try kit

help: ## list commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'

# ── local ─────────────────────────────────────────────────────────────────────
setup: ## install (the kit is already in vendor/) and create .env
	npm install && (test -f .env || cp .env.example .env)

test: ## run the tests (offline)
	npm test

demo: ## draw logos locally, no payment: make demo REPO=<url> STYLE=tech COUNT=4
	npm run demo -- $(REPO) $(STYLE) $(COUNT)

dev: ## run the paid service on http://localhost:8787
	npm run dev

try-local: ## pay the local service once with test money (throwaway payer, nothing to set up)
	$(PK) try --manifest $(LOCAL) --dev

check-local: ## self-check the local service, and how agents see it
	$(PK) check --manifest $(LOCAL) --dev

# ── your payout account ───────────────────────────────────────────────────────
wallet: ## USDC trustline for payTo, approved in your wallet: make wallet NET=mainnet
	$(PK) trustline --network $(NET)

# ── infrastructure ────────────────────────────────────────────────────────────
tf-init: ## terraform init
	$(TF) init

plan: ## terraform plan
	$(TF) plan

apply: ## create / update the server and its settings
	$(TF) apply

switch: ## switch network: make switch NET=mainnet
	@test "$(NET)" = testnet -o "$(NET)" = mainnet || (echo "NET must be testnet or mainnet" && exit 1)
	perl -pi -e 's/^network\s*=.*/network = "$(NET)"/' infra/terraform/terraform.tfvars
	$(TF) apply

follow: ## follow a channel or pin a build: make follow TAG=stable | main | sha-abc1234
	@test -n "$(TAG)" || (echo "usage: make follow TAG=main|stable|sha-<7>" && exit 1)
	perl -pi -e 's/^app_tag\s*=.*/app_tag    = "$(TAG)"/' infra/terraform/terraform.tfvars
	$(TF) apply

rollback: ## pin the server to an earlier build: make rollback TAG=sha-abc1234
	@$(MAKE) --no-print-directory follow TAG=$(TAG)

release: ## tag a release for the stable channel: make release V=0.2.0
	@test -n "$(V)" || (echo "usage: make release V=0.2.0" && exit 1)
	git tag -a v$(V) -m "v$(V)" && git push origin v$(V)

logs: ## follow the app logs on the server
	@eval "$$($(TF) output -raw logs)"

deploy-logs: ## what the server's auto-update did
	@eval "$$($(TF) output -raw deploy_logs)"

ssh: ## open a shell on the server
	@eval "$$($(TF) output -raw ssh)"

# ── the deployed service ──────────────────────────────────────────────────────
check: ## Provider Standard checks + how agents see you
	npm run --silent verifier -- check $(MANIFEST)
	$(PK) check --manifest $(MANIFEST)

register: ## register on Stellar 8004, approved in your payTo wallet (add ARGS=--no-open over SSH)
	$(PK) register --manifest $(MANIFEST) $(ARGS)

validate: ## ask a verifier for validation: make validate VALIDATOR=G...
	@test -n "$(VALIDATOR)" || (echo "usage: make validate VALIDATOR=G..." && exit 1)
	$(PK) request-validation --manifest $(MANIFEST) --validator $(VALIDATOR) $(ARGS)

try: ## one real paid call to the deployed testnet service, with test money
	$(PK) try --manifest $(MANIFEST)

# ── maintenance ───────────────────────────────────────────────────────────────
kit: ## update the vendored stellar-agent-services kit: make kit REF=main
	bash scripts/vendor-kit.sh $(REF) && npm install && npm test
