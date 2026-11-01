# Stellar Logo Agent: the provider, plus the stellar-agent-services CLIs (provider-kit, stellar-pay).
# Multi-arch (amd64, arm64 for Oracle Ampere). The kit comes from vendor/ (packed tarballs), so no git or kit build.
#
#   docker build -t logo-service --build-arg APP_VERSION=$(git rev-parse --short HEAD) .
#
# Jobs and generated files live in /data: give it a persistent volume. The image holds no Stellar secret key.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc tsconfig.json ./
COPY vendor ./vendor
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY vendor ./vendor
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts \
 # Keep only what the renderer reads: Lucide's JSON catalog and the latin .woff fonts (-80 MB).
 && rm -rf node_modules/lucide-static/icons node_modules/lucide-static/font node_modules/lucide-static/dist node_modules/lucide-static/sprite.svg \
 && find node_modules/@fontsource -type f \( -name '*.woff2' -o -name '*.css' \) -delete \
 && find node_modules/@fontsource -name '*.woff' ! -name '*-latin-[0-9]*-normal.woff' -delete \
 && npm cache clean --force

FROM node:24-bookworm-slim
ARG APP_VERSION=dev
ENV NODE_ENV=production DATA_DIR=/data PORT=8787 APP_VERSION=${APP_VERSION}
LABEL org.opencontainers.image.source="https://github.com/AlgoriaLabs/logo-service" \
      org.opencontainers.image.description="Paid logo-designer agent on Stellar (Provider Standard v1)" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.revision="${APP_VERSION}"
WORKDIR /app
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server.js"]
