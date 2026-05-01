# Interfaces Overview & Design

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

**IP-based.** TCP client/server for stable point-to-point links over the
internet or LAN, UDP for low-overhead local broadcasts, AutoInterface for
zero-config LAN discovery (it speaks link-local IPv6 multicast and
auto-discovers peers on the same subnet using UDP ports 29716 for discovery
and 42671 for data), Backbone for high-throughput hub roles, and I2P for
anonymized routing through the I2P overlay. AutoInterface is the right
default for "two laptops on the same wifi"; TCP is the right default for
crossing the internet.

**Serial and packet-radio.** Generic Serial, KISS (the standard packet-radio
TNC framing), AX.25-over-KISS for amateur-radio gateways, HDLC for raw
HDLC-framed serial, and Pipe for pumping bytes through any subprocess that
exposes stdin/stdout. These are how you bolt Reticulum onto existing radio
hardware that wasn't designed for it.

**RNode and LoRa.** RNode and RNodeMulti drive RNode hardware directly over
USB or BLE — long-range LoRa links for low-bandwidth resilient meshes.
RNodeMulti exposes multiple sub-interfaces from one physical board.

**Bluetooth.** BLE-RNode is the BLE bridge for BLE-equipped RNode hardware.
BLE-peer is a peer-to-peer mesh layer between phones and laptops without
needing a radio at all — useful when two devices are nearby and you don't
want to share a wifi network.

**Specialty.** LocalInterface for IPC between processes on the same machine
(e.g. an app and a local rnsd), AndroidUSB for hardware attached over the
Android USB host stack, and Weave for an experimental layered transport.

## Interface modes

Every interface runs in one mode, set in config. The mode tells the router
how to treat traffic crossing this interface and which paths to advertise
to peers on it.

- **full** (default) — normal participant. Announces and forwards everything.
- **access_point** — exposes this node to client peers. Used for hub roles
  where downstream clients connect in.
- **roaming** — for mobile peers whose network presence is intermittent.
- **boundary** — controls and accounts for traffic that crosses between
  networks. Use on the seam between two segments you want to keep distinct.
- **gateway** — bridges two networks. The interface participates in path
  discovery for both sides.

Picking the wrong mode mostly hurts efficiency, not correctness — but a
pair of `gateway` interfaces is what turns a single node into a router
between two otherwise-disconnected segments, and `boundary` is what stops a
high-bandwidth network from flooding announces into a low-bandwidth one.

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
traffic, an RNode interface on the USB-attached LoRa board for long-range,
and optionally BLE-peer so a nearby phone can talk to the laptop without
joining the wifi. The router decides per-destination which interface to
use; you don't manage that by hand.

**Hub with many clients.** A TCP server interface in `access_point` mode
plus a Backbone interface to peer hubs. Set IFAC on the access_point if the
hub is private. Hubs talk to each other over the backbone.

**Two-network bridge.** One interface per network on a single node, both in
`gateway` mode — typically a TCP gateway facing the internet plus a
LoRa/RNode gateway facing the local mesh. Use `boundary` instead of
`gateway` to meter or restrict traffic between segments rather than route
freely.

**Mobile node.** AutoInterface for whichever LAN it's on right now, plus
BLE-peer for ad-hoc nearby connections. `roaming` mode tells upstream
routers this node's reachability is intermittent.

Every interface a node runs is just another path the router can use. Add
interfaces as you have hardware; the rest of the stack adapts.
