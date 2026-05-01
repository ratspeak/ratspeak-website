# rsLXMF

rsLXMF is the Rust implementation of LXMF, the message format that rides on top of Reticulum to carry chat, mail, bulletins, and machine-to-machine notifications. It ships as two crates: `lxmf-core`, the library you embed in an application, and `lxmd`, a long-running propagation daemon that mirrors the Python `lxmd`.

## Do you actually need it?

If you already have Python LXMF working, rsLXMF won't make your messages travel any faster — the format is the same and the wire is the same. What it gets you is a single-binary deploy, a Tokio-native API, and an `lxmd` that interoperates with Python `lxmd` peers without a Python runtime on the box. If your propagation node is a Raspberry Pi or an OpenWrt router and you'd rather not pull in CPython, this is the reason to switch. If you're writing a Rust client and want to avoid a subprocess for messaging, that's the other reason.

We track Python LXMF 0.9.6 on the wire. A Rust client can talk to a Python `lxmd`, and a Rust `lxmd` can sync with a Python propagation peer — both directions are exercised in CI on every push.

## Three ways a message gets delivered

LXMF picks the delivery mode at send time based on what it knows about the recipient.

**Direct** is the default when the recipient is reachable: the sender opens an encrypted Reticulum link to the destination and pushes the message over it. Compression is negotiated on the link, so larger messages compress before they hit the wire. This is the mode you want for anything beyond a short notification.

**Opportunistic** is for tiny, fire-and-forget messages — typically status pings or short alerts. The whole message rides in a single Reticulum packet with no link setup, which means it can reach a destination that the sender has never spoken to before, just by having a known path. The catch is size: once the packed payload runs past about 295 bytes the router silently downgrades the message to Direct, because a single packet can't carry it. If you want to guarantee opportunistic delivery, keep the body short.

**Propagated** is store-and-forward. The sender encrypts the message to the recipient's identity and hands the wrapped blob to a propagation node. The node holds it until the recipient comes online and asks for its mail. This is how LXMF works for users who aren't on the network at the moment a message is sent — the propagation node is the offline buffer.

## lxmd, the propagation daemon

`lxmd` is the standalone propagation node. It announces itself on the mesh, accepts deposits from senders, holds messages for offline recipients, and syncs its store with peer propagation nodes so the same message ends up on multiple nodes for redundancy. It can also be run as a thin delivery-only router (no propagation store) if you just want a process that handles your local destination's inbox.

```bash
# Generate a starter config next to your Reticulum config
lxmd --exampleconfig > ~/.reticulum/lxmd.conf

# Run the daemon
cargo run --bin lxmd

# Or as a system service, no interactive output
lxmd --service
```

State lives in `<data_dir>/lxmf/`: cached stamp costs, tickets we've been issued, the local-delivery dedup set, and the set of transient IDs we've already processed. All four files are MessagePack-encoded and written atomically, so a crash mid-write won't corrupt them. A Rust `lxmd` can pick up a Python `lxmd`'s state directory and keep going — same on-disk format, deliberately.

There's also a one-shot mode for scripts: `lxmd --send <dest_hash> "hello"` ships a single message and exits, blocking up to ~90 seconds for a delivery confirmation.

## Tickets

Stamps are LXMF's anti-spam mechanism: senders attach a small proof-of-work to outbound messages, and propagation nodes can require a minimum cost. PoW costs CPU on the sender. Tickets are the workaround for trusted peer pairs: a 16-byte token, valid for a fixed window, that lets the holder bypass the stamp requirement. The peer issues you a ticket, you cache it, and outbound messages tagged with that ticket skip the PoW step entirely. They auto-renew before expiry. The practical effect is that a frequent correspondent doesn't pay PoW on every message while a stranger still does — rate limiting without locking out the people you actually want to hear from.

## Using lxmf-core from Rust

You'd reach for the library when you're building something that needs to send or receive LXMF messages from inside a Rust process — a desktop client, a sensor that reports telemetry, an automated responder. The shape of the API is small:

```rust
use lxmf_core::{LxmRouter, LxMessage, DeliveryMethod};

let mut router = LxmRouter::new(identity, config);
router.load_state(&data_dir)?;

let mut msg = LxMessage::new(dest, src, "subject", "body", DeliveryMethod::Direct);
msg.register_delivery_callback(|m| println!("delivered: {:?}", m.message_id));
router.handle_outbound(msg);
```

`LxmRouter` is the entry point for everything: outbound dispatch, inbound callbacks, ticket management, paper-message ingest, propagation node configuration. Per-message callbacks fire on state transitions, so you don't poll. Drive `router.tick()` from your runtime and persist state on shutdown.

The `fields` map on `LxMessage` is a `BTreeMap<u8, Vec<u8>>` keyed on field IDs from the upstream LXMF spec — geotag, telemetry, image, file attachment, and a custom range you can use for application-defined payloads. Ratspeak's gaming protocol uses the custom range to embed game frames inside ordinary LXMF messages, which is why a chess move and a chat message look the same on the wire.

## Compatibility

Wire format matches Python LXMF 0.9.6 exactly. You can mix implementations freely: Rust clients with a Python `lxmd`, Python clients with a Rust `lxmd`, two Rust nodes peering with a Python node in the middle. The same goes for the `microReticulum` C++ port — it shares our test vectors and round-trips cleanly. If something doesn't interoperate, it's a bug; tell us.
