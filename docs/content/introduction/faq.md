# Frequently Asked Questions

## What is Ratspeak?

Ratspeak is a desktop and mobile messaging app for the Reticulum mesh network. It sends end-to-end encrypted messages over LoRa radio, the internet, local WiFi, or any combination of those — and it does it without phone numbers, accounts, or central servers. Think of it as a chat client that treats radio links and TCP links the same way.

## Do I need internet to use it?

No. Ratspeak runs over any Reticulum interface, including LoRa radio, which needs no internet at all. Two people with RNode-class hardware can talk across town with nothing in between. The internet is just one transport option; Ratspeak does not depend on it.

## What hardware do I need?

For internet-only use: nothing special. Install Ratspeak, point it at a public hub like `rns.ratspeak.org:4242`, and you are on the network. For off-grid radio use you need an RNode — a small LoRa device that handles the radio side. There are commercial RNodes, DIY builds, and several Reticulum-aware handhelds. Any of them work.

## What is Reticulum, and what is LXMF?

Reticulum is the underlying networking stack — it handles routing, encryption, and link establishment across whatever interfaces you have. LXMF (Lightweight Extensible Message Format) is the messaging format that rides on top of it. Ratspeak speaks LXMF, which means it can talk to any other LXMF client: Sideband, NomadNet, MeshChat, and others. They all interoperate.

## How is it encrypted? Who can read my messages?

Every message is end-to-end encrypted to the recipient's public key using X25519 key exchange and AES-256. Transport nodes between you and your contact forward packets without being able to decrypt them. Reticulum packets do not even carry a source address, so a relay cannot see who sent what — only where it is heading. The only people who can read a message are the sender and the intended recipient.

## Is Ratspeak anonymous?

Pseudonymous, more accurately. Your identity is a cryptographic hash, not your real name, and Reticulum's design hides who you are talking to from the network. But your display name is visible to your contacts, and any TCP peer you connect to sees your IP address. If IP-level anonymity matters to you, run your TCP interfaces over Tor or I2P. On LoRa, your radio signal can be direction-found with the right equipment, so anonymity from a determined adversary is not absolute.

## What is my identity, exactly?

A Ratspeak identity is 64 bytes: a 32-byte X25519 key for encryption and a 32-byte Ed25519 key for signatures. It is stored locally at `~/.ratspeak/identities/<hash>/identity`. There is no account, no email, no phone number tied to it. The identity file is the entire thing — back it up, and you can restore yourself anywhere.

## How do I move my identity to a new device?

Copy the identity file from `~/.ratspeak/identities/<hash>/` on the old device to the same path on the new one. Launch Ratspeak and it will pick it up. Treat that file like a private key, because it is one — anyone who has it can impersonate you.

## What is the maximum attachment size?

500 KB per attachment. That is intentional: Ratspeak is designed to work over LoRa radio, where bandwidth is measured in single-digit kilobits per second. A half-megabyte image already takes a noticeable amount of time to transmit on a slow link. Text messages themselves are much smaller and arrive almost instantly on internet links.

## Where are my settings stored?

Inside the app's local SQLite database, not in a config file. You change them through the Settings view in the app — network connections, auto-announce interval, theme, notification preferences, and so on. There is no `.conf` file to hand-edit.

## What is auto-announce, and what is the default?

An announce is how Ratspeak tells the network "I exist and here is my public key." Auto-announce sends one periodically so contacts can find you and propagation nodes know to hold mail for you. The default interval is 30 minutes. You can change it under Settings, or disable it entirely and announce manually when you need to.

## Can I run Ratspeak on a server or headless?

Not the Ratspeak app itself — it is a desktop and mobile client with a graphical interface. If you want a headless Reticulum presence (a transport node, a propagation node, or both), run `rnsd` and `lxmd` from the Reticulum and LXMF reference toolkits. They work fine on a Raspberry Pi or a VPS and will route traffic for Ratspeak users on your network.

## Can I run my own propagation node?

Yes. Propagation nodes are part of the LXMF spec, not specific to any one client. Run `lxmd` with propagation enabled on an always-on machine, and Ratspeak users (and any other LXMF clients) can request mail through it. Useful for groups where members are not always online at the same time.

## What happens if the recipient is offline when I send a message?

Three possibilities. If you send opportunistically and they never come online, the message expires unsent. If you have a path to them through a propagation node, the node holds the message and delivers it the next time they connect — store-and-forward, in classic mesh fashion. And Ratspeak retries delivery automatically when it sees a fresh announce from the contact, so an offline send is not necessarily a lost send.

## Why is the public hub a TCP address?

Convenience. `rns.ratspeak.org:4242` is just one easy-to-find Reticulum transport node that anyone with internet access can reach. It is not a server you have an account on, and it cannot read your traffic. You can join Reticulum through any other transport node, your own included — the public hub is just a default that works out of the box.

## Why does my first launch warn about an unidentified developer?

On macOS especially, you may see a Gatekeeper warning the first time you open Ratspeak. The app is not yet code-signed with an Apple Developer ID. Right-click the app and choose "Open" to bypass the warning once, or allow it under System Settings > Privacy & Security. On Windows, SmartScreen may show a similar prompt — click "More info" and "Run anyway." Signed builds are on the roadmap.

## How do I get the mobile app?

Mobile builds are not yet on the App Store or the main Play Store listing. iOS goes through TestFlight; Android is available as a sideload APK or Play Store internal testing track. Check the website for current invite links. Public store releases will follow once the apps stabilize.

## What games are there?

Ratspeak ships with two: Chess and Tic-Tac-Toe. Both run over LRGP, a tiny game protocol that piggybacks on LXMF messages. Moves are roughly the size of a normal text message, so a chess game is perfectly playable even over LoRa with minutes between turns. More games will come; the protocol is built to be extended.

## Can I play games with people on Sideband or NomadNet?

Not interactively. LRGP-aware moves only render correctly inside Ratspeak. Other LXMF clients see a readable text fallback like "[LRGP TTT] X plays center" but cannot make moves themselves. Plain text chat between Ratspeak and any other LXMF client works perfectly.

## Is my YubiKey or Nitrokey supported?

Hardware-key support is being built (the underlying library is called Ratkey) but is not yet wired into the Ratspeak app. When it lands, you will be able to keep your private keys on a PIV-capable hardware token instead of on disk. For now, identities live in the file system — protect them accordingly.

## Is Ratspeak free and open source?

Yes. Ratspeak and its supporting libraries are open source, as is the Reticulum stack underneath it. There are no paid tiers, no telemetry, and no plan to introduce either. The radio hardware itself (RNodes and similar) is also open source — you can build one from parts if you want.

If you want to contribute, patches and bug reports through the project's repositories are the most useful place to start.

## Where can I get help?

Start with the rest of this documentation — the Getting Started and Using Ratspeak sections cover the common questions. For live help, the Reticulum and LXMF communities are active on Matrix and have a good track record of helping new users. Bug reports and feature requests for Ratspeak itself belong on the project's issue tracker.
