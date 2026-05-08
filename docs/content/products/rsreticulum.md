# rsReticulum

rsReticulum v0.9.0 is a public pre-release of the pure-Rust [Reticulum](https://reticulum.network/) network stack — wire-compatible where implemented, with no Python runtime. The current target is Reticulum 1.2.4 for the implemented and tested release surface. It ships as a library and as Rust CLI tools for daemon, status, path, identity, probe, copy, shell, and RNode configuration work.

If you already run a Reticulum network, an rsReticulum node can join it on the implemented protocol paths. If you don't, this is the core stack in one repo.

## Tools

The `rns-tools` crate currently produces eight Rust-namespaced `*-rs` binaries so command lookup is unambiguous on systems with multiple Reticulum implementations. The core tools use stable operator-style flags and explicit exit codes (`0` success, `1` failure, `2` packet loss, `3`/`4` specific error states):

- **`rnsd-rs`** — the Reticulum daemon. Run this first; everything else attaches to it over a local shared-instance socket. `rnsd-rs --exampleconfig` prints a starter config.
- **`rnstatus-rs`** — inspect interfaces, announces, discovered peers, live links, totals, and JSON status on a local or remote daemon. Pass `-R <hash> -i <identity>` to query a remote node over MessagePack RPC.
- **`rnpath-rs`** — view and manage the path table; locally you can edit rates and blackholes, while remote mode is read-only for table/rate and blackhole-list queries.
- **`rnid-rs`** — create and inspect Reticulum identities, import/export public or private identity data, calculate destination hashes, encrypt/decrypt files, and sign/verify 1.2.4-style `.rsg` signatures.
- **`rnprobe-rs`** — send PROBE packets to a destination and report RTT and packet loss. The Reticulum equivalent of `ping`.
- **`rncp-rs`** — copy a file over Reticulum. Send mode (`rncp-rs <file> <hash>`), listen mode (`rncp-rs -l -b <seconds> -s <dir> -a <allowed_hash>` or `--no-auth`), and fetch mode (`rncp-rs -f <hash> <path>`). `-P/--phy-rates` is an explicit gap until physical transfer-rate accounting exists.
- **`rnsh-rs`** — remote shell utility for Rust-side remote command work.
- **`rnodeconf-rs`** — RNode inspection and safe configuration utility. Safe device inspection/configuration, EEPROM dump/backup, and trusted-key storage exist, but flashing, ROM bootstrap, firmware-hash writes, destructive EEPROM wipe, and signing-key management parity are disabled or incomplete.

Deferred surfaces include `rnx`, `rnir`, `rnpkg`, `rngit`, `git-remote-rns`, full `rnodeconf-rs` flashing/signing parity, and the Weave runtime.

## rnid-rs quick reference

Most identity work starts with a file you control:

```bash
rnid-rs -g ~/.rsReticulum/identities/mgmt
rnid-rs -i ~/.rsReticulum/identities/mgmt -p
rnid-rs -i ~/.rsReticulum/identities/mgmt -H lxmf.delivery
```

Public and private import/export are deliberately split. `-m` and `-x` are public. `-M` and `-X` are private. When you use `-w`, rnid writes a public `.pub` file unless `-X` is present:

```bash
rnid-rs -i ~/.rsReticulum/identities/mgmt -w mgmt.pub
rnid-rs -i ~/.rsReticulum/identities/mgmt -X -w mgmt.rid
rnid-rs -m <public_identity_data> -w peer.pub
rnid-rs -M <private_identity_data> -X -w restored_identity
```

Signing uses Reticulum 1.2.4 `.rsg` envelopes by default. The signature can validate with its embedded signer, or against a required signer hash:

```bash
rnid-rs -i ~/.rsReticulum/identities/mgmt -s message.txt
rnid-rs -V message.txt.rsg
rnid-rs -i <signer_hash> -N -V message.txt.rsg
```

For file encryption, use the recipient's public identity to encrypt and the matching private identity to decrypt:

```bash
rnid-rs -i mgmt.pub -e message.txt
rnid-rs -i ~/.rsReticulum/identities/mgmt -d message.txt.rfe
```

## The library

The same code that backs `rnsd-rs` is published as a 0.9.0 stack of `rns-*` crates you can pull into your own Rust app. The layering, bottom-up: cryptography (`rns-crypto`), the wire format (`rns-wire`), identities and announces (`rns-identity`), the actor-based routing engine (`rns-transport`), encrypted point-to-point links (`rns-link`), reliable channels and resource transfer (`rns-protocol`), the interface implementations (`rns-interface`), and a runtime (`rns-runtime`) that wires everything to an INI config and an RPC server. `rns-ratkey` is an optional experimental sidecar for PIV-capable hardware-token identity work (YubiKey, Nitrokey).

The split is layered rather than monolithic, so lower crates such as `rns-wire` and `rns-link` can be used without pulling in the full runtime. Higher layers intentionally depend on the lower protocol, transport, interface, and runtime pieces they need. Most embedded users start at `rns-runtime`.

## Supported interfaces

A broad set of interface modules ship in `rns-interface`. They group into:

- **IP**: `TCPInterface` (client and server, IPv4 and IPv6), `UDPInterface` (unicast and multicast), `AutoInterface` for zero-config LAN discovery over link-local IPv6, and `BackboneInterface` (HDLC-over-TCP with per-peer keepalive) for high-throughput WAN links. `I2PInterface` (SAM v3.1) lives here too.
- **Serial and packet radio**: `SerialInterface`, `KISSInterface`, `AX25KISSInterface` (callsign framing for amateur radio), and `PipeInterface` (subprocess stdio). The serial radio paths are gated behind the `serial` feature flag.
- **RNode (LoRa)**: `RNodeInterface` for single-radio RNode 1.x and 2.x boards over USB serial KISS, and `RNodeMultiInterface` for the multi-sub-interface 2.x boards.
- **Bluetooth**: `BLERNodeInterface` bridges a LoRa RNode over BLE so a phone can drive it without a cable; `BLEPeerInterface` backs Bluetooth Peer, the phone-to-phone and laptop-to-phone link used by Ratspeak. Gated behind the `ble` feature flag, with native peripheral backends per platform. Windows needs the MSIX app capability for the Bluetooth Peer advertiser/peripheral role; Linux needs BlueZ local GATT and LE advertising support for the same role.
- **Misc**: `LocalInterface` (Unix-socket loopback used by `rnsd-rs` shared-instance mode), `AndroidUSBInterface` (JNI host-mode serial, target-gated to Android), and `WeaveInterface` (wire constants only — runtime not yet implemented).

`BackboneInterface` is worth a brief callout. It's HDLC framed over TCP with per-peer keepalive and large socket buffers, and it scales to thousands of concurrent connections per process — the right pick for a transport node fanning out to many clients. The Rust port runs on Linux, macOS, and Windows desktop: Tokio drives the underlying TCP loop and picks the right OS primitive (`epoll`, `kqueue`, or IOCP), with `TCP_USER_TIMEOUT` added on Linux for fast detection of stuck connections. Mobile builds gate Backbone out of the Ratspeak UI for now, so on iOS and Android the equivalent is `TCPServerInterface` / `TCPClientInterface`.

All interface flags are off by default at the workspace level; `rns-tools` builds with `serial` so a stock `cargo build --release` produces an `rnsd-rs` that can drive a serial radio out of the box.

## Standalone vs embedded

Use **`rnsd-rs`** as a standalone daemon when you want a Reticulum node on a host — a Pi acting as a transport router, a server bridging TCP and LoRa, a workstation participating in the network. Drop the binary in place, let fresh installs use the rsReticulum-specific `~/.rsReticulum` config, and other tools attach over the local socket. Existing Reticulum configs should work when you explicitly point `--config` at them and every requested interface and option is implemented here.

Use **rsReticulum as a library** when you're writing a Rust app that needs its own embedded Reticulum stack — a custom router, a dedicated bridge, a tool that wants direct API access to identities and links without round-tripping through RPC. This is what [rsLXMF](../products/rslxmf) and the [Ratspeak](../products/ratspeak) client do: they depend on `rns-runtime` directly and never spawn `rnsd-rs`.

The two modes are not exclusive. You can run `rnsd-rs` on the same host as your embedded app and have them share a network via `LocalInterface`, or run them entirely independently on separate transports.

## Status and Gaps

- **Wire-compatible where implemented.** Identity files, configs, pathing, link/resource behavior, utility vectors, and packet captures are exercised against Python Reticulum, with `rnid-rs` retargeted to Reticulum 1.2.4.
- **Native runtime.** Single Rust binaries, no interpreter at runtime. Useful on Pi-class transport routers and battery-powered devices.
- **Protocol invariants.** MTU, MDU, hop ceiling, ratchet windows, and link timers follow Reticulum behavior.
- **Mobile throttling.** A `mobile-throttle` feature lets a host app slow long-lived loops while backgrounded, no-op on always-on machines.
- **Adds:** Bluetooth Peer transport, BLE-bridged RNode, Android USB-OTG, cross-platform BackboneInterface, and experimental PIV hardware-identity work via [Ratkey](../products/ratkey).
- **Missing or partial:** `rnx`, `rnir`, `rnpkg`, `rngit`, `git-remote-rns`, full `rnodeconf-rs` flashing/ROM/signing parity, `rnpath-rs` active path request and remote mutation parity, custom external interface loading, live I2P/hardware gates for release-grade interface claims, and a runtime for the Weave interface.

## Build

```
git clone https://github.com/ratspeak/rsReticulum
cd rsReticulum
cargo build --release
```

Binaries land in `target/release/` with `*-rs` command names only. Config storage is selected by the Rust default resolver or by `--config`. Edition 2024, Rust 1.85+, AGPL-3.0-or-later licensed. For a starter node, create `~/.rsReticulum/config` with `target/release/rnsd-rs --exampleconfig > ~/.rsReticulum/config`, then run `target/release/rnsd-rs --config ~/.rsReticulum`. Use `~/.reticulum` only when intentionally sharing an existing Reticulum config. Source: [github.com/ratspeak/rsReticulum](https://github.com/ratspeak/rsReticulum); release: [v0.9.0](https://github.com/ratspeak/rsReticulum/releases/tag/v0.9.0).

For OS-specific prerequisites and a slower step-by-step walkthrough, see [Building from Source](../getting-started/building-from-source).
