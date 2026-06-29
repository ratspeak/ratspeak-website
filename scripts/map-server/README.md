# Ratspeak Map Server Publisher

This folder is the dedicated-server side of the map pipeline. It is written for
the Linux host that runs the Python RNS nodes. It does not require the website
repo or Vercel login on that server.

The commands below are a conservative reference implementation. If the server
already has clear conventions for service users, config locations, timers, or
deployment layout, use those conventions while preserving the constraints in
`SERVER-CLAUDE-PROMPT.md`.

## What This Does

One RNS node, the node whose name starts with `deadbeef`, acts as the map
observer. The publisher reads discovery records from that node only, sanitizes
them, filters invalid/water/expired records, and posts a snapshot to Vercel.

Do not run this against the other nine RNS nodes. They will duplicate data and
make the map harder to reason about.

## Files To Copy To The Server

Copy these files to `/opt/ratspeak-map/`:

```text
ratspeak-map-publisher.py
ne_110m_land.geojson
ratspeak-map.env.example
ratspeak-map-publisher.service
SERVER-CLAUDE-PROMPT.md
```

`ne_110m_land.geojson` is in the website repo at:

```text
scripts/data/ne_110m_land.geojson
```

The server only needs the ingest token, not Vercel login credentials.

## Vercel Side

On this local machine, before enabling the server publisher, configure the
website project in Vercel with:

```text
BLOB_READ_WRITE_TOKEN=<vercel-blob-token>
MAP_INGEST_TOKEN=<strong-shared-secret>
MAP_BLOB_PATH=map/live.json
```

The server must receive the same `MAP_INGEST_TOKEN`.

If publishing to a protected Vercel Preview deployment, the server also needs
the Preview protection bypass secret as `VERCEL_PROTECTION_BYPASS`. Production
does not need this value if the production deployment is public.

## Suggested Server Setup

Find the RNS config directory for the `deadbeef*` node. The config must have:

```ini
[reticulum]
discover_interfaces = yes
```

Confirm Python RNS can export discovery records:

```bash
rnstatus --config /path/to/deadbeef-rns-config -d --json
```

One simple install shape is:

```bash
sudo mkdir -p /opt/ratspeak-map /var/lib/ratspeak-map
sudo cp ratspeak-map-publisher.py /opt/ratspeak-map/
sudo cp ne_110m_land.geojson /opt/ratspeak-map/
sudo cp ratspeak-map.env.example /etc/ratspeak-map.env
sudo chmod 600 /etc/ratspeak-map.env
sudo chmod +x /opt/ratspeak-map/ratspeak-map-publisher.py
```

Edit `/etc/ratspeak-map.env`:

```text
RNS_CONFIG_DIR=/path/to/deadbeef-rns-config
MAP_INGEST_URL=https://ratspeak.org/api/map-ingest
MAP_INGEST_TOKEN=<same-token-as-vercel>
VERCEL_PROTECTION_BYPASS=
MAP_LAND_GEOJSON=/opt/ratspeak-map/ne_110m_land.geojson
MAP_SNAPSHOT_OUT=/var/lib/ratspeak-map/map-live.json
MAP_PUBLISH_INTERVAL=60
```

For protected Preview testing, set:

```text
MAP_INGEST_URL=https://ratspeak-git-maps-exploration-defidudes-projects.vercel.app/api/map-ingest
VERCEL_PROTECTION_BYPASS=<preview-bypass-secret>
```

Dry-run locally:

```bash
set -a
. /etc/ratspeak-map.env
set +a

python3 /opt/ratspeak-map/ratspeak-map-publisher.py \
  --rns-config "$RNS_CONFIG_DIR" \
  --land-geojson "$MAP_LAND_GEOJSON" \
  --out "$MAP_SNAPSHOT_OUT" \
  --dry-run
```

Publish once:

```bash
python3 /opt/ratspeak-map/ratspeak-map-publisher.py \
  --rns-config "$RNS_CONFIG_DIR" \
  --land-geojson "$MAP_LAND_GEOJSON" \
  --out "$MAP_SNAPSHOT_OUT"
```

Check website data:

```bash
curl -sS https://ratspeak.org/api/map-nodes
```

## Recurring Service

The included systemd unit is a starting point. Use it after the dry-run and
one-shot publish work, or adapt to the server's existing service/timer pattern:

```bash
sudo cp ratspeak-map-publisher.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ratspeak-map-publisher.service
sudo journalctl -u ratspeak-map-publisher.service -f
```

## Server-Claude Prompt

The exact prompt is included in `SERVER-CLAUDE-PROMPT.md`. Paste that file into
Claude on the dedicated server after extracting the bundle.

Short version:

```text
This Linux server runs 10 Python Reticulum nodes. Only one node should publish
map discovery data to Vercel: the node whose name starts with deadbeef. The
other nine nodes must not be used for the map publisher because they will create
duplicates.

The website/Vercel setup is handled on another machine. This server only needs
to export discovery data from the deadbeef RNS config and POST sanitized JSON to
https://ratspeak.org/api/map-ingest with MAP_INGEST_TOKEN.

The provided publisher runs:
rnstatus --config <deadbeef-config-dir> -d --json

Then it:
- keeps only valid coordinate records
- filters points outside land
- expires old records
- classifies IPv4 server, IPv6 server, client-auto, I2P, and Yggdrasil nodes
- preserves public endpoint and radio settings
- never publishes identities, keys, IFAC passphrases, or raw config snippets

First find the deadbeef RNS config directory and confirm it has:
[reticulum]
discover_interfaces = yes

Then set the publisher environment with RNS_CONFIG_DIR, MAP_INGEST_URL,
MAP_INGEST_TOKEN, MAP_LAND_GEOJSON, MAP_SNAPSHOT_OUT, and MAP_PUBLISH_INTERVAL.

Run a dry-run before publishing. Ask before restarting any existing RNS service.
```
