# WiFi & LAN

Zero-configuration local network discovery with AutoInterface — connecting nodes on the same network segment.

## How AutoInterface Works

AutoInterface uses **IPv6 multicast peer discovery** and **UDP transport** to automatically find other Reticulum nodes on the same local network. No IP configuration, no port forwarding, no manual setup.

When you enable AutoInterface:

1. Your node starts broadcasting discovery beacons via IPv6 multicast
2. Other nodes on the same network respond
3. A direct UDP communication channel is established
4. Announces and packets flow automatically

This works on WiFi, wired Ethernet, and any network that supports IPv6 multicast.

## Enabling in Ratspeak

1. Navigate to the **Network** section
2. Toggle **AutoInterface** on

That's it. Any other Reticulum node with AutoInterface enabled on the same network will be discovered.

## Required Ports

AutoInterface uses two UDP ports:

| Port | Purpose |
|------|---------|
| **29716** | Discovery |
| **42671** | Data transport |

If you have a firewall, ensure these ports allow local UDP traffic:

```bash
# Linux (ufw)
sudo ufw allow 29716/udp
sudo ufw allow 42671/udp
```

## Configuration Options

For advanced setups, AutoInterface supports these parameters in the config file:

```ini
[[Local WiFi]]
  type = AutoInterface
  enabled = yes
  group_id = reticulum
  discovery_scope = link
```

> **Note**: The default `group_id` is `reticulum`. Using a different `group_id` creates an isolated network that won't discover default-configured Reticulum nodes.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `group_id` | `reticulum` | Isolated network group name — nodes must share the same group_id to discover each other |
| `discovery_scope` | `link` | Multicast scope: `link`, `admin`, `site`, `organisation`, `global` |
| `discovery_port` | `29716` | Custom discovery port |
| `data_port` | `42671` | Custom data port |
| `devices` | *(all)* | Restrict to specific network devices |
| `ignored_devices` | *(none)* | Exclude specific network devices |
| `multicast_address_type` | `temporary` | IPv6 multicast address type: `temporary` or `permanent` |

### Isolated Networks with `group_id`

To create isolated networks on the same physical LAN, use different `group_id` values:

```ini
# Network A
[[Team Alpha]]
  type = AutoInterface
  group_id = team-alpha-mesh

# Network B (separate, won't see Team Alpha)
[[Team Bravo]]
  type = AutoInterface
  group_id = team-bravo-mesh
```

### Discovery Scope

| Scope | Range | Use Case |
|-------|-------|----------|
| `link` | Same network segment | Default, local LAN |
| `admin` | Administrative domain | Building-wide |
| `site` | Campus/site | Multi-building |
| `organisation` | Organization | Enterprise |
| `global` | All reachable | Wide-area multicast |

## Limitations

- Requires IPv6 link-local addressing (`fe80::`) enabled on network interfaces
- Both nodes must be on the same network segment (or within multicast reach)
- Some managed switches and WiFi access points block multicast traffic
- VPNs may not support IPv6 multicast

## Next Steps

- [Interface Types Overview](../connecting/interface-types-overview) — compare all interfaces
- [BLE Mesh](../connecting/ble-mesh) — Bluetooth peer-to-peer
- [TCP Connections](../connecting/tcp-connections) — remote connections
