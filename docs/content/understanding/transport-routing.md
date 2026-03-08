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

1. **Node A announces** its destination on all interfaces
2. **Transport Node T1** receives the announce, records "A is reachable through interface X with hop count 1"
3. **T1 re-broadcasts** the announce (incrementing hop count to 2)
4. **Transport Node T2** receives it, records "A is reachable through T1 with hop count 2"
5. Continue until announce reaches all reachable transport nodes

When **Node B** wants to send a packet to **Node A**:

1. B checks its path table for A's destination hash
2. If found: packet sent to the recorded next-hop neighbor
3. Each transport node forwards toward A using its own path table
4. If not found: B broadcasts a path request, or waits for A's next announce

<div class="docs-diagram">
<svg viewBox="0 0 700 180" xmlns="http://www.w3.org/2000/svg" fill="none">
  <defs>
    <marker id="arrowGreen" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#00D4AA"/>
    </marker>
    <marker id="arrowOrange" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#F59E0B"/>
    </marker>
  </defs>

  <!-- Node A -->
  <rect x="20" y="40" width="100" height="44" rx="10" fill="rgba(56,189,248,0.10)" stroke="#38BDF8" stroke-width="2"/>
  <text x="70" y="58" text-anchor="middle" font-family="Outfit" font-size="13" fill="#38BDF8">Node A</text>
  <text x="70" y="73" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="#7e8fa2">source</text>

  <!-- Transport T1 -->
  <rect x="200" y="40" width="120" height="44" rx="10" fill="rgba(245,158,11,0.10)" stroke="#F59E0B" stroke-width="2"/>
  <text x="260" y="58" text-anchor="middle" font-family="Outfit" font-size="13" fill="#F59E0B">Transport T1</text>
  <text x="260" y="73" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="#7e8fa2">hop 1</text>

  <!-- Transport T2 -->
  <rect x="390" y="40" width="120" height="44" rx="10" fill="rgba(245,158,11,0.10)" stroke="#F59E0B" stroke-width="2"/>
  <text x="450" y="58" text-anchor="middle" font-family="Outfit" font-size="13" fill="#F59E0B">Transport T2</text>
  <text x="450" y="73" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="#7e8fa2">hop 2</text>

  <!-- Node B -->
  <rect x="580" y="40" width="100" height="44" rx="10" fill="rgba(56,189,248,0.10)" stroke="#38BDF8" stroke-width="2"/>
  <text x="630" y="58" text-anchor="middle" font-family="Outfit" font-size="13" fill="#38BDF8">Node B</text>
  <text x="630" y="73" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="#7e8fa2">destination</text>

  <!-- Announce arrows (flowing right) -->
  <line x1="120" y1="50" x2="195" y2="50" stroke="#00D4AA" stroke-width="1.5" stroke-dasharray="6 3" marker-end="url(#arrowGreen)">
    <animate attributeName="stroke-dashoffset" from="18" to="0" dur="1.5s" repeatCount="indefinite"/>
  </line>
  <line x1="320" y1="50" x2="385" y2="50" stroke="#00D4AA" stroke-width="1.5" stroke-dasharray="6 3" marker-end="url(#arrowGreen)">
    <animate attributeName="stroke-dashoffset" from="18" to="0" dur="1.5s" repeatCount="indefinite"/>
  </line>
  <line x1="510" y1="50" x2="575" y2="50" stroke="#00D4AA" stroke-width="1.5" stroke-dasharray="6 3" marker-end="url(#arrowGreen)">
    <animate attributeName="stroke-dashoffset" from="18" to="0" dur="1.5s" repeatCount="indefinite"/>
  </line>

  <!-- Announce label -->
  <text x="350" y="22" text-anchor="middle" font-family="Outfit" font-size="11" fill="#00D4AA">Announce propagation</text>
  <line x1="200" y1="26" x2="500" y2="26" stroke="#00D4AA" stroke-width="0.5" stroke-dasharray="2 2"/>

  <!-- Packet arrows (flowing left) -->
  <line x1="575" y1="74" x2="515" y2="74" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="6 3" marker-end="url(#arrowOrange)">
    <animate attributeName="stroke-dashoffset" from="0" to="18" dur="1.5s" repeatCount="indefinite"/>
  </line>
  <line x1="385" y1="74" x2="325" y2="74" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="6 3" marker-end="url(#arrowOrange)">
    <animate attributeName="stroke-dashoffset" from="0" to="18" dur="1.5s" repeatCount="indefinite"/>
  </line>
  <line x1="195" y1="74" x2="125" y2="74" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="6 3" marker-end="url(#arrowOrange)">
    <animate attributeName="stroke-dashoffset" from="0" to="18" dur="1.5s" repeatCount="indefinite"/>
  </line>

  <!-- Packet label -->
  <text x="350" y="104" text-anchor="middle" font-family="Outfit" font-size="11" fill="#F59E0B">Packet delivery (reverse path)</text>
  <line x1="200" y1="97" x2="500" y2="97" stroke="#F59E0B" stroke-width="0.5" stroke-dasharray="2 2"/>

  <!-- Hop count labels -->
  <text x="160" y="134" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="#7e8fa2">hop 1</text>
  <text x="350" y="134" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="#7e8fa2">hop 2</text>
  <text x="545" y="134" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="#7e8fa2">hop 3</text>

  <!-- Legend -->
  <line x1="180" y1="160" x2="210" y2="160" stroke="#00D4AA" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="218" y="164" font-family="Outfit" font-size="10" fill="#7e8fa2">Announce (A → B)</text>
  <line x1="370" y1="160" x2="400" y2="160" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="408" y="164" font-family="Outfit" font-size="10" fill="#7e8fa2">Packet (B → A)</text>
</svg>
<figcaption>Routing step by step — announces flow outward, packets follow the reverse path</figcaption>
</div>

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
