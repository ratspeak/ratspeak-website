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

<div class="docs-diagram">
<svg viewBox="0 0 700 220" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Origin node -->
  <circle cx="80" cy="110" r="18" stroke="#00D4AA" stroke-width="2" fill="rgba(0,212,170,0.15)"/>
  <text x="80" y="114" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="9" font-weight="600">SRC</text>
  <text x="80" y="145" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">hop 0</text>

  <!-- Transport 1 -->
  <circle cx="220" cy="70" r="14" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.10)"/>
  <text x="220" y="74" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="8">T1</text>
  <text x="220" y="100" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">hop 1</text>

  <circle cx="220" cy="150" r="14" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.10)"/>
  <text x="220" y="154" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="8">T2</text>
  <text x="220" y="180" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">hop 1</text>

  <!-- Transport 2 -->
  <circle cx="360" cy="70" r="14" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.10)"/>
  <text x="360" y="74" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="8">T3</text>
  <text x="360" y="100" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">hop 2</text>

  <circle cx="360" cy="150" r="14" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.10)"/>
  <text x="360" y="154" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="8">T4</text>
  <text x="360" y="180" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">hop 2</text>

  <!-- End nodes -->
  <circle cx="500" cy="50" r="10" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.06)"/>
  <circle cx="500" cy="110" r="10" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.06)"/>
  <circle cx="500" cy="170" r="10" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.06)"/>

  <!-- Ripple lines -->
  <line x1="98" y1="100" x2="206" y2="74" stroke="#00D4AA" stroke-width="1" opacity="0.5"/>
  <line x1="98" y1="120" x2="206" y2="146" stroke="#00D4AA" stroke-width="1" opacity="0.5"/>
  <line x1="234" y1="70" x2="346" y2="70" stroke="#F59E0B" stroke-width="1" opacity="0.5"/>
  <line x1="234" y1="150" x2="346" y2="150" stroke="#F59E0B" stroke-width="1" opacity="0.5"/>
  <line x1="234" y1="80" x2="346" y2="145" stroke="#F59E0B" stroke-width="1" opacity="0.3"/>
  <line x1="374" y1="65" x2="490" y2="52" stroke="#38BDF8" stroke-width="1" opacity="0.4"/>
  <line x1="374" y1="75" x2="490" y2="108" stroke="#38BDF8" stroke-width="1" opacity="0.4"/>
  <line x1="374" y1="150" x2="490" y2="168" stroke="#38BDF8" stroke-width="1" opacity="0.4"/>

  <!-- Animated ripple -->
  <circle r="6" fill="none" stroke="#00D4AA" stroke-width="1" opacity="0">
    <animate attributeName="r" values="18;80" dur="2s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.6;0" dur="2s" repeatCount="indefinite"/>
    <animate attributeName="cx" values="80;80" dur="2s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="110;110" dur="2s" repeatCount="indefinite"/>
  </circle>

  <!-- Caption -->
  <text x="350" y="210" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="11" font-style="italic">Announce ripples outward, hop count incrementing at each transport node</text>
</svg>
</div>

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

## Next Steps

- [Links & Communication](../understanding/links-and-communication) — encrypted channels
- [Wire Format](../understanding/wire-format) — packet structure
- [Security Model](../understanding/security-model) — threat model and defenses
