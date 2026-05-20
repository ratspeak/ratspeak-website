# Key Concepts & Glossary

A reference for the terms used throughout the Ratspeak and Reticulum docs. Read [What is Reticulum?](../understanding/what-is-reticulum) first if you want the short conceptual overview; use this page when a word needs a precise meaning.

---

## Identity & Addressing

**Identity.** The cryptographic root of a Reticulum participant, service, device, or application endpoint. A Reticulum identity is a 64-byte private keyset: 32 bytes for X25519 key agreement and 32 bytes for an Ed25519 signing seed. Back it up like an SSH key. Anyone with the private key can act as that identity.

**Ratspeak Identity.** A normal Reticulum identity created and stored by Ratspeak. There is nothing protocol-special about it; it interoperates with other Reticulum implementations.

**Destination.** An addressable endpoint created by an application. A destination combines an identity, an application name, and one or more aspects such as `lxmf.delivery`. Reticulum has four destination types: Single, Group, Plain, and Link. Ratspeak messaging primarily uses Single destinations and Links.

**Address / Destination Hash.** The 16-byte truncated SHA-256 value Reticulum routes toward. In user interfaces it is displayed as 32 hex characters, for example `4faf1b2e0a077e6a9d92fa051f256038`. Reticulum does not route on IP addresses, domain names, usernames, or phone numbers.

**Name Hash.** The 10-byte hash of an application destination name such as `lxmf.delivery`. For Single destinations, the final destination hash also includes the identity hash, which is why two users can both have an `lxmf.delivery` destination without sharing the same address.

**Ratchet.** A rotating X25519 key advertised in announces by destinations that enable ratchets. It provides forward secrecy for link-less Single destination packets. Default parameters retain 512 generated ratchets, rotate no more often than every 1800 seconds, and expire received ratchets after about 30 days.

---

## Nodes & Routing

**Reticulum Instance.** A running Reticulum stack on a device or process. It owns interfaces, keeps local path state, and sends or receives traffic for local applications.

**Transport Node.** A Reticulum instance with `enable_transport = Yes`. It forwards packets for other nodes and is what makes multi-hop reachability possible. Always-on machines, gateways, and infrastructure nodes are good transport-node candidates.

**Announce.** A signed packet that tells the mesh a destination exists and how to start reaching it. Announces carry the public key material for a destination, optional application data, and an optional ratchet key. Transport nodes use announces to populate path tables.

**Path.** A route toward a destination, stored locally as a next hop, interface, and hop count. Reticulum nodes do not need a complete map of the mesh; each transport node only needs the next step that moves a packet closer.

**Path Request.** A request for the network to find or refresh a route to a destination hash. Ratspeak exposes this as **Request Path** when a contact is known but not currently reachable.

**Hop.** One forwarding step through a transport node. The default maximum announce depth is 128 hops, which is far beyond normal real-world deployments.

**Mesh.** The set of Reticulum nodes reachable through one or more compatible interfaces and transport nodes. A mesh can span mixed media: LoRa, LAN, TCP, I2P, BLE, serial, and other carriers.

---

## Interfaces & Carriers

**Interface.** A driver that lets Reticulum send and receive bytes over a particular medium. Examples include TCP, UDP, AutoInterface, RNode LoRa, serial, KISS, AX.25 KISS, I2P, Backbone, Bluetooth LE, and custom modules.

**AutoInterface.** Zero-configuration LAN discovery over IPv6 multicast. By default, discovery uses UDP port `29716` and data uses UDP port `42671`. It works only where the local network allows multicast and matching `group_id` values.

**RNode.** A class of LoRa transceivers that speak Reticulum-friendly framing over USB serial, Android USB-OTG, Bluetooth LE, or a TCP bridge. RNodes are how Reticulum reaches off-grid radio networks without depending on cell service or the internet.

**KISS.** A simple framing protocol from packet radio. Reticulum's KISS interfaces can use TNCs, modems, and compatible radio devices that expose KISS over serial or TCP.

**Backbone.** A high-throughput TCP-based interface intended for efficient WAN links between Reticulum nodes. It is useful for infrastructure and server roles; ordinary TCP client/server interfaces are still valid and widely used.

