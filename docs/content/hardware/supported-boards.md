# Supported Boards & Buying Guide

Which hardware to buy for RNode, where to get it, and how to choose the right board for your needs.

## Supported Boards

RNode firmware runs on 14+ boards across three microcontroller platforms. All can be flashed with `rnodeconf --autoinstall`.

### LilyGO (ESP32-based)

| Board | Transceiver | Notable Features |
|-------|-------------|-----------------|
| **T-Beam Supreme** | SX1262 / SX1268 | GPS, large battery holder, best all-around |
| **T-Beam** | SX1262 / SX1276 / SX1278 | GPS, battery holder, widely available |
| **T3S3** | SX1262 / SX1276 / SX1278 | Compact, no GPS, good for fixed nodes |
| **T-Deck** | SX1262 / SX1268 | Display + keyboard (also used by RatDeck) |
| **LoRa32 v2.1** | SX1276 / SX1278 | Small OLED display, affordable |
| **LoRa32 v2.0** | SX1276 / SX1278 | Older revision, still supported |
| **LoRa32 v1.0** | SX1276 / SX1278 | Original model |

### Heltec (ESP32-based)

| Board | Transceiver | Notable Features |
|-------|-------------|-----------------|
| **LoRa32 v4.0** | SX1262 | Latest model, compact |
| **LoRa32 v3.0** | SX1262 / SX1268 | OLED display, USB-C |
| **LoRa32 v2.0** | SX1276 / SX1278 | Budget option |

### nRF52-based

| Board | Transceiver | Notable Features |
|-------|-------------|-----------------|
| **RAK4631** | SX1262 / SX1268 | Modular, industrial-grade |
| **OpenCom XL** | SX1262 + SX1280 | Dual-band (sub-GHz + 2.4 GHz), nRF52 |
| **LilyGO T-Echo** | SX1262 / SX1268 | E-ink display, very low power |
| **Heltec T114** | SX1262 / SX1268 | Compact nRF52 board |

### Other

| Board | Transceiver | Notable Features |
|-------|-------------|-----------------|
| **Unsigned RNode v2.x** | SX1276 / SX1278 | Original RNode hardware by the creator |

## Transceiver Comparison

| IC | Frequency | Best For |
|----|-----------|----------|
| **SX1262** | 150–960 MHz | General use, all regions, modern and efficient |
| **SX1268** | 150–960 MHz | Optimized for 470 MHz (China band) |
| **SX1276** | 137–1020 MHz | Legacy, widely available, cost-effective |
| **SX1278** | 137–525 MHz | 433 MHz band specialist |
| **SX1280** | 2.4 GHz | High-speed short-range (OpenCom XL only) |

> **Tip**: For new purchases, choose boards with **SX1262** — it's the most modern, power-efficient, and versatile transceiver.

## Buying Recommendations

### Best for Beginners
**LilyGO T-Beam Supreme** (~$35–50 as of early 2025) — GPS, battery holder, SX1262, widely documented. Plug in a battery and antenna, flash with `rnodeconf`, and you're on the mesh.

### Best Budget Option
**Heltec LoRa32 v3.0** (~$18–25 as of early 2025) — Compact, USB-C, OLED display, SX1262. Great value for fixed nodes.

### Best for Portable Use
**LilyGO T-Echo** (~$30–40 as of early 2025) — nRF52 with e-ink display, extremely low power consumption. Ideal for battery-powered field use.

### Best for Dual-Band
**OpenCom XL** — nRF52 with both SX1262 (sub-GHz) and SX1280 (2.4 GHz) transceivers. Run two radio links simultaneously with `RNodeMultiInterface`.

### Best Standalone Device
**RatDeck** (LilyGO T-Deck Plus) or **RatCom** (M5Stack Cardputer) — complete mesh communicators with display, keyboard, and LoRa. See [RatDeck](../hardware/ratdeck) and [RatCom](../hardware/ratcom).

## Where to Buy

| Vendor | URL | Notes |
|--------|-----|-------|
| **LilyGO Official** | lilygo.cc | Direct from manufacturer |
| **Heltec Official** | heltec.org | Direct from manufacturer |
| **RAK Wireless** | rakwireless.com | Modular IoT hardware |
| **AliExpress** | aliexpress.com | Search "LilyGO T-Beam" or "Heltec LoRa32" |
| **Amazon** | amazon.com | Higher prices, faster shipping |
| **unsigned.io** | unsigned.io | Original RNode hardware, pre-flashed |

> **Note**: A complete RNode setup (board + antenna + USB cable) typically costs **$25–100 USD** (as of early 2025).

## What You Need

For a basic RNode setup:

1. **A supported board** — see tables above
2. **An antenna** — matched to your frequency band (SMA connector, usually included)
3. **A USB cable** — USB-C or micro-USB depending on board
4. **A computer** — to flash firmware and run Reticulum

> **Warning**: Never power on a LoRa radio without an antenna connected. Transmitting without an antenna can damage the radio module.

## What's Next

- [Flashing Firmware](../hardware/flashing-firmware) — install RNode firmware on your board
- [RNode Overview](../hardware/rnode-overview) — how RNode works
- [Antennas, Range & Power](../hardware/antennas-range-power) — choose the right antenna
