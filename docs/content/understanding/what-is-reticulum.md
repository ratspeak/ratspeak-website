# What is Reticulum?

Reticulum is the networking layer underneath Ratspeak. It is not a chat app, a radio firmware, a server, or one specific public network. It is a cryptography-based stack for building local and wide-area networks over whatever carriers are available: LoRa, serial links, packet radio, Wi-Fi, Ethernet, TCP, UDP, I2P, Bluetooth, or custom interfaces.

The important idea is simple: Reticulum gives applications a way to reach cryptographic destinations without depending on IP addresses, DNS, accounts, phone numbers, or a central service provider.

## The mental model

In IP networking, you usually send data to an address and port. In Reticulum, applications create **destinations**. A destination is a cryptographic endpoint with a short 16-byte hash. That hash is what the network routes toward.

When a destination wants to be reachable, it sends an **announce**. Transport nodes that hear the announce learn the next hop back toward that destination and may re-broadcast the announce onward. No node needs a complete map of the network. Each forwarding node only needs to know the next step that gets a packet closer.

When two endpoints need a private session, Reticulum establishes a **link**: an encrypted, ephemeral channel that can span one hop or many. Larger transfers ride over links as **resources**. Messaging applications usually add **LXMF** on top, which defines message structure, signatures, direct delivery, opportunistic single-packet delivery, and store-and-forward propagation.

For a Ratspeak user, that means your app can sit on a laptop, phone, LoRa handheld, or server and still participate in the same mesh as long as at least one Reticulum path connects it to the rest of the network.

## What makes it different

**Destinations replace IP addresses.** A Reticulum address is not a place in a subnet. It is a destination hash derived from an identity and an application destination name, such as `lxmf.delivery`.

**The network is medium-agnostic.** Reticulum packets can cross slow LoRa, local Wi-Fi, TCP over the public internet, I2P, serial lines, and other carriers in the same deployment. Interfaces are adapters; the packet and routing model stay the same.

**Routing is learned from announces.** There is no DNS zone, DHCP server, certificate authority, central directory, or required account provider. Reachability emerges from announces and transport nodes.

**Private user traffic is encrypted end-to-end.** Ratspeak and LXMF use Reticulum Single destinations and Links, so messages are encrypted for the recipient before they leave the sender. Reticulum also supports Plain destinations for direct local public broadcast, but that is not how private Ratspeak messages are carried.

**It is designed for scarce links.** Reticulum assumes bandwidth can be tiny, latency can be high, and links can be intermittent. The default packet MTU is 500 bytes, and the protocol is designed to remain useful on carriers with very low throughput, down to the 5 bits-per-second class described by the reference manual.

## What Reticulum is not

Reticulum is not a magic replacement for physical connectivity. If no radio, cable, LAN, internet tunnel, or propagation path connects two regions, packets cannot cross the gap.

It is not the same thing as anonymity software. Reticulum omits source addresses from packets and supports initiator anonymity, but traffic timing, physical-layer observation, interface logs, and operational mistakes can still leak information.

It is not automatically store-and-forward by itself. Reticulum provides the network substrate. LXMF propagation nodes provide offline message storage for messaging workflows; Ratspeak presents that feature as Offline Inbox.

It is not limited to off-grid radio. LoRa and RNodes are important because they make independent infrastructure practical, but Reticulum is just as comfortable over local Ethernet, Wi-Fi, TCP, UDP, I2P, or mixed networks.

## How Ratspeak uses it

Ratspeak creates and manages a Reticulum identity for you, exposes an LXMF delivery destination, and uses Reticulum interfaces to move traffic across whatever paths you enable. A desktop app on TCP, a phone on BLE, and a handheld on LoRa are not separate systems; they are different ways into the same Reticulum routing fabric.

When you add a contact, send a message, request a path, connect an RNode, or use Offline Inbox, you are using Reticulum concepts through Ratspeak's user interface.

## Where to go next

Read [Key Concepts & Glossary](../understanding/key-concepts-and-glossary) when you need names for the moving parts. Read [Protocol Architecture](../understanding/protocol-architecture) when you want the routing and packet model. Read [Links & LXMF](../understanding/links-and-lxmf) for messaging behavior. Read [Cryptography & Protection](../understanding/cryptography-and-protection) for the security model and its limits.
