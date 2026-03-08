# Key Concepts

Everything in Ratspeak builds on a small set of core ideas. This page introduces them in layers — start with the basics, and each layer adds depth.

## The Basics — What You Need to Send a Message

### Identity

Your identity is a pair of cryptographic keys — one for encryption, one for signing. Think of it like a passport you create yourself: no government issues it, no company stores it, and it proves who you are with mathematical certainty.

Technically, it's a 512-bit Curve25519 keyset: a 256-bit Ed25519 signing key paired with a 256-bit X25519 encryption key. In practice, it's a small file on your device that makes everything else work.

### Destination

Your address on the network. Instead of an IP address tied to a physical location, a destination is a 16-byte hash derived from your identity's public key. It looks like: `<13425ec15b621c1d928589718000d814>`.

This address never changes regardless of how or where you connect. Switch from WiFi to LoRa to TCP — same destination hash, same identity.

### Announce

How others discover you. When your node announces, it broadcasts your public key and destination hash to the network. Other nodes receive this announce, store the route to you, and can now send you messages.

Announces propagate through the network hop by hop, with each relay recording the path back to you. Rate-limited to 2% of interface bandwidth to prevent flooding.

## The Network — How Messages Get There

### Interface

A communication channel connecting you to other nodes. Reticulum supports many interface types simultaneously:

- **LoRa radio** (RNode) — long-range wireless, kilometers of range
- **WiFi / LAN** — automatic local network discovery
- **TCP** — connections over the internet
- **BLE** — short-range Bluetooth mesh
- **Serial** — direct cable connections
- **I2P** — anonymous overlay network

You can run multiple interfaces at once. A single node might use LoRa for local radio coverage, WiFi for nearby devices, and TCP for internet connectivity — all simultaneously.

### Transport Node

A node that volunteers to forward packets for others. Regular nodes only send and receive their own traffic. Transport nodes actively route packets, maintain path tables, and relay announces.

Transport nodes should be fixed, always-on systems — like a relay station for the mesh. Not every node needs to be a transport node.

### Path

The route a packet takes through the network to reach a destination. Paths are discovered through announce propagation and stored in path tables. They can traverse multiple hops through transport nodes.

Paths are directional — the route from you to someone else may be different from their route back to you.

## Communication — How Messages Are Delivered

### Link

An encrypted tunnel between two destinations. Established with a 3-packet handshake totaling just 297 bytes. Links provide:

- **Forward secrecy** — if keys are compromised later, past conversations stay secure
- **Sender anonymity** — packets carry no source address
- **Reliable delivery** — for larger data transfers

### LXMF (Lightweight Extensible Message Format)

The messaging protocol built on top of Reticulum. LXMF handles message formatting, encryption, delivery, and store-and-forward. It's what makes Ratspeak, Sideband, NomadNet, and MeshChat all interoperable.

Three delivery modes:

- **Direct** — establish a link and deliver immediately (reliable, confirmed)
- **Opportunistic** — fire and forget in a single packet (fast, small messages only)
- **Propagated** — route through a propagation node for offline recipients

### Propagation Node

A node that stores messages for destinations that are currently offline. When the recipient comes back online and syncs with the propagation node, stored messages are delivered. Essential for delay-tolerant communication.

## Advanced — Deeper Protocol Features

### RLAP (Reticulum LXMF App Protocol)

A protocol for interactive applications over LXMF messages. RLAP encodes app sessions (like chess games) as structured data inside LXMF custom fields. Designed to fit within the 295-byte limit of single-packet delivery.

Non-Ratspeak clients see human-readable fallback text for any RLAP message, maintaining ecosystem compatibility.

### Ratchet

A key rotation mechanism providing ongoing forward secrecy. Keys rotate automatically at regular intervals (default: every 30 minutes), and old keys expire after 30 days. Even if someone captures your current keys, they can't decrypt past messages.

### IFAC (Interface Access Code)

A passphrase-based mechanism for creating private networks on shared mediums. Set the same passphrase on two interfaces, and they form an isolated virtual network — other nodes without the passphrase can't see or inject traffic.

### Network Identity

A cryptographic key representing a community or infrastructure group rather than an individual. Used for interface discovery, whitelisting trusted infrastructure, and network privacy.

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

## Ratspeak-Specific Concepts

### Hub Node

The primary network daemon instance that Ratspeak connects to. All dashboard operations — messaging, interface changes, monitoring — flow through the hub node.

### Contact Reachability

Ratspeak tracks how recently each contact was seen:

- **Reachable** — route confirmed within 30 minutes
- **Stale** — route confirmed 30-60 minutes ago
- **Unreachable** — no confirmed route for over 60 minutes

### Safe Restart

When you add or remove interfaces, the network daemon briefly restarts. Ratspeak handles this gracefully — your dashboard stays connected through the restart.

## What's Next

- [Zen of Reticulum](../introduction/zen-of-reticulum) — the philosophy behind the protocol
- [Choosing Your Setup](../getting-started/choosing-your-setup) — pick the right installation
- [Glossary](../reference/glossary) — complete term reference
