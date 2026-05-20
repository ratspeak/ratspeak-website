# Network & Peers

Ratspeak gives you two views into the mesh: **Peers**, which lists the people and nodes you can reach, and **Network**, which shows the radios, links, and Offline Inbox nodes available for store-and-forward messaging. Together they answer the two questions that matter most on a mesh: *who can I talk to right now?* and *how is this device actually connected?*

## The Peers view

The Peers list shows every Reticulum identity Ratspeak has heard from, whether you've added them as a contact or not.

Each row carries a status dot, a display name (or a hash if no name has been announced yet), the number of hops to reach them, how recently their path was refreshed, and a short "via" label pointing at the next hop. The status dot is colored: green for direct or reachable, amber for stale, grey for offline or unknown.

Peers are grouped by reachability:

- **Contacts** — peers you've explicitly added, pinned at the top.
- **Online** — reachable peers with a real announced name.
- **Online\*** — reachable, but identity-only (no name announced yet).
- **Stale** — path is aging out and may not work.
- **Offline** — no current path.

Tap any group header to collapse or expand it. Group state is remembered between sessions.

You can search by name or hash, sort by name, status, hops, or last-seen, and filter to show only reachable, only stale, or only offline peers. The slash key (`/`) jumps focus to the search box on desktop.

On desktop, clicking a row opens an inline detail strip with their full hash, path age, hop count, and Add / Message buttons. On mobile, a tap brings up a bottom sheet with the same detail plus a Block action.

Blocking a peer hides them from the list and discards their messages. There is also an optional "block at the network layer" toggle in the block dialog that drops their packets entirely — useful for relay nodes you don't want forwarding traffic on your behalf.

A peer being "online" means Ratspeak has an active path to their identity — not that they're actively using the app. They might be on the other side of a sleeping phone or a battery-powered node. Reticulum opportunistically refreshes paths, so the list stays close to current without you doing anything.

## The Network view

The Network view is divided into sections by interface type — Internet, LoRa Radio, Bluetooth, and any local interfaces — and shows the live state of each: whether it's up, recent throughput, the number of active links, and per-interface alerts.

There is no graph or map visualization. Mesh topology changes faster than a picture can usefully render, and the lists carry every fact a graph would: which links are up, what they're carrying, and which peers each one currently serves.

