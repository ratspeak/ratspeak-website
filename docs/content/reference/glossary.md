# Glossary

Complete reference of Reticulum, LXMF, and Ratspeak terminology.

<div class="glossary-search">
<svg class="glossary-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
<input id="glossarySearchInput" type="text" placeholder="Filter terms..." />
</div>

---

## A

### Access Point Mode <span class="glossary-category glossary-category--interface">Interface</span>
Interface mode (`mode = access_point` or `mode = ap`) where the interface operates quietly, suppressing announce rebroadcasts and using shorter path expiry times. Designed for interfaces serving client devices in a localized area — for example, an RNode providing LoRa coverage to nearby Sideband users. Announces from clients are not rebroadcast to the wider network.

### AES-256-CBC <span class="glossary-category glossary-category--crypto">Crypto</span>
Advanced Encryption Standard with 256-bit keys in Cipher Block Chaining mode. The symmetric encryption algorithm used by Reticulum for all encrypted packet payloads and link traffic. IVs are 128-bit, generated via `os.urandom()`. Plaintext is padded with PKCS7 before encryption. Used inside the modified Fernet token format.

### Airtime Limit <span class="glossary-category glossary-category--interface">Interface</span>
Configuration parameters (`airtime_limit_long` and `airtime_limit_short`) restricting the percentage of time an RNode radio interface may transmit. The short-term limit applies over ~15 seconds; the long-term limit is enforced over a rolling 60-minute window. Critical for regulatory compliance in ISM bands where duty cycle restrictions apply.

### Announce <span class="glossary-category glossary-category--protocol">Protocol</span>
A broadcast packet containing a destination's public key and optional application data (`app_data`), signed with Ed25519 to prove key ownership. Used for path discovery — when a destination announces, other nodes learn how to reach it. Propagated through the network with hop-count limits (max 128), rate controls (default 2% of bandwidth), duplicate detection, and randomized retransmission delays. Announces are the lowest-priority packet type. See [Protocol Architecture](../understanding/protocol-architecture).

### Announce Cap <span class="glossary-category glossary-category--protocol">Protocol</span>
Maximum percentage of an interface's bandwidth allocated for announce propagation. Default: 2%. Configurable per interface via `announce_cap` (1–100%). Reticulum prioritizes announces with fewer hops to ensure local reachability even on bandwidth-constrained networks.

### Announce Rate Control <span class="glossary-category glossary-category--protocol">Protocol</span>
Mechanism to prevent announce flooding. Configured per-interface via `announce_rate_target` (minimum seconds between announces per destination), `announce_rate_grace` (violations before enforcement), and `announce_rate_penalty` (additional delay per violation). Prevents any single destination from monopolizing announce bandwidth. See [Interface Modes](../connecting/interface-modes).

### App Data <span class="glossary-category glossary-category--protocol">Protocol</span>
Application-specific data attached to an Announce packet. When a destination announces, it can include arbitrary bytes (commonly UTF-8 text like a display name or node description) that announce handlers on other nodes can read and process. In LXMF, the app data typically contains the sender's display name.

### App Manifest <span class="glossary-category glossary-category--tool">Tool</span>
The metadata declaration for an RLAP app plugin, defined as class attributes on `AppBase`. Includes `app_id`, `version`, `display_name`, `session_type` (turn_based/real_time/one_shot), `max_players`, `validation` model, supported `actions`, `preferred_delivery` per action, and per-status `ttl`. The manifest is returned by `get_manifest()` and used by the App Router for dispatch and UI rendering. See [RLAP Protocol](../understanding/rlap-protocol).

### App Router <span class="glossary-category glossary-category--tool">Tool</span>
The RLAP dispatch module (`app_router.py`) that discovers installed app plugins, dispatches incoming/outgoing actions by `app_id`, and manages the app registry. Routes RLAP envelopes to the correct `AppBase` subclass and handles legacy v0 message translation. See [RLAP Protocol](../understanding/rlap-protocol).

### Aspect <span class="glossary-category glossary-category--protocol">Protocol</span>
A dot-separated naming component used to construct a destination's identity. Follows a hierarchical pattern like `app_name.service.function` (e.g., `lxmf.delivery`, `nomadnetwork.node`). The full aspect chain is hashed with the identity's public key to produce the destination hash. Aspects should be generic descriptors, not unique identifiers — the identity's keys provide uniqueness.

### Aspect Filter <span class="glossary-category glossary-category--protocol">Protocol</span>
A property of announce handler objects that specifies which announce aspects the handler should receive. When set, only announces from destinations matching the filter string are passed to the handler's `received_announce()` callback. Used to efficiently filter the announce stream for relevant traffic.

### AutoInterface <span class="glossary-category glossary-category--interface">Interface</span>
Zero-configuration local network interface using IPv6 multicast discovery (port 29716) and UDP data transport (port 42671). Automatically discovers and connects to other Reticulum nodes on the same LAN segment without any manual configuration. Supports `group_id` for network isolation and `discovery_scope` for controlling multicast reach. Requires IPv6 support on the host. See [WiFi & LAN](../connecting/wifi-lan).

### AX.25 <span class="glossary-category glossary-category--interface">Interface</span>
Amateur radio data link layer protocol. Reticulum uses AX.25 TNCs via KISS framing for regulatory compliance on ham radio frequencies. Configured via `AX25KISSInterface` with parameters for `callsign`, `ssid`, and standard serial settings. Required for legal amateur radio packet operation.

## B

### BackboneInterface <span class="glossary-category glossary-category--interface">Interface</span>
High-performance TCP interface using kernel-event I/O (`epoll`/`kqueue`). Handles thousands of simultaneous connections with minimal CPU overhead. Linux and Android only. Compatible with TCPServer/TCPClient interfaces — a BackboneInterface can peer with regular TCP interfaces. Ideal for infrastructure nodes handling high traffic volumes. See [TCP Connections](../connecting/tcp-connections).

### Bandwidth <span class="glossary-category glossary-category--interface">Interface</span>
In LoRa context, the radio channel width in Hz. Sub-GHz options range from 7.8 kHz to 500 kHz; 2.4 GHz options from 250 kHz to 1.6 MHz. Wider bandwidth gives higher data rates but shorter range. Common Reticulum configurations use 125 kHz (long range) or 250 kHz (balanced). Configured via the `bandwidth` parameter on RNodeInterface. See [LoRa / RNode](../connecting/lora-rnode).

### Beacon <span class="glossary-category glossary-category--interface">Interface</span>
Periodic identification transmission sent by KISS and RNode interfaces for station identification. Configured via `id_callsign` and `id_interval` parameters. Required in some jurisdictions for amateur radio operation. The beacon contains the station callsign in Morse code or data format.

### Blackhole <span class="glossary-category glossary-category--protocol">Protocol</span>
Mechanism to block specific identities at the transport layer. Blocked identities have their announces and traffic silently dropped. Managed locally via `rnpath --blackhole` or via automated lists. Supports duration-based blocks and reason annotations. Useful for blocking spam or malicious nodes.

