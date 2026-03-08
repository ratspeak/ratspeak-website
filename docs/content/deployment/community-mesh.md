# Community Mesh Network

Build a neighborhood-scale mesh network mixing LoRa radios, WiFi, and internet connections — resilient communication that works even when infrastructure fails.

## What You'll Build

A multi-node mesh network covering a neighborhood or community:

- **Transport nodes** on rooftops or elevated positions with LoRa radios
- **Internet backbone** via TCP connections between fixed nodes
- **Client devices** — phones, laptops, RatDecks connecting to the mesh
- **Propagation nodes** storing messages for offline participants

## Network Architecture

<div class="docs-diagram">
<svg viewBox="0 0 700 260" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Backbone -->
  <text x="350" y="24" text-anchor="middle" fill="#e2e8f0" font-family="Outfit" font-size="13" font-weight="600">Community Mesh — Backbone + Coverage</text>

  <!-- Transport nodes -->
  <rect x="60" y="60" width="120" height="55" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.08)"/>
  <text x="120" y="82" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="10" font-weight="600">North Tower</text>
  <text x="120" y="100" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">LoRa + TCP transport</text>

  <rect x="290" y="60" width="120" height="55" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.08)"/>
  <text x="350" y="82" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="10" font-weight="600">Central Hub</text>
  <text x="350" y="100" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Propagation + TCP</text>

  <rect x="520" y="60" width="120" height="55" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.08)"/>
  <text x="580" y="82" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="10" font-weight="600">South Tower</text>
  <text x="580" y="100" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">LoRa + TCP transport</text>

  <!-- Backbone links -->
  <line x1="180" y1="87" x2="290" y2="87" stroke="#C084FC" stroke-width="2"/>
  <line x1="410" y1="87" x2="520" y2="87" stroke="#C084FC" stroke-width="2"/>
  <text x="235" y="78" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="8">TCP</text>
  <text x="465" y="78" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="8">TCP</text>

  <!-- Client devices -->
  <circle cx="80" cy="180" r="18" stroke="#38BDF8" stroke-width="1" fill="rgba(56,189,248,0.08)"/>
  <text x="80" y="184" text-anchor="middle" fill="#38BDF8" font-family="Outfit" font-size="8">Laptop</text>

  <circle cx="160" cy="200" r="18" stroke="#F59E0B" stroke-width="1" fill="rgba(245,158,11,0.08)"/>
  <text x="160" y="204" text-anchor="middle" fill="#F59E0B" font-family="Outfit" font-size="8">RatDeck</text>

  <circle cx="350" cy="190" r="18" stroke="#00D4AA" stroke-width="1" fill="rgba(0,212,170,0.08)"/>
  <text x="350" y="194" text-anchor="middle" fill="#00D4AA" font-family="Outfit" font-size="8">Phone</text>

  <circle cx="540" cy="200" r="18" stroke="#38BDF8" stroke-width="1" fill="rgba(56,189,248,0.08)"/>
  <text x="540" y="204" text-anchor="middle" fill="#38BDF8" font-family="Outfit" font-size="8">RatCom</text>

  <circle cx="620" cy="180" r="18" stroke="#F59E0B" stroke-width="1" fill="rgba(245,158,11,0.08)"/>
  <text x="620" y="184" text-anchor="middle" fill="#F59E0B" font-family="Outfit" font-size="8">Pi Node</text>

  <!-- LoRa coverage arcs -->
  <path d="M120 115 Q120 150 80 165" stroke="#F59E0B" stroke-width="1" stroke-dasharray="3 2" fill="none"/>
  <path d="M120 115 Q140 150 160 185" stroke="#F59E0B" stroke-width="1" stroke-dasharray="3 2" fill="none"/>
  <path d="M580 115 Q560 150 540 185" stroke="#F59E0B" stroke-width="1" stroke-dasharray="3 2" fill="none"/>
  <path d="M580 115 Q600 150 620 165" stroke="#F59E0B" stroke-width="1" stroke-dasharray="3 2" fill="none"/>
  <path d="M350 115 Q350 150 350 175" stroke="#F59E0B" stroke-width="1" stroke-dasharray="3 2" fill="none"/>

  <text x="350" y="245" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10" font-style="italic">TCP backbone between towers, LoRa radio for local coverage</text>
</svg>
<figcaption>Community mesh: fixed transport nodes connected by TCP, LoRa radios providing coverage to client devices</figcaption>
</div>

## Planning Your Network

### Choose Transport Node Locations

Transport nodes should be:

- **Elevated** — rooftops, towers, tall buildings
- **Always-on** — reliable power, persistent internet (if using TCP backbone)
- **Well-connected** — line-of-sight to other transport nodes and the area they serve

### Hardware Per Transport Node

| Component | Purpose | Cost |
|-----------|---------|------|
| Raspberry Pi (or similar SBC) | Runs rnsd + Reticulum | ~$35–60 |
| LoRa RNode (e.g., T-Beam Supreme) | Radio coverage | ~$35–50 |
| High-gain antenna (collinear) | Maximize coverage area | ~$20–40 |
| Weatherproof enclosure | Outdoor protection | ~$15–25 |
| PoE splitter or battery + solar | Power | Varies |

### Transport Node Configuration

```ini
[reticulum]
  enable_transport = yes
  share_instance = yes

[interfaces]
  [[LoRa Coverage]]
    type = RNodeInterface
    port = /dev/ttyUSB0
    frequency = 915000000
    bandwidth = 125000
    spreadingfactor = 9
    codingrate = 5
    txpower = 17
    mode = gateway
    enabled = yes

  [[Backbone TCP]]
    type = TCPClientInterface
    target_host = central-hub.local
    target_port = 4242
    mode = boundary
    enabled = yes
```

Key settings:
- **LoRa interface**: `mode = gateway` — discovers paths for client devices
- **TCP backbone**: `mode = boundary` — prevents flooding LoRa from TCP traffic
- **transport enabled** — relays packets for the network

### Private Networks with IFAC

To keep your community mesh isolated from other Reticulum traffic on the same frequency:

```ini
  [[LoRa Coverage]]
    type = RNodeInterface
    network_name = our-neighborhood-mesh
    passphrase = shared-secret-phrase
    # ... other params
```

All nodes must use the same `network_name` and `passphrase`.

## Growth Path

1. **Start with 2 nodes** on the same WiFi (AutoInterface)
2. **Add TCP** — connect a VPS or remote friend
3. **Add LoRa** — plug in an RNode for radio coverage
4. **Add transport nodes** — deploy elevated Raspberry Pi + RNode combos
5. **Enable propagation** — store messages for offline participants

## What's Next

- [Emergency Communications](../deployment/emergency-comms) — infrastructure-independent setup
- [Raspberry Pi Gateway](../deployment/raspberry-pi-gateway) — detailed Pi setup
- [Building Networks](../connecting/building-networks) — topology patterns
- [Interface Modes](../connecting/interface-modes) — gateway, boundary, and roaming
