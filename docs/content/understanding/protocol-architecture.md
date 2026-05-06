# Protocol Architecture

This page explains how Reticulum addresses, discovers, and forwards traffic. It is the technical follow-up to **What is Reticulum?**, but it still focuses on the concepts operators and advanced users need rather than implementation internals.

## Destination-Based Addressing

Reticulum does not route to hosts, subnets, ports, or DNS names. It routes to **destination hashes**.

A destination is created from an application name, optional aspects, and, for Single destinations, an identity. Reticulum hashes that material down to a 16-byte address:

```text
name_hash        = SHA-256("lxmf.delivery")[:10]
identity_hash    = SHA-256(identity_public_keys)[:16]
destination_hash = SHA-256(name_hash + identity_hash)[:16]
```

That final 16-byte value is displayed as 32 hex characters. It is the address you share when you share a Reticulum destination.

Two people can both run an `lxmf.delivery` destination without colliding because each identity produces a different identity hash. Plain and Group destinations are different: they are not identity-bound, so every node using the same application name and aspects shares the same destination hash.

## Destination Types

| Type | Encryption | Multi-hop | Typical use |
|------|------------|-----------|-------------|
| **Single** | Asymmetric, per-packet ECDH | Yes | Private application endpoints, including LXMF inboxes |
| **Link** | Ephemeral ECDH session | Yes | Reliable channels, requests, responses, resources |
| **Group** | Symmetric pre-shared key | No | Direct local group traffic with a shared key |
| **Plain** | None | No | Direct local public broadcast or discovery |

Only Single and Link destinations are transported across multiple hops. Plain destinations are intentionally local/direct, and Group destinations are currently direct-only.

## Destination Names

Destinations use dotted names. The top-level name should identify the application, and later aspects should describe the purpose of the destination.

| Name | Purpose |
|------|---------|
| `lxmf.delivery` | LXMF message delivery destination |
| `lxmf.propagation` | LXMF propagation node endpoint |
| `nomadnetwork.node` | NomadNet node endpoint |

Long names do not make packets larger because only hashes are placed on the wire.

## Announces

An announce is how a destination becomes reachable. A Single destination announce includes:

| Field | Purpose |
|-------|---------|
| Destination hash | The 16-byte address being announced |
| Public key material | X25519 and Ed25519 public keys for the identity |
| Name hash | The compact hash of the application destination name |
| Random hash | Freshness material used in announce validation |
| Ratchet key | Optional current ratchet public key |
| Signature | Ed25519 signature proving the announce belongs to the identity |
| Application data | Optional metadata such as display hints or capabilities |

Transport nodes that hear an announce record where it came from, increment the hop count, and may re-broadcast it. This is how paths form without a central registry.

## Announce Propagation

Reticulum's announce behavior is designed to keep slow networks useful instead of letting routing chatter consume the link.

| Rule | Effect |
|------|--------|
| Duplicate filtering | Already-seen announces are ignored |
| Hop limit | Announces stop after the configured maximum, 128 by default |
| Bandwidth cap | Announces use at most the configured announce share, 2% by default |
| Randomized delay | Re-broadcasts are delayed to avoid synchronized floods |
| Locality priority | Lower-hop announces are sent before distant ones when bandwidth is scarce |
| Replacement | Newer application data can replace a queued older announce |

Slow segments do not need perfect global convergence to be useful. If a destination is needed and a wider segment knows a path, path requests can pull the relevant reachability information across the constrained link.

## Routing

Reticulum routing is next-hop routing built from announces.

1. Node A announces its destination on its interfaces.
2. A transport node hears the announce and records "A is reachable through this neighbor on this interface."
3. The transport node re-broadcasts the announce with an incremented hop count.
4. Other transport nodes repeat that process until the announce has reached the reachable mesh.

When Node B sends to Node A, it looks up A's destination hash. If a path exists, B sends the packet to the next hop. Each transport node repeats the lookup locally until the packet reaches the destination.

