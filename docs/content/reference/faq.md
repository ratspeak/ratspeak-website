# FAQ

Frequently asked questions about Ratspeak and Reticulum.

## General

### What is the difference between Ratspeak and Reticulum?

**Reticulum** is the mesh networking protocol — it handles encryption, routing, and transport across diverse physical media (LoRa, TCP, WiFi, serial, etc.).

**Ratspeak** is a web dashboard that makes Reticulum accessible through a browser. It provides messaging, contact management, network monitoring, and games — all powered by Reticulum underneath.

Think of it like email: Reticulum is the SMTP/IMAP protocol, and Ratspeak is the email client.

### Do I need internet to use Ratspeak?

No. Ratspeak works over any Reticulum interface — including LoRa radio, which requires no internet infrastructure at all. You can run a fully offline mesh network using RNode hardware.

For remote contacts, you'll typically use TCP connections over the internet, but this isn't required.

### Is Ratspeak free and open source?

Yes. Both Ratspeak-py (Python) and Ratspeak-rs (Rust) are open source. Reticulum is also open source.

### Should I use the Python or Rust version?

| Choose Python if... | Choose Rust if... |
|---------------------|-------------------|
| You're experimenting or learning | You want a single binary with no dependencies |
| You need BLE Mesh support | You want lower resource usage |
| You're extending the codebase | You're deploying on a Raspberry Pi or VPS |
| You prefer pip-based installation | You want the Tauri desktop app |

Both versions have the same features, API, and frontend. They use the same database schema and are interchangeable.

---

## Privacy & Security

### Can anyone read my messages?

No. All messages are end-to-end encrypted using the recipient's public key. Transport nodes forward packets but cannot decrypt them — they don't even know who sent the message (no source address in packets).

### Can transport nodes see my communication patterns?

Reticulum is designed to prevent this. Packets carry only a destination hash — no source address. Transport nodes perform "blind forwarding" based on their path table. They cannot build communication graphs or identify who is talking to whom.

### What encryption does Reticulum use?

- **Key exchange**: X25519 (Elliptic Curve Diffie-Hellman)
- **Signing**: Ed25519
- **Encryption**: AES-256-CBC
- **Key derivation**: HKDF-SHA256
- **Authentication**: HMAC-SHA256

For Link destinations, ephemeral key exchange provides **forward secrecy** — compromising a key doesn't reveal past communications.

### What if someone gets my identity file?

Your identity file contains your private keys. Anyone with it can impersonate you and read messages sent to you. Keep it secure:

- Store backups encrypted
- Don't share it over unencrypted channels
- If compromised, generate a new identity and inform your contacts

### Is Ratspeak anonymous?

Reticulum provides **pseudonymous** communication — your identity is a cryptographic hash, not tied to your real name. However:

- Display names are visible to contacts
- Your IP address is visible to TCP peers (use I2P or Tor for IP anonymity)
- LoRa radio signals can be direction-found with specialized equipment

---

## Messaging

### How long do messages take to deliver?

It depends on the network path:

| Path | Typical Delivery Time |
|------|-----------------------|
| Local network (AutoInterface) | < 1 second |
| TCP over internet | 1-5 seconds |
| LoRa (single hop, low SF) | 5-30 seconds |
| LoRa (multi-hop, high SF) | 30 seconds - 5 minutes |
| Propagation (store-and-forward) | When recipient comes online |

### What's the maximum message size?

- **Single packet** (OPPORTUNISTIC): ~295 bytes of content
- **Direct delivery** (DIRECT): ~319 bytes per packet, auto-escalates to resource transfer for larger messages
- **Resource transfer**: Up to ~3.2 MB
- **File attachments**: 500 KB limit in the dashboard UI

### What happens if the recipient is offline?

Three options:
1. **Wait** — your message stays "pending" until they come online
2. **Propagation node** — send via a propagation node that stores messages and delivers when the recipient connects
3. **Retry** — Ratspeak automatically retries delivery when the contact announces

### Can I send messages to non-Ratspeak users?

Yes! Ratspeak uses standard LXMF for messaging. You can message anyone running an LXMF-compatible client:
- **Sideband** (Android, Linux, macOS)
- **NomadNet** (terminal-based)
- **Any LXMF client**

