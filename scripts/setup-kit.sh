#!/usr/bin/env bash
# Clones and builds the stellar-agent-services packages (not on npm yet) into ./vendor, pinned to one
# commit, so `npm install` can link provider-kit. Safe to re-run: it skips work already done.
set -euo pipefail

KIT_REPO="${KIT_REPO:-https://github.com/AlgoriaLabs/stellar-agent-services.git}"
KIT_REF="${KIT_REF:-$(cat "$(dirname "$0")/../KIT_REF")}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/vendor/stellar-agent-services"

if [ -d "$DIR/.git" ] && [ "$(git -C "$DIR" rev-parse HEAD)" = "$KIT_REF" ] && [ -f "$DIR/packages/provider-kit/dist/index.js" ]; then
  echo "✓ provider-kit already built at ${KIT_REF:0:7}"
  exit 0
fi

rm -rf "$DIR"
mkdir -p "$DIR"
git -C "$DIR" init -q
git -C "$DIR" remote add origin "$KIT_REPO"
git -C "$DIR" fetch -q --depth 1 origin "$KIT_REF"
git -C "$DIR" checkout -q FETCH_HEAD
(cd "$DIR" && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent)
echo "✓ provider-kit built at ${KIT_REF:0:7} in vendor/stellar-agent-services"
