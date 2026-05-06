# Community Mesh

A community mesh is what you build when the radius of the network outgrows one operator. A neighborhood, a campus, a town. Several people running their own LoRa nodes, one or two of them also running an IP gateway so the radio segment doesn't live alone, and a shared agreement on radio settings so everyone can hear each other. Public or semi-public — anyone with a matching radio can join.

This page covers the deployment pattern. For radio hardware itself see [RNode & Supported Boards](../hardware/rnode-and-supported-boards) and [LoRa Radio Interfaces](../networking/lora-and-rnode); for daemon mechanics see [Infrastructure & Ops](../deployment/infrastructure-and-ops).

## What this looks like

A community mesh is a mix of node types:

- **Edge nodes.** Operator-run RNodes, Ratdecks, Ratcoms, laptops with a LoRa stick. They speak only over the air and rely on the rest of the mesh to reach anyone past their radio horizon.
- **Transport routers.** Always-on nodes — usually a Raspberry Pi or small SBC with an RNode bolted on — that forward packets between LoRa neighbors and announce paths on behalf of edge devices that come and go.
- **IP gateways.** A subset of transport routers that also have an IP uplink. They bridge the local LoRa segment to wider Reticulum over TCP, AutoInterface, or Backbone. Without at least one gateway, the mesh is isolated to its radio footprint.

A healthy community mesh has more than one gateway and more than one operator. That's the point — no single person owns the network.

## Coordinating on radio settings

LoRa is unforgiving about parameter mismatch. Two RNodes on the same frequency but different spreading factors will not see each other at all. Before anyone deploys, the operators have to agree on five numbers and write them down somewhere everyone can find:

- **Frequency.** Region-dependent. 915 MHz in the Americas, 868 MHz in Europe. Pick a clear band and stick to it.
- **Bandwidth.** 125 kHz or 250 kHz are the common choices. Wider is faster but shorter range.
- **Spreading factor.** SF7 through SF12. Higher is slower and longer range. SF11 is the community sweet spot.
- **Coding rate.** 5 through 8. Higher is more robust but uses more airtime. 5 is the default.
- **Preset.** The Ratspeak/RNode presets bundle these into a single label: Short, Medium, Long Turbo, Long Fast, Long Moderate. Long Fast (SF11, BW250) is the most-common community baseline — solid range, usable throughput, decent battery life.

Pick a preset, document it, and make every operator match. A mesh that drifts on parameters is a mesh that quietly stops working.

## Setting up a gateway node

A gateway is a transport router with two interfaces: one LoRa, one IP. It runs `rnsd-rs` with `enable_transport = yes` so it forwards on behalf of others. Minimal config:

```
[reticulum]
  enable_transport = yes
  share_instance = yes

[interfaces]
  [[Local LoRa]]
    type = RNodeInterface
    port = /dev/ttyACM0
    frequency = 915000000
    bandwidth = 250000
    txpower = 22
    spreadingfactor = 11
    codingrate = 5
    mode = gateway

  [[Backhaul]]
    type = TCPClientInterface
    target_host = backhaul.example.org
    target_port = 4242
    mode = boundary
```

Match the LoRa parameters to whatever the operator group agreed on. Point the backhaul at any reachable Reticulum TCP server — another operator's VPS, a public hub, whatever the group standardized on. Run it as a service with systemd or Docker; see [Infrastructure & Ops](../deployment/infrastructure-and-ops) for unit files.

## Boundary vs gateway mode

Interface modes shape how Reticulum treats traffic crossing between segments. Two modes matter here:

- **`mode = gateway`** on the LoRa side. Gateway mode belongs on the interface facing the clients that need help resolving paths beyond their own segment. In a community mesh, those clients are the edge radios on the local LoRa network.
- **`mode = boundary`** on the IP side. Boundary mode is useful on the interface facing the wider or higher-throughput network. It keeps the backhaul from dumping unnecessary announce traffic into the radio segment while still allowing useful paths to cross.

The pairing matters. Gateway faces the local radio clients; boundary faces the uplink. That combination keeps the LoRa segment efficient while still letting the gateway pull its weight in the wider routing table.

## IFAC or open mesh

IFAC lets you wrap an interface in a pre-shared key. Only nodes that know the key can join. Use it on the LoRa interface if you want a closed mesh — invite-only, no random scanners showing up. The cost is coordination: every operator has to load the same key, and rotating it means rotating it everywhere.

For a public community mesh, skip IFAC. Anyone with a matching radio configuration can join — that's the point. Authentication happens at the application layer (LXMF identity hashes), not radio access.

A common middle ground: open LoRa, IFAC on a private TCP segment used by operators for management.

## Multiple gateways

Reticulum handles redundant paths automatically. Two gateways on the same LoRa segment, both backhauling to wider Reticulum, will both announce — and edge nodes will reach the wider mesh through whichever path the routing table prefers. If one gateway drops, the other takes over without manual reconfiguration.

Operational notes:

- **Announce caps.** Each interface limits how much bandwidth announces are allowed to use. Default is 2% of the interface's airtime. Tune `announce_cap` per interface if your mesh has unusual traffic patterns, but the default is the right answer for almost everyone.
- **Don't synchronize gateways.** Two gateways announcing the same paths at the same instant waste airtime. Reticulum naturally jitters announces, but if you're tuning intervals manually, stagger them.
- **Plan for partition.** If the IP backhaul cuts, the LoRa segment keeps working — that's the whole point of a mesh. Make sure operators know this and don't panic-reboot gateways when the internet flickers.

## Monitoring

Run `rnstatus-rs` on each gateway to see which interfaces are up, how much traffic each is carrying, and how many paths are known. `rnpath-rs <destination_hash>` shows the route Reticulum would use to reach a given node — useful when an edge user reports they can't reach someone and you want to know whether the path is even known. `rnprobe-rs <destination>` sends a probe and prints round-trip time.

For the community as a whole, the simplest health check is whether operators can reach each other's destinations. Designate an Offline Inbox/propagation node (any gateway can run one) and have operators set it as their Manual Offline Inbox node in Ratspeak. If messages flow through it, the mesh is alive.