Game moves (RLAP) will appear as human-readable text in non-Ratspeak clients.

---

## Networking

### What is a transport node?

A transport node is a Reticulum instance with `enable_transport = Yes` that forwards packets for other nodes. Think of it as a router. Regular instances (the default) only handle their own traffic.

Enable transport on:
- Always-on servers and Raspberry Pis
- Well-connected nodes with multiple interfaces
- Central network positions

### How many transport nodes do I need?

For a small network (< 10 nodes): 1-2 transport nodes is sufficient. On LoRa, too many transport nodes waste bandwidth with routing overhead.

**Rule of thumb:** Start with one transport node per network segment (LoRa mesh, TCP hub) and add more only when you notice unreachable nodes.

### What's the range of LoRa?

Depends on conditions:

| Environment | Typical Range |
|-------------|---------------|
| Urban (buildings) | 1-5 km |
| Suburban | 5-15 km |
| Rural (line of sight) | 15-50 km |
| Mountain-to-valley | 50-100+ km |

Range is affected by antenna height, spreading factor, bandwidth, obstacles, and interference.

### Can I bridge LoRa to the internet?

Yes. Run a node with both an RNode (LoRa) interface and a TCP interface, with `enable_transport = Yes`. This bridges the two networks automatically. See [Bridging Networks](../deployment/bridging-networks).

### What's the difference between AutoInterface and TCP?

| Feature | AutoInterface | TCP |
|---------|--------------|-----|
| Discovery | Automatic (multicast) | Manual (host:port) |
| Range | Local network only | Internet-wide |
| Setup | Zero-config | Requires address |
| NAT traversal | No | Requires port forwarding or VPS |

---

## Hardware

### Do I need an RNode?

No. Ratspeak works with TCP, WiFi, and other interfaces without any special hardware. An RNode is only needed for LoRa radio communication.

### What RNode hardware should I buy?

For beginners: **Heltec LoRa32 V3** (~$20). For longer range: **LilyGo T-Beam Supreme** (~$45). See [Supported Boards & Buying Guide](../hardware/supported-boards).

### What's the difference between RatDeck and RatCom?

| Feature | RatDeck | RatCom |
|---------|---------|--------|
| Hardware | LilyGo T-Deck Plus | M5Stack Cardputer |
| Display | 4" 480×320 touch | 1.14" 240×135 |
| Keyboard | Physical QWERTY | Smaller physical keyboard |
| WiFi bridge | Yes (AP mode) | Yes |
| Battery | 3000 mAh | 1400 mAh (typical) |
| Best for | Primary device | Pocket-sized backup |

Both run custom firmware that connects to the Reticulum mesh via built-in LoRa radio.

---

## Games & Apps

### How do games work over LoRa?

Games use the RLAP protocol, which embeds game actions inside tiny LXMF messages. A chess move is about 60 bytes — well within a single LoRa packet. Games are asynchronous by design: you can take minutes, hours, or days between moves.

### What games are available?

Currently: **Chess**. More games are planned. The RLAP protocol is extensible — new apps can be added as plugins.

### Can I play games with Sideband users?

Not interactively. Sideband and other LXMF clients will see human-readable fallback text like "[Ratspeak Chess] Move 5: Nf3" but cannot interact with the game. Full game participation requires Ratspeak.

---

## Deployment

### Can I run Ratspeak on a Raspberry Pi?

Yes. Both Python and Rust versions run well on Raspberry Pi. The Rust version uses less memory and CPU. See [Raspberry Pi Gateway](../deployment/raspberry-pi-gateway).

### Can I run Ratspeak in Docker?

Yes. See [Docker Deployment](../deployment/docker-deployment). Key considerations:
- Use `--network host` for AutoInterface discovery
- Pass through USB devices for RNode access
- Mount a volume for persistent data

### How do I expose Ratspeak to the internet?

Put it behind a reverse proxy (nginx, Caddy) with HTTPS. Set `api_token` in `ratspeak.conf` for authentication. **Never expose the dashboard without authentication.**

## What's Next

- [Troubleshooting](../reference/troubleshooting) — solving specific problems
- [Glossary](../reference/glossary) — terminology reference
- [Configuration Reference](../reference/configuration-reference) — all config options
