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
- propagation node selection
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

- **Per-interface enable/disable** — toggle TCP, Wi-Fi/Auto, LoRa radio (BLE or USB-OTG), or BLE peer mesh without removing them. Useful for going dark on a specific link.
- **IFAC pre-shared key** — an optional shared secret that scopes an interface to a private group. Devices without the key see your packets as noise and drop them.
- **Announce caps** — limits on how many announces an interface will accept and forward, to keep a chatty network from drowning out a slow one.

Changes apply on the next packet — there's no need to restart.

## BLE mesh toggle

The BLE peer mesh is a phone-to-phone (and laptop) Bluetooth GATT mesh that runs alongside your other interfaces. Any nearby Ratspeak user shows up as a peer and can exchange announces, messages, files, and games with you over Bluetooth — no router, no LoRa, no internet.

Toggle it in **Settings → Network → BLE Mesh**. The mesh is unbonded by design: Reticulum already encrypts everything end-to-end, so there's no pairing dialog to dismiss. Range is whatever your radios can manage, typically 10-30 meters indoors.

On Windows, outbound BLE peer connections work but advertising as a peer requires a packaged build; the desktop falls back to discovery-only and surfaces a notice.

## Theme

**Settings → Appearance → Theme** offers **Light**, **Dark**, and **OS preference** (follows your system setting and switches automatically). The theme applies instantly to every view.

## Hardware keys (roadmap)

Hardware-token support — keeping your identity key on a YubiKey or Nitrokey via the Ratkey project — is on the roadmap but not yet wired into Ratspeak. Today, identities live as files on disk. When hardware support lands, this page will document how to enroll a token and migrate an existing identity onto it.

## Backing up and migrating

Your entire Ratspeak state lives in the `.ratspeak/` directory under your OS data folder: identities, message history, contacts, settings, and the SQLite database. To back up or move to a new machine, copy that directory.

A clean migration: quit Ratspeak on the old machine, copy the whole `.ratspeak/` directory to the same path on the new machine, then launch Ratspeak. It picks up where you left off. Keep the backup somewhere encrypted — the identity files inside it are sufficient to impersonate you on the network.

If you only want to migrate a single identity, copy just that identity's folder under `.ratspeak/identities/`. You'll lose history and contacts but keep the cryptographic identity intact.
