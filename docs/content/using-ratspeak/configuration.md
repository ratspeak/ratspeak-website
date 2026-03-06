# Configuration

Complete reference for Ratspeak settings — config file, environment variables, and all available options.

## Config File

Ratspeak reads configuration from `dashboard/ratspeak.conf` in INI format:

```ini
[server]
port = 5050
host = 127.0.0.1
# api_token = your-secret-token-here

[nodes]
directory = nodes
hub_node = node_1

[dashboard]
poll_interval = 1.5
max_log_entries = 200
status_summary_interval = 300
max_nodes = 99
path_age_reachable = 1800
path_age_stale = 3600

[electron]
width = 1400
height = 900
dev_tools = false
```

## Environment Variable Overrides

Every setting can be overridden with an environment variable using the pattern:

```
RATSPEAK_<SECTION>_<KEY>=value
```

Examples:

```bash
RATSPEAK_SERVER_PORT=8080 ./start.sh
RATSPEAK_DASHBOARD_POLL_INTERVAL=2.0 ./start.sh
RATSPEAK_SERVER_HOST=0.0.0.0 ./start.sh
```

Environment variables take priority over the config file.

## Settings Reference

### `[server]`

| Key | Default | Type | Description |
|-----|---------|------|-------------|
| `port` | `5050` | int | Dashboard HTTP/WebSocket port |
| `host` | `127.0.0.1` | str | Listen address. Use `0.0.0.0` for all interfaces |
| `api_token` | *(empty)* | str | Optional API authentication token |

### `[nodes]`

| Key | Default | Type | Description |
|-----|---------|------|-------------|
| `directory` | `nodes` | str | Path to node config directories (relative or absolute) |
| `hub_node` | `node_1` | str | Primary node name that the dashboard connects to |

### `[dashboard]`

| Key | Default | Type | Description |
|-----|---------|------|-------------|
| `poll_interval` | `1.5` | float | Seconds between stats polling cycles |
| `max_log_entries` | `200` | int | Maximum event log entries retained |
| `status_summary_interval` | `300` | int | Seconds between status summary emissions (5 min) |
| `max_nodes` | `99` | int | Maximum number of nodes allowed |
| `path_age_reachable` | `1800` | int | Seconds — path age threshold for "reachable" status (30 min) |
| `path_age_stale` | `3600` | int | Seconds — path age threshold for "stale" status (60 min) |

### `[electron]`

Legacy section from the Electron desktop wrapper (Ratspeak now uses Tauri). These settings are still read if present:

| Key | Default | Type | Description |
|-----|---------|------|-------------|
| `width` | `1400` | int | Window width in pixels |
| `height` | `900` | int | Window height in pixels |
| `dev_tools` | `false` | bool | Enable Chromium developer tools |

## Data Directories

| Path | Contents |
|------|----------|
| `.ratspeak/` | Project data directory |
| `.ratspeak/ratspeak.db` | SQLite database (WAL mode) |
| `.ratspeak/.secret_key` | Flask session secret |
| `.ratspeak/identities/<hash>/` | Per-identity RNS keys and LXMF storage |
| `.ratspeak/files/` | Received file attachments |
| `nodes/<node_name>/` | Per-node rnsd config and storage |

## Key Constants

These are hardcoded values relevant to operation:

| Constant | Value | Description |
|----------|-------|-------------|
| Message timeout | 60 seconds | Time before a message delivery is considered timed out |
| Max file size | 500 KB | Maximum attachment size per file |
| Announce interval | 300 seconds | Periodic re-announce interval (5 min) |
| Max conversation memory | 200 messages | Per-contact message cache size |
| Max throughput samples | 60 | Per-interface sparkline history length |
| Alert dedup window | 30 seconds | Duplicate alert suppression window |
| Max alerts | 50 | Maximum active alerts retained |

## Next Steps

- [Installing Ratspeak](../getting-started/installing-ratspeak) — installation guide
- [Dashboard Overview](../using-ratspeak/dashboard-overview) — interface tour
- [Network Monitoring](../using-ratspeak/network-monitoring) — monitoring features