### BLE Mesh <span class="glossary-category glossary-category--interface">Interface</span>
Bluetooth Low Energy peer-to-peer mesh interface in Ratspeak. Uses GATT services with the `bleak` (central) and `bless` (peripheral) Python packages. Registers directly with `RNS.Transport.interfaces` at runtime — the only interface type that doesn't require an rnsd restart. Deterministic role assignment by identity hash comparison prevents duplicate connections. Fragments packets from the 1196-byte interface MTU (the Reticulum network MTU is 500 bytes) to the 244-byte BLE MTU. See [BLE Mesh](../connecting/ble-mesh).

### Bootstrap Only <span class="glossary-category glossary-category--interface">Interface</span>
Interface configuration flag (`bootstrap_only = True`) designating an interface as a temporary bridge. Used for initial path discovery but not preferred for ongoing traffic once better paths are established through other interfaces.

### Boundary Mode <span class="glossary-category glossary-category--interface">Interface</span>
Interface mode (`mode = boundary`) designed for interfaces connecting disparate network segments. Provides isolation between segments while allowing controlled traffic flow. Useful for connecting private networks to public infrastructure. See [Interface Modes](../connecting/interface-modes).

### Buffer <span class="glossary-category glossary-category--protocol">Protocol</span>
Stream abstraction over Channels providing `BufferedReader` and `BufferedWriter` for sequential byte-stream operations over Links. Built on top of the `RawChannelReader`/`RawChannelWriter` primitives. Provides a familiar stream I/O interface for applications that need to send sequential data rather than discrete messages.

## C

### Capability Negotiation <span class="glossary-category glossary-category--tool">Tool</span>
In RLAP, capabilities are not exchanged in every message. Instead, the `app_id.version` field (`"a"`) in the envelope implicitly declares the sender's protocol version. A client receiving `"chess.1"` knows the sender supports RLAP v1 chess. If a client receives an unknown `app_id`, it sends an `error` action with code `unsupported_app`. See [RLAP Protocol](../understanding/rlap-protocol).

### Challenge / Accept / Decline <span class="glossary-category glossary-category--tool">Tool</span>
The opening handshake of an RLAP session. A **challenge** initiates a new session (the challenger generates the session ID). The recipient responds with **accept** (providing initial state, e.g. starting board position) or **decline** (rejecting the challenge). Unanswered challenges expire after 24 hours. See [Games & Apps](../using-ratspeak/games-and-apps).

### Channel <span class="glossary-category glossary-category--protocol">Protocol</span>
Reliable, bidirectional messaging mechanism over an established Link. Messages are size-constrained to single packets and must subclass `MessageBase` with a unique `MSGTYPE` (< `0xf000`). Provides continuous, typed message exchange throughout a Link's lifetime with automatic sequencing and delivery confirmation.

### Codec2 <span class="glossary-category glossary-category--messaging">Messaging</span>
Ultra-low bitrate voice codec supporting rates from 700 bps to 3200 bps. Used by LXST and Sideband for voice communication over extremely bandwidth-constrained links like LoRa and packet radio. Enables intelligible voice calls even at link speeds measured in hundreds of bits per second.

### Coding Rate <span class="glossary-category glossary-category--interface">Interface</span>
LoRa parameter (`codingrate`, values 5–8) controlling Forward Error Correction (FEC) redundancy. Higher coding rates (e.g., 8) add more redundancy, improving reliability in the presence of interference at the cost of lower effective data rate. Does not directly increase range. Configured on RNodeInterface. See [LoRa / RNode](../connecting/lora-rnode).

### Contact Reachability <span class="glossary-category glossary-category--tool">Tool</span>
Classification of contacts based on path table age in Ratspeak: **Reachable** (< 30 min), **Stale** (30–60 min), **Unreachable** (> 60 min). Thresholds configurable via `path_age_reachable` and `path_age_stale` in `ratspeak.conf`. Auto-path requests keep routes fresh for active contacts. See [Contacts](../using-ratspeak/contacts).

### Context Field <span class="glossary-category glossary-category--protocol">Protocol</span>
A 1-byte field in the Reticulum packet wire format signaling the packet's purpose within its type category. The context field's meaning depends on the packet type (data, announce, link request, or proof). Part of the binary wire format. See [Wire Format](../understanding/wire-format).

### Curve25519 <span class="glossary-category glossary-category--crypto">Crypto</span>
The elliptic curve used by Reticulum for all asymmetric cryptographic operations. Provides X25519 (key exchange) and Ed25519 (digital signatures). Chosen for its security properties, performance, and resistance to timing attacks. All Reticulum Identity keys are 512-bit Curve25519 keysets (256-bit Ed25519 + 256-bit X25519).

## D

### Destination <span class="glossary-category glossary-category--protocol">Protocol</span>
Fundamental addressing unit in Reticulum. A 16-byte truncated SHA-256 hash derived from an identity's public key and application aspect name. Four types: **Single** (asymmetric encryption, multi-hop), **Plain** (unencrypted broadcast, direct only), **Group** (symmetric AES-256, direct only), **Link** (encrypted channel with forward secrecy). Location-independent — the same hash regardless of physical network position. See [Protocol Architecture](../understanding/protocol-architecture).

### Destination Hash <span class="glossary-category glossary-category--protocol">Protocol</span>
The 16-byte (128-bit) address displayed as hex (e.g., `<13425ec15b621c1d928589718000d814>`). Derived from `SHA-256(app_name.aspects + Identity.public_key)[:16]`. The truncated hash provides an address space supporting billions of simultaneous devices while keeping packet overhead minimal. Location-independent — the same across all mediums and network positions.

### Direct Delivery <span class="glossary-category glossary-category--messaging">Messaging</span>
LXMF delivery method (code `0x02`) that establishes a Reticulum Link to the recipient before delivering the message. Provides forward secrecy through the Link's ephemeral ECDH key exchange. Used for longer messages, file attachments, and when delivery confirmation is needed. Both parties must be currently reachable. See [Messaging](../using-ratspeak/messaging).

### Discoverable Interface <span class="glossary-category glossary-category--interface">Interface</span>
An interface configured with `discoverable = yes` that broadcasts its existence and connection parameters to the network. Other nodes can automatically connect to discoverable interfaces. Supports metadata like `discovery_name`, geographic coordinates (`latitude`, `longitude`, `height`), and radio parameters. Requires the LXMF module. Protected by `discovery_stamp_value` proof-of-work to prevent abuse.

## E

### ECDH <span class="glossary-category glossary-category--crypto">Crypto</span>
Elliptic Curve Diffie-Hellman key exchange on Curve25519 (X25519). Core to Link establishment and per-packet encryption. Provides shared secrets without transmitting private keys. Used in three contexts: per-packet ephemeral encryption to Single destinations, Link handshake key agreement, and ratchet key exchange.

