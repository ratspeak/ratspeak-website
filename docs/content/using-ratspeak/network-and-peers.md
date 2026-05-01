# Network & Peers

Ratspeak gives you two views into the mesh: **Peers**, which lists the people and nodes you can reach, and **Network**, which shows the radios, links, and propagation nodes carrying your traffic. Together they answer the two questions that matter most on a mesh: *who can I talk to right now?* and *how is this device actually connected?*

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

Below the interfaces, you'll find **Transport stats** — paths in your routing table, total bytes in and out, announces seen — and the **Propagation nodes** section listing the LXMF stores Ratspeak is syncing offline messages with.

Pressing the announce button in the Network view, or long-pressing the bottom bar on mobile, broadcasts your identity to the mesh right now. See *Announcing yourself* below.

## Adding an interface

Open Network and tap **Add Interface**. Ratspeak supports five interface types, each suited to a different transport:

- **TCPClientInterface** — connect to a public or private Reticulum hub over the internet. You provide a host and port, and Ratspeak keeps the link alive. Good for joining the wider Reticulum network when you have connectivity.
- **AutoInterface** — discovers peers on your local network (LAN, mesh Wi-Fi, hotspot) using IPv6 link-local multicast. No configuration needed; if another Reticulum node is on the same subnet, you'll find it.
- **RNode (USB / Serial)** — a LoRa radio plugged in over USB. On desktop, Ratspeak enumerates serial ports for you. On Android, USB-OTG cables let you drive an RNode directly from a phone.
- **RNode over BLE** — an RNode connected over Bluetooth Low Energy. The RNode must be in pairing mode the first time, after which Ratspeak remembers the bond and reconnects automatically.
- **BLE peer mesh** — phone-to-phone (and desktop-to-phone) Reticulum over Bluetooth, with no infrastructure needed. Anyone running Ratspeak in BLE range will appear; messages, announces, and file transfers flow over the link directly. Toggle it from Network → Bluetooth, or in Settings → Network → BLE Mesh.

Adding a radio interface while another is already serving the same physical RNode (USB while BLE is up, or vice versa) will tear down the older one automatically so the radio is never driven from two places at once.

## Propagation nodes

Propagation nodes are LXMF stores that hold your messages while you're offline and deliver them when you come back.

Ratspeak ships with sensible defaults — including the public hub at `rns.ratspeak.org:4242` — and you can add or remove nodes from the **Propagation nodes** section of the Network view. Each node row shows its address, sync status, and how many messages it currently holds for you. Tap the row to sync immediately, or remove the node if you no longer want to use it.

You don't need a propagation node to message a peer who's online right now; their device receives directly. Propagation only matters for store-and-forward — leaving a message for someone whose radio is off, or picking up messages that arrived while yours was off.

If you run your own LXMF propagation node on a server or always-on device, add it here and it will sync alongside the public defaults.

## Live stats

The interface and transport stats in the Network view refresh every 2.5 seconds while the view is open. Throughput numbers update in real time as packets move; the Peers list shows path ages tick up second by second. On mobile, backgrounding the app slows these refreshes to save battery; foregrounding wakes them back up.

## Announcing yourself

An **announce** broadcasts your identity to the mesh so other nodes can build a path back to you. You announce manually any time, and you can also have Ratspeak announce on a schedule.

In **Settings → Network → Auto-Announce**, choose how often: **Off**, **15 minutes**, **30 minutes**, **1 hour**, or a **custom** interval between 1 and 48 hours. A fresh install defaults to **30 minutes**, which is a sensible balance between reachability and airtime; turn it off if you'd rather only announce manually. Manual announces are always available regardless of the setting, from the announce button in the Network view or by long-pressing the bottom bar.

More frequent announces make you easier to find but spend more airtime; on a busy LoRa channel that matters. If you're on a fixed install with internet uplink, an hour or longer is usually plenty. If you're moving between mesh segments, shorter intervals help the network re-discover you.
