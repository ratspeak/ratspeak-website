# Map Production Handoff

This is the handoff for moving `map.html` from local soak data to the dedicated
Linux server that runs the real Python RNS nodes.

Important split of responsibility:

- This local machine owns the website repo, `map.html`, Vercel login, and Vercel
  project configuration.
- The dedicated Linux server owns only the Python RNS nodes and a small map
  publisher bundle.
- The Linux server should not need to clone or understand the website repo.

## Goal

Use exactly one existing server-side RNS node, the node whose display/name starts
with `deadbeef`, as the discovery observer for the public map. That node listens
for interface discovery records, exports a sanitized snapshot, and publishes it
to the website on Vercel. The website does not run on the dedicated server.

Do not wire all ten server nodes into this flow. The other nodes can keep doing
their normal RNS work; `deadbeef*` is the map ingest source.

## Data Flow

1. Python RNS on the dedicated server receives interface discovery announces.
2. A server-side exporter reads discovery data from the `deadbeef*` RNS config.
3. The exporter transforms records into the `schemaVersion: 1` map snapshot.
4. The exporter removes unsafe or unusable records:
   - no private identities, IFAC passphrases, raw config snippets, or key data
   - no records without valid coordinates
   - no records that fail the land-mask filter
   - no records older than the expiry window
5. The publisher posts the snapshot to Vercel:
   - `POST https://ratspeak.org/api/map-ingest`
   - `Authorization: Bearer $MAP_INGEST_TOKEN`
6. Vercel stores the snapshot at `map/live.json` in Vercel Blob.
7. `map.html` reads live data through `/api/map-nodes`.

## Vercel Setup

Set these environment variables in the Vercel project before enabling the
publisher:

```text
BLOB_READ_WRITE_TOKEN=<vercel-blob-token>
MAP_INGEST_TOKEN=<strong-shared-secret>
MAP_BLOB_PATH=map/live.json
```

`MAP_BLOB_PATH` is optional and defaults to `map/live.json`, but setting it
explicitly makes the deployment easier to audit.

Generate `MAP_INGEST_TOKEN` with:

```bash
node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
```

## Website Repo Pieces

These files are the repo-side production contract:

- `api/map-ingest.js` accepts authenticated snapshots and writes Vercel Blob.
- `api/map-nodes.js` serves the current Blob snapshot, falling back to an empty
  pending-live snapshot for local development.
- `scripts/map-publish-snapshot.mjs` posts a prepared snapshot JSON to Vercel.
- `scripts/map-discovery-bridge.mjs` transforms either local rsReticulum soak
  data or Python `rnstatus -d --json` output into the map snapshot schema.
- `scripts/map-server/` is the self-contained Linux server bundle. This is the
  preferred production handoff for the dedicated RNS host.

## Server-Side Exporter Responsibilities

Claude on the Linux server should use the self-contained bundle in
`scripts/map-server/`. It should not need the full website repo.

Build the bundle on this local machine:

```bash
bash scripts/map-server/build-bundle.sh
```

This writes:

```text
.tmp/ratspeak-map-server-bundle.tar.gz
```

Copy that archive to the dedicated server and extract it under a temporary work
directory. The bundle contains:

```text
ratspeak-map-publisher.py
ne_110m_land.geojson
ratspeak-map.env.example
ratspeak-map-publisher.service
README.md
```

Claude on the Linux server should configure the publisher around the Python RNS
node whose config belongs to `deadbeef*`.

Preferred discovery export command:

```bash
rnstatus --config /path/to/deadbeef-rns-config -d --json
```

Python RNS documents `discover_interfaces = yes` as the switch that stores
incoming discovery records, and `rnstatus -d --json` as the machine-readable
export path for external applications.

The `deadbeef*` RNS config should include:

```ini
[reticulum]
discover_interfaces = yes
```

Optional policy choices for the operator:

```ini
[reticulum]
required_discovery_value = 14
# interface_discovery_sources = <network-or-transport-identity-hash>
# autoconnect_discovered_interfaces = 0
```

The standalone publisher normally runs `rnstatus` itself:

```bash
python3 /opt/ratspeak-map/ratspeak-map-publisher.py \
  --rns-config /path/to/deadbeef-rns-config \
  --land-geojson /opt/ratspeak-map/ne_110m_land.geojson \
  --out /var/lib/ratspeak-map/map-live.json \
  --dry-run
```

It can also convert a saved Python RNS discovery export to a map snapshot:

```bash
mkdir -p /var/lib/ratspeak-map

rnstatus --config /path/to/deadbeef-rns-config -d --json \
  > /var/lib/ratspeak-map/rnstatus-discovered.json

node scripts/map-discovery-bridge.mjs \
  --rnstatus-json /var/lib/ratspeak-map/rnstatus-discovered.json \
  --out /var/lib/ratspeak-map/map-live.json \
  --once
```

The Node bridge is useful from the website repo. The Python publisher is the
preferred server-side path because it is standalone.

The exporter should convert each accepted RNS discovery record into this shape:

