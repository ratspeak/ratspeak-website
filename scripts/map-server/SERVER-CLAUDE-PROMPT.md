# Server Claude Prompt

Paste this into Claude on the dedicated Linux server after copying and extracting
`ratspeak-map-server-bundle.tar.gz`.

```text
We are adding a small map publisher service to this dedicated Linux server.
This server runs 10 Python Reticulum/RNS nodes. Only one node should be used for
the map publisher: the RNS instance whose node/identity/config name starts with
"deadbeef". That instance is our propagation/sync node. Do not collect from the
other nine nodes because doing so will duplicate discovery data.

The website and Vercel project are managed on another machine. You do not need
the website repo. You only need this extracted bundle:
- ratspeak-map-publisher.py
- ne_110m_land.geojson
- ratspeak-map.env.example
- ratspeak-map-publisher.service
- README.md

Goal:
1. Find the RNS config directory for the deadbeef* instance.
2. Confirm it has:
   [reticulum]
   discover_interfaces = yes
3. Do not restart or modify existing production RNS services unless you ask first.
4. Configure /etc/ratspeak-map.env from ratspeak-map.env.example.
5. Run a dry-run of /opt/ratspeak-map/ratspeak-map-publisher.py.
6. If the dry-run looks good, publish once to the Vercel Preview ingest URL.
7. Only after the one-shot publish succeeds, set up the systemd service.

Important environment values:
- RNS_CONFIG_DIR must point to the deadbeef* RNS config directory.
- MAP_INGEST_URL should be the Vercel Preview or Production /api/map-ingest URL.
- MAP_INGEST_TOKEN is the shared Vercel ingest token.
- VERCEL_PROTECTION_BYPASS is required only while publishing to a protected
  Vercel Preview deployment. It is not needed for production if production is
  public.
- MAP_LAND_GEOJSON should point to /opt/ratspeak-map/ne_110m_land.geojson.
- MAP_SNAPSHOT_OUT should point to /var/lib/ratspeak-map/map-live.json.

Useful read-only discovery commands:
ps aux | grep -Ei '[r]ns|[r]eticulum'
systemctl list-units --type=service | grep -Ei 'rns|reticulum|ratspeak'
find /etc /opt /var/lib "$HOME" -maxdepth 5 -type f -name config 2>/dev/null | grep -Ei 'rns|reticulum|deadbeef'

Confirm discovery export works:
rnstatus --config <deadbeef-config-dir> -d --json

Install bundle files:
sudo mkdir -p /opt/ratspeak-map /var/lib/ratspeak-map
sudo cp ratspeak-map-publisher.py /opt/ratspeak-map/
sudo cp ne_110m_land.geojson /opt/ratspeak-map/
sudo cp ratspeak-map.env.example /etc/ratspeak-map.env
sudo chmod +x /opt/ratspeak-map/ratspeak-map-publisher.py
sudo chmod 600 /etc/ratspeak-map.env

Dry-run:
set -a
. /etc/ratspeak-map.env
set +a
python3 /opt/ratspeak-map/ratspeak-map-publisher.py \
  --rns-config "$RNS_CONFIG_DIR" \
  --land-geojson "$MAP_LAND_GEOJSON" \
  --out "$MAP_SNAPSHOT_OUT" \
  --dry-run \
  --require-land-mask

Publish once:
python3 /opt/ratspeak-map/ratspeak-map-publisher.py \
  --rns-config "$RNS_CONFIG_DIR" \
  --land-geojson "$MAP_LAND_GEOJSON" \
  --out "$MAP_SNAPSHOT_OUT" \
  --require-land-mask

If that succeeds, install systemd:
sudo cp ratspeak-map-publisher.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ratspeak-map-publisher.service
sudo journalctl -u ratspeak-map-publisher.service -f

The publisher must never send private keys, identities, IFAC passphrases, or raw
config snippets. It only publishes sanitized node kind, label, coordinates,
public endpoint, public radio settings, services, and observed timestamps.
```
