# Key Concepts & Glossary

A reference for terms you will encounter throughout the rest of these docs. Skim it on first read; come back when you hit a word you don't recognise.

---

## Identity & Addressing

**Identity.** The cryptographic root of every participant on a Reticulum network. An identity is 64 bytes in total: a 32-byte X25519 private key for encryption and a 32-byte Ed25519 seed for signing. The matching public keys derive every destination hash you announce. Lose this file and you lose the ability to receive messages sent to those destinations; share it and someone else can impersonate you, so back it up the same way you would back up an SSH key.

**Destination.** An endpoint addressable on the network. Each destination is built from an identity plus an application name and aspect path (for example, `lxmf.delivery`). Four flavours exist — Single, Group, Plain, and Link — but Single is the one most user-facing software, including Ratspeak, presents to you.

**Address / Destination Hash.** The 16-byte truncated SHA-256 of a destination's identifying material. This is the 32-character hex string you copy when you share a contact (for example, `4faf1b2e0a077e6a9d92fa051f256038`). It is the only address Reticulum routes on — there are no IPs, no domains, no hostnames.

**Ratchet.** A forward-secrecy mechanism that rotates the encryption key advertised in a destination's announces. Defaults retain the last 512 ratchets and rotate every 1800 seconds (30 minutes). Messages encrypted with a recent ratchet can still be decrypted within the retention window, while traffic from earlier ratchets stays protected even if the long-term identity later leaks.

**Ratspeak Identity.** The same kind of Reticulum identity described above, simply created and stored by the Ratspeak app on your behalf. There is nothing special about a Ratspeak-generated identity at the protocol level — it is fully interoperable with every other Reticulum implementation.

---

## Routing

**Announce.** A packet broadcasting an identity (and its current ratchet key) to the mesh. Transport nodes that hear an announce learn a path back to the sender and re-broadcast it onward, subject to hop limits and per-interface rate caps. Announces are how Reticulum's routing tables get populated — there is no central directory.

**Path.** The route from one identity to another, expressed as a hop count plus the next-hop interface and neighbour. Paths are learned passively from announces and refreshed on use; unused paths eventually expire from the table and are re-learned the next time the destination announces.

**Hop.** One step along a path — one transport node passing a packet to the next. Reticulum permits up to 128 hops (the `PATHFINDER_M` constant), which is more than any realistic mesh will ever need. Each hop decrements a counter on the packet, so loops are bounded.

**Transport Node.** A Reticulum instance configured with `enable_transport = yes`. It forwards packets on behalf of other nodes and is the building block of any multi-hop network. Run one on every always-on, well-connected machine you control; the more transport nodes a region has, the more resilient routing becomes.

**AutoInterface.** Zero-configuration LAN discovery using link-local IPv6 multicast on UDP ports 29716 and 42671. Enable it and any other Reticulum instance on the same broadcast domain finds you automatically — no addresses to type, no firewall rules to edit.

**Backbone.** An HDLC-over-TCP interface optimised for high-throughput WAN links between transport nodes. It is the right choice when you are wiring two sites together over the public internet and want every byte of available bandwidth.

**RNode.** A class of LoRa boards (ESP32- or nRF52-based) that speak Reticulum natively over USB or Bluetooth LE. RNodes are how Reticulum reaches off-grid: kilometres of range, sub-watt power consumption, no internet, no cell service, no infrastructure required.

**KISS.** A simple framing protocol originally designed for amateur-radio TNCs. Reticulum's KISS interface lets the stack drive any radio that speaks KISS over a serial link, broadening the range of supported hardware well beyond purpose-built RNodes.

**IFAC.** Interface Authentication Codes. A per-interface shared secret that gates which peers may exchange traffic across that link. Two nodes whose IFAC values do not match simply cannot see each other on that interface — useful for carving private segments out of a shared medium such as a public TCP transport.

**Interface.** Any concrete way Reticulum sends and receives bytes: TCP, UDP, AutoInterface, RNode (over LoRa), serial, KISS over a TNC, I2P, Backbone, Bluetooth LE — each is a driver that turns the abstract notion of "send this packet" into something a physical or virtual link will accept. A node can run as many interfaces concurrently as its hardware allows, and Reticulum routes between them transparently.