**IFAC.** Interface Access Codes. IFAC signs packets with material derived from an interface name or pre-shared passphrase. Receivers without matching IFAC settings drop those packets before they enter the local Reticulum stack. IFAC segments a carrier; it does not replace end-to-end encryption.

**Bandwidth Cost / Announce Cap.** The share of an interface's bandwidth that can be spent on announces and related maintenance traffic. The default announce cap is 2%, so routing updates cannot permanently starve payload traffic on slow links.

---

## Encryption, Links & Transfer

**Single Destination.** The most common destination type. It is bound to an identity and can be reached over multiple hops. Packets to a Single destination are encrypted for the holder of that identity's private key, or for its current ratchet key when one is known.

**Plain Destination.** A direct-only, unencrypted destination type for local public broadcast or discovery. Plain destinations are not transported over multiple hops.

**Group Destination.** A direct-only destination encrypted with a pre-shared symmetric key. Anyone with the group key can read packets for that destination.

**Link.** An encrypted point-to-point session between two destinations. A link can cross multiple hops, uses ephemeral key exchange, and provides a better substrate for reliable channels, request/response workflows, and larger transfers.

**Resource.** A reliable transfer over a link for payloads larger than a single packet. Resources handle chunking, sequencing, verification, retransmission, and reassembly.

**MTU / MDU.** Reticulum's default network MTU is 500 bytes. The plain packet MDU is 464 bytes, the encrypted Single packet payload limit is 383 bytes, and the default link packet MDU is 431 bytes. LXMF's usable message content limits are smaller because LXMF adds its own headers and signature.

**Forward Secrecy.** The property that compromising a long-term identity key later does not retroactively decrypt old traffic. Reticulum gets this from ephemeral link key exchange and, for link-less Single destination packets, from destination ratchets when enabled.

**End-to-End Encryption.** Encryption applied by the originator and removed only by the intended recipient. Transport nodes forward sealed bytes; they are not message relays with plaintext access.

---

## Messaging

**LXMF.** The Lightweight Extensible Message Format. It is the messaging layer used by Ratspeak, Sideband, NomadNet, and other Reticulum applications. LXMF defines message serialization, sender signatures, delivery methods, propagation, stamps, and tickets.

**Direct Delivery.** LXMF opens a Reticulum link to the recipient and delivers the message over that encrypted session. This is preferred when the recipient is reachable and the message needs reliable delivery.

**Opportunistic Delivery.** LXMF sends a small message as one encrypted Reticulum packet without establishing a link. With default parameters, the practical LXMF content limit is about 295 bytes. It is fast and cheap, but it has no link-level acknowledgement.

**Propagated Delivery.** LXMF gives the encrypted message blob to a propagation node, which stores it until the recipient connects and requests waiting mail.

**Offline Inbox.** Ratspeak's user-facing name for LXMF propagated delivery and propagation-node sync. In Auto mode, Ratspeak chooses a reachable inbox node; in Manual mode, you pin a specific propagation-node hash.

**Propagation Node.** An LXMF daemon, such as `lxmd-rs`, that stores messages for offline recipients. It is a delivery aid, not a trust anchor; message contents remain encrypted to the recipient.

**Stamp.** A proof-of-work value attached to an LXMF message as spam resistance. Unknown senders may need to spend CPU to produce a stamp that meets the recipient's advertised cost.

**Ticket.** A per-sender token that lets a trusted correspondent bypass stamp work for future messages. Tickets keep ongoing conversations lightweight after first contact.

**Sideband / NomadNet.** Widely used Reticulum applications. Sideband is a graphical LXMF messenger. NomadNet is a terminal client and page system. Ratspeak interoperates with them through Reticulum and LXMF.

---

## Tools

The core Reticulum tools most Ratspeak operators will encounter are:

- **rnsd-rs** - the Reticulum daemon. It owns interfaces and routing state for local clients.
- **rnstatus-rs** - shows interface and path status.
- **rnpath-rs** - inspects, requests, and manages paths.
- **rnid-rs** - creates, inspects, imports, exports, hashes, signs, verifies, encrypts, and decrypts Reticulum identities and identity-bound files.
- **rncp-rs** - copies files over Reticulum resources.
- **rnprobe-rs** - probes a destination, similar in spirit to `ping`.

Most Ratspeak operators only need the tools above. Additional utility parity and deferred command-line surfaces are tracked in the rsReticulum release notes.
