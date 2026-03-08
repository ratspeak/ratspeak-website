# RNode Overview

RNode is the open-source LoRa radio interface that gives Reticulum long-range wireless capability — turning inexpensive hardware into powerful mesh radios.

## What Is RNode?

RNode is firmware that runs on LoRa-capable microcontroller boards, turning them into Reticulum-native radio interfaces. Unlike LoRaWAN devices, RNode uses a **custom MAC layer** optimized for Reticulum's mesh networking — no gateways, no network servers, no cloud infrastructure.

An RNode connects to your computer (or runs standalone) and provides a radio interface that Reticulum uses like any other network connection. Messages are encrypted end-to-end by Reticulum before they reach the radio — RNode simply transmits and receives packets.

<div class="docs-diagram">
<svg viewBox="0 0 700 180" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Computer -->
  <rect x="20" y="50" width="120" height="60" rx="8" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.08)"/>
  <text x="80" y="75" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="11" font-weight="600">Ratspeak</text>
  <text x="80" y="95" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Your computer</text>

  <!-- USB/BLE/TCP arrow -->
  <line x1="140" y1="80" x2="210" y2="80" stroke="#00D4AA" stroke-width="1.5"/>
  <polygon points="210,76 218,80 210,84" fill="#00D4AA"/>
  <text x="178" y="72" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">USB / BLE / TCP</text>

  <!-- RNode -->
  <rect x="220" y="40" width="130" height="80" rx="10" stroke="#00D4AA" stroke-width="2" fill="rgba(0,212,170,0.10)"/>
  <text x="285" y="68" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="13" font-weight="600">RNode</text>
  <text x="285" y="86" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">LoRa radio interface</text>
  <text x="285" y="104" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Custom MAC layer</text>

  <!-- Radio waves -->
  <path d="M360 70 Q380 60 380 80 Q380 100 360 90" stroke="#F59E0B" stroke-width="1.5" fill="none" stroke-dasharray="4 2"/>
  <path d="M380 65 Q405 50 405 80 Q405 110 380 95" stroke="#F59E0B" stroke-width="1" fill="none" stroke-dasharray="4 2" opacity="0.6"/>

  <!-- Animated radio packet -->
  <circle r="3" fill="#F59E0B" opacity="0.8">
    <animate attributeName="cx" values="360;550" dur="2s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="80;80" dur="2s" repeatCount="indefinite"/>
  </circle>

  <!-- Remote RNode -->
  <rect x="550" y="40" width="130" height="80" rx="10" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.08)"/>
  <text x="615" y="68" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="13" font-weight="600">Remote</text>
  <text x="615" y="86" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Another RNode</text>
  <text x="615" y="104" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">1–50+ km away</text>

  <text x="450" y="55" text-anchor="middle" fill="#F59E0B" font-family="Outfit" font-size="10" font-style="italic">LoRa radio link</text>
  <text x="350" y="155" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="11" font-style="italic">Encrypted packets travel over radio — no internet required</text>
</svg>
<figcaption>RNode provides a LoRa radio interface between Reticulum nodes</figcaption>
</div>

## Key Properties

| Property | Value |
|----------|-------|
| **Range** | 1–50+ km (terrain/antenna dependent) |
| **Speed** | ~300 bps to ~21 Kbps (depends on settings) |
| **Protocol** | Custom MAC layer (not LoRaWAN) |
| **Encryption** | Handled by Reticulum (end-to-end) |
| **Connection** | USB serial, Bluetooth LE, or WiFi TCP |
| **Power** | Low — solar/battery capable |
| **Cost** | ~$25–100 USD depending on board |

## RNode vs LoRaWAN

RNode is **not** a LoRaWAN device. Key differences:

| | RNode | LoRaWAN |
|---|-------|---------|
| **Architecture** | Peer-to-peer mesh | Star topology with gateways |
| **Infrastructure** | None required | Requires gateways + network server |
| **Encryption** | End-to-end (Reticulum) | Network-level (keys shared with operator) |
| **Data routing** | Decentralized, multi-hop | Centralized through network server |
| **Cost** | Hardware only | Hardware + service fees |

## How to Get an RNode

Three options:

1. **Flash your own** — buy a [supported board](../hardware/supported-boards) and use `rnodeconf --autoinstall` to flash RNode firmware
2. **Buy pre-made** — purchase from [unsigned.io](https://unsigned.io) or community vendors
3. **Use Ratspeak hardware** — [RatDeck](../hardware/ratdeck) and [RatCom](../hardware/ratcom) include integrated LoRa radios

## Connection Methods

RNode connects to your Reticulum instance three ways:

### USB Serial
Plug in via USB. Most common and reliable method.
```ini
[[LoRa Radio]]
  type = RNodeInterface
  port = /dev/ttyUSB0
```

### Bluetooth LE
Wireless connection to nearby RNode.
```ini
[[LoRa Radio]]
  type = RNodeInterface
  port = ble://RNode 3B87
```

### WiFi TCP
Connect over local network to RNode with WiFi.
```ini
[[LoRa Radio]]
  type = RNodeInterface
  port = tcp://10.0.0.1
```

## What's Next

- [Supported Boards & Buying Guide](../hardware/supported-boards) — which hardware to buy
- [Flashing Firmware](../hardware/flashing-firmware) — install RNode firmware
- [LoRa with RNode](../connecting/lora-rnode) — configure LoRa parameters
- [Antennas, Range & Power](../hardware/antennas-range-power) — maximize performance