**Mesh.** The set of nodes reachable from a given starting point through one or more hops. Reticulum meshes can span any combination of media — a phone on Wi-Fi, a laptop on a LoRa radio, and a server on the public internet can all share a single mesh as long as transport nodes bridge them.

**Bandwidth Cost.** The shared overhead cap that Reticulum imposes on announces (and similar maintenance traffic) per interface, expressed as a percentage of the link's available bandwidth. The default keeps housekeeping below a small fraction of total throughput, so a chatty mesh cannot starve real payload traffic.

---

## Encryption & Sessions

**Link.** An encrypted point-to-point session between two destinations, established by a three-packet handshake. Links provide forward secrecy and a reliable bidirectional channel suitable for request/response RPC, file transfers, and interactive sessions. Once the handshake completes, neither side's long-term keys are needed for the duration of the link.

**Resource.** A file-sized payload transferred over a link with reliability, segmentation, and progress reporting. Resources are how anything larger than a single packet moves between two endpoints — they handle chunking, retransmission, and reassembly transparently.

**MTU / MDU / ENCRYPTED_MDU.** Reticulum's three packet-size constants: 500 bytes total on the wire (MTU), 464 bytes available to the framework after the wire header (MDU), and 383 bytes available to encrypted payloads after the per-packet encryption overhead (ENCRYPTED_MDU). Anything larger than the relevant limit must travel as a Resource transfer.

**Forward Secrecy.** The property that compromising a long-term key today does not retroactively expose past traffic. Reticulum gets it from ephemeral key exchange on every link and from the announce ratchet on Single destinations.

**End-to-End Encryption.** Encryption that happens on the originating node and is undone only on the receiving node. Transport nodes in between forward sealed bytes and cannot read the contents — this is the default for every LXMF message and every link.

---

## Messaging

**LXMF.** The Lightweight Extensible Message Format — Reticulum's standard messaging layer. It defines how messages are serialised, signed, and delivered, and is the format every Reticulum messenger speaks. Ratspeak, Sideband, and NomadNet all interoperate because they all speak LXMF.

**Direct / Opportunistic / Propagated.** The three LXMF delivery modes. *Direct* opens a link to the recipient and hands the message over within that session, getting an explicit delivery confirmation. *Opportunistic* fires the message as a single packet without setting up a link, which is suitable for short notes when the recipient is currently reachable. *Propagated* hands the message to a propagation node, which holds it until the recipient comes online and requests it.

**Stamp.** A small proof-of-work attached to an LXMF message, used as a spam-control signal. The recipient publishes a difficulty value; senders without a ticket pay the CPU cost to compute a valid stamp on every message before it will be accepted.

**Ticket.** A per-pair token issued by a recipient that lets a known sender bypass the stamp requirement. Tickets are the mechanism by which conversations between trusted parties stay frictionless after the first exchange — once you have a peer's ticket, your messages skip the proof-of-work.

**Propagation Node.** A daemon running `lxmd` that stores LXMF messages on behalf of offline peers and delivers them on reconnect. Without at least one reachable propagation node, messages sent to an offline recipient have nowhere to wait and will fail to deliver.

**Sideband / NomadNet.** Two of the most widely used LXMF clients besides Ratspeak. Sideband is a graphical messenger; NomadNet is a terminal-based client that also exposes a small page-and-form server (the "Nomad Network") for distributed micro-sites. Anything one of them can send, the others can receive.

---

## Tools

The Reticulum command-line toolkit ships six binaries; both the Python upstream and the Rust port (`rsReticulum`) provide the same set:

- **rnsd** — the network stack daemon. Runs in the background, owns the interfaces and routing tables, and exposes a local RPC socket that other tools and applications connect to.
- **rnstatus** — prints the current state of every configured interface and recently seen destinations.
- **rnpath** — queries and inspects path table entries; useful for confirming that an announce arrived and for tracing how a packet would be routed.
- **rnid** — generates and inspects identity files; the standard way to create a new keypair from the command line.
- **rncp** — copies files between two Reticulum endpoints over a Resource transfer, like `scp` for the mesh.
- **rnprobe** — sends a test packet to a destination and reports the round trip, the Reticulum equivalent of `ping`.

**rnsh.** A separate Python utility that provides remote shell sessions over Reticulum links — roughly the Reticulum equivalent of `ssh`. It is shipped independently of the core tool set above and is not part of the Ratspeak Rust stack; install it from the Python `rnsh` package if you want it.