### Ed25519 <span class="glossary-category glossary-category--crypto">Crypto</span>
Edwards-curve Digital Signature Algorithm on Curve25519. Produces 64-byte (512-bit) signatures. Used for signing announces, delivery proofs, link verification, IFAC generation, and identity validation. Part of every Reticulum identity (256-bit signing key). Provides authentication without revealing the signer's encryption key.

### Encrypted MDU <span class="glossary-category glossary-category--protocol">Protocol</span>
The Maximum Data Unit for encrypted packets: **383 bytes**. This is the maximum payload that can be sent in a single encrypted packet to a Single destination. Smaller than the Plain MDU due to encryption overhead (ephemeral key + HMAC + IV + padding). See [Wire Format](../understanding/wire-format).

### Ephemeral Key <span class="glossary-category glossary-category--crypto">Crypto</span>
A temporary cryptographic key generated for a single session or exchange. In Reticulum, ephemeral X25519 keys are created for each Link handshake and each packet to a Single destination. After key agreement, ephemeral keys are discarded — ensuring forward secrecy even if long-term keys are later compromised.

## F

### Fallback Text <span class="glossary-category glossary-category--tool">Tool</span>
The human-readable text in the LXMF `content` field of every RLAP message. Non-RLAP clients (Sideband, NomadNet, MeshChat) display this as a regular message, ensuring cross-client compatibility. Format: `[Ratspeak <AppName>] <description>`. There is no separate fallback key in the RLAP envelope — the LXMF content field IS the fallback, saving ~30-40 bytes per message. See [RLAP Protocol](../understanding/rlap-protocol).

### Fernet <span class="glossary-category glossary-category--crypto">Crypto</span>
Modified Fernet token format used for encrypted packets in Reticulum. Uses ephemeral keys from ECDH on Curve25519. Modified from the standard Fernet specification: no version or timestamp metadata fields are included, reducing overhead. Contains the ciphertext and HMAC authentication tag.

### Forward Secrecy <span class="glossary-category glossary-category--crypto">Crypto</span>
Property ensuring that compromise of long-term keys does not compromise past communications. Achieved in Reticulum through two mechanisms: ephemeral ECDH during Link establishment (per-session keys that are never stored) and optional per-destination ratchets (rotating keys for Single destination packets). See [Security Model](../understanding/security-model).

### Frequency <span class="glossary-category glossary-category--interface">Interface</span>
The radio carrier frequency in Hz for RNode LoRa interfaces. Must comply with local spectrum regulations. Common ISM bands: 430 MHz, 868 MHz (EU), 915 MHz (US/AU), 920 MHz (JP/KR). Configured as an integer (e.g., `frequency = 867200000` for 867.2 MHz). See [LoRa / RNode](../connecting/lora-rnode).

### Full Hash <span class="glossary-category glossary-category--protocol">Protocol</span>
The complete, untruncated SHA-256 hash (256 bits / 32 bytes) of a destination's identifying information. Used internally for certain verification operations and deduplication. Available via `Identity.full_hash()`. Compared to the truncated 128-bit destination hash used for addressing.

## G

### Graph View <span class="glossary-category glossary-category--tool">Tool</span>
An interactive D3.js force-directed network visualization in Ratspeak. Renders nodes (hub, contacts, transport, discovered) with color-coding on HTML Canvas for performance. Supports zoom, pan, node dragging, pinning, search, and type filters. Edge types: solid (direct link) and dashed (inferred path). The simulation pauses when the Graph tab is not active to save CPU. See [Graph Visualization](../using-ratspeak/graph-visualization).

### Gateway Mode <span class="glossary-category glossary-category--interface">Interface</span>
Interface mode (`mode = gateway` or `mode = gw`) for interfaces connecting network segments with different characteristics (e.g., LoRa to Internet). Discovers unknown paths on behalf of connected client nodes — when a client requests a path the gateway doesn't know, the gateway propagates the request to its other interfaces. The interface facing clients should be in gateway mode. See [Interface Modes](../connecting/interface-modes).

### Group Destination <span class="glossary-category glossary-category--protocol">Protocol</span>
A destination type using symmetric AES-256 encryption with a pre-shared key. All members of the group share the same key. Unlike Single destinations, Group destinations cannot be multi-hop routed — they are only directly reachable on local interfaces. Useful for broadcast-style communication within a known group.

## H

### Half-Duplex <span class="glossary-category glossary-category--protocol">Protocol</span>
Communication mode where data flows in both directions but not simultaneously. Many Reticulum interfaces (especially LoRa, KISS, and serial) are half-duplex. Reticulum is designed to work efficiently on half-duplex channels, requiring only 5 bits per second minimum throughput.

### Header Type <span class="glossary-category glossary-category--protocol">Protocol</span>
A field in the Reticulum packet header indicating the address structure. **Type 1**: 2-byte header with one 16-byte address field (destination only). **Type 2**: 2-byte header with two 16-byte address fields (destination + transport ID). The header type determines total packet overhead. See [Wire Format](../understanding/wire-format).

### HKDF <span class="glossary-category glossary-category--crypto">Crypto</span>
HMAC-based Key Derivation Function. Used to derive per-packet and per-link symmetric encryption keys from ECDH shared secrets. Reticulum includes an internal pure-Python HKDF implementation as a fallback when OpenSSL (via PyCA/cryptography) is unavailable.

### HMAC-SHA256 <span class="glossary-category glossary-category--crypto">Crypto</span>
Hash-based Message Authentication Code using SHA-256. Used by Reticulum for packet authentication and integrity verification. Ensures packets have not been tampered with in transit. Part of the modified Fernet token format used for encrypted payloads.

### Hop Count <span class="glossary-category glossary-category--protocol">Protocol</span>
A field in the packet header (byte 2) indicating how many Transport Nodes a packet has traversed. Incremented at each hop. Maximum: 128 hops (defined by `Transport.PATHFINDER_M`). Announces with fewer hops are prioritized during path resolution. Viewable via `rnpath` or Ratspeak's connections table.

### Hub Node <span class="glossary-category glossary-category--tool">Tool</span>
The primary rnsd instance that Ratspeak connects to (default: `node_1`). All dashboard operations — messaging, interface management, announce handling, path requests — flow through the hub node. Configurable via `[nodes] hub_node` in `ratspeak.conf`. The dashboard connects as a shared instance client.

## I

### I2PInterface <span class="glossary-category glossary-category--interface">Interface</span>
Reticulum interface for communication over the I2P (Invisible Internet Project) anonymous overlay network. Provides globally reachable, portable, and persistent addresses without requiring public IP addresses or port forwarding. Uses the SAM API to communicate with a local I2P router (`i2pd` recommended). Connection establishment can take from seconds to minutes. Supports `connectable = yes` for making a node discoverable.

