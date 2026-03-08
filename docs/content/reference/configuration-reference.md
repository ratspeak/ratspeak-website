# Configuration Reference

Complete reference for all Ratspeak and Reticulum configuration options.

## Ratspeak Configuration

Ratspeak reads its dashboard config from `ratspeak.conf` (located in the dashboard directory). All values can be overridden with environment variables using the pattern `RATSPEAK_SECTION_KEY`.

### [server] Section

| Option | Default | Env Override | Description |
|--------|---------|-------------|-------------|
| `port` | `5050` | `RATSPEAK_SERVER_PORT` | HTTP port for the dashboard |
| `host` | `127.0.0.1` | `RATSPEAK_SERVER_HOST` | Bind address (`0.0.0.0` for all interfaces) |
| `api_token` | (none) | `RATSPEAK_SERVER_API_TOKEN` | Bearer token for API authentication |

### [nodes] Section

| Option | Default | Description |
|--------|---------|-------------|
| `directory` | `nodes` | Directory containing RNS node configs |
| `hub_node` | `node_1` | Primary node name |

### [dashboard] Section

| Option | Default | Description |
|--------|---------|-------------|
| `poll_interval` | `1.5` | RNS stats polling interval (seconds) |
| `max_log_entries` | `200` | Maximum event log entries in memory |
| `status_summary_interval` | `300` | Status broadcast interval (seconds) |
| `max_nodes` | `99` | Maximum nodes in topology graph |
| `path_age_reachable` | `1800` | Path freshness threshold (seconds, 30 min) |
| `path_age_stale` | `3600` | Path staleness threshold (seconds, 60 min) |

### Example ratspeak.conf

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
```

---

## Reticulum Configuration

Reticulum reads its config from `~/.reticulum/config` (or the path specified by `RATSPEAK_RNS_CONFIG_DIR`). The file uses INI format.

### [reticulum] Section

| Option | Default | Description |
|--------|---------|-------------|
| `enable_transport` | `No` | Enable packet forwarding for other nodes |
| `share_instance` | `Yes` | Run as shared instance (owns interfaces, serves RPC) |
| `shared_instance_port` | `38005` | RPC server port for client connections |
| `instance_control_port` | `38006` | Control port |
| `panic_on_interface_error` | `No` | Halt on interface failure |
| `respond_to_probes` | `No` | Respond to network probe requests |
| `use_implicit_proof` | `Yes` | Automatically send delivery proofs |
| `enable_remote_management` | `No` | Allow remote node management |
| `remote_management_allowed` | (none) | Comma-separated identity hashes for remote management |
| `link_mtu_discovery` | `Yes` | Enable MTU discovery on links |

### [logging] Section

| Option | Default | Description |
|--------|---------|-------------|
| `loglevel` | `4` | Log verbosity: 1 (ERROR) through 7 (TRACE) |

### [interfaces] Section

Each interface is defined as a subsection with double brackets:

```ini
[[Interface Name]]
    type = InterfaceType
    enabled = Yes
    # Type-specific options...
```

#### Common Interface Options

| Option | Applies To | Description |
|--------|-----------|-------------|
| `enabled` | All | Enable/disable the interface |
| `mode` | All | Interface mode (see below) |
| `network_name` | All | IFAC network name (interface access code) |
| `passphrase` | All | IFAC passphrase |
| `announce_cap` | All | Max % of bandwidth for announces (default: 2) |
| `bitrate` | All | Interface bitrate in bps (for rate calculations) |

#### Interface Modes

| Mode | Description |
|------|-------------|
| `full` | Bidirectional routing, rebroadcasts announces (default) |
| `gateway` | Connects distinct segments, routes between them |
| `access_point` | Serves clients, suppresses rebroadcasts, short path expiry |
| `roaming` | Mobile client mode |
| `boundary` | Edge of segment, limited rebroadcasting |

---

### TCPClientInterface

Connect to a remote TCP server.

```ini
[[Remote Hub]]
    type = TCPClientInterface
    target_host = hub.example.com
    target_port = 4242
    enabled = Yes
```

| Option | Required | Description |
|--------|----------|-------------|
| `target_host` | Yes | Hostname or IP to connect to |
| `target_port` | Yes | TCP port |
| `kiss_framing` | No | Use KISS framing (default: No) |

### TCPServerInterface

Accept incoming TCP connections.

```ini
[[TCP Server]]
    type = TCPServerInterface
    listen_ip = 0.0.0.0
    listen_port = 4242
    enabled = Yes
