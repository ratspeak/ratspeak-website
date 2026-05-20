# Your First Session

Ratspeak is installed. This walkthrough takes you from a fresh launch to your first reachable peer and test message. Follow along in order — each step assumes the one before it.

If you haven't installed yet, see [Install & Platform Setup](../getting-started/install-and-platform-setup).

To finish the message step, you need at least one reachable Reticulum/LXMF peer: another Ratspeak device nearby, a friend whose node is announcing, a known LXMF address, or a TCP hub/local network where other peers can be heard. If the Peers list stays empty, the setup still worked; add another interface, try a second local device, or use the [Network & Peers](../using-ratspeak/network-and-peers) troubleshooting path before expecting delivery.

## Launch the app

Open Ratspeak the same way you open any other app — Applications on macOS, the Start Menu on Windows, the application menu on Linux, the home screen on mobile. There's no terminal command, no daemon to start, no browser tab to open. Ratspeak is a single application; once it's running, it's ready.

The first launch lands you on the **Setup** screen. You'll see the Ratspeak logo, the tagline, and a single button: **Create Identity**.

## Create your identity

Tap **Create Identity**. Ratspeak generates a fresh cryptographic identity on the spot — an Ed25519 signing key and an X25519 encryption key, stored in the app data directory until you replace or delete it. This identity is yours. It's how the network recognises you, and how messages get encrypted to you and signed by you.

The generation animation runs for a couple of seconds, then Setup advances to the second card. You'll see your **LXMF address** — a long hexadecimal hash — and a copy button next to it. That hash is your address on the network. Save it somewhere; this is what you give to people who want to message you.

Below the hash is a single field: **Display Name**. Pick anything — your real name, a handle, or a callsign. It's optional and shows up next to your address when peers discover you. Display names aren't unique; the hash is what's load-bearing.

Tap **Connect**. Ratspeak finishes setup and drops you onto the dashboard.

> Your identity file holds your private keys. Back it up. If you lose it, the address is gone forever; if someone else gets it, they can impersonate you. For hardware-backed keys, see [Ratkey](../products/ratkey).

## Add your first interface

A fresh node has an identity but no way to reach the network yet. You need at least one **interface** — a connection to other Reticulum nodes. Open the **Network** tab.

You have three easy starting points. Pick whichever matches your situation; you can add more later.

**AutoInterface (zero config).** If anyone else on your local WiFi or LAN is running Reticulum, AutoInterface finds them automatically. It uses UDP ports 29716 and 42671 to discover peers on the same network segment. No setup required — it's already running. If your network allows multicast, you're done.

**TCP Client to a public Ratspeak server.** The fastest way to reach the wider Reticulum network is over the internet. From the Network tab, add a TCP Client interface pointing at one of the public Ratspeak TCP servers:

| Name | Endpoint |
|---|---|
| Ruby | `1.ratspeak.org:4141` |
| Emerald | `2.ratspeak.org:4242` |
| Diamond | `3.ratspeak.org:4343` |

These are public Ratspeak transport servers. They connect you to the broader Reticulum network so you can hear announces from anyone reachable over the internet. Older configs that use `rns.ratspeak.org:4242` still reach Emerald.

**LoRa device.** If you have an [RNode](../hardware/rnode-and-supported-boards), plug it into USB, pair it over BLE, or point Ratspeak at an RNode TCP bridge, then tap **Add LoRa Device** in the Network tab. The modal lists detected serial ports, nearby BLE radios, and a TCP tab for endpoints such as `192.168.1.50:7633`. If no TCP port is supplied, Ratspeak uses `7633`. Pick the preset that matches the devices around you — `medium_fast` is a sensible all-rounder; `long_fast` and `long_moderate` reach further at the cost of speed; `short_turbo` and `short_fast` are higher-throughput at shorter range. Tap **Add Radio**. Ratspeak opens the radio and starts listening. Ratdeck and Ratcom are standalone handhelds; use their own screens unless you have explicitly enabled a bridge mode such as Ratdeck's BLE bridge.

You can run all three at once. Traffic routes transparently across whatever interfaces are up — a message can travel over LoRa to a transport node, hop over TCP, and land on someone's WiFi.

## See your first announce

Switch to the **Peers** tab.

When a Reticulum node comes online, it broadcasts an **announce** — a signed packet declaring its destination hash and display name. Other nodes hear it, verify the signature, and remember the path back. Within a minute or two of bringing up an interface, announces start arriving from the network and the Peers list begins to fill in.

Each row shows the peer's display name (or just their hash if they didn't set one), the destination hash itself, and the **hop count** — how many relays the announce travelled through to reach you. Lower hop counts mean closer peers.

If nothing shows up after a couple of minutes, check the Network tab — your interface should be marked as connected. Public WiFi, hotel networks, and corporate firewalls often block multicast, which breaks AutoInterface; a TCP Client to Ruby, Emerald, or Diamond works through most firewalls.

## Send your first message

Tap any peer in the Peers list. Their detail panel opens. Tap **Message** to start a conversation — Ratspeak switches to the **Messages** tab with the thread already open.

Type your message in the composer at the bottom and hit send. The message is encrypted to the peer's public key, signed with yours, and handed off to the transport layer. From your side, that's the whole interaction.

Watch the small status indicator next to your message. It moves through a few states — sending, sent, delivered, or stored in Offline Inbox — as the network confirms each step. If the recipient is offline and no inbox node is reachable, Ratspeak will tell you it is looking instead of pretending the message was stored. For the full delivery state reference, see [Messaging & Contacts](../using-ratspeak/messaging-and-contacts).

## Save them as a contact

If you plan to talk to this peer again, save them. From the conversation, open the thread menu and tap **Save as Contact**. You can also do this from the peer detail panel before you've messaged them.

Saved contacts get a friendly name you control, a stable place in the **Contacts** tab, and they bubble to the top when you start a new conversation. Peers come and go from the Peers tab as announces age out — Contacts stick around forever.

## What's next

You have an identity, an interface, and a path toward reachable peers. Once a peer is visible, you can send and verify the first message. From here:

- [Messaging & Contacts](../using-ratspeak/messaging-and-contacts) — attachments, delivery states, Offline Inbox, and managing the address book.
- [Network & Peers](../using-ratspeak/network-and-peers) — adding more interfaces, running as a transport node, and reading peer/network status.
- [Settings & Identity](../using-ratspeak/settings-and-identity) — auto-announce intervals, display name changes, and Offline Inbox mode.
- [Ratdeck](../products/ratdeck) and [Ratcom](../products/ratcom) — purpose-built Ratspeak hardware for off-grid mesh.
- [Ratkey](../products/ratkey) — hardware-backed identity on a YubiKey or Nitrokey.

Welcome to the mesh.
