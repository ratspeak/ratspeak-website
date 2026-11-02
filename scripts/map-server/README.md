# Ratspeak map publisher

Use this publisher on a Linux host running Python Reticulum to send discovery
records to the website’s map ingest endpoint. It runs independently of the
website checkout and does not need a Vercel login on the observer host.

Choose one RNS instance as the observer. Set `RNS_CONFIG_DIR` to that instance’s
configuration directory; the script does not select an instance by its name.
Use the same observer consistently instead of combining snapshots from several
publishers. Each successful upload replaces the configured map snapshot.

## What becomes public

The publisher selects records with usable coordinates, a recent `last_heard`
time and, by default, a position inside the Natural Earth land mask. The default
maximum age is seven days. Records without a usable timestamp are excluded.
The land mask is coarse and can reject coastal locations; it does not verify
that a reported location is true.

The snapshot includes node labels, coordinates, discovery identifiers, public
transport/network IDs, observed times, hop counts, connection endpoints and
radio settings when present. It does not copy private keys, IFAC passphrases or
raw configuration files. Review the snapshot before publishing: names and other
text from discovery records are still public text. This is an observed discovery
map, not a complete network inventory or proof that a node is reachable now.

The current publisher uses `deadbeef-rns-discovery` as its fixed snapshot source
ID. That label does not enforce which RNS instance it reads.

## Prerequisites

- Python 3 and a working Python Reticulum `rnstatus` command on the observer host.
- Read access to the chosen RNS configuration and permission to query that instance.
- A website deployment with the map ingest endpoint and its storage configured.
- A shared ingest token supplied by the website operator.

Confirm discovery is enabled in the selected RNS instance’s configuration:

```ini
[reticulum]
discover_interfaces = yes
```

Check the observer before configuring the publisher:

```bash
rnstatus --config /path/to/observer-rns-config -d --json
command -v rnstatus
```

Use the absolute executable path reported by the second command as
`RNSTATUS_BIN`, especially if Reticulum is installed in a virtual environment.
The publisher invokes that executable; it does not import RNS itself. Coordinate
any configuration change or service restart with the operator of the RNS instance.

## Files and settings

Copy these files into the deployment directory, shown here as `/opt/ratspeak-map/`:

```text
ratspeak-map-publisher.py
ne_110m_land.geojson
ratspeak-map.env.example
ratspeak-map-publisher.service
README.md
```

The land file is at `scripts/data/ne_110m_land.geojson` in the website repository.
The other files are in this directory. Adapt paths and permissions to the host’s
existing service layout; preserve any existing deployment before replacing files.

On the website deployment, configure:

```text
BLOB_READ_WRITE_TOKEN=<website-storage-token>
MAP_INGEST_TOKEN=<shared-ingest-token>
MAP_BLOB_PATH=map/live.json
```

The observer needs the same `MAP_INGEST_TOKEN`; it does not need the Blob token.
If the target deployment is protected, set `VERCEL_PROTECTION_BYPASS` to its
[Vercel automation bypass secret](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).
The publisher sends it in a header. Leave it empty for an unprotected deployment.

Create `/etc/ratspeak-map.env` from the example and set:

```text
RNS_CONFIG_DIR=/path/to/observer-rns-config
RNSTATUS_BIN=/path/to/rnstatus
MAP_INGEST_URL=https://ratspeak.org/api/map-ingest
MAP_INGEST_TOKEN=<shared-ingest-token>
VERCEL_PROTECTION_BYPASS=
MAP_LAND_GEOJSON=/opt/ratspeak-map/ne_110m_land.geojson
MAP_SNAPSHOT_OUT=/var/lib/ratspeak-map/map-live.json
MAP_PUBLISH_INTERVAL=60
MAP_PUBLISH_TIMEOUT=30
MAP_MAX_AGE_SECONDS=604800
```

Replace the URL if you are using a different website or preview deployment.
Keep the environment file readable only by the administrator or service account
that needs it. Create the output directory with write permission for that account.
Use shell-compatible assignments if you will source the file as shown below.

## Check a snapshot, then publish once

Run these commands in a shell allowed to read the environment file and query the
observer, using the same executable paths and permissions intended for the service:

```bash
set -a
. /etc/ratspeak-map.env
set +a

/usr/bin/python3 /opt/ratspeak-map/ratspeak-map-publisher.py \
  --rns-config "$RNS_CONFIG_DIR" \
  --land-geojson "$MAP_LAND_GEOJSON" \
  --out "$MAP_SNAPSHOT_OUT" \
  --interval 0 \
  --require-land-mask \
  --dry-run
```

`--dry-run` writes the local snapshot but does not upload it. `--interval 0`
overrides the repeating interval in the environment so this check exits after
one cycle. `--require-land-mask` makes a missing land file an error instead of
silently disabling the filter.

Inspect the JSON at `MAP_SNAPSHOT_OUT`, including its nodes and skipped-record
counts. To inspect saved discovery output without querying RNS, use
`--rnstatus-json /path/to/discovery.json` with the same dry-run options.

Once the snapshot and target endpoint are correct, publish one snapshot:

```bash
/usr/bin/python3 /opt/ratspeak-map/ratspeak-map-publisher.py \
  --rns-config "$RNS_CONFIG_DIR" \
  --land-geojson "$MAP_LAND_GEOJSON" \
  --out "$MAP_SNAPSHOT_OUT" \
  --interval 0 \
  --require-land-mask
```

This command uploads data and replaces the current snapshot. Check the matching
website’s `/api/map-nodes` response and map before enabling recurring publication.
For the public Ratspeak website:

```bash
curl --fail --silent --show-error https://ratspeak.org/api/map-nodes
```

## Recurring service

The included systemd unit reads `/etc/ratspeak-map.env` and runs the publisher
at `MAP_PUBLISH_INTERVAL` seconds. It is a long-running service, not a timer.
Set an interval of at least ten seconds. On failure, systemd restarts it after
ten seconds; inspect the journal for the underlying error.

Before installing the unit, review its paths and account. It runs as root unless
you set `User=` and `Group=`. A dedicated account needs access to the observer’s
configuration and RPC endpoint, and write access to the snapshot directory.
Ensure `/usr/bin/python3` and `RNSTATUS_BIN` work under that account.

After the dry-run and one-shot upload succeed:

```bash
sudo cp ratspeak-map-publisher.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ratspeak-map-publisher.service
sudo journalctl -u ratspeak-map-publisher.service -f
```

If the host already manages recurring work another way, retain that convention
and use `--interval 0` for each scheduled invocation.
