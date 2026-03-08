# Ecosystem & Community

The Reticulum ecosystem — compatible software, community projects, and resources.

## Reticulum Software

### Core

| Project | Description | Platform |
|---------|-------------|----------|
| **Reticulum** | The mesh networking protocol itself | Python library |
| **RNS** | Reference implementation of Reticulum | Python |
| **rnsd** | Reticulum daemon (shared instance) | CLI |
| **rnstatus** | Network status and diagnostics | CLI |
| **rnpath** | Path lookup and testing | CLI |
| **rnid** | Identity management | CLI |
| **rnprobe** | Network probe utility | CLI |
| **rncp** | File copy over Reticulum | CLI |
| **rnx** | Remote command execution | CLI |

### Messaging

| Project | Description | Platform |
|---------|-------------|----------|
| **LXMF** | Lightweight Extensible Message Format | Python library |
| **Sideband** | Full-featured LXMF messenger | Android, Linux, macOS |
| **NomadNet** | Terminal-based mesh communicator | CLI (any platform) |
| **Ratspeak** | Web dashboard with games and monitoring | Browser (Python/Rust) |

### Hardware

| Project | Description | Platform |
|---------|-------------|----------|
| **RNode** | Open-source LoRa radio interface | Various ESP32/nRF boards |
| **RNode Firmware** | Firmware for RNode devices | PlatformIO |
| **rnodeconf** | RNode configuration utility | CLI |
| **RatDeck** | Standalone mesh communicator | LilyGo T-Deck Plus |
| **RatCom** | Pocket mesh communicator | M5Stack Cardputer |

## Compatible LXMF Clients

Ratspeak can exchange messages with any LXMF-compatible client:

### Sideband

The most popular Reticulum messenger. Available on:
- Android (via F-Droid or APK)
- Linux
- macOS

Features: Messaging, file transfer, telemetry, location sharing, audio messages.

### NomadNet

Terminal-based communicator and content network:
- Text-based UI (runs in any terminal)
- Node pages (like simple websites over mesh)
- File serving
- Message boards

### Other Clients

Any software using the LXMF library can communicate with Ratspeak. The protocol is standardized and open.

## Community Hubs

### Public Transport Nodes

Community-maintained transport nodes that help route traffic across the internet-connected Reticulum network. These are commonly shared as TCP connection addresses.

> **Tip**: To find active community hubs, check the Reticulum community forums and discussion groups.

### Local Mesh Communities

Many cities and regions have local Reticulum mesh networks:
- LoRa meshes for local off-grid communication
- Community transport nodes for internet bridging
- Group propagation nodes for store-and-forward messaging

## Contributing

### Ratspeak

- Source: github.com/ratspeak
- Issues and feature requests welcome
- See [Building & Contributing](../developer/building-contributing) for development setup

### Reticulum

- Source: github.com/markqvist/Reticulum
- Extensive documentation in the manual
- Active development community

### RNode Firmware

- Source: github.com/markqvist/RNode_Firmware
- Supports many ESP32 and nRF52 boards
- Community contributions for new board support

## Learning Resources

| Resource | Description |
|----------|-------------|
| Reticulum Manual | Comprehensive protocol documentation |
| Reticulum Resources | Hardware guides, board lists, community links |
| This documentation | Ratspeak-specific guides and tutorials |
| LXMF documentation | Messaging protocol specification |

## What's Next

- [Ratspeak vs Other Clients](../reference/comparison) — feature comparison
- [Glossary](../reference/glossary) — terminology reference
- [What is Reticulum?](../introduction/what-is-reticulum) — protocol introduction
