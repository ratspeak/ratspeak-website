# Links & Communication

Encrypted bidirectional channels — the 297-byte handshake, forward secrecy, resources, channels, and request/response.

## Link Establishment

Links provide encrypted, bidirectional communication with **forward secrecy** and **initiator anonymity**. The entire handshake takes just **3 packets totaling 297 bytes**.

### The Handshake

```
Step 1: LINK REQUEST (Initiator → Network)
  Initiator generates ephemeral X25519 keypair
  Broadcasts request containing public key (LKi)
  No source address — initiator is anonymous

Step 2: LINK PROOF (Destination → Initiator)
  Destination generates ephemeral X25519 keypair
  Performs ECDH key exchange with LKi
  Transmits proof with public key (LKr) + Ed25519 signature

Step 3: CHANNEL ACTIVATION (Initiator, local)
  Initiator performs ECDH with LKr
  Derives symmetric encryption key via HKDF
  Bidirectional AES-256-CBC encrypted channel established
  Link identified by hash of entire initial packet
```

### Key Properties

- **Initiator anonymity** — no source address is transmitted; only the destination can know who initiated
- **Forward secrecy** — ephemeral keys mean past sessions stay secure even if long-term keys are compromised
- **Low overhead** — 0.45 bits per second per active link for keepalives
- **Scalable** — at 1200 bps, 100 concurrent links use only ~4% of channel capacity

### Link Timers

| Timer | Value | Purpose |
|-------|-------|---------|
| Establishment timeout | 6 seconds per hop | Max time to establish a link |
| Keepalive interval | 360 seconds | Periodic proof-of-life |
| Stale timeout | 720 seconds | Link considered dead |

## Resources

For data transfers larger than the 383-byte encrypted MDU, Reticulum provides **Resources**:

- Automatic **compression** and **sequencing**
- **Integrity verification** and **reassembly**
- **Progress tracking** (0.0 to 1.0)
- Works over established links

Resources handle all the complexity of large data transfer over a 500-byte MTU network.

## Channels

Channels provide **reliable, bidirectional messaging** throughout a link's lifetime:

- Messages are size-constrained to single packets
- Continuous message exchange (unlike fire-and-forget packets)
- Delivery guarantees within the link session

## Buffers

Built on top of Channels, Buffers provide a familiar stream abstraction:

- `BufferedReader` for reading sequential byte streams
- `BufferedWriter` for writing sequential byte streams
- Useful for protocols that expect stream-oriented I/O

## Request / Response

An RPC-like mechanism over links:

- Send a request with parameters
- Receive a response from the destination
- Supports progress tracking and timeouts
- Useful for remote procedure calls and queries

## What's Next

- [Protocol Architecture](../understanding/protocol-architecture) — addressing and routing
- [Wire Format](../understanding/wire-format) — packet structure
- [Cryptographic Primitives](../understanding/cryptographic-primitives) — the crypto underneath
