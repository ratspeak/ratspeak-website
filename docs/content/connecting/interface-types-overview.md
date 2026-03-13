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

**Which interface type should you use?**

- **Same WiFi/LAN network?** Use `AutoInterface` (zero-config, auto-discovers peers) or `UDPInterface` (explicit config)
- **Connecting across the internet?** Use `TCPClientInterface` to connect to a known TCP hub, or `TCPServerInterface` to host one
- **Want radio mesh (no internet)?** Use `RNodeInterface` with a LoRa-capable board (RNode, Heltec, T-Deck, etc.)
- **Short-range device mesh?** Use `BLEInterface` for Bluetooth Low Energy connections between nearby devices
- **Direct cable connection?** Use `SerialInterface` or `KISSInterface` for wired links and packet radio TNCs
- **Anonymous routing over internet?** Use `I2PInterface` to tunnel Reticulum traffic through the I2P anonymity network
- **Bridging two networks?** Any node can run multiple interfaces simultaneously — traffic routes automatically between them

## UI-Managed vs Config-Only

Interfaces managed through the Ratspeak UI can be added and removed dynamically. Config-only interfaces require editing the RNS config file directly and restarting rnsd.

All UI-managed interfaces (except BLE) modify the hub node's config file and trigger a safe restart. BLE Mesh registers directly with the RNS transport layer at runtime — no restart needed.

## What's Next

- [TCP Connections](../connecting/tcp-connections) — connecting over IP
- [LoRa / RNode](../connecting/lora-rnode) — long-range radio
- [WiFi & LAN](../connecting/wifi-lan) — local network discovery
- [BLE Mesh](../connecting/ble-mesh) — Bluetooth mesh
- [Interface Modes](../connecting/interface-modes) — controlling interface behavior
