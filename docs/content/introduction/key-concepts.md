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

### LRGP (Lightweight Reticulum Gaming Protocol)

A protocol for multiplayer games over LXMF messages. LRGP encodes game sessions (like Tic-Tac-Toe) as structured data inside LXMF custom fields. Designed to fit within the 295-byte limit of single-packet delivery.

Non-Ratspeak clients see human-readable fallback text for any LRGP message, maintaining ecosystem compatibility.

### Ratchet

A key rotation mechanism providing ongoing forward secrecy. Keys rotate automatically at regular intervals (default: every 30 minutes), and old keys expire after 30 days. Even if someone captures your current keys, they can't decrypt past messages.

### IFAC (Interface Access Code)

A passphrase-based mechanism for creating private networks on shared mediums. Set the same passphrase on two interfaces, and they form an isolated virtual network — other nodes without the passphrase can't see or inject traffic.

### Network Identity

A cryptographic key representing a community or infrastructure group rather than an individual. Used for interface discovery, whitelisting trusted infrastructure, and network privacy.

These concepts form a layered dependency chain:

- An **Identity** is a cryptographic key pair (X25519 + Ed25519) that proves who you are on the network
- Each Identity creates one or more **Destinations** — named endpoints that other nodes can address
- Destinations define **Aspects** — dot-separated strings (like `app.service.function`) that describe their purpose
- **Links** are encrypted point-to-point channels established between Destinations via a three-step handshake
- **Transport** routes packets across multiple hops when source and destination are not directly reachable
- **LXMF** provides reliable, store-and-forward messaging over Links — this is the layer Ratspeak uses for chat

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
