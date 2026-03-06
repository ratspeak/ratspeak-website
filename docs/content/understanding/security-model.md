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

<div class="docs-diagram">
<svg viewBox="0 0 680 160" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Timeline -->
  <line x1="40" y1="80" x2="640" y2="80" stroke="#3a4759" stroke-width="1.5"/>

  <!-- Ratchet keys -->
  <rect x="60" y="55" width="60" height="50" rx="4" stroke="#C084FC" stroke-width="1" fill="rgba(192,132,252,0.08)"/>
  <text x="90" y="76" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="9" font-weight="600">Key 1</text>
  <text x="90" y="92" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="8">t=0</text>

  <rect x="160" y="55" width="60" height="50" rx="4" stroke="#C084FC" stroke-width="1" fill="rgba(192,132,252,0.08)"/>
  <text x="190" y="76" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="9" font-weight="600">Key 2</text>
  <text x="190" y="92" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="8">t=30m</text>

  <rect x="260" y="55" width="60" height="50" rx="4" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.12)"/>
  <text x="290" y="76" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="9" font-weight="600">Key 3</text>
  <text x="290" y="92" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="8">t=60m</text>
  <text x="290" y="45" text-anchor="middle" fill="#00D4AA" font-family="Outfit" font-size="8">current</text>

  <!-- Future keys (dimmed) -->
  <rect x="360" y="55" width="60" height="50" rx="4" stroke="#3a4759" stroke-width="1" fill="rgba(45,55,72,0.2)" stroke-dasharray="3 2"/>
  <text x="390" y="76" text-anchor="middle" fill="#7e8fa2" font-family="JetBrains Mono" font-size="9">Key 4</text>
  <text x="390" y="92" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="8">t=90m</text>

  <rect x="460" y="55" width="60" height="50" rx="4" stroke="#3a4759" stroke-width="1" fill="rgba(45,55,72,0.2)" stroke-dasharray="3 2"/>
  <text x="490" y="76" text-anchor="middle" fill="#7e8fa2" font-family="JetBrains Mono" font-size="9">Key 5</text>

  <!-- Dots -->
  <text x="555" y="82" fill="#7e8fa2" font-family="Outfit" font-size="14">...</text>

  <!-- Retention window bracket -->
  <line x1="60" y1="120" x2="320" y2="120" stroke="#F59E0B" stroke-width="1"/>
  <line x1="60" y1="115" x2="60" y2="125" stroke="#F59E0B" stroke-width="1"/>
  <line x1="320" y1="115" x2="320" y2="125" stroke="#F59E0B" stroke-width="1"/>
  <text x="190" y="140" text-anchor="middle" fill="#F59E0B" font-family="Outfit" font-size="10">Retention window (512 keys, 30-day expiry)</text>

  <!-- Arrow for rotation -->
  <text x="130" y="42" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">30-min rotation</text>
  <line x1="120" y1="50" x2="160" y2="50" stroke="#7e8fa2" stroke-width="1"/>
  <polygon points="158,47 164,50 158,53" fill="#7e8fa2"/>
</svg>
<figcaption>Ratchet timeline: keys rotate every 30 minutes with a 512-key retention window</figcaption>
</div>

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

## Next Steps

- [Cryptographic Primitives](../understanding/cryptographic-primitives) — the algorithms
- [Protocol Architecture](../understanding/protocol-architecture) — how routing works
- [Zen of Reticulum](../introduction/zen-of-reticulum) — the philosophy of trustless design
