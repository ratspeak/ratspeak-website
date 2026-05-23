# RNode & Supported Boards

## What Is an RNode?

RNode is firmware that turns LoRa-capable microcontroller boards into Reticulum-native radio interfaces. It uses a custom MAC layer optimized for mesh networking - no gateways, no network servers, no cloud infrastructure. Depending on the board and firmware profile, an RNode connects to your computer or phone via USB serial, Android USB-OTG, Bluetooth LE, or a TCP bridge and provides a radio interface that Reticulum uses like any other network connection. Reticulum handles private-message encryption end-to-end before packets reach the radio.

| Property | Value |
|----------|-------|
| **Range** | 1-50+ km (terrain/antenna dependent) |
| **Speed** | ~37 bps to ~11 Kbps (depends on preset) |
| **Protocol** | Custom MAC layer (not LoRaWAN) |
| **Encryption** | Handled by Reticulum (end-to-end) |
| **Connection** | USB serial, Android USB-OTG, Bluetooth LE, or TCP bridge, depending on board/firmware |
| **Power** | Low - solar/battery capable |
| **Cost** | ~$25-100 USD depending on board |

### RNode vs LoRaWAN

| | RNode | LoRaWAN |
|---|-------|---------|
| **Architecture** | Peer-to-peer mesh | Star topology with gateways |
| **Infrastructure** | None required | Requires gateways + network server |
| **Encryption** | End-to-end (Reticulum) | Network-level (keys shared with operator) |
| **Data routing** | Decentralized, multi-hop | Centralized through network server |
| **Cost** | Hardware only | Hardware + service fees |

## How to Get an RNode

Before buying or flashing, check the practical kit:

1. **A supported board** from the tables below
2. **An antenna** matched to your frequency band (SMA connector, usually included). See [Antennas, Range & Power](../hardware/antennas-range-and-power).
3. **A USB cable** - USB-C or micro-USB depending on board
4. **A computer** to flash firmware and run Reticulum

> **Warning**: Never power on a LoRa radio without an antenna connected. Transmitting without an antenna can damage the radio module.

1. **Flash your own** - buy a supported board (see below) and run `rnodeconf --autoinstall` to flash RNode firmware. See [Flashing Firmware](../hardware/flashing-firmware).
2. **Buy pre-made** - purchase from [unsigned.io](https://unsigned.io) or community vendors.
3. **Use Ratspeak hardware** - [Ratdeck](../products/ratdeck) includes an integrated LoRa radio, and [rsCardputer](../products/rscardputer) attaches one through the Cap LoRa add-on.

## Connection Methods

**USB Serial** - most common and reliable:
```ini
[[LoRa Radio]]
  type = RNodeInterface
  port = /dev/ttyUSB0
```

**Bluetooth LE** - wireless connection to a nearby RNode:
```ini
[[LoRa Radio]]
  type = RNodeInterface
  port = ble://RNode 3B87
```

**TCP bridge** - connect to an RNode KISS stream exposed on a local network:
```ini
[[LoRa Radio]]
  type = RNodeInterface
  port = tcp://10.0.0.1:7633
```

In Ratspeak's Add LoRa Device sheet, the TCP field accepts `host`, `host:port`, `tcp://host`, or `tcp://host:port`. If you omit the port, Ratspeak uses `7633`.

## Supported Boards

RNode firmware runs on 14+ boards across three microcontroller platforms. All can be flashed with `rnodeconf --autoinstall`.

### LilyGO (ESP32-based)

| Board | Transceiver | Notable Features |
|-------|-------------|-----------------|
| **T-Beam Supreme** | SX1262 / SX1268 | GPS, large battery holder, best all-around |
| **T-Beam** | SX1262 / SX1276 / SX1278 | GPS, battery holder, widely available |
| **T3S3** | SX1262 / SX1276 / SX1278 | Compact, no GPS, good for fixed nodes |
| **T-Deck** | SX1262 / SX1268 | Display + keyboard (also used by Ratdeck) |
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
| **SX1262** | 150-960 MHz | General use, all regions, modern and efficient |
| **SX1268** | 150-960 MHz | Optimized for 470 MHz (China band) |
| **SX1276** | 137-1020 MHz | Legacy, widely available, cost-effective |
| **SX1278** | 137-525 MHz | 433 MHz band specialist |
| **SX1280** | 2.4 GHz | High-speed short-range (OpenCom XL only) |

For new purchases, choose boards with **SX1262** - the most modern, power-efficient, and versatile transceiver.

## Buying Recommendations

| Use Case | Board | Price | Why |
|----------|-------|-------|-----|
| **Beginners** | LilyGO T-Beam Supreme | ~$35-50 | GPS, battery holder, SX1262, widely documented |
| **Budget** | Heltec LoRa32 v3.0 | ~$18-25 | Compact, USB-C, OLED, SX1262 |
| **Portable** | LilyGO T-Echo | ~$30-40 | nRF52, e-ink display, extremely low power |
| **Dual-band** | OpenCom XL | Varies | SX1262 + SX1280, run two links with `RNodeMultiInterface` |
| **Standalone** | [Ratdeck](../products/ratdeck) or [rsCardputer](../products/rscardputer) | ~$30-70 | Complete mesh communicator with display, keyboard, and LoRa |

## Where to Buy

| Vendor | URL | Notes |
|--------|-----|-------|
| **LilyGO Official** | lilygo.cc | Direct from manufacturer |
| **Heltec Official** | heltec.org | Direct from manufacturer |
| **RAK Wireless** | rakwireless.com | Modular IoT hardware |
| **AliExpress** | aliexpress.com | Search "LilyGO T-Beam" or "Heltec LoRa32" |
| **Amazon** | amazon.com | Higher prices, faster shipping |
| **unsigned.io** | unsigned.io | Original RNode hardware, pre-flashed |

A complete RNode setup (board + antenna + USB cable) typically costs **$25-100 USD**.

## Next

After choosing a board, read [Antennas, Range & Power](../hardware/antennas-range-and-power), then [Flashing Firmware](../hardware/flashing-firmware).
