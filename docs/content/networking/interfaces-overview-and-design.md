# Network Interfaces

An interface is a transport. Ratspeak doesn't care whether your packets ride
TCP, BLE, or LoRa — every link looks the same to the routing layer above it.
A node can run as many interfaces as it has hardware and network for, and
mixing TCP with LoRa with BLE is the common case rather than the exception.

## What an interface is

An interface is the lowest layer in the Reticulum stack — the thing that
puts bytes on a wire (or radio, or socket) and reads them back. Above it,
[Reticulum](https://reticulum.network/manual/) handles routing, addressing,
crypto, and reliable delivery the same way regardless of the medium. An
announce reaching you over LoRa and one reaching you over TCP look identical
to the rest of the system. The only thing that changes per interface is
bandwidth, latency, and how the interface presents itself to peers — which
in turn shapes how the router treats traffic that crosses it.

## Interface families

Ratspeak ships interfaces in five rough families. You'll typically use one
or two from each, not all of them.

**IP-based.** TCP client/server for stable point-to-point Reticulum links over the
internet or LAN, UDP for low-overhead local broadcasts, AutoInterface for
zero-config LAN discovery (it speaks link-local IPv6 multicast and
auto-discovers peers on the same subnet using UDP ports 29716 for discovery
and 42671 for data), Backbone for high-throughput hub roles, and I2P for
IP-hiding transport through the I2P overlay. AutoInterface is the right
default for "two laptops on the same wifi"; TCP is the right default for
crossing the internet.

**Serial and packet-radio.** Generic Serial, KISS (the standard packet-radio
TNC framing), AX.25-over-KISS for amateur-radio gateways, HDLC for raw
HDLC-framed serial, and Pipe for pumping bytes through any subprocess that
exposes stdin/stdout. These are how you bolt Reticulum onto existing radio
hardware that wasn't designed for it.

**RNode and LoRa.** RNode drives radio hardware directly over USB serial,
Android USB-OTG, Bluetooth LE, or a TCP-exposed RNode stream — long-range LoRa
links for low-bandwidth resilient meshes. RNodeMulti exposes multiple
sub-interfaces from one physical board.
RNode over TCP belongs in this family, not in the normal TCP Client family:
the TCP socket reaches the radio, while the Reticulum traffic still rides LoRa.

**Bluetooth.** BLE-RNode is the BLE bridge for BLE-equipped RNode hardware.
Bluetooth Peer is the phone-to-phone and laptop-to-phone transport that works
without a radio at all — useful when two devices are nearby and you don't
want to share a wifi network.

**Specialty.** LocalInterface for IPC between processes on the same machine
(e.g. an app and a local rnsd), AndroidUSB for hardware attached over the
Android USB host stack, and Weave for an experimental layered transport.

For concrete setup details, use the interface-family pages:
[IP, LAN & I2P](../networking/ip-internet-and-i2p),
[LoRa Radio Interfaces](../networking/lora-and-rnode),
[Bluetooth Interfaces](../networking/bluetooth-interfaces), and
[Serial & Packet Radio](../networking/serial-and-packet-radio).

## Interface modes

Every interface runs in one mode, set in config. The mode tells the router
how to treat traffic crossing this interface and which paths to advertise
to peers on it.

- **full** (default) — normal participant. Announces and forwards everything.
- **access_point** — exposes this node to client peers. Used for hub roles
  where downstream clients connect in.
- **roaming** — for mobile peers whose network presence is intermittent.
- **gateway** — helps clients on this interface discover paths through the
  rest of the node's active interfaces. Use it on the client-facing side of
  a transport gateway.
- **boundary** — controls and accounts for traffic crossing a network edge.
  Use it on the side facing a wider or higher-throughput network when you
  want to keep segments distinct.

Picking the wrong mode mostly hurts efficiency, not correctness — but a
transport node should put `gateway` where downstream clients ask for paths,
and `boundary` where a wider network should not flood a constrained segment
with unnecessary announces.

## IFAC and announce caps

**IFAC (Interface Authentication Codes)** are a per-interface shared secret.
Set a passphrase and code size on both ends; without the matching IFAC,
traffic on that interface is invisible — peers can't even see the announces.
This is how you make a TCP listener private without firewalling it, or run
a LoRa segment only specific nodes can join.

**Announce caps** rate-limit announce traffic per interface, expressed as a
fraction of the link's bandwidth (default 2%). On a fast TCP link you'll
never notice; on a 1.2 kbps LoRa link this is what stops a busy mesh from
saturating the channel with routing chatter. Tune it lower on slow links,
leave it alone on fast ones.

## Combining interfaces

A few patterns cover most real deployments.

**Laptop with LoRa dongle.** AutoInterface on the LAN for fast local
traffic, an RNode interface attached over USB, BLE, or TCP for long-range,
and optionally Bluetooth Peer so a nearby phone can talk to the laptop without
joining the wifi. The router decides per-destination which interface to
use; you don't manage that by hand.

**Hub with many clients.** A TCP server interface in `access_point` mode
plus a Backbone interface to peer hubs. Set IFAC on the access_point if the
hub is private. Hubs talk to each other over the backbone.

**Two-network bridge.** One interface per network on a single transport
node. In a LoRa-plus-IP gateway, put the local LoRa/RNode interface in
`gateway` mode so nearby radios can resolve paths through the node. Put the
wider IP/backhaul interface in `boundary` mode when you want to keep the
radio segment from being flooded by the larger network.

**Mobile node.** AutoInterface for whichever LAN it's on right now, plus
Bluetooth Peer for ad-hoc nearby connections. `roaming` mode tells upstream
routers this node's reachability is intermittent.

Every interface a node runs is just another path the router can use. Add
interfaces as you have hardware; the rest of the stack adapts.
