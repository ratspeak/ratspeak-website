# Security Model

Forward secrecy, zero-trust design, ratchets, and how Reticulum's architecture makes surveillance structurally difficult.

## Zero-Trust Architecture

Reticulum assumes **every environment is hostile**. There is no trusted core, no certificate authority, no privileged infrastructure. Security is achieved through cryptographic proof, not institutional trust.

Key design principles:

- **No source addresses** — packets carry only the destination hash, preserving sender anonymity
- **Per-packet encryption** — every packet to a Single destination uses ephemeral ECDH keys
- **Unforgeable proofs** — delivery confirmations are Ed25519 signatures that only the destination can produce
- **Blind forwarding** — transport nodes forward packets without knowing who is communicating with whom
- **Encryption IS routing** — stripping encryption would break the routing mechanism itself

## Forward Secrecy

Forward secrecy ensures that if long-term keys are compromised, past communications remain secure. Reticulum achieves this through two mechanisms:

### 1. Ephemeral Keys on Links

Every link establishment generates fresh ephemeral X25519 keypairs on both sides. The shared secret is derived via ECDH and discarded after key derivation. Past link sessions cannot be decrypted even with access to long-term keys.

### 2. Ratchet System (Single Destinations)

For packets to Single destinations outside of Links, an optional ratchet system provides forward secrecy:

Ratchet keys rotate at a configurable interval (default every 30 minutes). A window of previous keys is retained to allow decryption of recently-encrypted messages, after which forward secrecy is absolute.

### Ratchet Parameters

| Parameter | Default Value | Description |
|-----------|:------------:|-------------|
| Key size | 256 bits | Size of each ratchet key |
| Rotation interval | 1800 seconds (30 min) | Minimum time between key rotations |
| Retained keys | 512 | Number of previous keys kept for decryption |
| Expiry | 2,592,000 seconds (30 days) | Maximum age before a ratchet key is discarded |

With 30-minute rotation and 512 retained keys, the ratchet system maintains decryption capability for approximately **10.6 days** of past traffic, after which forward secrecy is absolute. This assumes continuous 30-minute rotations. If a destination is offline, fewer rotations occur and keys may persist longer (up to the 30-day expiry).

Ratchet keys are distributed via announces — the current ratchet ID is included so senders always use the correct key. When a ratchet rotates, the new key is announced and senders switch automatically.

## Sender Anonymity

Reticulum packets carry **no source address**. Only the destination hash is included. This means:

- Transport nodes cannot identify the sender
- Network observers cannot build communication graphs
- At the Reticulum transport layer, packets carry no source identity — the sender is anonymous to all intermediate nodes. At the LXMF messaging layer, the sender's identity hash and Ed25519 signature are included in the message payload, allowing the recipient to verify the sender.

## Traffic Analysis Resistance

Because all traffic is encrypted with ephemeral keys:

- Packets cannot be inspected or classified by content
- All packets look the same to observers — encrypted blobs
- No traffic filtering by type is possible
- Network neutrality is enforced by cryptography, not policy

## Blackhole Management

Reticulum supports **blackholing** specific identities at the transport layer:

- Blocked identities have their announces and traffic silently dropped
- Blackhole lists can be managed locally
- Can be sourced from automated lists

This provides a defense against spam and abuse without compromising the zero-trust model — blackholing is a local decision, not a network-wide authority.

## What Reticulum Does NOT Protect Against

- **Traffic volume analysis** — an observer can see that communication is occurring, even if they can't read it
- **Endpoint compromise** — if your device is compromised, your keys are compromised
- **Timing correlation** — sophisticated observers may correlate packet timing across network segments
- **Unaudited code** — the implementation has not undergone formal security audit

> **Warning**: Reticulum has not been externally security audited. Use appropriate caution for high-stakes applications.

## What's Next

- [Cryptographic Primitives](../understanding/cryptographic-primitives) — the algorithms
- [Protocol Architecture](../understanding/protocol-architecture) — how routing works
- [Zen of Reticulum](../introduction/zen-of-reticulum) — the philosophy of trustless design
