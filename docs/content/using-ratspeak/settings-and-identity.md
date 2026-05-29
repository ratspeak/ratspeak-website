# Settings & Identity

Settings is where you manage who you are on the network, when you announce yourself, which interfaces are allowed to carry your traffic, and how the app looks. Most options take effect immediately — no restart needed.

## Your identity

Your Reticulum identity is a 64-byte cryptographic key pair: a 32-byte X25519 private key for encryption and a 32-byte Ed25519 seed for signatures. Together they derive your destination hash — the address other people on the mesh use to reach you.

Ratspeak stores the identity as a binary file under your OS data directory:

```
<data>/.ratspeak/identities/<hash>/identity
```

This file IS your account on the network. Anyone with a copy can impersonate you, read your inbound messages, and sign announces in your name. Back it up; never share it.

When you create a new identity, Ratspeak derives it from a **24-word recovery phrase** (BIP-39) and shows you the phrase once. Write it down — it's the only way to restore the identity if you lose the device, and it's how you bring the same identity onto another device (including mobile). You can also seal the on-disk key behind a **passcode** (see below). See *Recovery phrase* and *Passcode protection* below.

## Multiple identities

You can keep several identities side by side and switch between them in **Settings → Identity**. Each identity has its own:

- destination hash and LXMF address
- contact list and conversation history
- Offline Inbox mode and any manually pinned propagation-node hash
- announce schedule

Common reasons to run more than one: a public identity for community channels and a private one for close contacts; separate identities for separate roles (operator, club call sign, personal); a throwaway identity for testing.

Switching identities re-keys outbound traffic. Inbound messages addressed to the previous identity still land in that inbox — you just won't see them until you switch back.

## Recovery phrase

New identities are derived from a 24-word BIP-39 recovery phrase, shown once at creation. Write it down and keep it offline — Ratspeak never stores it and cannot show it again.

To restore an identity on a new device (or after a reinstall), use **Settings → Identity → Import → Recovery Phrase**, or the **Import or Restore Identity** button on first setup, and enter the 24 words. This works on every platform, including mobile, and produces the exact same identity and address.

One caveat: a recovery phrase restores **your identity, not your message history**. Reticulum uses forward secrecy, so messages encrypted to old, rotated keys can't be recovered from the phrase. You get your address, your ability to sign and receive new messages, and your contacts can reach you again — but past conversation history lives only in the device backup (see *Backing up and migrating*).

Identities created before this feature (older installs) have random keys with no phrase; back those up by exporting the key or copying the identity file.

## Passcode protection

You can lock a software identity behind a **passcode**. Ratspeak encrypts the on-disk key with a key derived from your passcode (Argon2id + authenticated encryption), so a stolen or lost device can't use the identity without it. Set it in **Settings → Identity →** the identity's menu **→ Set Passcode**.

When a passcode is set, Ratspeak prompts for it once each time you open the app (and again after an auto-lock timeout, if enabled). It is **not** asked per message — unlock once per session. There is **no recovery if you forget the passcode**; your 24-word phrase remains the fallback to re-create the identity, so keep it.

Auto-lock timeout (how long a session stays unlocked) is configured in **Settings → Network → Hardware Key Auto-Lock**; it applies to both passcode-protected and hardware-key identities. "Off" relies on locking when you quit the app.

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

## Hardware keys (YubiKey)

On **desktop**, you can back an identity with a YubiKey 5 (or Nitrokey 3) instead of a file: the signing and encryption keys are generated on the token and never leave it, and the app unlocks the token with your PIN once per session. Set one up from the **Hardware Key** button on first setup, or **Settings → Identity → Hardware**. Choose *recoverable* (with a 24-word phrase backup) or *hardware-only*. Hardware identities are wire-identical to software ones — peers can't tell the difference. This support is still labeled experimental.

Hardware keys are **desktop-only** for now (the token transport relies on the desktop PC/SC stack). On **mobile**, use a software identity and bring it across with your recovery phrase — that's the practical mobile path until a tap-to-unlock NFC model lands. Re-provisioning a token overwrites its keys, so Ratspeak warns before it would destroy an identity already on the key.

## Backing up and migrating

There are two levels of backup. To carry just your **identity** (your address and the ability to send/receive again), your 24-word recovery phrase is enough — restore it on any device via Import. To carry your **full state** — message history, contacts, settings — you copy the data directory, because forward secrecy means history can't be reconstructed from the phrase alone.

Your entire Ratspeak state lives in the `.ratspeak/` directory under your OS data folder: identities, message history, contacts, settings, and the SQLite database. To back up or move to a new machine, copy that directory.

A clean migration: quit Ratspeak on the old machine, copy the whole `.ratspeak/` directory to the same path on the new machine, then launch Ratspeak. It picks up where you left off. Keep the backup somewhere encrypted — the identity files inside it are sufficient to impersonate you on the network.

If you only want to migrate a single identity, copy just that identity's folder under `.ratspeak/identities/`. You'll lose history and contacts but keep the cryptographic identity intact.