### Identity <span class="glossary-category glossary-category--crypto">Crypto</span>
A 512-bit Curve25519 keyset: 256-bit Ed25519 signing key + 256-bit X25519 encryption key. The fundamental unit of cryptographic trust in Reticulum. Stored as a 64-byte file. An identity can create multiple destinations by varying the application aspect. In Ratspeak, identities can be created, imported (file or base64), exported, and hot-swapped without restart. See [Identity Management](../using-ratspeak/identity-management).

### IFAC <span class="glossary-category glossary-category--protocol">Protocol</span>
Interface Access Code. Passphrase-based mechanism for creating virtual private networks on shared mediums. Derives Ed25519 signing identities from the passphrase and generates per-packet signatures (configurable size via `ifac_size`, 8–512 bits). Packets without valid IFAC signatures are silently dropped. Can be configured via `network_name` (hashed) or raw `passphrase`. See [Interface Modes](../connecting/interface-modes).

### IFAC Flag <span class="glossary-category glossary-category--protocol">Protocol</span>
A single bit in the Reticulum packet header indicating whether Interface Access Code authentication data is prepended to the packet. Set when the interface has `network_name` or `passphrase` configured. See [Wire Format](../understanding/wire-format).

### Ingress Control <span class="glossary-category glossary-category--protocol">Protocol</span>
Rate-limiting mechanism for new destinations appearing on an interface. Enabled by default (`ingress_control = True`). Prevents announce flooding from overwhelming a node. Configured via `ic_new_time`, `ic_burst_freq_new`, `ic_burst_freq`, `ic_max_held_announces`, `ic_burst_hold`, `ic_burst_penalty`, and `ic_held_release_interval`. See [Interface Modes](../connecting/interface-modes).

### Instance <span class="glossary-category glossary-category--protocol">Protocol</span>
Any system running Reticulum with `enable_transport = No` (default). Creates destinations, sends/receives packets, but does not forward packets for other nodes or propagate announces beyond its own interfaces. Contrast with Transport Node, which actively routes traffic.

### Interface <span class="glossary-category glossary-category--interface">Interface</span>
A configured communication channel in Reticulum. Types include: AutoInterface (WiFi/LAN), TCPClient/TCPServer (Internet), RNodeInterface (LoRa radio), BLE Mesh (Bluetooth), UDPInterface, I2PInterface, SerialInterface, PipeInterface, KISSInterface, AX25KISSInterface, and BackboneInterface. Multiple interfaces can be active simultaneously, and Reticulum routes traffic across all of them. See [Interface Types Overview](../connecting/interface-types-overview).

### Interface Mode <span class="glossary-category glossary-category--interface">Interface</span>
Controls how an interface participates in the network: `full` (default — normal bidirectional operation), `gateway` (discovers paths for clients), `access_point` (quiet, suppresses rebroadcasts), `roaming` (faster path expiry for mobile), `boundary` (connects disparate segments). Abbreviations: `ap` for access_point, `gw` for gateway. See [Interface Modes](../connecting/interface-modes).

## K

### Keepalive <span class="glossary-category glossary-category--protocol">Protocol</span>
Periodic maintenance traffic on established Links to verify connectivity. Default interval: 360 seconds. Timeout factor: 4x RTT timeout factor for link timeout calculation. Costs approximately 0.45 bits per second to maintain. Configurable via `Link.KEEPALIVE`.

### KISS <span class="glossary-category glossary-category--interface">Interface</span>
Keep It Simple, Stupid. Framing protocol for serial communication with packet radio TNCs (Terminal Node Controllers). Configured via `KISSInterface` with serial port parameters (`port`, `speed`, `databits`, `parity`, `stopbits`) and radio parameters (`preamble`, `txtail`, `persistence`, `slottime`). Supports beacon identification via `id_callsign` and `id_interval`.

## L

### Link <span class="glossary-category glossary-category--protocol">Protocol</span>
Encrypted, bidirectional channel established via a 3-packet handshake (297 bytes total). Provides forward secrecy via ephemeral ECDH, initiator anonymity (no source address in link request), and supports Packets, Resources, Channels, Buffers, and Request/Response operations. Keepalive overhead: ~0.45 bps. Stale timeout: 720 seconds. See [Links & Communication](../understanding/links-and-communication).

### Link MTU Discovery <span class="glossary-category glossary-category--protocol">Protocol</span>
Automatic mechanism (`LINK_MTU_DISCOVERY = True` by default) that discovers the maximum transmission unit available on an established Link. Allows efficient use of available path capacity, adapting to the constraints of the underlying interfaces along the path.

### LocalClientInterface <span class="glossary-category glossary-category--protocol">Protocol</span>
Internal interface type used when a Reticulum program connects to an existing shared instance via a local socket. Enables multiple programs on the same machine to share a single Reticulum instance and its configured interfaces. In Ratspeak, `rns_manager.py` patches `LocalClientInterface.teardown` to prevent `os._exit()` during safe restarts.

### LXMF <span class="glossary-category glossary-category--messaging">Messaging</span>
Lightweight Extensible Message Format. Zero-configuration encrypted message routing over Reticulum. Three delivery modes: direct (Link-based), opportunistic (single packet), and propagated (store-and-forward). Messages contain: destination (16 bytes), source (16 bytes), Ed25519 signature (64 bytes), timestamp, optional title/content/fields. Protocol overhead: 111 bytes. Compatible across Sideband, NomadNet, MeshChat, and Ratspeak. See [LXMF Protocol](../understanding/lxmf-protocol).

### LXMF Custom Fields <span class="glossary-category glossary-category--messaging">Messaging</span>
Extension fields in LXMF used by RLAP for app-layer communication: `FIELD_CUSTOM_TYPE` (`0xFB` / 251) carries the protocol identifier (`"rlap.v1"`), and `FIELD_CUSTOM_META` (`0xFD` / 253) carries the RLAP envelope dict. These fields are serialized via msgpack alongside standard LXMF fields. Any LXMF client can read these fields, enabling cross-client RLAP adoption. See [RLAP Protocol](../understanding/rlap-protocol).

### LXMF Fields <span class="glossary-category glossary-category--messaging">Messaging</span>
Extensible typed fields in LXMF messages. Standard fields include: `FIELD_EMBEDDED_LXMS` (0x01), `FIELD_TELEMETRY` (0x02), `FIELD_TELEMETRY_STREAM` (0x03), `FIELD_ICON_APPEARANCE` (0x04), `FIELD_FILE_ATTACHMENTS` (0x05), `FIELD_IMAGE` (0x06), `FIELD_AUDIO` (0x07), `FIELD_THREAD` (0x08), `FIELD_COMMANDS` (0x09), `FIELD_RESULTS` (0x0A), `FIELD_GROUP` (0x0B). Custom extension fields `0xFB` and `0xFD` are used by RLAP. Packed via MessagePack for efficient over-the-air transmission.

### LXMessage <span class="glossary-category glossary-category--messaging">Messaging</span>
The core message object in LXMF. Contains destination hash, source hash, Ed25519 signature, timestamp (double-precision float), optional content (text body), optional title, and optional Fields dictionary. Message ID is `SHA-256(destination + source + payload)`. Total protocol overhead: 111 bytes.

