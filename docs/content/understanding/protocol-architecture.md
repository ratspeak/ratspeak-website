# Protocol Architecture

How Reticulum addresses, routes, and transports data at the wire level.

## Destination-Based Addressing

Reticulum replaces IP addresses with **destination hashes** — 16-byte (128-bit) truncated SHA-256 hashes derived from a cryptographic identity and an application name.

```
Destination Hash = SHA-256(app_name.aspects + Ed25519_pubkey + X25519_pubkey)[:16]
```

Two instances running the same application get different hashes because each has a different cryptographic identity.

### Naming Convention

Destinations use dotted aspect notation (`app_name.aspect1.aspect2`):

| Name | Purpose |
|------|---------|
| `lxmf.delivery` | LXMF message delivery |
| `lxmf.propagation` | LXMF propagation node |
| `nomadnetwork.node` | NomadNet node presence |
| `ratspeak.dashboard` | Ratspeak dashboard endpoint |

### Destination Types

| Type | Encryption | Routing | Use Case |
|------|-----------|---------|----------|
| **Single** | Asymmetric (per-packet ECDH) | Multi-hop | Private communication — the most common type |
| **Group** | Symmetric (pre-shared key) | Direct only | Group messaging with shared secret |
| **Plain** | None | Direct only | Public broadcasts, service discovery |
| **Link** | Ephemeral ECDH with forward secrecy | Multi-hop | Encrypted channels for larger data |

Only Single and Link destinations route across multiple hops. Plain and Group destinations are direct-only because Reticulum uses per-packet encryption entropy as part of its routing mechanism.

For Plain and Group destinations, the hash input uses only the application name and aspects — no public key. All nodes running the same app share the same Plain/Group address, enabling broadcast behavior.

```
Plain/Group Hash = SHA-256(app_name.aspects)[:16]
```

Destination hashes display as 32 hex characters: `4faf1b2e0a077e6a9d92fa051f256038`. This is the address you share with contacts.

## The Announce Mechanism

Announces distribute public keys so other nodes can send encrypted traffic. An announce contains:

1. **Destination hash** (16 bytes)
2. **Full public key** (Ed25519 + X25519)
3. **Application data** (optional) — display name, capabilities
4. **Ed25519 signature** — proof the announcer holds the private key

Each transport node that receives an announce records the path back and re-broadcasts. All reachable nodes eventually learn a route without any central directory.

### Propagation Rules

| Rule | Detail |
|------|--------|
| Duplicate detection | Same destination hash with same or higher hop count is dropped |
| Hop limit | Maximum 128 hops |
| Rate limiting | Max 2% of interface bandwidth for announce traffic |
| Randomized delays | Re-broadcasts delayed randomly to prevent synchronization |
| Priority | Low hop count (nearby) announces re-transmitted before distant ones |
| Path recording | Transport nodes record which neighbor sent the announce |

Rate control parameters are configurable per interface. See [Interfaces Overview & Design](../networking/interfaces-overview-and-design) for announce rate tuning.

## Routing

Routing is based on announce propagation — no background routing protocol. Nodes learn paths by observing announces.

### Walkthrough

1. **Node A announces** its destination on all interfaces (hop count 0).
2. **Transport Node T1** receives the announce, records "A is reachable through interface X," increments hop count to 1, re-broadcasts.
3. **Transport Node T2** receives it, records "A is reachable through T1," increments to 2, re-broadcasts.
4. This continues until all reachable transport nodes have a path entry.

When **Node B** sends a packet to **Node A**:

1. Check the path table for A's destination hash.
2. If found, send to the recorded next-hop neighbor. Each transport node forwards using its own path table.
3. If not found, broadcast a path request or wait for A's next announce.

### Path Table

Each node maintains a local path table:

| Destination Hash | Next Hop | Hop Count | Interface |
|-----------------|----------|-----------|-----------|
| `4faf1b2e...` | Neighbor X | 2 | LoRa |
| `a3c7e901...` | Neighbor Y | 1 | TCP |

Entries update when announces arrive with lower hop counts (better paths).

### Transport Nodes vs. Instances

