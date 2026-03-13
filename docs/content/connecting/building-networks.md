# Building Networks

Network topology patterns, mixing hardware types, and growing a Reticulum mesh from scratch.

## Transport Nodes vs Instances

The most important architectural decision is which nodes should be **Transport Nodes**:

| Type | Config | Role | Requirements |
|------|--------|------|-------------|
| **Instance** | `enable_transport = No` | End-user device, sends/receives | None — works anywhere |
| **Transport Node** | `enable_transport = Yes` | Forwards packets, routes announces | Should be fixed, persistent, reliable |

Not every node should be a transport node:

- **Resource consumption** — transport nodes maintain path tables and process all announces
- **Stability** — unstable transport nodes degrade network convergence
- **Bandwidth** — too many transport nodes on low-bandwidth mediums consume capacity with routing overhead

> **Tip**: A good rule of thumb: always-on, well-connected nodes should be transport nodes. Mobile or intermittent nodes should remain instances.

## Topology Patterns

### Star
One central transport node, all others connect directly. Simple but single point of failure.

### Mesh
Multiple interconnected transport nodes. Resilient — traffic finds alternative paths if one node goes down.

### Hierarchical
Tiered structure with backbone transport nodes and leaf instances. Good for organized deployments.

### Backbone + Access
High-speed TCP backbone connecting transport nodes, with LoRa radio interfaces for last-mile access. Best of both worlds.

## Mixing Hardware Types

Reticulum's greatest strength is seamless medium mixing:

- **WiFi backbone + LoRa access** — high-speed core with long-range radio edges
- **TCP internet + LoRa local** — global reach with off-grid local mesh
- **Ethernet infrastructure + BLE last-meter** — wired backbone with wireless device connections

Interface modes help manage the boundaries:
- Set the internet-facing interface to `boundary` mode
- Set LoRa-facing interfaces to `gateway` mode to serve client devices
- Use `roaming` mode for mobile nodes

## Starting Small

Begin with two nodes on the same WiFi (AutoInterface). Add TCP connections to reach remote nodes. Add LoRa for off-grid capability. The network grows organically — no coordination required.

Each new node autonomously generates destinations and discovers peers. No central planning, no address allocation, no DNS registration.

## Trustless Open Access

Reticulum's encryption model means you can safely run **open-access networks**:

- All traffic is encrypted with ephemeral keys — no inspection possible
- No source addresses — sender anonymity by default
- Unforgeable delivery confirmations — cryptographic proof of receipt
- IFAC for private segments on shared mediums

Participants on the same network cannot interfere with each other's private communication.

## What's Next

- [Interface Modes](../connecting/interface-modes) — configure interface behavior
- [Protocol Architecture](../understanding/protocol-architecture) — how routing works
- [Security Model](../understanding/security-model) — trustless design
