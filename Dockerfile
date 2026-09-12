# ---- Stage 1: build the Svelte frontend ----
FROM oven/bun:1 AS build
WORKDIR /app

# Install frontend deps (locked) for caching
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the app
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
RUN bun run build

# ---- Stage 2: runtime (API + built frontend, single Bun process) ----
FROM oven/bun:1 AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Server deps only
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile --production

# Server code + built frontend from stage 1
COPY server ./server
COPY --from=build /app/dist ./dist

# SQLite data lives here (mount a volume in compose)
VOLUME /app/data

EXPOSE 1420
ENV PORT=1420

CMD ["bun", "run", "server/src/index.ts"]