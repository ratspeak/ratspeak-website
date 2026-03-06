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

<div class="docs-diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Full -->
  <rect x="20" y="20" width="130" height="100" rx="8" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.06)"/>
  <text x="85" y="44" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="12" font-weight="600">full</text>
  <text x="85" y="64" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="10">All features active</text>
  <text x="85" y="80" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Announces: normal</text>
  <text x="85" y="94" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Paths: normal</text>
  <text x="85" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Transport: yes</text>

  <!-- Gateway -->
  <rect x="170" y="20" width="130" height="100" rx="8" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.06)"/>
  <text x="235" y="44" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="12" font-weight="600">gateway</text>
  <text x="235" y="64" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="10">Discovers for others</text>
  <text x="235" y="80" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Announces: normal</text>
  <text x="235" y="94" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Paths: discovers for clients</text>
  <text x="235" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Transport: yes</text>

  <!-- Access Point -->
  <rect x="320" y="20" width="130" height="100" rx="8" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.06)"/>
  <text x="385" y="44" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="12" font-weight="600">access_point</text>
  <text x="385" y="64" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="10">Serving clients</text>
  <text x="385" y="80" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Announces: not auto-broadcast</text>
  <text x="385" y="94" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Paths: fast expiry</text>
  <text x="385" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Transport: yes</text>

  <!-- Roaming -->
  <rect x="470" y="20" width="100" height="100" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.06)"/>
  <text x="520" y="44" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="12" font-weight="600">roaming</text>
  <text x="520" y="64" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="10">Mobile device</text>
  <text x="520" y="80" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Announces: normal</text>
  <text x="520" y="94" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Paths: faster expiry</text>
  <text x="520" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Transport: no</text>

  <!-- Boundary -->
  <rect x="590" y="20" width="100" height="100" rx="8" stroke="#FF6B6B" stroke-width="1.5" fill="rgba(255,107,107,0.06)"/>
  <text x="640" y="44" text-anchor="middle" fill="#FF6B6B" font-family="JetBrains Mono" font-size="12" font-weight="600">boundary</text>
  <text x="640" y="64" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="10">Network edge</text>
  <text x="640" y="80" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Connects different</text>
  <text x="640" y="94" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">network segments</text>
  <text x="640" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Transport: yes</text>

  <!-- Example scenario -->
  <text x="350" y="160" text-anchor="middle" fill="#e2e8f0" font-family="Outfit" font-size="12" font-weight="600">Example: Gateway + Roaming Setup</text>

  <!-- Gateway node -->
  <rect x="120" y="180" width="120" height="50" rx="8" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.08)"/>
  <text x="180" y="202" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="10" font-weight="600">Base Station</text>
  <text x="180" y="218" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">mode = gateway</text>

  <!-- Roaming nodes -->
  <rect x="340" y="180" width="100" height="40" rx="6" stroke="#C084FC" stroke-width="1" fill="rgba(192,132,252,0.06)"/>
  <text x="390" y="202" text-anchor="middle" fill="#C084FC" font-family="Outfit" font-size="9">Phone (roaming)</text>

  <rect x="340" y="230" width="100" height="40" rx="6" stroke="#C084FC" stroke-width="1" fill="rgba(192,132,252,0.06)"/>
  <text x="390" y="252" text-anchor="middle" fill="#C084FC" font-family="Outfit" font-size="9">Vehicle (roaming)</text>

  <!-- Connections -->
  <line x1="240" y1="200" x2="340" y2="200" stroke="#3a4759" stroke-width="1" stroke-dasharray="4 3"/>
  <line x1="240" y1="210" x2="340" y2="250" stroke="#3a4759" stroke-width="1" stroke-dasharray="4 3"/>

  <!-- Internet side -->
  <rect x="480" y="180" width="120" height="50" rx="8" stroke="#FF6B6B" stroke-width="1" fill="rgba(255,107,107,0.06)"/>
  <text x="540" y="202" text-anchor="middle" fill="#FF6B6B" font-family="JetBrains Mono" font-size="10" font-weight="600">Internet Link</text>
  <text x="540" y="218" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">mode = boundary</text>

  <line x1="240" y1="195" x2="120" y2="195" stroke="#3a4759" stroke-width="1" stroke-dasharray="4 3"/>
  <text x="30" y="198" fill="#7e8fa2" font-family="Outfit" font-size="9">LoRa</text>
</svg>
<figcaption>Interface modes control how each interface participates in the network</figcaption>
</div>

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

## Next Steps

- [Interface Types Overview](../connecting/interface-types-overview) — compare all interfaces
- [Building Networks](../connecting/building-networks) — topology design
- [Protocol Architecture](../understanding/protocol-architecture) — how routing works
