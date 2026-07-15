# syntax=docker/dockerfile:1.7

# ── deps + build ──────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Copy lockfile + package.json first for cache.
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
# Build the standalone server (next.config: output: 'standalone').
RUN npm run build

# ── runtime ───────────────────────────────────────────────────────────────────
# lean image — no build tools, no full node_modules
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# Next standalone server reads PORT and HOSTNAME.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as non-root.
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy the standalone server + only the deps it needs.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static + public assets are not bundled into standalone — copy manually.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# Next standalone entrypoint.
CMD ["node", "server.js"]
