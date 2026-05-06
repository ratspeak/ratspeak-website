# Configuration Reference

Reference for the configuration files relevant to Ratspeak users and operators: the Reticulum daemon config, the LXMF Offline Inbox/propagation node config, and where Ratspeak app settings live.

## Reticulum config (`~/.rsReticulum/config` or `~/.reticulum/config`)

INI format. Common config files are read by Reticulum-compatible daemons such as `rnsd-rs`. For portable configs, set `enabled = yes` or `enabled = no` explicitly on every interface.

rsReticulum defaults to rsReticulum-specific paths such as `~/.rsReticulum/config`, with `/etc/rsReticulum/config` or `~/.config/rsReticulum/config` taking precedence on Unix-like systems if present. Point `--config` at another Reticulum-compatible directory only when shared local state is intentional.

Three top-level sections:

| Section | Purpose |
|---|---|
| `[reticulum]` | Daemon-wide flags: transport role, shared instance, RPC. |
| `[logging]` | `loglevel` 0-7 (0 = quiet, 7 = extreme). |
| `[interfaces]` | One sub-block per interface (TCP, RNode, Auto, etc.). |

The file is created with sensible defaults on first run. Edit, then restart the daemon.

## `[reticulum]` block

| Key | Default | Description |
|---|---|---|
| `enable_transport` | `No` | Make this node a transport router. Forwards traffic and announces for other nodes. Required for hubs and gateways. |
| `share_instance` | `Yes` | Run as a shared instance so other tools on this host can attach to this daemon over a local socket instead of opening their own interfaces. |
| `instance_name` | `default` | Name of the shared-instance socket. Multiple daemons on one host need distinct names. |
| `shared_instance_port` | `37428` | Local shared-instance data port. Remote-control RPC uses separate control settings. |
| `enable_remote_management` | `No` | Allow remote RPC management from listed identities. |
| `remote_management_allowed` | *(none)* | Comma-separated identity hashes permitted to manage this node. |
| `respond_to_probes` | `No` | Reply to network probes used by `rnprobe-rs` for diagnostics. |
| `panic_on_interface_error` | `No` | Halt the daemon if an interface raises a fatal error (otherwise log and continue). |

## `[interfaces]` block

Each interface is declared as a sub-block. The block name is a label; `type` selects the driver.

```
[[Hub Uplink]]
    type = TCPClientInterface
    target_host = hub.example.org
    target_port = 4242
    enabled = yes
```

### Common keys (any interface type)

| Key | Description |
|---|---|
| `type` | `TCPClientInterface`, `TCPServerInterface`, `UDPInterface`, `AutoInterface`, `RNodeInterface`, `RNodeMultiInterface`, `SerialInterface`, `KISSInterface`, `I2PInterface`, etc. |
| `enabled` / `interface_enabled` | `yes` / `no` or `True` / `False`. This docs set uses `enabled = yes` in examples. |
| `mode` | `full` (default), `access_point`, `roaming`, `boundary`, `gateway`. Controls how announces are rebroadcast. |
| `network_name` | IFAC network name. Interfaces with different names cannot exchange traffic on this link. |
| `passphrase` | IFAC passphrase. Combined with `network_name` to authenticate frames. |
| `ifac_size` | Advanced IFAC tag length. Leave unset for portable configs; explicit unit handling has differed between implementations. |
| `announce_cap` | Max share of bandwidth used for announces. Default `2` (percent). |
| `announce_rate_target` | Target rate for rebroadcasting received announces on this interface. |
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
| `airtime_limit_short` | Percent airtime cap over a short window. Used by RNodeMulti subinterfaces in the current Rust implementation. |
| `airtime_limit_long` | Percent airtime cap over a long window. Used by RNodeMulti subinterfaces in the current Rust implementation. |

### AutoInterface keys

`AutoInterface` discovers peers on the local LAN over IPv6 multicast. Useful keys: `group_id` (separate logical groups on the same LAN), `discovery_scope` (`link`, `admin`, `site`, `organisation`, `global`), `devices` (whitelist of OS interface names), `ignored_devices` (blacklist).

## LXMF / `lxmd-rs` config

INI format. Read by `lxmd-rs`, the LXMF propagation node daemon. Ratspeak calls the client-facing feature Offline Inbox, but LXMF calls the server role a propagation node. Only operators running a propagation node need this file; client apps do not. Use `lxmd-rs --config <dir>` for an explicit config directory.

