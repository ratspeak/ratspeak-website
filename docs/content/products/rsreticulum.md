# rsReticulum

rsReticulum is a pure-Rust implementation of the [Reticulum](https://reticulum.network/) network stack — wire-compatible with the upstream Python reference, with no Python at runtime. It ships as a library and as the six canonical CLI tools, tracking Python Reticulum 1.1.8 on the wire and exercised against a live `python3 -m RNS.Utilities.rnsd` subprocess in CI on every push.

If you already run a Reticulum network, an rsReticulum node will join it and be indistinguishable from a Python node on a pcap. If you don't, this is the whole stack in one repo.

## Tools

The `rns-tools` crate produces six binaries with Python-parity flags and exit codes (`0` success, `1` failure, `2` packet loss, `3`/`4` specific error states):

- **`rnsd`** — the Reticulum daemon. Run this first; everything else attaches to it over a local shared-instance socket. `rnsd --exampleconfig` prints a starter config.
- **`rnstatus`** — inspect interfaces, announces, and live links on a local or remote daemon. Pass `-R <hash> -i <identity>` to query a remote node over MessagePack RPC.
- **`rnpath`** — view and manage the path table; locally you can edit rates and blackholes, remote mode is read-only.
- **`rnid`** — create, inspect, encrypt, decrypt, sign with, and verify Reticulum identity files.
- **`rnprobe`** — send PROBE packets to a destination and report RTT and packet loss. The Reticulum equivalent of `ping`.
- **`rncp`** — copy a file over Reticulum. Send mode (`rncp <file> <hash>`) or listen mode (`rncp -l -s <dir> -a <allowed_hash>`).

`rnx` (remote command execution) and `rncp -f` fetch mode are not yet implemented.

## The library

The same code that backs `rnsd` is published as a stack of `rns-*` crates you can pull into your own Rust app. The layering, bottom-up: cryptography (`rns-crypto`), the wire format (`rns-wire`), identities and announces (`rns-identity`), the actor-based routing engine (`rns-transport`), encrypted point-to-point links (`rns-link`), reliable channels and resource transfer (`rns-protocol`), the interface implementations (`rns-interface`), and a runtime (`rns-runtime`) that wires everything to an INI config and an RPC server. `rns-ratkey` is an optional sidecar that backs identities with PIV-capable hardware tokens (YubiKey, Nitrokey).

The split is strict: a crate only depends on the one below it, so you can pin a single layer (`rns-wire` for a packet decoder, `rns-link` for a P2P channel) without dragging in the whole workspace. Most embedded users start at `rns-runtime`.

## Supported interfaces

Eighteen interface modules ship in `rns-interface`. They group into:

- **IP**: `TCPInterface` (client and server, IPv4 and IPv6), `UDPInterface` (unicast and multicast), `AutoInterface` for zero-config LAN discovery over link-local IPv6, and `BackboneInterface` (HDLC-over-TCP with per-peer keepalive) for high-throughput WAN links. `I2PInterface` (SAM v3.1) lives here too.
- **Serial and packet radio**: `SerialInterface`, `KISSInterface`, `AX25KISSInterface` (callsign framing for amateur radio), `HDLCInterface`, and `PipeInterface` (subprocess stdio). Gated behind the `serial` feature flag.
- **RNode (LoRa)**: `RNodeInterface` for single-radio RNode 1.x and 2.x boards over USB serial KISS, and `RNodeMultiInterface` for the multi-sub-interface 2.x boards.
- **Bluetooth**: `BLERNodeInterface` bridges a LoRa RNode over BLE so a phone can drive it without a cable; `BLEPeerInterface` is a phone-to-phone GATT mesh used by the Ratspeak mobile app. Gated behind the `ble` feature flag, with native peripheral backends per platform.
- **Misc**: `LocalInterface` (Unix-socket loopback used by `rnsd`'s shared-instance mode), `AndroidUSBInterface` (JNI host-mode serial, target-gated to Android), and `WeaveInterface` (wire constants only — runtime not yet implemented).

`BackboneInterface` is worth a brief callout. It's HDLC framed over TCP with per-peer keepalive and large socket buffers, and it scales to thousands of concurrent connections per process — the right pick for a transport node fanning out to many clients. The Rust port runs on Linux, macOS, and Windows desktop: Tokio drives the underlying TCP loop and picks the right OS primitive (`epoll`, `kqueue`, or IOCP), with `TCP_USER_TIMEOUT` added on Linux for fast detection of stuck connections. Mobile builds gate Backbone out of the Ratspeak UI for now, so on iOS and Android the equivalent is `TCPServerInterface` / `TCPClientInterface`.

All interface flags are off by default at the workspace level; `rns-tools` builds with `serial` so a stock `cargo build --release` produces an `rnsd` that can drive a serial radio out of the box.

## Standalone vs embedded

Use **`rnsd`** as a standalone daemon when you want a Reticulum node on a host — a Pi acting as a transport router, a server bridging TCP and LoRa, a workstation participating in the network. Drop the binary in place, point it at an INI config (the format is the same as Python `rnsd`, so existing configs work unchanged), and other tools attach over the local socket.

Use **rsReticulum as a library** when you're writing a Rust app that needs its own embedded Reticulum stack — a custom router, a dedicated bridge, a tool that wants direct API access to identities and links without round-tripping through RPC. This is what [rsLXMF](../products/rslxmf) and the [Ratspeak](../products/ratspeak) client do: they depend on `rns-runtime` directly and never spawn `rnsd`.

The two modes are not exclusive. You can run `rnsd` on the same host as your embedded app and have them share a network via `LocalInterface`, or run them entirely independently on separate transports.

## Differences from upstream Python Reticulum

- **Wire-compatible.** Tracks Python 1.1.8 on every byte. Identity files, configs, and packet captures are interchangeable.
- **Faster on weak hardware.** No GIL, no interpreter overhead. Useful on Pi-class transport routers and battery-powered devices.
- **Same protocol invariants.** MTU, MDU, hop ceiling, ratchet windows, link timers — all match the reference.
- **Mobile throttling.** A `mobile-throttle` feature lets a host app slow long-lived loops while backgrounded, no-op on always-on machines.
- **Adds:** phone-to-phone BLE peer mesh, BLE-bridged RNode, Android USB-OTG, cross-platform BackboneInterface, and PIV hardware-backed identities via [Ratkey](../products/ratkey).
- **Missing:** `rncp -f` fetch mode, `rnx`, and a runtime for the Weave interface.

## Build

```
git clone https://github.com/ratspeak/rsReticulum
cd rsReticulum
cargo build --release
```

Binaries land in `target/release/`. Edition 2024, Rust 1.85+, MIT licensed. `target/release/rnsd --exampleconfig > ~/.reticulum/config` and you have a working node.