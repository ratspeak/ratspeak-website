# Configuration Reference

Reference for the configuration files relevant to Ratspeak users and operators: the Reticulum daemon config, the LXMF propagation node config, and where Ratspeak app settings live.

## Reticulum config (`~/.reticulum/config`)

INI format. Same file is read by upstream Python `rnsd` and the Rust `rnsd` — they are interchangeable.

Three top-level sections:

| Section | Purpose |
|---|---|
| `[reticulum]` | Daemon-wide flags: transport role, shared instance, RPC. |
| `[logging]` | `loglevel` 1-7 (1 = critical, 7 = extreme). |
| `[interfaces]` | One sub-block per interface (TCP, RNode, Auto, etc.). |

The file is created with sensible defaults on first run. Edit, then restart the daemon.

## `[reticulum]` block

| Key | Default | Description |
|---|---|---|
| `enable_transport` | `No` | Make this node a transport router. Forwards traffic and announces for other nodes. Required for hubs and gateways. |
| `share_instance` | `Yes` | Run as a shared instance so other tools on this host can attach to this daemon over a local socket instead of opening their own interfaces. |
| `instance_name` | `default` | Name of the shared-instance socket. Multiple daemons on one host need distinct names. |
| `shared_instance_port` | `37428` | Local control port for the shared instance. |
| `enable_remote_management` | `No` | Allow remote RPC management from listed identities. |
| `remote_management_allowed` | *(none)* | Comma-separated identity hashes permitted to manage this node. |
| `respond_to_probes` | `No` | Reply to network probes used by `rnprobe` for diagnostics. |
| `panic_on_interface_error` | `No` | Halt the daemon if an interface raises a fatal error (otherwise log and continue). |

## `[interfaces]` block

Each interface is declared as a sub-block. The block name is a label; `type` selects the driver.

```
[[Hub Uplink]]
    type = TCPClientInterface
    target_host = hub.example.org
    target_port = 4242
    interface_enabled = True
```

### Common keys (any interface type)

| Key | Description |
|---|---|
| `type` | `TCPClientInterface`, `TCPServerInterface`, `UDPInterface`, `AutoInterface`, `RNodeInterface`, `RNodeMultiInterface`, `SerialInterface`, `KISSInterface`, `I2PInterface`, etc. |
| `interface_enabled` | `True` / `False`. Toggle without removing the block. |
| `mode` | `full` (default), `access_point`, `roaming`, `boundary`, `gateway`. Controls how announces are rebroadcast. |
| `network_name` | IFAC network name. Interfaces with different names cannot exchange traffic on this link. |
| `passphrase` | IFAC passphrase. Combined with `network_name` to authenticate frames. |
| `ifac_size` | IFAC HMAC tag size in bytes (range `1`-`64`, default `16`). |
| `announce_cap` | Max share of bandwidth used for announces. Default `2` (percent). |
| `announce_rate_target` | Target seconds between announces from any one destination on this interface. |
| `bitrate` | Link bitrate in bps. Used for airtime accounting on lossy or rate-limited links. |

### TCP keys (`TCPClientInterface`, `TCPServerInterface`)

| Key | Used by | Description |
|---|---|---|
| `target_host` | Client | Hostname or IP of the remote peer. |
| `target_port` | Client | TCP port on the remote peer. |
| `listen_ip` | Server | Local bind address. `0.0.0.0` for all interfaces. |
| `listen_port` | Server | Local bind port. |

### RNode keys (`RNodeInterface`, LoRa radios)

| Key | Description |
|---|---|
| `port` | Serial device, e.g. `/dev/ttyUSB0` or `COM3`. |
| `frequency` | Centre frequency in Hz. Must match other nodes on the link and local regulations. |
| `bandwidth` | LoRa bandwidth in Hz (e.g. `125000`, `250000`). |
| `txpower` | Transmit power in dBm. |
| `spreadingfactor` | LoRa SF, `5`-`12`. Higher = longer range, lower throughput. |
| `codingrate` | LoRa coding rate, `5`-`8` (means 4/5 to 4/8). |
| `airtime_limit_short` | Percent airtime cap over a short window. Enforces duty-cycle compliance. |
| `airtime_limit_long` | Percent airtime cap over a long (hourly) window. |

### AutoInterface keys

`AutoInterface` discovers peers on the local LAN over IPv6 multicast. Useful keys: `group_id` (separate logical groups on the same LAN), `discovery_scope` (`link`, `admin`, `site`, `organisation`, `global`), `devices` (whitelist of OS interface names), `ignored_devices` (blacklist).

## LXMF / `lxmd` config (`~/.reticulum/lxmd.conf`)

INI format. Read by `lxmd`, the LXMF propagation node daemon. Only operators running a propagation node need this file; client apps do not.

| Key | Description |
|---|---|
| `enable_node` | Enable propagation node duties (store-and-forward for offline peers). |
| `node_name` | Display name announced to peers. |
| `announce_interval` | Minutes between propagation-node announces. |
| `message_storage_limit` | Maximum disk used for stored messages, in megabytes. |
| `propagation_transfer_max_accepted_size` | Largest single message accepted from peers, in kilobytes. |
| `prioritise_destinations` | Comma-separated destination hashes whose messages are kept first when storage fills. |
| `static_peers` | Comma-separated peer destination hashes to sync with on a fixed schedule. |
| `peer_announce_interval` | Minutes between sync attempts to static peers. |
| `min_stamp_cost` | Minimum LXMF stamp cost accepted. Raises the cost of spamming this node. |

## Ratspeak app settings

Ratspeak does **not** use a hand-edited config file. All app settings — display name, theme, auto-announce interval, propagation node, notification preferences, interface enables — live in the SQLite database next to the app data and are managed through the Settings view in the app.

To reset, quit Ratspeak and remove the app data directory, then relaunch. The database will be recreated with defaults and a fresh identity.

The Reticulum stack inside Ratspeak uses its own embedded config under the app data directory, separate from any system-wide `~/.reticulum/config`. Two daemons can coexist on one host without conflict as long as their interface ports differ.

## Identity files

Identities are not configuration — they are 64-byte binary keys (32-byte X25519 private + 32-byte Ed25519 private). They cannot be edited in a text editor and must never be committed to source control or shared.

| Tool | Path |
|---|---|
| Ratspeak app | `<OS data dir>/com.ratspeak.app/.ratspeak/identities/<hash>/identity` (see [Install & Platform Setup](../getting-started/install-and-platform-setup) for the per-OS data directory) |
| `rnsd` (Python or Rust) | `~/.reticulum/storage/<file>` |
| `lxmd` | `~/.reticulum/storage/lxmd/identity` |

Back up the raw 64-byte file to preserve an identity across machines. Restoring is a file copy — no import step.