### `[propagation]`

| Key | Description |
|---|---|
| `enable_node` | Enable propagation node duties (store-and-forward for offline peers). |
| `node_name` | Display name announced to peers. |
| `announce_interval` | Minutes between propagation-node announces. |
| `announce_at_start` | Announce the propagation node when the daemon starts. |
| `autopeer` | Automatically peer with discovered propagation nodes. |
| `autopeer_maxdepth` | Maximum autopeering depth. |
| `message_storage_limit` | Maximum disk used for stored messages, in megabytes. |
| `propagation_message_max_accepted_size` | Largest single propagated message accepted from peers, in kilobytes. |
| `propagation_sync_max_accepted_size` | Largest accepted propagation sync transfer, in kilobytes. |
| `propagation_stamp_cost_target` | Target stamp cost for propagated messages. |
| `propagation_stamp_cost_flexibility` | Accepted variance around the target stamp cost. |
| `peering_cost` | Stamp cost used for peering. |
| `remote_peering_cost_max` | Maximum accepted remote peering cost. |
| `max_peers` | Maximum propagation peers. |
| `prioritise_destinations` | Comma-separated destination hashes whose messages are kept first when storage fills. |
| `static_peers` | Comma-separated peer destination hashes to sync with on a fixed schedule. |
| `from_static_only` | Only accept propagation from configured static peers. |
| `auth_required` | Require authorized/control-listed peers for propagation duties. |

### `[lxmf]`

| Key | Description |
|---|---|
| `display_name` | Display name for this LXMF peer. |
| `announce_at_start` | Announce the local LXMF destination when the daemon starts. |
| `announce_interval` | Minutes between local LXMF peer announces. |
| `delivery_transfer_max_accepted_size` | Largest direct delivery transfer accepted, in kilobytes. |
| `on_inbound` | Optional command hook for inbound messages. Treat this as security-sensitive. |

### `[logging]`

| Key | Description |
|---|---|
| `loglevel` | Log verbosity, 0-7. |

## Ratspeak app settings

Ratspeak does **not** use a hand-edited config file for app preferences. Display name, theme, auto-announce interval, Offline Inbox mode/manual node hash, notification preferences, and most UI state live in the SQLite database next to the app data and are managed through the Settings view.

Network interface definitions are written to the app-managed Reticulum config at `.ratspeak/reticulum/config` under the Ratspeak data directory, not to the user's system-wide `~/.reticulum/config`. Set `RATSPEAK_RNS_CONFIG_DIR` only when you intentionally want Ratspeak to use a different Reticulum config directory.

Transport Mode is stored as the app setting `transport_mode` with one of three values: `off`, `on`, or `auto`. The app presents these as **OFF**, **ON**, and **AUTO**. OFF is the default. ON maps to Reticulum `enable_transport = True` when the local runtime can perform forwarding. AUTO is an app policy: it enables only when there is an enabled non-LoRa interface, no enabled LoRa/RNode interface, and the current network is Wi-Fi, Ethernet, or an unknown desktop network type. Shared-instance clients do not perform local Transport Mode duties; the shared instance handles that role.

To reset, quit Ratspeak and remove the app data directory, then relaunch. The database will be recreated with defaults and a fresh identity.

The Reticulum stack inside Ratspeak uses `.ratspeak/reticulum/config` and app-private shared-instance ports `37430`/`37431`, separate from standalone rsReticulum defaults such as `~/.rsReticulum/config` and ports `37428`/`37429`. Two daemons can coexist on one host without conflict as long as their interface ports differ.

## Identity files

Identities are not configuration — they are 64-byte binary keys (32-byte X25519 private key + 32-byte Ed25519 seed). They cannot be edited in a text editor and must never be committed to source control or shared.

| Tool | Path |
|---|---|
| Ratspeak app | `<OS data dir>/org.ratspeak.desktop/.ratspeak/identities/<hash>/identity` (see [Install & Platform Setup](../getting-started/install-and-platform-setup) for the per-OS data directory) |
| Rust `rnsd-rs` | `~/.rsReticulum/storage/` by default, or the directory passed with `--config`. |
| Rust `lxmd-rs` | `~/.rsLXMF/identity` by default, with legacy `.lxmf/identity` fallback in rsLXMF, or the directory passed with `--config`. |

Back up the raw 64-byte file to preserve an identity across machines. Restoring is a file copy — no import step.
