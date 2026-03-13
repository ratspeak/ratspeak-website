# What is Reticulum?

Reticulum is a networking protocol that lets you build private, resilient communication networks using whatever hardware you have — radios, WiFi, internet connections, or all of them at once.

## The Core Idea

Reticulum is not a single network — it's a tool for *building* networks. You combine whatever communication hardware you have, and Reticulum handles the rest: routing, encryption, addressing, and authentication.

It works over any medium that can carry data. LoRa radios. WiFi. Ethernet. TCP/IP over the internet. Serial cables. Packet radio. Even I2P anonymous tunnels. If it can move bits, Reticulum can run on it — from 5 bits per second on a slow radio link up to hundreds of megabits on a wired connection.

There are no servers. No accounts. No central authority. You don't register with anyone or ask permission to participate. You generate a cryptographic key pair, and that key pair *is* your identity on the network. Your address comes from your keys, not from a username on someone else's server.

Think of Reticulum like a postal system where everyone is both a sender and a mail carrier. There's no post office — just people passing letters to each other along the best path available.

## Why It Matters

**No infrastructure required.** Two laptops with WiFi can form a Reticulum network right now. Add a LoRa radio and your network extends for kilometers. Add a TCP link and it reaches across the internet. All simultaneously, all automatically. You don't configure routes between these different links — Reticulum figures it out.

**Encryption is built in** — not added as an afterthought. In Reticulum, encryption is so fundamental that the routing itself depends on it. The network uses the randomness of encrypted data to function correctly. Strip away the encryption and the network stops working. Privacy is not a feature you enable; it's a structural requirement.

**Your identity travels with you.** Your address is derived from your cryptographic key, not your physical location or network connection. Switch from WiFi to LoRa to TCP — your address stays the same. You are not tied to an IP range, a cell tower, or an ISP.

**Works when the internet doesn't.** Reticulum was designed for environments where traditional networking fails: natural disasters, remote areas, censored regions, or simply places without cell coverage. If two devices can communicate at all — even over a slow radio channel — they can form a Reticulum network.

**Sender anonymity by default.** Packets carry no source address. Only the intended recipient can verify who sent a message. You don't broadcast your identity every time you communicate.

## Heterogeneous Mesh

One of Reticulum's most powerful properties: a single message can traverse completely different communication mediums seamlessly. A packet might start on a LoRa radio, hop through a WiFi network, cross a TCP tunnel over the internet, and arrive at a device connected via serial port — all without you doing anything special.

Reticulum is medium-agnostic: a single packet can traverse WiFi, LoRa radio, serial links, TCP tunnels, and I2P connections in one path. Every interface type participates as a peer in the same mesh — there is no hierarchy of "better" or "worse" transport media.

Reticulum handles the differences between these links automatically. You don't write routing rules or configure gateways. Each node discovers paths to other nodes and forwards packets accordingly.

## How Addressing Works

In traditional networks, your address is tied to your location. Your IP address tells the network where your device sits in the topology. Move your computer to a different network and your address changes.

Reticulum works differently. Your address is tied to *who you are* — your cryptographic identity. Your destination hash is a 16-byte identifier derived from your public key and application name. It looks like this:

`<13425ec15b621c1d928589718000d814>`

This address stays the same whether you're on WiFi, LoRa, or a serial cable halfway around the world. Your identity is portable. You can move between networks, switch communication mediums, or connect through multiple links at once — your address never changes.

## At a Glance

| Property | Detail |
|---|---|
| Minimum speed | 5 bits per second |
| Maximum packet size | 500 bytes |
| Encrypted connection setup | 297 bytes (3 packets) |
| Address size | 16 bytes (128-bit hash) |
| Identity | 512-bit key pair (signing + encryption) |
| Central infrastructure | None required |

> **Tip**: Those numbers are not typos. Reticulum is designed to work in extremely constrained environments. The entire handshake to establish an encrypted connection fits in three small packets.

## Status

Reticulum reached stable release (v1.0.0) in July 2025, exiting beta. The wire format and API are considered stable. The current version is 1.1.4 (March 2026).

The protocol specification is in the **public domain** — it belongs to humanity. The reference implementation is open source under the Reticulum License, which permits all use except systems designed to harm people.

The reference implementation was created and is maintained by Mark Qvist, who is developing reticulum in his own private repo which is being mirrored to github. Commits can be submitted via email or LXMF, a messaging protocol built
on reticulum. The codebase is distributed across hundreds of thousands of devices.

> **Note**: Reticulum has not been externally security audited. While the cryptographic design follows best practices, use appropriate caution for high-stakes applications.

## What Reticulum Is Not

- **Not a VPN** — it's a complete networking stack, not a tunnel over IP
- **Not LoRaWAN** — RNode uses LoRa radio chips but a completely different protocol
- **Not Meshtastic** — Meshtastic floods messages to all nodes; Reticulum uses intelligent routing
- **Not a blockchain** — no tokens, no consensus, no ledger
- **Not just for emergencies** — works for everyday private communication

## What's Next

- [How They Work Together](../introduction/how-they-work-together) — understand the architecture
- [Key Concepts](../introduction/key-concepts) — essential terminology
- [Choosing Your Setup](../getting-started/choosing-your-setup) — pick the right installation