### LXMRouter <span class="glossary-category glossary-category--messaging">Messaging</span>
The message transport engine in LXMF. Handles message queuing, delivery receipts, path lookup, routing, retries, failure notifications, and optionally Propagation Node functionality. Manages both inbound and outbound message queues. In Ratspeak, the LXMRouter is torn down and reinitialized during identity hot-swaps.

### lxm:// URI <span class="glossary-category glossary-category--messaging">Messaging</span>
A URI format for encoding LXMF messages as text links. Allows messages to be shared via any text medium — URLs, QR codes, NFC, or even handwritten notes. The encoded message includes full encryption. Enables completely analog "paper message transport" while maintaining end-to-end security.

### LXST <span class="glossary-category glossary-category--messaging">Messaging</span>
Lightweight Extensible Streaming Transport. Real-time streaming protocol for voice calls and audio over Reticulum with end-to-end encryption. Supports Codec2 (700–3200 bps for LoRa) and Opus (4.5–96 kbps for TCP/WiFi). Features signal pipelining for audio processing chains and signal mixing for combining multiple channels.

## M

### MDU <span class="glossary-category glossary-category--protocol">Protocol</span>
Maximum Data Unit. The maximum payload size per packet: **383 bytes** (encrypted/Single destination) or **464 bytes** (plain/unencrypted). The difference accounts for encryption overhead (ephemeral public key, HMAC, IV, PKCS7 padding). See [Wire Format](../understanding/wire-format).

### MeshChat <span class="glossary-category glossary-category--tool">Tool</span>
A user-friendly LXMF client by Liam Cottle for Linux, macOS, and Windows. Web-based interface served via WebSocket. Supports image/voice/file attachments, auto-resend on announce receipt, propagation node sync, and includes a Nomad Network page browser. Compatible with Sideband, NomadNet, and Ratspeak.

### MessageBase <span class="glossary-category glossary-category--protocol">Protocol</span>
Abstract base class for Channel messages in the RNS API. Subclasses must define a unique `MSGTYPE` class variable (must be < `0xf000`) and implement `pack()` and `unpack()` methods for serialization. Used to create typed, structured messages over Links.

### MessagePack (msgpack) <span class="glossary-category glossary-category--messaging">Messaging</span>
Compact binary serialization format used by LXMF (via `RNS.vendor.umsgpack`) to pack message payloads, fields, and RLAP envelopes. More efficient than JSON for over-the-air transmission — critical on bandwidth-constrained links like LoRa where every byte matters. RLAP's single-character keys and short values are designed to minimize msgpack overhead.

### Micron <span class="glossary-category glossary-category--tool">Tool</span>
A bandwidth-efficient markup language used by Nomad Network for rendering node pages. Supports text formatting, layout, and interactive elements in a terminal-based browser. Pages can be statically authored or dynamically generated via server-side scripts (Python, bash, PHP).

### Minimum Bitrate <span class="glossary-category glossary-category--protocol">Protocol</span>
The absolute minimum link throughput Reticulum requires to function: **5 bits per second**. This extremely low requirement enables operation on the most constrained radio links, including long-range LoRa configurations at SF12/BW7.8kHz.

### MTU <span class="glossary-category glossary-category--protocol">Protocol</span>
Maximum Transmission Unit. Fixed at **500 bytes** network-wide. Every Reticulum packet must fit within this limit regardless of the underlying transport medium. This constraint ensures compatibility across all interface types — from LoRa radio (which may have even lower hardware MTUs, handled by fragmentation) to gigabit Ethernet. See [Wire Format](../understanding/wire-format).

## N

### Network Identity <span class="glossary-category glossary-category--protocol">Protocol</span>
A standard Reticulum Identity repurposed for a logical group of nodes or community infrastructure. Used for interface discovery verification, whitelisting, and network privacy. Allows restricting which nodes can join a particular network segment.

### NomadNet <span class="glossary-category glossary-category--tool">Tool</span>
Nomad Network. A terminal-based encrypted communications suite built on Reticulum. Features: encrypted LXMF messaging (direct and delay-tolerant), file sharing, a text-based web browser for viewing Micron pages hosted by network nodes, and a page server with dynamically rendered content. Can run in interactive terminal mode or headless daemon mode for always-on infrastructure.

## O

### OpenModem <span class="glossary-category glossary-category--interface">Interface</span>
An open-source TNC (Terminal Node Controller) compatible with Reticulum's KISS interface. Used for packet radio communication on amateur radio frequencies. Provides the physical layer bridge between a computer running Reticulum and a radio transceiver.

### Opportunistic Delivery <span class="glossary-category glossary-category--messaging">Messaging</span>
LXMF delivery method (code `0x01`) where the message is embedded in a single Reticulum packet and opportunistically routed. Ideal for short messages (under ~200 bytes after encryption overhead). Uses per-packet ephemeral ECDH encryption. No delivery confirmation — the message is sent and forgotten. If the recipient is unreachable, the message is lost unless a propagation node is configured. See [Messaging](../using-ratspeak/messaging).

### Opus <span class="glossary-category glossary-category--messaging">Messaging</span>
High-quality, versatile audio codec used by LXST and Sideband for voice calls and audio messages. Supports profiles from low-bandwidth voice (~4.5 kbps) to lossless stereo music (~96 kbps). Used on higher-bandwidth links (TCP, WiFi) where Codec2's ultra-low bitrate is not required.

## P

### Packet <span class="glossary-category glossary-category--protocol">Protocol</span>
Basic transmission unit in Reticulum, max 500 bytes total. Structure: header (2 bytes) + addresses (16 or 32 bytes) + context (1 byte) + data (0–465 bytes). Automatically encrypted for Single destinations using per-packet ephemeral ECDH keys. Four types: Data, Announce, Link Request, Proof. See [Wire Format](../understanding/wire-format).

### Packet Types <span class="glossary-category glossary-category--protocol">Protocol</span>
The four fundamental packet types encoded as 2-bit values in the header: **Data** (00) — application payload, **Announce** (01) — path discovery broadcast, **Link Request** (10) — initiate encrypted channel, **Proof** (11) — cryptographic delivery confirmation. Each type has specific handling and propagation rules.

### PacketReceipt <span class="glossary-category glossary-category--protocol">Protocol</span>
Delivery confirmation object returned when sending a packet. Tracks status: `SENT`, `DELIVERED`, `FAILED`, `CULLED`. Includes round-trip time measurement. Delivery proofs are unforgeable — signed by the recipient's Ed25519 key. Supports timeout callbacks for retry logic.

### Paper Message <span class="glossary-category glossary-category--messaging">Messaging</span>
An LXMF message encoded as a QR code or `lxm://` text URI that can be physically transported, printed, or shared through any text medium. Enables completely offline, analog message delivery while maintaining end-to-end encryption. Created by Sideband and decodable by any LXMF client.

