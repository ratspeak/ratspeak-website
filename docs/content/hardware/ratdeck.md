# RatDeck

A standalone LoRa mesh communicator built on the LilyGo T-Deck Plus — encrypted messaging, network discovery, and a full keyboard in your pocket.

## Overview

RatDeck is a complete Reticulum mesh node that doesn't need a computer. It runs custom firmware on the LilyGo T-Deck Plus, providing encrypted LXMF messaging, contact management, node discovery, and configurable LoRa radio — all through a cyberpunk-themed touchscreen UI with a physical QWERTY keyboard.

## Hardware

| Component | Specification |
|-----------|--------------|
| **MCU** | ESP32-S3 (dual-core, 8 MB PSRAM, 16 MB flash) |
| **Display** | ST7789V IPS LCD, 320x240, landscape |
| **Radio** | Integrated SX1262 LoRa (915 MHz ISM, configurable) |
| **Keyboard** | Physical QWERTY with optical trackball |
| **Storage** | 7.8 MB flash (LittleFS) + optional microSD (FAT32) |
| **Connectivity** | WiFi (AP + STA modes), BLE, LoRa, USB-C |
| **Audio** | ES7210 I2S codec for notifications |
| **Power** | Battery with ADC monitoring, backlight PWM |

## Features

### Encrypted Messaging
Full LXMF messaging with Ed25519 signatures. Send and receive encrypted messages to any Reticulum node — Ratspeak dashboard, Sideband, NomadNet, or another RatDeck. Per-conversation storage with delivery tracking.

### Node Discovery
Automatic mesh peer discovery via Reticulum announces. See who's online, save contacts as friends, and track node status in real time.

### LoRa Radio Presets
Eight built-in presets with full manual configuration. **Long Fast** (SF11/BW250k/CR4/5/22 dBm) is the default:

| Preset | Bitrate | Settings |
|--------|--------:|----------|
| Short Turbo | 21.99 kbps | SF7, 500 kHz, CR 4/5, 14 dBm |
| Short Fast | 10.84 kbps | SF7, 250 kHz, CR 4/5, 14 dBm |
| Short Slow | 6.25 kbps | SF8, 250 kHz, CR 4/5, 14 dBm |
| Medium Fast | 3.52 kbps | SF9, 250 kHz, CR 4/5, 17 dBm |
| Medium Slow | 1.95 kbps | SF10, 250 kHz, CR 4/5, 17 dBm |
| Long Turbo | 1.34 kbps | SF11, 500 kHz, CR 4/8, 22 dBm |
| **Long Fast** *(default)* | **1.07 kbps** | **SF11, 250 kHz, CR 4/5, 22 dBm** |
| Long Moderate | 0.34 kbps | SF11, 125 kHz, CR 4/8, 22 dBm |

Radio changes apply immediately — no reboot needed. Every parameter is also individually tunable.

### WiFi Bridging
- **AP Mode**: Creates `ratdeck-XXXX` hotspot (password: `ratspeak`), TCP server on port 4242. Connect your laptop to bridge its Reticulum instance to the LoRa mesh.
- **STA Mode**: Connects to existing WiFi, TCP client to remote Reticulum nodes.
- **OFF Mode**: LoRa only, saves power.

### Transport Node
Enable transport mode to relay packets and maintain routing tables for other nodes. Turns your RatDeck into a mesh relay.

### Power Management
Three screen states: Active → Dimmed → Off. Configurable timeouts. Wake on keyboard or trackball input.

## UI Tabs

The interface has five tabs navigated by trackball or keyboard:

| Tab | Content |
|-----|---------|
| **Home** | Identity info, LXMF address, connection status, online count |
| **Friends** | Saved contacts with display names |
| **Messages** | Conversations sorted by recency, unread badges, message compose |
| **Peers** | All discovered nodes on the mesh |
| **Setup** | Radio, WiFi, display, audio, system settings |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `,` / `/` | Previous / next tab |
| Ctrl+H | Help overlay |
| Ctrl+M | Jump to Messages |
| Ctrl+A | Force announce |
| Ctrl+D | Diagnostics dump |
| Ctrl+T | Radio test packet |
| Ctrl+R | RSSI monitor |

## Storage

RatDeck uses triple-redundant identity storage:

1. **Flash** (LittleFS) — primary storage for identity, config, messages
2. **SD Card** (FAT32) — backup and extended capacity
3. **NVS** (ESP32 Preferences) — emergency identity backup

Messages, contacts, and routing tables are persisted with atomic writes (crash-safe).

## Connecting to Ratspeak Dashboard

RatDeck operates standalone but can bridge to your desktop:

1. Set WiFi to **AP Mode** on the RatDeck
2. Connect your computer to the `ratdeck-XXXX` WiFi network
3. Add a TCP connection in Ratspeak pointing to `192.168.4.1:4242`

Your desktop Ratspeak instance now has access to the LoRa mesh through the RatDeck's radio.

## Getting a RatDeck

1. **Buy a LilyGo T-Deck Plus** — available from LilyGo, AliExpress, or Amazon (~$50–70 as of early 2025)
2. **Flash the firmware** — via [ratspeak.org/download](https://ratspeak.org/download) (web flasher) or PlatformIO
3. **Attach an antenna** — 915 MHz SMA antenna (usually included with the T-Deck Plus)

See [Flashing Firmware](../hardware/flashing-firmware) for detailed build and flash instructions.

## What's Next

- [Using Your RatDeck](../hardware/using-ratdeck) — day-to-day usage guide
- [RatCom](../hardware/ratcom) — the pocket-sized alternative
- [Flashing Firmware](../hardware/flashing-firmware) — build and flash instructions
- [Antennas, Range & Power](../hardware/antennas-range-power) — maximize your range
