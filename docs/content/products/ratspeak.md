# Ratspeak

Ratspeak is the desktop and mobile client for the [Reticulum](https://reticulum.network/) mesh — a native app for sending end-to-end encrypted messages, watching peers come and go, configuring your radio interfaces, and playing the occasional game with someone three hops away.

It's the same app on every platform: macOS, Linux, Windows, iOS, Android. The protocol stack underneath is identical regardless of where you run it, so a Ratspeak user on a laptop, a Ratdeck handheld on LoRa, and someone running Sideband on their phone can all talk to each other.

## Platforms

Ratspeak ships as a single Tauri v2 binary built from one Rust codebase. Desktop bundles include `.dmg` for macOS, `.deb` / `.rpm` / `.AppImage` for Linux, and MSI / NSIS for Windows. Mobile uses the same crate with platform-conditional dependencies — Android via JNI, iOS via Objective-C bindings — and disables the desktop-only USB serial code path in favour of BLE.

## Get the app

Download installers for your platform from [ratspeak.org/download.html](https://ratspeak.org/download.html). Builds aren't signed yet, so your OS may ask you to confirm the first launch — that goes away once code-signing and notarization land.

If you'd rather build from source, see the [build notes for developers](https://github.com/ratspeak/Ratspeak#building-from-source).

## Inside the app

The dashboard has eight views. On desktop they live in a sidebar; on mobile, a bottom bar with the secondary ones tucked into a hamburger sheet.

- **Home** — your at-a-glance dashboard. Recent messages, network health, quick actions.
- **Messages** — LXMF conversations. Threads, attachments (up to 500 KB), delivery state per message.
- **Peers** — everyone the network has heard about. Tap one to start a conversation or pin them to contacts.
- **Contacts** — your saved address book, with avatars rendered from each identity's hash.
- **Network** — interfaces, transport stats, propagation nodes, and the BLE peer mesh. This is where you add a TCP gateway, plug in an RNode, or troubleshoot why a hop isn't resolving.
- **Settings** — identity, auto-announce interval, network policy, BLE toggle, theme.
- **Games** — multiplayer Chess and Tic-Tac-Toe over LXMF, using the [LRGP](../products/lrgp) gaming protocol. Sessions ride as fields on normal LXMF messages, so any LRGP-aware client can join.
- **Setup** — first-run identity creation. You won't see this view again unless you factory-reset.

There is no embedded HTTP server. The frontend is vanilla HTML/CSS/JS loaded over Tauri's asset protocol; the WebView talks to the Rust core through Tauri IPC commands and events.

## Where your data lives

Ratspeak stores everything under `.ratspeak/` in the OS data directory (`~/Library/Application Support/com.ratspeak.app/.ratspeak/` on macOS, `~/.local/share/com.ratspeak.app/.ratspeak/` on Linux, `%APPDATA%\com.ratspeak.app\.ratspeak\` on Windows).

- `ratspeak.db` — SQLite database for messages, contacts, conversations, and settings. WAL mode, single file, safe to back up while the app is closed.
- `identities/<hash>/identity` — your private key material, one directory per identity. The `identity` file is 64 bytes: a 32-byte X25519 private key concatenated with a 32-byte Ed25519 seed.

If you copy the `.ratspeak/` directory to another machine and launch Ratspeak there, you keep your identity, your conversation history, and your network config.

## Hardware it talks to

Ratspeak speaks to anything that speaks Reticulum. Out of the box that means [Ratdeck](../products/ratdeck) and [Ratcom](../products/ratcom) handhelds over LoRa, [RNode-class boards](../hardware/rnode-and-supported-boards) over USB or BLE, and other Ratspeak / Sideband / NomadNet / MeshChat clients reachable over TCP, UDP, I2P, or the built-in BLE peer mesh. iOS only supports radios over BLE — Apple doesn't expose USB serial to third-party apps.

## What it isn't

Ratspeak isn't a web app — there's no server you can point a browser at. It's a native binary that bundles a WebView and talks to the Rust core directly.

Hardware-key support (YubiKey / Nitrokey via [Ratkey](../products/ratkey)) is on the roadmap but isn't wired into the app yet. Signed release packaging — notarized macOS, code-signed Windows, Play Store, App Store — is in progress; until those land, builds are unsigned and need to be allowed through your OS's gatekeeper.
