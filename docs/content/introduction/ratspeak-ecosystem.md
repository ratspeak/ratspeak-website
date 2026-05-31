# Ratspeak Ecosystem

Ratspeak is both the flagship app and the umbrella for a small Reticulum/LXMF ecosystem: desktop and mobile software, Rust protocol crates, LoRa handheld firmware, turn-based games, avatar tooling, and experimental hardware-backed identity work.

Most people should start with the [Ratspeak app](../products/ratspeak), [Ratdeck](../products/ratdeck), or [rsCardputer](../products/rscardputer). Operators who want always-on transport or store-and-forward messaging should look at [rsReticulum](../products/rsreticulum) and [rsLXMF](../products/rslxmf). Developers can build directly on the Rust crates and standalone support libraries.

## How the pieces stack

- **rsReticulum** is the Reticulum networking layer: packets, identities, announces, paths, links, resources, interfaces, daemon, and command-line tools.
- **rsLXMF** is the message layer above Reticulum: conversations, attachments, delivery modes, Offline Inbox/propagation nodes, stamps, and tickets.
- **rsLXST** is the experimental Rust telephony layer above Reticulum: call signalling, link teardown, and Opus voice profiles. Ratspeak embeds it for peer-to-peer voice calls.
- **Ratspeak** is the user-facing desktop and mobile app that embeds rsReticulum, rsLXMF, LRGP, and rsLXST.
- **Ratdeck** and **rsCardputer** are ESP32-S3 LoRa handheld firmware projects. Ratdeck is standalone-first; rsCardputer includes Standalone and RNode modes behind a launcher.
- **LRGP** rides inside LXMF custom fields to support turn-based games such as Chess and Tic-Tac-Toe.
- **LXMFace** turns Reticulum identity hashes into deterministic avatars. It is a standalone identity-visualization library, not a network transport.
- **Ratkey** is the experimental hardware-backed identity layer for YubiKey/PIV devices. Ratspeak desktop uses it for hardware-key setup, import, restore, PIN unlock, auto-lock, and on-card signing/ECDH; mobile uses recoverable software identities instead.

The common thread is Reticulum/LXMF, not a central service. Some pieces are network endpoints, some are libraries, and some are future-facing integration targets.

## Quick reference

| Component | Role | Who needs it | Current status |
|---|---|---|---|
| [Ratspeak](../products/ratspeak) | Desktop and mobile LXMF client | Normal users | v1.0.19 public release; desktop and Android artifacts are on the download page and GitHub releases |
| [rsReticulum](../products/rsreticulum) | Rust Reticulum stack, daemon, tools | Operators and Rust developers | v0.9.4 public pre-release; pre-1.0, wire-compatible where implemented, with documented gaps |
| [rsLXMF](../products/rslxmf) | Rust LXMF library and `lxmd-rs` propagation daemon | App developers and propagation-node operators | v0.9.2 public pre-release; pre-1.0, targets LXMF interop where implemented |
| [rsLXST](../products/rslxst) | Rust LXST telephony library (Opus voice over Reticulum) | App developers building voice features on Reticulum | Experimental; first public target is Ratspeak voice calls, not full Python LXST parity |
| [Ratdeck](../products/ratdeck) | LilyGO T-Deck Plus handheld firmware | Off-grid users who want a standalone LoRa device | Active firmware; Wi-Fi bridge mode is still experimental |
| [rsCardputer](../products/rscardputer) | M5Stack Cardputer Adv + Cap LoRa firmware | Users who want a smaller handheld or host-controlled RNode radio | Active dual-mode firmware; Standalone and RNode modes |
| [LRGP](../products/lrgp) | Game protocol over LXMF | Ratspeak users and game developers | Integrated for Chess and Tic-Tac-Toe; standalone Rust and Python packages exist |
| [LXMFace](../products/lxmface) | Deterministic identity avatars | App and library developers | Stable standalone API; Ratspeak has not migrated to it yet |
| [Ratkey](../products/ratkey) | Hardware-backed Reticulum identity layer | Desktop Ratspeak users and advanced Rust developers | Experimental desktop YubiKey/PIV support; software recovery remains the mobile path |

## For users

If you want to send messages, start with [Choosing Your Setup](../getting-started/choosing-your-setup). That guide helps you decide between the desktop app, mobile app, LoRa handhelds, an RNode radio, or infrastructure you run yourself.

Ratspeak devices and apps can interoperate with other Reticulum and LXMF clients such as Sideband and NomadNet where they share the same protocol features and reachable paths.

## For operators

Run `rnsd-rs` when you want a Reticulum node that stays online and routes traffic. Add `lxmd-rs` when you want an Offline Inbox/propagation node for contacts who are not always online. A Raspberry Pi, VPS, or desktop machine can become useful network infrastructure without becoming a trusted message server.

## For developers

Use rsReticulum when you need Reticulum networking in Rust, rsLXMF when you need LXMF messaging, rsLXST when you want LXST telephony plumbing (call setup, profile switching, Opus media) and intend to provide your own platform audio layer, LRGP when you want compact turn-based game messages, and LXMFace when you want the same deterministic avatar output across languages. Ratkey is available as an experimental integration target for hardware identity work and is already used by Ratspeak's desktop YubiKey flow.
