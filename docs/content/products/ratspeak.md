# Ratspeak

Ratspeak is the desktop and mobile client for the [Reticulum](https://reticulum.network/) mesh — a native app for sending end-to-end encrypted messages, watching peers come and go, configuring your radio interfaces, and playing the occasional game with someone three hops away.

It's the same app on every platform: macOS, Linux, Windows, iOS, Android. The protocol stack underneath is identical regardless of where you run it, so a Ratspeak user on a laptop, a Ratdeck handheld on LoRa, and someone running Sideband on their phone can all talk to each other.

## Platforms

Ratspeak is built as a single Tauri v2 app from one Rust codebase. Desktop packaging targets `.dmg` for macOS, `.deb` / `.rpm` / `.AppImage` for Linux, and MSI / NSIS for Windows. Mobile uses the same crate with platform-conditional dependencies — Android via JNI, iOS via Objective-C bindings. Desktop supports USB serial radios; Android supports USB host and BLE; iOS is BLE-only for radios because Apple does not expose USB serial to third-party apps.

## Get the app

Ratspeak v1.0.0 is the current public release, published as a normal GitHub release rather than a prerelease. Download desktop and Android artifacts from [ratspeak.org/download.html](https://ratspeak.org/download.html) or the [Ratspeak GitHub releases page](https://github.com/ratspeak/Ratspeak/releases). Source is AGPL-3.0-or-later at [github.com/ratspeak/Ratspeak](https://github.com/ratspeak/Ratspeak).

If you'd rather build from source, see [Building from Source](../getting-started/building-from-source). Ratspeak must be checked out next to `rsReticulum`, `rsLXMF`, and `lrgp-rs` so Cargo can resolve the local development crates.

## Inside the app

The app has seven primary views plus first-run Setup. Desktop exposes Home, Messages, Games, Peers, Network, and Settings in the sidebar. Mobile uses Peers, Messages, Contacts, and a More sheet for secondary views.

- **Home** — your at-a-glance dashboard. Recent messages, network health, quick actions.
- **Messages** — LXMF conversations. Threads, attachments, images, search, replies, reactions, and delivery state per message.
- **Peers** — everyone the network has heard about. Tap one to start a conversation or save them as a contact.
- **Contacts** — your saved address book, with avatars rendered from each identity's hash.
- **Network** — interfaces, transport stats, Offline Inbox nodes, and Bluetooth Peer. This is where you add a TCP gateway, plug in an RNode, choose store-and-forward inbox behavior, or troubleshoot why a hop isn't resolving.
- **Settings** — identity, auto-announce interval, network policy, Bluetooth Peer toggle, theme.
- **Games** — multiplayer Chess and Tic-Tac-Toe over LXMF, using the [LRGP](../products/lrgp) gaming protocol. Sessions ride as fields on normal LXMF messages, so any LRGP-aware client can join.
- **Setup** — first-run identity creation. You won't see this view again unless you factory-reset.

There is no embedded HTTP server. The frontend is vanilla HTML/CSS/JS loaded over Tauri's asset protocol; the WebView talks to the Rust core through Tauri IPC commands and events.

## Where your data lives

Ratspeak stores app state under `.ratspeak/` in the OS data directory (`~/Library/Application Support/org.ratspeak.desktop/.ratspeak/` on macOS, `~/.local/share/org.ratspeak.desktop/.ratspeak/` on Linux, `%APPDATA%\org.ratspeak.desktop\.ratspeak\` on Windows). Reticulum interface config defaults to `.ratspeak/reticulum/config` unless `RATSPEAK_RNS_CONFIG_DIR` points somewhere else.

- `ratspeak.db` — SQLite database for messages, contacts, conversations, and settings. WAL mode, single file, safe to back up while the app is closed.
- `identities/<hash>/identity` — your private key material, one directory per identity. The `identity` file is 64 bytes: a 32-byte X25519 private key concatenated with a 32-byte Ed25519 seed.
- `reticulum/config` — the app-private Reticulum interface config. Its shared-instance ports default to `37430`/`37431` so Ratspeak can coexist with system Reticulum tools using `37428`/`37429`.

If you copy the `.ratspeak/` directory to another machine and launch Ratspeak there, you keep your identity, conversation history, and app-private Reticulum interface setup.

## Hardware it talks to

Ratspeak speaks to anything that speaks Reticulum. Out of the box that means [Ratdeck](../products/ratdeck) and [Ratcom](../products/ratcom) handhelds on any reachable Reticulum path, [RNode-class boards](../hardware/rnode-and-supported-boards) over USB or BLE, and other Ratspeak / Sideband / NomadNet / MeshChat clients reachable over TCP, UDP, I2P, or Bluetooth Peer. iOS only supports radios over BLE — Apple doesn't expose USB serial to third-party apps.

## What it isn't

Ratspeak isn't a web app — there's no server you can point a browser at. It's a native binary that bundles a WebView and talks to the Rust core directly.

Hardware-key support (YubiKey / Nitrokey via [Ratkey](../products/ratkey)) is on the roadmap but isn't wired into the app yet. Notarized macOS, code-signed Windows, and public mobile store distribution are still in progress, so builds may need to be allowed through your OS's gatekeeper.
