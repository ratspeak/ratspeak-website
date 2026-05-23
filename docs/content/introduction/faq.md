# Frequently Asked Questions

## What is Ratspeak?

Ratspeak is a desktop and mobile messaging app for the Reticulum mesh network. It sends end-to-end encrypted messages over LoRa radio, the internet, local WiFi, or any combination of those — and it does it without phone numbers, accounts, or central servers. Think of it as a chat client that treats radio links and TCP links the same way.

## Do I need internet to use it?

No. Ratspeak runs over any Reticulum interface, including LoRa radio, which needs no internet at all. Two people with RNode-class hardware can talk across town with nothing in between. The internet is just one transport option; Ratspeak does not depend on it.

## What hardware do I need?

For internet-only use: nothing special. Install Ratspeak, point it at a public Ratspeak TCP server such as Emerald (`2.ratspeak.org:4242`), and you are on the network. Ruby (`1.ratspeak.org:4141`) and Diamond (`3.ratspeak.org:4343`) are public options too; the legacy `rns.ratspeak.org:4242` endpoint is an alias for Emerald. In the app, "Official" means the server is managed by Ratspeak; "Unofficial" means it is operated by a third party. For off-grid radio use you need an RNode — a small LoRa device that handles the radio side over USB, BLE, or an RNode TCP bridge. There are commercial RNodes, DIY builds, and several Reticulum-aware handhelds. Any of them work.

## What is Reticulum, and what is LXMF?

Reticulum is the underlying networking stack — it handles routing, encryption, and link establishment across whatever interfaces you have. LXMF (Lightweight Extensible Message Format) is the messaging format that rides on top of it. Ratspeak speaks LXMF, which means it can talk to any other LXMF client: Sideband, NomadNet, MeshChat, and others. They all interoperate.

## How is it encrypted? Who can read my messages?

Every private message is end-to-end encrypted to the recipient's public key using X25519 key exchange and AES-256. Transport nodes between you and your contact forward packets without being able to decrypt them. Reticulum packets do not carry a source address, so relays get much less routing metadata than they would on IP networks. They can still observe interface activity, timing, packet size, and where they forwarded a packet next. The only people who can read the message contents are the sender and the intended recipient.

## Is Ratspeak anonymous?

Pseudonymous, more accurately. Your identity is a cryptographic hash, not your real name, and Reticulum minimizes routing metadata by omitting source addresses. That is not the same thing as total anonymity. Your display name is visible to your contacts, TCP peers can see the IP address you connect from, timing can still be correlated, and LoRa transmissions can be direction-found with the right equipment. If IP-level anonymity matters to you, run your TCP interfaces over I2P or another anonymity layer and read the threat model carefully.

## What is my identity, exactly?

A Ratspeak identity is 64 bytes: a 32-byte X25519 private key for encryption and a 32-byte Ed25519 signing seed. It is stored locally under Ratspeak's per-OS data directory; see [Install & Platform Setup](../getting-started/install-and-platform-setup) for the exact path. There is no account, no email, no phone number tied to it. The identity file is the entire thing — back it up, and you can restore yourself anywhere.

## How do I move my identity to a new device?

Copy the identity folder from `.ratspeak/identities/<hash>/` in Ratspeak's data directory on the old device to the same place on the new one. Launch Ratspeak and it will pick it up. Treat that file like a private key, because it is one — anyone who has it can impersonate you.

## What is the maximum attachment size?

The protocol ceiling is much larger than most mesh links should use: Ratspeak reads the current limit from the backend and rejects files only when they exceed that protocol resource limit. In practice, keep attachments small. The app warns once a file is above the efficient single-resource size, and Offline Inbox nodes can advertise smaller transfer limits. A half-megabyte image is already noticeable on LoRa; text messages are tiny and arrive quickly on internet links.

## Where are my settings stored?

Inside the app's local SQLite database, not in a config file. You change them through the Settings view in the app — network connections, auto-announce interval, theme, notification preferences, and so on. There is no `.conf` file to hand-edit.

## What is auto-announce, and what is the default?

An announce is how Ratspeak tells the network "I exist and here is my public key." Auto-announce sends one periodically so contacts can find you and Offline Inbox nodes can learn where to send waiting mail. The default interval is 30 minutes. You can change it under Settings, or disable it entirely and announce manually when you need to.

## Can I run Ratspeak on a server or headless?

Not the Ratspeak app itself — it is a desktop and mobile client with a graphical interface. If you want a headless Reticulum presence, run `rnsd-rs` as a transport node and `lxmd-rs` as an Offline Inbox/propagation node from [rsReticulum](../products/rsreticulum) and [rsLXMF](../products/rslxmf). They work fine on a Raspberry Pi or a VPS and will route traffic or hold offline mail for Ratspeak users on your network.

