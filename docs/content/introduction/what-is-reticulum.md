# What Is Reticulum?

A cryptography-based networking stack that lets you build resilient, private communication networks over any medium.

## The Core Idea

Reticulum is not a network — it's a tool to **build** networks. It provides a complete networking stack that works over virtually any communication medium, from a 300 bps radio link to a 10 Gbps fiber connection. WiFi, LoRa, serial ports, TCP/IP, I2P, satellite links — if it can carry data, Reticulum can run on it.

Unlike traditional networking, Reticulum doesn't need IP addresses, DNS servers, certificate authorities, or any central infrastructure. Every participant generates a cryptographic identity — a pair of mathematically linked keys used for encryption and signing, and everything flows from there: addressing, routing, encryption, and authentication.

## Key Properties

- **Hardware agnostic** — works from 5 bps to multi-gigabit, across LoRa radios, WiFi, Ethernet, serial lines, TCP tunnels, and more
- **Encryption is fundamental** — not bolted on as an afterthought. Routing itself depends on the randomness of encrypted packet data — meaning encryption isn't just a privacy feature, it's structurally required for the network to function
- **No central infrastructure** — no servers, no registries, no authorities. Every node is an equal peer
- **Tiny footprint** — the maximum packet size (MTU) is 500 bytes. Establishing an encrypted connection takes just 297 bytes. A destination address is 16 bytes
- **Sender anonymity** — packets carry no source address. Only the destination can prove who sent a message
- **Delay tolerant** — store-and-forward — where messages are held until the recipient comes online — is a first-class mode, not a fallback

## How Addressing Works

In traditional networks, your address is tied to your location (IP address). In Reticulum, your address is tied to **who you are** — specifically, to your cryptographic identity.

Your **destination hash** is a 16-byte truncated SHA-256 hash derived from your public key and application name. It looks like this:

```
<13425ec15b621c1d928589718000d814>
```

This address is the same whether you're connected via WiFi, LoRa, or a serial cable halfway around the world. Your identity is portable and location-independent.

## Heterogeneous Mesh

One of Reticulum's most powerful properties is its ability to seamlessly mix different communication mediums. A single packet might traverse a LoRa radio link, hop through a WiFi mesh, cross a TCP tunnel over the internet, and arrive at a device connected via serial port — all transparently.

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
</div>

## Status

Reticulum reached **stable release (v1.0.0)** in July 2025, exiting beta. The wire format and API are considered stable. The current version is **1.1.3**. The protocol specification is in the **public domain** — it belongs to humanity. The reference implementation carries the Reticulum License, which permits all use except systems designed to harm people.

The reference implementation was created by Mark Qvist, who stepped back from active development in December 2025. The codebase is open source and distributed across hundreds of thousands of devices.

> **Note**: Reticulum has not been externally security audited. While the cryptographic design is sound, use it with appropriate caution for high-stakes applications.

## What Reticulum Is Not

- **Not a VPN** — it's a complete networking stack, not a tunnel over IP
- **Not LoRaWAN** — RNode uses LoRa radio chips but its own communication protocol, not the LoRaWAN protocol
- **Not a blockchain** — there are no tokens, no consensus mechanism, no ledger
- **Not just for emergencies** — it works great for everyday private communication

## Next Steps

- [What Is Ratspeak?](../introduction/what-is-ratspeak) — the dashboard that makes Reticulum accessible
- [Key Concepts](../introduction/key-concepts) — essential terminology explained
- [Installing Ratspeak](../getting-started/installing-ratspeak) — get up and running
