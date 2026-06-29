# Server Claude Prompt

Paste this into Claude on the dedicated Linux server after copying and extracting
`ratspeak-map-server-bundle.tar.gz`.

```text
We are adding a small Ratspeak map publisher to this dedicated Linux server.
Use your judgment for the local Linux/service details after inspecting the host;
the paths and commands below are examples, not a demand to ignore existing
server conventions.

Context:
- This server runs 10 Python Reticulum/RNS nodes.
- Only one node should feed the map publisher: the RNS instance whose
  node/identity/config name starts with "deadbeef".
- The deadbeef* instance is our propagation/sync node.
- Do not collect discovery data from the other nine nodes, because that will
  duplicate records.
- The website repo, map.html, and Vercel project are managed on another machine.
  This server only publishes sanitized discovery snapshots to Vercel.

Provided bundle:
- ratspeak-map-publisher.py
- ne_110m_land.geojson
- ratspeak-map.env.example
- ratspeak-map-publisher.service
- README.md

Hard constraints:
1. Use only the deadbeef* RNS instance as the discovery source.
2. Do not publish private keys, identities, IFAC passphrases, or raw config
   snippets.
3. Do not restart or modify existing production RNS services without asking.
4. Dry-run before publishing.
5. One-shot publish before installing or enabling any long-running service.

Success criteria:
1. Find the RNS config directory for the deadbeef* instance.
2. Confirm or enable incoming interface discovery for that instance:
   discover_interfaces = yes
3. Confirm Python RNS can export records with rnstatus.
4. Generate /var/lib/ratspeak-map/map-live.json or an equivalent local snapshot.
5. Publish one sanitized snapshot to the supplied Vercel /api/map-ingest URL.
6. Leave behind a maintainable service/timer only after the one-shot publish is
   confirmed.

Environment values that will be provided:
- MAP_INGEST_URL: Vercel Preview or Production /api/map-ingest URL.
- MAP_INGEST_TOKEN: shared Vercel ingest token.
- VERCEL_PROTECTION_BYPASS: required only for protected Vercel Preview.
- MAP_LAND_GEOJSON: path to ne_110m_land.geojson.
- MAP_SNAPSHOT_OUT: path for the local snapshot copy.
- MAP_PUBLISH_INTERVAL: desired recurring publish interval, probably 60 seconds.

Suggested investigation commands, adapt as needed:
ps aux | grep -Ei '[r]ns|[r]eticulum'
systemctl list-units --type=service | grep -Ei 'rns|reticulum|ratspeak'
find /etc /opt /var/lib "$HOME" -maxdepth 5 -type f -name config 2>/dev/null | grep -Ei 'rns|reticulum|deadbeef'

Suggested rnstatus check:
rnstatus --config <deadbeef-config-dir> -d --json

Suggested install shape, adapt to existing local conventions if there is a
better standard path/user/service manager on this host:
sudo mkdir -p /opt/ratspeak-map /var/lib/ratspeak-map
sudo cp ratspeak-map-publisher.py /opt/ratspeak-map/
sudo cp ne_110m_land.geojson /opt/ratspeak-map/
sudo cp ratspeak-map.env.example /etc/ratspeak-map.env
sudo chmod +x /opt/ratspeak-map/ratspeak-map-publisher.py
sudo chmod 600 /etc/ratspeak-map.env

Suggested /etc/ratspeak-map.env keys:
- RNS_CONFIG_DIR=<deadbeef-config-dir>
- MAP_INGEST_URL=<provided ingest URL>
- MAP_INGEST_TOKEN=<provided ingest token>
- VERCEL_PROTECTION_BYPASS=<provided only for protected Preview>
- MAP_LAND_GEOJSON=/opt/ratspeak-map/ne_110m_land.geojson
- MAP_SNAPSHOT_OUT=/var/lib/ratspeak-map/map-live.json
- MAP_PUBLISH_INTERVAL=60

Suggested dry-run:
set -a
. /etc/ratspeak-map.env
set +a
python3 /opt/ratspeak-map/ratspeak-map-publisher.py \
  --rns-config "$RNS_CONFIG_DIR" \
  --land-geojson "$MAP_LAND_GEOJSON" \
  --out "$MAP_SNAPSHOT_OUT" \
  --dry-run \
  --require-land-mask

Suggested one-shot publish:
python3 /opt/ratspeak-map/ratspeak-map-publisher.py \
  --rns-config "$RNS_CONFIG_DIR" \
  --land-geojson "$MAP_LAND_GEOJSON" \
  --out "$MAP_SNAPSHOT_OUT" \
  --require-land-mask

If a recurring service is appropriate, you can use the included systemd unit as
a starting point. If this server uses a different pattern, prefer the existing
local convention and explain the choice.

Before making persistent changes, report:
- which deadbeef* config directory you identified,
- whether discover_interfaces was already enabled,
- how many records the dry-run read/accepted/plotted,
- and exactly what recurring service/timer you intend to install.
```