Each interface row expands to show its configuration, lifetime byte counters, current send and receive rates, and an action menu for removing or restarting it. Alerts (a radio that hasn't seen traffic in a while, a TCP hub that keeps disconnecting) surface inline next to the row that produced them.

Below the interfaces, you'll find **Transport stats** — paths in your routing table, total bytes in and out, announces seen — and the **Offline Inbox** section listing the LXMF propagation nodes Ratspeak can use for offline messages.

Pressing the announce button in the Network view, or long-pressing the bottom bar on mobile, broadcasts your identity to the mesh right now. See *Announcing yourself* below.

## Transport Mode

**Settings → Network → Transport Mode** controls whether this Ratspeak device relays Reticulum traffic for other peers. It does not change your identity, Offline Inbox setting, or which interfaces you personally can use. It only changes whether your running Reticulum instance participates in forwarding, announce rebroadcasting, and path replies for others.

The modes are:

- **OFF** — default. Ratspeak behaves as a normal client. It can send, receive, announce itself, and use routes learned from the mesh, but it does not intentionally relay traffic for other peers.
- **ON** — Ratspeak enables Reticulum transport forwarding whenever the local runtime is allowed to do so. Shared-instance clients leave this work to the shared instance they are attached to.
- **AUTO** — Ratspeak enables Transport Mode only when the current setup looks suitable: the network is Wi-Fi, Ethernet, or an unknown desktop network type; at least one enabled non-LoRa interface exists, such as Local Network, TCP, or Backbone; and no enabled LoRa/RNode interface is configured. On Android and iOS, `unknown`, cellular, and no-network states keep AUTO disabled.

AUTO is intentionally conservative. It is meant to avoid turning phones, cellular links, and LoRa radios into accidental relays while still allowing a desktop or fixed machine with a non-LoRa interface to help the mesh. Ratspeak re-evaluates AUTO whenever the app learns about a network-type change or an interface is added, removed, or updated, so changing your Local Network, TCP, Backbone, or LoRa setup does not require a restart. If you are deliberately running infrastructure, use **ON** and make sure the device is stable, powered, and connected through interfaces that can handle the extra traffic.

## Adding an interface

Open Network and tap **Add Interface**. Ratspeak supports these common interface types, each suited to a different transport:

- **TCPClientInterface** — connect to a public or private Reticulum hub over the internet. You provide a host and port, and Ratspeak keeps the link alive. Good for joining the wider Reticulum network when you have connectivity.
- **AutoInterface** — discovers peers on your local network (LAN, mesh Wi-Fi, hotspot) using IPv6 link-local multicast. No configuration needed; if another Reticulum node is on the same subnet, you'll find it.
- **RNode (USB / Serial)** — a LoRa radio plugged in over USB. On desktop, Ratspeak enumerates serial ports for you. On Android, USB-OTG cables let you drive an RNode directly from a phone.
- **RNode over BLE** — an RNode connected over Bluetooth Low Energy. The RNode must be in pairing mode the first time, after which Ratspeak remembers the bond and reconnects automatically.
- **RNode over TCP** — a LoRa radio whose RNode/KISS stream is exposed on a local TCP endpoint. Enter `host`, `host:port`, `tcp://host`, or `tcp://host:port`; if the port is omitted, Ratspeak uses `7633`. This is a radio interface, not a normal TCP Client hub link.
- **Bluetooth Peer** — phone-to-phone (and desktop-to-phone) Reticulum over Bluetooth, with no infrastructure needed. Nearby Ratspeak clients with Bluetooth Peer active appear as peers; messages, announces, and file transfers flow over the link directly. Toggle it from Network → Bluetooth Peer, or in Settings → Network → Bluetooth Peer.

Adding a radio interface while another is already serving the same physical RNode (USB, BLE, or TCP) will tear down the older one automatically so the radio is never driven from two places at once.

## Offline Inbox

Offline Inbox is Ratspeak's user-facing name for LXMF propagation nodes. A propagation node is an encrypted store-and-forward inbox: it can hold messages for offline recipients and hand them over when the recipient comes back online. The node stores sealed LXMF blobs; it does not get plaintext access to the message contents.

In **Settings → Network → Offline Inbox**, choose one of three modes:

- **Off** — stops active Offline Inbox client checks, blocks new inbox syncs, and prevents new automatic Offline Inbox sends. Messages already accepted by a remote inbox node remain there for the recipient, but switching Off does not keep a local sync running just to drain it.
- **Auto** — Ratspeak chooses a reachable inbox node. If **Favor Ratspeak nodes** is enabled, bundled Ratspeak inbox nodes win only after Ratspeak has current path evidence for them. If none are reachable, Auto can fall back to another reachable propagation node discovered from the mesh.
- **Manual** — you pin a specific 32-character propagation-node destination hash. Ratspeak will use that node when it has a live path to it, and will ask the mesh for a path if it is missing.

The available-node list shows discovered inbox nodes, hop count when known, and whether a bundled Ratspeak node is still only a bootstrap candidate. A static node from Ratspeak's bundled list is not selected just because it exists in the app; it must have a current announce, path, or successful inbox interaction.

You don't need Offline Inbox to message a peer who's online right now; their device receives directly. Offline Inbox only matters for store-and-forward — leaving a message for someone whose radio is off, or picking up messages that arrived while yours was off.

The **Hosted Offline Inbox** option is separate. Turning it on makes this device serve as a propagation node for other people's offline messages. Turning it off stops accepting new hosted inbox requests immediately; messages already stored by the node remain in local storage for later use if hosting is enabled again. Use it deliberately: desktop and always-on devices are better hosts than phones, because mobile operating systems may stop background service.

If you run your own LXMF propagation node on a server or always-on device, set its published hash manually or let Auto discover it. Ratspeak will use it for store-and-forward delivery when it is reachable.

## Live stats

The interface and transport stats in the Network view refresh every 2.5 seconds while the view is open. Throughput numbers update in real time as packets move; the Peers list shows path ages tick up second by second. On mobile, backgrounding the app slows these refreshes to save battery; foregrounding wakes them back up.

## Announcing yourself

An **announce** broadcasts your identity to the mesh so other nodes can build a path back to you. You announce manually any time, and you can also have Ratspeak announce on a schedule.

In **Settings → Network → Auto-Announce**, choose how often: **Off**, **15 minutes**, **30 minutes**, **1 hour**, or a **custom** interval between 1 and 48 hours. A fresh install defaults to **30 minutes**, which is a sensible balance between reachability and airtime; turn it off if you'd rather only announce manually. Manual announces are always available regardless of the setting, from the announce button in the Network view or by long-pressing the bottom bar.

More frequent announces make you easier to find but spend more airtime; on a busy LoRa channel that matters. If you're on a fixed install with internet uplink, an hour or longer is usually plenty. If you're moving between mesh segments, shorter intervals help the network re-discover you.
