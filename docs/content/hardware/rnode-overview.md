# RNode Overview

RNode is the open-source LoRa radio interface that gives Reticulum long-range wireless capability — turning inexpensive hardware into powerful mesh radios.

## What Is RNode?

RNode is firmware that runs on LoRa-capable microcontroller boards, turning them into Reticulum-native radio interfaces. Unlike LoRaWAN devices, RNode uses a **custom MAC layer** optimized for Reticulum's mesh networking — no gateways, no network servers, no cloud infrastructure.

An RNode connects to your computer (or runs standalone) and provides a radio interface that Reticulum uses like any other network connection. Messages are encrypted end-to-end by Reticulum before they reach the radio — RNode simply transmits and receives packets.

## Key Properties

| Property | Value |
|----------|-------|
| **Range** | 1–50+ km (terrain/antenna dependent) |
| **Speed** | ~37 bps to ~11 Kbps (depends on preset) |
| **Protocol** | Custom MAC layer (not LoRaWAN) |
| **Encryption** | Handled by Reticulum (end-to-end) |
| **Connection** | USB serial, Bluetooth LE, or WiFi TCP |
| **Power** | Low — solar/battery capable |
| **Cost** | ~$25–100 USD depending on board (as of early 2025) |

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
