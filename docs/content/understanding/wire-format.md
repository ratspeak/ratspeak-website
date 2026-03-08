# Wire Format

The binary structure of Reticulum packets — header fields, addressing, and the 500-byte MTU.

## Packet Structure

Every Reticulum packet follows this format:

```
[HEADER: 2 bytes] [ADDRESSES: 16 or 32 bytes] [CONTEXT: 1 byte] [DATA: 0-465 bytes]
```

**Total maximum size: 500 bytes** (network-wide MTU, fixed).

<div class="docs-diagram">
<svg viewBox="0 0 700 200" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Header -->
  <rect x="20" y="40" width="100" height="60" rx="4" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.10)"/>
  <text x="70" y="58" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="11" font-weight="600">HEADER</text>
  <text x="70" y="76" text-anchor="middle" fill="#7e8fa2" font-family="JetBrains Mono" font-size="10">2 bytes</text>
  <text x="70" y="90" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">flags + hop count</text>

  <!-- Addresses -->
  <rect x="130" y="40" width="180" height="60" rx="4" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.10)"/>
  <text x="220" y="58" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="11" font-weight="600">ADDRESSES</text>
  <text x="220" y="76" text-anchor="middle" fill="#7e8fa2" font-family="JetBrains Mono" font-size="10">16 or 32 bytes</text>
  <text x="220" y="90" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">dest hash [+ transport ID]</text>

  <!-- Context -->
  <rect x="320" y="40" width="80" height="60" rx="4" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.10)"/>
  <text x="360" y="58" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="11" font-weight="600">CONTEXT</text>
  <text x="360" y="76" text-anchor="middle" fill="#7e8fa2" font-family="JetBrains Mono" font-size="10">1 byte</text>
  <text x="360" y="90" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">packet purpose</text>

  <!-- Data -->
  <rect x="410" y="40" width="270" height="60" rx="4" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.10)"/>
  <text x="545" y="58" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="11" font-weight="600">DATA</text>
  <text x="545" y="76" text-anchor="middle" fill="#7e8fa2" font-family="JetBrains Mono" font-size="10">0 - 465 bytes</text>
  <text x="545" y="90" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">encrypted payload</text>

  <!-- Size bar -->
  <line x1="20" y1="120" x2="680" y2="120" stroke="#3a4759" stroke-width="1"/>
  <text x="350" y="140" text-anchor="middle" fill="#7e8fa2" font-family="JetBrains Mono" font-size="10">500 bytes maximum (MTU)</text>

  <!-- Byte markers -->
  <text x="20" y="155" fill="#7e8fa2" font-family="JetBrains Mono" font-size="9">0</text>
  <text x="120" y="155" fill="#7e8fa2" font-family="JetBrains Mono" font-size="9">2</text>
  <text x="310" y="155" fill="#7e8fa2" font-family="JetBrains Mono" font-size="9">18/34</text>
  <text x="400" y="155" fill="#7e8fa2" font-family="JetBrains Mono" font-size="9">19/35</text>
  <text x="660" y="155" fill="#7e8fa2" font-family="JetBrains Mono" font-size="9">500</text>
</svg>
<figcaption>Reticulum packet anatomy — color-coded field breakdown</figcaption>
</div>

## Header Byte 1 (Flags)

| Bit | Field | Values |
|-----|-------|--------|
| 7 | IFAC Flag | `0` = no IFAC, `1` = IFAC signature present |
| 6 | Header Type | `0` = Type 1 (1 address, 16 bytes), `1` = Type 2 (2 addresses, 32 bytes) |
| 5 | Context Flag | Interpretation varies by packet type |
| 4 | Propagation Type | `0` = Broadcast, `1` = Transport |
| 3-2 | Destination Type | `00` = Single, `01` = Group, `10` = Plain, `11` = Link |
| 1-0 | Packet Type | `00` = Data, `01` = Announce, `10` = Link Request, `11` = Proof |

## Header Byte 2 (Hop Count)

A single byte tracking how many transport nodes have forwarded this packet. Incremented at each hop. Range: 0–255 (announce max: 128).

## Address Field

| Header Type | Size | Contents |
|-------------|------|----------|
| Type 1 | 16 bytes | Destination hash only |
| Type 2 | 32 bytes | Destination hash (16) + Transport ID hash (16) |

Type 2 headers are used when a packet is being forwarded by a specific transport node.

## Maximum Data Units

| Type | Size | Description |
|------|------|-------------|
| MTU | **500 bytes** | Maximum total packet size (network-wide) |
| Encrypted MDU | **383 bytes** | Maximum payload for encrypted (Single) destinations |
| Plain MDU | **464 bytes** | Maximum payload for unencrypted (Plain) destinations |

The difference accounts for encryption overhead (ephemeral key, HMAC, padding).

## Why 500 Bytes?

The 500-byte MTU is a deliberate design choice:

- **Universal compatibility** — fits within the constraints of virtually any transport medium, including LoRa
- **Minimal overhead** — small enough that header bytes are a small fraction of payload
- **Simplicity** — one MTU for the entire network, no fragmentation at the protocol level
- **Efficiency** — on bandwidth-constrained links, every byte matters

For data larger than the MDU, use [Resources](../understanding/links-and-communication) over Links, which handle sequencing and reassembly automatically.

## IFAC Packets

When IFAC is active, an Ed25519 signing identity is derived from the IFAC passphrase. Per-packet signatures are generated and prepended before the header. Signatures are truncated to a configurable length (`ifac_size`, default 8 bytes, range 8-512 bits). Receiving interfaces verify the signature and silently drop invalid packets.

## What's Next

- [Protocol Architecture](../understanding/protocol-architecture) — addressing and routing
- [Cryptographic Primitives](../understanding/cryptographic-primitives) — algorithms used
- [Security Model](../understanding/security-model) — threat model
