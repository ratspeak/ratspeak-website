# rsLXMF

rsLXMF v0.9.2 is a public pre-release of the Rust implementation of LXMF, the message format that rides on top of Reticulum to carry chat, mail, bulletins, and machine-to-machine notifications. It ships as two crates: `lxmf-core`, the library you embed in an application, and `lxmd-rs`, a long-running propagation daemon.

## Do you actually need it?

If you already have LXMF infrastructure working, rsLXMF will not make messages travel magically faster — the format is the same and the wire is the same. What 0.9.2 gets you is a single-binary deploy, a Tokio-native API, and an `lxmd-rs` that can run a propagation node without a Python runtime on the box. If your propagation node is a Raspberry Pi or an OpenWrt router, this is the reason to switch. If you're writing a Rust client and want to avoid a subprocess for messaging, that's the other reason.

The compatibility target is LXMF 0.9.6 wire behavior where implemented. Interop with other LXMF implementations is covered by the cross-repo test suite.

## Three ways a message gets delivered

LXMF picks the delivery mode at send time based on what it knows about the recipient.

**Direct** is the default when the recipient is reachable: the sender opens an encrypted Reticulum link to the destination and pushes the message over it. Compression is negotiated on the link, so larger messages compress before they hit the wire. This is the mode you want for anything beyond a short notification.

**Opportunistic** is for tiny, fire-and-forget messages — typically status pings or short alerts. The whole message rides in a single Reticulum packet with no link setup, which means it can reach a destination that the sender has never spoken to before, just by having a known path. The catch is size: once the packed payload runs past about 295 bytes the router silently downgrades the message to Direct, because a single packet can't carry it. If you want to guarantee opportunistic delivery, keep the body short.

**Propagated** is store-and-forward. The sender encrypts the message to the recipient's identity and hands the wrapped blob to a propagation node. The node holds it until the recipient comes online and asks for its mail. This is how LXMF works for users who aren't on the network at the moment a message is sent — the propagation node is the offline buffer. In Ratspeak's app UI, this user-facing feature is called **Offline Inbox**.

## lxmd-rs, the propagation daemon

`lxmd-rs` is the standalone Rust propagation node. It announces itself on the mesh, accepts deposits from senders, holds messages for offline recipients, and can sync its store with configured peer propagation nodes for redundancy. It can also be run as a thin delivery-only router (no propagation store) if you just want a process that handles your local destination's inbox.

```bash
# Generate a starter LXMF config next to an isolated Reticulum config directory
mkdir -p ~/.rsLXMF ~/.rsReticulum
lxmd-rs --exampleconfig > ~/.rsLXMF/config

# Run the daemon
cargo run --bin lxmd-rs -- --config ~/.rsLXMF --rnsconfig ~/.rsReticulum

# Or as a system service, no interactive output
lxmd-rs --config ~/.rsLXMF --rnsconfig ~/.rsReticulum --service
```

Release builds install `lxmd-rs`, not `lxmd`, so command lookup stays
unambiguous on systems with multiple LXMF implementations. The command name
does not select storage; Rust defaults are `~/.rsLXMF` for LXMF and
`~/.rsReticulum` for Reticulum. Other config directories, including existing
interop test directories, are explicit choices passed with `--config` and
`--rnsconfig`.

State lives under `<config-dir>/storage/lxmf/`: cached stamp costs, tickets we've been issued, the local-delivery dedup set, propagation storage, ratchets, and the set of transient IDs we've already processed. Router state files are MessagePack-encoded and written atomically, so a crash mid-write won't corrupt them.

There's also a one-shot mode for scripts: `lxmd-rs --send <dest_hash> "hello"` ships a single message and exits, blocking up to ~90 seconds for a delivery confirmation.

## Tickets

Stamps are LXMF's anti-spam mechanism: senders attach a small proof-of-work to outbound messages, and propagation nodes can require a minimum cost. PoW costs CPU on the sender. Tickets are the workaround for trusted peer pairs: a 16-byte token, valid for a fixed window, that lets the holder bypass the stamp requirement. The peer issues you a ticket, you cache it, and outbound messages tagged with that ticket skip the PoW step entirely. They auto-renew before expiry. The practical effect is that a frequent correspondent doesn't pay PoW on every message while a stranger still does — rate limiting without locking out the people you actually want to hear from.

## Using lxmf-core from Rust

You'd reach for the library when you're building something that needs to send or receive LXMF messages from inside a Rust process — a desktop client, a sensor that reports telemetry, an automated responder. The shape of the API is small:

```rust
use lxmf_core::constants::DeliveryMethod;
use lxmf_core::message::LxMessage;
use lxmf_core::router::{LxmRouter, RouterConfig};

let mut router = LxmRouter::new(RouterConfig::default());
router.set_transport(reticulum_handle.transport_tx.clone());

let message = LxMessage::new(
    destination_hash,
    source_hash,
    "subject",
    "body",
    DeliveryMethod::Direct,
);

router.send(message);
```

`LxmRouter` is the entry point for outbound dispatch, inbound callbacks, ticket management, paper-message ingest, and propagation node configuration. The host app owns the async loop that drives Reticulum, LXMF, persistence, notifications, and UI events together.

The `fields` map on `LxMessage` is a `BTreeMap<u8, Vec<u8>>` keyed on field IDs from the upstream LXMF spec — geotag, telemetry, image, file attachment, and a custom range you can use for application-defined payloads. Ratspeak's gaming protocol uses the custom range to embed game frames inside ordinary LXMF messages, which is why a chess move and a chat message look the same on the wire.

## Compatibility

Wire format targets LXMF 0.9.6 compatibility. You can mix compatible implementations freely: Rust clients, `lxmd-rs` propagation nodes, and other LXMF peers should round-trip the same messages and propagation flows. If something doesn't interoperate, it's a bug; tell us.

## Build

Clone [rsLXMF](https://github.com/ratspeak/rsLXMF) next to [rsReticulum](https://github.com/ratspeak/rsReticulum), then run:

```bash
cd rsLXMF
cargo build --release
```

The `lxmd-rs` daemon lands in `target/release/`. Source: [github.com/ratspeak/rsLXMF](https://github.com/ratspeak/rsLXMF); release: [v0.9.2](https://github.com/ratspeak/rsLXMF/releases/tag/v0.9.2). For OS-specific prerequisites, config creation, and the Ratspeak app build that embeds rsLXMF on desktop and mobile, see [Building from Source](../getting-started/building-from-source).
