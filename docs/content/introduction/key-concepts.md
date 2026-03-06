# Key Concepts

Essential terminology for understanding Reticulum and Ratspeak, grouped by theme.

## Networking

### Destination
The fundamental addressing unit in Reticulum. A **16-byte truncated SHA-256 hash** derived from a cryptographic identity's public key and an application-specific name. Replaces IP addresses entirely. Displayed as hex: `<13425ec15b621c1d928589718000d814>`.

Four types exist:
- **Single** — asymmetric encryption, multi-hop capable (most common)
- **Plain** — unencrypted broadcast, direct only
- **Group** — symmetric encryption with shared key, direct only
- **Link** — encrypted bidirectional channel with forward secrecy

### Announce
A broadcast packet containing a destination's public key and optional application data, signed to prove key ownership. Announces propagate through the network, building path tables so other nodes know how to reach you. Rate-limited to 2% of interface bandwidth by default.

### Transport Node
A Reticulum instance with `enable_transport = Yes`. Transport nodes forward packets, propagate announces, maintain path tables, and serve path requests. They should be fixed, persistently available systems. Regular instances only send and receive — they don't forward.

### Interface
A configured communication channel — LoRa radio, TCP socket, WiFi auto-discovery, serial port, etc. Each interface connects your node to other nodes or network segments. Multiple interfaces can be active simultaneously.

### Path
A route through the network to a destination, discovered via announce propagation. Stored in path tables. Directional — the path from A to B may differ from B to A. Path freshness is tracked by age.

These networking concepts rely on Reticulum's cryptographic foundation:

## Cryptography

### Identity
A **512-bit Curve25519 keyset**: 256-bit Ed25519 signing key + 256-bit X25519 encryption key. This is who you are on the network. Your destination hash is derived from this identity. Identities can be created, exported, imported, and switched in Ratspeak.

### Link
An encrypted, bidirectional channel established via a **3-packet handshake (297 bytes)**. Links provide forward secrecy through ephemeral ECDH key exchange. The initiator remains completely anonymous — no source address is ever transmitted. Links support packets, resources (large data), channels (continuous messaging), and request/response patterns.

### Forward Secrecy
If long-term keys are compromised, past communications remain secure. Achieved through ephemeral key exchange during link establishment. Reticulum also supports per-destination key ratchets for ongoing forward secrecy.

### Ratchet
A key rotation mechanism that provides ongoing forward secrecy for individual destinations. Keys rotate at configurable intervals and old keys expire, ensuring past communications remain secure even if current keys are compromised.

## Messaging

### LXMF
**Lightweight Extensible Message Format** — a zero-configuration message routing protocol built on Reticulum. End-to-end encrypted with forward secrecy. Works over any medium Reticulum supports, including LoRa and packet radio. Compatible across Sideband, NomadNet, MeshChat, and Ratspeak.

### Propagation Node
An LXMF concept — a node that stores and forwards messages for destinations that are currently unreachable. Essential for delay-tolerant networks. When a recipient comes online and syncs with the propagation node, stored messages are delivered.

### Delivery Modes
Three ways to deliver an LXMF message:
- **Direct** — establish a link and deliver immediately
- **Opportunistic** — send without a link, hoping the path works (for small messages)
- **Propagated** — route through a propagation node for store-and-forward delivery