```json
{
  "id": "disc:<stable-id>",
  "label": "Node display name",
  "kind": "server",
  "status": "seen",
  "lastSeen": "2026-06-28T00:00:00.000Z",
  "firstSeen": "2026-06-28T00:00:00.000Z",
  "location": {
    "lat": 45,
    "lon": 12,
    "city": "San Marino",
    "country": "San Marino"
  },
  "services": ["rns.transport"],
  "reticulum": {
    "interfaceType": "BackboneInterface",
    "transportId": "optional-public-id",
    "networkId": "optional-public-id",
    "heardCount": 4,
    "reachableOn": "82.223.44.241",
    "port": 4242
  }
}
```

Allowed `kind` values:

- `server`
- `client-auto`
- `client-manual`
- `i2p`
- `yggdrasil`

Kind mapping guidance:

- `BackboneInterface` and `TCPServerInterface` are `server`.
- `I2PInterface` is `i2p`.
- Yggdrasil endpoints must be emitted as `yggdrasil` explicitly by the exporter.
- Radio/client interfaces such as `RNodeInterface` are generally `client-auto`
  when received through discovery.

For server, I2P, and Yggdrasil records, include the public endpoint in either:

```json
"endpoint": { "ip": "82.223.44.241", "port": 4242 }
```

or:

```json
"reticulum": { "reachableOn": "82.223.44.241", "port": 4242 }
```

For `RNodeInterface` records, preserve public radio settings when present:

```json
"reticulum": {
  "interfaceType": "RNodeInterface",
  "radio": {
    "frequency": 869525000,
    "bandwidth": 250000,
    "spreadingFactor": 8,
    "codingRate": 5,
    "txPowerDbm": 17,
    "modulation": "LoRa"
  }
}
```

The top-level snapshot should look like:

```json
{
  "schemaVersion": 1,
  "sourceMode": "live-discovery",
  "generatedAt": "2026-06-28T00:00:00.000Z",
  "ttlSeconds": 900,
  "sources": [
    {
      "id": "deadbeef-rns-discovery",
      "label": "Ratspeak discovery ingest",
      "kind": "server-observed",
      "trust": "operator"
    }
  ],
  "stats": {
    "recordsRead": 120,
    "recordsAccepted": 87,
    "nodesPlotted": 83,
    "skippedMissingLocation": 12,
    "skippedWater": 2,
    "skippedExpired": 23
  },
  "nodes": []
}
```

## Publishing

One-shot publish from the dedicated server:

```bash
MAP_INGEST_TOKEN='<same-token-as-vercel>' \
MAP_INGEST_URL='https://ratspeak.org/api/map-ingest' \
python3 /opt/ratspeak-map/ratspeak-map-publisher.py \
  --rns-config /path/to/deadbeef-rns-config \
  --land-geojson /opt/ratspeak-map/ne_110m_land.geojson \
  --out /var/lib/ratspeak-map/map-live.json
```

Loop publish every 60 seconds:

```bash
MAP_INGEST_TOKEN='<same-token-as-vercel>' \
MAP_INGEST_URL='https://ratspeak.org/api/map-ingest' \
python3 /opt/ratspeak-map/ratspeak-map-publisher.py \
  --rns-config /path/to/deadbeef-rns-config \
  --land-geojson /opt/ratspeak-map/ne_110m_land.geojson \
  --out /var/lib/ratspeak-map/map-live.json \
  --interval 60
```

Recommended production shape is either a `systemd` service for the exporter plus
publisher loop, or a `systemd` timer that runs export-and-publish every minute.

## Smoke Test

Before exposing the page publicly:

```bash
curl -sS -X POST "$MAP_INGEST_URL" \
  -H "Authorization: Bearer $MAP_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @/var/lib/ratspeak-map/map-live.json

curl -sS https://ratspeak.org/api/map-nodes
```

Expected:

- ingest returns `{ "ok": true, ... }`
- `/api/map-nodes` returns `schemaVersion: 1`
- `nodes.length` matches the sanitized snapshot
- no secret/config fields are present in the returned JSON

## Server-Claude Prompt

Use this when handing off to Claude on the dedicated Linux server:

```text
We need to connect one Python RNS node to the Ratspeak website map. Use only the
existing RNS config for the node whose name starts with deadbeef. Do not alter
the other nine local RNS nodes except as needed to avoid port/config conflicts.

The website/Vercel setup is handled on another machine. This server has only
Python RNS nodes plus the /opt/ratspeak-map publisher bundle.

On this Linux server:
1. Confirm the deadbeef RNS config has discover_interfaces = yes.
2. Export discovery records with:
   rnstatus --config <deadbeef-config-dir> -d --json
3. Use /opt/ratspeak-map/ratspeak-map-publisher.py to build and publish the
   sanitized snapshot to https://ratspeak.org/api/map-ingest.
4. The publisher classifies kinds as server, client-auto, client-manual, i2p,
   or yggdrasil.
5. Preserve public endpoint and radio settings, but never publish identities,
   private keys, IFAC passphrases, or raw config snippets.
6. Filter records with missing coordinates, water coordinates, and expired
   last_heard timestamps.
7. Only use the deadbeef node's RNS config; do not collect from the other nine
   local nodes.

Ask before changing production service files or restarting any RNS node.
```
