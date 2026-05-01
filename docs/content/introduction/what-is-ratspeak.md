# What is Ratspeak?

Ratspeak is a small family of communication tools that run on [Reticulum](https://reticulum.network/) — an encrypted mesh networking stack that does not depend on the public internet. You can use it to message a friend across the room over Bluetooth, across town over a LoRa radio link, or across the world over a TCP tunnel — without an account, without a phone number, and without a server in the middle.

The umbrella name is **Ratspeak**. It is also the name of the flagship app. Everything else in the family — the handheld hardware, the gaming protocol, the identicon library — speaks the same wire format and interoperates by default.

## What's in the box

The Ratspeak ecosystem is a few separate things that all speak the same protocol.

- **[Ratspeak](../../products/ratspeak)** — the desktop and mobile app. Messaging, identity management, network visualization, file transfer, and games. Available for macOS, Linux, Windows, iOS, and Android. Built with Tauri v2.
- **[Ratdeck](../../products/ratdeck)** — a handheld LoRa communicator built on the LilyGO T-Deck Plus. Touchscreen, QWERTY keyboard, runs standalone on a battery.
- **[Ratcom](../../products/ratcom)** — a pocket-sized LoRa communicator built on the M5Stack Cardputer Adv. Smaller, simpler, same protocol.
- **[LXMFace](../../products/lxmface)** — a deterministic identicon library that turns any Reticulum identity hash into a recognizable visual avatar. Used by the app and available standalone.
- **[LRGP](../../products/lrgp)** — the Local Reticulum Gaming Protocol. Powers the Chess and Tic-Tac-Toe games shipped in the Ratspeak app, and is open for other developers to build two-player games on.
- **[Ratkey](../../products/ratkey)** — a hardware-identity library for keeping signing keys on a YubiKey or Nitrokey instead of on disk. It is a Rust library, not yet wired into the Ratspeak app.

Underneath all of this sits a Rust implementation of the [Reticulum](../../products/rsreticulum) and [LXMF](../../products/rslxmf) protocols. It is wire-compatible with the upstream Python reference, so a Ratspeak user can talk to anyone running Sideband, NomadNet, or any other Reticulum client.

## Built on Reticulum

[Reticulum](https://reticulum.network/) is the network. It is encrypted by default, has no central servers, no exit nodes, no DNS, and no IP addresses you need to care about. Identities are cryptographic keypairs you control. Packets can travel up to 128 hops, and the same packet format runs over LoRa radios, packet radio (AX.25), TCP, UDP, Bluetooth LE, I2P, and more — mix and match per link. [LXMF](../../understanding/links-and-lxmf) is the message format that rides on top: it handles direct delivery, store-and-forward through propagation nodes, attachments, and ticket-based anti-spam.

You do not need to understand any of that to send a message. But it is why Ratspeak works the way it does — and why your conversations keep working when the internet, your ISP, or a particular service does not.

## Who it's for

- **People who want private messaging** without trusting a company, providing a phone number, or being reachable through a username someone else issues.
- **Off-grid and field operators** who need a way to talk when there is no cell tower and no Wi-Fi — over LoRa, over a wire, over whatever's at hand.
- **Community network builders** standing up a neighborhood- or city-scale mesh and looking for a usable client to put in front of it.
- **Tinkerers, ham operators, and developers** who want to build on a real protocol stack with a clean Rust implementation and a friendly UI.
- **Travelers and journalists** who cross borders and networks where having a phone number tied to your messages is not the threat model you want.

If you are new, the [Choosing Your Setup](../../getting-started/choosing-your-setup) guide will help you pick a starting point. If you have hardware already, jump straight to [Install and Platform Setup](../../getting-started/install-and-platform-setup).

## What it is not

- **Not the regular internet.** Ratspeak does not use the web, does not need DNS, and does not work like an ISP-routed app. It runs over its own network. That network can use the internet as a transport — but does not require it.
- **Not a Discord or WhatsApp replacement.** There are no servers, no rooms you join with a link, no presence indicators driven by a backend. Conversations are between identities, end-to-end. Group chat works, but the model is different.
- **Not surveillance-friendly.** End-to-end encryption is on by default and is not optional. There is no "company" sitting between two participants — because there is no company in the path at all.
- **Not anonymous by default.** Encryption hides the contents of your messages. It does not, on its own, hide that you are on the network or who you are talking to. If anonymity is your threat model, see the [FAQ](../introduction/faq) entry on anonymity and read [Cryptography & Protection](../../understanding/cryptography-and-protection) before relying on Ratspeak for it.
- **Not finished.** This is an active project with a public roadmap. Things land. Things change. The [FAQ](../introduction/faq) is the most honest read on current state versus future plans.

## Where to next

- New to mesh networking — start with the [Key Concepts & Glossary](../../understanding/key-concepts-and-glossary), or read [Reticulum's own intro](https://reticulum.network/) for the broader stack.
- Ready to install — head to [Install and Platform Setup](../../getting-started/install-and-platform-setup) and then [Your First Session](../../getting-started/your-first-session).
- Curious about the protocol — start with [Protocol Architecture](../../understanding/protocol-architecture) and [Cryptography & Protection](../../understanding/cryptography-and-protection).
- Stuck or skeptical — the [FAQ](../introduction/faq) is where the honest answers live.