If no path exists, the sender can request a path or wait for the destination to announce again.

## Transport Nodes and Metadata

Transport nodes forward packets without plaintext access. For encrypted Reticulum and LXMF traffic, they do not receive message bodies or application payloads.

They do still see transport metadata needed for forwarding: interface activity, timing, packet sizes, hop counts, and destination hashes. Reticulum packets do not carry source addresses, which improves initiator privacy, but it does not make traffic analysis impossible. Treat routing privacy as strong minimization, not magic invisibility.

## Network Identities

A Network Identity is a normal Reticulum identity used to represent a logical network, organization, or group of transport nodes.

Today, its main user-facing role is interface discovery. A transport node can sign discoverable interface announces with a Network Identity. Peers can then accept only discovery data signed by identities they trust. If encrypted discovery announces are enabled, peers need the Network Identity key material to decrypt the interface information.

Example:

```ini
[reticulum]
  network_identity = <reticulum-config-dir>/storage/identities/community_mesh
  discover_interfaces = yes
  interface_discovery_sources = 521c87a83afb8f29e4455e77930b973b
```

The identity file is sensitive. If you share the full keyset, the recipient can act as that Network Identity.

## Wire Format

Every Reticulum packet starts with a compact fixed structure:

```text
[HEADER: 2 bytes] [ADDRESSES: 16 or 32 bytes] [CONTEXT: 1 byte] [DATA]
```

The default network MTU is 500 bytes.

### Header Byte 1

| Bit | Field | Values |
|-----|-------|--------|
| 7 | IFAC flag | `0` open, `1` interface authentication present |
| 6 | Header type | `0` one address, `1` two addresses |
| 5 | Context flag | Meaning depends on packet context |
| 4 | Propagation type | `0` broadcast, `1` transport |
| 3-2 | Destination type | `00` Single, `01` Group, `10` Plain, `11` Link |
| 1-0 | Packet type | `00` Data, `01` Announce, `10` Link Request, `11` Proof |

### Header Byte 2

The second byte is the hop count. It is incremented by transport nodes as the packet moves through the network.

### Address Field

| Header type | Size | Contents |
|-------------|------|----------|
| Type 1 | 16 bytes | Destination hash |
| Type 2 | 32 bytes | Transport ID hash, then destination hash |

Type 2 headers are used for transported packets that need an explicit transport identifier.

## Packet Size Limits

| Limit | Size | Meaning |
|-------|------|---------|
| MTU | 500 bytes | Maximum on-wire Reticulum packet size |
| Plain packet MDU | 464 bytes | Maximum protocol payload for direct Plain packets |
| Encrypted Single packet payload | 383 bytes | Maximum encrypted Single destination packet payload |
| Link packet MDU | 431 bytes | Default payload size for encrypted Link packets |

LXMF messages have smaller content limits because LXMF adds destination fields, timestamps, signatures, and structured-message overhead. With default parameters, opportunistic LXMF content is about 295 bytes; larger messages use Direct link delivery or resources.

## Interface Access Codes

When IFAC is enabled, an interface derives signing material from the interface name or passphrase. Outbound packets receive an interface authentication code, which may be a full or truncated Ed25519 signature depending on interface configuration.

Receivers verify that code before passing the packet to Reticulum. Invalid packets are dropped silently. IFAC is useful for private segments over shared carriers, but it is not a substitute for Reticulum identity encryption.

## Receipt Proofs

Packet receipt proofs are cryptographic. A destination can prove receipt by signing the hash of the received packet with its Ed25519 signing key. The proof can travel back through the network, and the sender verifies it against the destination's known public key.

Only the destination identity can produce a valid proof.

## Traffic Handling

Reticulum is priority-agnostic for general traffic: packets are handled first-come, first-served. Announce re-transmission and maintenance traffic are the exception; they are governed by announce timing, bandwidth caps, and the locality priority described above.