<div class="docs-diagram">
<svg viewBox="0 0 700 340" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Title -->
  <text x="350" y="24" text-anchor="middle" fill="#e2e8f0" font-family="Outfit" font-size="14" font-weight="600">How Concepts Relate</text>

  <!-- Identity (center) -->
  <rect x="280" y="60" width="140" height="50" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.08)"/>
  <text x="350" y="82" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="12" font-weight="600">Identity</text>
  <text x="350" y="98" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">Ed25519 + X25519</text>

  <!-- Destination (left) -->
  <rect x="60" y="60" width="140" height="50" rx="8" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.08)"/>
  <text x="130" y="82" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="12" font-weight="600">Destination</text>
  <text x="130" y="98" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">16-byte hash</text>

  <!-- Link to Identity->Destination -->
  <line x1="280" y1="85" x2="200" y2="85" stroke="#3a4759" stroke-width="1"/>
  <text x="240" y="78" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">derives</text>

  <!-- Announce (right) -->
  <rect x="500" y="60" width="140" height="50" rx="8" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.08)"/>
  <text x="570" y="82" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="12" font-weight="600">Announce</text>
  <text x="570" y="98" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">broadcast + signed</text>

  <!-- Link Identity->Announce -->
  <line x1="420" y1="85" x2="500" y2="85" stroke="#3a4759" stroke-width="1"/>
  <text x="460" y="78" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">proves</text>

  <!-- Link (below Identity) -->
  <rect x="280" y="160" width="140" height="50" rx="8" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.08)"/>
  <text x="350" y="182" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="12" font-weight="600">Link</text>
  <text x="350" y="198" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">297-byte handshake</text>

  <!-- Identity->Link -->
  <line x1="350" y1="110" x2="350" y2="160" stroke="#3a4759" stroke-width="1"/>
  <text x="370" y="138" fill="#7e8fa2" font-family="Outfit" font-size="9">establishes</text>

  <!-- Interface (left below) -->
  <rect x="60" y="160" width="140" height="50" rx="8" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.08)"/>
  <text x="130" y="182" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="12" font-weight="600">Interface</text>
  <text x="130" y="198" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">LoRa, TCP, WiFi...</text>

  <!-- Transport (right below) -->
  <rect x="500" y="160" width="140" height="50" rx="8" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.08)"/>
  <text x="570" y="182" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="12" font-weight="600">Transport</text>
  <text x="570" y="198" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">routing + paths</text>

  <!-- Interface connects -->
  <line x1="200" y1="185" x2="280" y2="185" stroke="#3a4759" stroke-width="1"/>
  <text x="240" y="178" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">carries</text>

  <!-- Transport connects -->
  <line x1="420" y1="185" x2="500" y2="185" stroke="#3a4759" stroke-width="1"/>
  <text x="460" y="178" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">routes via</text>

  <!-- LXMF (bottom center) -->
  <rect x="230" y="260" width="140" height="50" rx="8" stroke="#00D4AA" stroke-width="2" fill="rgba(0,212,170,0.10)"/>
  <text x="300" y="282" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="12" font-weight="600">LXMF</text>
  <text x="300" y="298" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">messaging protocol</text>

  <!-- Propagation Node -->
  <rect x="420" y="260" width="140" height="50" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.08)"/>
  <text x="490" y="282" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="12" font-weight="600">Prop Node</text>
  <text x="490" y="298" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">store + forward</text>

  <!-- Link->LXMF -->
  <line x1="330" y1="210" x2="310" y2="260" stroke="#3a4759" stroke-width="1"/>
  <text x="300" y="238" fill="#7e8fa2" font-family="Outfit" font-size="9">delivers via</text>

  <!-- LXMF->Prop Node -->
  <line x1="370" y1="285" x2="420" y2="285" stroke="#3a4759" stroke-width="1"/>
  <text x="395" y="278" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">stores</text>
</svg>
<figcaption>Conceptual relationships between core Reticulum and LXMF components</figcaption>
</div>

## Ratspeak-Specific

### Hub Node
The primary rnsd instance that Ratspeak connects to (default: `node_1`). All dashboard operations — messaging, interface changes, monitoring — flow through the hub node's Reticulum instance.

### Safe Restart
When interfaces are added or removed, rnsd must restart. Ratspeak patches RNS to reconnect gracefully instead of exiting, keeping the dashboard alive through the restart cycle.

### Contact Reachability
Contacts are classified based on how recently they were seen in the path table:
- **Reachable** — time since last route confirmation < 30 minutes (configurable)
- **Stale** — time since last route confirmation 30-60 minutes
- **Unreachable** — time since last route confirmation > 60 minutes or no path entry

### Graph View
An interactive force-directed network graph built with D3.js. Nodes represent your hub, contacts, transport nodes, and discovered peers. Color-coded by type and status, with zoom, pan, drag, and filter controls. See [Graph Visualization](../using-ratspeak/graph-visualization).

## App Layer

### RLAP
**Reticulum LXMF App Protocol** — a lightweight protocol for interactive applications over LXMF. Encodes app sessions (games, tools) as structured envelopes in LXMF custom fields. Designed to fit within the 295-byte OPPORTUNISTIC delivery limit. See [RLAP Protocol](../understanding/rlap-protocol).

### Session
An RLAP session is a series of structured messages between two contacts within a specific app (e.g., a chess game). Each session has a unique ID, a lifecycle (challenge, accept, actions, end), and per-status TTLs.

### RLAP Envelope
The structured dict carried in LXMF's `fields[0xFD]`. Uses single-character keys (`a`, `c`, `s`, `p`) to minimize wire size. Contains the app ID, command, session ID, and app-specific payload.

### Fallback Text
Every RLAP message includes human-readable text in the LXMF `content` field. Non-RLAP clients (Sideband, NomadNet, MeshChat) display this as a regular message, ensuring compatibility across the ecosystem.

## Next Steps

- [Zen of Reticulum](../introduction/zen-of-reticulum) — the philosophy behind the protocol
- [Installing Ratspeak](../getting-started/installing-ratspeak) — get up and running
- [Glossary](../reference/glossary) — complete term reference
