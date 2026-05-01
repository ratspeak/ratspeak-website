# Your First Session

Ratspeak is installed. This walkthrough takes you from a fresh launch to a delivered message in about ten minutes. Follow along in order — each step assumes the one before it.

If you haven't installed yet, see [Install & Platform Setup](../getting-started/install-and-platform-setup).

## Launch the app

Open Ratspeak the same way you open any other app — Applications on macOS, the Start Menu on Windows, the application menu on Linux, the home screen on mobile. There's no terminal command, no daemon to start, no browser tab to open. Ratspeak is a single application; once it's running, it's ready.

The first launch lands you on the **Setup** screen. You'll see the Ratspeak logo, the tagline, and a single button: **Create Identity**.

## Create your identity

Tap **Create Identity**. Ratspeak generates a fresh cryptographic identity on the spot — an Ed25519 signing key and an X25519 encryption key, kept on disk forever. This identity is yours. It's how the network recognises you, and how messages get encrypted to you and signed by you.

The generation animation runs for a couple of seconds, then Setup advances to the second card. You'll see your **LXMF address** — a long hexadecimal hash — and a copy button next to it. That hash is your address on the network. Save it somewhere; this is what you give to people who want to message you.

Below the hash is a single field: **Display Name**. Pick anything — your real name, a handle, the name of your cat. It's optional and shows up next to your address when peers discover you. Display names aren't unique; the hash is what's load-bearing.

Tap **Connect**. Ratspeak finishes setup and drops you onto the dashboard.

> Your identity file holds your private keys. Back it up. If you lose it, the address is gone forever; if someone else gets it, they can impersonate you. For hardware-backed keys, see [Ratkey](../products/ratkey).

## Add your first interface

A fresh node has an identity but no way to reach the network yet. You need at least one **interface** — a connection to other Reticulum nodes. Open the **Network** tab from the sidebar.

You have three easy starting points. Pick whichever matches your situation; you can add more later.

**AutoInterface (zero config).** If anyone else on your local WiFi or LAN is running Reticulum, AutoInterface finds them automatically. It uses UDP ports 29716 and 42671 to discover peers on the same network segment. No setup required — it's already running. If your network allows multicast, you're done.

**TCP Client to the public hub.** The fastest way to reach the wider Reticulum network is over the internet. From the Network tab, add a TCP Client interface pointing at:

```
rns.ratspeak.org:4242
```

This is the public Ratspeak hub. It connects you to the broader Reticulum network so you can hear announces from anyone reachable over the internet.

**LoRa device.** If you have an [RNode](../products/rsreticulum), [Ratdeck](../products/ratdeck), or [Ratcom](../products/ratcom), plug it into a USB port and tap **Add LoRa Device** in the Network tab. The modal lists detected serial ports and a **Preset** dropdown. Pick the preset that matches the firmware on your device — `medium_fast` is a sensible all-rounder; `long_fast` and `long_moderate` reach further at the cost of speed; `short_turbo` and `short_fast` are higher-throughput at shorter range. Tap **Add Radio**. Ratspeak opens the radio and starts listening.

You can run all three at once. Traffic routes transparently across whatever interfaces are up — a message can travel over LoRa to a transport node, hop over TCP, and land on someone's WiFi.

## See your first announce

Switch to the **Peers** tab.

When a Reticulum node comes online, it broadcasts an **announce** — a signed packet declaring its destination hash and display name. Other nodes hear it, verify the signature, and remember the path back. Within a minute or two of bringing up an interface, announces start arriving from the network and the Peers list begins to fill in.

Each row shows the peer's display name (or just their hash if they didn't set one), the destination hash itself, and the **hop count** — how many relays the announce travelled through to reach you. Lower hop counts mean closer peers.

If nothing shows up after a couple of minutes, check the Network tab — your interface should be marked as connected. Public WiFi, hotel networks, and corporate firewalls often block multicast, which breaks AutoInterface; the TCP Client to `rns.ratspeak.org:4242` works through almost any firewall.

## Send your first message

Tap any peer in the Peers list. Their detail panel opens. Tap **Message** to start a conversation — Ratspeak switches to the **Messages** tab with the thread already open.

Type your message in the composer at the bottom and hit send. The message is encrypted to the peer's public key, signed with yours, and handed off to the transport layer. From your side, that's the whole interaction.

Watch the small status indicator next to your message. It moves through a few states — sending, sent, delivered — as the network confirms each step. If the recipient is offline and there's no propagation node available, the message will sit in **sent** until they come back. For the full delivery state reference, see [Messaging & Contacts](../using-ratspeak/messaging-and-contacts).

## Save them as a contact

If you plan to talk to this peer again, save them. From the conversation, open the thread menu and tap **Save as Contact**. You can also do this from the peer detail panel before you've messaged them.

Saved contacts get a friendly name you control, a stable place in the **Contacts** tab, and they bubble to the top when you start a new conversation. Peers come and go from the Peers tab as announces age out — Contacts stick around forever.

## What's next

You have an identity, an interface, a peer, and a delivered message. From here:

- [Messaging & Contacts](../using-ratspeak/messaging-and-contacts) — attachments, delivery states, propagation, and managing the address book.
- [Network & Peers](../using-ratspeak/network-and-peers) — adding more interfaces, running as a transport node, and reading the network graph.
- [Settings & Identity](../using-ratspeak/settings-and-identity) — auto-announce intervals, display name changes, propagation node selection.
- [Ratdeck](../products/ratdeck) and [Ratcom](../products/ratcom) — purpose-built Ratspeak hardware for off-grid mesh.
- [Ratkey](../products/ratkey) — hardware-backed identity on a YubiKey or Nitrokey.

Welcome to the mesh.
