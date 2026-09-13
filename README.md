# DevSlidesOnline

Code presentations you edit and present in the browser — a web, multi-user port of the [DevSlides](https://github.com/alyohara/DevSlides) desktop app.

Every slide is a snippet of code; highlights, dims, size-ups and magic-move transitions are driven by selecting text inside that snippet. Your data lives on your own server (SQLite), behind password-protected per-account isolation.

## Highlights

- **Full editor** — slide rail, code editor with find/replace, selection-driven highlight steps, live preview via Shiki, line numbers, timing sliders and per-slide settings.
- **Presentations** — fullscreen overlay, highlight stepping, autoplay, transitions and image slides.
- **Stacks** — group projects (decks) and slides, drag-and-drop stacking/unstacking.
- **Search** — full-text search across a project's slides (FTS5).
- **Import / export** — project JSON (round-trippable) and PDF export generated in the browser.
- **Multi-user** — sign up/sign in; every request is scoped to the logged-in account via an HttpOnly session cookie.
- **Self-hosted** — one Bun process serves the API and the built frontend; SQLite lives in a mounted volume.
- **Update check** — queries the latest GitHub release of this repo from Help.

## Stack

| Layer    | Tech                                                           |
| -------- | -------------------------------------------------------------- |
| Frontend | Svelte 5, Vite, Tailwind 4, TanStack Query, Shiki              |
| API      | Hono on Bun                                                    |
| Database | SQLite (`bun:sqlite`) with schema migrations                   |
| Auth     | `Bun.password` hashing + HttpOnly session cookies (30-day TTL) |
| Deploy   | Dockerfile (multi-stage) + docker-compose                      |

## Getting started (local dev)

Requires [Bun](https://bun.sh/) ≥ 1.4.

```bash
bun install            # frontend deps (root)
cd server && bun install   # server deps (Hono)
```

Run the two dev processes:

```bash
bun run dev:server     # API on http://localhost:1421
bun run dev:web        # SPA on http://localhost:1420 (proxies /api → 1421)
```

Open http://localhost:1420, create an account, and start a deck.

## Production / Docker

Official image on Docker Hub: [`biancoal/devslides-online`](https://hub.docker.com/r/biancoal/devslides-online) (multi-arch `linux/amd64` + `linux/arm64`).

```bash
# pull & run the published image
docker compose up -d          # uses the image from Docker Hub

# …or build from source instead of pulling
docker compose up -d --build
```

Quick-start with `docker run`:

```bash
docker run -d --name devslides-online --restart unless-stopped \
  -p 1420:1420 \
  -v devslides-data:/app/data \
  -e DATABASE_PATH=/app/data/devslides.db \
  biancoal/devslides-online:latest
```

Open http://<host>:1420 and create an account. The session cookie works over plain HTTP and behind a TLS reverse proxy (scheme is auto-detected).

The compose file mounts a `devslides-data` volume for the SQLite database.

Environment:

- `PORT` — HTTP port (default 1421; Docker sets 1420).
- `HOST` — bind address (default `0.0.0.0`).
- `DATABASE_PATH` — SQLite file path (default `data/devslides.db`).
- `VITE_API_BASE` — frontend-only; absolute API base if the API is not same-origin.

## Scripts

| Script                   | Purpose                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| `bun run dev:web`        | Vite dev server (1420)                                                 |
| `bun run dev:server`     | Bun API with watch (1421)                                              |
| `bun run check`          | `svelte-check` typecheck                                               |
| `bun run lint`           | ESLint                                                                 |
| `bun run build`          | Production build                                                       |
| `bun run test:*`         | Node test suites (highlight, save-race, stack-targeting, app-flow)     |
| `bun run check:versions` | Verifies the version in `package.json` matches `server/src/version.ts` |

## Repository layout

```
server/            Bun + Hono API (auth, projects, slides, stacks, search, import/export)
src/               Svelte app
tests/             Node/jsdom test suites (harness + mocks)
scripts/           Test runners, version check
```

## Notes

- The frontend talks to the API through `src/shared/lib/tauri-api.ts` (the single file that knows about `fetch`); mocks in `tests/mocks/` replace it for the test harnesses.
- This is a port of the DevSlides desktop app — same editing model, transport and persistence rewritten for the web (Tauri/Rust → REST/SQLite).
