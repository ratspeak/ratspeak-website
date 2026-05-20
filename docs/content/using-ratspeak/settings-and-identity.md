# Settings & Identity

Settings is where you manage who you are on the network, when you announce yourself, which interfaces are allowed to carry your traffic, and how the app looks. Most options take effect immediately — no restart needed.

## Your identity

Your Reticulum identity is a 64-byte cryptographic key pair: a 32-byte X25519 private key for encryption and a 32-byte Ed25519 seed for signatures. Together they derive your destination hash — the address other people on the mesh use to reach you.

Ratspeak stores the identity as a binary file under your OS data directory:

```
<data>/.ratspeak/identities/<hash>/identity
```

This file IS your account on the network. Anyone with a copy can impersonate you, read your inbound messages, and sign announces in your name. Back it up; never share it.

The first time Ratspeak runs it generates an identity for you. The file on disk is the whole story — there's no password to set, no seed phrase, no sign-up.

## Multiple identities

You can keep several identities side by side and switch between them in **Settings → Identity**. Each identity has its own:

- destination hash and LXMF address
- contact list and conversation history
- Offline Inbox mode and any manually pinned propagation-node hash
- announce schedule

Common reasons to run more than one: a public identity for community channels and a private one for close contacts; separate identities for separate roles (operator, club call sign, personal); a throwaway identity for testing.

Switching identities re-keys outbound traffic. Inbound messages addressed to the previous identity still land in that inbox — you just won't see them until you switch back.

## Auto-announce

An announce tells the network you exist and how to reach you. Reticulum needs to hear an announce from you (or learn a path from someone who has) before anyone can route to you.

Pick an interval in **Settings → Network → Auto-Announce**:

- **Off** — announce only when you tap the manual button
- **15 minutes**, **30 minutes** (default), **1 hour**
- **Custom** — any value from 1 to 48 hours

The default is 30 minutes. Shorter intervals make you reachable faster after a network change but use more bandwidth and battery; longer intervals are friendlier on constrained links like LoRa.

A manual announce is always available from the bottom bar (long-press) and from the Network view, regardless of the auto-announce setting. Use it after plugging in a new radio, switching networks, or when someone says they can't reach you.

## Network policy

**Settings → Network** controls which interfaces are allowed to carry your traffic and on what terms.

- **Transport Mode** — OFF by default. OFF keeps this device as a normal client, ON relays Reticulum traffic for other peers when the local runtime can do so, and AUTO enables only on suitable non-LoRa setups. AUTO requires an enabled non-LoRa interface such as Local Network, TCP, or Backbone; it stays disabled on cellular, no-network, mobile `unknown` network states, and whenever an enabled LoRa/RNode interface is configured.
- **Per-interface enable/disable** — toggle TCP, Wi-Fi/Auto, LoRa radio (USB, USB-OTG, BLE, or TCP), or Bluetooth Peer without removing them. Useful for going dark on a specific link.
- **IFAC pre-shared key** — an optional shared secret that scopes an interface to a private group. Devices without the key see your packets as noise and drop them.
- **Announce caps** — limits on how many announces an interface will accept and forward, to keep a chatty network from drowning out a slow one.

Changes apply on the next packet — there's no need to restart.

## Bluetooth Peer toggle

Bluetooth Peer is a phone-to-phone (and laptop) Bluetooth GATT transport that runs alongside your other interfaces. Any nearby Ratspeak user with Bluetooth Peer active shows up as a peer and can exchange announces, messages, files, and games with you over Bluetooth — no router, no LoRa, no internet.

Toggle it in **Settings → Network → Bluetooth Peer**. It is unbonded by design: Ratspeak's Reticulum traffic is already encrypted end-to-end, so there's no pairing dialog to dismiss. Range is whatever your radios can manage, typically 10-30 meters indoors.

On Windows, the Bluetooth Peer advertiser/peripheral role requires the MSIX build. The plain `.exe` / MSI builds do not provide that role. On Linux, advertising requires a working BlueZ GATT server and LE advertising setup; if BlueZ cannot advertise, Ratspeak will show the interface as central-only.

## Theme

**Settings → Appearance → Theme** offers **Light**, **Dark**, and **OS preference** (follows your system setting and switches automatically). The theme applies instantly to every view.

## Hardware keys (roadmap)

Hardware-token support via the Ratkey project is on the roadmap but not yet wired into Ratspeak. Today, identities live as files on disk. Ratkey's real-device backend is still experimental, so this page will document enrollment and migration only after the app integration and token validation are ready.

## Backing up and migrating

Your entire Ratspeak state lives in the `.ratspeak/` directory under your OS data folder: identities, message history, contacts, settings, and the SQLite database. To back up or move to a new machine, copy that directory.

A clean migration: quit Ratspeak on the old machine, copy the whole `.ratspeak/` directory to the same path on the new machine, then launch Ratspeak. It picks up where you left off. Keep the backup somewhere encrypted — the identity files inside it are sufficient to impersonate you on the network.

If you only want to migrate a single identity, copy just that identity's folder under `.ratspeak/identities/`. You'll lose history and contacts but keep the cryptographic identity intact.