### Path <span class="glossary-category glossary-category--protocol">Protocol</span>
A route through the network to a destination, discovered via announce propagation. Stored in path tables on each Transport Node. Directional — the path from A to B may differ from B to A. Includes hop count, next-hop interface, and age. Paths expire based on interface mode settings. Viewable via `rnpath` or Ratspeak's connections table.

### Path Table <span class="glossary-category glossary-category--protocol">Protocol</span>
A node's local database mapping destination hashes to the next-hop interface and transport node. Populated by announce propagation — when an announce arrives, the receiving node records which interface it came from and the hop count. Entries expire over time and are refreshed by new announces.

### PATHFINDER_M <span class="glossary-category glossary-category--protocol">Protocol</span>
The maximum number of hops Reticulum will transport a packet: **128**. Defined as a constant in the `Transport` class. Controls the maximum network diameter for announce propagation and path discovery. In practice, most networks operate well within this limit.

### Peering <span class="glossary-category glossary-category--messaging">Messaging</span>
The process by which LXMF Propagation Nodes discover and synchronize with each other. Happens automatically by default. Nodes exchange message catalogs and transfer missing messages, creating an encrypted distributed message store. The LXMRouter preferentially syncs with peers on faster links first.

### PipeInterface <span class="glossary-category glossary-category--interface">Interface</span>
Reticulum interface that communicates via stdin/stdout of an external program. Enables integration with any transport medium that can be wrapped in a command-line program. Supports `respawn_delay` for automatic recovery if the external program exits.

### PKCS7 <span class="glossary-category glossary-category--crypto">Crypto</span>
Padding standard used with AES-256-CBC encryption in Reticulum. Ensures plaintext is padded to the correct 16-byte block size before encryption. The padding bytes each contain the number of padding bytes added, enabling unambiguous removal after decryption.

### Plain MDU <span class="glossary-category glossary-category--protocol">Protocol</span>
The Maximum Data Unit for unencrypted (Plain destination) packets: **464 bytes**. Larger than the Encrypted MDU (383 bytes) because no encryption overhead is added. Used for broadcast-style public information. See [Wire Format](../understanding/wire-format).

### Propagated Delivery <span class="glossary-category glossary-category--messaging">Messaging</span>
LXMF delivery method (code `0x03`) where messages are sent to Propagation Nodes for store-and-forward delivery. The recipient later connects to a Propagation Node to retrieve waiting messages. Enables delay-tolerant messaging for offline recipients. Messages are stored encrypted with a transient ID to prevent correlation. See [Propagation Node](../using-ratspeak/propagation-node).

### Propagation Node <span class="glossary-category glossary-category--messaging">Messaging</span>
An LXMF node that stores and forwards messages for unreachable destinations. Enables delay-tolerant messaging — senders deliver to the propagation node, and recipients sync when they come online. Nodes can peer with each other for distributed message storage. In Ratspeak, enable via Settings or configure an outbound propagation relay per-identity. See [Propagation Node](../using-ratspeak/propagation-node).

### Propagation Type <span class="glossary-category glossary-category--protocol">Protocol</span>
A field in the packet header: either **Broadcast** (sent on all interfaces) or **Transport** (directed along a known path through specific Transport Nodes). Broadcast is used for announces and local traffic; Transport is used for routed packets with known paths.

### Proof Strategy <span class="glossary-category glossary-category--protocol">Protocol</span>
A Destination configuration controlling delivery proof generation. `PROVE_NONE`: never generate proofs. `PROVE_ALL`: always generate proofs for received packets. `PROVE_APP`: delegate the decision to an application callback. Proofs are Ed25519-signed and unforgeable.

### PyCA/cryptography <span class="glossary-category glossary-category--crypto">Crypto</span>
The Python Cryptographic Authority library providing OpenSSL bindings for X25519, Ed25519, and AES-256-CBC operations. Used by the standard `rns` package. Reticulum falls back to pure-Python implementations when unavailable (the `rnspure` package). The OpenSSL-backed version is significantly faster and more scrutinized.

## R

### Ratchet <span class="glossary-category glossary-category--crypto">Crypto</span>
Key rotation mechanism providing forward secrecy for Single destination communication outside of Links. 256-bit keys rotated every 30 minutes (default, configurable via `set_ratchet_interval()`). 512 historical keys retained (configurable via ratchet count). 30-day key expiry (`Identity.RATCHET_EXPIRY = 2592000`). Current ratchet ID is included in announces so senders use the correct key. See [Security Model](../understanding/security-model).

### Remote Management <span class="glossary-category glossary-category--tool">Tool</span>
Feature allowing administration of Reticulum Transport Nodes from remote locations. Enabled in rnsd configuration and authenticated via identity hashes. Tools like `rnstatus`, `rnpath`, and `rnprobe` support `-R hash -i identity_path` flags for remote operation over encrypted Reticulum links.

### Request/Response <span class="glossary-category glossary-category--protocol">Protocol</span>
RPC-like mechanism over Links. The initiator sends a request to a registered handler on the remote side; the handler processes it and returns a response. Supports progress tracking via `RequestReceipt` (states: `FAILED`, `SENT`, `DELIVERED`, `READY`) and configurable timeouts.

### Resource <span class="glossary-category glossary-category--protocol">Protocol</span>
Mechanism for transferring arbitrarily large data over Links. Handles automatic compression, sequencing, integrity verification, and reassembly. Provides progress callbacks for tracking transfer state. Overcomes the 500-byte MTU limitation by segmenting data across multiple packets with reliable delivery.

### RLAP <span class="glossary-category glossary-category--tool">Tool</span>
Reticulum LXMF App Protocol. A lightweight protocol for interactive applications (games, file sharing, collaborative tools) over LXMF messaging. Uses LXMF custom extension fields (`0xFB` for type, `0xFD` for envelope) with single-character keys and msgpack serialization. Designed to fit within the 295-byte OPPORTUNISTIC delivery limit. Clients that don't understand RLAP see human-readable fallback text. See [RLAP Protocol](../understanding/rlap-protocol).

### RLAP Envelope <span class="glossary-category glossary-category--tool">Tool</span>
The structured dict carried in LXMF `fields[0xFD]`. Contains four single-character keys: `"a"` (app_id.version), `"c"` (command), `"s"` (session_id), `"p"` (payload). The envelope must not exceed 200 bytes when packed via msgpack. Combined with the `"rlap.v1"` type marker in `fields[0xFB]`, it forms a complete RLAP message. See [RLAP Protocol](../understanding/rlap-protocol).

### RNode <span class="glossary-category glossary-category--interface">Interface</span>
Open-source LoRa radio interface using a custom MAC layer (not LoRaWAN). Supports sub-GHz ISM bands (430/868/900 MHz) and 2.4 GHz via SX1262/SX1268/SX1276/SX1278/SX1280 Semtech transceivers. Configurable spreading factor, bandwidth, coding rate, TX power, and frequency. Connects via USB serial or Bluetooth. Firmware supports normal mode (host-managed) and TNC mode (standalone). See [LoRa / RNode](../connecting/lora-rnode).

