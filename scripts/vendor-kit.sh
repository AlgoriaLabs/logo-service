#!/usr/bin/env bash
# Updates vendor/ to the stellar-agent-services kit at KIT_REF, the way `npm create stellar-service` does:
# clone, build (including provider-kit's wallet approval page), then `npm pack` each package into vendor/.
# The tarballs are committed, so installs, Docker builds and CI need no clone and no build of the kit.
#
#   scripts/vendor-kit.sh            # rebuild vendor/ at the commit in KIT_REF
#   scripts/vendor-kit.sh <ref>      # move to another commit/branch/tag and rewrite KIT_REF
#
# Afterwards: npm install (updates package-lock.json), npm test, commit vendor/, KIT_REF and the lockfile.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KIT_REPO="${KIT_REPO:-https://github.com/AlgoriaLabs/stellar-agent-services.git}"
REF="${1:-$(cat "$ROOT/KIT_REF")}"
PACKAGES=(protocol payment-client provider-kit verifier)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ cloning $KIT_REPO at $REF"
git -C "$WORK" init -q kit
git -C "$WORK/kit" remote add origin "$KIT_REPO"
git -C "$WORK/kit" fetch -q --depth 1 origin "$REF"
git -C "$WORK/kit" checkout -q FETCH_HEAD
SHA="$(git -C "$WORK/kit" rev-parse HEAD)"

echo "→ building the kit at ${SHA:0:7}"
(cd "$WORK/kit" && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent)
test -f "$WORK/kit/packages/provider-kit/dist/approve/index.html" || { echo "the wallet approval page was not built" >&2; exit 1; }

echo "→ packing ${PACKAGES[*]} into vendor/"
rm -rf "$ROOT/vendor"
mkdir -p "$ROOT/vendor"
for name in "${PACKAGES[@]}"; do
  (cd "$WORK/kit/packages/$name" && npm pack --silent --pack-destination "$ROOT/vendor" > /dev/null)
done
echo "$SHA" > "$ROOT/KIT_REF"
ls -1 "$ROOT/vendor"
echo "✓ vendor/ holds the kit at ${SHA:0:7}. Next: npm install && npm test, then commit vendor/, KIT_REF, package-lock.json"
