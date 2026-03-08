# Links & Communication

Encrypted bidirectional channels — the 297-byte handshake, forward secrecy, resources, channels, and request/response.

## Link Establishment

Links provide encrypted, bidirectional communication with **forward secrecy** and **initiator anonymity**. The entire handshake takes just **3 packets totaling 297 bytes**.

<div class="docs-diagram">
<svg viewBox="0 0 680 280" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Initiator -->
  <rect x="40" y="20" width="120" height="40" rx="8" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.08)"/>
  <text x="100" y="44" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="12" font-weight="600">Initiator</text>
  <line x1="100" y1="60" x2="100" y2="250" stroke="#00D4AA" stroke-width="1" stroke-dasharray="4 3" opacity="0.3"/>

  <!-- Destination -->
  <rect x="440" y="20" width="120" height="40" rx="8" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.08)"/>
  <text x="500" y="44" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="12" font-weight="600">Destination</text>
  <line x1="500" y1="60" x2="500" y2="250" stroke="#38BDF8" stroke-width="1" stroke-dasharray="4 3" opacity="0.3"/>

  <!-- Step 1: Link Request -->
  <text x="50" y="95" fill="#e2e8f0" font-family="Outfit" font-size="11" font-weight="600">1.</text>
  <line x1="100" y1="90" x2="500" y2="90" stroke="#00D4AA" stroke-width="1.5"/>
  <polygon points="495,86 503,90 495,94" fill="#00D4AA"/>
  <text x="300" y="84" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="10">LINK REQUEST</text>
  <text x="300" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">Ephemeral X25519 pubkey (LKi) + destination</text>
  <text x="300" y="120" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">No source address — initiator is anonymous</text>

  <!-- Step 2: Link Proof -->
  <text x="540" y="160" fill="#e2e8f0" font-family="Outfit" font-size="11" font-weight="600">2.</text>
  <line x1="500" y1="155" x2="100" y2="155" stroke="#38BDF8" stroke-width="1.5"/>
  <polygon points="105,151 97,155 105,159" fill="#38BDF8"/>
  <text x="300" y="149" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="10">LINK PROOF</text>
  <text x="300" y="173" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">Ephemeral X25519 pubkey (LKr) + Ed25519 signature</text>
  <text x="300" y="185" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">ECDH: LKi x LKr = shared secret</text>

  <!-- Step 3: Channel Active -->
  <text x="50" y="225" fill="#e2e8f0" font-family="Outfit" font-size="11" font-weight="600">3.</text>
  <line x1="100" y1="220" x2="500" y2="220" stroke="#C084FC" stroke-width="2"/>
  <line x1="500" y1="225" x2="100" y2="225" stroke="#C084FC" stroke-width="2"/>
  <text x="300" y="214" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="10">ENCRYPTED CHANNEL</text>
  <text x="300" y="245" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">HKDF → AES-256-CBC symmetric key</text>
  <text x="300" y="257" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Bidirectional, forward-secret communication</text>
  <text x="300" y="272" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="8" font-style="italic">Step 3 is local: initiator performs ECDH and derives the key. Only 2 over-the-wire packets are exchanged.</text>

  <!-- Total cost -->
  <rect x="580" y="85" width="90" height="90" rx="8" stroke="#3a4759" stroke-width="1" fill="rgba(45,55,72,0.3)"/>
  <text x="625" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Total cost:</text>
  <text x="625" y="128" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="16" font-weight="700">297</text>
  <text x="625" y="144" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">bytes</text>
  <text x="625" y="162" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">3 packets</text>
</svg>
<figcaption>Link establishment: ephemeral ECDH key exchange in 3 packets</figcaption>
</div>

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
