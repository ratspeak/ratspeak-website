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
