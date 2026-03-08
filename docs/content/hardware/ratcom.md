# RatCom

A pocket-sized Reticulum mesh node built on the M5Stack Cardputer — encrypted messaging and LoRa radio in a device that fits in your hand.

## Overview

RatCom is a compact, standalone mesh communicator running on the M5Stack Cardputer. It provides the same core functionality as RatDeck — encrypted LXMF messaging, node discovery, and configurable LoRa radio — in a smaller form factor with a built-in keyboard.

<div class="screenshot-placeholder" data-caption="RatCom device showing the home screen with identity info and network status">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    <div>RatCom device — photo placeholder</div>
</div>

## Hardware

| Component | Specification |
|-----------|--------------|
| **MCU** | ESP32-S3 (dual-core) |
| **Display** | ST7789V2 TFT, 240x135, RGB565 |
| **Radio** | Cap LoRa-1262 module (SX1262, 915 MHz ISM) |
| **Keyboard** | QWERTY via TCA8418 I2C controller |
| **Storage** | 1.9 MB flash (LittleFS) + optional microSD (FAT32) |
| **Connectivity** | WiFi (AP + STA modes), BLE, LoRa, USB-C |
| **Audio** | ES8311 codec + NS4150B amplifier |
| **Battery** | 1750 mAh LiPo |

## RatDeck vs RatCom

| Feature | RatDeck (T-Deck Plus) | RatCom (Cardputer) |
|---------|----------------------|-------------------|
| **Display** | 320x240 IPS | 240x135 TFT |
| **Flash** | 16 MB (7.8 MB storage) | 8 MB (1.9 MB storage) |
| **PSRAM** | 8 MB | Standard |
| **Input** | Keyboard + trackball | Keyboard only |
| **Size** | Larger, more screen | Pocket-sized |
| **Battery** | External (varies) | 1750 mAh built-in |
| **Best for** | Primary device, long sessions | Quick messages, portable backup |

## Features

### Core Capabilities
- **LXMF encrypted messaging** with Ed25519 signatures
- **Automatic node discovery** via Reticulum announces
- **Configurable LoRa radio** — same three presets as RatDeck (Long Range, Balanced, Fast)
- **Transport node mode** — relay packets for other mesh nodes
- **Dual storage** — flash + SD card with atomic writes

### WiFi Modes
- **AP Mode** (default): Creates `ratcom-XXXX` hotspot (password: `ratspeak`), TCP server on port 4242
- **STA Mode**: Connects to existing WiFi, TCP client to remote nodes
- **OFF Mode**: LoRa only

### UI Tabs

| Tab | Content |
|-----|---------|
| **Home** | Identity, status, network info |
| **Messages** | Conversations with unread badges |
| **Nodes** | Discovered mesh peers |
| **Setup** | Radio, WiFi, display, audio, system |

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `;` / `.` | Scroll up / down |
| `,` / `/` | Tab left / right |
| Enter | Select / send |
| Esc | Back / cancel |
| Ctrl+H | Help overlay |
| Ctrl+M | Jump to Messages |
| Ctrl+A | Force announce |

## Boot Recovery

RatCom includes reliability features for field use:

- **Boot counter** — tracks consecutive failures, auto-disables WiFi after 3 failed boots
- **Serial WIPE command** — factory reset via serial within 500ms boot window
- **Atomic writes** — crash-safe storage with `.tmp` → `.bak` → rename pattern

## Getting a RatCom

1. **Buy an M5Stack Cardputer** — available from M5Stack, AliExpress, or Amazon (~$30–40)
2. **Buy a Cap LoRa-1262 module** — the LoRa radio add-on for the Cardputer
3. **Flash the firmware** — via PlatformIO or esptool
4. **Attach an antenna** — 915 MHz antenna for the LoRa module

See [Flashing Firmware](../hardware/flashing-firmware) for detailed instructions.

## What's Next

- [RatDeck](../hardware/ratdeck) — the larger alternative
- [Flashing Firmware](../hardware/flashing-firmware) — build and flash instructions
- [Antennas, Range & Power](../hardware/antennas-range-power) — maximize your range
- [Building Networks](../connecting/building-networks) — network topology strategies
