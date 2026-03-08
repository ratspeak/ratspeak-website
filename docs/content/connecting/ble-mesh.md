# BLE Mesh

Bluetooth Low Energy peer-to-peer mesh networking — the only interface that works without restarting rnsd.

## Overview

BLE Mesh creates peer-to-peer connections between nearby Ratspeak nodes using Bluetooth Low Energy. Unlike all other interface types, BLE Mesh registers directly with the RNS transport layer at runtime — **no rnsd restart required**.

This makes it ideal for quick, temporary connections between devices in close proximity (~30 meters).

## Requirements

BLE Mesh requires two Python packages:

| Package | Role |
|---------|------|
| **bleak** | BLE central role — scanning and GATT client |
| **bless** | BLE peripheral role — advertising and GATT server |

```bash
pip install bleak bless
```

Ratspeak checks for these dependencies and shows an install prompt if they're missing.

## How It Works

### Discovery and Role Assignment

1. Both nodes advertise a GATT service and scan for nearby peers simultaneously
2. When two nodes discover each other, **deterministic role assignment** kicks in: the device with the lexicographically lower identity hash acts as **central** (initiator)
3. This prevents duplicate connections — exactly one device connects

### GATT Service Architecture

| UUID | Purpose |
|------|---------|
| `7e570001-...` | Service UUID |
| `7e570002-...` | TX Characteristic (peripheral → central, notify) |
| `7e570003-...` | RX Characteristic (central → peripheral, write) |
| `7e570004-...` | Identity Hash (read) |

The service advertises as **"Ratspeak BLE Mesh"**.

### Fragmentation

BLE has a limited MTU (244 bytes default), but BLE Mesh uses an interface-level hardware MTU of 1196 bytes (the Reticulum network MTU remains 500 bytes). BLE Mesh handles this with a fragmentation protocol:

```
Frame: [total_len: uint16_be][offset: uint16_be][payload]
```

- First frame: `total_len = data length`, `offset = 0`
- Continuation: `total_len = 0`, `offset = byte position`
- Payload per frame: `MTU - 4` bytes (240 bytes default)

### Background Threads

BLE Mesh runs three daemon threads:

| Thread | Interval | Purpose |
|--------|----------|---------|
| Scan loop | 5 seconds | Discover nearby BLE peers |
| Advertise loop | Continuous | Run GATT server for incoming connections |
| Peer jobs | 4 seconds | Health checks, remove silent peers |

Peers that haven't been seen for **22 seconds** are automatically removed.

## Enabling BLE Mesh

1. Navigate to the **Network** section
2. Click **Enable BLE Mesh**

BLE Mesh state is persisted — if enabled, it auto-starts on the next Ratspeak launch.

## Deduplication

BLE Mesh uses the same deduplication pattern as AutoInterface: a fixed-size buffer of 48 entries with 0.75-second TTL. Data is hashed with `RNS.Identity.full_hash()` and checked against the buffer before processing.

## Limitations

- **Range**: ~30 meters typical (Bluetooth LE range)
- **Speed**: ~100 Kbps estimated throughput
- **Platform**: Requires BLE hardware and OS support
- **Dependencies**: bleak + bless must be installed separately

## Technical Details

| Property | Value |
|----------|-------|
| BLE MTU | 244 bytes (conservative, 247 - 3 ATT header) |
| Interface MTU | 1196 bytes |
| Estimated bitrate | 100,000 bps |
| Peering timeout | 22 seconds |
| Scan interval | 5 seconds |
| Dedup buffer | 48 entries, 0.75s TTL |

## What's Next

- [Interface Types Overview](../connecting/interface-types-overview) — compare all interfaces
- [Interface Modes](../connecting/interface-modes) — configure interface behavior
- [WiFi & LAN](../connecting/wifi-lan) — AutoInterface for local networks
