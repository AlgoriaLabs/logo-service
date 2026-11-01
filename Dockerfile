# Stellar Logo Agent: one image with the provider and the stellar-agent-services CLIs
# (provider-kit, verifier, stellar-pay). Builds on amd64 and arm64 (Oracle Ampere).

FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 1. provider-kit is not on npm yet: clone and build it at the pinned commit (KIT_REF).
COPY KIT_REF ./
COPY scripts/setup-kit.sh scripts/
RUN bash scripts/setup-kit.sh

# 2. App dependencies (provider-kit is linked from vendor/).
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

# 3. Build, then drop dev dependencies from both trees.
COPY tsconfig.json ./
COPY src src
RUN npm run build \
 && npm prune --omit=dev \
 && (cd vendor/stellar-agent-services && npm prune --omit=dev --no-audit --no-fund) \
 # Keep only what the renderer reads: Lucide's JSON catalog and the latin .woff font files (-80 MB).
 && rm -rf node_modules/lucide-static/icons node_modules/lucide-static/font node_modules/lucide-static/dist node_modules/lucide-static/sprite.svg \
 && find node_modules/@fontsource -type f \( -name '*.woff2' -o -name '*.css' \) -delete \
 && find node_modules/@fontsource -name '*.woff' ! -name '*-latin-[0-9]*-normal.woff' -delete

FROM node:24-bookworm-slim
ENV NODE_ENV=production DATA_DIR=/data PORT=8787
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/vendor vendor
COPY --from=build /app/dist dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server.js"]
