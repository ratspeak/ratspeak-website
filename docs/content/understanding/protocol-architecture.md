# Protocol Architecture

How Reticulum addresses, routes, announces, and transports data — the foundations of hash-based networking.

## Destination-Based Addressing

Reticulum replaces IP addresses with **destination hashes** — 16-byte (128-bit) truncated SHA-256 hashes derived from a cryptographic identity and application name.

```
Destination Hash = SHA-256(app_name.aspect1.aspect2 + Identity.public_key)[:16]
```

For example:
```
Application name: environmentlogger.remotesensor.temperature
Destination hash: 4faf1b2e0a077e6a9d92fa051f256038
```

Where `Identity.public_key` is the concatenation of the Ed25519 signing key and X25519 encryption key (both public halves of the 512-bit keyset).

Two instances running the same application will have **different** hashes because each is tied to a different cryptographic identity.

### Four Destination Types

| Type | Encryption | Reach | Use Case |
|------|-----------|-------|----------|
| **Single** | Asymmetric (per-packet ECDH) | Multi-hop | Most common — private communication |
| **Plain** | None | Direct only | Public broadcasts, service discovery |
| **Group** | Symmetric (shared key) | Direct only | Group communication with pre-shared key |
| **Link** | Ephemeral ECDH | Multi-hop | Encrypted channels with forward secrecy |

> **Note**: Plain and Group destinations can only be reached directly — they cannot be transported over multiple hops. Multi-hop transport requires encryption (the entropy of encrypted packets IS the routing mechanism).

> **Note**: For **Plain** and **Group** destinations, the hash input uses only the application name and aspects — no public key. This means all nodes running the same app share the same Plain/Group address, enabling broadcast behavior.

## The Announce Mechanism

Announces are how destinations become reachable on the network. An announce contains:

- The **destination hash** (16 bytes)
- The full **public key**
- Optional **application data** (e.g., display name)
- A **cryptographic signature** proving ownership of the corresponding private key

When a node announces a Destination, the announce packet propagates outward through the network. Each Transport Node that receives an announce records the path back to the announcer and re-broadcasts it to its other interfaces. This fan-out pattern ensures that all reachable nodes eventually learn a route to the announced Destination, without any central directory or coordination.

### Propagation Rules

1. **Duplicate detection** — if a transport node has seen the same announce with equal or higher hop count, it's dropped
2. **Hop counting** — each transport node increments the hop count (max: **128 hops**)
3. **Rate limiting** — at most **2% of interface bandwidth** for announce propagation
4. **Randomized delays** — retransmission delays prevent flooding
5. **Priority** — local announces (low hop count) retransmitted before distant ones
6. **Path recording** — transport nodes record which neighbor sent the announce, building path tables

## Routing

When a node needs to reach a destination:

1. **Check path table** — if a known route exists, use it
2. **If unknown** — broadcast a path request, or wait for the destination to announce
3. **Path table** — maps destination hashes to next-hop neighbors with hop counts

Transport nodes operate blindly — they forward packets based on path tables without knowing who is communicating with whom.

## Packet Receipt Verification

Delivery confirmations are unforgeable:

1. Destination calculates `SHA-256(received_packet)`
2. Signs the hash with its Ed25519 signing key
3. Transport nodes relay the proof back along the reverse path
4. Sender verifies the signature against the known public key

No one can forge a delivery proof — only the holder of the private key can sign the hash.

## Packet Prioritization

Traffic is prioritized (highest to lowest):

1. Link keepalives and transport management
2. Link establishment
3. Proofs and receipts
4. Data packets
5. Announces (lowest — rate-limited)

## What's Next

- [Links & Communication](../understanding/links-and-communication) — encrypted channels
- [Wire Format](../understanding/wire-format) — packet structure
- [Security Model](../understanding/security-model) — threat model and defenses
