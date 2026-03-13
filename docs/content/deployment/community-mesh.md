# Community Mesh Network

Build a neighborhood-scale mesh network mixing LoRa radios, WiFi, and internet connections — resilient communication that works even when infrastructure fails.

## What You'll Build

A multi-node mesh network covering a neighborhood or community:

- **Transport nodes** on rooftops or elevated positions with LoRa radios
- **Internet backbone** via TCP connections between fixed nodes
- **Client devices** — phones, laptops, RatDecks connecting to the mesh
- **Propagation nodes** storing messages for offline participants

## Network Architecture

A community mesh uses multiple interconnected Transport Nodes to cover a geographic area. Each Transport Node relays traffic for the whole network. Typical node roles include:

- **Backbone nodes** — high-power LoRa stations on rooftops or towers, connected to each other via TCP or long-range radio links
- **Gateway nodes** — bridge between LoRa radio and TCP/internet, allowing remote participants to join
- **Edge nodes** — end-user devices (phones, laptops, RatDecks) that connect to the nearest backbone or gateway node
- **Propagation nodes** — store and forward LXMF messages for offline users, ensuring delivery even when recipients are temporarily unreachable

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
