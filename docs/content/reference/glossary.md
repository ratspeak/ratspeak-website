# Glossary

Key terms used throughout the Ratspeak and Reticulum documentation.

---

## A

### Announce
A broadcast packet that advertises a destination's existence and public key to the network. Announces propagate through transport nodes with hop count incrementing, duplicate detection, and rate limiting (2% of bandwidth by default). See [Destinations & Addressing](../understanding/destinations-addressing).

### AutoInterface
Zero-configuration interface that discovers peers on the local network using multicast. No setup needed — just enable it and any Reticulum instances on the same subnet will find each other. See [WiFi & LAN](../connecting/wifi-lan).

## D

### Destination
An endpoint on the Reticulum network, identified by a 16-byte hash derived from cryptographic keys and an application name. Four types: **Single** (encrypted, routable), **Link** (ephemeral encrypted channel), **Group** (shared secret), **Plain** (unencrypted). See [Destinations & Addressing](../understanding/destinations-addressing).

### Destination Hash
The 128-bit address of a destination, displayed as 32 hexadecimal characters (e.g., `4faf1b2e0a077e6a9d92fa051f256038`). Derived from `SHA-256(app_name + public_keys)[:16]`. This is what you share with contacts to communicate.

## F

### Forward Secrecy
A property where compromising a long-term key does not reveal past communications. Reticulum achieves this through ephemeral key exchanges on Links and ratchet-based key rotation on Single destinations. See [Security Model](../understanding/security-model).

## I

### Identity
A cryptographic keypair (Ed25519 for signing + X25519 for encryption) that represents a user or node on the network. The identity's public keys are used to derive destination hashes. Identity files are 64 bytes and must be kept secure. See [Identity Management](../using-ratspeak/identity-management).

### IFAC
Interface Access Code. A network-level filter using `network_name` + `passphrase` on an interface. Only nodes with matching IFAC credentials can communicate on that interface. Used to create private network segments.

### Interface
A connection method that Reticulum uses to communicate. Types include AutoInterface (LAN), TCPClientInterface, TCPServerInterface, UDPInterface, RNodeInterface (LoRa), SerialInterface, KISSInterface, I2PInterface, and BLE. See [Interface Types Overview](../connecting/interface-types-overview).

### Interface Mode
Controls how an interface participates in the network: **full** (default, bidirectional routing), **gateway** (connects distinct segments), **access_point** (serves local clients), **roaming** (mobile client), **boundary** (edge of segment). See [Interface Modes](../connecting/interface-modes).

## L

### Link
An encrypted bidirectional channel between two destinations, established via a 3-packet handshake (297 bytes total). Provides forward secrecy through ephemeral key exchange. Used for larger data transfers and interactive communication. See [Links & Communication](../understanding/links-and-communication).

### LRGP
Lightweight Reticulum Gaming Protocol. A protocol for multiplayer games (like Tic-Tac-Toe) over LXMF messaging. Encodes game actions in LXMF custom fields using single-character keys and MessagePack serialization, designed to fit within LoRa's tight bandwidth constraints. See [LRGP Protocol](../developer/lrgp-protocol).

### LXMF
Lightweight Extensible Message Format. The messaging protocol built on top of Reticulum. Handles message encryption, delivery tracking, store-and-forward via propagation nodes, and file attachments. Ratspeak, Sideband, and NomadNet all use LXMF. See [LXMF Protocol](../understanding/lxmf-protocol).

## M

### MDU
Maximum Data Unit. The largest payload that fits in a single Reticulum packet: 383 bytes encrypted, 464 bytes plaintext. Messages exceeding this are sent via Resource transfers (up to ~3.2 MB).

### MTU
Maximum Transfer Unit. The total Reticulum packet size: 500 bytes. This includes header, addresses, context, and data payload.

## N

### Network Identity
A standard Reticulum identity used to represent a group rather than an individual. Nodes sharing a Network Identity can auto-discover and auto-connect, creating private overlay networks. See [Network Identities](../understanding/network-identities).

## P

### Path
A route to a destination, learned from announces. Each transport node records a path table entry: destination hash → next-hop neighbor + hop count + interface. Paths expire when not refreshed.

### Propagation Node
An LXMF node that stores messages for offline recipients and delivers them when they come online. Enables asynchronous messaging on mesh networks where contacts may not be simultaneously available. See [Propagation Nodes](../using-ratspeak/propagation-node).

## R

### Ratchet
A key rotation mechanism providing forward secrecy for Single destinations. Keys rotate periodically (default every 30 minutes) with a 512-key retention window, ensuring old messages remain decryptable while future keys stay protected. See [Security Model](../understanding/security-model).

### RNode
An open-source LoRa radio interface for Reticulum. Runs on ESP32 and nRF52 boards, connecting via USB, BLE, or TCP. Provides long-range off-grid communication (1-50+ km depending on conditions). See [RNode Overview](../hardware/rnode-overview).

### rnsd
The Reticulum Network Stack Daemon. Runs as a shared instance that other programs (like Ratspeak) connect to via local RPC. Manages interfaces, routing, and packet forwarding.

## S

### Spreading Factor
A LoRa radio parameter (SF7-SF12) controlling the trade-off between range and speed. Higher SF = longer range but slower data rate. SF12 at 125 kHz yields ~293 bps with maximum range; SF7 yields ~5,470 bps with shortest range. See [LoRa Frequency Bands](../reference/lora-frequency-bands).

## T

### Transport Node
A Reticulum instance with `enable_transport = Yes` that forwards packets for other nodes — essentially a router. Regular instances only handle their own traffic. Enable transport on always-on, well-connected nodes. See [Transport & Routing](../understanding/transport-routing).

## W

### Wire Format
The binary structure of Reticulum packets: 2-byte header + 16-32 bytes addresses + 1-byte context + 0-465 bytes data = 500 bytes MTU. See [Wire Format](../understanding/wire-format).
