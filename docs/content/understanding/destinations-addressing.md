# Destinations & Addressing

How Reticulum addresses work — destination types, hash derivation, naming conventions, and the announce system that distributes public keys.

## Destination-Based Addressing

Reticulum doesn't use IP addresses, MAC addresses, or any centrally assigned identifiers. Instead, every endpoint has a **destination hash** — a 16-byte (128-bit) value derived from cryptographic keys and application naming.

```
Destination Hash = SHA-256(app_name.aspects + public_keys)[:16]
```

The 128-bit address space supports billions of simultaneous devices. No coordination needed — each device generates its own unique address from its own cryptographic identity.

## Destination Types

Reticulum defines four destination types, each with different encryption and routing properties:

| Type | Encryption | Routing | Use Case |
|------|-----------|---------|----------|
| **Single** | Asymmetric (per-packet ECDH) | Multi-hop | Private communication — the most common type |
| **Group** | Symmetric (pre-shared key) | Direct only | Group messaging with shared secret |
| **Plain** | None | Direct only | Public broadcasts, service discovery |
| **Link** | Ephemeral ECDH with forward secrecy | Multi-hop | Encrypted channels for larger data |

> **Note**: Only **Single** and **Link** destinations can be routed across multiple hops. Plain and Group destinations are limited to directly reachable interfaces because Reticulum uses per-packet encryption entropy as part of its routing mechanism.

## Hash Derivation

<div class="docs-diagram">
<svg viewBox="0 0 700 150" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Input boxes -->
  <rect x="10" y="20" width="145" height="36" rx="6" fill="rgba(56,189,248,0.08)" stroke="#38BDF8" stroke-width="1.5"/>
  <text x="82" y="43" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="#38BDF8">app_name.aspects</text>

  <rect x="165" y="20" width="125" height="36" rx="6" fill="rgba(56,189,248,0.08)" stroke="#38BDF8" stroke-width="1.5"/>
  <text x="227" y="43" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="#38BDF8">Ed25519 pub</text>

  <rect x="300" y="20" width="125" height="36" rx="6" fill="rgba(56,189,248,0.08)" stroke="#38BDF8" stroke-width="1.5"/>
  <text x="362" y="43" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="#38BDF8">X25519 pub</text>

  <!-- Plus signs -->
  <text x="155" y="44" text-anchor="middle" font-family="Outfit" font-size="16" fill="#7e8fa2">+</text>
  <text x="290" y="44" text-anchor="middle" font-family="Outfit" font-size="16" fill="#7e8fa2">+</text>

  <!-- Arrows into SHA-256 -->
  <line x1="82" y1="56" x2="82" y2="72" stroke="#7e8fa2" stroke-width="1"/>
  <line x1="227" y1="56" x2="227" y2="72" stroke="#7e8fa2" stroke-width="1"/>
  <line x1="362" y1="56" x2="362" y2="72" stroke="#7e8fa2" stroke-width="1"/>
  <line x1="82" y1="72" x2="362" y2="72" stroke="#7e8fa2" stroke-width="1"/>
  <line x1="222" y1="72" x2="222" y2="82" stroke="#C084FC" stroke-width="1.5"/>
  <polygon points="222,84 217,77 227,77" fill="#C084FC"/>

  <!-- SHA-256 box -->
  <rect x="172" y="86" width="100" height="32" rx="6" fill="rgba(192,132,252,0.10)" stroke="#C084FC" stroke-width="2"/>
  <text x="222" y="107" text-anchor="middle" font-family="JetBrains Mono" font-size="12" fill="#C084FC">SHA-256</text>

  <!-- Arrow to truncate -->
  <line x1="272" y1="102" x2="380" y2="102" stroke="#C084FC" stroke-width="1.5"/>
  <polygon points="382,102 374,97 374,107" fill="#C084FC"/>

  <!-- Truncate box -->
  <rect x="384" y="86" width="150" height="32" rx="6" fill="rgba(126,143,162,0.08)" stroke="#7e8fa2" stroke-width="1.5"/>
  <text x="459" y="107" text-anchor="middle" font-family="Outfit" font-size="12" fill="#e0e6ed">Truncate to 16 bytes</text>

  <!-- Arrow to destination hash -->
  <line x1="534" y1="102" x2="556" y2="102" stroke="#00D4AA" stroke-width="1.5"/>
  <polygon points="558,102 550,97 550,107" fill="#00D4AA"/>

  <!-- Destination hash box -->
  <rect x="560" y="86" width="130" height="32" rx="6" fill="rgba(0,212,170,0.10)" stroke="#00D4AA" stroke-width="2"/>
  <text x="625" y="107" text-anchor="middle" font-family="Outfit" font-size="12" fill="#00D4AA">Destination Hash</text>
</svg>
<figcaption>Hash derivation — public keys and naming are hashed then truncated to 16 bytes</figcaption>
</div>

### Single Destinations

For Single destinations (tied to a cryptographic identity):

```
Hash = SHA-256(app_name.aspects + Ed25519_pubkey + X25519_pubkey)[:16]
```

Because each identity has unique keys, different users running the same application get different destination hashes.

### Plain and Group Destinations

For Plain and Group destinations (not tied to an identity):

```
Hash = SHA-256(app_name.aspects)[:16]
```

These hashes are derived from naming alone — any node using the same app name gets the same hash.

## Naming Convention

Destinations use a dotted notation of **aspects**:

```
app_name.aspect1.aspect2.aspectN
```

Examples:

| Name | Purpose |
|------|---------|
| `lxmf.delivery` | LXMF message delivery |
| `lxmf.propagation` | LXMF propagation node |
| `nomadnetwork.node` | NomadNet node presence |
| `ratspeak.dashboard` | Ratspeak dashboard endpoint |

The top-level aspect should be a unique application identifier. Subsequent levels are defined by the application.

## The Announce System

Since destination hashes are derived from public keys, other nodes need to learn those public keys before they can send encrypted traffic. This is handled by **announces**.

### What an Announce Contains

1. **Destination hash** (16 bytes) — the address being announced
2. **Full public key** (Ed25519 + X25519) — needed for encryption
3. **Application data** (optional) — display name, capabilities, etc.
4. **Ed25519 signature** — proof the announcer holds the private key

### How Announces Propagate

1. A node broadcasts its announce on all interfaces
2. Transport nodes receive and re-broadcast (if not a duplicate)
3. Each transport node records the path (neighbor + hop count)
4. Duplicate detection: same destination hash with same or higher hop count is dropped
5. Hop count is incremented at each transport node (max 128)
6. Rate-limited to **2% of interface bandwidth** by default

### Path Table

As announces propagate, each transport node builds a **path table**:

```
destination_hash → (next_hop_neighbor, hop_count, interface)
```

When a packet arrives for a known destination, the node forwards it to the recorded next-hop neighbor. No central routing table — each node maintains its own.

## Reaching Unknown Destinations

If a destination isn't in the path table:

1. **Path request** — broadcast a request; the target destination or a transport node with the path responds
2. **Wait for announce** — the destination will eventually announce itself

## Display Format

Destination hashes are displayed as 32 hexadecimal characters:

```
4faf1b2e0a077e6a9d92fa051f256038
```

This is the address you share with contacts and use to add them in Ratspeak.

## What's Next

- [Transport & Routing](../understanding/transport-routing) — how packets find their way
- [Protocol Architecture](../understanding/protocol-architecture) — overall system design
- [Network Identities](../understanding/network-identities) — identity management at the network level
