# Bridging Networks

Connecting separate Reticulum networks together — linking a LoRa mesh to the internet, joining two communities, or creating redundant paths.

## What Is Bridging?

Bridging connects two or more separate network segments so that nodes on one segment can communicate with nodes on another. A bridge node has interfaces on both networks and forwards traffic between them. For example, a node with both a LoRa radio and a TCP connection can relay packets from a local radio mesh to the wider internet-connected Reticulum network, and vice versa. The bridge must have `enable_transport = yes` to forward packets.

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