| Type | Config | Role |
|------|--------|------|
| **Instance** | `enable_transport = No` (default) | Endpoint only — sends and receives its own traffic |
| **Transport Node** | `enable_transport = Yes` | Active router — forwards packets for other nodes |

Transport nodes forward packets **blindly**: they see only the destination hash, cannot identify the sender, cannot read encrypted payloads, and cannot build communication graphs.

### Convergence

Networks converge without central coordination. New nodes announce and become discoverable immediately. Adding or removing links triggers automatic path adjustment — no subnet planning, no address allocation, no DNS.

## Network Identities

A **Network Identity** is a standard Reticulum identity (512-bit keyset) representing a logical group — a community mesh, an organization, or a set of trusted transport nodes. Generate one with `rnid`:

```bash
rnid -g ~/.reticulum/storage/identities/my_network
```

### Interface Discovery with Network Identities

Transport nodes sign discovery announces with the Network Identity. Listening instances verify the signature before auto-connecting:

```ini
[reticulum]
  network_identity = ~/.reticulum/storage/identities/my_network
  discover_interfaces = yes
  interface_discovery_sources = 521c87a83afb8f29e4455e77930b973b
```

Discovery announces can be encrypted so only member nodes can see them. The identity file contains private keys — distribute securely. Revoking access requires generating a new identity and redistributing.

## Packet Structure

Every Reticulum packet follows this binary format:

```
[HEADER: 2 bytes] [ADDRESSES: 16 or 32 bytes] [CONTEXT: 1 byte] [DATA: 0-465 bytes]
```

**Total maximum size: 500 bytes** (network-wide MTU, fixed).

### Header Byte 1 (Flags)

| Bit | Field | Values |
|-----|-------|--------|
| 7 | IFAC Flag | `0` = no IFAC, `1` = IFAC signature present |
| 6 | Header Type | `0` = Type 1 (1 address, 16 bytes), `1` = Type 2 (2 addresses, 32 bytes) |
| 5 | Context Flag | Interpretation varies by packet type |
| 4 | Propagation Type | `0` = Broadcast, `1` = Transport |
| 3-2 | Destination Type | `00` = Single, `01` = Group, `10` = Plain, `11` = Link |
| 1-0 | Packet Type | `00` = Data, `01` = Announce, `10` = Link Request, `11` = Proof |

### Header Byte 2

Hop count. Incremented at each transport node. Range: 0-255 (announce max: 128).

### Address Field

| Header Type | Size | Contents |
|-------------|------|----------|
| Type 1 | 16 bytes | Destination hash only |
| Type 2 | 32 bytes | Destination hash (16) + Transport ID hash (16) |

Type 2 headers are used when a packet is forwarded by a specific transport node.

### Maximum Data Units

| Type | Size | Description |
|------|------|-------------|
| MTU | **500 bytes** | Maximum total packet size |
| Encrypted MDU | **383 bytes** | Maximum payload for Single destinations |
| Plain MDU | **464 bytes** | Maximum payload for Plain destinations |

The difference accounts for encryption overhead (ephemeral key, HMAC, padding). For data larger than the MDU, use [Resources over Links](../understanding/links-and-lxmf).

### IFAC (Interface Access Codes)

When IFAC is active, an Ed25519 signing identity is derived from the IFAC passphrase. Per-packet signatures are generated and inserted before transmission, truncated to a configurable length (`ifac_size`, range 8-512 bits). Receiving interfaces verify the signature and silently drop invalid packets.

## Packet Receipt Verification

Delivery confirmations are unforgeable:

1. Destination calculates `SHA-256(received_packet)`.
2. Signs the hash with its Ed25519 signing key.
3. Transport nodes relay the proof back along the reverse path.
4. Sender verifies the signature against the known public key.

Only the holder of the private key can produce a valid proof.

## Packet Prioritization

| Priority | Traffic Type |
|----------|-------------|
| 1 (highest) | Link keepalives and transport management |
| 2 | Link establishment |
| 3 | Proofs and receipts |
| 4 | Data packets |
| 5 (lowest) | Announces (rate-limited) |