```

| Option | Required | Description |
|--------|----------|-------------|
| `listen_ip` | Yes | Bind address |
| `listen_port` | Yes | Listen port |

### UDPInterface

UDP broadcast for LAN discovery.

```ini
[[UDP LAN]]
    type = UDPInterface
    listen_ip = 0.0.0.0
    listen_port = 4242
    forward_ip = 255.255.255.255
    forward_port = 4242
    enabled = Yes
```

| Option | Required | Description |
|--------|----------|-------------|
| `listen_ip` | Yes | Bind address |
| `listen_port` | Yes | Listen port |
| `forward_ip` | Yes | Broadcast address |
| `forward_port` | Yes | Forward port |

### AutoInterface

Zero-configuration LAN/WiFi discovery using multicast.

```ini
[[WiFi Discovery]]
    type = AutoInterface
    enabled = Yes
```

| Option | Required | Description |
|--------|----------|-------------|
| `group_id` | No | Multicast group (default: Reticulum default) |
| `discovery_scope` | No | `link` (LAN only) or `admin` (wider) |
| `discovery_port` | No | Multicast port |
| `data_port` | No | Data transfer port |
| `allowed_interfaces` | No | Comma-separated OS interface names |
| `ignored_interfaces` | No | Comma-separated OS interface names to skip |

### RNodeInterface

Connect to an RNode LoRa radio.

```ini
[[LoRa Radio]]
    type = RNodeInterface
    port = /dev/ttyUSB0
    frequency = 915000000
    bandwidth = 125000
    spreadingfactor = 9
    codingrate = 5
    txpower = 17
    enabled = Yes
```

| Option | Required | Description |
|--------|----------|-------------|
| `port` | Yes | Serial port path |
| `frequency` | Yes | Center frequency in Hz |
| `bandwidth` | Yes | Bandwidth in Hz (7800-500000) |
| `spreadingfactor` | Yes | LoRa spreading factor (5-12) |
| `codingrate` | Yes | LoRa coding rate (5-8, meaning 4/5 to 4/8) |
| `txpower` | No | Transmit power in dBm |
| `flow_control` | No | Hardware flow control (default: No) |

### SerialInterface

Direct serial connection.

```ini
[[Serial Link]]
    type = SerialInterface
    port = /dev/ttyUSB0
    speed = 115200
    databits = 8
    parity = none
    stopbits = 1
    enabled = Yes
```

### KISSInterface

KISS-framed serial connection (for TNCs).

```ini
[[Packet TNC]]
    type = KISSInterface
    port = /dev/ttyUSB0
    speed = 9600
    kissframing = True
    enabled = Yes
```

### I2PInterface

Anonymous networking via I2P.

```ini
[[I2P Tunnel]]
    type = I2PInterface
    peers = i2p-destination-hash.b32.i2p
    enabled = Yes
```

| Option | Required | Description |
|--------|----------|-------------|
| `peers` | No | Comma-separated I2P destination addresses |
| `connectable` | No | Accept inbound connections (default: No) |

---

## Rate Limiting Options

These options control announce and traffic rate limiting on any interface:

| Option | Default | Description |
|--------|---------|-------------|
| `announce_cap` | `2` | Max % of bandwidth for announces |
| `announce_rate_target` | (none) | Target announce interval in seconds |
| `announce_rate_grace` | (none) | Grace announcements before rate limiting |
| `announce_rate_penalty` | (none) | Penalty interval for rate limit violators |
| `airtime_limit_short` | (none) | Max % transmit time over ~15 seconds |
| `airtime_limit_long` | (none) | Max % transmit time over ~60 minutes |

## IFAC (Interface Access Codes)

Restrict which traffic can use an interface:

```ini
[[Private LoRa]]
    type = RNodeInterface
    network_name = MyNetwork
    passphrase = secret-passphrase
    # ... other options
```

Only nodes with the same `network_name` + `passphrase` can communicate on this interface. Traffic is HMAC-verified and rejected if the IFAC doesn't match.

## What's Next

- [Troubleshooting](../reference/troubleshooting) — common issues and solutions
- [Ratspeak-py Backend](../developer/ratspeak-py) — Python config handling
- [Interface Types Overview](../connecting/interface-types-overview) — interface setup guides