### RNodeMultiInterface <span class="glossary-category glossary-category--interface">Interface</span>
Interface for multi-transceiver RNode devices (e.g., OpenCom XL with both SX1262 and SX1280). Each sub-interface is configured with a unique `vport` value, allowing simultaneous operation on multiple frequency bands through a single physical device.

### rncp <span class="glossary-category glossary-category--tool">Tool</span>
Reticulum file transfer utility. Operates in listen mode (receive files from authorized identities) or fetch mode (request files from remote listeners). Supports automatic compression, progress display, identity-based access control, jail directories for fetch operations, and configurable announce intervals.

### rnid <span class="glossary-category glossary-category--tool">Tool</span>
Reticulum Identity and Encryption Utility. Manages identities (generate, load, export), performs asymmetric encryption/decryption of files, creates and validates Ed25519 signatures, calculates destination hashes for given aspects, and can request unknown identities from the network. Default identity stored in `~/.reticulum/identities/`.

### rnodeconf <span class="glossary-category glossary-category--tool">Tool</span>
RNode configuration and firmware management utility. Key operations: `--autoinstall` (detect hardware, flash firmware, configure), `--normal` (set normal mode), `--tnc` (set standalone TNC mode with radio parameters), firmware update, and device information display. Supports all officially supported RNode hardware platforms.

### rnpath <span class="glossary-category glossary-category--tool">Tool</span>
Reticulum path lookup and management utility. Displays path tables with hop counts, filters by maximum hops, shows announce rate statistics, drops specific paths, and manages blackhole lists (block/unblock identities with duration and reason). Supports remote management of Transport Nodes.

### rnprobe <span class="glossary-category glossary-category--tool">Tool</span>
Reticulum connectivity probe tool, analogous to `ping`. Tests connectivity to destinations configured to reply to probes. Reports round-trip time, hop count, and (when available) RSSI and SNR values. Supports configurable payload size, probe count, timeout, and inter-probe interval.

### rnsd <span class="glossary-category glossary-category--tool">Tool</span>
Reticulum Network Stack Daemon. Background service that manages interfaces, handles transport routing, and maintains path tables. Runs one instance per node. Other programs connect as shared instance clients via `LocalClientInterface`. Supports `--service` flag for headless operation and remote management via identity-authenticated connections.

### rnsh <span class="glossary-category glossary-category--tool">Tool</span>
Reticulum remote shell utility. Establishes fully interactive remote shell sessions over encrypted Reticulum links. Supports a line-interactive mode for extremely low-bandwidth links (hundreds of bits per second). Uses identity-based authentication. Can pipe programs to and from remote systems.

### rnspure <span class="glossary-category glossary-category--tool">Tool</span>
Pure-Python Reticulum package with no compiled dependencies. Identical code to `rns` but without PyCA/cryptography as a dependency — uses pure-Python implementations of all cryptographic primitives. Slower and less scrutinized than the OpenSSL-backed version. Suitable for constrained environments where compiling C extensions is impractical.

### rnstatus <span class="glossary-category glossary-category--tool">Tool</span>
Reticulum status utility. Displays the current state of the Reticulum instance: active interfaces with traffic statistics, transport status, path table size, and connected shared instance clients. Supports remote management for monitoring Transport Nodes from anywhere on the network.

### rnx <span class="glossary-category glossary-category--tool">Tool</span>
Reticulum remote command execution utility. Executes single commands or interactive pseudo-shell sessions on remote systems. Supports identity-based authentication, stdin/stdout/stderr buffer size configuration, and exit code mirroring.

### Roaming Mode <span class="glossary-category glossary-category--interface">Interface</span>
Interface mode (`mode = roaming`) for mobile interfaces that frequently change network position. Uses faster path expiry times to account for the interface's changing topology, ensuring stale paths are replaced quickly.

### RSSI <span class="glossary-category glossary-category--interface">Interface</span>
Received Signal Strength Indicator, measured in dBm. Available via `Packet.get_rssi()` and `Link.get_rssi()` on interfaces that support physical layer statistics (primarily RNode). Useful for assessing link quality and optimizing antenna placement. Reported by `rnprobe`.

## S

### Safe Restart <span class="glossary-category glossary-category--tool">Tool</span>
Ratspeak's mechanism for restarting rnsd without killing the dashboard. Patches `LocalClientInterface.teardown` in RNS to reconnect instead of calling `os._exit()`. Required because interface changes (adding/removing TCP, LoRa, AutoInterface) require rnsd to reload its configuration.

### SerialInterface <span class="glossary-category glossary-category--interface">Interface</span>
Reticulum interface for direct serial port communication. Configured with `port`, `speed`, `databits`, `parity`, `stopbits`, and `flow_control` parameters. Used for point-to-point serial links between nodes. Simpler than KISS — no TNC framing, just raw Reticulum packets over serial.

### SHA-256 / SHA-512 <span class="glossary-category glossary-category--crypto">Crypto</span>
Secure Hash Algorithm variants used throughout Reticulum. SHA-256: destination hash generation (truncated to 128 bits), HMAC authentication, message ID computation, full hash verification. SHA-512: used internally by Ed25519 signature operations. Provided by Python's standard `hashlib` library.

### Shared Instance <span class="glossary-category glossary-category--protocol">Protocol</span>
Reticulum operating mode where the first program to initialize Reticulum on a system creates a shared daemon, and subsequent programs connect via a local socket (`LocalClientInterface`). Eliminates the need for each application to maintain its own interfaces. The shared instance handles all physical interface management and transport operations. This is how Ratspeak's `app.py` connects to the hub node's rnsd.

### Sideband <span class="glossary-category glossary-category--tool">Tool</span>
An advanced LXMF and LXST client for Android, Linux, macOS, and Windows by Mark Qvist. Features: encrypted messaging, voice calls (Codec2/Opus via LXST), audio messages, file transfers, peer-to-peer telemetry with 20+ sensor types, location sharing, paper messages (QR codes), offline maps, Transport Instance mode, Propagation Node support, and an extensible plugin system. Compatible with all LXMF clients including Ratspeak.

### SNR <span class="glossary-category glossary-category--interface">Interface</span>
Signal-to-Noise Ratio, measured in dB. Indicates how much the received signal exceeds the noise floor. Available on radio interfaces that support physical layer statistics. Higher values indicate cleaner reception. Accessible via `Packet.get_snr()` and `Link.get_snr()`. Reported by `rnprobe`.

### Session <span class="glossary-category glossary-category--tool">Tool</span>
An RLAP session is a series of structured messages between two contacts within a specific app. Each session has a unique hex-encoded ID, a lifecycle (challenge -> accept -> actions -> end), per-status TTLs (pending: 24h, active: 7d), and local-only expiry. Sessions are persisted in the database with composite primary keys (session_id + identity_id). See [Games & Apps](../using-ratspeak/games-and-apps).

