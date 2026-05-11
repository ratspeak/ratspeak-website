# Ratspeak

Ratspeak is the desktop and mobile client for the [Reticulum](https://reticulum.network/) mesh — a native app for sending end-to-end encrypted messages, placing experimental peer-to-peer voice calls, watching peers come and go, configuring your radio interfaces, and playing the occasional game with someone three hops away.

It's the same app on every platform: macOS, Linux, Windows, iOS, Android. The protocol stack underneath is identical regardless of where you run it, so a Ratspeak user on a laptop, a Ratdeck handheld on LoRa, and someone running Sideband on their phone can all talk to each other.

## Platforms

Ratspeak is built as a single Tauri v2 app from one Rust codebase. Desktop packaging targets `.dmg` for macOS, amd64/arm64 `.deb` plus amd64 `.rpm` / `.AppImage` for Linux, and MSI / NSIS for Windows. Mobile uses the same crate with platform-conditional dependencies — Android via JNI, iOS via Objective-C bindings. Desktop supports USB serial radios; Android supports USB host and BLE; iOS is BLE-only for radios because Apple does not expose USB serial to third-party apps.

## Get the app

Ratspeak v1.0.6 is the current public release, published as a normal GitHub release rather than a prerelease. Download desktop and Android artifacts from [ratspeak.org/download.html](https://ratspeak.org/download.html) or the [Ratspeak GitHub releases page](https://github.com/ratspeak/Ratspeak/releases). Source is AGPL-3.0-or-later at [github.com/ratspeak/Ratspeak](https://github.com/ratspeak/Ratspeak).

If you'd rather build from source, see [Building from Source](../getting-started/building-from-source). Ratspeak must be checked out next to `rsReticulum`, `rsLXMF`, `lrgp-rs`, and (for the default build, which includes experimental voice calls) `rsLXST` so Cargo can resolve the local development crates.

## Inside the app

The app has seven primary views plus first-run Setup. Desktop exposes Home, Messages, Games, Peers, Network, and Settings in the sidebar. Mobile uses Peers, Messages, Contacts, and a More sheet for secondary views.

- **Home** — your at-a-glance dashboard. Recent messages, network health, quick actions.
- **Messages** — LXMF conversations. Threads, attachments, images, search, replies, reactions, and delivery state per message. The conversation header also exposes the experimental voice-call button when both sides are reachable on a single Reticulum hop.
- **Peers** — everyone the network has heard about. Tap one to start a conversation or save them as a contact.
- **Contacts** — your saved address book, with avatars rendered from each identity's hash.
- **Network** — interfaces, transport stats, Offline Inbox nodes, and Bluetooth Peer. This is where you add a TCP gateway, plug in an RNode, choose store-and-forward inbox behavior, or troubleshoot why a hop isn't resolving.
- **Settings** — identity, auto-announce interval, network policy, Bluetooth Peer toggle, theme.
- **Games** — multiplayer Chess and Tic-Tac-Toe over LXMF, using the [LRGP](../products/lrgp) gaming protocol. Sessions ride as fields on normal LXMF messages, so any LRGP-aware client can join.
- **Setup** — first-run identity creation. You won't see this view again unless you factory-reset.

There is no embedded HTTP server. The frontend is vanilla HTML/CSS/JS loaded over Tauri's asset protocol; the WebView talks to the Rust core through Tauri IPC commands and events.

## Voice calls (experimental)

Ratspeak ships an experimental voice surface built on [rsLXST](../products/rslxst), the Rust Reticulum-LXST telephony stack. Calls run over a normal Reticulum link directly between the two devices — no relay servers, no SFU, no media gateway. Audio uses Opus and starts at the Medium Quality profile; the underlying rsLXST profile matrix supports Medium, High, Super High, Low Latency, and Ultra Low Latency.

The call button lives in the conversation header on the Messages view, and only appears when the other side is an active LXMF contact, no other call is in progress, and the voice stack is built into the binary. Tap to dial, tap again to hang up. Incoming calls open a global call strip across the top of the app plus an answer/reject sheet on mobile; both surfaces are navigable back to the matching conversation. Outgoing rings give up automatically after about 25 seconds with no answer.

The app enforces a few privacy and abuse rules independently of the protocol:

- **Contacts, or direct neighbors only.** Inbound calls are allowed if the caller is in your contacts, or if Reticulum can reach them on a direct (zero-hop) path — typically a peer on the same LAN, BLE link, or other local interface. Calls from non-contacts that would require routing through a transport node are dropped before any audio path opens, and the caller receives a polite "only accepting calls from contacts" notice over LXMF.
- **Blocked contacts are blackholed.** A call from a contact you have blocked is rejected and the caller is added to the network blackhole list so further attempts are dropped at the transport layer.
- **Auto-blackhole on persistent rejection.** A non-contact whose calls have been rejected ten times in a row is automatically blackholed for rate-limit reasons, so the device stops ringing on their behalf even if they keep dialing.
- **Network blackhole short-circuit.** Identities already on the network blackhole list cannot ring the device at all; the call is dropped before policy evaluation.

Microphone and speaker access goes through each OS's normal permission model — `RECORD_AUDIO` plus `MODIFY_AUDIO_SETTINGS` on Android, `NSMicrophoneUsageDescription` on macOS/iOS, the system default device on Linux/Windows. The first time you place or answer a call the OS prompts; later calls reuse the granted permission.

Voice is intentionally narrow: there is no voicemail, no group call, no call recording, no echo cancellation or noise suppression beyond what the OS audio stack provides, and no LXMF-routed offline-call fallback. Treat the surface as a beta — codec quality, call setup, ringtones, and platform audio routing are subject to change while rsLXST stabilizes.

The `lxst-voice` Cargo feature gates the entire voice stack and is on by default. If you build Ratspeak from source without the `rsLXST` sibling checkout, pass `--no-default-features` to `cargo tauri dev` or `cargo tauri build` to skip voice entirely.

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
