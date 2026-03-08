# Bridging Networks

Connecting separate Reticulum networks together — linking a LoRa mesh to the internet, joining two communities, or creating redundant paths.

## What Is Bridging?

Bridging connects two or more separate network segments so that nodes on one segment can communicate with nodes on another. A bridge node has interfaces on both networks and forwards traffic between them.

<div class="docs-diagram">
<svg viewBox="0 0 700 180" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Network A -->
  <rect x="20" y="40" width="200" height="100" rx="12" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.05)"/>
  <text x="120" y="65" text-anchor="middle" fill="#38BDF8" font-family="Outfit" font-size="12" font-weight="600">LoRa Mesh</text>
  <circle cx="70" cy="105" r="12" stroke="#38BDF8" stroke-width="1" fill="rgba(56,189,248,0.08)"/>
  <circle cx="120" cy="115" r="12" stroke="#38BDF8" stroke-width="1" fill="rgba(56,189,248,0.08)"/>
  <circle cx="170" cy="100" r="12" stroke="#38BDF8" stroke-width="1" fill="rgba(56,189,248,0.08)"/>

  <!-- Bridge node -->
  <rect x="270" y="55" width="160" height="70" rx="10" stroke="#00D4AA" stroke-width="2" fill="rgba(0,212,170,0.10)"/>
  <text x="350" y="80" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="12" font-weight="600">Bridge Node</text>
  <text x="350" y="98" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">LoRa + TCP interfaces</text>
  <text x="350" y="112" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">transport enabled</text>

  <!-- Network B -->
  <rect x="480" y="40" width="200" height="100" rx="12" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.05)"/>
  <text x="580" y="65" text-anchor="middle" fill="#C084FC" font-family="Outfit" font-size="12" font-weight="600">TCP Network</text>
  <circle cx="530" cy="105" r="12" stroke="#C084FC" stroke-width="1" fill="rgba(192,132,252,0.08)"/>
  <circle cx="580" cy="115" r="12" stroke="#C084FC" stroke-width="1" fill="rgba(192,132,252,0.08)"/>
  <circle cx="630" cy="100" r="12" stroke="#C084FC" stroke-width="1" fill="rgba(192,132,252,0.08)"/>

  <!-- Connections -->
  <line x1="220" y1="90" x2="270" y2="90" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="4 2"/>
  <line x1="430" y1="90" x2="480" y2="90" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="4 2"/>
  <text x="245" y="82" text-anchor="middle" fill="#F59E0B" font-family="Outfit" font-size="8">LoRa</text>
  <text x="455" y="82" text-anchor="middle" fill="#F59E0B" font-family="Outfit" font-size="8">TCP</text>

  <text x="350" y="170" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="11" font-style="italic">Bridge node connects LoRa mesh to TCP network — traffic flows both ways</text>
</svg>
<figcaption>A bridge node with interfaces on two networks forwards traffic between them</figcaption>
</div>

## Common Bridging Scenarios

### LoRa Mesh to Internet

The most common bridge — connecting a local LoRa mesh to the wider internet-connected Reticulum network.

```ini
[reticulum]
  enable_transport = yes

[interfaces]
  [[LoRa Local]]
    type = RNodeInterface
    port = /dev/ttyUSB0
    frequency = 915000000
    bandwidth = 125000
    spreadingfactor = 9
    codingrate = 5
    txpower = 17
    mode = gateway
    enabled = yes

  [[Internet Uplink]]
    type = TCPClientInterface
    target_host = hub.example.com
    target_port = 4242
    mode = boundary
    enabled = yes
```

Key interface modes:
- **LoRa**: `gateway` — discovers paths for local radio clients
- **TCP**: `boundary` — prevents internet traffic from flooding the LoRa link

### Two LoRa Networks

Bridge two LoRa meshes operating on different frequencies or in different locations:

```ini
[reticulum]
  enable_transport = yes

[interfaces]
  [[LoRa 915 MHz]]
    type = RNodeInterface
    port = /dev/ttyUSB0
    frequency = 915000000
    bandwidth = 250000
    spreadingfactor = 9
    codingrate = 5
    txpower = 17
    enabled = yes

  [[LoRa 433 MHz]]
    type = RNodeInterface
    port = /dev/ttyUSB1
    frequency = 433000000
    bandwidth = 125000
    spreadingfactor = 12
    codingrate = 8
    txpower = 17
    enabled = yes
```

This requires two RNode devices on different serial ports (or an `RNodeMultiInterface` with dual-band hardware like the OpenCom XL).

### Two Communities via VPS

Connect two geographically separated community networks through a shared VPS:

```
[Community A]  <-- TCP -->  [VPS Bridge]  <-- TCP -->  [Community B]
```

The VPS runs rnsd with transport enabled and TCP server. Both communities connect as TCP clients.

## Interface Modes for Bridging

| Interface | Mode | Why |
|-----------|------|-----|
| Facing local LoRa clients | `gateway` | Discovers paths for simpler client devices |
| Facing internet/backbone | `boundary` | Prevents high-bandwidth traffic flooding low-bandwidth segment |
| Between equal segments | `full` | Standard bidirectional forwarding |
| Facing mobile devices | `access_point` | Fast path expiry for moving clients |

## Bandwidth Mismatch

When bridging fast and slow networks (e.g., TCP at megabits vs LoRa at kilobits), Reticulum's `boundary` mode prevents the fast network from overwhelming the slow one. Announces from the fast side are rate-limited before being forwarded to LoRa.

Additional rate control:

```ini
  [[LoRa Radio]]
    type = RNodeInterface
    announce_cap = 2
    announce_rate_target = 3600
    announce_rate_grace = 3
    announce_rate_penalty = 7200
    # ... other params
```

## Security

- All traffic crossing the bridge remains **end-to-end encrypted** — the bridge cannot read message contents
- Use **IFAC** (network_name + passphrase) to restrict which traffic crosses specific interfaces
- Transport nodes forward packets but cannot forge, modify, or decrypt them

## What's Next

- [Building Networks](../connecting/building-networks) — topology patterns and design
- [Interface Modes](../connecting/interface-modes) — gateway, boundary, access point
- [Community Mesh Network](../deployment/community-mesh) — multi-node deployment
- [Friend Group Chat Network](../deployment/friend-group-chat) — VPS hub setup