## Can I run my own Offline Inbox node?

Yes. Offline Inbox is Ratspeak's name for an LXMF propagation node, and propagation nodes are part of the LXMF spec, not specific to any one client. Run `lxmd-rs` with propagation enabled on an always-on machine, publish its 32-character destination hash, and Ratspeak users can use it in Auto or Manual mode. It is useful for groups where members are not always online at the same time.

## What happens if the recipient is offline when I send a message?

Three possibilities. If you send opportunistically and they never come online, the message expires unsent. If you use Direct, Ratspeak needs a live path and delivery proof from the recipient. If Offline Inbox is enabled and a suitable inbox node is reachable, Ratspeak can store the encrypted message there for later pickup. If no inbox node is reachable yet, the app tells you it is looking and requests paths instead of pretending the message was stored.

## Why are the public Ratspeak servers TCP addresses?

Convenience. Ruby (`1.ratspeak.org:4141`), Emerald (`2.ratspeak.org:4242`), and Diamond (`3.ratspeak.org:4343`) are easy-to-find Reticulum transport nodes that anyone with internet access can reach. They are not servers you have accounts on, and they cannot read your traffic. In the app, "Official" means the server is managed by Ratspeak; "Unofficial" means it is operated by a third party. You can join Reticulum through any other transport node, your own included. The public Ratspeak servers are just defaults that work out of the box; `rns.ratspeak.org:4242` remains as an alias for Emerald for older configs.

## Why does my first launch warn about an unidentified developer?

On macOS especially, you may see a Gatekeeper warning the first time you open Ratspeak. The app is not yet code-signed with an Apple Developer ID. Right-click the app and choose "Open" to bypass the warning once, or allow it under System Settings > Privacy & Security. On Windows, SmartScreen may show a similar prompt — click "More info" and "Run anyway." Signed builds are on the roadmap.

## How do I get the mobile app?

Mobile builds are not yet on public App Store or Play Store listings. Android is available as a sideload APK from [ratspeak.org/download.html](https://ratspeak.org/download.html) or the GitHub release. iOS still goes through TestFlight or developer provisioning. Public store releases will follow once signing, review, and release packaging are ready.

## Can I make voice calls with Ratspeak?

Yes, in an experimental capacity. Public builds include a peer-to-peer voice surface built on [rsLXST](../products/rslxst), the Rust LXST telephony stack. Calls run as a direct Reticulum link between the two devices — no servers, no media gateway, no offline fallback. Audio uses Opus and starts at the Medium Quality profile.

The call button lives in the conversation header on Messages and only appears when the other side is a saved contact and no other call is in progress. Inbound calls are gated to contacts or callers reachable on a direct zero-hop path; everyone else gets a polite "only accepting calls from contacts" notice and never rings the device. Persistently rejected non-contact callers are automatically blackholed after ten attempts.

Treat the surface as a beta — codec quality, ringtones, platform audio routing, and feature scope are all subject to change while rsLXST stabilizes. See [Messaging & Contacts](../using-ratspeak/messaging-and-contacts) for the full usage walkthrough.

## What games are there?

Ratspeak ships with two: Chess and Tic-Tac-Toe. Both run over LRGP, a tiny game protocol that piggybacks on LXMF messages. Moves are roughly the size of a normal text message, so a chess game is perfectly playable even over LoRa with minutes between turns. More games will come; the protocol is built to be extended.

## Can I play games with people on Sideband or NomadNet?

Not interactively. LRGP-aware moves only render correctly inside Ratspeak. Other LXMF clients see a readable text fallback like "[LRGP TTT] X plays center" but cannot make moves themselves. Plain text chat between Ratspeak and any other LXMF client works perfectly.

## Is my YubiKey or Nitrokey supported?

Hardware-key support is being built in a library called Ratkey, but it is not yet wired into the Ratspeak app and the real-token backend is still experimental. The goal is to keep private identity operations on a PIV-capable hardware token instead of on disk. For now, identities live in the file system — protect them accordingly.

## Is Ratspeak free and open source?

Yes. Ratspeak, rsReticulum, rsLXMF, rsLXST, Ratdeck, rsCardputer, Ratkey, and the website code are AGPL-3.0-or-later open source. LRGP and LXMFace are standalone MIT-licensed libraries. There are no paid tiers, no telemetry, and no plan to introduce either. The radio hardware itself (RNodes and similar) is also open source — you can build one from parts if you want.

If you want to contribute, patches and bug reports through the project's repositories are the most useful place to start.

## Where can I get help?

Start with the rest of this documentation — the Getting Started and Using Ratspeak sections cover the common questions. For live help, the Reticulum and LXMF communities are active on Matrix and have a good track record of helping new users. Bug reports and feature requests for Ratspeak itself belong on the project's issue tracker.
