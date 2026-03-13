# Interface Modes

Controlling how interfaces participate in the network — modes, access codes, and announce rate control.

## Interface Modes

Each interface can operate in one of five modes, controlling how it handles packet forwarding, announce propagation, and path discovery:

| Mode | Description | Use Case |
|------|-------------|----------|
| **`full`** | All discovery, meshing, and transport | Default — standard participation |
| **`gateway`** | Like full, plus discovers paths for other nodes | Gateway facing client devices |
| **`access_point`** | Network access point, fast path expiry | Serving mobile/roaming clients |
| **`roaming`** | For mobile interfaces, faster path expiry | Phones, vehicles, portable devices |
| **`boundary`** | Connects different network segments | LoRa node with internet uplink |

### Gateway Mode

The gateway mode's key feature: the interface **facing the clients** must be in gateway mode. This interface actively discovers unknown paths on behalf of connected nodes, allowing simpler client devices to rely on the gateway for path resolution.

### Boundary Mode

Use boundary mode when an interface connects to a significantly different network segment. For example, a LoRa node that also has an internet TCP connection should set the TCP interface to `boundary` mode. This helps Reticulum make better routing decisions.

## IFAC — Interface Access Codes

Create virtual private networks on shared mediums using passphrase-based access control:

```ini
[[Private LoRa]]
  type = RNodeInterface
  network_name = my-private-network
  passphrase = my-secret-passphrase
  ifac_size = 16
  # ... other params
```

How IFAC works:

1. A shared Ed25519 signing identity is derived from the passphrase
2. Per-packet signatures are generated and inserted before transmission
3. Nodes without the correct passphrase silently drop packets
4. Signature size is configurable (`ifac_size`: 8–512 bits)

> **Tip**: IFAC is ideal for creating isolated mesh networks on shared LoRa frequencies — nodes without the passphrase can't even see your traffic.

## Announce Rate Control

Control how often announces are re-broadcast on an interface:

| Parameter | Description |
|-----------|-------------|
| `announce_cap` | Max % of bandwidth for announce propagation (default: 2%) |
| `announce_rate_target` | Min seconds between re-broadcasting any one destination |
| `announce_rate_grace` | Number of violations before target is enforced |
| `announce_rate_penalty` | Extra seconds added once rate limit kicks in |

These are critical for low-bandwidth interfaces like LoRa, where announce traffic can easily consume the channel.

## Ingress Control

Public-facing interfaces have automatic rate limiting for new destinations:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `ingress_control` | `true` | Enable automatic rate limiting |
| `ic_burst_freq_new` | 3.5/s | Max rate for newly discovered interfaces |
| `ic_burst_freq` | 12/s | Max rate for established interfaces |
| `ic_new_time` | 7200s | How long an interface is considered "new" |
| `ic_max_held_announces` | 256 | Maximum held announces per destination |
| `ic_burst_hold` | 60s | Time to hold announces during burst |
| `ic_burst_penalty` | 300s | Extra delay after burst violation |
| `ic_held_release_interval` | 30s | Interval for releasing held announces |

## Mode Abbreviations

In config files, you can use short abbreviations for interface modes: `ap` for `access_point`, `gw` for `gateway`.

## What's Next

- [Interface Types Overview](../connecting/interface-types-overview) — compare all interfaces
- [Building Networks](../connecting/building-networks) — topology design
- [Protocol Architecture](../understanding/protocol-architecture) — how routing works
