# DevSlides Online — CasaOS app

Self-hosted slides editor for developers (Svelte + Bun + SQLite), published as
`biancoal/devslides-online` (multi-arch `amd64`/`arm64`) on Docker Hub.

## Files

- `docker-compose.yml` — compose app with `x-casaos` metadata (the manifest).
- `icon.png` — app icon (256x223).

## Install — recommended (store-style)

CasaOS runs this compose file as-is (ports, volume, env and metadata all apply).
On the CasaOS server:

```bash
sudo mkdir -p /var/lib/casaos/apps/devslidesonline
sudo cp docker-compose.yml icon.png /var/lib/casaos/apps/devslidesonline/
sudo casaos-cli app-management install devslidesonline
```

Refresh the CasaOS web UI; the app appears in **Apps** with its icon.
Open **http://<casaos-ip>:1420**, create your account and start a deck.

## Install — alternative (web UI form)

CasaOS → **Apps** → **+** → **Install custom app**. Note this form fills in
only image/tag/title from a pasted compose; **ports, volumes, env and icon must
be added by hand**:

| Field                              | Value                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Imagen Docker                      | `biancoal/devslides-online`                                             |
| Tag                                | `latest`                                                                |
| Título                             | `DevSlides Online`                                                      |
| Icono URL                          | `https://raw.githubusercontent.com/alyohara/DevSlidesOnline/main/apps/devslidesonline/icon.png` |
| Web UI                             | `http://<casaos-ip>` puerto `1420`                                      |
| Red                                | `bridge` (default)                                                      |
| Puerto (añadir)                    | host `1420` → container `1420` (`tcp`)                                  |
| Volumen (añadir)                   | host `/DATA/AppData/devslidesonline/data` → container `/app/data`       |
| Variables de entorno (añadir)      | `NODE_ENV=production`, `PORT=1420`, `DATABASE_PATH=/app/data/devslides.db` |
| Política de reinicio               | `unless-stopped`                                                        |

## Data

SQLite lives in `/DATA/AppData/devslidesonline/data` (bind-mounted to
`/app/data`). Back it up by copying that folder, e.g.:

```bash
sudo tar czf devslides-backup.tar.gz /DATA/AppData/devslidesonline/data
```