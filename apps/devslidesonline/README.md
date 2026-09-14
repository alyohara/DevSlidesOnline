# DevSlides Online — CasaOS app

Self-hosted slides editor for developers (Svelte + Bun + SQLite), published as
`biancoal/devslides-online` (multi-arch `amd64`/`arm64`) on Docker Hub.

## Files

- `docker-compose.yml` — compose app with `x-casaos` metadata (this is the
  manifest; the file already worked as a plain `docker compose up -d`).
- `icon.png` — app icon (256x223).

## Install options

### A. Custom install (web UI)

CasaOS → **Apps** → **+** → **Install custom app** → paste the contents of
`docker-compose.yml` → adjust the port if needed → **Install**.

### B. Copy the app folder (store-style)

```bash
sudo cp -r apps/devslidesonline /var/lib/casaos/apps/
sudo casaos-cli app-management install devslidesonline
```

Then open **http://<casaos-ip>:1420**, create your account and start a deck.

## Data

The SQLite database is stored in the named volume `devslidesonline_devslides-data`
(`/app/data` inside the container). Back it up with:

```bash
docker run --rm -v devslidesonline_devslides-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/devslides.db.tar.gz -C /data .
```