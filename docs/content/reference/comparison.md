# Ratspeak vs Other Clients

How Ratspeak compares to other Reticulum/LXMF messaging clients and alternative mesh communication platforms.

## LXMF Client Comparison

All LXMF clients can send messages to each other. They differ in interface, features, and platform support.

| Feature | Ratspeak | Sideband | NomadNet |
|---------|----------|----------|----------|
| **Interface** | Web browser | Native app | Terminal |
| **Platforms** | Any (browser) | Android, Linux, macOS | Any (Python) |
| **Messaging** | Yes | Yes | Yes |
| **File attachments** | Yes (500 KB) | Yes | Yes |
| **Emoji reactions** | Yes | No | No |
| **Reply threading** | Yes | No | No |
| **Full-text search** | Yes (FTS5) | No | No |
| **Games (LRGP)** | Yes (Tic-Tac-Toe) | No | No |
| **Network graph** | Yes (D3.js) | No | No |
| **Interface management** | Yes (GUI) | Limited | No (config file) |
| **Multi-identity** | Yes (hot-swap) | Yes | No |
| **Propagation node** | Use only | Run + Use | Run + Use |
| **Node pages** | No | No | Yes |
| **Location sharing** | No | Yes | No |
| **Audio messages** | No | Yes | No |
| **Telemetry** | No | Yes | No |
| **Offline operation** | Yes | Yes | Yes |
| **LoRa support** | Via RNode | Via RNode | Via RNode |

### When to Use Each

**Ratspeak** is best when you want:
- A visual dashboard for monitoring your mesh network
- Browser-based access from any device
- Interactive games over mesh
- Network topology visualization
- Multi-identity management with a GUI

**Sideband** is best when you want:
- A mobile messenger (Android)
- Location sharing and telemetry
- Audio messages
- A traditional chat app experience

**NomadNet** is best when you want:
- Terminal-based operation (SSH-friendly)
- Node pages (mesh-hosted content)
- Lightweight resource usage
- Running a propagation node

## Mesh Platform Comparison

How does Reticulum (and by extension Ratspeak) compare to other mesh communication platforms?

| Feature | Reticulum + Ratspeak | Meshtastic | Briar | Signal |
|---------|---------------------|------------|-------|--------|
| **Network type** | Mesh (any medium) | LoRa mesh only | Tor/WiFi/BT | Centralized servers |
| **Encryption** | E2E (X25519 + AES-256) | E2E (AES-256) | E2E (Signal Protocol) | E2E (Signal Protocol) |
| **Internet required** | No | No | No (Tor optional) | Yes |
| **LoRa support** | Yes | Yes (primary) | No | No |
| **TCP/IP support** | Yes | Limited | Tor | Yes |
| **Bandwidth range** | 5 bps - Gbps | LoRa only | Internet-speed | Internet-speed |
| **Address system** | Cryptographic hash | Node number | Cryptographic | Phone number |
| **Central servers** | None | None | None | Yes (Signal servers) |
| **Metadata protection** | No source addresses | Limited | Strong (Tor) | Sealed sender |
| **Max message size** | ~3.2 MB | 237 bytes | Unlimited | Unlimited |
| **Multi-hop routing** | Yes (128 max) | Yes (7 max) | Tor circuits | N/A |
| **Identity system** | Ed25519 keypair | Device-based | Ed25519 keypair | Phone number |
| **Open source** | Yes | Yes | Yes | Partial (as of early 2025) |

### Reticulum vs Meshtastic

Both support LoRa mesh networking, but with different philosophies:

**Reticulum advantages:**
- Works over **any** medium (LoRa, TCP, WiFi, serial, I2P, etc.)
- Much larger messages (3.2 MB vs 237 bytes)
- Stronger privacy (no source addresses, blind forwarding)
- More sophisticated routing (128 hops, announce-based convergence)
- Bandwidth from 5 bps to Gbps

**Meshtastic advantages:**
- Simpler setup (flash and go)
- Larger community
- Better mobile app
- More consumer-friendly
- Position sharing built-in

**Key difference**: Meshtastic is a LoRa messenger. Reticulum is a mesh networking protocol that happens to support LoRa among many other transports.

### Reticulum vs Traditional Messengers

**Why choose Reticulum/Ratspeak over Signal, Matrix, etc.?**
- Works without internet
- No phone number or email required
- No central servers to trust, compromise, or shut down
- Works over LoRa radio for off-grid communication
- No metadata collection possible (no source addresses)

**Why choose traditional messengers?**
- Larger user base
- Better mobile apps
- Higher bandwidth for voice/video calls
- Easier onboarding (phone number vs destination hash)

## Feature Highlights Unique to Ratspeak

### Interactive Games (LRGP)

Ratspeak is the only LXMF client that supports multiplayer games over mesh. The LRGP protocol enables turn-based games (like Tic-Tac-Toe) that work asynchronously — even over LoRa with minutes between moves.

### Network Visualization

Real-time D3.js force-directed graph showing your mesh network topology — nodes, interfaces, connection status, and path information.

### Interface Management

Add and configure Reticulum interfaces (RNode, TCP, AutoInterface) directly from the browser — no manual config file editing required.

### Full-Text Message Search

FTS5-powered search across all messages, with identity-scoped results for multi-identity users.

## What's Next

- [Ecosystem & Community](../reference/ecosystem) — the broader Reticulum ecosystem
- [What is Ratspeak?](../introduction/what-is-ratspeak) — product overview
- [Key Concepts](../introduction/key-concepts) — core terminology
