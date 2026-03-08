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

<div class="docs-diagram">
<svg viewBox="0 0 720 200" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- LoRa Node -->
  <rect x="20" y="70" width="100" height="60" rx="8" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.08)"/>
  <text x="70" y="95" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="11" font-weight="600">LoRa</text>
  <text x="70" y="115" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="10">~300 bps</text>
  <!-- Radio waves -->
  <path d="M120 100 Q140 80 160 100" stroke="#00D4AA" stroke-width="1" stroke-dasharray="4 3" opacity="0.6"/>
  <path d="M125 100 Q140 85 155 100" stroke="#00D4AA" stroke-width="1" stroke-dasharray="4 3" opacity="0.4"/>
  <!-- WiFi Node -->
  <rect x="170" y="70" width="100" height="60" rx="8" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.08)"/>
  <text x="220" y="95" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="11" font-weight="600">WiFi</text>
  <text x="220" y="115" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="10">~54 Mbps</text>
  <!-- Arrow -->
  <line x1="270" y1="100" x2="318" y2="100" stroke="#3a4759" stroke-width="1.5"/>
  <polygon points="318,96 326,100 318,104" fill="#3a4759"/>
  <!-- TCP Node -->
  <rect x="330" y="70" width="100" height="60" rx="8" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.08)"/>
  <text x="380" y="95" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="11" font-weight="600">TCP</text>
  <text x="380" y="115" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="10">Internet</text>
  <!-- Arrow -->
  <line x1="430" y1="100" x2="478" y2="100" stroke="#3a4759" stroke-width="1.5"/>
  <polygon points="478,96 486,100 478,104" fill="#3a4759"/>
  <!-- Serial Node -->
  <rect x="490" y="70" width="100" height="60" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.08)"/>
  <text x="540" y="95" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="11" font-weight="600">Serial</text>
  <text x="540" y="115" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="10">115200 bps</text>
  <!-- Arrow -->
  <line x1="590" y1="100" x2="618" y2="100" stroke="#3a4759" stroke-width="1.5"/>
  <polygon points="618,96 626,100 618,104" fill="#3a4759"/>
  <!-- Destination -->
  <rect x="630" y="70" width="70" height="60" rx="8" stroke="#00D4AA" stroke-width="2" fill="rgba(0,212,170,0.12)"/>
  <circle cx="665" cy="92" r="8" stroke="#00D4AA" stroke-width="1.5" fill="none"/>
  <text x="665" y="120" text-anchor="middle" fill="#e2e8f0" font-family="Outfit" font-size="10">Dest</text>
  <!-- Packet dot traveling -->
  <circle r="4" fill="#00D4AA" opacity="0.9">
    <animate attributeName="cx" values="70;220;380;540;665" dur="4s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="100;100;100;100;100" dur="4s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.9;0.9;0.9;0.9;0" dur="4s" repeatCount="indefinite"/>
  </circle>
  <!-- Label -->
  <text x="360" y="170" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="12" font-style="italic">A single packet traversing four different mediums</text>
</svg>
<figcaption>A single packet traversing four different communication mediums seamlessly</figcaption>
</div>

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

Reticulum reached stable release (v1.0.0) in July 2025, exiting beta. The wire format and API are considered stable. The current version is 1.1.3 (January 2026).

The protocol specification is in the **public domain** — it belongs to humanity. The reference implementation is open source under the Reticulum License, which permits all use except systems designed to harm people.

The reference implementation was created by Mark Qvist, who stepped back from active development in December 2025. The codebase is distributed across hundreds of thousands of devices.

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
