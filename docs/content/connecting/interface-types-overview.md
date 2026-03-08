# Interface Types Overview

A comparison of all interface types available in Reticulum and which can be managed through the Ratspeak UI.

## Comparison Table

| Interface | Medium | Speed | Range | Managed via UI | Restart Required |
|-----------|--------|-------|-------|:--------------:|:----------------:|
| **AutoInterface** | WiFi / LAN | ~54 Mbps+ | Local network | Yes | Yes |
| **TCPClient** | Internet / IP | Varies | Global | Yes | Yes |
| **TCPServer** | Internet / IP | Varies | Global | Yes | Yes |
| **RNode (LoRa)** | Radio (ISM) | 300 bps – 21 Kbps | 1–50+ km | Yes | Yes |
| **BLE Mesh** | Bluetooth LE | ~100 Kbps | ~30 m | Yes | No |
| **UDPInterface** | IP / broadcast | Varies | Network | Config only | Yes |
| **I2PInterface** | I2P overlay | Varies | Global | Config only | Yes |
| **SerialInterface** | Serial port | Up to 115200 | Cable length | Config only | Yes |
| **PipeInterface** | stdin/stdout | Varies | N/A | Config only | Yes |
| **KISSInterface** | Packet radio | 1200–9600 | Varies | Config only | Yes |
| **BackboneInterface** | TCP (Linux and Android) | Very high | Global | Config only | Yes |

## Choosing an Interface

<div class="docs-diagram">
<svg viewBox="0 0 680 360" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Start -->
  <rect x="250" y="10" width="180" height="36" rx="18" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.1)"/>
  <text x="340" y="33" text-anchor="middle" fill="#00D4AA" font-family="Outfit" font-size="12" font-weight="600">What's your use case?</text>

  <!-- Branch: Same Network? -->
  <line x1="260" y1="46" x2="140" y2="80" stroke="#3a4759" stroke-width="1"/>
  <line x1="420" y1="46" x2="540" y2="80" stroke="#3a4759" stroke-width="1"/>

  <!-- Left: Local -->
  <rect x="60" y="80" width="160" height="30" rx="6" stroke="#F59E0B" stroke-width="1" fill="rgba(245,158,11,0.06)"/>
  <text x="140" y="100" text-anchor="middle" fill="#F59E0B" font-family="Outfit" font-size="11" font-weight="600">Same LAN / WiFi?</text>

  <!-- Right: Remote -->
  <rect x="460" y="80" width="160" height="30" rx="6" stroke="#38BDF8" stroke-width="1" fill="rgba(56,189,248,0.06)"/>
  <text x="540" y="100" text-anchor="middle" fill="#38BDF8" font-family="Outfit" font-size="11" font-weight="600">Remote / Internet?</text>

  <!-- Local -> AutoInterface -->
  <line x1="140" y1="110" x2="140" y2="140" stroke="#3a4759" stroke-width="1"/>
  <rect x="60" y="140" width="160" height="44" rx="8" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.08)"/>
  <text x="140" y="158" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="11" font-weight="600">AutoInterface</text>
  <text x="140" y="174" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Zero-config discovery</text>

  <!-- Remote branches -->
  <line x1="490" y1="110" x2="420" y2="150" stroke="#3a4759" stroke-width="1"/>
  <line x1="590" y1="110" x2="660" y2="150" stroke="#3a4759" stroke-width="1"/>

  <!-- TCP -->
  <rect x="340" y="150" width="160" height="44" rx="8" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.08)"/>
  <text x="420" y="168" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="11" font-weight="600">TCP Client/Server</text>
  <text x="420" y="184" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Direct IP connection</text>

  <!-- I2P -->
  <rect x="580" y="150" width="100" height="44" rx="8" stroke="#C084FC" stroke-width="1" fill="rgba(192,132,252,0.06)"/>
  <text x="630" y="168" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="10" font-weight="600">I2P</text>
  <text x="630" y="184" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Anonymous overlay</text>

  <!-- Center: Off-grid? -->
  <line x1="340" y1="46" x2="340" y2="80" stroke="#3a4759" stroke-width="1"/>
  <rect x="260" y="220" width="160" height="30" rx="6" stroke="#00D4AA" stroke-width="1" fill="rgba(0,212,170,0.06)"/>
  <text x="340" y="240" text-anchor="middle" fill="#00D4AA" font-family="Outfit" font-size="11" font-weight="600">Off-grid / No internet?</text>

  <!-- Off-grid branches -->
  <line x1="290" y1="250" x2="200" y2="280" stroke="#3a4759" stroke-width="1"/>
  <line x1="390" y1="250" x2="480" y2="280" stroke="#3a4759" stroke-width="1"/>

  <!-- LoRa -->
  <rect x="120" y="280" width="160" height="44" rx="8" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.08)"/>
  <text x="200" y="298" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="11" font-weight="600">RNode (LoRa)</text>
  <text x="200" y="314" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Long range radio</text>

  <!-- BLE -->
  <rect x="400" y="280" width="160" height="44" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.08)"/>
  <text x="480" y="298" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="11" font-weight="600">BLE Mesh</text>
  <text x="480" y="314" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Short range, no restart</text>

  <!-- Arrow from center down -->
  <line x1="340" y1="80" x2="340" y2="220" stroke="#3a4759" stroke-width="1" stroke-dasharray="4 3"/>
</svg>
<figcaption>Interface decision flowchart based on use case</figcaption>
</div>

## UI-Managed vs Config-Only

Interfaces managed through the Ratspeak UI can be added and removed dynamically. Config-only interfaces require editing the RNS config file directly and restarting rnsd.

All UI-managed interfaces (except BLE) modify the hub node's config file and trigger a safe restart. BLE Mesh registers directly with the RNS transport layer at runtime — no restart needed.

## What's Next

- [TCP Connections](../connecting/tcp-connections) — connecting over IP
- [LoRa / RNode](../connecting/lora-rnode) — long-range radio
- [WiFi & LAN](../connecting/wifi-lan) — local network discovery
- [BLE Mesh](../connecting/ble-mesh) — Bluetooth mesh
- [Interface Modes](../connecting/interface-modes) — controlling interface behavior
