# Wire Format

The binary structure of Reticulum packets — header fields, addressing, and the 500-byte MTU.

## Packet Structure

Every Reticulum packet follows this format:

```
[HEADER: 2 bytes] [ADDRESSES: 16 or 32 bytes] [CONTEXT: 1 byte] [DATA: 0-465 bytes]
```

**Total maximum size: 500 bytes** (network-wide MTU, fixed).

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

When IFAC is active, an Ed25519 signing identity is derived from the IFAC passphrase. Per-packet signatures are generated and inserted before transmission. Signatures are truncated to a configurable length (`ifac_size`, range 8-512 bits). Receiving interfaces verify the signature and silently drop invalid packets.

## What's Next

- [Protocol Architecture](../understanding/protocol-architecture) — addressing and routing
- [Cryptographic Primitives](../understanding/cryptographic-primitives) — algorithms used
- [Security Model](../understanding/security-model) — threat model
