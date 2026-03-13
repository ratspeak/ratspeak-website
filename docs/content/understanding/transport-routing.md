# Transport & Routing

How packets travel across the Reticulum mesh — transport nodes, path discovery, announce propagation, and blind forwarding.

## Transport Nodes vs Instances

Every Reticulum node is either a **regular instance** or a **transport node**:

| Type | Config | Role |
|------|--------|------|
| **Instance** | `enable_transport = No` (default) | Endpoint only — sends and receives its own traffic |
| **Transport Node** | `enable_transport = Yes` | Active router — forwards packets for other nodes |

### When to Enable Transport

Enable transport on nodes that are:

- **Fixed and persistent** — always-on servers, Raspberry Pis, VPS instances
- **Well-connected** — multiple interfaces, central network position
- **Reliable** — stable power, reliable connectivity

Do **not** enable transport on:

- Mobile devices (unstable paths degrade convergence)
- Intermittent connections (route flapping wastes bandwidth)
- Low-resource devices (transport tables consume memory)

> **Tip**: Too many transport nodes on low-bandwidth links (like LoRa) waste capacity with routing overhead. Start with one or two transport nodes and add more only as your network grows.

## How Routing Works

Reticulum routing is based on **announce propagation** — there's no routing protocol running in the background. Nodes learn paths by observing announces as they flow through the network.

### Step by Step

1. **Node A announces** its destination on all interfaces (hop count 0)
2. **Transport Node T1** receives the announce, records "A is reachable through interface X"
3. **T1 re-broadcasts** the announce with hop count incremented to 1
4. **Transport Node T2** receives it, records "A is reachable through T1"
5. **T2 re-broadcasts** with hop count incremented to 2, and so on until all reachable transport nodes are reached

When **Node B** wants to send a packet to **Node A**:

1. B checks its path table for A's destination hash
2. If found: packet sent to the recorded next-hop neighbor
3. Each transport node forwards toward A using its own path table
4. If not found: B broadcasts a path request, or waits for A's next announce

### Path Table

Each node maintains a local path table mapping destination hashes to forwarding info:

| Destination Hash | Next Hop | Hop Count | Interface |
|-----------------|----------|-----------|-----------|
| `4faf1b2e...` | Neighbor X | 2 | LoRa |
| `a3c7e901...` | Neighbor Y | 1 | TCP |

Entries are updated when announces arrive with lower hop counts (better paths).

## Announce Propagation Rules

Announces follow strict rules to prevent flooding:

| Rule | Detail |
|------|--------|
| **Duplicate detection** | Same destination hash with same or higher hop count → dropped |
| **Hop limit** | Maximum 128 hops (configurable) |
| **Rate limiting** | Max 2% of interface bandwidth for announce traffic |
| **Randomized delays** | Re-broadcasts delayed randomly to prevent synchronization |
| **Priority** | Low hop count (nearby) announces re-transmitted before distant ones |
| **Retransmissions** | Up to 2 retransmission attempts per announce |

## Blind Forwarding

Transport nodes forward packets **without knowing who is communicating**:

- Packets carry only the **destination hash** — no source address
- Transport nodes match the destination hash against their path table
- Forward to the recorded next-hop neighbor
- Cannot identify the sender
- Cannot read the encrypted payload
- Cannot build communication graphs

This is a fundamental privacy property — routing happens without revealing communication patterns.

## Packet Prioritization

When multiple packets compete for transmission, Reticulum prioritizes them:

1. **Link keepalives and transport management** (highest)
2. **Link establishment**
3. **Proofs and receipts**
4. **Data packets**
5. **Announces** (lowest — rate-limited)

This ensures operational traffic isn't disrupted by announce propagation, especially on slow links.

## Path Discovery

When a destination isn't in the path table:

### Active Discovery
Send a **path request** — a broadcast asking "who knows how to reach destination X?" Any transport node with a matching path table entry (or the destination itself) responds.

### Passive Discovery
Wait for the destination to **announce** itself. Periodic announces (e.g., every 5 minutes in Ratspeak) ensure all active destinations are eventually discoverable.

## Convergence

Reticulum networks converge **without central coordination**:

- New nodes announce themselves and are immediately discoverable
- Adding a new link (LoRa, TCP, WiFi) automatically integrates into the routing
- Removing a link causes path entries to expire naturally
- No subnet planning, no address allocation, no DNS

Even very slow networks (5 bps) eventually reach convergence — Reticulum is designed for graceful degradation.

## What's Next

- [Destinations & Addressing](../understanding/destinations-addressing) — how addresses work
- [Links & Communication](../understanding/links-and-communication) — encrypted channels
- [Protocol Architecture](../understanding/protocol-architecture) — overall system design
- [Building Networks](../connecting/building-networks) — practical topology patterns