### Session Type <span class="glossary-category glossary-category--tool">Tool</span>
The interaction pattern for an RLAP app: **turn_based** (players alternate actions — chess, tic-tac-toe), **real_time** (both players can act at any time — collaborative editing), or **one_shot** (single action, no ongoing session — file sharing). Declared in the app manifest. See [RLAP Protocol](../understanding/rlap-protocol).

### Spreading Factor <span class="glossary-category glossary-category--interface">Interface</span>
LoRa modulation parameter (`spreadingfactor`, values 7–12) controlling the trade-off between range and data rate. Higher values (e.g., SF12) provide longer range and better sensitivity but slower data rates — each step roughly doubles the airtime. Lower values (e.g., SF7) give faster data rates but shorter range. Ratspeak presets: Long Range (SF12), Balanced (SF9), Fast (SF7). See [LoRa / RNode](../connecting/lora-rnode).

### Stamp <span class="glossary-category glossary-category--protocol">Protocol</span>
Cryptographic proof-of-work for discoverable interfaces. Prevents spam and resource exhaustion on public infrastructure. Configurable difficulty via `discovery_stamp_value` (0–255+). Connecting nodes must compute a valid stamp before their connection is accepted.

### Stale Time <span class="glossary-category glossary-category--protocol">Protocol</span>
Duration after which a Link with no activity is considered stale: default 720 seconds (12 minutes). After stale time plus a 5-second grace period (`STALE_GRACE`), the link may be torn down. Defined as `Link.STALE_TIME`.

## T

### Tauri <span class="glossary-category glossary-category--tool">Tool</span>
A Rust-based desktop application framework using the system WebView (not bundled Chromium). Ratspeak uses Tauri v2 as its desktop shell — the Python backend is bundled as a sidecar binary via PyInstaller, and the frontend runs in the native WebView. Supports macOS, Linux, and Windows, with planned mobile targets (Android/iOS) via Tauri Mobile.

### Telemetry <span class="glossary-category glossary-category--messaging">Messaging</span>
Sensor data shared between peers in the Sideband ecosystem via LXMF `FIELD_TELEMETRY` messages. Supports 20+ built-in sensor types (location, temperature, humidity, pressure, battery, etc.) plus custom sensors. Shared with cryptographic authentication. Enables peer-to-peer environmental monitoring over mesh networks.

### TNC <span class="glossary-category glossary-category--interface">Interface</span>
Terminal Node Controller. A device bridging a computer to a radio for packet communications. Reticulum interfaces with TNCs via the KISS protocol. Hardware examples: OpenModem, various amateur radio TNCs. Software examples: Dire Wolf. Used with `KISSInterface` and `AX25KISSInterface`.

### Transient ID <span class="glossary-category glossary-category--messaging">Messaging</span>
Temporary identifier used for encrypted LXMF messages while stored on Propagation Nodes. Differs from the permanent message ID to prevent correlation of stored messages with their plaintext source/destination. Provides metadata privacy for messages in transit through the propagation network.

### Transport Node <span class="glossary-category glossary-category--protocol">Protocol</span>
A Reticulum instance with `enable_transport = Yes`. Actively routes packets for other nodes, propagates announces, maintains path tables, and serves path requests. Should be deployed on fixed, persistently available hardware. Multiple Transport Nodes create a self-organizing routing mesh. See [Building Networks](../connecting/building-networks).

### Transport Instance <span class="glossary-category glossary-category--protocol">Protocol</span>
A running Transport Node daemon identified by a unique transport identity hash. The active process representing a Transport Node on the network. Multiple transport instances collaborate to route traffic across the mesh.

### Truncated Hash <span class="glossary-category glossary-category--protocol">Protocol</span>
A SHA-256 hash truncated to 128 bits (16 bytes) used as the destination address. The truncation size provides an address space of 2^128 (~3.4 × 10^38), supporting billions of simultaneous devices while keeping per-packet addressing overhead to just 16 bytes. Defined as `Identity.TRUNCATED_HASHLENGTH = 128`.

### TX Power <span class="glossary-category glossary-category--interface">Interface</span>
Transmit power for RNode LoRa interfaces, configured in dBm via the `txpower` parameter. Must comply with local spectrum regulations (e.g., +30 dBm max in US ISM 915 MHz). Higher power increases range but also interference potential and power consumption. See [LoRa / RNode](../connecting/lora-rnode).

## U

### UDPInterface <span class="glossary-category glossary-category--interface">Interface</span>
Reticulum interface for communication over IP networks using UDP. Supports unicast and broadcast modes. Simpler than TCP (no connection management) but also no reliability guarantees. Broadcasting has performance implications on WiFi. AutoInterface is generally preferred for LAN discovery; UDP is useful for specific point-to-point or multicast configurations.

## V

### Validation Model <span class="glossary-category glossary-category--tool">Tool</span>
The strategy an RLAP app uses to validate actions: **sender** (sender validates before sending, receiver trusts — used by chess), **receiver** (receiver validates on receipt, rejects invalid with error action), or **both** (both sides validate independently). Sender validation is appropriate for casual peer-to-peer play; receiver validation provides stronger guarantees for competitive or cross-client scenarios. See [RLAP Protocol](../understanding/rlap-protocol).

### VPort <span class="glossary-category glossary-category--interface">Interface</span>
Virtual port number used with `RNodeMultiInterface` to distinguish between multiple sub-interfaces sharing the same physical RNode device. Each sub-interface is configured with a unique `vport` value, enabling simultaneous operation on different frequency bands or with different radio parameters through one hardware device.

## W

### Wire Format <span class="glossary-category glossary-category--protocol">Protocol</span>
Binary packet structure: `[HEADER 2 bytes][ADDRESSES 16/32 bytes][CONTEXT 1 byte][DATA 0–465 bytes]`. Header byte 1 encodes: IFAC flag, header type, context flag, propagation type, destination type, packet type. Header byte 2: hop count. Total max: 500 bytes. See [Wire Format](../understanding/wire-format).

## X

### X25519 <span class="glossary-category glossary-category--crypto">Crypto</span>
Elliptic curve Diffie-Hellman key exchange function on Curve25519. Used for all key agreement operations in Reticulum: per-packet encryption key derivation, Link establishment handshake, and ratchet key exchange. Part of every Reticulum identity (256-bit encryption key). Provides the shared secrets from which symmetric AES-256 keys are derived via HKDF.

## Y

### Yggdrasil <span class="glossary-category glossary-category--interface">Interface</span>
An end-to-end encrypted IPv6 overlay network that can serve as a transport medium for Reticulum TCP and Backbone interfaces. Provides an alternative to the public Internet with built-in encryption at the network layer. Useful for connecting Reticulum nodes across the Internet without exposing traffic to ISP inspection.
